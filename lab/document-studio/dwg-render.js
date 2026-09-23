/* ─────────────────────────────────────────────────────────────────────────
   DWG → SVG, entity by entity, from the LibreDWG database.

   LibreDWG's own dwg_to_svg was the drawing engine until 23.09.2026 and lost
   too much for a plot: no linetypes, no lineweights, true colours ignored
   (every C204 layer in 24-bit colour came out wrong), hatch patterns and
   wipeouts not drawn, block attributes (ATTRIB) missing — which is where most
   title-block text lives — text heights, alignments, width factors and styles
   ignored, MTEXT never wrapped, and only Model Space put on the canvas. This
   module draws from the entity data itself, the way AutoCAD plots it:

   colour      ACI (7 → black on paper), 24-bit true colour, ByLayer, ByBlock,
               layer "0" inside a block taking the INSERT's layer
   lineweight  per entity / layer / block, DWG index table, LWDEFAULT;
               plotted in millimetres on the paper whatever the scale
   linetype    LTYPE dash patterns × LTSCALE × entity scale, PSLTSCALE in
               viewports; too dense to show → continuous, as AutoCAD does
   text        TEXT/ATTRIB: style font, height (TrueType em = 1.338 × height,
               measured against AutoCAD-plotted PDFs), width factor, oblique,
               rotation, all 15 justifications; MTEXT: inline codes (font,
               bold, italic, height, colour, width), word wrap at the box
               width, AutoCAD line spacing, attachment point, background mask
   hatch       solid (even-odd), predefined/user patterns from their pattern
               lines, clipped to the boundary (polyline, line, arc, elliptic
               arc and spline edges); gradients as their first colour
   also        LINE, (LW)POLYLINE with bulges and widths, CIRCLE, ARC, ELLIPSE,
               SPLINE (NURBS or fit points), SOLID/TRACE, 3DFACE, WIPEOUT,
               INSERT/MINSERT with attributes, DIMENSION and ACAD_TABLE through
               their blocks, LEADER with arrowhead, MLINE; OCS mirroring
               (extrusion z < 0)

   Coordinates are the drawing's own, y up: the caller wraps the body in a
   y-flip. Blocks become <g id> definitions in <defs>, one per distinct
   (block, ByBlock colour/weight/type, inherited layer, plot scale), and are
   placed with <use>. Line widths are written in local units so that they come
   out at their plotted width on paper: width = mm / (paper mm per local unit).
   ───────────────────────────────────────────────────────────────────────── */

const LW_TABLE = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
export const TTF_EM = 1.338;       // TrueType font size per unit of AutoCAD text height
let SHX_EM = 1.45;                 // osifont em per unit of SHX cap height; set from the font itself
export function setShxEm(v) { if (v > 0.8 && v < 3) SHX_EM = v; }
const ZERO_LW = 0.035;             // "0.00 mm" plots as the thinnest line

/* AutoCAD Color Index → RGB. 1–9 fixed; 10–249: 24 hues 15° apart, each in
   five values (1, .8, .6, .5, .3), full and half saturation; 250–255 greys. */
const ACI = (() => {
  const t = new Array(256).fill("#000000");
  const fixed = { 1: [255, 0, 0], 2: [255, 255, 0], 3: [0, 255, 0], 4: [0, 255, 255], 5: [0, 0, 255], 6: [255, 0, 255], 7: [255, 255, 255], 8: [128, 128, 128], 9: [192, 192, 192] };
  const hex = c => "#" + c.map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, "0")).join("");
  for (const k in fixed) t[k] = hex(fixed[k]);
  const V = [1, 1, .8, .8, .6, .6, .5, .5, .3, .3];
  for (let i = 10; i < 250; i++) {
    const h = (Math.floor(i / 10) - 1) * 15, k = i % 10, v = V[k], s = k % 2 ? .5 : 1;
    const f = n => { const kk = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(kk, 4 - kk, 1)); };
    t[i] = hex([f(5), f(3), f(1)].map(x => Math.floor(x * 255)));
  }
  [51, 91, 132, 173, 214, 255].forEach((g, j) => { t[250 + j] = hex([g, g, g]); });
  return t;
})();
const rgbHex = n => "#" + (n & 0xffffff).toString(16).padStart(6, "0");

/* Fonts are the site's own, not the viewer's: a drawing must convert the same
   on any computer. Four families are bundled (fonts/, see LICENSES.txt) and
   embedded in every PDF:
     dssans  Arimo   — metrics of Arial; all sans TrueType fonts
     dsserif Tinos   — metrics of Times New Roman; the serif ones
     dsmono  Cousine — metrics of Courier New
     dscad   osifont — ISO 3098 lettering, for the SHX fonts
   Arial's metrics matter most: AutoCAD title blocks are set in Arial, and a
   word wrap measured in a font of other widths breaks MTEXT elsewhere. A
   narrow original (Arial Narrow) keeps its width through a width factor. */
const SERIF = /^(times|timesbd|timesi|timesbi|bookos|bookosb|bookosi|cambria|cambriab|georgia|garamond|bell|belmt|constan|pala|palab)/;
const MONO = /^(cour|courbd|consola|lucon|monotxt|simplex_mono)/;
const NARROW = /^(arialn|arialnb|arialni|arialnbi|swissck|isocpeur|isocteur|gost)/;
export const FAMILIES = ["dssans", "dsserif", "dsmono", "dscad", "dsgothic"];
/* The stand-in keeps the original's line length: its width relative to the
   family it is set in (Arial for sans, Times for serif, Courier for mono),
   measured on Windows' own fonts over a mixed engineering string. */
const WIDTH = [
  [/^(tahoma)/, 0.966], [/^(verdana)/, 1.106], [/^(trebuc)/, 0.953], [/^(calibri)/, 0.878], [/^(segoe|segui)/, 0.959],
  [/^(framd|franklingothic)/, 0.927], [/^(gil|gillsans)/, 0.915], [/^(lsans|lucidasans)/, 1.06],
  [/^(candara)/, 0.91], [/^(corbel)/, 0.911], [/^(arialn|arialnarrow|swissck)/, 0.82],
  [/^(bookos|bookman)/, 1.16], [/^(bell)/, 1.024], [/^(century|cent)/, 1.116], [/^(georgia)/, 1.07], [/^(gara|garamond)/, 0.972], [/^(pala|palatino)/, 1.057],
  [/^(consola)/, 0.916]
];
function classify(name, bold, italic, forceShx) {
  const n = name.toLowerCase().replace(/\s+/g, "");
  // ISOCPEUR / ISOCTEUR are the TrueType cuts of the ISO lettering: set as it
  const shx = forceShx || /^(isocpeur|isocteur|isocp|isoct|isocpeui)/.test(n);
  const gothic = !shx && /^(gothic|centurygothic|avantgarde|avantgard|itcavantgarde|urwgothic)/.test(n);
  const fam = shx ? "dscad" : gothic ? "dsgothic" : SERIF.test(n) || /times|roman|bookman|georgia|garamond|bell|cambria|century(?!gothic)/.test(n) ? "dsserif" : MONO.test(n) || /courier|consol|mono/.test(n) ? "dsmono" : "dssans";
  let wfK = 1;
  if (!shx) for (const [re, k] of WIDTH) if (re.test(n)) { wfK = k; break; }
  return { family: fam, weight: bold && !shx ? 700 : 400, italic: italic && !shx ? 1 : 0, wfK, shx };
}
function fontFromFile(file) {
  const base = String(file || "").split(/[\\/]/).pop().toLowerCase();
  const name = base.replace(/\.(ttf|ttc|otf|shx)$/, "");
  const shx = /\.shx$/.test(base) || !/\.(ttf|ttc|otf)$/.test(base);
  return classify(name || "arial", /^(arialbd|tahomabd|verdanab|trebucbd|calibrib|timesbd|bookosb|courbd|gothicb|segoeuib|seguisb|arialnb|arialbi|timesbi)$/.test(name),
                  /^(ariali|arialbi|timesi|timesbi|verdanai|calibrii|couri|bookosi)$/.test(name), shx);
}
function fontFromName(name, bold, italic) {        // MTEXT \fArial|b1|i0;
  return classify(String(name || "arial").trim(), !!bold, !!italic, false);
}
const FALLBACK = { dssans: "Arial, Helvetica, sans-serif", dsserif: "'Times New Roman', Times, serif", dsmono: "'Courier New', Courier, monospace", dscad: "'Arial Narrow', Arial, sans-serif", dsgothic: "'Century Gothic', 'URW Gothic', sans-serif" };
const familyAttr = f => f.family + ", " + FALLBACK[f.family];

/* number formatting: enough digits for survey coordinates and for 1/1000 mm */
function f(v) {
  if (!Number.isFinite(v)) return 0;
  const a = Math.abs(v);
  return +v.toFixed(a >= 1e5 ? 3 : a >= 1e3 ? 4 : a >= 1 ? 5 : 7);
}
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const up = s => String(s ?? "").toUpperCase();
const P = p => f(p.x) + " " + f(p.y);

/* text codes common to TEXT and MTEXT */
function decodeText(s) {
  return String(s ?? "")
    .replace(/%%[cC]/g, "⌀").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±").replace(/%%%/g, "%")
    .replace(/%%[uUoOkK]/g, "").replace(/%%(\d{3})/g, (m, n) => String.fromCharCode(+n))
    .replace(/\\[uU]\+([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
}

/* ── MTEXT inline codes → paragraphs of runs ────────────────────────────── */
function parseMText(src, base) {
  const paras = [[]];
  const stack = [];
  let st = { ...base };
  let buf = "";
  const flush = () => { if (buf) { paras[paras.length - 1].push({ t: buf, ...st }); buf = ""; } };
  const s = String(src ?? "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{") { flush(); stack.push(st); st = { ...st }; continue; }
    if (ch === "}") { flush(); st = stack.pop() || st; continue; }
    if (ch !== "\\") { buf += ch; continue; }
    const c = s[i + 1]; i++;
    const readArg = () => { const j = s.indexOf(";", i + 1); const a = j < 0 ? s.slice(i + 1) : s.slice(i + 1, j); i = j < 0 ? s.length : j; return a; };
    switch (c) {
      case "P": flush(); { const p = []; if (st.palign) p.palign = st.palign; paras.push(p); } break;
      case "N": flush(); paras.push([]); break;
      case "~": buf += " "; break;
      case "\\": case "{": case "}": buf += c; break;
      case "f": case "F": {
        flush(); const a = readArg(); const [name, ...opts] = a.split("|");
        if (/\.shx$/i.test(name) || c === "F") { st.font = fontFromFile(name); }
        else { const b = opts.find(o => /^b/i.test(o)), it = opts.find(o => /^i/i.test(o)); st.font = fontFromName(name, b && b[1] === "1", it && it[1] === "1"); }
        break;
      }
      case "H": { flush(); const a = readArg(); const v = parseFloat(a); if (v > 0) st.h = /x$/i.test(a) ? st.h * v : v; break; }
      case "W": { flush(); const v = parseFloat(readArg()); if (v > 0) st.wf = v; break; }
      // \C256 is ByLayer and \C0 ByBlock — the layer's / the block's colour, not
      // the entity's (Senan: red MTEXT whose text is \C256 on layer 0, black)
      case "C": { flush(); const v = parseInt(readArg(), 10); if (v >= 1 && v <= 255) st.color = v === 7 ? "#000000" : ACI[v]; else if (v === 256) st.color = base.byLayer || base.color; else if (v === 0) st.color = base.byBlock || base.color; break; }
      case "c": { flush(); const v = parseInt(readArg(), 10); if (Number.isFinite(v)) st.color = rgbHex(v); break; }
      case "S": { const a = readArg(); buf += a.replace(/[\^#]/g, "/").replace(/\/\s*$/, ""); break; }
      case "p": { const a = readArg(); const q = /q([lcrjd])/.exec(a); if (q) { flush(); st.palign = q[1]; paras[paras.length - 1].palign = q[1]; } break; }
      case "A": case "Q": case "T": case "X": readArg(); break;
      case "L": case "l": case "O": case "o": case "K": case "k": break;
      default: buf += c || "";
    }
  }
  flush();
  return paras;
}

let mctx = null;
function measure(run, text) {
  if (!mctx) mctx = document.createElement("canvas").getContext("2d");
  const fnt = run.font;
  mctx.font = (fnt.italic ? "italic " : "") + (fnt.weight || 400) + " 100px " + familyAttr(fnt);
  return mctx.measureText(text).width / 100 * run.h * (fnt.shx ? SHX_EM : TTF_EM) * (run.wf || 1);
}

/* ── curves ──────────────────────────────────────────────────────────────── */
function bulgeTo(p1, p2, b) {
  if (!b) return "L" + P(p2);
  const th = 4 * Math.atan(b), ch = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (!ch) return "";
  const r = Math.abs(ch / (2 * Math.sin(th / 2)));
  return "A" + f(r) + " " + f(r) + " 0 " + (Math.abs(th) > Math.PI ? 1 : 0) + " " + (b > 0 ? 1 : 0) + " " + P(p2);
}
function arcPath(c, r, a0, a1, ccw = true) {          // angles in radians
  let sw = ccw ? a1 - a0 : a0 - a1;
  while (sw <= 0) sw += 2 * Math.PI;
  while (sw > 2 * Math.PI + 1e-9) sw -= 2 * Math.PI;
  const p0 = { x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) };
  if (sw >= 2 * Math.PI - 1e-9) {
    const pm = { x: c.x + r * Math.cos(a0 + Math.PI), y: c.y + r * Math.sin(a0 + Math.PI) };
    return { start: p0, d: "A" + f(r) + " " + f(r) + " 0 1 " + (ccw ? 1 : 0) + " " + P(pm) + "A" + f(r) + " " + f(r) + " 0 1 " + (ccw ? 1 : 0) + " " + P(p0) };
  }
  const a1n = ccw ? a0 + sw : a0 - sw;
  const p1 = { x: c.x + r * Math.cos(a1n), y: c.y + r * Math.sin(a1n) };
  return { start: p0, end: p1, d: "A" + f(r) + " " + f(r) + " 0 " + (sw > Math.PI ? 1 : 0) + " " + (ccw ? 1 : 0) + " " + P(p1) };
}
function ellipsePath(c, maj, ratio, t0, t1, ccw = true) {  // parametric angles
  const a = Math.hypot(maj.x, maj.y), b = a * ratio, rot = Math.atan2(maj.y, maj.x);
  const pt = t => ({ x: c.x + a * Math.cos(t) * Math.cos(rot) - b * Math.sin(t) * Math.sin(rot), y: c.y + a * Math.cos(t) * Math.sin(rot) + b * Math.sin(t) * Math.cos(rot) });
  let sw = ccw ? t1 - t0 : t0 - t1;
  while (sw <= 0) sw += 2 * Math.PI;
  while (sw > 2 * Math.PI + 1e-9) sw -= 2 * Math.PI;
  const deg = rot * 180 / Math.PI, p0 = pt(t0);
  const A = (p, large) => "A" + f(a) + " " + f(b) + " " + f(deg) + " " + large + " " + (ccw ? 1 : 0) + " " + P(p);
  if (sw >= 2 * Math.PI - 1e-9) return { start: p0, d: A(pt(t0 + Math.PI), 1) + A(p0, 1) };
  const p1 = pt(ccw ? t0 + sw : t0 - sw);
  return { start: p0, end: p1, d: A(p1, sw > Math.PI ? 1 : 0) };
}
/* NURBS by de Boor, or a Catmull-Rom curve through the fit points */
function splinePoints(e) {
  const cps = e.controlPoints || [], knots = e.knots || [], deg = e.degree || 3, w = e.weights || [];
  if (cps.length >= 2 && knots.length >= cps.length + deg + 1) {
    const n = cps.length - 1, lo = knots[deg], hi = knots[n + 1];
    const N = Math.max(16, cps.length * 8), out = [];
    for (let s = 0; s <= N; s++) {
      const u = s === N ? hi - 1e-12 * Math.abs(hi || 1) : lo + (hi - lo) * s / N;
      let k = deg; while (k < n && u >= knots[k + 1]) k++;
      const d = [];
      for (let j = 0; j <= deg; j++) { const p = cps[k - deg + j], ww = w[k - deg + j] ?? 1; d.push([p.x * ww, p.y * ww, ww]); }
      for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) {
        const i = k - deg + j, den = knots[i + deg - r + 1] - knots[i], al = den ? (u - knots[i]) / den : 0;
        d[j] = [d[j - 1][0] * (1 - al) + d[j][0] * al, d[j - 1][1] * (1 - al) + d[j][1] * al, d[j - 1][2] * (1 - al) + d[j][2] * al];
      }
      out.push({ x: d[deg][0] / d[deg][2], y: d[deg][1] / d[deg][2] });
    }
    return out;
  }
  const fp = e.fitPoints || cps;
  if (fp.length < 2) return fp;
  const out = [fp[0]];
  for (let i = 0; i < fp.length - 1; i++) {
    const p0 = fp[i - 1] || fp[i], p1 = fp[i], p2 = fp[i + 1], p3 = fp[i + 2] || p2;
    for (let s = 1; s <= 8; s++) {
      const t = s / 8, t2 = t * t, t3 = t2 * t;
      out.push({
        x: .5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: .5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      });
    }
  }
  return out;
}
const polyD = (pts, close) => pts.length ? "M" + pts.map(P).join("L") + (close ? "Z" : "") : "";

/* ── the renderer ────────────────────────────────────────────────────────── */
export function makeRenderer(db) {
  const T = db?.tables || {};
  const entries = t => (Array.isArray(t) ? t : t?.entries) || [];
  const layers = new Map(entries(T.LAYER).map(l => [up(l.name), l]));
  const ltypes = new Map(entries(T.LTYPE).map(l => [up(l.name), l]));
  const styles = new Map(entries(T.STYLE).map(s => [up(s.name), s]));
  const recs = entries(T.BLOCK_RECORD);
  const blocks = new Map(recs.map(b => [up(b.name), b]));
  const byHandle = new Map(recs.map(b => [String(b.handle), b]));
  const H = db?.header || {};
  const LTSCALE = +H.LTSCALE > 0 ? +H.LTSCALE : 1;
  const PSLTSCALE = +H.PSLTSCALE ? 1 : 0;
  const LWDEF = (+H.LWDEFAULT > 0 && +H.LWDEFAULT < 300 ? +H.LWDEFAULT : 25) / 100;
  const FILL = H.FILLMODE === 0 ? 0 : 1;
  const DIMASZ = (+H.DIMASZ > 0 ? +H.DIMASZ : 2.5) * (+H.DIMSCALE > 0 ? +H.DIMSCALE : 1);
  const layer0 = layers.get("0");
  /* LibreDWG leaves an ACAD_TABLE's block reference empty; the table's
     anonymous *T block is the record written right after it (C107: table
     1C6 → *T47 1C7, 225 → *T48 226) */
  function tableBlock(e) {
    let b = e.blockRecordHandle && byHandle.get(String(e.blockRecordHandle));
    if (!b && e.name) b = blocks.get(up(e.name));
    if (!b && e.handle) { const h = parseInt(String(e.handle), 16); for (let d = 1; d <= 3 && !b; d++) { const c = byHandle.get((h + d).toString(16).toUpperCase()); if (c && /^\*T/i.test(c.name)) b = c; } }
    return b || null;
  }

  const hidden = l => !l || l.frozen || l.off || l.plotFlag === 0 || l.plotFlag === false || (l.colorIndex < 0);
  const layerOf = (e, c) => { const n = up(e.layer || "0"); return n === "0" && c.layer0 ? c.layer0 : (layers.get(n) || layer0); };
  const layerColor = l => {
    if (!l) return "#000000";
    const ci = Math.abs(l.colorIndex ?? 7);
    if (ci >= 1 && ci <= 255) return ci === 7 ? "#000000" : ACI[ci];
    return l.color ? rgbHex(l.color) : "#000000";
  };
  function colorOf(e, c) {
    const ci = e.colorIndex;
    if (e.color && ci !== 256 && ci !== 0) return rgbHex(e.color);   // 24-bit true colour
    if (ci === 256 || ci == null) return layerColor(layerOf(e, c));
    if (ci === 0) return c.byColor || "#000000";
    return ci === 7 ? "#000000" : (ACI[ci] || "#000000");
  }
  function lwOf(e, c) {
    let i = e.lineweight;
    if (i === 29 || i == null || i === -1) { i = layerOf(e, c)?.lineweight; if (i === 29 || i === 30 || i == null) i = 31; }
    if (i === 30 || i === -2) return c.byLw ?? LWDEF;
    if (i === 31 || i === -3) return LWDEF;
    if (i >= 0 && i < LW_TABLE.length) return LW_TABLE[i] ? LW_TABLE[i] / 100 : ZERO_LW;
    if (i > 23 && i <= 211) return i / 100;
    return LWDEF;
  }
  function ltNameOf(e, c) {
    let n = up(e.lineType || "BYLAYER");
    if (n === "BYLAYER") n = up(layerOf(e, c)?.lineType || "CONTINUOUS");
    if (n === "BYBLOCK") n = c.byLt || "CONTINUOUS";
    return n;
  }
  function dashOf(e, c) {
    const lt = ltypes.get(ltNameOf(e, c));
    const pat = lt?.pattern || [];
    if (!pat.length) return null;
    const k = LTSCALE * (e.lineTypeScale > 0 ? e.lineTypeScale : 1) * c.ltK;
    const els = pat.map(p => +p.elementLength || 0);
    const total = els.reduce((a, v) => a + Math.abs(v), 0) * k;
    const paper = total * c.s;
    if (!(total > 0) || paper < 0.6 || paper > 5000) return null;    // too dense or too long to show
    const seq = [];
    for (const v of els) {
      const len = Math.abs(v) * k, isGap = v < 0;
      const slot = seq.length % 2 === 1;                             // odd slots are gaps
      if (isGap === slot) seq.push(len); else if (seq.length) seq[seq.length - 1] += len; else { seq.push(0); seq.push(len); }
    }
    if (seq.length % 2) seq.push(0);
    const dot = 0.02 / c.s;                                           // a dot is 0.02 mm on paper
    return seq.map((v, j) => f(j % 2 === 0 && v === 0 ? dot : v)).join(" ");
  }
  const lwClass = mm => "dsw" + Math.round(mm * 100);
  function strokeAttrs(e, c, fillNone = true) {
    const mm = lwOf(e, c), da = dashOf(e, c);
    return (fillNone ? ' fill="none"' : "") + ' stroke="' + colorOf(e, c) + '" stroke-width="' + f(mm / c.s) + '" class="' + lwClass(mm) + '"' +
      (da ? ' stroke-dasharray="' + da + '"' : "");
  }
  const mirrored = e => (e.extrusionDirection?.z ?? 1) < 0;
  const ocs = (e, s) => mirrored(e) ? '<g transform="scale(-1,1)">' + s + "</g>" : s;

  /* ── text ── */
  function styleFont(e) {
    const st = styles.get(up(e.styleName || "STANDARD")) || styles.get("STANDARD");
    return { st, font: fontFromFile(st?.font || "arial.ttf") };
  }
  function textMatrix(p, rot, wf, obl, gen) {
    const cs = Math.cos(rot), sn = Math.sin(rot), tn = Math.tan(obl || 0);
    let a = wf * cs, b = wf * sn, c = sn - tn * cs, d = -(cs + tn * sn);
    if (gen & 2) { a = -a; b = -b; }
    if (gen & 4) { c = -c; d = -d; }
    return "matrix(" + [a, b, c, d, p.x, p.y].map(f).join(" ") + ")";
  }
  function textSpan(font, color, strokeW) {
    return ' font-family="' + familyAttr(font) + '"' + (font.weight > 400 ? ' font-weight="bold"' : "") +
      (font.italic ? ' font-style="italic"' : "") + ' fill="' + color + '"' +
      (strokeW > 0 ? ' stroke="' + color + '" stroke-width="' + f(strokeW * 0.85) + '" stroke-linejoin="round" class="dswt"' : ' stroke="none"');
  }
  function textEl(e, c, t) {                                          // TEXT, ATTRIB, ATTDEF
    const str = decodeText(t.text ?? t);
    if (!str.trim()) return "";
    const { st, font } = styleFont(t);
    const h = t.textHeight || st?.fixedTextHeight || 2.5;
    let wf = (t.xScale > 0 ? t.xScale : (st?.widthFactor > 0 ? st.widthFactor : 1)) * (font.wfK || 1);
    const ha = t.halign || 0, va = t.valign || 0, rot = t.rotation || 0;
    const sp = t.startPoint || t.insertionPoint || { x: 0, y: 0 }, ep = t.endPoint || t.alignmentPoint;
    let p = (ha || va) && ep ? ep : sp, anchor = ha === 1 || ha === 4 ? "middle" : ha === 2 ? "end" : "start";
    let size = h * (font.shx ? SHX_EM : TTF_EM), rotation = rot;
    if ((ha === 3 || ha === 5) && ep) {                               // aligned / fit: between the two points
      const len = Math.hypot(ep.x - sp.x, ep.y - sp.y);
      const w = measure({ font, h, wf: font.wfK || 1 }, str);
      if (len > 0 && w > 0) {
        rotation = Math.atan2(ep.y - sp.y, ep.x - sp.x);
        if (ha === 5) wf = len / w; else { const k = len / (w * wf); size *= k; }
        p = sp; anchor = "start";
      }
    }
    const dy = ha === 4 ? h / 2 : va === 3 ? h : va === 2 ? h / 2 : va === 1 ? -h * 0.3 : 0;
    return '<text transform="' + textMatrix(p, rotation, wf, t.obliqueAngle || st?.obliqueAngle || 0, t.generationFlag || 0) + '" x="0" y="' + f(dy) +
      '" font-size="' + f(size) + '" text-anchor="' + anchor + '"' + textSpan(font, colorOf(e, c), font.shx ? lwOf(e, c) / c.s : 0) + ' xml:space="preserve">' + esc(str) + "</text>";
  }
  function mtextEl(e, c) {
    const { st, font } = styleFont(e);
    const h = e.textHeight || st?.fixedTextHeight || 2.5;
    const color = colorOf(e, c), lwmm = lwOf(e, c);
    const baseWf = (st?.widthFactor > 0 ? st.widthFactor : 1) * (font.wfK || 1);
    const paras = parseMText(e.text, { font, h, wf: baseWf, color, byLayer: layerColor(layerOf(e, c)), byBlock: c.byColor || "#000000" });
    const width = e.rectWidth > 0 ? e.rectWidth : 0;
    // word wrap across runs
    const lines = [];
    for (const runs of paras) {
      let line = [], lw = 0;
      // trailing spaces do not count for alignment in AutoCAD (Senan "…/ 3 }",
      // right-attached: the space pushed the line off its drawn radical signs)
      const push = () => { while (line.length && !line[line.length - 1].t.trim()) line.pop(); line.palign = runs.palign; lines.push(line); line = []; lw = 0; };
      const tokens = [];
      for (const r of runs) for (const part of r.t.split(/(\s+)/)) if (part) tokens.push({ ...r, t: part });
      if (!tokens.length) { const l = []; l.palign = runs.palign; lines.push(l); continue; }
      for (const tk of tokens) {
        const w = measure(tk, tk.t), space = !tk.t.trim();
        if (width && !space && lw + w > width * 0.985 && line.some(x => x.t.trim())) {   // AutoCAD breaks a shade early
          while (line.length && !line[line.length - 1].t.trim()) line.pop();
          push();
        }
        if (space && !line.length) continue;
        line.push(tk); lw += w;
      }
      push();
    }
    if (!lines.some(l => l.some(r => r.t.trim()))) return "";
    const lineH = l => Math.max(h, ...l.map(r => r.h));
    const spacing = (e.lineSpacing > 0 ? e.lineSpacing : 1) * 5 / 3;
    const ys = []; let y = 0;
    lines.forEach((l, k) => { y += k === 0 ? lineH(l) : lineH(l) * spacing; ys.push(y); });
    const total = y;
    const ap = Math.min(9, Math.max(1, e.attachmentPoint || 1)), row = Math.floor((ap - 1) / 3), col = (ap - 1) % 3;
    const top = row === 0 ? 0 : row === 1 ? -total / 2 : -total;
    const anchor = col === 0 ? "start" : col === 1 ? "middle" : "end";
    const dir = e.direction && (e.direction.x || e.direction.y) ? Math.atan2(e.direction.y, e.direction.x) : (e.rotation || 0);
    const ins = e.insertionPoint || { x: 0, y: 0 };
    let out = "";
    if (e.backgroundFill & 3) {                                      // background mask
      const wMax = (width || Math.max(...lines.map(l => l.reduce((a, r) => a + measure(r, r.t), 0)))) / baseWf;
      const k = e.fillBoxScale > 0 ? e.fillBoxScale : 1.5, pad = h * (k - 1);
      const x0 = col === 0 ? 0 : col === 1 ? -wMax / 2 : -wMax;
      const bg = e.backgroundFill & 2 ? "#ffffff" : (e.backgroundFillColor >= 1 && e.backgroundFillColor <= 255 && e.backgroundFillColor !== 7 ? ACI[e.backgroundFillColor] : "#ffffff");
      out += '<rect x="' + f(x0 - pad) + '" y="' + f(top - pad) + '" width="' + f(wMax + 2 * pad) + '" height="' + f(total + 2 * pad + h * .3) + '" fill="' + bg + '" stroke="none"/>';
    }
    lines.forEach((l, k) => {
      if (!l.some(r => r.t.trim())) return;
      let spans = "";
      for (const r of l) {
        const same = r.font === font && r.color === color && r.h === h;
        spans += same ? esc(r.t) : "<tspan" + textSpan(r.font, r.color, r.font.shx ? lwmm / c.s : 0) + ' font-size="' + f(r.h * (r.font.shx ? SHX_EM : TTF_EM)) + '">' + esc(r.t) + "</tspan>";
      }
      // paragraph alignment (\pxqc; …) places the line in the MTEXT box
      let x = 0, anc = anchor;
      const pa = l.palign, bw = width / baseWf, left = col === 0 ? 0 : col === 1 ? -bw / 2 : -bw;
      if (pa && bw) { if (pa === "c") { x = left + bw / 2; anc = "middle"; } else if (pa === "r") { x = left + bw; anc = "end"; } else { x = left; anc = "start"; } }
      out += '<text x="' + f(x) + '" y="' + f(top + ys[k]) + '" font-size="' + f(h * (font.shx ? SHX_EM : TTF_EM)) + '" text-anchor="' + anc + '"' + textSpan(font, color, font.shx ? lwmm / c.s : 0) +
        ' xml:space="preserve">' + spans + "</text>";
    });
    return '<g transform="' + textMatrix(ins, dir, baseWf, 0, 0) + '">' + out + "</g>";
  }

  /* ── hatch ── */
  function boundaryD(e) {
    let d = "";
    const pts = [];
    for (const bp of e.boundaryPaths || []) {
      if ((bp.boundaryPathTypeFlag & 2) && bp.vertices?.length) {
        const v = bp.vertices;
        d += "M" + P(v[0]); pts.push(v[0]);
        for (let i = 1; i <= v.length; i++) {
          const a = v[i - 1], b = v[i % v.length];
          if (i === v.length && !(bp.isClosed ?? 1)) break;
          d += bulgeTo(a, b, bp.hasBulge ? a.bulge || 0 : 0); pts.push(b);
        }
        d += "Z";
        continue;
      }
      let first = true, cur = null;
      const moveTo = p => { if (first || !cur || Math.hypot(p.x - cur.x, p.y - cur.y) > 1e-6 * (1 + Math.abs(p.x))) d += (first ? "M" : "L") + P(p); first = false; };
      for (const ed of bp.edges || []) {
        if (ed.type === 1) { moveTo(ed.start); d += "L" + P(ed.end); cur = ed.end; pts.push(ed.start, ed.end); }
        else if (ed.type === 2) {
          const ccw = !!ed.isCCW, a0 = ccw ? ed.startAngle : -ed.startAngle, a1 = ccw ? ed.endAngle : -ed.endAngle;
          const a = arcPath(ed.center, ed.radius, a0, a1, ccw); moveTo(a.start); d += a.d; cur = a.end || a.start;
          pts.push({ x: ed.center.x - ed.radius, y: ed.center.y - ed.radius }, { x: ed.center.x + ed.radius, y: ed.center.y + ed.radius });
        } else if (ed.type === 3) {
          const ccw = !!ed.isCCW, t0 = ccw ? ed.startAngle : -ed.startAngle, t1 = ccw ? ed.endAngle : -ed.endAngle;
          const a = ellipsePath(ed.center, ed.end, ed.lengthOfMinorAxis || 1, t0, t1, ccw); moveTo(a.start); d += a.d; cur = a.end || a.start;
          const r = Math.hypot(ed.end.x, ed.end.y); pts.push({ x: ed.center.x - r, y: ed.center.y - r }, { x: ed.center.x + r, y: ed.center.y + r });
        } else if (ed.type === 4) {
          const sp = splinePoints(ed); if (!sp.length) continue;
          moveTo(sp[0]); d += "L" + sp.slice(1).map(P).join("L"); cur = sp[sp.length - 1]; pts.push(...sp);
        }
      }
      if (!first) d += "Z";
    }
    return { d, pts };
  }
  let clipN = 0;
  function hatchEl(e, c, defs) {
    const { d, pts } = boundaryD(e);
    if (!d || !pts.length) return "";
    const color = e.gradientColorFlag && e.gradientColors?.length ? rgbHex(e.gradientColors[0]?.color ?? e.gradientColors[0]) : colorOf(e, c);
    const rule = (e.hatchStyle || 0) === 2 ? "nonzero" : "evenodd";
    if (e.solidFill || e.gradientColorFlag || !(e.definitionLines?.length)) {
      if (!FILL) return '<path d="' + d + '"' + strokeAttrs(e, c) + "/>";
      return '<path d="' + d + '" fill="' + color + '" fill-rule="' + rule + '" stroke="' + color + '" stroke-width="' + f(0.02 / c.s) + '"/>';
    }
    // pattern lines across the boundary's box, clipped to the boundary
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; } }
    if (!(x1 > x0) || !(y1 > y0)) return "";
    const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
    let segs = "", count = 0, LIMIT = 25000;
    const mm = lwOf(e, c), dot = 0.05 / c.s;
    /* Lines closer than a quarter of a millimetre on paper read as a tone, and
       drawing them one by one costs millions of strokes (a key plan's GRAVEL,
       hatched at site scale and inserted a few centimetres wide, came to six
       million). Such a hatch is drawn as the tone it makes. */
    const diag = Math.hypot(x1 - x0, y1 - y0);
    let spacing = Infinity, estimate = 0;
    for (const dl of e.definitionLines) {
      const a = dl.angle || 0, o = dl.offset || { x: 0, y: 0 }, dn = Math.abs(-Math.sin(a) * o.x + Math.cos(a) * o.y);
      if (dn > 1e-12) { spacing = Math.min(spacing, dn); estimate += diag / dn * Math.max(1, (dl.dashLengths || []).length ? diag / Math.max(1e-9, (dl.dashLengths || []).reduce((s, v) => s + Math.abs(v), 0)) : 1); }
    }
    if (spacing * c.s < 0.25 || estimate > LIMIT) {
      const tone = Math.max(0.12, Math.min(0.5, mm / Math.max(spacing * c.s, 1e-6) * 0.6));
      return '<path d="' + d + '" fill="' + color + '" fill-opacity="' + f(tone) + '" fill-rule="' + rule + '" stroke="none"/>';
    }
    for (const dl of e.definitionLines) {
      const a = dl.angle || 0, u = { x: Math.cos(a), y: Math.sin(a) }, n = { x: -u.y, y: u.x };
      const o = dl.offset || { x: 0, y: 0 }, dn = o.x * n.x + o.y * n.y, ds = o.x * u.x + o.y * u.y;
      if (Math.abs(dn) < 1e-9) continue;
      const b = dl.base || { x: 0, y: 0 };
      const proj = corners.map(([x, y]) => ((x - b.x) * n.x + (y - b.y) * n.y) / dn);
      const k0 = Math.floor(Math.min(...proj)), k1 = Math.ceil(Math.max(...proj));
      if (k1 - k0 > 20000) { count = LIMIT + 1; break; }
      const dashes = (dl.dashLengths || []).map(Number);
      const period = dashes.reduce((s, v) => s + Math.abs(v), 0);
      for (let k = k0; k <= k1; k++) {
        const ox = b.x + k * o.x, oy = b.y + k * o.y;
        const tt = corners.map(([x, y]) => (x - ox) * u.x + (y - oy) * u.y);
        const t0 = Math.min(...tt), t1 = Math.max(...tt);
        if (!dashes.length || !(period > 0)) { segs += "M" + f(ox + u.x * t0) + " " + f(oy + u.y * t0) + "L" + f(ox + u.x * t1) + " " + f(oy + u.y * t1); count++; }
        else {
          let t = Math.floor((t0 - k * ds * 0) / period) * period;
          while (t < t1 && count <= LIMIT) {
            for (const v of dashes) {
              const len = Math.abs(v);
              if (v >= 0 && t + len >= t0 && t <= t1) {
                const a0 = Math.max(t, t0), a1 = Math.min(t + (len || dot), t1);
                segs += "M" + f(ox + u.x * a0) + " " + f(oy + u.y * a0) + "L" + f(ox + u.x * a1) + " " + f(oy + u.y * a1); count++;
              }
              t += len;
            }
            if (period <= 0) break;
          }
        }
        if (count > LIMIT) break;
      }
      if (count > LIMIT) break;
    }
    if (count > LIMIT || !segs) {        // too fine to draw line by line: shade it
      return '<path d="' + d + '" fill="' + color + '" fill-opacity="0.35" fill-rule="' + rule + '" stroke="none"/>';
    }
    const id = c.idp + "h" + (clipN++);
    defs.push('<clipPath id="' + id + '" clipPathUnits="userSpaceOnUse"><path d="' + d + '" clip-rule="' + rule + '"/></clipPath>');
    return '<g clip-path="url(#' + id + ')"><path d="' + segs + '" fill="none" stroke="' + color + '" stroke-width="' + f(mm / c.s) + '" class="' + lwClass(mm) + '"/></g>';
  }

  /* ── polylines with width ── */
  function polyEl(e, c, verts, closed) {
    if (!verts?.length) return "";
    const cw = e.constantWidth || 0;
    const varW = verts.some(v => (v.startWidth || 0) !== (v.endWidth || 0) || ((v.startWidth || 0) && (v.startWidth || 0) !== cw));
    let d = "M" + P(verts[0]);
    const n = closed ? verts.length : verts.length - 1;
    for (let i = 0; i < n; i++) d += bulgeTo(verts[i], verts[(i + 1) % verts.length], verts[i].bulge || 0);
    if (closed) d += "Z";
    if (!varW && !(cw > 0)) return '<path d="' + d + '"' + strokeAttrs(e, c) + "/>";
    if (!varW) {                                                    // constant width: a wide stroke
      const col = colorOf(e, c);
      return '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + f(cw) + '" stroke-linecap="butt" stroke-linejoin="miter"/>';
    }
    // tapering segments (arrows): straight quads
    const col = colorOf(e, c);
    let out = "";
    for (let i = 0; i < n; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length];
      const w0 = (a.startWidth ?? cw) / 2, w1 = (a.endWidth ?? cw) / 2, L = Math.hypot(b.x - a.x, b.y - a.y);
      if (!L) continue;
      const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
      if (!w0 && !w1) { out += '<path d="M' + P(a) + "L" + P(b) + '"' + strokeAttrs(e, c) + "/>"; continue; }
      out += '<path d="M' + f(a.x + nx * w0) + " " + f(a.y + ny * w0) + "L" + f(b.x + nx * w1) + " " + f(b.y + ny * w1) + "L" + f(b.x - nx * w1) + " " + f(b.y - ny * w1) +
        "L" + f(a.x - nx * w0) + " " + f(a.y - ny * w0) + 'Z" fill="' + col + '" stroke="none"/>';
    }
    return out;
  }

  /* ── blocks ── */
  const cache = new Map();
  function blockUse(blk, e, c, defs, transform) {
    const lay = up(e.layer || "0") === "0" && c.layer0 ? c.layer0 : (layers.get(up(e.layer || "0")) || layer0);
    const sx = e.xScale || 1, sy = e.yScale || 1;
    const nc = {
      ...c, s: c.s * Math.sqrt(Math.abs(sx * sy)) || c.s, layer0: lay, byColor: colorOf(e, c), byLw: lwOf(e, c), byLt: ltNameOf(e, c),
      depth: (c.depth || 0) + 1, insHidden: c.insHidden || (lay && (lay.off || lay.plotFlag === 0 || lay.plotFlag === false))
    };
    if (nc.depth > 24) return "";
    const key = blk.handle + "|" + nc.byColor + "|" + f(nc.byLw) + "|" + nc.byLt + "|" + (lay?.name || "") + "|" + nc.insHidden + "|" + nc.s.toPrecision(4) + "|" + c.ltK.toPrecision(4);
    let id = cache.get(key);
    if (!id) {
      id = c.idp + "b" + cache.size;
      cache.set(key, id);
      const body = drawList(blk.entities || [], nc, defs);
      defs.push('<g id="' + id + '">' + body + "</g>");
    }
    return '<use href="#' + id + '"' + (transform ? ' transform="' + transform + '"' : "") + "/>";
  }
  function insertEl(e, c, defs) {
    const blk = blocks.get(up(e.name)); if (!blk) return "";
    const lay = layers.get(up(e.layer || "0"));
    if (lay?.frozen) return "";
    const base = blk.basePoint || { x: 0, y: 0 }, ins = e.insertionPoint || { x: 0, y: 0 };
    const deg = (e.rotation || 0) * 180 / Math.PI, sx = e.xScale || 1, sy = e.yScale || 1;
    const cols = Math.max(1, e.columnCount || 1), rows = Math.max(1, e.rowCount || 1);
    let out = "";
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const off = (q || r) ? " translate(" + f(q * (e.columnSpacing || 0)) + "," + f(r * (e.rowSpacing || 0)) + ")" : "";
      const tr = "translate(" + P(ins).replace(" ", ",") + ")" + (deg ? " rotate(" + f(deg) + ")" : "") + off + (sx !== 1 || sy !== 1 ? " scale(" + f(sx) + "," + f(sy) + ")" : "") +
        (base.x || base.y ? " translate(" + f(-base.x) + "," + f(-base.y) + ")" : "");
      out += blockUse(blk, e, c, defs, tr);
    }
    out = ocs(e, out);
    // attributes are placed in the parent's coordinates
    if (e.attribs?.length) {
      const ac = { ...c, byColor: colorOf(e, c), byLw: lwOf(e, c), byLt: ltNameOf(e, c), layer0: lay || c.layer0 };
      for (const a of e.attribs) {
        if (a.isVisible === false || (a.flags & 1)) continue;
        if (hidden(layerOf(a, ac))) continue;
        if (a.mtextFlag && a.mtext && (a.mtext.text || a.mtext.insertionPoint)) out += mtextEl({ ...a, ...a.mtext, colorIndex: a.colorIndex, color: a.color, layer: a.layer }, ac);
        else if (a.text) out += ocs(a, textEl(a, ac, a.text));
      }
    }
    return out;
  }

  /* ── one entity ── */
  function draw(e, c, defs) {
    if (!e || e.isVisible === false) return "";
    const L = layerOf(e, c);
    if (hidden(L)) return "";
    if (c.insHidden && up(e.layer || "0") === "0") return "";
    switch (e.type) {
      case "LINE": return '<path d="M' + P(e.startPoint) + "L" + P(e.endPoint) + '"' + strokeAttrs(e, c) + "/>";
      case "CIRCLE": return ocs(e, '<circle cx="' + f(e.center.x) + '" cy="' + f(e.center.y) + '" r="' + f(e.radius) + '"' + strokeAttrs(e, c) + "/>");
      case "ARC": { const a = arcPath(e.center, e.radius, e.startAngle || 0, e.endAngle || 0, true); return ocs(e, '<path d="M' + P(a.start) + a.d + '"' + strokeAttrs(e, c) + "/>"); }
      case "ELLIPSE": { const a = ellipsePath(e.center, e.majorAxisEndPoint, e.axisRatio || 1, e.startAngle || 0, e.endAngle ?? 2 * Math.PI, true); return '<path d="M' + P(a.start) + a.d + '"' + strokeAttrs(e, c) + "/>"; }
      case "LWPOLYLINE": return ocs(e, polyEl(e, c, e.vertices, !!(e.flag & 1) || e.closed));
      case "POLYLINE2D": case "POLYLINE3D": case "POLYLINE": {
        const v = (e.vertices || []).filter(x => !(x.flag & 16));
        return ocs(e, polyEl({ ...e, constantWidth: e.startWidth === e.endWidth ? e.startWidth : 0 }, c, v, !!(e.flag & 1)));
      }
      case "SPLINE": { const pts = splinePoints(e); return '<path d="' + polyD(pts, !!(e.flag & 1)) + '"' + strokeAttrs(e, c) + "/>"; }
      case "SOLID": case "TRACE": {
        const q = [e.corner1, e.corner2, e.corner4 || e.corner3, e.corner3].filter(Boolean);
        const col = colorOf(e, c), d = polyD(q, true);
        return ocs(e, FILL ? '<path d="' + d + '" fill="' + col + '" stroke="' + col + '" stroke-width="' + f(0.02 / c.s) + '"/>' : '<path d="' + d + '"' + strokeAttrs(e, c) + "/>");
      }
      case "3DFACE": { const q = [e.corner1, e.corner2, e.corner3, e.corner4].filter(Boolean); return '<path d="' + polyD(q, true) + '"' + strokeAttrs(e, c) + "/>"; }
      case "HATCH": return ocs(e, hatchEl(e, c, defs));
      case "WIPEOUT": {
        const b = e.clippingBoundaryPath || [], pos = e.position, u = e.uPixel, v = e.vPixel, sz = e.imageSize || { x: 1, y: 1 };
        if (!pos || !u || !v || b.length < 2) return "";
        const w = p => ({ x: pos.x + (p.x + .5) * u.x + (sz.y - .5 - p.y) * v.x, y: pos.y + (p.x + .5) * u.y + (sz.y - .5 - p.y) * v.y });
        let pts = b.map(w);
        if (e.clippingBoundaryType === 1 || pts.length === 2) { const [p, q] = pts; pts = [p, { x: q.x, y: p.y }, q, { x: p.x, y: q.y }]; }
        return '<path d="' + polyD(pts, true) + '" fill="#ffffff" stroke="none"/>';
      }
      case "TEXT": return ocs(e, textEl(e, c, e));
      case "ATTDEF": return (e.flags & 2) ? ocs(e, textEl(e, c, e.text && typeof e.text === "object" ? e.text : e)) : "";
      case "MTEXT": return mtextEl(e, c);
      case "INSERT": case "MINSERT": return insertEl(e, c, defs);
      case "DIMENSION": { const blk = blocks.get(up(e.name)); return blk ? blockUse(blk, e, c, defs, "") : ""; }
      case "ACAD_TABLE": {
        const blk = tableBlock(e); if (!blk?.entities?.length) return "";
        const sp = e.startPoint || e.insertionPoint || { x: 0, y: 0 }, dv = e.directionVector;
        // LibreDWG does not decode the insertion point of tables in newer DWGs
        // (C107, AC1032: 0,0 for both); drawn there, the table would land off
        // its place — it is left out rather than put in the wrong one
        if (!sp.x && !sp.y && !sp.z) return "";
        const deg = dv && (dv.x || dv.y) ? Math.atan2(dv.y, dv.x) * 180 / Math.PI : 0;
        const tr = (sp.x || sp.y ? "translate(" + f(sp.x) + "," + f(sp.y) + ")" : "") + (deg ? " rotate(" + f(deg) + ")" : "");
        return blockUse(blk, e, c, defs, tr.trim());
      }
      case "OLE2FRAME": {
        // the picture the OLE object carries for display (decoded by the engine)
        if (!e._png || !e.leftUpPoint || !e.rightDownPoint) return "";
        const a = e.leftUpPoint, b = e.rightDownPoint, w = Math.abs(b.x - a.x), h = Math.abs(a.y - b.y);
        if (!(w > 0 && h > 0)) return "";
        return '<g transform="translate(' + f(Math.min(a.x, b.x)) + "," + f(Math.max(a.y, b.y)) + ') scale(1,-1)"><image x="0" y="0" width="' + f(w) + '" height="' + f(h) +
               '" preserveAspectRatio="none" href="' + e._png + '" xlink:href="' + e._png + '"/></g>';
      }
      case "LEADER": {
        const v = e.vertices || []; if (v.length < 2) return "";
        let out = '<path d="' + polyD(v, false) + '"' + strokeAttrs(e, c) + "/>";
        if (e.isArrowheadEnabled !== false) {
          const a = v[0], b = v[1], L2 = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / L2, uy = (b.y - a.y) / L2, s = DIMASZ, w = s / 6;
          const col = colorOf(e, c);
          out += '<path d="M' + P(a) + "L" + f(a.x + ux * s - uy * w) + " " + f(a.y + uy * s + ux * w) + "L" + f(a.x + ux * s + uy * w) + " " + f(a.y + uy * s - ux * w) + 'Z" fill="' + col + '" stroke="none"/>';
        }
        return out;
      }
      case "MLINE": {
        const vs = e.vertices || []; if (vs.length < 2) return "";
        const nl = e.numberOfLines || vs[0]?.lines?.length || 1;
        let out = "";
        for (let i = 0; i < nl; i++) {
          const pts = vs.map(vx => { const off = vx.lines?.[i]?.segmentParams?.[0] || 0, m = vx.miterDirection || { x: 0, y: 0 }; return { x: vx.vertex.x + m.x * off, y: vx.vertex.y + m.y * off }; });
          out += '<path d="' + polyD(pts, !!(e.flags & 2)) + '"' + strokeAttrs(e, c) + "/>";
        }
        return out;
      }
      default: return "";
    }
  }
  /* ── extents, for leaving out what a viewport does not show ── */
  const bbCache = new Map();
  function box(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
    return x1 >= x0 ? [x0, y0, x1, y1] : null;
  }
  const grow = (b, r) => b && [b[0] - r, b[1] - r, b[2] + r, b[3] + r];
  function blockBox(blk, depth) {
    const k = blk.handle; if (bbCache.has(k)) return bbCache.get(k);
    bbCache.set(k, null);
    let acc = null;
    for (const e of blk.entities || []) { const b = bboxOf(e, depth + 1); if (b) acc = acc ? [Math.min(acc[0], b[0]), Math.min(acc[1], b[1]), Math.max(acc[2], b[2]), Math.max(acc[3], b[3])] : b; }
    bbCache.set(k, acc); return acc;
  }
  function xformBox(b, ins, rot, sx, sy, base) {
    if (!b) return null;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const pts = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map(([x, y]) => { const X = (x - base.x) * sx, Y = (y - base.y) * sy; return { x: ins.x + X * cs - Y * sn, y: ins.y + X * sn + Y * cs }; });
    return box(pts);
  }
  function bboxOf(e, depth = 0) {
    if (depth > 12) return null;
    let b = null;
    switch (e.type) {
      case "LINE": b = box([e.startPoint, e.endPoint]); break;
      case "CIRCLE": case "ARC": b = e.center && [e.center.x - e.radius, e.center.y - e.radius, e.center.x + e.radius, e.center.y + e.radius]; break;
      case "ELLIPSE": { const r = Math.hypot(e.majorAxisEndPoint?.x || 0, e.majorAxisEndPoint?.y || 0); b = e.center && [e.center.x - r, e.center.y - r, e.center.x + r, e.center.y + r]; break; }
      case "LWPOLYLINE": case "POLYLINE2D": case "POLYLINE3D": case "POLYLINE": b = grow(box(e.vertices || []), (e.constantWidth || 0)); if (b) { const w = b[2] - b[0], h = b[3] - b[1]; if ((e.vertices || []).some(v => v.bulge)) b = grow(b, Math.max(w, h) * 0.5); } break;
      case "SPLINE": b = box([...(e.controlPoints || []), ...(e.fitPoints || [])]); break;
      case "SOLID": case "TRACE": case "3DFACE": b = box([e.corner1, e.corner2, e.corner3, e.corner4]); break;
      case "TEXT": case "ATTDEF": { const h = e.textHeight || 2.5, n = String(e.text || "").length; const p = e.startPoint || e.insertionPoint; b = p && grow(box([p, e.endPoint || p]), h * Math.max(2, n)); break; }
      case "MTEXT": { const p = e.insertionPoint, h = e.textHeight || 2.5; const w = e.rectWidth || h * String(e.text || "").length; b = p && grow(box([p]), Math.max(w, h * 4)); break; }
      case "HATCH": { const pts = []; for (const bp of e.boundaryPaths || []) { pts.push(...(bp.vertices || [])); for (const ed of bp.edges || []) { if (ed.start) pts.push(ed.start, ed.end); if (ed.center) { const r = ed.radius || Math.hypot(ed.end?.x || 0, ed.end?.y || 0); pts.push({ x: ed.center.x - r, y: ed.center.y - r }, { x: ed.center.x + r, y: ed.center.y + r }); } if (ed.controlPoints) pts.push(...ed.controlPoints); } } b = box(pts); break; }
      case "INSERT": case "MINSERT": {
        const blk = blocks.get(up(e.name)); if (!blk) return null;
        const inner = blockBox(blk, depth); if (!inner) return null;
        const cw = (e.columnCount > 1 ? (e.columnCount - 1) * (e.columnSpacing || 0) : 0), rh = (e.rowCount > 1 ? (e.rowCount - 1) * (e.rowSpacing || 0) : 0);
        const ib = [inner[0], inner[1], inner[2] + cw / (e.xScale || 1), inner[3] + rh / (e.yScale || 1)];
        b = xformBox(ib, e.insertionPoint || { x: 0, y: 0 }, e.rotation || 0, e.xScale || 1, e.yScale || 1, blk.basePoint || { x: 0, y: 0 });
        if (b && e.attribs?.length) for (const a of e.attribs) { const t = a.text || {}; const ab = bboxOf({ type: "TEXT", ...t, textHeight: t.textHeight }, depth + 1); if (ab) b = [Math.min(b[0], ab[0]), Math.min(b[1], ab[1]), Math.max(b[2], ab[2]), Math.max(b[3], ab[3])]; }
        break;
      }
      case "DIMENSION": { const blk = blocks.get(up(e.name)); b = blk ? blockBox(blk, depth) : null; break; }
      case "ACAD_TABLE": { const blk = tableBlock(e); const inner = blk ? blockBox(blk, depth) : null; b = inner && xformBox(inner, e.startPoint || { x: 0, y: 0 }, 0, 1, 1, { x: 0, y: 0 }); break; }
      case "LEADER": case "MLINE": b = box((e.vertices || []).map(v => v.vertex || v)); break;
      case "WIPEOUT": case "IMAGE": { const p = e.position, u = e.uPixel, v = e.vPixel, sz = e.imageSize || { x: 1, y: 1 }; b = p && u && v && box([p, { x: p.x + u.x * sz.x + v.x * sz.y, y: p.y + u.y * sz.x + v.y * sz.y }, { x: p.x + u.x * sz.x, y: p.y + u.y * sz.x }, { x: p.x + v.x * sz.y, y: p.y + v.y * sz.y }]); break; }
      case "OLE2FRAME": b = box([e.leftUpPoint, e.rightDownPoint]); break;
      default: return null;
    }
    if (b && mirrored(e) && !["LINE", "ELLIPSE", "SPLINE", "MTEXT", "LEADER", "MLINE", "DIMENSION"].includes(e.type)) b = [-b[2], b[1], -b[0], b[3]];
    return b;
  }
  const outside = (e, w) => { const b = bboxOf(e); return !!b && (b[2] < w[0] || b[0] > w[2] || b[3] < w[1] || b[1] > w[3]); };

  function drawList(list, c, defs) {
    let s = "";
    for (const e of list) { try { s += draw(e, c, defs); } catch (err) { /* one bad entity never costs the sheet */ } }
    return s;
  }

  return {
    /* entities → {defs, body}; env: s = paper mm per drawing unit, ltK = linetype
       scale factor for this space, idp = prefix for ids, filter = entity test */
    render(list, env) {
      const defs = [];
      const c = { s: env.s || 1, ltK: env.ltK || 1, idp: env.idp || "", layer0: null, byColor: "#000000", byLw: LWDEF, byLt: "CONTINUOUS", depth: 0 };
      cache.clear();
      let items = list.filter(env.filter || (() => true));
      if (env.window) items = items.filter(e => !outside(e, env.window));
      const body = drawList(items, c, defs);
      return { defs: defs.join(""), body };
    },
    PSLTSCALE, LTSCALE
  };
}

/* Line weights on screen, as AutoCAD shows them: in pixels, the same at
   every zoom — 0.25 mm and under is 1 px, heavier weights about 4 px per mm —
   so zooming in brings detail, not fatter lines. Widths that are geometry
   (a polyline with width, a bus drawn wide) scale with the drawing as they
   should. The PDF drops this style and plots the widths in millimetres. */
const SCREEN_W = [4, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
export const SCREEN_STYLE = '<style id="ds-screen">' +
  SCREEN_W.map(n => ".dsw" + n + "{vector-effect:non-scaling-stroke;stroke-width:" + Math.max(1, +(n / 100 * 4).toFixed(2)) + "px}").join("") +
  "</style>";
