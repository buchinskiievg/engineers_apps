/* markup.js — the markup layer of Engineering PDF Document Studio.

   A page carries its markups (p.marks), each in the page's own units — the
   units its preview is drawn in: a DWG sheet's viewBox units, a PDF page's
   points at scale 1 (y down), an image's pixels. prims() turns a markup into
   drawing primitives (paths and text) in those units, once, and both the
   screen (svgOf) and the exported PDF (drawPdf) are drawn from them — so the
   PDF shows exactly what the window showed. Sizes are held in points of the
   printed page (pens and text heights as ISO 128 / ISO 3098 give them) and
   turned into page units with U, the units per point of that page.

   Measurements know the drawing: on a DWG layout a length measured inside a
   viewport is the model's length (paper length ÷ the viewport's scale), on
   the Model page it is the drawing's own units — no calibration. A PDF or a
   picture is measured on paper until it is calibrated on a known length. */

export const PT_MM = 25.4 / 72;
export const PENS = [0.25, 0.35, 0.5, 0.7, 1.0];                 // mm, ISO 128
export const TEXT_H = [2.5, 3.5, 5, 7];                          // mm, ISO 3098
export const COLORS = [["#d11a2a", "red"], ["#1f5fbf", "blue"], ["#1d8a3a", "green"], ["#b0189a", "magenta"], ["#d9730d", "orange"], ["#222222", "black"]];
/* review stamps: the codes of a comment resolution sheet */
export const STAMPS = {
  A:   { title: "APPROVED",                c: "#1d6b35" },
  AWC: { title: "APPROVED WITH COMMENTS",  c: "#1f4e9a" },
  RR:  { title: "REVISE AND RESUBMIT",     c: "#c05a00" },
  R:   { title: "REJECTED",                c: "#a30e18" },
  FI:  { title: "FOR INFORMATION",         c: "#555555" },
  IFC: { title: "ISSUED FOR CONSTRUCTION", c: "#222222" },
};
export const TYPE_NAMES = { text: "Text", callout: "Callout", arrow: "Arrow", line: "Line", rect: "Rectangle", ellipse: "Ellipse",
  cloud: "Revision cloud", highlight: "Highlight", whiteout: "Whiteout", stamp: "Stamp", dist: "Distance", path: "Length", area: "Area", replace: "Text replaced" };

const mmPt = mm => mm / PT_MM;
let measureCtx = null;
/* the width of a line of text in the markup font, at size 1 */
export function textW(s, bold) {
  measureCtx = measureCtx || document.createElement("canvas").getContext("2d");
  measureCtx.font = (bold ? "bold " : "") + "100px dssans, Arimo, Arial, sans-serif";
  return measureCtx.measureText(s).width / 100;
}
const f = v => +(+v).toFixed(3);
const P = ([x, y]) => f(x) + " " + f(y);

/* ── measuring ── */
const UNIT_MM = { mm: 1, cm: 10, dm: 100, m: 1000, km: 1e6, in: 25.4, ft: 304.8, yd: 914.4, mi: 1609344, mil: 0.0254, "µin": 0.0000254 };
export function fmtLen(v, unit) {
  if (unit === "mm" && Math.abs(v) >= 10000) return fmtNum(v / 1000, 2) + " m";
  if (unit === "mm") return fmtNum(v, Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0) + " mm";
  return fmtNum(v, Math.abs(v) < 10 ? 3 : 2) + " " + unit;
}
export function fmtArea(v, unit) {
  const mm = UNIT_MM[unit];
  if (mm) { const m2 = v * mm * mm / 1e6; return m2 >= 0.01 ? fmtNum(m2, m2 < 10 ? 3 : 2) + " m²" : fmtNum(v, 0) + " " + unit + "²"; }
  return fmtNum(v, 2) + " " + unit + "²";
}
function fmtNum(v, d) {
  const s = (+v).toFixed(d), [i, fr] = s.split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (fr ? "." + fr : "");
}
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const polyLen = pts => pts.slice(1).reduce((t, p, i) => t + dist(pts[i], p), 0);
const polyArea = pts => Math.abs(pts.reduce((t, p, i) => { const q = pts[(i + 1) % pts.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
/* the value a measurement shows; sc(pts) gives { k: real per page unit, unit, how } */
export function measureText(m, sc) {
  const s = sc(m.pts);
  if (m.t === "dist") return fmtLen(dist(m.pts[0], m.pts[1]) * s.k, s.unit);
  if (m.t === "path") return fmtLen(polyLen(m.pts) * s.k, s.unit);
  if (m.t === "area") return fmtArea(polyArea(m.pts) * s.k * s.k, s.unit) + "  ·  P = " + fmtLen(polyLen([...m.pts, m.pts[0]]) * s.k, s.unit);
  return "";
}

/* ── the primitives ── */
/* a revision cloud along a rectangle: arcs of about r, bulging outwards */
function cloudD(a, b, r) {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  let d = "M" + P(pts[0]);
  for (let i = 0; i < 4; i++) {
    const p = pts[i], q = pts[(i + 1) % 4], L = dist(p, q), n = Math.max(1, Math.round(L / (2 * r))), step = L / n;
    for (let k = 1; k <= n; k++) {
      const t = k / n, x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t;
      d += "A" + f(step / 2) + " " + f(step / 2) + " 0 0 1 " + f(x) + " " + f(y);
    }
  }
  return d + "Z";
}
function ellipseD(a, b) {
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, rx = Math.abs(b[0] - a[0]) / 2, ry = Math.abs(b[1] - a[1]) / 2;
  return "M" + f(cx - rx) + " " + f(cy) + "A" + f(rx) + " " + f(ry) + " 0 1 0 " + f(cx + rx) + " " + f(cy) + "A" + f(rx) + " " + f(ry) + " 0 1 0 " + f(cx - rx) + " " + f(cy) + "Z";
}
const rectD = (a, b) => { const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]); return "M" + f(x0) + " " + f(y0) + "H" + f(x1) + "V" + f(y1) + "H" + f(x0) + "Z"; };
function headD(a, b, size) {                                       // a filled arrow head at b
  const L = dist(a, b) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, w = size * 0.42;
  const bx = b[0] - ux * size, by = b[1] - uy * size;
  return "M" + P(b) + "L" + f(bx - uy * w) + " " + f(by + ux * w) + "L" + f(bx + uy * w) + " " + f(by - ux * w) + "Z";
}
/* text lines laid out from a top-left corner: [{t, x, y (baseline), size, bold}] and the box */
function textBlock(str, x, y, size, bold, pad) {
  const lines = String(str || "").split("\n"), lh = size * 1.22;
  const w = Math.max(size * 0.6, ...lines.map(l => textW(l, bold) * size)), h = lines.length * lh;
  const out = lines.map((t, i) => ({ t, x: x + pad, y: y + pad + size * 0.93 + i * lh, size, bold }));
  return { lines: out, box: [x, y, x + w + 2 * pad, y + h + 2 * pad] };
}
/* The primitives of one markup, in page units. U = units per point; sc = the
   measuring scale of the page (for the labels). Each path: {d, stroke, w,
   fill, op, dash, blend}; each text: {t, x, y, size, bold, color, halo}. */
export function prims(m, U, sc) {
  const c = m.c || "#d11a2a", w = (m.w ?? mmPt(0.35)) * U, fs = (m.fs ?? mmPt(3.5)) * U, pts = m.pts;
  const paths = [], texts = [];
  const label = (str, at, color) => {
    const tb = textBlock(str, at[0], at[1], fs, true, fs * 0.25);
    paths.push({ d: rectD([tb.box[0], tb.box[1]], [tb.box[2], tb.box[3]]), fill: "#ffffff", op: 0.85 });
    tb.lines.forEach(l => texts.push({ ...l, color }));
    return tb.box;
  };
  switch (m.t) {
    case "line": paths.push({ d: "M" + P(pts[0]) + "L" + P(pts[1]), stroke: c, w }); break;
    case "arrow": {
      const hs = Math.max(w * 4, 7 * U), L = dist(pts[0], pts[1]) || 1, k = Math.max(0, (L - hs * 0.8) / L);
      const e = [pts[0][0] + (pts[1][0] - pts[0][0]) * k, pts[0][1] + (pts[1][1] - pts[0][1]) * k];
      paths.push({ d: "M" + P(pts[0]) + "L" + P(e), stroke: c, w }, { d: headD(pts[0], pts[1], hs), fill: c }); break;
    }
    case "rect": paths.push({ d: rectD(pts[0], pts[1]), stroke: c, w }); break;
    case "ellipse": paths.push({ d: ellipseD(pts[0], pts[1]), stroke: c, w }); break;
    case "highlight": paths.push({ d: rectD(pts[0], pts[1]), fill: m.c || "#ffe600", op: 0.38, blend: "multiply" }); break;
    case "whiteout": paths.push({ d: rectD(pts[0], pts[1]), fill: "#ffffff" }); break;
    case "cloud": {
      paths.push({ d: cloudD(pts[0], pts[1], Math.max(mmPt(3) * U, w * 6)), stroke: c, w });
      if (m.rev != null && m.rev !== "") {                        // the revision triangle at the top right
        const s = mmPt(7) * U, x1 = Math.max(pts[0][0], pts[1][0]), y0 = Math.min(pts[0][1], pts[1][1]);
        const tx = x1 + s * 0.15, ty = y0 - s * 0.95;
        paths.push({ d: "M" + f(tx + s / 2) + " " + f(ty) + "L" + f(tx + s) + " " + f(ty + s * 0.87) + "L" + f(tx) + " " + f(ty + s * 0.87) + "Z", stroke: c, w, fill: "#ffffff" });
        const ts = s * 0.42, tw = textW(String(m.rev), true) * ts;
        texts.push({ t: String(m.rev), x: tx + s / 2 - tw / 2, y: ty + s * 0.74, size: ts, bold: true, color: c });
      }
      break;
    }
    case "replace": {                                              // the PDF's own text, covered and retyped
      paths.push({ d: rectD(pts[0], pts[1]), fill: "#ffffff" });
      if (m.text) texts.push({ t: m.text, x: Math.min(pts[0][0], pts[1][0]) + (m.padX || 0), y: m.base, size: fs, bold: false, color: m.c || "#000000" });
      break;
    }
    case "text": {
      const tb = textBlock(m.text || "Text", pts[0][0], pts[0][1], fs, false, m.frame ? fs * 0.3 : 0);
      if (m.frame) paths.push({ d: rectD([tb.box[0], tb.box[1]], [tb.box[2], tb.box[3]]), stroke: c, w, fill: "#ffffff" });
      tb.lines.forEach(l => texts.push({ ...l, color: c }));
      break;
    }
    case "callout": {                                             // pts: [tip, box corner]
      const tb = textBlock(m.text || "Comment", pts[1][0], pts[1][1], fs, false, fs * 0.35), b = tb.box;
      const cx = Math.max(b[0], Math.min(pts[0][0], b[2])), cy = Math.max(b[1], Math.min(pts[0][1], b[3]));
      // the leader leaves the box at the side nearest the tip
      const cands = [[b[0], (b[1] + b[3]) / 2], [b[2], (b[1] + b[3]) / 2], [(b[0] + b[2]) / 2, b[1]], [(b[0] + b[2]) / 2, b[3]]];
      const from = cands.reduce((best, q) => dist(q, pts[0]) < dist(best, pts[0]) ? q : best, [cx, cy]);
      const hs = Math.max(w * 4, 6 * U), L = dist(from, pts[0]) || 1, k = Math.max(0, (L - hs * 0.8) / L);
      paths.push({ d: "M" + P(from) + "L" + P([from[0] + (pts[0][0] - from[0]) * k, from[1] + (pts[0][1] - from[1]) * k]), stroke: c, w },
                 { d: headD(from, pts[0], hs), fill: c },
                 { d: rectD([b[0], b[1]], [b[2], b[3]]), stroke: c, w, fill: "#ffffff" });
      tb.lines.forEach(l => texts.push({ ...l, color: "#111111" }));
      break;
    }
    case "stamp": {
      const st = STAMPS[m.stamp] || STAMPS.A, sc2 = m.scale || 1, color = st.c;
      const big = mmPt(4.2) * U * sc2, small = mmPt(2.4) * U * sc2, pad = mmPt(2.2) * U * sc2;
      const l1 = (m.stamp || "A") + " — " + st.title, l2 = [m.author, m.date].filter(Boolean).join("  ·  "), l3 = m.text || "";
      const wmax = Math.max(textW(l1, true) * big, textW(l2, false) * small, textW(l3, false) * small);
      const x = pts[0][0], y = pts[0][1], W = wmax + 2 * pad, H = pad * 2 + big * 1.15 + (l2 ? small * 1.4 : 0) + (l3 ? small * 1.3 : 0);
      const bw = mmPt(0.7) * U * sc2, inset = bw * 2.2;
      paths.push({ d: rectD([x, y], [x + W, y + H]), stroke: color, w: bw, fill: "#ffffff", op: 0.92 },
                 { d: rectD([x + inset, y + inset], [x + W - inset, y + H - inset]), stroke: color, w: bw * 0.45 });
      let yy = y + pad + big * 0.95;
      texts.push({ t: l1, x: x + pad, y: yy, size: big, bold: true, color });
      if (l2) { yy += small * 1.45; texts.push({ t: l2, x: x + pad, y: yy, size: small, bold: false, color }); }
      if (l3) { yy += small * 1.3; texts.push({ t: l3, x: x + pad, y: yy, size: small, bold: false, color }); }
      break;
    }
    case "dist": {
      const [a, b] = pts, L = dist(a, b) || 1, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, t = mmPt(1.6) * U;
      paths.push({ d: "M" + P(a) + "L" + P(b) + "M" + f(a[0] - nx * t) + " " + f(a[1] - ny * t) + "L" + f(a[0] + nx * t) + " " + f(a[1] + ny * t) +
                      "M" + f(b[0] - nx * t) + " " + f(b[1] - ny * t) + "L" + f(b[0] + nx * t) + " " + f(b[1] + ny * t), stroke: c, w });
      if (sc) label(measureText(m, sc), [(a[0] + b[0]) / 2 + nx * t, (a[1] + b[1]) / 2 + ny * t], c);
      break;
    }
    case "path": {
      if (pts.length < 2) break;
      paths.push({ d: "M" + pts.map(P).join("L"), stroke: c, w, dash: [w * 4, w * 2.2] });
      for (const p of pts) paths.push({ d: rectD([p[0] - w * 1.6, p[1] - w * 1.6], [p[0] + w * 1.6, p[1] + w * 1.6]), fill: c });
      if (sc) label(measureText(m, sc), pts[pts.length - 1], c);
      break;
    }
    case "area": {
      if (pts.length < 2) break;
      paths.push({ d: "M" + pts.map(P).join("L") + "Z", stroke: c, w, fill: c, op: 0.14 });
      if (sc && pts.length > 2) { const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length, cy = pts.reduce((t, p) => t + p[1], 0) / pts.length; label(measureText(m, sc), [cx, cy], c); }
      break;
    }
  }
  return { paths, texts };
}
/* the points of a path the markups write (M L H V A Z, absolute): an arc's
   end with its radius, so that its bulge stays inside the box */
function pathPts(d) {
  const tok = d.match(/[MLHVAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [], out = [];
  let i = 0, c = "M", x = 0, y = 0;
  while (i < tok.length) {
    if (/^[A-Z]$/i.test(tok[i])) { c = tok[i++].toUpperCase(); if (c === "Z") continue; }
    const n = () => +tok[i++];
    if (c === "M" || c === "L") { x = n(); y = n(); out.push([x, y, 0]); }
    else if (c === "H") { x = n(); out.push([x, y, 0]); }
    else if (c === "V") { y = n(); out.push([x, y, 0]); }
    else if (c === "A") { const r = Math.max(n(), n()); i += 3; x = n(); y = n(); out.push([x, y, r]); }
    else i++;
  }
  return out;
}
/* the box of a markup, in page units */
export function boxOf(m, U, sc) {
  const { paths, texts } = prims(m, U, sc);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const p of m.pts) add(p[0], p[1]);
  for (const p of paths) for (const [x, y, r] of pathPts(p.d)) { add(x - r, y - r); add(x + r, y + r); }
  for (const t of texts) { add(t.x, t.y - t.size); add(t.x + textW(t.t, t.bold) * t.size, t.y + t.size * 0.25); }
  return [x0, y0, x1, y1];
}

/* ── on screen ── */
const escX = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export function svgOf(m, U, sc, hit, hair = hit) {
  const { paths, texts } = prims(m, U, sc);
  let s = "";
  /* on a screen a pen of 0.35 mm on a whole A1 sheet is a third of a pixel:
     under each line a hairline of at least 1.2 px keeps it in sight (the PDF
     keeps the true widths) */
  if (hair) for (const p of paths) if (p.stroke) s += '<path d="' + p.d + '" fill="none" stroke="' + p.stroke + '" stroke-width="1.2" vector-effect="non-scaling-stroke"' + (p.dash ? ' stroke-dasharray="4 3"' : "") + ' pointer-events="none"/>';
  /* on screen the markup is caught 12 px around its lines and over its text,
     however thin it is drawn */
  if (hit) {
    for (const p of paths) if (p.stroke) s += '<path d="' + p.d + '" fill="none" stroke="#000" stroke-opacity="0" stroke-width="12" vector-effect="non-scaling-stroke" pointer-events="stroke"/>';
    for (const t of texts) { const w = textW(t.t, t.bold) * t.size; s += '<rect x="' + f(t.x) + '" y="' + f(t.y - t.size) + '" width="' + f(Math.max(w, t.size)) + '" height="' + f(t.size * 1.25) + '" fill="#000" fill-opacity="0" pointer-events="all"/>'; }
  }
  for (const p of paths)
    s += '<path d="' + p.d + '" fill="' + (p.fill || "none") + '"' + (p.op != null ? ' fill-opacity="' + p.op + '"' : "") +
         (p.stroke ? ' stroke="' + p.stroke + '" stroke-width="' + f(p.w) + '" stroke-linecap="round" stroke-linejoin="round"' : "") +
         (p.dash ? ' stroke-dasharray="' + p.dash.map(f).join(" ") + '"' : "") + (p.blend ? ' style="mix-blend-mode:' + p.blend + '"' : "") + "/>";
  for (const t of texts)
    s += '<text x="' + f(t.x) + '" y="' + f(t.y) + '" font-size="' + f(t.size) + '" font-family="dssans, Arimo, Arial, sans-serif"' + (t.bold ? ' font-weight="bold"' : "") +
         ' fill="' + t.color + '" xml:space="preserve">' + escX(t.t) + "</text>";
  return s;
}

/* ── into the PDF ── */
const rgbOf = (PDFLib, hex) => { const n = parseInt(String(hex).slice(1), 16); return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
/* A page's markups onto a pdf-lib page. map = {x, y, a}: a page unit u lands
   at (x + u·a, y − v·a) in PDF points (a = 1/U). fonts = {regular, bold}. */
export function drawPdf(PDFLib, page, marks, U, sc, map, fonts) {
  for (const m of marks) {
    const { paths, texts } = prims(m, U, sc);
    for (const p of paths) {
      const o = { x: map.x, y: map.y, scale: map.a };
      if (p.fill) { o.color = rgbOf(PDFLib, p.fill); o.opacity = p.op ?? 1; }
      if (p.stroke) { o.borderColor = rgbOf(PDFLib, p.stroke); o.borderWidth = p.w * map.a; o.borderLineCap = PDFLib.LineCapStyle.Round; }
      if (p.dash) o.borderDashArray = p.dash.map(v => v * map.a);
      if (p.blend) o.blendMode = PDFLib.BlendMode.Multiply;
      page.drawSvgPath(p.d, o);
    }
    for (const t of texts) {
      if (!t.t) continue;
      page.drawText(t.t, { x: map.x + t.x * map.a, y: map.y - t.y * map.a, size: t.size * map.a, font: t.bold ? fonts.bold : fonts.regular, color: rgbOf(PDFLib, t.color) });
    }
  }
}
