// engineers_apps/_lib/plan-badge.js
// Renders a small "current plan" badge with an Upgrade button. Auto-mounts to
// any element with id="ieccalc-plan-badge" or to document.body if none.

(function () {
  "use strict";

  function ensureStyles() {
    if (document.getElementById("ieccalc-badge-styles")) return;
    const s = document.createElement("style");
    s.id = "ieccalc-badge-styles";
    s.textContent = `
      .iec-plan-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 12px; background: #d8dbdf; color: #1a1a1a; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; border: 1px solid #b4b9bd; cursor: pointer; transition: background .1s; font-family: "Arial Narrow", Arial, sans-serif; }
      .iec-plan-badge:hover { background: #c5c9ce; }
      .iec-plan-badge.paid { background: #d6e9dc; color: #0c5826; border-color: #86b69a; }
      .iec-plan-badge.dev  { background: #f4e4c1; color: #6b4a00; border-color: #c99c3c; }
      .iec-plan-badge .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: 0.7; }
      .iec-plan-badge .upg { margin-left: 6px; padding: 1px 6px; border-radius: 2px; background: #3c4043; color: #fff; font-size: 10px; }
    `;
    document.head.appendChild(s);
  }

  function render(host) {
    ensureStyles();
    const lic = (window.License && window.License.getSync()) || { plan: "free", planLabel: "Free" };
    const isPaid = lic.plan && lic.plan !== "free";
    const cls = "iec-plan-badge" + (isPaid ? " paid" : "") + (lic.isDev ? " dev" : "");
    const expSuffix = lic.expires ? ` · until ${new Date(lic.expires).toLocaleDateString()}` : "";
    host.innerHTML = `
      <span class="${cls}" title="Click to manage license / upgrade">
        <span class="dot"></span>
        <span>${lic.planLabel}${expSuffix}</span>
        ${isPaid ? "" : `<span class="upg">↑ Upgrade</span>`}
      </span>`;
    host.querySelector(".iec-plan-badge").addEventListener("click", () => {
      if (window.UpgradeModal) window.UpgradeModal.open();
    });
  }

  function mount() {
    const target = document.getElementById("ieccalc-plan-badge");
    if (target) render(target);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  window.IecPlanBadge = { mount, render };
})();
