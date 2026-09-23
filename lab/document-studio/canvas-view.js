/* canvas-view.js — the preview of a DWG sheet drawn on a canvas, as CAD does.

   The r2 sheet SVG (dwg-render.js) is compiled once into a scene: groups,
   block instances (<use>, shared), paths, circles, rects, texts, pictures —
   each with its box and its paint resolved (colours, weights, fonts: nothing
   is looked up while drawing). A frame is then drawn straight onto a 2D
   canvas for the view asked: what lies outside the view is skipped by its
   box, a block instance smaller than half a pixel is skipped, text under a
   pixel high is drawn as a grey bar. Nothing is laid out again by the
   browser, so a frame costs a few milliseconds and the wheel zooms smoothly.

   overview() keeps the whole sheet as one picture of up to 4096 px: while
   the view moves and is not zoomed in past that picture's resolution, a
   frame is a copy of it (a heavy sheet seen whole costs ~1 ms, not 30); the
   vectors are drawn when the view stops. Zoomed in, few things are in view
   and the vectors are drawn on every step.

   snapIndex()/snap() find the nearest vertex (ends of lines and arcs,
   polyline and rectangle corners, circle centres) for picking a sheet's
   frame by its corners, as AutoCAD's endpoint snap does.

   Line weights on screen follow AutoCAD: a fixed number of pixels whatever
   the zoom (the .dswNN classes: 0.25 mm and under is one device pixel, heavier
   ~4 px per mm); widths that are geometry (wide polylines, text strokes,
   fills' outlines) scale with the drawing. Dashes are in drawing units, as
   plotted.

   Only the subset dwg-render.js writes is understood; anything else makes
   compile() return null and the page falls back to the SVG in the DOM. */

const ID = [1, 0, 0, 1, 0, 0];
const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const scaleOf = M => Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1e-9;
function boxOf(M, b) {                                   // a box through a matrix, as a box
  const xs = [b[0], b[2], b[0], b[2]], ys = [b[1], b[1], b[3], b[3]];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 4; i++) {
    const x = M[0] * xs[i] + M[2] * ys[i] + M[4], y = M[1] * xs[i] + M[3] * ys[i] + M[5];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}
const union = (a, b) => !a ? b : !b ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const grow = (b, d) => b && [b[0] - d, b[1] - d, b[2] + d, b[3] + d];

function parseTransform(s) {
  if (!s) return null;
  let M = ID;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g; let m;
  while ((m = re.exec(s))) {
    const v = m[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let T;
    switch (m[1]) {
      case "matrix": T = v.length === 6 ? v : ID; break;
      case "translate": T = [1, 0, 0, 1, v[0] || 0, v[1] || 0]; break;
      case "scale": T = [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0]; break;
      case "rotate": {
        const a = (v[0] || 0) * Math.PI / 180, c = Math.cos(a), n = Math.sin(a);
        T = [c, n, -n, c, 0, 0];
        if (v.length > 2) T = mul(mul([1, 0, 0, 1, v[1], v[2]], T), [1, 0, 0, 1, -v[1], -v[2]]);
        break;
      }
      case "skewX": T = [1, 0, Math.tan((v[0] || 0) * Math.PI / 180), 1, 0, 0]; break;
      case "skewY": T = [1, Math.tan((v[0] || 0) * Math.PI / 180), 0, 1, 0, 0]; break;
    }
    M = mul(M, T);
  }
  return M;
}

/* a path's box and its vertices (the snap points). Points and control points
   bound the box; an arc may bulge up to its diameter beyond its end points. */
function pathInfo(d) {
  const tok = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0, sx = 0, sy = 0, cmd = "M", i = 0;
  const pts = [];
  const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  const vtx = (x, y) => { add(x, y); pts.push(x, y); };
  const num = () => +tok[i++];
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const px = x => rel ? cx + x : x, py = y => rel ? cy + y : y;
    if (C === "Z") { cx = sx; cy = sy; continue; }
    if (i >= tok.length || /[a-zA-Z]/.test(tok[i])) { i++; continue; }
    switch (C) {
      case "M": cx = px(num()); cy = py(num()); sx = cx; sy = cy; vtx(cx, cy); cmd = rel ? "l" : "L"; break;
      case "L": case "T": cx = px(num()); cy = py(num()); vtx(cx, cy); break;
      case "H": cx = rel ? cx + num() : num(); vtx(cx, cy); break;
      case "V": cy = rel ? cy + num() : num(); vtx(cx, cy); break;
      case "C": { const a = px(num()), b = py(num()), c = px(num()), e = py(num()); add(a, b); add(c, e); cx = px(num()); cy = py(num()); vtx(cx, cy); break; }
      case "S": case "Q": { const a = px(num()), b = py(num()); add(a, b); cx = px(num()); cy = py(num()); vtx(cx, cy); break; }
      case "A": { const rx = Math.abs(num()), ry = Math.abs(num()); i += 3; const r = Math.max(rx, ry);
        const ox = cx, oy = cy; cx = px(num()); cy = py(num());
        // the arc lies on its ellipse, whose centre is within r of both ends
        add(Math.max(Math.min(ox, cx) - r, Math.max(ox, cx) - 2 * r), Math.max(Math.min(oy, cy) - r, Math.max(oy, cy) - 2 * r));
        add(Math.min(Math.max(ox, cx) + r, Math.min(ox, cx) + 2 * r), Math.min(Math.max(oy, cy) + r, Math.min(oy, cy) + 2 * r));
        vtx(cx, cy); break; }
      default: i++;
    }
  }
  return x0 === Infinity ? null : { bb: [x0, y0, x1, y1], pts };
}

/* presentation attributes the r2 SVG uses; all inherit the SVG way */
const PROPS = ["fill", "stroke", "stroke-width", "fill-opacity", "fill-rule", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
  "font-family", "font-size", "font-weight", "font-style", "text-anchor", "opacity"];
function ownStyle(el) {
  let st = null;
  for (const p of PROPS) { const v = el.getAttribute(p); if (v != null) (st || (st = {}))[p] = v; }
  const cls = el.getAttribute("class"), m = cls && /(?:^|\s)dsw(\d+)(?:\s|$)/.exec(cls);
  if (m) (st || (st = {}))._px = Math.max(1, +m[1] / 100 * 4);           // screen weight, CSS px
  else if (st && "stroke-width" in st) st._px = 0;                        // geometric: drop the inherited class weight
  return st;
}
const inherit = (parent, own) => own ? Object.assign(Object.create(parent), own) : parent;
const ROOT_STYLE = { fill: "#000", stroke: "none", "stroke-width": "1", "fill-opacity": "1", "fill-rule": "nonzero", "stroke-linecap": "butt",
  "stroke-linejoin": "miter", "font-family": "sans-serif", "font-size": "16", "font-weight": "normal", "font-style": "normal",
  "text-anchor": "start", opacity: "1", _px: 0 };
const EM = 100;                                           // text is drawn at 100 px and scaled: small sizes stay exact
const fontOf = st => (st["font-style"] === "italic" ? "italic " : "") + (st["font-weight"] === "bold" || +st["font-weight"] >= 600 ? "bold " : "") + EM + "px " + st["font-family"];
/* what a shape paints, resolved once */
function paintOf(st, dash) {
  const op = +st.opacity, fill = st.fill && st.fill !== "none" ? st.fill : null, stroke = st.stroke && st.stroke !== "none" ? st.stroke : null;
  return { fill, fa: op * +st["fill-opacity"], rule: st["fill-rule"] === "evenodd" ? "evenodd" : "nonzero", stroke, sa: op,
    px: st._px || 0, sw: +st["stroke-width"] || 0, cap: st["stroke-linecap"], join: st["stroke-linejoin"], dash: dash && dash.some(v => v > 0) ? dash : null };
}

/* Consecutive plain strokes of one look (colour, weight, dash, ends) become
   one path: a sheet has thousands of short lines and each stroke() is a draw
   call, while one long path costs about the same as one line. The draw order
   stays as it was; fills are never joined (overlapping fills would cancel
   each other under the fill rules). */
const MERGE_MAX = 256;
function strokeKey(n) {
  const q = n.ps;
  if (n.k !== "p" || n.m || !q || q.fill || !q.stroke) return null;
  return q.stroke + "|" + q.px + "|" + (q.px ? "" : q.sw) + "|" + (q.dash ? q.dash.join(",") : "") + "|" + q.cap + "|" + q.join + "|" + q.sa;
}
function merge(kids) {
  const out = []; let run = null, key = null;
  const flush = () => {
    if (run && run.length > 1) {
      const p = new Path2D(); let bb = null, np = 0;
      for (const n of run) { p.addPath(n.p2d); bb = union(bb, n.bb); np += n.pts ? n.pts.length : 0; }
      const pts = new Float64Array(np); let o = 0;
      for (const n of run) if (n.pts) { pts.set(n.pts, o); o += n.pts.length; }
      out.push({ k: "p", ps: run[0].ps, p2d: p, bb, pts });
    } else if (run) out.push(run[0]);
    run = null; key = null;
  };
  for (const n of kids) {
    const k = strokeKey(n);
    if (k && k === key && run.length < MERGE_MAX) { run.push(n); continue; }
    flush();
    if (k) { run = [n]; key = k; } else out.push(n);
  }
  flush();
  return out;
}

export function compile(svgText) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "svg" || doc.getElementsByTagName("parsererror").length) return null;
  const vb = (root.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || !(vb[2] > 0 && vb[3] > 0)) return null;
  const byId = new Map();
  for (const el of doc.querySelectorAll("[id]")) byId.set(el.getAttribute("id"), el);
  const defs = new Map(), clips = new Map(), images = [], texts = [];
  const base = inherit(ROOT_STYLE, ownStyle(root));
  let bad = null;

  function clipOf(ref) {
    const id = /url\(#([^)]+)\)/.exec(ref || "")?.[1]; if (!id) return null;
    if (clips.has(id)) return clips.get(id);
    const el = byId.get(id); let c = null;
    if (el && el.localName === "clipPath") {
      const p = new Path2D(); let bb = null, rule = "nonzero";
      for (const k of el.children) {
        const s = shapePath(k); if (!s) continue;
        const T = parseTransform(k.getAttribute("transform"));
        p.addPath(s.p2d, T ? new DOMMatrix(T) : undefined);
        bb = union(bb, T ? boxOf(T, s.bb) : s.bb);
        if (k.getAttribute("clip-rule") === "evenodd") rule = "evenodd";
      }
      if (bb) c = { p2d: p, bb, rule };
    }
    clips.set(id, c); return c;
  }

  function shapePath(el) {
    const n = x => +el.getAttribute(x) || 0;
    switch (el.localName) {
      case "path": { const d = el.getAttribute("d") || ""; const q = pathInfo(d); return q ? { p2d: new Path2D(d), bb: q.bb, pts: q.pts } : null; }
      case "circle": { const cx = n("cx"), cy = n("cy"), r = n("r"); if (!(r > 0)) return null; const p = new Path2D(); p.arc(cx, cy, r, 0, 2 * Math.PI); return { p2d: p, bb: [cx - r, cy - r, cx + r, cy + r], pts: [cx, cy] }; }
      case "ellipse": { const cx = n("cx"), cy = n("cy"), rx = n("rx"), ry = n("ry"); if (!(rx > 0 && ry > 0)) return null; const p = new Path2D(); p.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI); return { p2d: p, bb: [cx - rx, cy - ry, cx + rx, cy + ry], pts: [cx, cy] }; }
      case "rect": { const x = n("x"), y = n("y"), w = n("width"), h = n("height"); if (!(w > 0 && h > 0)) return null; const p = new Path2D(); p.rect(x, y, w, h); return { p2d: p, bb: [x, y, x + w, y + h], pts: [x, y, x + w, y, x + w, y + h, x, y + h] }; }
      case "line": { const a = [n("x1"), n("y1"), n("x2"), n("y2")]; const p = new Path2D(); p.moveTo(a[0], a[1]); p.lineTo(a[2], a[3]); return { p2d: p, bb: [Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[0], a[2]), Math.max(a[1], a[3])], pts: a }; }
      case "polyline": case "polygon": {
        const v = (el.getAttribute("points") || "").split(/[\s,]+/).filter(Boolean).map(Number); if (v.length < 4) return null;
        let d = "M" + v[0] + " " + v[1]; for (let i = 2; i + 1 < v.length; i += 2) d += "L" + v[i] + " " + v[i + 1];
        if (el.localName === "polygon") d += "Z";
        const q = pathInfo(d); return { p2d: new Path2D(d), bb: q.bb, pts: q.pts };
      }
    }
    return null;
  }

  function textNode(el, ist) {
    const st = inherit(ist, ownStyle(el));
    const preserve = (el.getAttribute("xml:space") || el.getAttributeNS("http://www.w3.org/XML/1998/namespace", "space")) === "preserve";
    const runs = [];
    for (const k of el.childNodes) {
      if (k.nodeType === 3) { if (k.data) runs.push({ t: k.data, st }); }
      else if (k.nodeType === 1 && k.localName === "tspan") {
        if (k.hasAttribute("x") || k.hasAttribute("y") || k.hasAttribute("dx") || k.hasAttribute("dy")) bad = bad || "positioned tspan";
        runs.push({ t: k.textContent, st: inherit(st, ownStyle(k)) });
      } else if (k.nodeType === 1) bad = bad || "text child " + k.localName;
    }
    if (!preserve) {                                       // the SVG default: collapse white space
      for (const r of runs) r.t = r.t.replace(/[\n\t]/g, " ").replace(/ {2,}/g, " ");
      if (runs.length) { runs[0].t = runs[0].t.replace(/^ +/, ""); runs[runs.length - 1].t = runs[runs.length - 1].t.replace(/ +$/, ""); }
    }
    const list = runs.filter(r => r.t).map(r => {
      const s = r.st, fill = s.fill && s.fill !== "none" ? s.fill : null, stroke = s.stroke && s.stroke !== "none" ? s.stroke : null;
      return { t: r.t, size: +s["font-size"] || 16, font: fontOf(s), fill, stroke, px: s._px || 0, sw: +s["stroke-width"] || 0, join: s["stroke-linejoin"], x: 0, w: 0 };
    });
    if (!list.length) return null;
    const x = +el.getAttribute("x") || 0, y = +el.getAttribute("y") || 0;
    // a generous box for culling: widths are measured when first drawn
    let size = 0, chars = 0;
    for (const r of list) { chars += r.t.length; size = Math.max(size, r.size); }
    const w = chars * size * 0.75;
    const a = st["text-anchor"];
    const t = { k: "t", x, y, runs: list, size, w: 0, anchor: a === "middle" ? 1 : a === "end" ? 2 : 0, op: +st.opacity,
      bar: list[0].fill || list[0].stroke || "#000", bb: [x - w - size, y - size * 1.3, x + w + size, y + size * 0.6] };
    texts.push(t); return t;
  }

  function node(el, depth, ist) {
    if (depth > 40) return null;
    const tag = el.localName, m = parseTransform(el.getAttribute("transform"));
    let n = null;
    switch (tag) {
      case "g": case "svg": case "a": {
        const st = inherit(ist, ownStyle(el)), kids = [];
        for (const k of el.children) { const c = node(k, depth + 1, st); if (c) kids.push(c); }
        const clip = clipOf(el.getAttribute("clip-path"));
        if (!kids.length) return null;
        let bb = null; for (const c of kids) bb = union(bb, c.bb);
        if (clip) bb = bb && [Math.max(bb[0], clip.bb[0]), Math.max(bb[1], clip.bb[1]), Math.min(bb[2], clip.bb[2]), Math.min(bb[3], clip.bb[3])];
        if (!bb || bb[0] > bb[2] || bb[1] > bb[3]) return null;
        n = { k: "g", kids: merge(kids), clip, bb };
        break;
      }
      case "use": {
        // a block is compiled once and shared; the r2 <use> carries no paint
        // of its own, so the block inherits from the sheet (the root) only
        if (ownStyle(el)) bad = bad || "styled use";
        const id = (el.getAttribute("href") || el.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "").replace(/^#/, "");
        let ref = defs.get(id);
        if (ref === undefined) { const t = byId.get(id); defs.set(id, null); ref = t ? node(t, depth + 1, base) : null; defs.set(id, ref); }
        if (!ref) return null;
        const x = +el.getAttribute("x") || 0, y = +el.getAttribute("y") || 0;
        const mm = x || y ? mul(m || ID, [1, 0, 0, 1, x, y]) : m;
        n = { k: "u", ref, m: mm, bb: mm ? boxOf(mm, ref.bb) : ref.bb };
        return n;
      }
      case "path": case "circle": case "ellipse": case "rect": case "line": case "polyline": case "polygon": {
        const s = shapePath(el); if (!s) return null;
        const st = inherit(ist, ownStyle(el));
        const dash = st["stroke-dasharray"] && st["stroke-dasharray"] !== "none" ? st["stroke-dasharray"].split(/[\s,]+/).map(Number).filter(v => v >= 0) : null;
        const ps = paintOf(st, dash);
        n = { k: "p", ps, p2d: s.p2d, pts: s.pts, bb: grow(s.bb, ps.px ? 0 : ps.sw / 2) };
        break;
      }
      case "text": n = textNode(el, ist); if (!n) return null; break;
      case "image": {
        const href = el.getAttribute("href") || el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
        const x = +el.getAttribute("x") || 0, y = +el.getAttribute("y") || 0, w = +el.getAttribute("width") || 0, h = +el.getAttribute("height") || 0;
        if (!href || !(w > 0 && h > 0)) return null;
        const img = new Image(); img.decoding = "async"; img.src = href; images.push(img);
        n = { k: "i", img, x, y, w, h, op: +inherit(ist, ownStyle(el)).opacity, bb: [x, y, x + w, y + h], pts: [x, y, x + w, y, x + w, y + h, x, y + h] };
        break;
      }
      case "style": case "defs": case "clipPath": case "title": case "desc": case "metadata": return null;
      default: bad = bad || "element " + tag; return null;
    }
    if (m) { n.m = m; n.bb = boxOf(m, n.bb); }
    return n;
  }

  const kids = [];
  for (const k of root.children) { const c = node(k, 0, base); if (c) kids.push(c); }
  if (bad) { console.info("canvas preview: " + bad + " — the SVG preview is used"); return null; }
  let bb = null; for (const c of kids) bb = union(bb, c.bb);
  const top = { k: "g", kids, clip: null, bb: bb || [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]] };
  return { root: top, page: vb, images, texts, ov: null, snap: null, ready: Promise.all(images.map(im => im.decode().catch(() => {}))) };
}

/* ── drawing ── */
/* the canvas state last set, so that nothing is set twice in a row */
let S = null;
const resetState = () => { S = { font: "", fill: "", stroke: "", lw: -1, dash: null, a: -1, cap: "", join: "" }; };
const alpha = (ctx, a) => { if (S.a !== a) { ctx.globalAlpha = a; S.a = a; } };
const fillC = (ctx, c) => { if (S.fill !== c) { ctx.fillStyle = c; S.fill = c; } };
const strokeC = (ctx, c) => { if (S.stroke !== c) { ctx.strokeStyle = c; S.stroke = c; } };
const lineW = (ctx, w) => { if (S.lw !== w) { ctx.lineWidth = w; S.lw = w; } };
const dashA = (ctx, d) => { if (S.dash !== d) { ctx.setLineDash(d || []); S.dash = d; } };
const setM = (ctx, M) => ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);

/* draw the scene for a view: dpr device pixels per CSS px, s CSS px per unit,
   (x, y) the unit at the top-left corner */
export function draw(ctx, scene, view, W, H, dpr, opts = {}) {
  const t0 = performance.now();
  const V = [view.s * dpr, 0, 0, view.s * dpr, -view.x * view.s * dpr, -view.y * view.s * dpr];
  const DW = W * dpr, DH = H * dpr;
  paper(ctx, scene, V, DW, DH, dpr, opts);
  resetState();
  const env = { ctx, dpr, pad: 4 * dpr, drawn: 0, bars: 0 };
  walk(env, scene.root, V, 0, 0, DW, DH, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.setLineDash([]);
  return { ms: performance.now() - t0, drawn: env.drawn, bars: env.bars };
}
function paper(ctx, scene, V, DW, DH, dpr, opts) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  ctx.fillStyle = opts.background || "#aaa69d"; ctx.fillRect(0, 0, DW, DH);
  const pg = scene.page, b = boxOf(V, [pg[0], pg[1], pg[0] + pg[2], pg[1] + pg[3]]);
  ctx.fillStyle = "#fff"; ctx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
  ctx.strokeStyle = "#8c887f"; ctx.lineWidth = dpr; ctx.setLineDash([]);
  ctx.strokeRect(Math.round(b[0]) + .5, Math.round(b[1]) + .5, Math.round(b[2] - b[0]), Math.round(b[3] - b[1]));
}

function walk(env, n, M, cx0, cy0, cx1, cy1, depth) {
  if (n.m) M = mul(M, n.m);
  const ctx = env.ctx;
  switch (n.k) {
    case "g": {
      let saved = false;
      if (n.clip) {
        const cb = boxOf(M, n.clip.bb);
        cx0 = Math.max(cx0, cb[0]); cy0 = Math.max(cy0, cb[1]); cx1 = Math.min(cx1, cb[2]); cy1 = Math.min(cy1, cb[3]);
        if (cx0 >= cx1 || cy0 >= cy1) return;
        ctx.save(); saved = true; setM(ctx, M); ctx.clip(n.clip.p2d, n.clip.rule);
      }
      const kids = n.kids, pad = env.pad;
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i], b = c.bb;
        // the child's box on screen, without making arrays
        const a0 = M[0] * b[0], a2 = M[0] * b[2], b0 = M[1] * b[0], b2 = M[1] * b[2];
        const c1 = M[2] * b[1], c3 = M[2] * b[3], d1 = M[3] * b[1], d3 = M[3] * b[3];
        const X0 = Math.min(a0, a2) + Math.min(c1, c3) + M[4], X1 = Math.max(a0, a2) + Math.max(c1, c3) + M[4];
        const Y0 = Math.min(b0, b2) + Math.min(d1, d3) + M[5], Y1 = Math.max(b0, b2) + Math.max(d1, d3) + M[5];
        if (X1 < cx0 - pad || X0 > cx1 + pad || Y1 < cy0 - pad || Y0 > cy1 + pad) continue;
        if (c.k !== "p" && X1 - X0 < 0.5 && Y1 - Y0 < 0.5) continue;     // a block or text under half a pixel
        if (depth < 40) walk(env, c, M, cx0, cy0, cx1, cy1, depth + 1);
      }
      if (saved) { ctx.restore(); resetState(); }
      return;
    }
    case "u": walk(env, n.ref, M, cx0, cy0, cx1, cy1, depth + 1); return;
    case "p": {
      const q = n.ps;
      setM(ctx, M);
      if (q.fill) { alpha(ctx, q.fa); fillC(ctx, q.fill); ctx.fill(n.p2d, q.rule); }
      if (q.stroke) {
        const k = scaleOf(M);
        // screen weights in device pixels; the thinnest stays one device pixel on
        // hi-dpi screens too, as CAD draws it (and as a hairline it is far cheaper)
        alpha(ctx, q.sa); strokeC(ctx, q.stroke);
        lineW(ctx, q.px ? (q.px <= 1 ? 1 : q.px * env.dpr) / k : q.sw);
        if (S.cap !== q.cap) { ctx.lineCap = q.cap; S.cap = q.cap; }
        if (S.join !== q.join) { ctx.lineJoin = q.join; S.join = q.join; }
        dashA(ctx, q.dash);
        ctx.stroke(n.p2d);
      }
      env.drawn++;
      return;
    }
    case "t": return text(env, n, M);
    case "i": {
      if (!n.img.complete || !n.img.naturalWidth) return;
      setM(ctx, M); alpha(ctx, n.op); ctx.imageSmoothingQuality = "high";
      ctx.drawImage(n.img, n.x, n.y, n.w, n.h); env.drawn++;
      return;
    }
  }
}

function text(env, n, M) {
  const ctx = env.ctx;
  const e = M[0] * n.x + M[2] * n.y + M[4], f = M[1] * n.x + M[3] * n.y + M[5];
  const k = scaleOf(M), devSize = n.size * k;
  if (devSize < 0.4) return;
  // measure the runs once (local units), with the fonts as loaded now
  if (!n.w) {
    let x = 0;
    for (const r of n.runs) { ctx.font = r.font; S.font = r.font; r.w = ctx.measureText(r.t).width * r.size / EM; r.x = x; x += r.w; }
    n.w = x || 1e-9;
  }
  const x0 = n.anchor === 1 ? -n.w / 2 : n.anchor === 2 ? -n.w : 0;
  if (devSize < 1) {                                      // under a pixel: a bar where the text is
    ctx.setTransform(M[0], M[1], M[2], M[3], e, f);
    alpha(ctx, 0.45 * n.op); fillC(ctx, n.bar);
    ctx.fillRect(x0, -n.size * 0.62, n.w, n.size * 0.55);
    env.bars++; return;
  }
  alpha(ctx, n.op);
  for (const r of n.runs) {
    const s = r.size / EM, ox = x0 + r.x;
    ctx.setTransform(M[0] * s, M[1] * s, M[2] * s, M[3] * s, e + M[0] * ox, f + M[1] * ox);
    if (S.font !== r.font) { ctx.font = r.font; S.font = r.font; }
    if (r.fill) { fillC(ctx, r.fill); ctx.fillText(r.t, 0, 0); }
    if (r.stroke) {
      strokeC(ctx, r.stroke); if (S.join !== r.join) { ctx.lineJoin = r.join; S.join = r.join; } dashA(ctx, null);
      lineW(ctx, r.px ? r.px * env.dpr / (k * s) : r.sw / s);
      ctx.strokeText(r.t, 0, 0);
    }
  }
  env.drawn++;
}

/* forget the text widths (fonts arrived after the first frame) */
export function remeasure(scene) { for (const t of scene.texts) t.w = 0; scene.ov = null; }

/* ── the sheet as one picture, for frames while the view moves ── */
export function overview(scene, maxPx = 4096) {
  if (scene.ov) return scene.ov;
  const pg = scene.page, k = maxPx / Math.max(pg[2], pg[3]);
  const w = Math.max(1, Math.round(pg[2] * k)), h = Math.max(1, Math.round(pg[3] * k));
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d", { alpha: false });
  // drawn as a view of the page at k pixels per unit, one "CSS" pixel per pixel
  draw(ctx, scene, { s: k, x: pg[0], y: pg[1] }, w, h, 1);
  return (scene.ov = { cv, k });
}
/* a frame from the picture; false when the view is zoomed in past it */
export function blit(ctx, scene, view, W, H, dpr, opts = {}) {
  const ov = scene.ov; if (!ov) return false;
  const k = view.s * dpr;
  if (k > ov.k * 1.25) return false;
  const V = [k, 0, 0, k, -view.x * k, -view.y * k];
  paper(ctx, scene, V, W * dpr, H * dpr, dpr, opts);
  const pg = scene.page;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = k < ov.k ? "medium" : "low";
  ctx.drawImage(ov.cv, (pg[0] - view.x) * k, (pg[1] - view.y) * k, pg[2] * k, pg[3] * k);
  return true;
}

/* ── snapping to vertices ── */
/* every vertex of the scene in page units, in a grid for nearest look-ups */
export function snapIndex(scene, cap = 3e6) {
  if (scene.snap) return scene.snap;
  let buf = new Float64Array(1 << 16), n = 0;
  const push = (x, y) => { if (n + 2 > buf.length) { const b = new Float64Array(buf.length * 2); b.set(buf); buf = b; } buf[n++] = x; buf[n++] = y; };
  (function go(nd, M, depth) {
    if (n >= cap * 2 || depth > 40) return;
    if (nd.m) M = mul(M, nd.m);
    if (nd.k === "g") { for (const c of nd.kids) go(c, M, depth + 1); return; }
    if (nd.k === "u") { go(nd.ref, M, depth + 1); return; }
    const p = nd.pts; if (!p) return;
    for (let i = 0; i + 1 < p.length; i += 2) push(M[0] * p[i] + M[2] * p[i + 1] + M[4], M[1] * p[i] + M[3] * p[i + 1] + M[5]);
  })(scene.root, ID, 0);
  const pg = scene.page, G = 512, cw = Math.max(pg[2], pg[3]) / G || 1;
  const gx = Math.max(1, Math.ceil(pg[2] / cw) + 2), gy = Math.max(1, Math.ceil(pg[3] / cw) + 2);
  const cell = (x, y) => { const i = Math.min(gx - 1, Math.max(0, Math.floor((x - pg[0]) / cw) + 1)), j = Math.min(gy - 1, Math.max(0, Math.floor((y - pg[1]) / cw) + 1)); return j * gx + i; };
  const start = new Int32Array(gx * gy + 1), cnt = n >> 1;
  for (let i = 0; i < cnt; i++) start[cell(buf[2 * i], buf[2 * i + 1]) + 1]++;
  for (let i = 0; i < gx * gy; i++) start[i + 1] += start[i];
  const fillAt = start.slice(0, gx * gy), xy = new Float64Array(cnt * 2);
  for (let i = 0; i < cnt; i++) { const c = cell(buf[2 * i], buf[2 * i + 1]), o = fillAt[c]++; xy[2 * o] = buf[2 * i]; xy[2 * o + 1] = buf[2 * i + 1]; }
  return (scene.snap = { xy, start, gx, gy, cw, x0: pg[0], y0: pg[1], count: cnt });
}
/* the nearest vertex within r page units of (x, y), or null */
export function snap(idx, x, y, r) {
  if (!idx || !idx.count) return null;
  const { xy, start, gx, gy, cw, x0, y0 } = idx;
  const i0 = Math.max(0, Math.floor((x - r - x0) / cw) + 1), i1 = Math.min(gx - 1, Math.floor((x + r - x0) / cw) + 1);
  const j0 = Math.max(0, Math.floor((y - r - y0) / cw) + 1), j1 = Math.min(gy - 1, Math.floor((y + r - y0) / cw) + 1);
  if ((i1 - i0 + 1) * (j1 - j0 + 1) > 40000) return null;           // far zoomed out: no snapping
  let best = null, bd = r * r;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const c = j * gx + i;
    for (let o = start[c]; o < start[c + 1]; o++) {
      const dx = xy[2 * o] - x, dy = xy[2 * o + 1] - y, d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = { x: xy[2 * o], y: xy[2 * o + 1] }; }
    }
  }
  return best;
}
