// IECCalc LAB Document Studio — free DWG engine
// Uses GNU LibreDWG WebAssembly in the browser. No paid API, no DWG upload.
//
// Written against the data model that @mlightcad/libredwg-web 0.7.14 actually
// returns from lib.convert(), checked on a real AutoCAD 2018 (AC1032) drawing:
//
//   db.tables.BLOCK_RECORD.entries   block records, upper-case DXF table names —
//                                    NOT db.tables.blockRecords. Records are named
//                                    *Model_Space, *Paper_Space, *Paper_Space0 …,
//                                    carry a hex `handle` and the handle of their
//                                    LAYOUT object in `layout`.
//   db.entities                      every entity of the drawing, flat. Which
//                                    space it belongs to is ownerBlockRecordSoftId,
//                                    the handle of its block record.
//   db.objects.LAYOUT                layouts, an array inside an object keyed by
//                                    type (db.objects is not an array), with
//                                    layoutName, tabOrder and handle.
//   db.header.EXTMIN / EXTMAX        the drawing extents AutoCAD itself keeps.
//
// The first version of this file read db.tables.blockRecords, found nothing, and
// reported "No Model/Paper Space records were found" for every DWG, however
// valid. It also let dwg_to_svg choose its own view box, which it takes over
// every point in the file: a handful of stray points millions of units away
// turned a 3.8 km route plan into a single pixel.

import { Dwg_File_Type, LibreDwg } from "https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.7.14/dist/libredwg-web.js";
import { makeRenderer, SCREEN_STYLE, setShxEm } from "./dwg-render.js?v=r2d";

// The folder this module lives in, without its trailing slash. (The first
// version had a doubled backslash in this regular expression; the engine read
// "$/" as regex flags and the module failed to load, which took the whole
// studio page down with it — nothing, not even a PDF, could be added.)
const WASM = new URL(".", import.meta.url).href.replace(/\/$/, "");
let probed = null;

/* One engine instance per drawing, not one per page.

   A shared instance keeps state between files that some drawings break: a real
   AutoCAD 2018 route plan read fine the first time, and the second read of the
   same file in the same instance failed with "null function"; after that the
   instance aborted on every file, so the second DWG a user added in a session
   never opened. A fresh instance costs about half a second, and the WASM itself
   is not downloaded again — it is served with an ETag, so the browser only
   revalidates it.

   The file is probed once with HEAD, not GET: a GET with cache:"no-store"
   downloaded all 9.5 MB just to look at the status. */
async function freshEngine() {
  const wasmUrl = WASM + "/libredwg-web.wasm";
  if (!probed) {
    probed = fetch(wasmUrl, { method: "HEAD" }).then(r => {
      if (!r.ok) throw new Error("LibreDWG WASM not available: HTTP " + r.status + " at " + wasmUrl);
    }, () => { /* offline or blocked HEAD: let the library try, and report its own error */ });
    probed.catch(() => { probed = null; });
  }
  await probed;
  return LibreDwg.create(WASM);
}

function svgUrl(svg) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/* ── the pieces of the drawing, whatever shape the library hands them in ── */
function blockRecords(db) {
  const t = db?.tables || {};
  const br = t.BLOCK_RECORD ?? t.blockRecords ?? t.BLOCK_RECORDS;
  if (Array.isArray(br)) return br;
  if (Array.isArray(br?.entries)) return br.entries;
  return [];
}
function layoutObjects(db) {
  const o = db?.objects;
  if (Array.isArray(o)) return o.filter(x => /LAYOUT/i.test(String(x?.type || x?.dxfName || "")));
  return Array.isArray(o?.LAYOUT) ? o.LAYOUT : [];
}
const isModel = br => /^\*Model_Space$/i.test(String(br?.name || ""));
const isPaper = br => /^\*Paper_Space/i.test(String(br?.name || ""));
const ownerOf = e => String(e?.ownerBlockRecordSoftId ?? e?.ownerHandle ?? "");

/* The block records go back into the drawing in the same shape they came out. */
function withRecords(db, recs) {
  const t = db?.tables || {};
  if (t.BLOCK_RECORD && Array.isArray(t.BLOCK_RECORD.entries)) return { ...db, tables: { ...t, BLOCK_RECORD: { ...t.BLOCK_RECORD, entries: recs } } };
  if (Array.isArray(t.BLOCK_RECORD)) return { ...db, tables: { ...t, BLOCK_RECORD: recs } };
  if (Array.isArray(t.blockRecords)) return { ...db, tables: { ...t, blockRecords: recs } };
  return db;
}

/* The same drawing with only one space in it.

   dwg_to_svg does NOT draw from db.entities: it draws from the entities held
   inside the block records, and *Model_Space carries its own copy of every
   model entity. Filtering db.entities alone therefore isolated nothing — every
   paper layout came out as the whole of Model Space in another frame (checked:
   3 084 508 characters of SVG for a layout holding one viewport, against
   3 084 531 for Model). The other spaces are emptied in the block records too.
   Ordinary block definitions stay whole: an INSERT still needs its block.

   And dwg_to_svg puts only *Model_Space on the canvas. Every other record,
   paper spaces included, goes into <defs> as a block definition that nothing
   uses, so a layout's own drawing — frame, title block, notes — never showed:
   the sheet came out as its viewports alone (found 23.09.2026, FEWA PIPING-066:
   0 elements drawn from 148 paper entities). A paper layout is therefore drawn
   by handing its entities to the *Model_Space record for the call; coordinates
   are untouched, they are paper coordinates either way. */
function isolate(db, record, visible) {
  const h = String(record.handle);
  const keep = visible || (() => true);
  const ents = Array.isArray(db?.entities) ? db.entities : [];
  const all = blockRecords(db);
  const model = all.find(isModel);
  const asModel = isPaper(record) && model;
  const own = (record.entities || []).filter(keep);
  const recs = all.map(r => {
    if (asModel && r === model) return { ...r, entities: own };
    if (isModel(r) || isPaper(r)) return String(r.handle) === h && !asModel ? { ...r, entities: own } : { ...r, entities: [] };
    return r;
  });
  let mine = ents.filter(e => ownerOf(e) === h && keep(e));
  if (asModel) mine = mine.map(e => ({ ...e, ownerBlockRecordSoftId: model.handle }));
  return withRecords({ ...db, entities: mine }, recs);
}

/* What AutoCAD does not plot does not go on the sheet: entities on a layer that
   is off, frozen, or marked not to plot (Defpoints always is, and drawings mark
   their own — construction, handrail setting-out, viewport borders). Checked
   on the entities of the space itself; entities nested inside a block keep the
   layer rules the block was drawn with. Per-viewport layer freezing cannot be
   honoured: libredwg-web 0.7.14 does not expose it (frozenLayerIds is empty). */
function layerFilter(db) {
  const hidden = new Set();
  for (const l of (db?.tables?.LAYER?.entries || [])) {
    if (l.frozen || l.off || l.plotFlag === 0 || l.plotFlag === false) hidden.add(String(l.name).toUpperCase());
  }
  return e => !hidden.has(String(e?.layer ?? "0").toUpperCase());
}

/* ── a paper layout is a sheet with windows onto the model ───────────────
   LibreDWG draws paper space as it is: the title block, the frame, the
   viewport rectangles — and nothing inside the rectangles, because what a
   viewport shows is Model Space seen through it. A layout of nothing but
   viewports, which is how most engineering sheets are made, therefore came out
   blank. The sheet is composed here: Model Space is drawn once, and placed into
   every viewport of the layout at that viewport's scale and twist, clipped to
   its rectangle.

   The mapping, with y turned over as in every LibreDWG SVG:
     model view centre  M = targetPoint + displayCenter  (plan view)
     scale              s = viewport height on paper / viewHeight in the model
     paper centre       C = viewportCenter
     SVG transform      translate(Cx, −Cy) scale(s) rotate(twist) translate(−Mx, My)
   The viewport that is the sheet itself (the layout's own, id 1) is skipped, and
   so is a viewport switched off (status bit 0x20000). */
function modelViewports(db, rec, layoutObj) {
  const h = String(rec.handle), own = String(layoutObj?.viewportId || "");
  return (db?.entities || []).filter(e =>
    e?.type === "VIEWPORT" && ownerOf(e) === h &&
    String(e.handle) !== own && e.viewportId !== 1 &&
    !((e.statusBitFlags || 0) & 0x20000) &&
    e.width > 0 && e.height > 0 && e.viewHeight > 0 && e.viewportCenter);
}
function innerOf(svg) {
  const open = svg.search(/<svg\b/);
  const a = open < 0 ? -1 : svg.indexOf(">", open) + 1, b = svg.lastIndexOf("</svg>");
  return a > 0 && b > a ? svg.slice(a, b) : "";
}
/* The model markup carries its own copy of every block definition, under the
   same ids as the sheet's. A <use> resolves to the FIRST element with its id,
   and in the sheet some of those are the emptied copies made by isolate() — so
   the model's ids are given a prefix of their own before it goes in. */
function prefixIds(markup, p) {
  return markup
    .replace(/\bid="([^"]*)"/g, (m, id) => 'id="' + p + id + '"')
    .replace(/\b(xlink:href|href)="#([^"]*)"/g, (m, a, id) => a + '="#' + p + id + '"')
    .replace(/url\(#([^)]*)\)/g, (m, id) => "url(#" + p + id + ")");
}
/* dwg_to_svg writes every block of the drawing into <defs>, whether the sheet
   uses it or not; on the FEWA PIPING-066 sheets 511 of 790 definitions — 74 %
   of a 6 MB SVG — were never referenced. Everything the browser does with a
   sheet (thumbnail, preview, the raster for the PDF) parses and rasterises all
   of it, so the unreferenced ones are dropped: definitions are kept when a
   <use> outside any <defs> reaches them, directly or through other blocks.
   A linear scan over the tags, not a DOM parse: LibreDWG's output is regular,
   and a DOM round trip of 6 MB costs half a second per sheet. */
const TAG = /<(\/?)([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const HREF = /(?:\bhref="#|url\(#)([^")]+)/g;
function pruneDefs(svg) {
  const blocks = [];                // {id, start, end} of every top-level element in a <defs>
  const regions = [];               // [start, end] of every <defs>…</defs>
  let from = 0;
  for (;;) {
    const a = svg.indexOf("<defs", from); if (a < 0) break;
    const open = svg.indexOf(">", a); const b = svg.indexOf("</defs>", open); if (open < 0 || b < 0) break;
    regions.push([a, b + 7]);
    TAG.lastIndex = open + 1;
    let depth = 0, cur = null, m;
    while ((m = TAG.exec(svg)) && m.index < b) {
      const closing = m[1] === "/", self = m[4] === "/" || /\/\s*$/.test(m[3]);
      if (!closing && depth === 0) {
        const id = /\bid="([^"]*)"/.exec(m[3]);
        cur = { id: id ? id[1] : null, start: m.index, end: 0 };
        if (self) { cur.end = TAG.lastIndex; blocks.push(cur); cur = null; continue; }
        depth = 1; continue;
      }
      if (self) continue;
      depth += closing ? -1 : 1;
      if (depth === 0 && cur) { cur.end = TAG.lastIndex; blocks.push(cur); cur = null; }
    }
    from = b + 7;
  }
  if (!blocks.length) return svg;
  const byId = new Map(blocks.filter(x => x.id).map(x => [x.id, x]));
  // what the drawing itself uses: every href outside the <defs> regions
  const want = [];
  let pos = 0;
  for (const [a, b] of regions) { for (const m of svg.slice(pos, a).matchAll(HREF)) want.push(m[1]); pos = b; }
  for (const m of svg.slice(pos).matchAll(HREF)) want.push(m[1]);
  const keep = new Set();
  while (want.length) {
    const id = want.pop(); if (keep.has(id)) continue; keep.add(id);
    const x = byId.get(id); if (!x) continue;
    for (const m of svg.slice(x.start, x.end).matchAll(HREF)) if (!keep.has(m[1])) want.push(m[1]);
  }
  const drop = blocks.filter(x => x.id && !keep.has(x.id)).sort((p, q) => p.start - q.start);
  if (!drop.length) return svg;
  let out = "", at = 0;
  for (const x of drop) { out += svg.slice(at, x.start); at = x.end; }
  return out + svg.slice(at);
}

/* ── MTEXT as AutoCAD sets it ─────────────────────────────────────────────
   LibreDWG splits an MTEXT at its \P paragraph breaks and no further: the word
   wrap at the MTEXT box width is left out, so a title-block line meant to wrap
   into three (FEWA: "FEWA CONTRACT : 14W2011 …", box 73 mm) runs as one line
   across the neighbouring fields. It also puts the first baseline on the
   insertion point whatever the attachment, which lifts top-attached text one
   line out of its box. Every entity is written as <g id="its handle">, so the
   group of each MTEXT is rebuilt from the entity itself: the paragraphs
   LibreDWG produced, wrapped at rectWidth by the browser's own measure of the
   font, lines 5/3 of the text height apart times the line-spacing factor (the
   AutoCAD rule), placed by the attachment point (1…9: top/middle/bottom ×
   left/centre/right), turned by the text direction. */
let measureCtx = null;
function textWidth(str, size) {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  measureCtx.font = "100px Arial, Helvetica, sans-serif";
  return measureCtx.measureText(str).width * size / 100;
}
const unxml = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const toxml = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function wrapLine(line, width, size) {
  if (!(width > 0) || textWidth(line, size) <= width) return [line];
  const words = line.split(/(\s+)/), out = [];
  let cur = "";
  for (const w of words) {
    const next = cur + w;
    if (cur.trim() && textWidth(next.trimEnd(), size) > width) { out.push(cur.trimEnd()); cur = w.trimStart(); }
    else cur = next;
  }
  if (cur.trim()) out.push(cur.trimEnd());
  return out.length ? out : [line];
}
function mtextMap(db) {
  const m = new Map();
  const add = e => { if (e?.type === "MTEXT" && e.handle != null && e.insertionPoint) m.set(String(e.handle), e); };
  (db?.entities || []).forEach(add);
  for (const r of blockRecords(db)) (r.entities || []).forEach(add);
  return m;
}
const MTEXT_GROUP = /<g id="([^"]+)"([^>]*)>((?:\s*<text\b[^>]*>[\s\S]*?<\/text>)+)\s*<\/g>/g;
function setMText(svg, map) {
  if (!map.size) return svg;
  return svg.replace(MTEXT_GROUP, (whole, id, attrs, body) => {
    const e = map.get(id.replace(/^ds\d+-/, "")); if (!e) return whole;
    const texts = [...body.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)];
    if (!texts.length) return whole;
    const size = parseFloat((/font-size="([^"]+)"/.exec(texts[0][1]) || [])[1]) || e.textHeight || 2.5;
    const h = e.textHeight || size;
    const paras = texts.map(t => unxml(t[2]));
    const lines = paras.flatMap(p => wrapLine(p, e.rectWidth, size));
    const ap = Math.min(9, Math.max(1, e.attachmentPoint || 1)), row = Math.floor((ap - 1) / 3), col = (ap - 1) % 3;
    const sp = h * 5 / 3 * (e.lineSpacing > 0 ? e.lineSpacing : 1);
    const H = h + (lines.length - 1) * sp;
    const x = e.insertionPoint.x, y0 = e.insertionPoint.y;
    const first = row === 0 ? y0 - h : row === 1 ? y0 + H / 2 - h : y0 + H - h;
    const anchor = col === 0 ? "start" : col === 1 ? "middle" : "end";
    const dir = e.direction && (e.direction.x || e.direction.y) ? Math.atan2(e.direction.y, e.direction.x) : (e.rotation || 0);
    const deg = dir * 180 / Math.PI;
    let out = "";
    lines.forEach((ln, k) => {
      const y = first - k * sp;
      out += '<text stroke="none" x="' + num(x) + '" y="' + num(y) + '" font-size="' + num(size) + '" text-anchor="' + anchor +
             '" transform="translate(' + num(x) + "," + num(y) + ") scale(1,-1) translate(" + num(-x) + "," + num(-y) + ')">' + toxml(ln) + "</text>";
    });
    if (Math.abs(deg) > 1e-6) out = '<g transform="rotate(' + num(deg) + " " + num(x) + " " + num(y0) + ')">' + out + "</g>";
    return '<g id="' + id + '"' + attrs + ">" + out + "</g>";
  });
}

const num = v => (Number.isFinite(v) ? +v.toFixed(6) : 0);
function composeSheet(paperSvg, modelInner, vps) {
  if (!vps.length || !modelInner) return paperSvg;
  let add = "";
  vps.forEach((v, i) => {
    const cx = v.viewportCenter.x, cy = v.viewportCenter.y, w = v.width, h = v.height;
    const mx = (v.targetPoint?.x || 0) + (v.displayCenter?.x || 0);
    const my = (v.targetPoint?.y || 0) + (v.displayCenter?.y || 0);
    const s = h / v.viewHeight, deg = (v.viewTwistAngle || 0) * 180 / Math.PI;
    const id = "ds-vp-" + i;
    add += '<clipPath id="' + id + '"><rect x="' + num(cx - w / 2) + '" y="' + num(-(cy + h / 2)) +
           '" width="' + num(w) + '" height="' + num(h) + '"/></clipPath>' +
           // data-ds-scale: the print version sets this group's line width to
           // the paper width divided by the viewport scale (see printSvg)
           '<g clip-path="url(#' + id + ')"><g data-ds-scale="' + num(s) + '" transform="translate(' + num(cx) + "," + num(-cy) + ") scale(" + num(s) +
           ") rotate(" + num(deg) + ") translate(" + num(-mx) + "," + num(my) + ')">' +
           prefixIds(modelInner, "ds" + i + "-") + "</g></g>";
  });
  // under the paper space's own drawing, so the title block and frames sit on top
  const open = paperSvg.search(/<svg\b/), at = paperSvg.indexOf(">", open) + 1;
  return paperSvg.slice(0, at) + add + paperSvg.slice(at);
}
/* The sheet is framed on the paper — the layout's limits — and only when those
   are missing on what is drawn: the layout's own extents, then the entities and
   the viewport rectangles themselves. */
function sheetExtents(lo, ents, vps) {
  const box = (a, b) => (a && b && [a.x, a.y, b.x, b.y].every(Number.isFinite) && b.x > a.x && b.y > a.y)
    ? { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y } : null;
  const lim = box(lo?.minLimit, lo?.maxLimit);
  if (lim) return lim;
  const ex = box(lo?.minExtent, lo?.maxExtent);
  if (ex) return ex;
  const e = extentsFor(ents.filter(x => x.type !== "VIEWPORT"), null);
  const r = vps.reduce((acc, v) => {
    const x0 = v.viewportCenter.x - v.width / 2, y0 = v.viewportCenter.y - v.height / 2;
    return { minX: Math.min(acc.minX, x0), minY: Math.min(acc.minY, y0), maxX: Math.max(acc.maxX, x0 + v.width), maxY: Math.max(acc.maxY, y0 + v.height) };
  }, e || { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  return Number.isFinite(r.minX) ? r : null;
}

/* LibreDWG's SVG writer throws on some table objects — an R2000 ACAD_TABLE
   without cell border styles ("reading 'topBorderVisibility'"), and one such
   object takes the whole sheet down with it. The sheet is then drawn again
   without the tables, and the count of what was left out goes to the user. */
const isTable = e => /^(ACAD_TABLE|TABLE)$/i.test(String(e?.type || ""));
/* LibreDWG writes drawing text into the SVG as it is: "Bopp & Reuther",
   "Legends & Notes", "R<=2 Ohm". That is not XML, and an SVG that is not XML
   loads inline in the page (the HTML parser forgives it) but not inside an
   <img> — so every thumbnail and every raster for the PDF came out blank on
   practically any real drawing. The text of each <text> element is escaped
   (the library emits no <tspan>, so a <text> holds plain characters only),
   then any & left bare elsewhere, and the control characters XML forbids are
   dropped. */
const XML_CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
function xmlSafe(svg) {
  return svg
    .replace(XML_CTRL, "")
    .replace(/(<text\b[^>]*>)([\s\S]*?)(<\/text>)/g, (m, open, body, close) =>
      open + body.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + close)
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
}
/* Colour 7 is "white on a dark screen, black on paper" — AutoCAD plots it
   black. LibreDWG writes it as white, which on a white sheet is simply gone:
   title blocks, frames and most of the linework, since colour 7 is the second
   most common colour on every test drawing. */
const WHITE = /\b(stroke|fill)(=")rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)"|\b(stroke|fill)(\s*:\s*)rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/g;
const onPaper = svg => svg.replace(WHITE, (m, a1, s1, a2, s2) => a1 ? a1 + s1 + 'rgb(0,0,0)"' : a2 + s2 + "rgb(0,0,0)");
/* Text is filled, not outlined. LibreDWG writes the entity's colour as both
   stroke and fill on the group around a text, and a text inherits the stroke:
   every letter got an outline as thick as a drawing line, which blurred small
   text into blots on screen and in the PDF alike. */
const unstrokeText = svg => svg.replace(/<text\b/g, '<text stroke="none"');
function drawSvg(lib, iso) {
  const r = drawRaw(lib, iso);
  return { svg: unstrokeText(onPaper(xmlSafe(r.svg))), skippedTables: r.skippedTables };
}
function drawRaw(lib, iso) {
  try { return { svg: lib.dwg_to_svg(iso), skippedTables: 0 }; }
  catch (err) {
    const own = (iso.entities || []).filter(isTable).length;
    let inBlocks = 0;
    const recs = blockRecords(iso).map(r => {
      const kept = (r.entities || []).filter(e => { if (isTable(e)) { inBlocks++; return false; } return true; });
      return { ...r, entities: kept };
    });
    if (!own && !inBlocks) throw err;
    const svg = lib.dwg_to_svg(withRecords({ ...iso, entities: (iso.entities || []).filter(e => !isTable(e)) }, recs));
    return { svg, skippedTables: Math.max(own, inBlocks) };
  }
}

/* ── extents ─────────────────────────────────────────────────────────────
   AutoCAD's own EXTMIN/EXTMAX are used when they describe the entities they
   claim to: at least 90 % of the points must fall inside them. Otherwise — a
   header that was never updated, a layout, a partial file — the extents are
   taken from the points themselves between the 0.5th and 99.5th percentile,
   which is what drops the strays. */
function collectPoints(entities) {
  const xs = [], ys = [];
  const add = p => { if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) { xs.push(p.x); ys.push(p.y); } };
  for (const e of entities) {
    // construction lines are infinite; AutoCAD leaves them out of the extents too
    if (/^(XLINE|RAY)$/i.test(String(e?.type || ""))) continue;
    add(e.startPoint); add(e.endPoint); add(e.center); add(e.insertionPoint); add(e.position);
    add(e.definitionPoint); add(e.textPosition);
    if (Array.isArray(e.vertices)) for (const v of e.vertices) add(v);
    if (Array.isArray(e.controlPoints)) for (const v of e.controlPoints) add(v);
    if (Array.isArray(e.fitPoints)) for (const v of e.fitPoints) add(v);
  }
  return { xs, ys };
}
function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}
function extentsFor(entities, header) {
  const { xs, ys } = collectPoints(entities);
  if (!xs.length) return null;
  const sx = [...xs].sort((a, b) => a - b), sy = [...ys].sort((a, b) => a - b);
  let minX = quantile(sx, 0.005), maxX = quantile(sx, 0.995), minY = quantile(sy, 0.005), maxY = quantile(sy, 0.995);
  if (!(maxX > minX)) { minX -= 1; maxX += 1; }
  if (!(maxY > minY)) { minY -= 1; maxY += 1; }
  const robust = { minX, minY, maxX, maxY, from: "points" };
  /* The header is trusted only when it both holds the drawing (90 % of the
     points inside) and is not far bigger than it (at most three times the
     robust box on each axis). A header can be stale or count infinite
     construction lines: the LibreDWG sample drawings carry EXTMIN/EXTMAX of
     −2.7 million … 0.9 million around geometry 14 000 units across, and passed
     the first test alone. */
  const mn = header?.EXTMIN, mx = header?.EXTMAX;
  if (mn && mx && [mn.x, mn.y, mx.x, mx.y].every(Number.isFinite) && mx.x > mn.x && mx.y > mn.y) {
    let inside = 0;
    for (let i = 0; i < xs.length; i++) if (xs[i] >= mn.x && xs[i] <= mx.x && ys[i] >= mn.y && ys[i] <= mx.y) inside++;
    const notTooBig = (mx.x - mn.x) <= 3 * (maxX - minX) && (mx.y - mn.y) <= 3 * (maxY - minY);
    if (inside / xs.length >= 0.9 && notTooBig) return { minX: mn.x, minY: mn.y, maxX: mx.x, maxY: mx.y, from: "header" };
  }
  return robust;
}

/* dwg_to_svg draws with y turned over (the view box starts at −maxY), and sizes
   the root at 100 % × 100 %. The view box is replaced with the extents, a 2 %
   margin around them, and the root is given the proportions of the drawing so
   that a thumbnail, a preview and a raster all keep its aspect ratio. */
function frame(svg, ext) {
  // nothing to frame — an empty layout — is shown as a blank A3 landscape sheet,
  // which is what it is, rather than as an SVG without a size
  if (!ext) ext = { minX: 0, minY: 0, maxX: 420, maxY: 297 };
  const w = ext.maxX - ext.minX, h = ext.maxY - ext.minY, pad = 0.02;
  const vb = [ext.minX - w * pad, -(ext.maxY + h * pad), w * (1 + 2 * pad), h * (1 + 2 * pad)];
  const vbs = vb.map(v => +v.toFixed(3)).join(" ");
  const ratio = vb[3] / vb[2];
  const W = 1200, H = Math.max(1, Math.round(W * ratio));
  let out = /viewBox="[^"]*"/.test(svg) ? svg.replace(/viewBox="[^"]*"/, 'viewBox="' + vbs + '"')
                                        : svg.replace(/<svg\b/, '<svg viewBox="' + vbs + '"');
  /* The root tag is rebuilt rather than patched: LibreDWG already writes
     width, height and preserveAspectRatio on it, and a second copy of any of
     them makes the SVG invalid XML. Inline in the page the HTML parser forgives
     that; inside an <img> — the thumbnails, the raster for the PDF — it does
     not, and the drawing silently fails to load. */
  out = out.replace(/<svg\b[^>]*>/, tag => tag
    .replace(/\s(width|height|preserveAspectRatio)\s*=\s*("[^"]*"|'[^']*')/g, "")
    .replace(/^<svg\b/, '<svg width="' + W + '" height="' + H + '" preserveAspectRatio="xMidYMid meet" font-family="Arial, Helvetica, sans-serif"'));
  return out;
}

/* What is actually drawn, measured by the browser. Points read off the
   entities overstate it: an INSERT counts at its insertion point, and a block
   whose base point is the origin while its geometry sits kilometres away drags
   the box to the origin — a C107 model 80 units wide came out framed 1 300
   wide, the drawing a speck in one corner. The drawn box is intersected with
   the robust one, which keeps what each is good at: the drawn box is tight,
   the robust box drops strays. Returned in drawing coordinates (y up). */
function drawnBox(svg) {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-100000px;top:0;width:10px;height:10px;overflow:hidden;visibility:hidden";
  try {
    host.innerHTML = svg.replace(/^\s*<\?xml[^>]*>/, "");
    const root = host.querySelector("svg");
    if (!root) return null;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    for (const k of [...root.childNodes]) if (k.nodeName !== "defs") g.appendChild(k);
    root.appendChild(g);
    document.body.appendChild(host);
    const b = g.getBBox();
    if (!(b.width > 0 || b.height > 0)) return null;
    return { minX: b.x, maxX: b.x + b.width, minY: -(b.y + b.height), maxY: -b.y };
  } catch { return null; }
  finally { host.remove(); }
}
function intersect(a, b) {
  if (!a) return b; if (!b) return a;
  const r = { minX: Math.max(a.minX, b.minX), minY: Math.max(a.minY, b.minY), maxX: Math.min(a.maxX, b.maxX), maxY: Math.min(a.maxY, b.maxY) };
  return r.maxX > r.minX && r.maxY > r.minY ? r : b;
}

/* read off the root tag that frame() wrote — a DOM parse of the whole sheet
   cost a quarter of a second per sheet for two numbers */
function meta(svg) {
  const tag = (/<svg\b[^>]*>/.exec(svg) || [""])[0];
  const attr = n => (new RegExp("\\s" + n + '="([^"]*)"').exec(tag) || [])[1] || "";
  const vb = attr("viewBox").trim().split(/[ ,]+/).map(Number);
  const width = parseFloat(attr("width")) || (vb.length === 4 ? vb[2] : null);
  const height = parseFloat(attr("height")) || (vb.length === 4 ? vb[3] : null);
  return { width, height, orientation: width && height && width < height ? "portrait" : "landscape" };
}

/* ── bundled fonts ───────────────────────────────────────────────────────
   Served from fonts/ next to this module (licences in fonts/LICENSES.txt),
   registered with the page for the preview and for measuring text, and
   embedded into the PDF — so a drawing converts the same on every computer. */
const FONT_BASE = new URL("./fonts/", import.meta.url).href;
const FONT_FILES = {
  dssans: { "400": "Arimo_400Regular.ttf", "700": "Arimo_700Bold.ttf", "400i": "Arimo_400Regular_Italic.ttf", "700i": "Arimo_700Bold_Italic.ttf" },
  dsserif: { "400": "Tinos_400Regular.ttf", "700": "Tinos_700Bold.ttf", "400i": "Tinos_400Regular_Italic.ttf", "700i": "Tinos_700Bold_Italic.ttf" },
  dsmono: { "400": "Cousine_400Regular.ttf", "700": "Cousine_700Bold.ttf" },
  dscad: { "400": "osifont.ttf" },
  // metrics of Century Gothic (which was drawn to the metrics of ITC Avant Garde)
  dsgothic: { "400": "URWGothic-Book.ttf", "700": "URWGothic-Demi.ttf", "400i": "URWGothic-BookOblique.ttf", "700i": "URWGothic-DemiOblique.ttf" }
};
function fontFile(fam, bold, italic) {
  const set = FONT_FILES[fam] || FONT_FILES.dssans, w = bold ? "700" : "400";
  return set[w + (italic ? "i" : "")] || set[w] || set["400"];
}
const fontBytes = new Map();
function bytesOf(file) {
  if (!fontBytes.has(file)) fontBytes.set(file, fetch(FONT_BASE + file).then(r => { if (!r.ok) throw new Error("font " + file + ": HTTP " + r.status); return r.arrayBuffer(); }));
  return fontBytes.get(file);
}
const facesLoaded = new Map();                 // "fam|bold|italic" → file
async function ensureFace(fam, bold, italic) {
  const key = fam + "|" + (bold ? 1 : 0) + "|" + (italic ? 1 : 0);
  if (facesLoaded.has(key)) return;
  const file = fontFile(fam, bold, italic);
  facesLoaded.set(key, file);
  try {
    const face = new FontFace(fam, await bytesOf(file), { weight: bold ? "700" : "400", style: italic ? "italic" : "normal" });
    await face.load(); document.fonts.add(face);
  } catch (e) { facesLoaded.delete(key); console.warn(e); }
}
/* which faces a drawing uses: its text styles, and the \f font codes of MTEXT */
function facesNeeded(db) {
  const need = new Set(["dssans|0|0", "dssans|1|0", "dscad|0|0"]);
  const cls = (name, file) => {
    const n = String(name || file || "").toLowerCase();
    if (/\.shx$/.test(n) || (file && !/\.(ttf|ttc|otf)$/i.test(file))) return "dscad";
    if (/gothic|avant/.test(n) && !/franklin|framd/.test(n)) return "dsgothic";
    if (/times|roman|bookman|bookos|georgia|garamond|bell|cambria/.test(n)) return "dsserif";
    if (/cour|consol|mono/.test(n)) return "dsmono";
    return "dssans";
  };
  for (const s of (db?.tables?.STYLE?.entries || [])) {
    const fam = cls(null, s.font); const b = /bd|b\.ttf$/i.test(s.font || ""), it = /i\.ttf$|bi\.ttf$/i.test(s.font || "");
    need.add(fam + "|" + (b ? 1 : 0) + "|" + (it && fam !== "dscad" ? 1 : 0));
  }
  const scan = t => { for (const m of String(t || "").matchAll(/\\f([^|;]*)((?:\|[^;]*)?);/g)) {
    const fam = cls(m[1]); need.add(fam + "|" + (/\|b1/.test(m[2]) ? 1 : 0) + "|" + (/\|i1/.test(m[2]) ? 1 : 0)); } };
  for (const r of blockRecords(db)) for (const e of (r.entities || [])) { if (e.type === "MTEXT") scan(e.text); if (e.attribs) for (const a of e.attribs) scan(a.mtext?.text); }
  return [...need].map(k => { const [f, b, i] = k.split("|"); return [f, b === "1", i === "1"]; });
}
async function ensureFonts(db) {
  await Promise.all(facesNeeded(db).map(([f, b, i]) => ensureFace(f, b, i)));
  // the SHX stand-in is set so that its capitals are as tall as the SHX text
  try {
    const cx = document.createElement("canvas").getContext("2d");
    cx.font = "100px dscad"; const m = cx.measureText("H");
    if (m.actualBoundingBoxAscent > 20) setShxEm(100 / m.actualBoundingBoxAscent);
  } catch {}
}

/* ── the drawing, drawn by dwg-render.js ─────────────────────────────────── */
const ENTITY_SKIP = new Set(["VIEWPORT"]);
function assemble(defs, body, ext, unitMm = 1) {
  if (!ext) ext = { minX: 0, minY: 0, maxX: 420, maxY: 297 };
  const w = ext.maxX - ext.minX, h = ext.maxY - ext.minY, pad = 0.02;
  const vb = [ext.minX - w * pad, -(ext.maxY + h * pad), w * (1 + 2 * pad), h * (1 + 2 * pad)];
  const W = 1200, H = Math.max(1, Math.round(W * vb[3] / vb[2]));
  // paper millimetres across the view, for the screen line weights (SCREEN_STYLE)
  const mmw = vb[2] * unitMm;
  return '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" data-ds="r2" data-mmw="' + num(mmw) + '"' +
    ' style="--ds-pxmm:' + num(W / mmw) + 'px"' +
    ' width="' + W + '" height="' + H + '" viewBox="' + vb.map(v => +v.toFixed(4)).join(" ") + '" preserveAspectRatio="xMidYMid meet"' +
    ' font-family="dssans, Arial, Helvetica, sans-serif" stroke-linecap="round" stroke-linejoin="round">' + SCREEN_STYLE +
    "<defs>" + defs + '</defs><g transform="matrix(1,0,0,-1,0,0)">' + body + "</g></svg>";
}
const sheetUnitMm = ext => (ext && Math.max(ext.maxX - ext.minX, ext.maxY - ext.minY) < 60 ? 25.4 : 1);
function fitA1(ext) {
  const w = ext.maxX - ext.minX, h = ext.maxY - ext.minY, land = w >= h, page = land ? A1 : [A1[1], A1[0]];
  return Math.min(page[0] / w, page[1] / h);
}
/* An OLE object (a pasted logo, a picture) carries a picture of itself for
   display. In the drawings seen so far it is a Windows DIB — a bitmap without
   its file header — inside the OLE stream; it is found by its header, given a
   BMP file header, and turned into a PNG the SVG and the PDF can both use. */
function hexBytes(hex) {
  const n = hex.length >> 1, u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = parseInt(hex.substr(i * 2, 2), 16);
  return u;
}
function dibToBmp(u, maxOffset = Infinity) {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  for (let o = 0; o + 40 < u.length && o <= maxOffset; o++) {
    if (u[o] !== 40 || u[o + 1] || u[o + 2] || u[o + 3]) continue;
    const w = dv.getInt32(o + 4, true), h = dv.getInt32(o + 8, true), planes = dv.getUint16(o + 12, true), bpp = dv.getUint16(o + 14, true), comp = dv.getUint32(o + 16, true);
    if (planes !== 1 || ![1, 4, 8, 16, 24, 32].includes(bpp) || !(comp === 0 || comp === 3) || w < 1 || w > 12000 || !h || Math.abs(h) > 12000) continue;
    const used = dv.getUint32(o + 32, true), pal = (used || (bpp <= 8 ? 1 << bpp : 0)) * 4, masks = comp === 3 ? 12 : 0;
    const pix = Math.floor((bpp * w + 31) / 32) * 4 * Math.abs(h), total = 40 + masks + pal + pix;
    if (o + total > u.length) continue;
    const f = new Uint8Array(14 + total), fv = new DataView(f.buffer);
    f[0] = 0x42; f[1] = 0x4d; fv.setUint32(2, 14 + total, true); fv.setUint32(10, 14 + 40 + masks + pal, true);
    f.set(u.subarray(o, o + total), 14);
    return f;
  }
  return null;
}
/* The OLE data is a Compound File (the container of .doc/.xls), and its
   streams are stored in 512-byte sectors chained through a table — a picture
   cannot be cut out of it in one piece. This reads the streams back whole. */
function readCfb(u, base) {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const u32 = o => dv.getUint32(base + o, true), u16 = o => dv.getUint16(base + o, true);
  const ssz = 1 << u16(0x1e), msz = 1 << u16(0x20), cutoff = u32(0x38);
  const sec = n => base + (n + 1) * ssz;
  const END = 0xfffffffe;
  const difat = [];
  for (let i = 0; i < 109; i++) { const s = u32(0x4c + i * 4); if (s < END) difat.push(s); }
  let dif = u32(0x44), ndif = u32(0x48);
  while (ndif-- > 0 && dif < END) { for (let i = 0; i < ssz / 4 - 1; i++) { const s = dv.getUint32(sec(dif) + i * 4, true); if (s < END) difat.push(s); } dif = dv.getUint32(sec(dif) + ssz - 4, true); }
  const fat = [];
  for (const s of difat) for (let i = 0; i < ssz / 4; i++) fat.push(dv.getUint32(sec(s) + i * 4, true));
  const chain = (start, max = 1e6) => { const out = []; for (let s = start; s < END && out.length < max; s = fat[s]) out.push(s); return out; };
  const readChain = (start, size) => { const out = new Uint8Array(size); let k = 0; for (const s of chain(start)) { const n = Math.min(ssz, size - k); if (n <= 0) break; out.set(u.subarray(sec(s), sec(s) + n), k); k += n; } return out; };
  const dirBytes = []; for (const s of chain(u32(0x30))) dirBytes.push(u.subarray(sec(s), sec(s) + ssz));
  const entries = [];
  for (const blk of dirBytes) for (let o = 0; o + 128 <= blk.length; o += 128) {
    const e = new DataView(blk.buffer, blk.byteOffset + o, 128);
    const nlen = e.getUint16(64, true); if (!nlen) continue;
    let name = ""; for (let i = 0; i < nlen / 2 - 1; i++) name += String.fromCharCode(e.getUint16(i * 2, true));
    entries.push({ name, type: e.getUint8(66), start: e.getUint32(116, true), size: e.getUint32(120, true) });
  }
  const root = entries.find(e => e.type === 5);
  const mini = root ? readChain(root.start, root.size) : new Uint8Array(0);
  const minifat = []; for (const s of chain(u32(0x3c))) for (let i = 0; i < ssz / 4; i++) minifat.push(dv.getUint32(sec(s) + i * 4, true));
  const readMini = (start, size) => { const out = new Uint8Array(size); let k = 0; for (let s = start; s < END && k < size; s = minifat[s]) { const n = Math.min(msz, size - k); out.set(mini.subarray(s * msz, s * msz + n), k); k += n; } return out; };
  const streams = new Map();
  for (const e of entries) if (e.type === 2) streams.set(e.name, e.size < cutoff ? readMini(e.start, e.size) : readChain(e.start, e.size));
  return streams;
}
let metaLibs = null;
async function metafileLibs() {
  if (!metaLibs) metaLibs = (async () => {
    if (!window.EMFJS) await script("https://cdn.jsdelivr.net/npm/rtf.js@3.0.9/dist/EMFJS.bundle.min.js");
    if (!window.WMFJS) await script("https://cdn.jsdelivr.net/npm/rtf.js@3.0.9/dist/WMFJS.bundle.min.js");
  })().catch(e => { metaLibs = null; throw e; });
  return metaLibs;
}
async function svgElToPng(el, w, h) {
  const s = new XMLSerializer().serializeToString(el);
  const im = new Image(); im.src = URL.createObjectURL(new Blob([s], { type: "image/svg+xml" })); await im.decode();
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const x = cv.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
  URL.revokeObjectURL(im.src);
  return cv.toDataURL("image/png");
}
/* Office writes its picture as a WMF that carries the full EMF cut into
   ~8 KB pieces inside comment records (META_ESCAPE / MFCOMMENT, "WMFC").
   The pieces are put back together; the EMF is the better picture. */
function emfFromWmf(p) {
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  for (let h = 0; h + 18 <= p.length && h < 512; h++) {
    const t = dv.getUint16(h, true);
    if (!((t === 1 || t === 2) && dv.getUint16(h + 2, true) === 9 && (dv.getUint16(h + 4, true) === 0x300 || dv.getUint16(h + 4, true) === 0x100))) continue;
    const parts = []; let total = 0, o = h + 18;
    while (o + 6 <= p.length) {
      const words = dv.getUint32(o, true), fn = dv.getUint16(o + 4, true);
      if (words < 3 || fn === 0) break;
      if (fn === 0x0626 && dv.getUint16(o + 6, true) === 0x000f) {
        const d = o + 10;
        if (dv.getUint32(d, true) === 0x43464d57 && dv.getUint32(d + 4, true) === 1) {
          const cur = dv.getUint32(d + 22, true); total = dv.getUint32(d + 30, true);
          parts.push(p.subarray(d + 34, d + 34 + cur));
        }
      }
      o += words * 2;
    }
    if (parts.length && total) {
      const emf = new Uint8Array(total); let k = 0;
      for (const q of parts) { emf.set(q.subarray(0, Math.min(q.length, total - k)), k); k += q.length; if (k >= total) break; }
      if (k >= total) return emf;
    }
    return null;
  }
  return null;
}
/* an EMF (Excel and Word objects paste as one), a WMF, or a DIB → PNG */
/* A pasted logo can be a 4 MB bitmap for a few centimetres of paper. It is
   brought down to 1400 px on its long side — 300 dpi up to 12 cm — and, being
   a bitmap without transparency, stored as JPEG (quality 0.9). */
async function bitmapUrl(bmp) {
  const bm = await createImageBitmap(new Blob([bmp], { type: "image/bmp" }));
  const k = Math.min(1, 1400 / Math.max(bm.width, bm.height));
  const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(bm.width * k)); cv.height = Math.max(1, Math.round(bm.height * k));
  const x = cv.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, cv.width, cv.height); x.imageSmoothingQuality = "high"; x.drawImage(bm, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", 0.9);
}
async function presentationPng(p) {
  // a bitmap presentation: the DIB right after the presentation header
  const early = dibToBmp(p, 64);
  if (early) return bitmapUrl(early);
  /* A WMF is drawn by WMFJS (rtf.js, MIT). The EMF Office hides inside it is
     not used: EMFJS draws Excel's EMF with none of its text (world
     transforms), while the WMF gives the text. Cell fills and grid lines that
     Excel writes as pattern blits (META_DIBBITBLT) are not drawn by WMFJS. */
  {
    const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
    for (let h = 0; h + 18 <= p.length && h < 512; h++) {
      const t = dv.getUint16(h, true);
      if (!((t === 1 || t === 2) && dv.getUint16(h + 2, true) === 9 && (dv.getUint16(h + 4, true) === 0x300 || dv.getUint16(h + 4, true) === 0x100))) continue;
      let ex = 0, ey = 0, o = h + 18;
      while (o + 6 <= p.length) { const words = dv.getUint32(o, true), fn = dv.getUint16(o + 4, true); if (words < 3 || fn === 0) break; if (fn === 0x020c) { ey = Math.abs(dv.getInt16(o + 6, true)); ex = Math.abs(dv.getInt16(o + 8, true)); break; } o += words * 2; }
      if (!(ex > 0 && ey > 0)) break;
      await metafileLibs();
      const k = Math.min(4, 2400 / Math.max(ex, ey)), W = Math.round(ex * k), H = Math.round(ey * k);
      const el = new window.WMFJS.Renderer(p.slice(h).buffer).render({ width: W + "px", height: H + "px", xExt: ex, yExt: ey, mapMode: 8 });
      return svgElToPng(el, W, H);
    }
  }
  const inner = emfFromWmf(p);
  if (inner) p = inner;
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  for (let i = 40; i + 4 <= p.length; i++) {                       // EMF: " EMF" at offset 40 of its header
    if (p[i] === 0x20 && p[i + 1] === 0x45 && p[i + 2] === 0x4d && p[i + 3] === 0x46 && dv.getUint32(i - 40, true) === 1) {
      const st = i - 40, n = Math.min(dv.getUint32(st + 48, true), p.length - st);
      const b = [dv.getInt32(st + 8, true), dv.getInt32(st + 12, true), dv.getInt32(st + 16, true), dv.getInt32(st + 20, true)];
      const w = Math.max(1, b[2] - b[0]), h = Math.max(1, b[3] - b[1]), k = Math.min(4, 2400 / Math.max(w, h));
      await metafileLibs();
      const el = new window.EMFJS.Renderer(p.slice(st, st + n).buffer).render({ width: Math.round(w * k) + "px", height: Math.round(h * k) + "px", wExt: w, hExt: h, xExt: w, yExt: h, mapMode: 8 });
      return svgElToPng(el, Math.round(w * k), Math.round(h * k));
    }
  }
  const bmp = dibToBmp(p);
  if (bmp) return bitmapUrl(bmp);
  for (let i = 0; i + 18 <= p.length; i++) {                       // WMF: placeable key, or a standard header
    const place = dv.getUint32(i, true) === 0x9ac6cdd7;
    const std = !place && (dv.getUint16(i, true) === 1 || dv.getUint16(i, true) === 2) && dv.getUint16(i + 2, true) === 9 && (dv.getUint16(i + 4, true) === 0x300 || dv.getUint16(i + 4, true) === 0x100);
    if (!place && !std) continue;
    await metafileLibs();
    const w = 1600, h = 1200;
    const el = new window.WMFJS.Renderer(p.slice(i).buffer).render({ width: w + "px", height: h + "px", xExt: w, yExt: h, mapMode: 8 });
    return svgElToPng(el, w, h);
  }
  return null;
}
async function decodeOle(db) {
  const jobs = [];
  for (const r of blockRecords(db)) for (const e of (r.entities || [])) {
    if (e.type !== "OLE2FRAME" || !e.binaryData || e._png !== undefined) continue;
    e._png = null;
    jobs.push((async () => {
      try {
        const u = hexBytes(e.binaryData);
        let at = -1;
        for (let i = 0; i + 8 < u.length && i < 4096; i++) if (u[i] === 0xd0 && u[i + 1] === 0xcf && u[i + 2] === 0x11 && u[i + 3] === 0xe0 && u[i + 4] === 0xa1 && u[i + 5] === 0xb1) { at = i; break; }
        if (at >= 0) {
          const streams = readCfb(u, at);
          const pres = [...streams.keys()].filter(n => /OlePres/i.test(n)).sort();
          for (const n of pres) { e._png = await presentationPng(streams.get(n)); if (e._png) return; }
        }
        e._png = await presentationPng(u);                             // no compound file: the raw data
      } catch (err) { console.warn("OLE picture:", err); }
    })());
  }
  await Promise.all(jobs);
}

/* The page a layout plots on. Where its limits are a standard sheet (A4 …
   A0, ANSI A … E) AutoCAD's plot puts the layout origin at the corner of the
   paper: the limits start a few millimetres below zero only to show the
   device's margins (C107: limits −4.2…292.8 × −6.0…204.0 = A4, plotted on
   0…297 × 0…210). Other limits are the page themselves. */
const SHEETS = [[1189, 841], [841, 594], [594, 420], [420, 297], [297, 210], [279.4, 215.9], [431.8, 279.4], [558.8, 431.8], [863.6, 558.8], [1117.6, 863.6]];
function paperFrame(ext) {
  if (!ext) return ext;
  const w = ext.maxX - ext.minX, h = ext.maxY - ext.minY, u = sheetUnitMm(ext);
  for (const [a, b] of SHEETS) for (const [W, H] of [[a, b], [b, a]]) {
    if (Math.abs(w * u - W) < 1.5 && Math.abs(h * u - H) < 1.5 && ext.minX <= 0 && ext.minY <= 0 && ext.minX * u > -30 && ext.minY * u > -30)
      return { minX: 0, minY: 0, maxX: W / u, maxY: H / u };
  }
  return ext;
}

function parseRendered(db) {
  const R = makeRenderer(db);
  const blocks = blockRecords(db);
  const model = blocks.find(isModel), papers = blocks.filter(isPaper);
  const byHandle = new Map(layoutObjects(db).map(l => [String(l.handle), l]));
  const visible = layerFilter(db);
  const layouts = [];
  const modelEnts = (model?.entities || []).filter(e => !ENTITY_SKIP.has(e.type));
  const drawable = modelEnts.filter(visible);
  if (model) {
    const n = drawable.length;
    let ext = n ? extentsFor(drawable, db.header) : null;
    const k = ext ? fitA1(ext) : 1;
    const r = R.render(modelEnts, { s: k, ltK: 1, idp: "m" });
    let svg = assemble(r.defs, r.body, ext, k);
    if (n) { ext = intersect(ext, drawnBox(svg)); svg = assemble(r.defs, r.body, ext, k); }
    const lay = { id: "model", name: "Model", isModel: true, selected: false, empty: n === 0, entityCount: n, skippedTables: 0,
                  recordName: model.name, svg, previewUrl: svgUrl(svg), paper: "Model Space", ext, unitMm: k, sheet: "A1", ...meta(svg) };
    /* A drawing kept only in Model Space has no sheet of its own; the user can
       pick one: a window on the model (two corners, drawing coordinates) and a
       paper size. The model is drawn again for it — only what the window
       holds, at the line widths that paper scale needs — and printed on that
       sheet in the window's orientation. */
    lay.reframe = (win, sheet = "A1") => {
      const w = win.maxX - win.minX, h = win.maxY - win.minY;
      if (!(w > 0 && h > 0)) return false;
      const [a, b] = SHEET_SIZES[sheet] || SHEET_SIZES.A1, page = w >= h ? [a, b] : [b, a];
      const kk = Math.min(page[0] / w, page[1] / h);
      const rr = R.render(modelEnts, { s: kk, ltK: 1, idp: "m", window: [win.minX, win.minY, win.maxX, win.maxY] });
      const s2 = assemble(rr.defs, rr.body, win, kk);
      Object.assign(lay, { svg: s2, previewUrl: svgUrl(s2), ext: { ...win }, unitMm: kk, sheet, framed: true, ...meta(s2) });
      return true;
    };
    /* A new sheet cut out of Model Space: a window picked by two corners, on a
       paper size, drawn at that sheet's scale — one per frame of a drawing
       that keeps several sheets side by side in the model. */
    let cut = 0;
    lay.makeSheet = (win, sheet = "A1") => {
      const w = win.maxX - win.minX, h = win.maxY - win.minY;
      if (!(w > 0 && h > 0)) return null;
      const [a, b] = SHEET_SIZES[sheet] || SHEET_SIZES.A1, page = w >= h ? [a, b] : [b, a];
      const kk = Math.min(page[0] / w, page[1] / h);
      cut++;
      const rr = R.render(modelEnts, { s: kk, ltK: 1, idp: "w" + cut + "_", window: [win.minX, win.minY, win.maxX, win.maxY] });
      // the sheet is exactly the window: what crosses its edge is cut there,
      // as AutoCAD plots a window (the entities are kept or dropped whole)
      const cid = "w" + cut + "_clip";
      const s2 = assemble(rr.defs + '<clipPath id="' + cid + '" clipPathUnits="userSpaceOnUse"><rect x="' + num(win.minX) + '" y="' + num(win.minY) +
        '" width="' + num(w) + '" height="' + num(h) + '"/></clipPath>', '<g clip-path="url(#' + cid + ')">' + rr.body + "</g>", win, kk);
      return { id: "model-sheet-" + cut, name: "Model sheet " + cut, isModel: true, selected: true, empty: false, entityCount: n, skippedTables: 0,
               recordName: model.name, svg: s2, previewUrl: svgUrl(s2), paper: "Model Space · window", ext: { ...win }, unitMm: kk, sheet, framed: true, ...meta(s2) };
    };
    lay.resetFrame = () => { const r0 = R.render(modelEnts, { s: k, ltK: 1, idp: "m" }); Object.assign(lay, { svg: assemble(r0.defs, r0.body, ext, k), ext, unitMm: k, sheet: "A1", framed: false }); lay.previewUrl = svgUrl(lay.svg); Object.assign(lay, meta(lay.svg)); return true; };
    layouts.push(lay);
  }
  const ordered = papers.map(br => ({ br, lo: byHandle.get(String(br.layout)) })).sort((a, b) => (a.lo?.tabOrder ?? 999) - (b.lo?.tabOrder ?? 999));
  ordered.forEach(({ br, lo }, i) => {
    const vps = modelViewports(db, br, lo);
    const own = (br.entities || []).filter(e => !ENTITY_SKIP.has(e.type));
    const n = own.filter(visible).length + (drawable.length ? vps.length : 0);
    const ext = n ? paperFrame(sheetExtents(lo, own, vps)) : null;
    const u = sheetUnitMm(ext);
    let defs = "", body = "";
    // the model through each viewport, under the sheet's own drawing; only
    // what the viewport's window can show is drawn (a sheet of seven
    // viewports on one model used to carry the whole model seven times)
    vps.forEach((v, j) => {
      const s = v.height / v.viewHeight;
      const cx = v.viewportCenter.x, cy = v.viewportCenter.y, w = v.width, h = v.height;
      const mx = (v.targetPoint?.x || 0) + (v.displayCenter?.x || 0), my = (v.targetPoint?.y || 0) + (v.displayCenter?.y || 0);
      const tw = v.viewTwistAngle || 0, hw = w / 2 / s, hh = h / 2 / s;
      const ax = Math.abs(Math.cos(tw)) * hw + Math.abs(Math.sin(tw)) * hh, ay = Math.abs(Math.sin(tw)) * hw + Math.abs(Math.cos(tw)) * hh;
      const r = R.render(modelEnts, { s: u * s, ltK: R.PSLTSCALE ? 1 / s : 1, idp: "v" + j + "_", window: [mx - ax * 1.02, my - ay * 1.02, mx + ax * 1.02, my + ay * 1.02] });
      const deg = tw * 180 / Math.PI, id = "vpc" + j;
      defs += r.defs + '<clipPath id="' + id + '" clipPathUnits="userSpaceOnUse"><rect x="' + num(cx - w / 2) + '" y="' + num(cy - h / 2) + '" width="' + num(w) + '" height="' + num(h) + '"/></clipPath>';
      body += '<g clip-path="url(#' + id + ')"><g transform="translate(' + num(cx) + "," + num(cy) + ") scale(" + num(s) + ")" + (deg ? " rotate(" + num(deg) + ")" : "") +
              " translate(" + num(-mx) + "," + num(-my) + ')">' + r.body + "</g></g>";
    });
    const p = R.render(own, { s: u, ltK: 1, idp: "p" });
    defs += p.defs; body += p.body;
    const svg = assemble(defs, body, ext, u);
    layouts.push({ id: "layout-" + i, name: lo?.layoutName || lo?.name || ("Layout " + (i + 1)), isModel: false,
                   selected: n > 0, empty: n === 0, entityCount: n, viewports: vps.length, skippedTables: 0,
                   recordName: br.name, svg, previewUrl: svgUrl(svg), paper: "Paper Space", ext, unitMm: u, ...meta(svg) });
  });
  const paperWithContent = layouts.filter(l => !l.isModel && !l.empty).length;
  const modelOnly = !!model && paperWithContent === 0 && !layouts[0]?.empty;
  if (modelOnly) layouts[0].selected = true;
  return { layouts, modelOnly, renderer: "r2" };
}

/* Draw order. AutoCAD draws a space's entities in the order of their handles
   unless a SORTENTSTABLE (DRAWORDER) gives some of them another sort handle —
   which is how a white hatch behind a symbol stays behind its lines (Senan:
   the breaker symbols, whose fills covered their own lines when drawn in file
   order). libredwg-web does not convert these tables; they are read here from
   the LibreDWG objects directly, while the drawing is still in memory. */
function readDrawOrder(lib, ptr) {
  const out = new Map();                       // block record handle (hex) → Map(entity hex → sort key)
  try {
    const n = lib.dwg_get_num_objects(ptr);
    for (let i = 0; i < n; i++) {
      const o = lib.dwg_get_object(ptr, i);
      if (lib.dwg_object_get_fixedtype(o) !== 714) continue;        // DWG_TYPE_SORTENTSTABLE
      const t = lib.dwg_object_to_object_tio(o);
      const num = lib.dwg_dynapi_entity_data(t, "num_ents");
      if (!(num > 0)) continue;
      const owner = lib.dwg_ref_get_absref(lib.dwg_dynapi_entity_data(t, "block_owner"));
      const ents = lib.dwg_ptr_to_object_ref_ptr_array(lib.dwg_dynapi_entity_data(t, "ents"), num);
      const sorts = lib.dwg_ptr_to_object_ref_ptr_array(lib.dwg_dynapi_entity_data(t, "sort_ents"), num);
      const m = new Map();
      for (let k = 0; k < num; k++) {
        const e = lib.dwg_ref_get_absref(ents[k]), s = lib.dwg_ref_get_absref(sorts[k]);
        if (e != null && s != null) m.set(BigInt(e).toString(16).toUpperCase(), BigInt(s));
      }
      if (owner != null) out.set(BigInt(owner).toString(16).toUpperCase(), m);
    }
  } catch (err) { console.warn("draw order not read:", err); }
  return out;
}
function applyDrawOrder(db, order) {
  if (!order.size) return;
  const key = (m, h) => { const s = String(h || "0"); return m.get(s.toUpperCase()) ?? (/^[0-9a-f]+$/i.test(s) ? BigInt("0x" + s) : 0n); };
  for (const r of blockRecords(db)) {
    const m = order.get(String(r.handle).toUpperCase());
    if (!m || !Array.isArray(r.entities)) continue;
    r.entities = r.entities.map((e, i) => [e, key(m, e.handle), i]).sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[2] - b[2])).map(x => x[0]);
  }
}

export async function parseDwg(file) {
  const lib = await freshEngine();
  const ptr = lib.dwg_read_data(await file.arrayBuffer(), Dwg_File_Type.DWG);
  if (!ptr) throw new Error("LibreDWG could not open this DWG.");
  let db, order = new Map();
  try { db = lib.convert(ptr); order = readDrawOrder(lib, ptr); } finally { try { lib.dwg_free(ptr); } catch {} }
  applyDrawOrder(db, order);
  if (!blockRecords(db).some(b => isModel(b) || isPaper(b))) {
    const tables = Object.keys(db?.tables || {}).join(", ") || "none";
    throw new Error("No Model/Paper Space block records in this DWG (tables found: " + tables + ").");
  }
  await ensureFonts(db);
  await decodeOle(db);
  try { return parseRendered(db); }
  catch (err) { console.warn("studio renderer failed, falling back to LibreDWG's SVG:", err); return parseLegacy(lib, db); }
}

/* LibreDWG's own SVG writer, kept as the fallback */
function parseLegacy(lib, db) {

  const blocks = blockRecords(db);
  const model = blocks.find(isModel);
  const papers = blocks.filter(isPaper);
  const layoutObjs = layoutObjects(db);
  const byHandle = new Map(layoutObjs.map(l => [String(l.handle), l]));
  const ents = Array.isArray(db?.entities) ? db.entities : [];
  const countOf = rec => ents.reduce((n, e) => n + (ownerOf(e) === String(rec.handle) ? 1 : 0), 0);

  if (!model && !papers.length) {
    const tables = Object.keys(db?.tables || {}).join(", ") || "none";
    throw new Error("No Model/Paper Space block records in this DWG (tables found: " + tables + ").");
  }

  const visible = layerFilter(db);
  const mtexts = mtextMap(db);
  const layouts = [];
  // Model Space is drawn once: as its own sheet, and as what every viewport shows
  let modelInner = "";
  if (model) {
    const iso = isolate(db, model, visible);
    const n = iso.entities.length;
    const drawn = drawSvg(lib, iso);
    const lean = pruneDefs(setMText(drawn.svg, mtexts));
    modelInner = n ? innerOf(lean) : "";
    const ext = n ? intersect(extentsFor(iso.entities, db.header), drawnBox(lean)) : null;
    const svg = frame(lean, ext);
    layouts.push({ id:"model", name:"Model", isModel:true, selected:false, empty:n===0, entityCount:n, skippedTables:drawn.skippedTables,
                   recordName:model.name, svg, previewUrl:svgUrl(svg), paper:"Model Space", ext, ...meta(svg) });
  }
  // paper layouts in the order of their tabs in AutoCAD
  const papersOrdered = papers.map(br => ({ br, lo: byHandle.get(String(br.layout)) }))
    .sort((a, b) => (a.lo?.tabOrder ?? 999) - (b.lo?.tabOrder ?? 999));
  papersOrdered.forEach(({ br, lo }, i) => {
    const vps = modelViewports(db, br, lo);
    const iso = isolate(db, br, visible);
    // a viewport counts as content only when there is a model for it to show
    const own = iso.entities.filter(e => e.type !== "VIEWPORT").length;
    const n = own + (modelInner ? vps.length : 0);
    const drawn = drawSvg(lib, iso);
    const sheet = pruneDefs(composeSheet(setMText(drawn.svg, mtexts), modelInner, vps));
    // an empty layout still gets a sheet, framed on nothing, so it can be seen as empty
    const ext = n ? sheetExtents(lo, iso.entities, vps) : null;
    const svg = frame(sheet, ext);
    layouts.push({ id:"layout-"+i, name: lo?.layoutName || lo?.name || ("Layout " + (i + 1)), isModel:false,
                   selected: n > 0, empty: n === 0, entityCount: n, viewports: vps.length, skippedTables: drawn.skippedTables,
                   recordName:br.name, svg, previewUrl:svgUrl(svg), paper:"Paper Space", ext, ...meta(svg) });
  });

  /* A drawing kept entirely in Model Space — every paper layout empty — is the
     common case for route plans and proposal layouts. Leaving Model off by
     default would hand the engineer an empty page, so the caller is told. */
  const paperWithContent = layouts.filter(l => !l.isModel && !l.empty).length;
  const modelOnly = !!model && paperWithContent === 0 && !layouts[0].empty;
  if (modelOnly) layouts[0].selected = true;
  return { layouts, modelOnly };
}

/* ── the sheet as a vector PDF page ──────────────────────────────────────
   The PDF used to get a 4000 px raster of the sheet stretched over an A1 page:
   about 120 dpi, soft lines and unreadable small text. The sheet now goes in as
   vectors — lines, arcs, hatches and text stay lines, arcs, hatches and text —
   on a page of the sheet's own size, by svg2pdf.js on jsPDF (MIT, in the
   browser, no service, no limits).

   Line weight. On screen LibreDWG's stroke-width of 0.1 % of the view is kept:
   it reads well at any zoom. On paper a line has a width in millimetres. The
   library does not give per-entity lineweights, so every line gets one plot
   width, PRINT_LW, on the paper; inside a viewport that is divided by the
   viewport's scale, because the model is drawn there in model units.

   Paper units. LAYOUT carries no plot settings in this library; the limits are
   taken as millimetres (297 × 210 for A4, 841 × 594 for A1 come out as such),
   and a sheet smaller than 60 units across is taken to be in inches. Model
   Space, which has no paper, is fitted onto A1 in its own orientation. */
const PRINT_LW = 0.18;                       // mm on paper
const A1 = [841, 594];
const SHEET_SIZES = { A0: [1189, 841], A1: [841, 594], A2: [594, 420], A3: [420, 297], A4: [297, 210] };
function printGeometry(layout) {
  const e = layout.ext || { minX: 0, minY: 0, maxX: 420, maxY: 297 };
  const w = e.maxX - e.minX, h = e.maxY - e.minY;
  if (layout.isModel) {
    const sz = SHEET_SIZES[layout.sheet] || A1;
    const land = w >= h, page = land ? sz : [sz[1], sz[0]];
    const k = Math.min(page[0] / w, page[1] / h);           // mm per drawing unit
    return { e, pageW: page[0], pageH: page[1], unitMm: k, fitted: true };
  }
  const unitMm = Math.max(w, h) < 60 ? 25.4 : 1;
  /* limits a little off a standard sheet (FEWA: 878 × 620 for an A1) are
     fitted onto that sheet, as AutoCAD plotted them (scale 0.958) */
  const W = w * unitMm, H = h * unitMm;
  for (const [a, b] of SHEETS) { const [sw, sh] = W >= H ? [a, b] : [b, a]; const k = Math.min(sw / W, sh / H);
    if (k < 0.999 && k > 0.88 && Math.abs(W / H - sw / sh) < 0.03) return { e, pageW: sw, pageH: sh, unitMm, fitted: true }; }
  return { e, pageW: W, pageH: H, unitMm, fitted: false };
}
/* <use> of a block definition → the definition itself, in place */
function inlineUses(svg) {
  const defs = new Map();
  for (const m of svg.matchAll(/<g id="([^"]+)">/g)) {
    const start = m.index, open = start + m[0].length;
    let depth = 1, i = open; const re = /<(\/?)g\b[^>]*?(\/?)>/g; re.lastIndex = open; let t;
    while (depth && (t = re.exec(svg))) { if (t[2] === "/") continue; depth += t[1] ? -1 : 1; i = re.lastIndex; }
    defs.set(m[1], svg.slice(open, i - 4));
  }
  const expand = (s, depth) => depth > 20 ? s : s.replace(/<use href="#([^"]+)"(?: transform="([^"]*)")?\/>/g, (m, id, tr) => {
    const body = defs.get(id); if (body == null) return m;
    return "<g" + (tr ? ' transform="' + tr + '"' : "") + ">" + expand(body, depth + 1) + "</g>";
  });
  const a = svg.indexOf("</defs>");
  return svg.slice(0, a) + expand(svg.slice(a), 0);
}
export function printSvg(layout) {
  const g = printGeometry(layout), lw = PRINT_LW / g.unitMm; // in drawing units
  let s = layout.svg;
  if (/<svg\b[^>]*data-ds="r2"/.test(s)) {
    // the studio renderer writes plotted widths already; only the screen style goes
    s = s.replace(/<style id="ds-screen">[\s\S]*?<\/style>/, "");
    /* blocks are placed in the PDF as drawings in place, not as <use>: svg2pdf
       turns a <use> into a PDF form whose box it computes from the untransformed
       content, and a block turned inside another (C107's north arrow, 236°)
       got a box of zero size and was clipped away entirely. Same file size. */
    s = inlineUses(s);
    const e = g.e, vb = [e.minX, -e.maxY, e.maxX - e.minX, e.maxY - e.minY].map(v => +v.toFixed(4)).join(" ");
    s = s.replace(/<svg\b[^>]*>/, tag => tag
      .replace(/\s(width|height|viewBox)\s*=\s*("[^"]*"|'[^']*')/g, "")
      .replace(/^<svg\b/, '<svg width="' + num(g.pageW) + 'mm" height="' + num(g.pageH) + 'mm" viewBox="' + vb + '"'));
    return { svg: s, pageW: g.pageW, pageH: g.pageH };
  }
  // one line width for everything, set on the root; viewports get theirs
  s = s.replace(/\sstroke-width="0\.1%"/g, "");
  s = s.replace(/<g data-ds-scale="([^"]+)"/g, (m, k) => '<g stroke-width="' + num(lw / (+k || 1)) + '"');
  const e = g.e, vb = [e.minX, -e.maxY, e.maxX - e.minX, e.maxY - e.minY].map(v => +v.toFixed(4)).join(" ");
  s = s.replace(/<svg\b[^>]*>/, tag => tag
    .replace(/\s(width|height|viewBox|preserveAspectRatio|font-family|stroke-width|stroke-linecap|stroke-linejoin)\s*=\s*("[^"]*"|'[^']*')/g, "")
    .replace(/^<svg\b/, '<svg width="' + num(g.pageW) + 'mm" height="' + num(g.pageH) + 'mm" viewBox="' + vb +
      '" preserveAspectRatio="xMidYMid meet" stroke-width="' + num(lw) + '" stroke-linecap="round" stroke-linejoin="round"' +
      ' font-family="Helvetica, Arial, sans-serif"'));
  return { svg: s, pageW: g.pageW, pageH: g.pageH };
}

let pdfLibs = null;
function script(src) {
  return new Promise((ok, bad) => { const el = document.createElement("script"); el.src = src; el.onload = ok; el.onerror = () => bad(new Error("could not load " + src)); document.head.appendChild(el); });
}
async function vectorLibs() {
  if (!pdfLibs) pdfLibs = (async () => {
    if (!window.jspdf) await script("https://cdn.jsdelivr.net/npm/jspdf@3.0.3/dist/jspdf.umd.min.js");
    if (!window.svg2pdf) await script("https://cdn.jsdelivr.net/npm/svg2pdf.js@2.8.1/dist/svg2pdf.umd.min.js");
    return { jsPDF: window.jspdf.jsPDF };
  })().catch(e => { pdfLibs = null; throw e; });
  return pdfLibs;
}
function b64(buf) {
  const u = new Uint8Array(buf); let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
/* Every bundled face the sheets use goes into the PDF once, under the family
   name the SVG carries, so svg2pdf sets the text in it. */
async function embedFonts(doc, svgs) {
  const used = new Set();
  for (const s of svgs) for (const m of s.matchAll(/font-family="(ds[a-z]+)/g)) used.add(m[1]);
  used.add("dssans");
  const styles = [["normal", false, false], ["bold", true, false], ["italic", false, true], ["bolditalic", true, true]];
  for (const fam of used) {
    const added = new Set();
    for (const [style, bold, italic] of styles) {
      const file = fontFile(fam, bold, italic);
      if (!added.has(file)) { doc.addFileToVFS(file, b64(await bytesOf(file))); added.add(file); }
      doc.addFont(file, fam, style);
    }
  }
}
/* Sheets → one vector PDF, a page per sheet in the order given. One jsPDF
   document for all of them, so each font is embedded once, not once a page. */
export async function sheetsPdf(layouts) {
  const { jsPDF } = await vectorLibs();
  const prints = layouts.map(printSvg);
  const first = prints[0];
  const doc = new jsPDF({ unit: "mm", format: [first.pageW, first.pageH], orientation: first.pageW >= first.pageH ? "landscape" : "portrait", compress: true });
  await embedFonts(doc, prints.map(p => p.svg));
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-100000px;top:0;width:10px;height:10px;overflow:hidden;visibility:hidden";
  document.body.appendChild(host);
  try {
    for (let i = 0; i < prints.length; i++) {
      const p = prints[i];
      if (i) doc.addPage([p.pageW, p.pageH], p.pageW >= p.pageH ? "landscape" : "portrait");
      const el = new DOMParser().parseFromString(p.svg, "image/svg+xml").documentElement;
      if (el.nodeName !== "svg") throw new Error("sheet SVG is not well-formed");
      // svg2pdf measures text and resolves <use> against a live tree
      host.replaceChildren(document.importNode(el, true));
      await doc.svg(host.firstElementChild, { x: 0, y: 0, width: p.pageW, height: p.pageH });
    }
  } finally { host.remove(); }
  return doc.output("arraybuffer");
}
export async function sheetPdf(layout) { return sheetsPdf([layout]); }

/* Raster of one sheet for the PDF. The long side is fixed at 4000 px (about
   240 dpi on an A3 sheet) and the short side follows the aspect ratio. The
   first version clamped each side to 5000 px on its own, which squeezed any
   drawing in large map units into a square. */
export async function svgToPng(svg, longSide = 4000) {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const vb = ((/<svg\b[^>]*\sviewBox="([^"]*)"/.exec(svg) || [])[1] || "0 0 1200 850").trim().split(/[ ,]+/).map(Number);
      const vw = vb[2] || 1200, vh = vb[3] || 850;
      const k = longSide / Math.max(vw, vh);
      const w = Math.max(100, Math.round(vw * k)), h = Math.max(100, Math.round(vh * k));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = svgUrl(svg);
  });
}

