/* office.js — Microsoft Office files to PDF, in the browser.

   The file never leaves the page (the server route that was meant to convert
   Word never existed: api.ieccalc.com answered 404). Each kind is laid out by
   an open-source renderer into pages in a hidden part of the page, each page
   is drawn to a picture at about 190 dpi and the pictures become the pages of
   a PDF of the right paper size — which the studio then reads as any PDF.

     .docx          docx-preview 0.4.1 (Apache-2.0): Word's own pages (its saved
                    page breaks), headers, footers, footnotes, pictures
     .xlsx .xls     SheetJS 0.18.5 (Apache-2.0): every sheet, cut into A4
                    landscape pages between rows, scaled down to the width
     .pptx          pptx-preview 1.0.7 (ISC): one page per slide
     .rtf / RTF .doc  rtf.js 3.0.9 (MIT) — ETAP saves its reports so
     binary .doc    not readable in a browser: said so, with the way out

   Pictures are drawn by html-to-image 1.11.13 (MIT): the browser draws the
   page itself (SVG foreignObject), so fonts and layout are its own. */

const S = {
  jszip: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
  docx: "https://cdn.jsdelivr.net/npm/docx-preview@0.4.1/dist/docx-preview.min.js",
  h2i: "https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js",
  xlsx: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  pptx: "https://cdn.jsdelivr.net/npm/pptx-preview@1.0.7/dist/pptx-preview.umd.js",
  rtf: "https://cdn.jsdelivr.net/npm/rtf.js@3.0.9/dist/RTFJS.bundle.min.js",
  wmf: "https://cdn.jsdelivr.net/npm/rtf.js@3.0.9/dist/WMFJS.bundle.min.js",
  emf: "https://cdn.jsdelivr.net/npm/rtf.js@3.0.9/dist/EMFJS.bundle.min.js",
};
const loaded = new Map();
function script(src) {
  if (!loaded.has(src)) loaded.set(src, new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res;
    s.onerror = () => { loaded.delete(src); rej(new Error("could not load " + src.split("/npm/")[1]?.split("/")[0] || src)); };
    document.head.appendChild(s);
  }));
  return loaded.get(src);
}
const PX_PT = 0.75;                                            // 1 CSS px = 0.75 pt
const DPR = 2;                                                 // 96 × 2 = 192 dpi
export const OFFICE_EXT = ["doc", "docx", "xls", "xlsx", "pptx", "rtf"];

/* the kind of file, from its first bytes */
async function sniff(file) {
  const b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (b[0] === 0x50 && b[1] === 0x4b) return "zip";
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return "ole";
  if (String.fromCharCode(...b.slice(0, 5)) === "{\\rtf") return "rtf";
  return "other";
}

/* a hidden stage where the pages are laid out at their real size */
function stage() {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:auto;height:auto;background:#fff;z-index:-1;pointer-events:none;contain:layout style";
  document.body.appendChild(host);
  return host;
}
/* One element as pictures of pages pageH CSS px high; content taller than a
   page is cut into more pages unless o.split is false (a slide is one page,
   whatever sticks out of it). o.fonts: the @font-face CSS to embed — worked
   out once per document; web fonts are fetched and inlined for each picture
   otherwise, which on a workbook of many pages took most of a minute. */
async function shoot(el, pageW, pageH, pages, onPage, o = {}) {
  await script(S.h2i);
  clean(el);
  const w = Math.ceil(pageW), full = o.split === false ? pageH : Math.max(pageH, el.scrollHeight);
  const opt = { pixelRatio: DPR, backgroundColor: "#ffffff", width: w, height: Math.ceil(full), cacheBust: false };
  if (o.fonts != null) opt.fontEmbedCSS = o.fonts; else opt.skipFonts = true;
  const cv = await window.htmlToImage.toCanvas(el, opt);
  const n = Math.max(1, Math.ceil((full - 1) / pageH));
  for (let i = 0; i < n; i++) {
    const c = document.createElement("canvas"); c.width = Math.round(w * DPR); c.height = Math.round(pageH * DPR);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(cv, 0, Math.round(i * pageH * DPR), c.width, c.height, 0, 0, c.width, c.height);
    pages.push({ url: c.toDataURL("image/jpeg", 0.9), w: w * PX_PT, h: pageH * PX_PT });
    onPage?.(pages.length);
  }
}
/* The picture is an SVG, which is XML: a control character in a cell or a
   run (Excel keeps  and the like) makes it unreadable, and the browser
   answers the load with a bare error event. They go, in text and attributes. */
const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
function clean(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.currentNode; n; n = w.nextNode()) {
    if (n.nodeType === 3) { if (BAD.test(n.data)) n.data = n.data.replace(BAD, " "); BAD.lastIndex = 0; }
    else for (const a of n.attributes || []) if (BAD.test(a.value)) { BAD.lastIndex = 0; n.setAttribute(a.name, a.value.replace(BAD, " ")); }
  }
}
/* the pictures as a PDF */
async function toPdf(pages) {
  const { PDFDocument } = window.PDFLib, pdf = await PDFDocument.create();
  for (const p of pages) {
    const img = await pdf.embedJpg(p.url), pg = pdf.addPage([p.w, p.h]);
    pg.drawImage(img, { x: 0, y: 0, width: p.w, height: p.h });
  }
  return pdf.save();
}
const pxOf = v => { const m = /([\d.]+)\s*(pt|px|in|cm|mm)?/.exec(v || ""); if (!m) return 0; const n = +m[1]; return { pt: n / PX_PT, px: n, in: n * 96, cm: n * 96 / 2.54, mm: n * 96 / 25.4 }[m[2] || "px"]; };

/* ── Word ── */
async function docx(file, onPage) {
  await script(S.jszip); await script(S.docx); await script(S.h2i);
  const host = stage(), style = document.createElement("div"); host.appendChild(style);
  const body = document.createElement("div"); host.appendChild(body);
  try {
    await window.docx.renderAsync(await file.arrayBuffer(), body, style, {
      className: "dsx", inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: false,
      ignoreWidth: false, ignoreHeight: false, ignoreFonts: false, renderHeaders: true, renderFooters: true,
      renderFootnotes: true, renderEndnotes: true, useBase64URL: true, experimental: true,
    });
    await document.fonts?.ready;
    const secs = [...body.querySelectorAll("section.dsx")];
    if (!secs.length) throw new Error("the document has no pages");
    const pages = [];
    const fonts = style.querySelector("style") && /@font-face/.test(style.textContent) ? await window.htmlToImage.getFontEmbedCSS(style).catch(() => "") : null;
    for (const s of secs) {
      s.style.margin = "0"; s.style.boxShadow = "none";
      const w = pxOf(s.style.width) || s.offsetWidth, h = pxOf(s.style.minHeight || s.style.height) || s.offsetHeight;
      await shoot(s, w, h, pages, onPage, { fonts });
    }
    return toPdf(pages);
  } finally { host.remove(); }
}
/* ── Excel ── */
/* One page of a sheet, drawn on a canvas: the cells where the browser laid
   them out (merges included), their text clipped to the cell, numbers to the
   right. A picture of the table through html-to-image copied every cell's
   computed style into the SVG — tens of megabytes a page, which the browser
   then refused to load. */
function drawSheetPage(t, rows, title, k, PW, PH, M) {
  const c = document.createElement("canvas"); c.width = Math.round(PW * DPR); c.height = Math.round(PH * DPR);
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  x.scale(DPR, DPR); x.translate(M, M);
  x.fillStyle = "#111"; x.font = "bold 11px Arial, Helvetica, sans-serif"; x.textBaseline = "alphabetic";
  x.fillText(title, 0, 11);
  x.translate(0, 18); x.scale(k, k);
  const tr = t.getBoundingClientRect(), top = rows[0].getBoundingClientRect().top;
  x.lineWidth = 1 / k; x.strokeStyle = "#9a9a9a"; x.font = "9px Arial, Helvetica, sans-serif"; x.textBaseline = "middle";
  for (const row of rows) for (const td of row.cells) {
    const r = td.getBoundingClientRect(), cx = r.left - tr.left, cy = r.top - top, w = r.width, h = r.height;
    x.strokeRect(cx + 0.5 / k, cy + 0.5 / k, w, h);
    const s = td.textContent.replace(/\s+/g, " ").trim(); if (!s) continue;
    x.save(); x.beginPath(); x.rect(cx + 2, cy, w - 4, h); x.clip();
    x.fillStyle = "#111";
    const num = td.getAttribute("data-t") === "n";
    x.textAlign = num ? "right" : "left";
    x.fillText(s, num ? cx + w - 4 : cx + 4, cy + h / 2);
    x.restore();
  }
  return { url: c.toDataURL("image/jpeg", 0.9), w: PW * PX_PT, h: PH * PX_PT };
}
async function xlsx(file, onPage) {
  await script(S.xlsx);
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellStyles: true, cellDates: true });
  const host = stage(), pages = [];
  const PW = 842 / PX_PT, PH = 595 / PX_PT, M = 28;             // A4 landscape, CSS px; margin
  try {
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name]; if (!ws["!ref"]) continue;
      const box = document.createElement("div");
      box.style.cssText = "display:inline-block;padding:0;background:#fff;font:9px/1.25 Arial,Helvetica,sans-serif;color:#111";
      box.innerHTML = '<div style="font:bold 11px Arial;margin:0 0 6px">' + name.replace(/[<&]/g, "") + '</div>' + window.XLSX.utils.sheet_to_html(ws, { header: "", footer: "" });
      const t = box.querySelector("table"); if (!t) continue;
      t.style.cssText = "border-collapse:collapse;table-layout:auto";
      for (const td of t.querySelectorAll("td,th")) td.style.cssText = "border:1px solid #9a9a9a;padding:2px 4px;white-space:nowrap;vertical-align:top";
      host.appendChild(box);
      const k = Math.min(1, (PW - 2 * M) / box.offsetWidth);     // down to the page width
      // rows onto pages: cut between rows, each page at most the page's height
      const rows = [...t.rows], avail = (PH - 2 * M - 18) / k;   // under the 18 px title
      let start = 0;
      while (start < rows.length) {
        let end = start, hgt = rows[start].offsetTop;
        while (end < rows.length && rows[end].offsetTop + rows[end].offsetHeight - hgt <= avail) end++;
        if (end === start) end = start + 1;
        pages.push(drawSheetPage(t, rows.slice(start, end), name + (start ? " (continued)" : ""), k, PW, PH, M));
        onPage?.(pages.length);
        start = end;

      }
      box.remove();
    }
    if (!pages.length) throw new Error("the workbook has no filled sheets");
    return toPdf(pages);
  } finally { host.remove(); }
}
/* ── PowerPoint ── */
async function pptx(file, onPage) {
  await script(S.pptx);
  const host = stage(), dom = document.createElement("div"); host.appendChild(dom);
  const W = 960, H = 540;
  try {
    const pv = window.pptxPreview.init(dom, { width: W, height: H, mode: "list" });
    await pv.preview(await file.arrayBuffer());
    await new Promise(r => setTimeout(r, 300));
    const slides = [...dom.querySelectorAll(".pptx-preview-slide-wrapper")];
    const list = slides.length ? slides : [...dom.children];
    const pages = [];
    for (const s of list) { const w = s.offsetWidth || W, h = s.offsetHeight || H; s.style.overflow = "hidden"; await shoot(s, w, h, pages, onPage, { split: false }); }
    if (!pages.length) throw new Error("no slides were drawn");
    return toPdf(pages);
  } finally { host.remove(); }
}
/* ── RTF (and an RTF saved as .doc) ── */
/* rtf.js runs in a frame of its own: it reads a global `cptable` for its
   code pages, and SheetJS keeps one of a shape rtf.js cannot read ("reading
   'dec'") in this page. The elements it makes are brought over. */
let rtfWin = null;
async function rtfFrame() {
  if (rtfWin) return rtfWin;
  const f = document.createElement("iframe"); f.style.display = "none"; f.setAttribute("aria-hidden", "true");
  document.body.appendChild(f);
  const w = f.contentWindow;
  for (const u of [S.wmf, S.emf, S.rtf]) await new Promise((res, rej) => { const sc = w.document.createElement("script"); sc.src = u; sc.onload = res; sc.onerror = () => rej(new Error("could not load rtf.js")); w.document.head.appendChild(sc); });
  return (rtfWin = w);
}
async function rtf(file, onPage) {
  const w = await rtfFrame();
  /* rtf.js decodes each run with the code page its font asks for and has no
     table for some (Symbol, charset 2 = code page 42): the charsets and code
     pages go, and the document is read as Windows-1252 (ETAP writes so). */
  const txt = new TextDecoder("latin1").decode(await file.arrayBuffer())
    .replace(/\\fcharset\d+/g, "").replace(/\\cpg\d+/g, "").replace(/\\ansicpg\d+/g, "\\ansicpg1252");
  const buf = new w.Uint8Array(txt.length); for (let i = 0; i < txt.length; i++) buf[i] = txt.charCodeAt(i);
  const els = (await new w.RTFJS.Document(buf.buffer, {}).render()).map(e => document.importNode(e, true));
  /* the paragraphs and tables flow onto A4 pages, whole; a block taller than
     a page is cut through (one picture of a report was too big to load) */
  const host = stage(), PW = 595 / PX_PT, PH = 842 / PX_PT, M = 56, CH = PH - 2 * M;
  const mk = () => {
    const pg = document.createElement("div");
    pg.style.cssText = "width:" + PW + "px;min-height:" + PH + "px;background:#fff;padding:" + M + "px;box-sizing:border-box;font:12px 'Times New Roman',serif;color:#000;overflow:hidden";
    host.appendChild(pg); return pg;
  };
  try {
    const sheets = [mk()];
    for (const e of els) {
      let cur = sheets[sheets.length - 1];
      cur.appendChild(e);
      if (cur.scrollHeight - 2 * M > CH + 1 && cur.children.length > 1) { cur.removeChild(e); cur = mk(); sheets.push(cur); cur.appendChild(e); }
    }
    const pages = [];
    for (const pg of sheets) await shoot(pg, PW, PH, pages, onPage);
    return toPdf(pages);
  } finally { host.remove(); }
}

/* the PDF of an Office file; onPage(n) as the pages are made */
export async function officeToPdf(file, onPage) {
  const ext = (file.name.split(".").pop() || "").toLowerCase(), kind = await sniff(file);
  if (kind === "rtf") return rtf(file, onPage);
  if (kind === "ole") {
    if (ext === "xls") return xlsx(file, onPage);                 // SheetJS reads the old binary workbook
    throw new Error("this is the old binary ." + ext + " format, which a browser cannot lay out — open it in Office and save it as ." + (ext === "ppt" ? "pptx" : "docx") + ", or print it to PDF");
  }
  if (kind !== "zip") throw new Error("not an Office file");
  if (ext === "docx" || ext === "doc") return docx(file, onPage);
  if (ext === "xlsx" || ext === "xlsm") return xlsx(file, onPage);
  if (ext === "pptx") return pptx(file, onPage);
  throw new Error("." + ext + " is not supported");
}
