// engineers_apps/_lib/upgrade-modal.js
// Renders an upgrade modal with 4 pricing tiers (Day / Month / Year / Lifetime)
// and links each "Buy" button to its Lemon Squeezy checkout URL. Used by
// License.openUpgrade() when a user hits a paid feature.
//
// Configure your Lemon Squeezy product URLs once below — the same modal is
// used across all calculators on ieccalc.com.

(function () {
  "use strict";

  // ───── EDIT THESE AFTER CREATING PRODUCTS IN LEMON SQUEEZY ─────────────
  // Each plan should be a single Lemon Squeezy product. The Day / Month / Year
  // are subscriptions, Lifetime is a one-time purchase. Bundle vs single-cal
  // pricing is also configured here (per-app vs all-apps).
  const STORE_SUBDOMAIN = "ieccalc";    // e.g. https://ieccalc.lemonsqueezy.com
  const PRODUCTS = [
    { id: "day",      label: "Day pass",      price: "$3.99",  per: "24 hours",       lsId: "REPLACE_DAY_VARIANT_ID" },
    { id: "month",    label: "Monthly",       price: "$12.99", per: "30 days",        lsId: "REPLACE_MONTH_VARIANT_ID",  recommended: true },
    { id: "year",     label: "Yearly",        price: "$119",   per: "365 days",       lsId: "REPLACE_YEAR_VARIANT_ID",   savings: "save 24 %" },
    { id: "lifetime", label: "Lifetime",      price: "$319",   per: "one-time, ever", lsId: "REPLACE_LIFETIME_VARIANT_ID" },
  ];
  const FEATURES_LIST = [
    "Sketch editor — draw the grid, place rods, lightning rods, touch objects, accessible areas",
    "Numerical segment-current matrix solver — physically consistent maps",
    "Surface potential, touch potential, step voltage colour maps in the .docx report",
    "Layout drawing with dimensions in the .docx report",
    "Two-layer matrix solver (Sunde infinite-image)",
    "Lightning impulse model (Heidler 10/350 µs, Z_impulse, GPR_impulse)",
    "Touch voltage by object · step voltage by accessible area · transferred-potential paths",
    "Sensitivity checks (segment-length × map resolution)",
    "Optimizer — Find required parameters within fixed boundary",
    "Save / load project (.json)",
    "Unlimited grid scenarios per project",
  ];

  const FEATURE_LABELS = {
    sketch_editor:      "Sketch editor (canvas)",
    layout_drawing:     "Layout drawing in .docx",
    potential_maps:     "Surface potential / touch / step voltage maps",
    numerical_solver:   "Numerical segment-current solver",
    two_layer_matrix:   "Two-layer matrix solver",
    lightning_impulse:  "Lightning impulse model",
    touch_objects:      "Touch voltage by object",
    accessible_areas:   "Step voltage by accessible area",
    transferred_paths:  "Transferred-potential paths",
    sensitivity_checks: "Sensitivity checks",
    optimizer:          "Grid optimizer",
    full_report:        "Full .docx with maps & appendices",
    save_load_project:  "Save / load project",
    multi_scenario:     "Multiple scenarios per project",
    csv_export:         "CSV export of segments",
    trench_cad:         "Trench cross-section CAD editor (multi-cable)",
  };

  function checkoutUrl(p) {
    return `https://${STORE_SUBDOMAIN}.lemonsqueezy.com/buy/${p.lsId}?embed=1&desc=0&logo=0`;
  }

  function ensureStyles() {
    if (document.getElementById("ieccalc-upgrade-styles")) return;
    const s = document.createElement("style");
    s.id = "ieccalc-upgrade-styles";
    s.textContent = `
      .iec-upg-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 99999; display: flex; align-items: flex-start; justify-content: center; padding: 4vh 16px; overflow-y: auto; }
      .iec-upg-modal   { background: #fff; max-width: 920px; width: 100%; border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,.4); padding: 26px 28px 22px; font-family: "Arial Narrow", Arial, sans-serif; color: #000; }
      .iec-upg-modal h2{ margin: 0 0 6px; font-size: 22px; font-weight: 700; }
      .iec-upg-sub     { color: #555; font-size: 13.5px; margin-bottom: 18px; }
      .iec-upg-feat    { background: #f4e4c1; border: 1px solid #c99c3c; color: #3a2e00; padding: 10px 12px; border-radius: 4px; margin-bottom: 16px; font-size: 13px; }
      .iec-upg-feat b  { font-weight: 700; }
      .iec-upg-grid    { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
      @media (max-width: 760px) { .iec-upg-grid { grid-template-columns: 1fr 1fr; } }
      @media (max-width: 480px) { .iec-upg-grid { grid-template-columns: 1fr; } }
      .iec-upg-card    { border: 1px solid #c8ccd1; border-radius: 6px; padding: 14px 12px 12px; text-align: center; background: #fff; position: relative; }
      .iec-upg-card.rec { border-color: #3c4043; box-shadow: 0 4px 14px rgba(60,64,67,.15); }
      .iec-upg-card .badge { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #3c4043; color: #fff; font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 3px 9px; border-radius: 2px; white-space: nowrap; }
      .iec-upg-card .label { font-weight: 700; font-size: 13.5px; margin-bottom: 4px; }
      .iec-upg-card .price { font-size: 26px; font-weight: 700; line-height: 1.1; margin: 6px 0 2px; font-family: "Consolas", monospace; }
      .iec-upg-card .per   { font-size: 11.5px; color: #555; margin-bottom: 10px; min-height: 28px; }
      .iec-upg-card .savings { font-size: 11px; color: #0c5826; font-weight: 700; margin-bottom: 6px; }
      .iec-upg-card .buy   { display: inline-block; padding: 8px 16px; font-size: 12.5px; font-weight: 700; background: #3c4043; color: #fff; border: 1px solid #3c4043; border-radius: 3px; text-decoration: none; cursor: pointer; transition: background .1s; }
      .iec-upg-card .buy:hover { background: #23272a; }
      .iec-upg-features { font-size: 12px; color: #1a1a1a; line-height: 1.55; margin-bottom: 14px; padding-left: 0; list-style: none; }
      .iec-upg-features li { padding-left: 20px; position: relative; margin-bottom: 4px; }
      .iec-upg-features li::before { content: "✓"; color: #0c5826; font-weight: 700; position: absolute; left: 0; top: 0; }
      .iec-upg-foot   { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 12px; border-top: 1px solid #b4b9bd; font-size: 11.5px; color: #555; }
      .iec-upg-foot a { color: #1a1a1a; text-decoration: underline; cursor: pointer; }
      .iec-upg-close  { position: absolute; top: 14px; right: 18px; background: transparent; border: 0; font-size: 22px; color: #555; cursor: pointer; padding: 0 6px; }
      .iec-upg-close:hover { color: #000; }
      .iec-upg-key-input { width: 100%; max-width: 460px; margin-top: 8px; padding: 6px 10px; font-family: "Consolas", monospace; font-size: 12px; border: 1px solid #b4b9bd; border-radius: 3px; }
      .iec-upg-current { font-size: 12px; color: #555; margin-bottom: 10px; }
      .iec-upg-current b { color: #1a1a1a; }
    `;
    document.head.appendChild(s);
  }

  const UpgradeModal = {
    open(opts = {}) {
      ensureStyles();
      // Remove any existing instance
      this.close();
      const lic = (window.License && window.License.getSync) ? window.License.getSync() : { plan: "free", planLabel: "Free" };
      const featLabel = (opts.feature && FEATURE_LABELS[opts.feature]) || (opts.feature || null);

      const overlay = document.createElement("div");
      overlay.className = "iec-upg-overlay";
      overlay.id = "iec-upg-overlay";
      overlay.innerHTML = `
        <div class="iec-upg-modal" role="dialog" aria-modal="true" style="position: relative">
          <button class="iec-upg-close" aria-label="Close" id="iec-upg-close">&times;</button>
          <h2>Upgrade to unlock the full engineering toolkit</h2>
          <div class="iec-upg-sub">All ieccalc.com calculators · IEEE 80, IEC 60909, IEC 60364, IEC 61936 — engineering-grade reports.</div>
          ${featLabel ? `<div class="iec-upg-feat"><b>You clicked a paid feature:</b> ${featLabel}.</div>` : ""}
          <div class="iec-upg-current">Current plan: <b>${lic.planLabel}</b>${lic.expires ? ` — expires ${new Date(lic.expires).toLocaleDateString()}` : ""}.</div>

          <ul class="iec-upg-features">
            ${FEATURES_LIST.map(f => `<li>${f}</li>`).join("")}
          </ul>

          <div class="iec-upg-grid">
            ${PRODUCTS.map(p => `
              <div class="iec-upg-card${p.recommended ? " rec" : ""}">
                ${p.recommended ? `<span class="badge">Most popular</span>` : ""}
                <div class="label">${p.label}</div>
                <div class="price">${p.price}</div>
                <div class="per">${p.per}</div>
                ${p.savings ? `<div class="savings">${p.savings}</div>` : ""}
                <a class="buy" href="${checkoutUrl(p)}" target="_blank" rel="noopener">Buy</a>
              </div>
            `).join("")}
          </div>

          <div class="iec-upg-foot">
            <div>Already purchased? Paste your license key:
              <br><input type="text" class="iec-upg-key-input" id="iec-upg-key" placeholder="paste JWT from purchase email">
              <button class="buy" id="iec-upg-key-apply" style="margin-top:6px">Apply key</button>
            </div>
            <div style="text-align: right">
              <a id="iec-upg-restore">Restore from email magic link</a><br>
              <span style="color:#888">Powered by Lemon Squeezy · global cards / Apple Pay / Google Pay</span>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const close = () => this.close();
      overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
      overlay.querySelector("#iec-upg-close").addEventListener("click", close);
      overlay.querySelector("#iec-upg-key-apply").addEventListener("click", async () => {
        const k = overlay.querySelector("#iec-upg-key").value.trim();
        if (!k) return;
        try {
          await window.License.applyKey(k);
          close();
          location.reload();
        } catch (e) { alert("Invalid key: " + e.message); }
      });
      overlay.querySelector("#iec-upg-restore").addEventListener("click", () => {
        const email = prompt("Enter the email you used at purchase. We will resend the license link.");
        if (email) alert("Magic-link request will be sent to " + email + " (backend pending).");
      });
    },

    close() {
      const ex = document.getElementById("iec-upg-overlay");
      if (ex) ex.remove();
    },
  };

  window.UpgradeModal = UpgradeModal;
})();
