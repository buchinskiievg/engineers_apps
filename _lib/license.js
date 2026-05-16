// engineers_apps/_lib/license.js
// Centralised license / feature gating for ALL ieccalc.com calculators.
//
// Public API
//   License.get()                   → { plan, expires, features[], email }
//   License.canUseFeature(name)     → boolean
//   License.gate(name, callbacks)   → { onAllowed, onDenied }; auto-opens upgrade modal on deny
//   License.applyKey(jwt)           → store license JWT in localStorage
//   License.signOut()               → clear localStorage and return to free
//   License.setDevPlan(plan)        → for development; URL hash #dev=lifetime
//   License.openUpgrade(featureKey) → opens UpgradeModal
//
// Backend (Cloudflare Worker, planned):
//   GET  https://api.ieccalc.com/license/verify?token=...   → { plan, expires, ... }
//   POST https://api.ieccalc.com/license/webhook            → from Lemon Squeezy
//
// Until backend is live, License works fully client-side: localStorage cache
// of a JWT issued after Lemon Squeezy purchase (delivered to user via email
// magic-link). Dev override via URL hash for local testing.

(function () {
  "use strict";

  const STORAGE_KEY = "ieccalc_license_v1";
  const VERIFY_URL  = "https://api.ieccalc.com/license/verify";   // future Cloudflare Worker

  // Plan definition — `features: ["*"]` means everything.
  const PLANS = {
    free:     { features: ["basic_calc", "compact_report", "parametric_input", "validation_tests", "two_layer_schwarz_approx"] },
    day:      { features: ["*"], duration_ms:        24 * 60 * 60 * 1000 },
    month:    { features: ["*"], duration_ms:   30 * 24 * 60 * 60 * 1000 },
    year:     { features: ["*"], duration_ms:  365 * 24 * 60 * 60 * 1000 },
    lifetime: { features: ["*"] },
  };

  const PAID_FEATURES = [
    "sketch_editor",
    "layout_drawing",
    "potential_maps",
    "numerical_solver",
    "two_layer_matrix",
    "lightning_impulse",
    "touch_objects",
    "accessible_areas",
    "transferred_paths",
    "sensitivity_checks",
    "optimizer",
    "full_report",
    "save_load_project",
    "multi_scenario",
    "csv_export",
    "trench_cad",
  ];

  let _cache = null;

  function freeLicense() {
    return {
      plan: "free",
      planLabel: "Free",
      expires: null,
      features: PLANS.free.features.slice(),
      email: null,
      isDev: false,
    };
  }

  function planFromHash() {
    const m = (location.hash || "").match(/(?:^|[#&])dev=(free|day|month|year|lifetime)/);
    return m ? m[1] : null;
  }

  async function _load() {
    if (_cache) return _cache;

    // 1) Dev override via URL hash
    const devPlan = planFromHash();
    if (devPlan) {
      const def = PLANS[devPlan];
      _cache = {
        plan: devPlan,
        planLabel: devPlan === "free" ? "Free (dev)" : `${devPlan.charAt(0).toUpperCase() + devPlan.slice(1)} (dev)`,
        expires: def.duration_ms ? Date.now() + def.duration_ms : null,
        features: def.features.slice(),
        email: "dev@local",
        isDev: true,
      };
      return _cache;
    }

    // 2) localStorage — JWT issued by backend after purchase
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const lic = JSON.parse(raw);
        if (lic.expires == null || Date.now() < lic.expires) {
          _cache = lic;
          return lic;
        }
        localStorage.removeItem(STORAGE_KEY);  // expired
      }
    } catch (e) { /* corrupt — fall through */ }

    _cache = freeLicense();
    return _cache;
  }

  const License = {
    /** Force-refresh cache (call after applyKey / signOut). */
    refresh() { _cache = null; },

    /** Async — returns current license. */
    async get() { return await _load(); },

    /** Sync — returns cached license or free. */
    getSync() { return _cache || freeLicense(); },

    /** Check if a named feature is allowed under the current license. */
    canUseFeature(name) {
      const lic = _cache || freeLicense();
      return lic.features.includes("*") || lic.features.includes(name);
    },

    /** gate("sketch_editor", { onAllowed, onDenied }) — calls one of the two callbacks. */
    gate(name, cbs = {}) {
      if (this.canUseFeature(name)) {
        cbs.onAllowed && cbs.onAllowed();
        return true;
      }
      cbs.onDenied && cbs.onDenied();
      this.openUpgrade(name);
      return false;
    },

    /** Open upgrade modal; UpgradeModal must be loaded. */
    openUpgrade(featureKey) {
      if (window.UpgradeModal && typeof window.UpgradeModal.open === "function") {
        window.UpgradeModal.open({ feature: featureKey });
      } else {
        alert("Upgrade required for: " + featureKey);
      }
    },

    /** Apply a license JWT (e.g. from purchase email magic link). */
    async applyKey(jwt) {
      try {
        // TODO: when backend is live, POST to VERIFY_URL with jwt and parse
        // response. For now, expect a plain JSON payload base64-encoded as
        // "iat.payload.sig" — we read the middle segment without verifying.
        const parts = jwt.split(".");
        const payload = JSON.parse(atob(parts[1] || ""));
        const def = PLANS[payload.plan] || PLANS.free;
        const lic = {
          plan: payload.plan,
          planLabel: payload.plan.charAt(0).toUpperCase() + payload.plan.slice(1),
          expires: payload.exp ? payload.exp * 1000 : null,
          features: def.features.slice(),
          email: payload.email || null,
          isDev: false,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lic));
        _cache = lic;
        return lic;
      } catch (e) {
        throw new Error("Invalid license key: " + e.message);
      }
    },

    /** Clear license — back to free. */
    signOut() {
      localStorage.removeItem(STORAGE_KEY);
      _cache = freeLicense();
      // Strip dev hash if present
      if (planFromHash()) location.hash = "";
    },

    /** Plan list for UI. */
    PLANS, PAID_FEATURES,
  };

  // Auto-load on script execution so first synchronous .canUseFeature() works
  _load();

  // Listen for purchase magic-link arrivals via URL: ...?lic=JWT
  const urlKey = new URLSearchParams(location.search).get("lic");
  if (urlKey) {
    License.applyKey(urlKey).then(() => {
      // Strip the ?lic= from URL so it doesn't get re-applied
      const url = new URL(location.href);
      url.searchParams.delete("lic");
      history.replaceState(null, "", url.toString());
    }).catch(e => console.warn("License key in URL invalid:", e));
  }

  window.License = License;
})();
