// IECCalc LAB Document Studio — free DWG engine
// Uses GNU LibreDWG WebAssembly in the browser. No paid API, no DWG upload.
import { Dwg_File_Type, LibreDwg } from "https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.7.14/dist/libredwg-web.js";

const WASM = new URL("./", import.meta.url).href;
let enginePromise;

function getEngine() {
  if (!enginePromise) enginePromise = LibreDwg.create(WASM);
  return enginePromise;
}
function svgUrl(svg) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
function meta(svg) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const el = doc.documentElement;
  const vb = (el.getAttribute("viewBox") || "").trim().split(/[ ,]+/).map(Number);
  const width = parseFloat(el.getAttribute("width") || "") || (vb.length === 4 ? vb[2] : null);
  const height = parseFloat(el.getAttribute("height") || "") || (vb.length === 4 ? vb[3] : null);
  return { width, height, orientation: width && height && width < height ? "portrait" : "landscape" };
}
function isolate(db, target) {
  return {
    ...db,
    tables: {
      ...db.tables,
      blockRecords: (db.tables?.blockRecords || []).map(br => {
        const name = String(br?.name || "");
        const isSpace = /^\*Model_Space$/i.test(name) || /^\*Paper_Space/i.test(name);
        return (!isSpace || name === target) ? br : { ...br, entities: [] };
      })
    }
  };
}
function friendlyLayoutNames(db, count) {
  const found = [];
  for (const o of Array.isArray(db?.objects) ? db.objects : []) {
    const type = String(o?.type || o?.dxfName || o?.objectType || o?.className || "");
    if (/LAYOUT/i.test(type)) {
      const n = o?.name || o?.layoutName || o?.layout_name;
      if (n && !/^model$/i.test(String(n))) found.push(String(n));
    }
  }
  const unique = [...new Set(found)];
  return Array.from({ length: count }, (_, i) => unique[i] || ("Layout " + (i + 1)));
}

export async function parseDwg(file) {
  const lib = await getEngine();
  const ptr = lib.dwg_read_data(await file.arrayBuffer(), Dwg_File_Type.DWG);
  if (!ptr) throw new Error("LibreDWG could not open this DWG.");
  let db;
  try { db = lib.convert(ptr); } finally { try { lib.dwg_free(ptr); } catch {} }

  const blocks = db?.tables?.blockRecords || [];
  const model = blocks.find(br => /^\*Model_Space$/i.test(String(br?.name || "")));
  const papers = blocks.filter(br => /^\*Paper_Space/i.test(String(br?.name || "")));
  const names = friendlyLayoutNames(db, papers.length);
  const layouts = [];

  if (model) {
    const svg = lib.dwg_to_svg(isolate(db, model.name));
    layouts.push({ id:"model", name:"Model", isModel:true, selected:false, recordName:model.name, svg, previewUrl:svgUrl(svg), paper:"Model Space", ...meta(svg) });
  }
  papers.forEach((br, i) => {
    const svg = lib.dwg_to_svg(isolate(db, br.name));
    layouts.push({ id:"layout-"+i, name:names[i], isModel:false, selected:true, recordName:br.name, svg, previewUrl:svgUrl(svg), paper:"Paper Space", ...meta(svg) });
  });
  if (!layouts.length) throw new Error("No Model/Paper Space records were found.");
  return { layouts };
}

export async function svgToPng(svg, scale=2.5) {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const d = new DOMParser().parseFromString(svg, "image/svg+xml");
      const vb = (d.documentElement.getAttribute("viewBox") || "0 0 1200 850").split(/[ ,]+/).map(Number);
      const w = Math.max(100, Math.min(5000, Math.round((vb[2] || 1200) * scale)));
      const h = Math.max(100, Math.min(5000, Math.round((vb[3] || 850) * scale)));
      const cv = document.createElement("canvas"); cv.width=w; cv.height=h;
      const ctx = cv.getContext("2d"); ctx.fillStyle="#fff"; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
      resolve(cv.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = svgUrl(svg);
  });
}
