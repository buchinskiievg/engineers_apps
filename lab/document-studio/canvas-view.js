/* canvas-view.js — the preview of a DWG sheet drawn on a canvas, as CAD does.

   The r2 sheet SVG (dwg-render.js) is compiled once into a scene: groups,
   block instances (<use>, shared), paths, circles, rects, texts, pictures —
   each with its box. A frame is then drawn straight onto a 2D canvas for the
   view asked: what lies outside the view is skipped by its box, a block
   instance smaller than half a pixel is skipped, text under a pixel high is
   drawn as a grey bar. Nothing is laid out again by the browser, so a frame
   costs a few milliseconds and the wheel zooms smoothly at any depth.

   Line weights on screen follow AutoCAD: a fixed number of pixels whatever
   the zoom (the .dswNN classes: 0.25 mm and under is 1 px, heavier ~4 px per
   mm); widths that are geometry (wide polylines, text strokes, fills'
   outlines) scale with the drawing. Dashes are in drawing units, as plotted.

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

/* the box of a path's data: points and control points; an arc may bulge up
   to its diameter beyond its end points */
function pathBox(d) {
  const tok = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0, sx = 0, sy = 0, cmd = "M", i = 0;
  const add = (x, y, r = 0) => { if (x - r < x0) x0 = x - r; if (x + r > x1) x1 = x + r; if (y - r < y0) y0 = y - r; if (y + r > y1) y1 = y + r; };
  const num = () => +tok[i++];
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const px = x => rel ? cx + x : x, py = y => rel ? cy + y : y;
    if (C === "Z") { cx = sx; cy = sy; continue; }
    if (i >= tok.length || /[a-zA-Z]/.test(tok[i])) { if (C !== "Z") i++; continue; }
    switch (C) {
      case "M": cx = px(num()); cy = py(num()); sx = cx; sy = cy; add(cx, cy); cmd = rel ? "l" : "L"; break;
      case "L": case "T": cx = px(num()); cy = py(num()); add(cx, cy); break;
      case "H": cx = rel ? cx + num() : num(); add(cx, cy); break;
      case "V": cy = rel ? cy + num() : num(); add(cx, cy); break;
      case "C": { const a = px(num()), b = py(num()), c = px(num()), e = py(num()); add(a, b); add(c, e); cx = px(num()); cy = py(num()); add(cx, cy); break; }
      case "S": case "Q": { const a = px(num()), b = py(num()); add(a, b); cx = px(num()); cy = py(num()); add(cx, cy); break; }
      case "A": { const rx = Math.abs(num()), ry = Math.abs(num()); i += 3; const r = Math.max(rx, ry);
        const ox = cx, oy = cy; cx = px(num()); cy = py(num());
        // the arc lies on its ellipse, whose centre is within r of both ends
        const bx0 = Math.max(Math.min(ox, cx) - r, Math.max(ox, cx) - 2 * r), bx1 = Math.min(Math.max(ox, cx) + r, Math.min(ox, cx) + 2 * r);
        const by0 = Math.max(Math.min(oy, cy) - r, Math.max(oy, cy) - 2 * r), by1 = Math.min(Math.max(oy, cy) + r, Math.min(oy, cy) + 2 * r);
        add(ox, oy); add(cx, cy); add(bx0, by0); add(bx1, by1); break; }
      default: i++;
    }
  }
  return x0 === Infinity ? null : [x0, y0, x1, y1];
}

/* Consecutive plain strokes of one look (colour, weight, dash, ends) become
   one path: a sheet has thousands of short lines and each stroke() is a draw
   call the GPU pays for, while one long path costs about the same as one line.
   The draw order stays as it was; fills are never joined (overlapping fills
   would cancel each other under the fill rules). */
const MERGE_MAX = 256;
function strokeKey(n) {
  const s = n.st;
  if (n.k !== "p" || n.m || !s || s.fill !== "none" || !s.stroke || s.stroke === "none") return null;
  for (const k in s) if (!(k in KEYSET)) return null;
  return s.stroke + "|" + (s._px || 0) + "|" + (s._px ? "" : s["stroke-width"]) + "|" + (s["stroke-dasharray"] || "") + "|" +
    (s["stroke-linecap"] || "") + "|" + (s["stroke-linejoin"] || "") + "|" + (s.opacity || "");
}
const KEYSET = { fill: 1, stroke: 1, "stroke-width": 1, "stroke-dasharray": 1, "stroke-linecap": 1, "stroke-linejoin": 1, opacity: 1, _px: 1 };
function merge(kids) {
  const out = []; let run = null, key = null;
  const flush = () => {
    if (run && run.length > 1) {
      const p = new Path2D(); let bb = null;
      for (const n of run) { p.addPath(n.p2d); bb = union(bb, n.bb); }
      out.push({ k: "p", st: run[0].st, p2d: p, bb, dash: run[0].dash, n: run.length });
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

/* presentation attributes the r2 SVG uses; all inherit the SVG way */
const PROPS = ["fill", "stroke", "stroke-width", "fill-opacity", "fill-rule", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
  "font-family", "font-size", "font-weight", "font-style", "text-anchor", "opacity", "xml:space"];
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

export function compile(svgText) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "svg" || doc.getElementsByTagName("parsererror").length) return null;
  const vb = (root.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || !(vb[2] > 0 && vb[3] > 0)) return null;
  const byId = new Map();
  for (const el of doc.querySelectorAll("[id]")) byId.set(el.getAttribute("id"), el);
  const defs = new Map(), clips = new Map(), images = [], texts = [];
  let bad = null;

  function clipOf(ref) {
    const id = /url\(#([^)]+)\)/.exec(ref || "")?.[1]; if (!id) return null;
    if (clips.has(id)) return clips.get(id);
    const el = byId.get(id); let c = null;
    if (el && el.localName === "clipPath") {
      const p = new Path2D(); let bb = null, rule = "nonzero";
      for (const k of el.children) {
        const s = shapePath(k); if (!s) continue;
        p.addPath(s.p2d, k.getAttribute("transform") ? matrixOf(parseTransform(k.getAttribute("transform"))) : undefined);
        bb = union(bb, k.getAttribute("transform") ? boxOf(parseTransform(k.getAttribute("transform")), s.bb) : s.bb);
        if (k.getAttribute("clip-rule") === "evenodd") rule = "evenodd";
      }
      if (bb) c = { p2d: p, bb, rule };
    }
    clips.set(id, c); return c;
  }
  const matrixOf = M => new DOMMatrix(M);

  function shapePath(el) {
    const n = x => +el.getAttribute(x) || 0;
    switch (el.localName) {
      case "path": { const d = el.getAttribute("d") || ""; const bb = pathBox(d); return bb ? { p2d: new Path2D(d), bb } : null; }
      case "circle": { const cx = n("cx"), cy = n("cy"), r = n("r"); if (!(r > 0)) return null; const p = new Path2D(); p.arc(cx, cy, r, 0, 2 * Math.PI); return { p2d: p, bb: [cx - r, cy - r, cx + r, cy + r] }; }
      case "ellipse": { const cx = n("cx"), cy = n("cy"), rx = n("rx"), ry = n("ry"); if (!(rx > 0 && ry > 0)) return null; const p = new Path2D(); p.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI); return { p2d: p, bb: [cx - rx, cy - ry, cx + rx, cy + ry] }; }
      case "rect": { const x = n("x"), y = n("y"), w = n("width"), h = n("height"); if (!(w > 0 && h > 0)) return null; const p = new Path2D(); p.rect(x, y, w, h); return { p2d: p, bb: [x, y, x + w, y + h] }; }
      case "line": { const p = new Path2D(); p.moveTo(n("x1"), n("y1")); p.lineTo(n("x2"), n("y2")); return { p2d: p, bb: [Math.min(n("x1"), n("x2")), Math.min(n("y1"), n("y2")), Math.max(n("x1"), n("x2")), Math.max(n("y1"), n("y2"))] }; }
      case "polyline": case "polygon": {
        const v = (el.getAttribute("points") || "").split(/[\s,]+/).filter(Boolean).map(Number); if (v.length < 4) return null;
        let d = "M" + v[0] + " " + v[1]; for (let i = 2; i + 1 < v.length; i += 2) d += "L" + v[i] + " " + v[i + 1];
        if (el.localName === "polygon") d += "Z";
        return { p2d: new Path2D(d), bb: pathBox(d) };
      }
    }
    return null;
  }

  function textNode(el) {
    const runs = [];
    const own = ownStyle(el) || {};
    const preserve = (el.getAttribute("xml:space") || el.getAttributeNS("http://www.w3.org/XML/1998/namespace", "space")) === "preserve";
    for (const k of el.childNodes) {
      if (k.nodeType === 3) { if (k.data) runs.push({ t: k.data, st: null }); }
      else if (k.nodeType === 1 && k.localName === "tspan") {
        if (k.hasAttribute("x") || k.hasAttribute("y") || k.hasAttribute("dx") || k.hasAttribute("dy")) bad = bad || "positioned tspan";
        runs.push({ t: k.textContent, st: ownStyle(k) });
      } else if (k.nodeType === 1) bad = bad || "text child " + k.localName;
    }
    if (!preserve) {                                       // the SVG default: collapse white space
      for (const r of runs) r.t = r.t.replace(/[\n\t]/g, " ").replace(/ {2,}/g, " ");
      if (runs.length) { runs[0].t = runs[0].t.replace(/^ +/, ""); runs[runs.length - 1].t = runs[runs.length - 1].t.replace(/ +$/, ""); }
    }
    const list = runs.filter(r => r.t);
    if (!list.length) return null;
    const x = +el.getAttribute("x") || 0, y = +el.getAttribute("y") || 0;
    // a generous box for culling: widths are measured when first drawn
    let size = +(own["font-size"] || 0), chars = 0;
    for (const r of list) { chars += r.t.length; size = Math.max(size, +(r.st?.["font-size"] || 0)); }
    if (!(size > 0)) size = 16;
    const w = chars * size * 0.75;
    const t = { k: "t", st: own, x, y, runs: list, size, w: 0, bb: [x - w - size, y - size * 1.3, x + w + size, y + size * 0.6] };
    texts.push(t); return t;
  }

  function node(el, depth) {
    if (depth > 40) return null;
    const tag = el.localName, m = parseTransform(el.getAttribute("transform"));
    let n = null;
    switch (tag) {
      case "g": case "svg": case "a": {
        const kids = [];
        for (const k of el.children) { const c = node(k, depth + 1); if (c) kids.push(c); }
        const clip = clipOf(el.getAttribute("clip-path"));
        if (!kids.length) return null;
        let bb = null; for (const c of kids) bb = union(bb, c.bb);
        if (clip) bb = bb && [Math.max(bb[0], clip.bb[0]), Math.max(bb[1], clip.bb[1]), Math.min(bb[2], clip.bb[2]), Math.min(bb[3], clip.bb[3])];
        if (!bb || bb[0] > bb[2] || bb[1] > bb[3]) return null;
        n = { k: "g", st: ownStyle(el), kids: merge(kids), clip, bb };
        break;
      }
      case "use": {
        const id = (el.getAttribute("href") || el.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "").replace(/^#/, "");
        let ref = defs.get(id);
        if (ref === undefined) { const t = byId.get(id); defs.set(id, null); ref = t ? node(t, depth + 1) : null; defs.set(id, ref); }
        if (!ref) return null;
        const x = +el.getAttribute("x") || 0, y = +el.getAttribute("y") || 0;
        const mm = x || y ? mul(m || ID, [1, 0, 0, 1, x, y]) : m;
        n = { k: "u", st: ownStyle(el), ref, bb: ref.bb };
        n.m = mm; n.bb = mm ? boxOf(mm, ref.bb) : ref.bb;
        return n;
      }
      case "path": case "circle": case "ellipse": case "rect": case "line": case "polyline": case "polygon": {
        const s = shapePath(el); if (!s) return null;
        const st = ownStyle(el);
        const sw = +(st?.["stroke-width"] || 0);
        n = { k: "p", st, p2d: s.p2d, bb: grow(s.bb, sw / 2), dash: st?.["stroke-dasharray"] ? st["stroke-dasharray"].split(/[\s,]+/).map(Number).filter(v => v >= 0) : null };
        break;
      }
      case "text": n = textNode(el); if (!n) return null; break;
      case "image": {
        const href = el.getAttribute("href") || el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
        const x = +el.getAttribute("x") || 0, y = +el.getAttribute("y") || 0, w = +el.getAttribute("width") || 0, h = +el.getAttribute("height") || 0;
        if (!href || !(w > 0 && h > 0)) return null;
        const img = new Image(); img.decoding = "async"; img.src = href; images.push(img);
        n = { k: "i", st: ownStyle(el), img, x, y, w, h, bb: [x, y, x + w, y + h] };
        break;
      }
      case "style": case "defs": case "clipPath": case "title": case "desc": case "metadata": return null;
      default: bad = bad || "element " + tag; return null;
    }
    if (m) { n.m = m; n.bb = boxOf(m, n.bb); }
    return n;
  }

  const kids = [];
  for (const k of root.children) { const c = node(k, 0); if (c) kids.push(c); }
  if (bad) { console.info("canvas preview: " + bad + " — the SVG preview is used"); return null; }
  let bb = null; for (const c of kids) bb = union(bb, c.bb);
  const top = { k: "g", st: ownStyle(root), kids, clip: null, bb: bb || [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]] };
  return { root: top, page: vb, images, texts, ready: Promise.all(images.map(im => im.decode().catch(() => {}))) };
}

/* ── drawing ── */
const fontOf = (st, px) => (st["font-style"] === "italic" ? "italic " : "") + (st["font-weight"] === "bold" || +st["font-weight"] >= 600 ? "bold " : "") + px + "px " + st["font-family"];
const EM = 100;                                           // text is drawn at 100 px and scaled: small sizes stay exact

/* draw the scene for a view: dpr device pixels per CSS px, s CSS px per unit,
   (x, y) the unit at the top-left corner */
export function draw(ctx, scene, view, W, H, dpr, opts = {}) {
  const t0 = performance.now();
  const V = [view.s * dpr, 0, 0, view.s * dpr, -view.x * view.s * dpr, -view.y * view.s * dpr];
  const DW = W * dpr, DH = H * dpr, PAD = 4 * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = opts.background || "#aaa69d"; ctx.fillRect(0, 0, DW, DH);
  // the sheet of paper
  const pg = scene.page;
  ctx.setTransform(...V); ctx.fillStyle = "#fff"; ctx.fillRect(pg[0], pg[1], pg[2], pg[3]);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = "#8c887f"; ctx.lineWidth = dpr;
  { const b = boxOf(V, [pg[0], pg[1], pg[0] + pg[2], pg[1] + pg[3]]); ctx.strokeRect(Math.round(b[0]) + .5, Math.round(b[1]) + .5, Math.round(b[2] - b[0]), Math.round(b[3] - b[1])); }
  const stats = { drawn: 0, culled: 0, bars: 0 };
  walk(ctx, scene.root, V, ROOT_STYLE, [0, 0, DW, DH], PAD, dpr, stats, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  stats.ms = performance.now() - t0;
  return stats;
}

function walk(ctx, n, M, st, clipR, PAD, dpr, stats, depth) {
  if (n.m) M = mul(M, n.m);
  const own = n.st; if (own) st = inherit(st, own);
  switch (n.k) {
    case "g": {
      let saved = false;
      if (n.clip) {
        const cb = boxOf(M, n.clip.bb);
        clipR = [Math.max(clipR[0], cb[0]), Math.max(clipR[1], cb[1]), Math.min(clipR[2], cb[2]), Math.min(clipR[3], cb[3])];
        if (clipR[0] >= clipR[2] || clipR[1] >= clipR[3]) return;
        ctx.save(); saved = true; ctx.setTransform(...M); ctx.clip(n.clip.p2d, n.clip.rule);
      }
      for (const c of n.kids) visit(ctx, c, M, st, clipR, PAD, dpr, stats, depth);
      if (saved) ctx.restore();
      return;
    }
    case "u": visit(ctx, n.ref, M, st, clipR, PAD, dpr, stats, depth + 1); return;
    case "p": {
      const fill = st.fill, stroke = st.stroke, op = +st.opacity;
      ctx.setTransform(...M);
      ctx.globalAlpha = op;
      if (fill && fill !== "none") { ctx.globalAlpha = op * +st["fill-opacity"]; ctx.fillStyle = fill; ctx.fill(n.p2d, st["fill-rule"] === "evenodd" ? "evenodd" : "nonzero"); ctx.globalAlpha = op; }
      if (stroke && stroke !== "none") {
        const px = st._px, k = scaleOf(M);
        ctx.lineWidth = px ? px * dpr / k : +st["stroke-width"];
        ctx.strokeStyle = stroke; ctx.lineCap = st["stroke-linecap"]; ctx.lineJoin = st["stroke-linejoin"];
        ctx.setLineDash(n.dash && n.dash.some(v => v > 0) ? n.dash : []);
        ctx.stroke(n.p2d);
      }
      stats.drawn++;
      return;
    }
    case "t": return text(ctx, n, M, st, dpr, stats);
    case "i": {
      if (!n.img.complete || !n.img.naturalWidth) return;
      ctx.setTransform(...M); ctx.globalAlpha = +st.opacity; ctx.imageSmoothingQuality = "high";
      ctx.drawImage(n.img, n.x, n.y, n.w, n.h); stats.drawn++;
      return;
    }
  }
}
function visit(ctx, c, M, st, clipR, PAD, dpr, stats, depth) {
  if (depth > 40) return;
  const b = boxOf(M, c.bb);
  if (b[2] < clipR[0] - PAD || b[0] > clipR[2] + PAD || b[3] < clipR[1] - PAD || b[1] > clipR[3] + PAD) { stats.culled++; return; }
  if (c.k !== "p" && b[2] - b[0] < 0.5 && b[3] - b[1] < 0.5) { stats.culled++; return; }   // a block or text under half a pixel
  walk(ctx, c, M, st, clipR, PAD, dpr, stats, depth);
}

function text(ctx, n, M, st, dpr, stats) {
  const M2 = mul(M, [1, 0, 0, 1, n.x, n.y]);
  const k = scaleOf(M2), devSize = n.size * k;
  if (devSize < 0.4) return;
  // measure the runs once (local units), with the fonts as loaded now
  if (!n.w) {
    let x = 0;
    for (const r of n.runs) {
      const rs = r.st ? inherit(st, r.st) : st, size = +rs["font-size"] || n.size;
      ctx.font = fontOf(rs, EM);
      r.w = ctx.measureText(r.t).width * size / EM; r.x = x; x += r.w; r.size = size; r.rs = rs;
    }
    n.w = x || 1e-9;
  }
  const anchor = st["text-anchor"], x0 = anchor === "middle" ? -n.w / 2 : anchor === "end" ? -n.w : 0;
  ctx.globalAlpha = +st.opacity;
  if (devSize < 1) {                                      // under a pixel: a bar where the text is
    ctx.setTransform(...M2);
    ctx.fillStyle = n.runs[0].rs.fill !== "none" ? n.runs[0].rs.fill : "#000";
    ctx.globalAlpha = 0.45 * +st.opacity;
    ctx.fillRect(x0, -n.size * 0.62, n.w, n.size * 0.55);
    stats.bars++; return;
  }
  for (const r of n.runs) {
    const rs = r.st ? inherit(st, r.st) : st, f = r.size / EM;
    ctx.setTransform(...mul(M2, [f, 0, 0, f, x0 + r.x, 0]));
    ctx.font = fontOf(rs, EM); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    if (rs.fill && rs.fill !== "none") { ctx.fillStyle = rs.fill; ctx.fillText(r.t, 0, 0); }
    if (rs.stroke && rs.stroke !== "none") {
      ctx.strokeStyle = rs.stroke; ctx.lineJoin = rs["stroke-linejoin"]; ctx.setLineDash([]);
      ctx.lineWidth = rs._px ? rs._px * dpr / (k * f) : +rs["stroke-width"] / f;
      ctx.strokeText(r.t, 0, 0);
    }
  }
  stats.drawn++;
}

/* forget the text widths (fonts arrived after the first frame) */
export function remeasure(scene) { for (const t of scene.texts) t.w = 0; }
