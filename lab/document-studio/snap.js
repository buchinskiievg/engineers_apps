/* snap.js — object snaps and object snap tracking, as AutoCAD's OSNAP and
   OTRACK, over a page's own geometry.

   The geometry is a page's segments, vertices and circles in page units: a
   DWG sheet's (from its canvas scene), a vector PDF's (from its operator
   list) and the markups already on the page. index() puts it in a grid once;
   find() answers a point under the cursor:

     end   Endpoint       square        the ends and vertices of lines
     int   Intersection   ×             of two segments near the cursor
     cen   Center         circle        of a circle
     mid   Midpoint       triangle      of a segment
     per   Perpendicular  ⊥             foot from the last point on a segment
     nea   Nearest        hourglass     the nearest point of a segment

   in that order of preference (the first three before the others), within
   a radius given in page units. track() does what OTRACK does: from points
   acquired by resting the cursor on them, horizontal and vertical lines and
   the extensions of their segments; the cursor near one is projected onto
   it, near two it takes their intersection. */

const RANK = { end: 0, int: 0, cen: 1, mid: 1, per: 2, nea: 3 };
export const NAMES = { end: "Endpoint", int: "Intersection", cen: "Center", mid: "Midpoint", per: "Perpendicular", nea: "Nearest", track: "Tracking", ext: "Extension", ortho: "Ortho" };

export function index(g) {
  const { pts, segs, circles } = g;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (let i = 0; i + 1 < pts.length; i += 2) add(pts[i], pts[i + 1]);
  for (let i = 0; i + 3 < segs.length; i += 4) { add(segs[i], segs[i + 1]); add(segs[i + 2], segs[i + 3]); }
  if (x0 === Infinity) return null;
  const G = 256, cw = Math.max(x1 - x0, y1 - y0, 1e-9) / G, gx = Math.ceil((x1 - x0) / cw) + 1, gy = Math.ceil((y1 - y0) / cw) + 1;
  const ci = x => Math.max(0, Math.min(gx - 1, Math.floor((x - x0) / cw))), cj = y => Math.max(0, Math.min(gy - 1, Math.floor((y - y0) / cw)));
  const cells = new Map(), long = [];
  const put = (i, j, v) => { const k = j * gx + i; let a = cells.get(k); if (!a) cells.set(k, a = []); a.push(v); };
  for (let i = 0; i + 1 < pts.length; i += 2) put(ci(pts[i]), cj(pts[i + 1]), { p: i });
  for (let s = 0; s + 3 < segs.length; s += 4) {
    const i0 = ci(Math.min(segs[s], segs[s + 2])), i1 = ci(Math.max(segs[s], segs[s + 2])), j0 = cj(Math.min(segs[s + 1], segs[s + 3])), j1 = cj(Math.max(segs[s + 1], segs[s + 3]));
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 600) { long.push(s); continue; }      // a long line: looked at every time
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) put(i, j, { s });
  }
  for (let c = 0; c + 2 < circles.length; c += 3) {
    const r = circles[c + 2];
    for (let j = cj(circles[c + 1] - r); j <= cj(circles[c + 1] + r); j++) for (let i = ci(circles[c] - r); i <= ci(circles[c] + r); i++) put(i, j, { c });
  }
  return { pts, segs, circles, cells, long, x0, y0, cw, gx, gy, ci, cj };
}

const near = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function footOn(s, px, py) {                                      // the nearest point of a segment, t in 0..1
  const dx = s[2] - s[0], dy = s[3] - s[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - s[0]) * dx + (py - s[1]) * dy) / L2)) : 0;
  return [s[0] + dx * t, s[1] + dy * t, t];
}
function crossOf(a, b) {
  const d1x = a[2] - a[0], d1y = a[3] - a[1], d2x = b[2] - b[0], d2y = b[3] - b[1], den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((b[0] - a[0]) * d2y - (b[1] - a[1]) * d2x) / den, u = ((b[0] - a[0]) * d1y - (b[1] - a[1]) * d1x) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return [a[0] + d1x * t, a[1] + d1y * t];
}
/* the best snap near (x, y) within r; extra: {pts, segs} added on the fly
   (the markups); prev: the last point placed, for Perpendicular */
export function find(idx, extra, x, y, r, prev, modes = RANK) {
  const segs = [], pts = [], circ = [];
  if (idx) {
    const { cells, ci, cj, gx } = idx, i0 = ci(x - r), i1 = ci(x + r), j0 = cj(y - r), j1 = cj(y + r);
    const seenS = new Set(), seenC = new Set();
    if ((i1 - i0 + 1) * (j1 - j0 + 1) <= 4000)
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const a = cells.get(j * gx + i); if (!a) continue;
        for (const v of a) {
          if (v.p != null) pts.push(idx.pts[v.p], idx.pts[v.p + 1]);
          else if (v.s != null && !seenS.has(v.s)) { seenS.add(v.s); segs.push(idx.segs.subarray ? idx.segs.subarray(v.s, v.s + 4) : idx.segs.slice(v.s, v.s + 4)); }
          else if (v.c != null && !seenC.has(v.c)) { seenC.add(v.c); circ.push([idx.circles[v.c], idx.circles[v.c + 1], idx.circles[v.c + 2]]); }
        }
      }
    for (const s of idx.long) segs.push(idx.segs.slice(s, s + 4));
  }
  if (extra) { for (let i = 0; i + 1 < extra.pts.length; i += 2) pts.push(extra.pts[i], extra.pts[i + 1]); for (let i = 0; i + 3 < extra.segs.length; i += 4) segs.push(extra.segs.slice(i, i + 4)); }
  let best = null;
  const offer = (px, py, kind, seg) => {
    if (!(kind in modes)) return;
    const d = near(px, py, x, y); if (d > r) return;
    const rank = RANK[kind];
    if (!best || rank < best.rank || (rank === best.rank && d < best.d)) best = { x: px, y: py, kind, d, rank, seg };
  };
  for (let i = 0; i + 1 < pts.length; i += 2) offer(pts[i], pts[i + 1], "end");
  const close = [];
  for (const s of segs) {
    offer(s[0], s[1], "end", s); offer(s[2], s[3], "end", s);
    offer((s[0] + s[2]) / 2, (s[1] + s[3]) / 2, "mid", s);
    const f = footOn(s, x, y);
    if (near(f[0], f[1], x, y) <= r) { close.push(s); offer(f[0], f[1], "nea", s); }
    if (prev) { const q = footOn(s, prev[0], prev[1]); if (q[2] > 0 && q[2] < 1) offer(q[0], q[1], "per", s); }
  }
  for (const c of circ) {
    const d = near(c[0], c[1], x, y);
    if (Math.abs(d - c[2]) <= r || d <= r) offer(c[0], c[1], "cen");
  }
  // intersections of the segments that pass near the cursor
  for (let a = 0; a < close.length && a < 60; a++) for (let b = a + 1; b < close.length && b < 60; b++) {
    const p = crossOf(close[a], close[b]); if (p) offer(p[0], p[1], "int");
  }
  return best;
}

/* OTRACK: acq = [{x, y, dir:[dx,dy]|null}]; tol in page units. The cursor
   near a tracking line is projected onto it; near two, their intersection. */
export function track(acq, x, y, tol) {
  const lines = [];
  for (const a of acq) {
    lines.push({ a, d: [1, 0], kind: "track" }, { a, d: [0, 1], kind: "track" });
    if (a.dir) lines.push({ a, d: a.dir, kind: "ext" });
  }
  const hits = [];
  for (const l of lines) {
    const t = (x - l.a.x) * l.d[0] + (y - l.a.y) * l.d[1], px = l.a.x + l.d[0] * t, py = l.a.y + l.d[1] * t;
    const dist = near(px, py, x, y);
    if (dist <= tol && Math.hypot(px - l.a.x, py - l.a.y) > tol * 0.5) hits.push({ ...l, px, py, dist });
  }
  if (!hits.length) return null;
  hits.sort((p, q) => p.dist - q.dist);
  // two lines of different directions near the cursor: where they cross
  for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) {
    const A = hits[i], B = hits[j], den = A.d[0] * B.d[1] - A.d[1] * B.d[0];
    if (Math.abs(den) < 1e-6 || (A.a === B.a && A.kind === B.kind)) continue;
    const t = ((B.a.x - A.a.x) * B.d[1] - (B.a.y - A.a.y) * B.d[0]) / den, px = A.a.x + A.d[0] * t, py = A.a.y + A.d[1] * t;
    if (near(px, py, x, y) <= tol * 1.5) return { x: px, y: py, kind: "int", lines: [A, B] };
  }
  const h = hits[0];
  return { x: h.px, y: h.py, kind: h.kind, lines: [h] };
}

/* the AutoCAD marker of a snap, as SVG, at (sx, sy) screen px */
export function marker(kind, sx, sy) {
  const s = 6, c = "#1d8a3a", a = 'fill="none" stroke="' + c + '" stroke-width="2"';
  const X = v => (+v).toFixed(1);
  switch (kind) {
    case "end": return '<rect x="' + X(sx - s) + '" y="' + X(sy - s) + '" width="' + 2 * s + '" height="' + 2 * s + '" ' + a + '/>';
    case "mid": return '<path d="M' + X(sx) + ' ' + X(sy - s - 1) + 'L' + X(sx + s + 1) + ' ' + X(sy + s) + 'L' + X(sx - s - 1) + ' ' + X(sy + s) + 'Z" ' + a + '/>';
    case "cen": return '<circle cx="' + X(sx) + '" cy="' + X(sy) + '" r="' + (s + 1) + '" ' + a + '/>';
    case "int": return '<path d="M' + X(sx - s) + ' ' + X(sy - s) + 'L' + X(sx + s) + ' ' + X(sy + s) + 'M' + X(sx + s) + ' ' + X(sy - s) + 'L' + X(sx - s) + ' ' + X(sy + s) + '" ' + a + '/>';
    case "per": return '<path d="M' + X(sx - s) + ' ' + X(sy - s) + 'V' + X(sy + s) + 'H' + X(sx + s) + 'M' + X(sx - s) + ' ' + X(sy) + 'H' + X(sx) + 'V' + X(sy + s) + '" ' + a + '/>';
    case "nea": return '<path d="M' + X(sx - s) + ' ' + X(sy - s) + 'H' + X(sx + s) + 'L' + X(sx - s) + ' ' + X(sy + s) + 'H' + X(sx + s) + 'Z" ' + a + '/>';
    default: return '<path d="M' + X(sx - s) + ' ' + X(sy) + 'H' + X(sx + s) + 'M' + X(sx) + ' ' + X(sy - s) + 'V' + X(sy + s) + '" ' + a + '/>';   // tracking: +
  }
}
