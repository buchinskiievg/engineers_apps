# IECCalc 005 — Engineering Document Studio

## Purpose

A browser-first engineering document composer integrated into IECCalc.

Primary workflow:

1. Upload DWG / ZIP package / PDF / DOC / DOCX / JPG / PNG.
2. For DWG, run **preflight before final conversion**.
3. Show every Paper Space layout and Model Space separately.
4. Model Space is **not selected by default**.
5. Allow the user to inspect the actual rendered layout preview, paper size, orientation and plot boundary.
6. Allow individual layouts to be included/excluded.
7. Convert selected layouts only after the user accepts the preview.
8. Normalize converted files into PDF pages.
9. Reorder, rotate, delete and merge pages visually.
10. Export one final PDF.

## Front-end

Path:

`/005/`

The current front-end already supports:

- multi-file drag-and-drop;
- PDF page reading and thumbnail rendering in-browser;
- PDF page reordering by drag-and-drop;
- page selection;
- move selected to first / last;
- page rotation;
- page deletion;
- PNG/JPG insertion;
- browser-side final PDF merge/export;
- DWG preflight UI;
- Model Space toggle, default OFF;
- per-layout selection;
- large DWG preview modal;
- visible plot-boundary overlay;
- hooks for DWG and Office server conversion.

## Backend endpoints

### POST /api/document-studio/dwg/preflight

Purpose:

Inspect and render a DWG without producing the user's final PDF.

Input:

multipart/form-data

- `file`: .dwg or .zip
- `includeModel`: "true" | "false"

ZIP may contain:

- primary DWG;
- XREF DWGs;
- SHX fonts;
- TTF fonts where applicable;
- CTB/STB plot styles;
- raster references;
- other referenced assets.

The backend must determine the primary drawing. If ambiguous, return an error that lists candidate DWGs.

Required response:

```json
{
  "drawing": {
    "name": "01_SLD.dwg",
    "units": "mm"
  },
  "layouts": [
    {
      "id": "layout-guid-or-stable-id",
      "name": "01 - Single Line Diagram",
      "isModel": false,
      "selected": true,
      "paper": "ISO A1",
      "widthMm": 841,
      "heightMm": 594,
      "orientation": "landscape",
      "plotStyle": "monochrome.ctb",
      "plotDevice": "DWG To PDF.pc3",
      "plotArea": "Layout",
      "scale": "1:1",
      "previewUrl": "/api/document-studio/jobs/{job}/preview/{layout}.png",
      "plotBounds": {
        "x": 0.035,
        "y": 0.045,
        "width": 0.93,
        "height": 0.91
      },
      "warning": null
    }
  ],
  "dependencies": [
    {
      "name": "A1_titleblock.dwg",
      "type": "xref",
      "status": "resolved"
    },
    {
      "name": "simplex.shx",
      "type": "font",
      "status": "missing"
    }
  ],
  "warnings": []
}
```

Rules:

- Model Space must be returned as `isModel: true`.
- Model Space must have `selected: false` by default.
- Paper Space layouts default to selected unless they are non-plottable.
- Preview must be produced by the same rendering engine/configuration used for final output.
- Preview must represent saved layout plotting settings, not extents guessed by the web UI.
- The backend should return enough information to show the real printable boundary.
- Missing XREF/SHX/CTB/raster assets must be explicitly reported.
- Do not silently substitute missing CTB/STB.
- Do not silently convert unavailable fonts without a warning.
- A failed layout must not prevent other layouts from being previewed where possible.

Recommended preview:

- PNG or WebP;
- 150–200 dpi equivalent;
- white paper background;
- lineweights and plot styles applied;
- raster references included;
- no artificial page crop beyond the actual configured sheet.

### POST /api/document-studio/dwg/convert

Purpose:

Produce PDF only for layouts that the user accepted in preflight.

Input:

multipart/form-data

- `file`: original DWG/ZIP;
- `layouts`: JSON array of stable layout IDs;
- `includeModel`: boolean string;
- optional `preflightJobId` for reuse of already uploaded package.

Output:

- `application/pdf`

Rules:

- preserve selected order;
- use the same plot settings and engine as preflight;
- one selected layout = one PDF page unless the source plot configuration explicitly creates otherwise;
- page size must match the configured layout;
- lineweights, CTB/STB, fonts, XREFs and raster references must match preview;
- if final conversion differs materially from preflight, fail rather than return an unverified PDF.

### POST /api/document-studio/office/convert

Purpose:

Convert DOC / DOCX into PDF.

Input:

multipart/form-data

- `file`: Word file

Output:

- `application/pdf`

Preferred engines:

1. Microsoft-compatible server rendering where licensing/deployment allows it.
2. LibreOffice headless as fallback.

Return a response header if fallback rendering was used:

`X-IECCalc-Renderer: libreoffice`

## DWG engine

The UI is intentionally renderer-independent.

Preferred order for implementation testing:

### Option A — Autodesk Platform Services / AutoCAD Automation

Use AutoCAD engine for DWG inspection and plotting.

Advantages:

- closest behavior to AutoCAD Publish;
- strong compatibility with layout settings;
- better fidelity for complex drawings.

Required app bundle responsibilities:

- enumerate layouts;
- expose paper configuration;
- resolve plot settings;
- publish raster preview per layout;
- publish selected layouts to one PDF;
- collect unresolved dependency/font/plot-style diagnostics.

### Option B — ODA Drawings SDK

Use if self-hosting is preferred or APS cost/latency is unsuitable.

The same API contract must be preserved so the IECCalc front-end does not change.

## Preflight acceptance checks

Before enabling final DWG conversion, the user should be able to see:

- drawing name;
- all layouts;
- Model Space separately;
- selected/unselected state;
- sheet format;
- width × height;
- portrait/landscape;
- plot style;
- plot boundary;
- layout preview;
- missing XREF;
- missing SHX/TTF;
- missing CTB/STB;
- missing raster reference;
- invalid/non-plottable layout;
- renderer error per layout.

## Security / privacy

Engineering drawings may be confidential.

Required:

- temporary object storage only;
- signed URLs;
- no public object URLs;
- automatic deletion after a short retention period;
- no training use;
- server logs must not contain file contents;
- random job IDs;
- antivirus/malware scanning for ZIP uploads;
- ZIP bomb protection;
- decompressed-size limit;
- file count limit;
- path traversal protection;
- deny executable content;
- configurable project maximum upload size.

## Suggested limits for first production version

- individual file: 250 MB;
- project package: 500 MB compressed;
- maximum decompressed package: 2 GB;
- maximum files inside ZIP: 2,000;
- maximum DWG layouts: 500;
- preview retention: 2 hours;
- conversion artifact retention: 2 hours.

These are implementation defaults and may be changed after observing real IECCalc usage.

## Next implementation sequence

1. Deploy DWG preflight service with one AutoCAD/ODA engine.
2. Connect `/005/` to the real preflight service.
3. Test against real engineering DWGs with:
   - multiple layouts;
   - model + layouts;
   - XREFs;
   - SHX;
   - CTB;
   - raster images;
   - A4–A0 and non-standard sheet sizes.
4. Add page insert/replace/extract.
5. Add split PDF.
6. Add engineering stamps and page numbering.
7. Add comments/markup.
8. Add OCR/search only after the core drawing/PDF workflow is stable.
