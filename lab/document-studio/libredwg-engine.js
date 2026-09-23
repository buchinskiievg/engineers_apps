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
   Ordinary block definitions stay whole: an INSERT still needs its block. */
function isolate(db, record, visible) {
  const h = String(record.handle);
  const keep = visible || (() => true);
  const ents = Array.isArray(db?.entities) ? db.entities : [];
  const recs = blockRecords(db).map(r => {
    if ((isModel(r) || isPaper(r)) && String(r.handle) !== h) return { ...r, entities: [] };
    if (String(r.handle) === h) return { ...r, entities: (r.entities || []).filter(keep) };
    return r;
  });
  return withRecords({ ...db, entities: ents.filter(e => ownerOf(e) === h && keep(e)) }, recs);
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
           '<g clip-path="url(#' + id + ')"><g transform="translate(' + num(cx) + "," + num(-cy) + ") scale(" + num(s) +
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
function drawSvg(lib, iso) {
  const r = drawRaw(lib, iso);
  return { svg: onPaper(xmlSafe(r.svg)), skippedTables: r.skippedTables };
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
    .replace(/^<svg\b/, '<svg width="' + W + '" height="' + H + '" preserveAspectRatio="xMidYMid meet"'));
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

function meta(svg) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const el = doc.documentElement;
  const vb = (el.getAttribute("viewBox") || "").trim().split(/[ ,]+/).map(Number);
  const width = parseFloat(el.getAttribute("width") || "") || (vb.length === 4 ? vb[2] : null);
  const height = parseFloat(el.getAttribute("height") || "") || (vb.length === 4 ? vb[3] : null);
  return { width, height, orientation: width && height && width < height ? "portrait" : "landscape" };
}

export async function parseDwg(file) {
  const lib = await freshEngine();
  const ptr = lib.dwg_read_data(await file.arrayBuffer(), Dwg_File_Type.DWG);
  if (!ptr) throw new Error("LibreDWG could not open this DWG.");
  let db;
  try { db = lib.convert(ptr); } finally { try { lib.dwg_free(ptr); } catch {} }

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
  const layouts = [];
  // Model Space is drawn once: as its own sheet, and as what every viewport shows
  let modelInner = "";
  if (model) {
    const iso = isolate(db, model, visible);
    const n = iso.entities.length;
    const drawn = drawSvg(lib, iso);
    modelInner = n ? innerOf(drawn.svg) : "";
    const svg = frame(drawn.svg, n ? intersect(extentsFor(iso.entities, db.header), drawnBox(drawn.svg)) : null);
    layouts.push({ id:"model", name:"Model", isModel:true, selected:false, empty:n===0, entityCount:n, skippedTables:drawn.skippedTables,
                   recordName:model.name, svg, previewUrl:svgUrl(svg), paper:"Model Space", ...meta(svg) });
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
    const sheet = composeSheet(drawn.svg, modelInner, vps);
    // an empty layout still gets a sheet, framed on nothing, so it can be seen as empty
    const svg = frame(sheet, n ? sheetExtents(lo, iso.entities, vps) : null);
    layouts.push({ id:"layout-"+i, name: lo?.layoutName || lo?.name || ("Layout " + (i + 1)), isModel:false,
                   selected: n > 0, empty: n === 0, entityCount: n, viewports: vps.length, skippedTables: drawn.skippedTables,
                   recordName:br.name, svg, previewUrl:svgUrl(svg), paper:"Paper Space", ...meta(svg) });
  });

  /* A drawing kept entirely in Model Space — every paper layout empty — is the
     common case for route plans and proposal layouts. Leaving Model off by
     default would hand the engineer an empty page, so the caller is told. */
  const paperWithContent = layouts.filter(l => !l.isModel && !l.empty).length;
  const modelOnly = !!model && paperWithContent === 0 && !layouts[0].empty;
  if (modelOnly) layouts[0].selected = true;
  return { layouts, modelOnly };
}

/* Raster of one sheet for the PDF. The long side is fixed at 4000 px (about
   240 dpi on an A3 sheet) and the short side follows the aspect ratio. The
   first version clamped each side to 5000 px on its own, which squeezed any
   drawing in large map units into a square. */
export async function svgToPng(svg, longSide = 4000) {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const d = new DOMParser().parseFromString(svg, "image/svg+xml");
      const vb = (d.documentElement.getAttribute("viewBox") || "0 0 1200 850").split(/[ ,]+/).map(Number);
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
