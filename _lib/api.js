// engineers_apps/_lib/api.js
// Thin fetch wrapper for the ieccalc.com Worker API.

(function () {
  "use strict";

  const API_BASE = (() => {
    const host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:8787";
    return "https://api.ieccalc.com";
  })();

  async function request(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    let body = opts.body;
    if (body && typeof body !== "string") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const resp = await fetch(API_BASE + path, {
      method: opts.method || "GET",
      headers,
      body,
      credentials: "include",
    });
    const ct = resp.headers.get("Content-Type") || "";
    const data = ct.includes("application/json") ? await resp.json().catch(() => ({})) : await resp.text();
    if (!resp.ok) {
      const err = new Error((data && data.error) || resp.statusText);
      err.status = resp.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  const Api = {
    base: API_BASE,
    health:        ()              => request("/health"),
    calculators:   ()              => request("/calculators"),
    pricingRules:  ()              => request("/pricing/rules"),
    articles:      ()              => request("/content/articles"),
    article:       (slug)          => request("/content/articles/" + slug),

    requestLogin:  (email, redirect) => request("/auth/request", { method: "POST", body: { email, redirect } }),
    signOut:       ()              => request("/auth/signout", { method: "POST" }),
    me:            ()              => request("/me"),

    cartQuote:     (items)         => request("/cart/quote",    { method: "POST", body: { items } }),
    cartCheckout:  (items, email)  => request("/cart/checkout", { method: "POST", body: { items, email } }),

    saveLead:      (email, source, calc_slug) => request("/leads", { method: "POST", body: { email, source, calc_slug } }),
    logEvent:      (event_type, extras = {}) => request("/events", { method: "POST", body: { event_type, ...extras } }),
  };

  window.IecApi = Api;
})();
