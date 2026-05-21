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

    // Content
    contentFeed:   (limit)         => request("/content/feed?limit=" + (limit || 30)),
    posts:         ()              => request("/content/posts"),
    videos:        ()              => request("/content/videos"),
    presentations: ()              => request("/content/presentations"),
    presentation:  (slug)          => request("/content/presentations/" + slug),
    video:         (slug)          => request("/content/videos/" + slug),

    // Comments
    comments:      (type, id)      => request("/comments?type=" + encodeURIComponent(type) + "&id=" + id),
    addComment:    (type, id, body_md, parent_id) => request("/comments", { method: "POST", body: { target_type: type, target_id: id, body_md, parent_id } }),
    voteComment:   (id, dir)       => request("/comments/" + id + "/vote", { method: "POST", body: { direction: dir } }),

    // Forum
    forumCategories: ()                       => request("/forum/categories"),
    forumThreads:    (catSlug)                => request("/forum/c/" + catSlug + "/threads"),
    forumThread:     (id)                     => request("/forum/t/" + id),
    forumReplies:    (id)                     => request("/forum/t/" + id + "/replies"),
    createThread:    (catSlug, title, body_md) => request("/forum/c/" + catSlug + "/threads", { method: "POST", body: { title, body_md } }),
    createReply:     (threadId, body_md, parent_id) => request("/forum/t/" + threadId + "/replies", { method: "POST", body: { body_md, parent_id } }),
    
    // Projects
    listProjects:   ()                       => request("/projects"),
    createProject:  (name, kind, description) => request("/projects", { method:"POST", body:{ name, kind, description } }),
    getProject:     (id)                     => request("/projects/" + id),
    updateProject:  (id, body)               => request("/projects/" + id, { method:"PUT", body }),
    deleteProject:  (id)                     => request("/projects/" + id, { method:"DELETE" }),
    // Networks
    listNetworks:   (projectId)              => request("/projects/" + projectId + "/networks"),
    createNetwork:  (projectId, name, kind)  => request("/projects/" + projectId + "/networks", { method:"POST", body:{ name, kind } }),
    getNetwork:     (id)                     => request("/networks/" + id),
    updateNetwork:  (id, body)               => request("/networks/" + id, { method:"PUT", body }),
    deleteNetwork:  (id)                     => request("/networks/" + id, { method:"DELETE" }),
    calculateNetwork:(id, calcs)             => request("/networks/" + id + "/calculate", { method:"POST", body:{ calcs } }),
    networkReports: (id)                     => request("/networks/" + id + "/reports"),
    // Regimes (calc cases hung off a network's base model)
    listRegimes:    (netId)                  => request("/networks/" + netId + "/regimes"),
    createRegime:   (netId, name)            => request("/networks/" + netId + "/regimes", { method:"POST", body:{ name } }),
    getRegime:      (id)                     => request("/regimes/" + id),
    updateRegime:   (id, body)               => request("/regimes/" + id, { method:"PUT", body }),
    deleteRegime:   (id)                     => request("/regimes/" + id, { method:"DELETE" }),
    publicSettings: ()                       => request("/settings/public"),
    voteReply:       (id, dir)                => request("/forum/replies/" + id + "/vote", { method: "POST", body: { direction: dir } }),

    // ── Equipment libraries ────────────────────────────────────────
    // listEqLibraries() → { libraries: [{id, name, visibility, item_count, mine, writable, ...}] }
    listEqLibraries:  ()                       => request("/equipment/libraries"),
    createEqLibrary:  (name, visibility, description) =>
      request("/equipment/libraries", { method: "POST", body: { name, visibility, description } }),
    getEqLibrary:     (id)                     => request("/equipment/libraries/" + id),
    updateEqLibrary:  (id, body)               => request("/equipment/libraries/" + id, { method: "PUT", body }),
    deleteEqLibrary:  (id)                     => request("/equipment/libraries/" + id, { method: "DELETE" }),
    listEqItems:      (libId)                  => request("/equipment/libraries/" + libId + "/items"),
    createEqItem:     (libId, body)            => request("/equipment/libraries/" + libId + "/items", { method: "POST", body }),
    getEqItem:        (id)                     => request("/equipment/items/" + id),
    updateEqItem:     (id, body)               => request("/equipment/items/" + id, { method: "PUT", body }),
    deleteEqItem:     (id)                     => request("/equipment/items/" + id, { method: "DELETE" }),
    // KEY: copyEqItem clones an item into the caller's library (default
    // if toLibId is omitted).  Schemas reference the LOCAL copy so they
    // stay functional even if the source library later disappears.
    copyEqItem:       (id, toLibId)            => request("/equipment/items/" + id + "/copy",
                                                          { method: "POST", body: { toLibId } }),
    // Admin-only: promote/demote verification status.
    // body { verified: 'catalog'|'user' } — 'catalog' requires source_ref on the item.
    verifyEqItem:     (id, verified)           => request("/equipment/items/" + id + "/verify",
                                                          { method: "POST", body: { verified } }),
    // Bulk import — CSV / JSON / URL parser.
    importEqCSV:      (csv, libraryId)         => request("/equipment/import/csv",
                                                          { method: "POST", body: { csv, libraryId } }),
    importEqJSON:     (items, libraryId)       => request("/equipment/import/json",
                                                          { method: "POST", body: { items, libraryId } }),
    importEqURL:      (url, category, manufacturer, libraryId) => request("/equipment/import/url",
                                                          { method: "POST", body: { url, category, manufacturer, libraryId } }),
    eqTemplateURL:    API_BASE + "/equipment/template.csv",
  };

  window.IecApi = Api;
})();
