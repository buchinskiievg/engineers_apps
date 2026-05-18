// ieccalc.com — Cloudflare Worker (v2 dynamic backend)
// Routes:
//   GET  /health
//   Auth (passwordless, magic-link via Resend):
//     POST /auth/request           {email}                     → email magic link
//     GET  /auth/callback?t=...                                → set session cookie, redirect /account/
//     POST /auth/signout
//     GET  /me                                                  → current user + entitlements
//   Public catalog:
//     GET  /calculators                                         → active calculators
//     GET  /pricing/rules                                       → active pricing rules
//     GET  /content/articles                                    → published articles list
//     GET  /content/articles/:slug                              → article detail
//   Cart / checkout:
//     POST /cart/quote             {items:[{calc_slug,period}]} → matched rule + total
//     POST /cart/checkout          {items, email}               → LS checkout URL
//     POST /leads                  {email, source, calc_slug?}  → save lead
//     POST /events                 {event_type, ...}            → analytics
//   Lemon Squeezy:
//     POST /license/webhook                                     → upsert order + licenses
//   Legacy (v1):
//     GET  /license/verify?token=                               → JWT verify (kept for backward compat)
//     POST /license/restore        {email}                      → resend magic link
//   Admin (auth: cookie of admin_user OR header X-Admin-Key):
//     GET/POST/PUT/DELETE  /admin/calculators[/:id]
//     GET/POST/PUT/DELETE  /admin/pricing-rules[/:id]
//     GET/POST/PUT/DELETE  /admin/articles[/:id]
//     GET                  /admin/orders
//     GET                  /admin/users
//     GET/POST/PUT/DELETE  /admin/licenses[/:id]                (POST = manual gift)
//     GET/POST             /admin/leads
//     GET/POST             /admin/campaigns[/:id]
//     POST                 /admin/campaigns/:id/send
//     GET                  /admin/analytics/summary
//     GET                  /admin/events
//
// Bindings expected (wrangler.toml):
//   DB        — D1 database "ieccalc"
//   LICENSES  — KV namespace (legacy v1 compatibility)
// Secrets: JWT_SECRET, LS_WEBHOOK_SIGNING_SECRET, LS_API_KEY, RESEND_API_KEY, ADMIN_API_KEY
// Vars:    SITE_URL, LS_STORE_SUBDOMAIN, FROM_EMAIL

// Allowed origins for credentialed requests. With credentials:include
// browsers REJECT responses that use Access-Control-Allow-Origin: * — the
// server MUST echo a specific Origin from the allow-list.
const CORS_ALLOWED_ORIGINS = new Set([
  "https://ieccalc.com",
  "https://www.ieccalc.com",
  "http://localhost:8780",
  "http://localhost:8781",
  "http://localhost:8782",
  "http://127.0.0.1:8780",
  "http://127.0.0.1:8781",
  "http://127.0.0.1:8782",
]);

function corsHeaders(req) {
  const origin = req && req.headers && req.headers.get("Origin");
  const allow = origin && CORS_ALLOWED_ORIGINS.has(origin) ? origin : "https://ieccalc.com";
  return {
    "Access-Control-Allow-Origin":  allow,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Signature, X-Admin-Key",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(), ...(init.headers || {}) },
  });
}

function err(message, status = 400, extra = {}) {
  return json({ error: message, ...extra }, { status });
}

const now = () => Date.now();

export default {
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      const route = await dispatch(req, env, ctx, url, path);
      if (route) return route;
      return err("not found: " + path, 404);
    } catch (e) {
      console.error("worker error", e?.stack || e);
      return err(e?.message || "internal error", 500);
    }
  },
};

async function dispatch(req, env, ctx, url, path) {
  const method = req.method;

  if (path === "/health") return json({ ok: true, time: now(), version: "v2" });

  // ── Public catalog ─────────────────────────────────────────────────────
  if (path === "/calculators" && method === "GET") return getCalculators(env);
  if (path === "/pricing/rules" && method === "GET") return getPricingRules(env);
  if (path === "/content/articles" && method === "GET") return getArticles(env);
  if (path.startsWith("/content/articles/") && method === "GET") {
    return getArticle(env, path.slice("/content/articles/".length));
  }

  // ── Auth ───────────────────────────────────────────────────────────────
  if (path === "/auth/request" && method === "POST") return authRequest(req, env);
  if (path === "/auth/callback" && method === "GET") return authCallback(req, env, url);
  if (path === "/auth/signout" && method === "POST") return authSignout(req, env);
  if (path === "/me" && method === "GET") return me(req, env);
  // OAuth — Google + LinkedIn (OpenID Connect)
  if (path === "/auth/google" && method === "GET") return oauthStart(req, env, url, "google");
  if (path === "/auth/google/callback" && method === "GET") return oauthCallback(req, env, url, "google");
  if (path === "/auth/linkedin" && method === "GET") return oauthStart(req, env, url, "linkedin");
  if (path === "/auth/linkedin/callback" && method === "GET") return oauthCallback(req, env, url, "linkedin");

  // ── Cart / leads / events ──────────────────────────────────────────────
  if (path === "/cart/quote" && method === "POST") return cartQuote(req, env);
  if (path === "/cart/checkout" && method === "POST") return cartCheckout(req, env);
  if (path === "/leads" && method === "POST") return saveLead(req, env);
  if (path === "/events" && method === "POST") return logEvent(req, env);

  // ── Content public reads ───────────────────────────────────────────────
  if (path === "/content/posts" && method === "GET") return listPublished(env, "posts");
  if (path === "/content/videos" && method === "GET") return listPublished(env, "videos");
  if (path === "/content/presentations" && method === "GET") return listPublished(env, "presentations");
  if (path === "/content/feed" && method === "GET") return contentFeed(env, url);
  let m;
  if ((m = path.match(/^\/content\/posts\/(\d+)$/)) && method === "GET") return getContentItem(env, "posts", Number(m[1]));
  if ((m = path.match(/^\/content\/videos\/([\w-]+)$/)) && method === "GET") return getContentItem(env, "videos", m[1], "slug");
  if ((m = path.match(/^\/content\/presentations\/([\w-]+)$/)) && method === "GET") return getPresentation(env, m[1]);

  // ── Comments (polymorphic) ─────────────────────────────────────────────
  if (path === "/comments" && method === "GET") return listComments(env, url);
  if (path === "/comments" && method === "POST") return createComment(req, env);
  if ((m = path.match(/^\/comments\/(\d+)\/vote$/)) && method === "POST") return voteComment(req, env, Number(m[1]));

  // ── Forum public ────────────────────────────────────────────────────────
  if (path === "/forum/categories" && method === "GET") return forumCategories(env);
  if ((m = path.match(/^\/forum\/c\/([\w-]+)\/threads$/)) && method === "GET") return forumThreads(env, m[1], url);
  if ((m = path.match(/^\/forum\/t\/(\d+)$/)) && method === "GET") return forumThread(env, Number(m[1]));
  if ((m = path.match(/^\/forum\/t\/(\d+)\/replies$/)) && method === "GET") return forumReplies(env, Number(m[1]));
  if ((m = path.match(/^\/forum\/c\/([\w-]+)\/threads$/)) && method === "POST") return forumCreateThread(req, env, m[1]);
  if ((m = path.match(/^\/forum\/t\/(\d+)\/replies$/)) && method === "POST") return forumCreateReply(req, env, Number(m[1]));
  if ((m = path.match(/^\/forum\/replies\/(\d+)\/vote$/)) && method === "POST") return forumVoteReply(req, env, Number(m[1]));

  // ── Projects ───────────────────────────────────────────────────────────
  if (path === "/projects" && method === "GET") return listProjects(req, env);
  if (path === "/projects" && method === "POST") return createProject(req, env);
  if ((m = path.match(/^\/projects\/(\d+)$/)) && method === "GET")    return getProject(req, env, Number(m[1]));
  if ((m = path.match(/^\/projects\/(\d+)$/)) && method === "PUT")    return updateProject(req, env, Number(m[1]));
  if ((m = path.match(/^\/projects\/(\d+)$/)) && method === "DELETE") return deleteProject(req, env, Number(m[1]));

  // ── Network schemes ────────────────────────────────────────────────────
  if ((m = path.match(/^\/projects\/(\d+)\/networks$/)) && method === "GET")  return listNetworks(req, env, Number(m[1]));
  if ((m = path.match(/^\/projects\/(\d+)\/networks$/)) && method === "POST") return createNetwork(req, env, Number(m[1]));
  if ((m = path.match(/^\/networks\/(\d+)$/)) && method === "GET")    return getNetwork(req, env, Number(m[1]));
  if ((m = path.match(/^\/networks\/(\d+)$/)) && method === "PUT")    return updateNetwork(req, env, Number(m[1]));
  if ((m = path.match(/^\/networks\/(\d+)$/)) && method === "DELETE") return deleteNetwork(req, env, Number(m[1]));
  if ((m = path.match(/^\/networks\/(\d+)\/calculate$/)) && method === "POST") return calculateNetwork(req, env, Number(m[1]));
  if ((m = path.match(/^\/networks\/(\d+)\/reports$/)) && method === "GET")    return listNetworkReports(req, env, Number(m[1]));

  // ── Site settings ──────────────────────────────────────────────────────
  if (path === "/settings/public" && method === "GET") return publicSettings(env);

  // ── Media (R2 signed upload) ───────────────────────────────────────────
  if (path === "/media/upload" && method === "POST") return mediaUploadInit(req, env);
  if (path.startsWith("/media/file/") && method === "GET") return mediaServe(env, path.slice("/media/file/".length));

  // ── Lemon Squeezy webhook ──────────────────────────────────────────────
  if (path === "/license/webhook" && method === "POST") return handleWebhook(req, env);

  // ── Legacy v1 ──────────────────────────────────────────────────────────
  if (path === "/license/verify" && method === "GET") return legacyVerify(req, env, url);
  if (path === "/license/restore" && method === "POST") return legacyRestore(req, env);

  // ── Admin ──────────────────────────────────────────────────────────────
  if (path.startsWith("/admin/")) {
    const adminCheck = await requireAdmin(req, env);
    if (adminCheck !== true) return adminCheck;
    return adminRouter(req, env, url, path);
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════════
// PUBLIC CATALOG
// ════════════════════════════════════════════════════════════════════════
async function getCalculators(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, slug, name, short_desc, standards, category, visibility, tier, base_url, paid_features_json, preview_image, display_order " +
    "FROM calculators WHERE tier != 'archived' ORDER BY display_order, slug"
  ).all();
  return json({ calculators: results });
}

async function getPricingRules(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, match_type, period, count_min, count_max, calc_ids_json, price_usd, discount_pct, ls_variant_id, badge, display_order " +
    "FROM pricing_rules WHERE active = 1 ORDER BY display_order, id"
  ).all();
  return json({ rules: results });
}

async function getArticles(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, slug, title, excerpt, cover_image, tags_json, published_at " +
    "FROM articles WHERE status = 'published' ORDER BY published_at DESC LIMIT 100"
  ).all();
  return json({ articles: results });
}

async function getArticle(env, slug) {
  const row = await env.DB.prepare(
    "SELECT id, slug, title, excerpt, body_md, cover_image, tags_json, published_at " +
    "FROM articles WHERE status = 'published' AND slug = ?"
  ).bind(slug).first();
  if (!row) return err("article not found", 404);
  return json({ article: row });
}

// ════════════════════════════════════════════════════════════════════════
// AUTH (passwordless magic-link)
// ════════════════════════════════════════════════════════════════════════
async function authRequest(req, env) {
  const { email, redirect } = await req.json();
  if (!validEmail(email)) return err("invalid email");
  const token = randomToken(32);
  const expires = now() + 30 * 60 * 1000; // 30 min
  await env.DB.prepare(
    "INSERT INTO auth_tokens (token, email, purpose, expires_at, created_at) VALUES (?, ?, 'magic_link', ?, ?)"
  ).bind(token, email.toLowerCase(), expires, now()).run();
  const callbackUrl = `${env.SITE_URL || "https://ieccalc.com"}/api/auth/callback?t=${token}` +
                      (redirect ? `&r=${encodeURIComponent(redirect)}` : "");
  await sendMagicLinkEmail(email, callbackUrl, env);
  return json({ ok: true, sent_to: email });
}

async function authCallback(req, env, url) {
  const token = url.searchParams.get("t");
  const redirect = url.searchParams.get("r") || "/account/";
  if (!token) return err("missing token");
  const row = await env.DB.prepare(
    "SELECT * FROM auth_tokens WHERE token = ? AND purpose = 'magic_link'"
  ).bind(token).first();
  if (!row) return err("invalid token", 401);
  if (row.consumed_at) return err("token already used", 401);
  if (row.expires_at < now()) return err("token expired", 401);

  // Mark consumed and upsert user
  await env.DB.prepare("UPDATE auth_tokens SET consumed_at = ? WHERE token = ?")
    .bind(now(), token).run();
  await env.DB.prepare(
    "INSERT INTO users (email, created_at, last_login_at) VALUES (?, ?, ?) " +
    "ON CONFLICT(email) DO UPDATE SET last_login_at = excluded.last_login_at"
  ).bind(row.email, now(), now()).run();

  // Issue session token (30 days)
  const sessionToken = randomToken(32);
  const sessionExpires = now() + 30 * 86400 * 1000;
  await env.DB.prepare(
    "INSERT INTO auth_tokens (token, email, purpose, expires_at, created_at) VALUES (?, ?, 'session', ?, ?)"
  ).bind(sessionToken, row.email, sessionExpires, now()).run();

  const cookie = `iec_sess=${sessionToken}; Domain=.ieccalc.com; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${30 * 86400}`;
  return new Response(null, {
    status: 302,
    headers: {
      "Location": redirect,
      "Set-Cookie": cookie,
      ...corsHeaders(req),
    },
  });
}

async function authSignout(req, env) {
  const sess = readSessionCookie(req);
  if (sess) {
    await env.DB.prepare("UPDATE auth_tokens SET consumed_at = ? WHERE token = ? AND purpose = 'session'")
      .bind(now(), sess).run();
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "iec_sess=; Domain=.ieccalc.com; Path=/; Max-Age=0",
      ...corsHeaders(req),
    },
  });
}

async function getSessionUser(req, env) {
  const sess = readSessionCookie(req);
  if (!sess) return null;
  const row = await env.DB.prepare(
    "SELECT email FROM auth_tokens WHERE token = ? AND purpose = 'session' AND expires_at > ? AND consumed_at IS NULL"
  ).bind(sess, now()).first();
  if (!row) return null;
  const user = await env.DB.prepare("SELECT id, email, name, marketing_optin, created_at FROM users WHERE email = ?")
    .bind(row.email).first();
  return user || null;
}

async function me(req, env) {
  const user = await getSessionUser(req, env);
  if (!user) return json({ authenticated: false });
  const { results: licenses } = await env.DB.prepare(
    "SELECT l.id, l.calc_id, c.slug AS calc_slug, c.name AS calc_name, l.period, l.starts_at, l.expires_at, l.revoked, l.source " +
    "FROM licenses l JOIN calculators c ON c.id = l.calc_id " +
    "WHERE l.user_id = ? AND l.revoked = 0 AND (l.expires_at IS NULL OR l.expires_at > ?) " +
    "ORDER BY l.expires_at IS NULL DESC, l.expires_at DESC"
  ).bind(user.id, now()).all();
  // Check admin status
  const adminRow = await env.DB.prepare("SELECT role FROM admin_users WHERE email = ?").bind(user.email).first();
  return json({ authenticated: true, user, licenses, isAdmin: !!adminRow, adminRole: adminRow?.role || null });
}

// ════════════════════════════════════════════════════════════════════════
// OAuth (OpenID Connect — Google + LinkedIn)
// ════════════════════════════════════════════════════════════════════════
const OAUTH = {
  google: {
    authz:    "https://accounts.google.com/o/oauth2/v2/auth",
    token:    "https://oauth2.googleapis.com/token",
    userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
    scope:    "openid email profile",
    idEnv:    "GOOGLE_CLIENT_ID",
    secEnv:   "GOOGLE_CLIENT_SECRET",
  },
  linkedin: {
    authz:    "https://www.linkedin.com/oauth/v2/authorization",
    token:    "https://www.linkedin.com/oauth/v2/accessToken",
    userinfo: "https://api.linkedin.com/v2/userinfo",
    scope:    "openid email profile",
    idEnv:    "LINKEDIN_CLIENT_ID",
    secEnv:   "LINKEDIN_CLIENT_SECRET",
  },
};

async function oauthStart(req, env, url, provider) {
  const cfg = OAUTH[provider];
  if (!cfg) return err("unknown provider", 404);
  const clientId = env[cfg.idEnv];
  if (!clientId) return err(`${provider} OAuth not configured (missing ${cfg.idEnv})`, 503);

  const state = randomToken(16);
  const redirect = url.searchParams.get("r") || "/account/";
  // Store state in short-lived auth_tokens row so callback can validate it
  await env.DB.prepare(
    "INSERT INTO auth_tokens (token, email, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(state, redirect, `oauth_state_${provider}`, now() + 10 * 60 * 1000, now()).run();

  const redirectUri = `${siteApi(env)}/auth/${provider}/callback`;
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         cfg.scope,
    state,
  });
  return Response.redirect(`${cfg.authz}?${params.toString()}`, 302);
}

async function oauthCallback(req, env, url, provider) {
  const cfg = OAUTH[provider];
  if (!cfg) return err("unknown provider", 404);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return err("missing code or state");

  // Validate state
  const stateRow = await env.DB.prepare(
    "SELECT email AS redirect_to, consumed_at, expires_at FROM auth_tokens WHERE token = ? AND purpose = ?"
  ).bind(state, `oauth_state_${provider}`).first();
  if (!stateRow) return err("invalid state", 401);
  if (stateRow.consumed_at) return err("state already used", 401);
  if (stateRow.expires_at < now()) return err("state expired", 401);
  await env.DB.prepare("UPDATE auth_tokens SET consumed_at = ? WHERE token = ?").bind(now(), state).run();

  const redirectUri = `${siteApi(env)}/auth/${provider}/callback`;
  // Exchange code for access_token
  const tokenResp = await fetch(cfg.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id:     env[cfg.idEnv],
      client_secret: env[cfg.secEnv],
    }).toString(),
  });
  if (!tokenResp.ok) {
    const detail = await tokenResp.text();
    console.error(`${provider} token exchange failed:`, detail);
    return err(`${provider} token exchange failed: ${detail.slice(0, 200)}`, 502);
  }
  const tokenJson = await tokenResp.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) return err("no access_token in response", 502);

  // Fetch userinfo
  const uiResp = await fetch(cfg.userinfo, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });
  if (!uiResp.ok) {
    const detail = await uiResp.text();
    console.error(`${provider} userinfo failed:`, detail);
    return err(`${provider} userinfo failed`, 502);
  }
  const profile = await uiResp.json();
  const email = (profile.email || "").toLowerCase();
  if (!email) return err(`${provider} did not return an email — make sure email scope is granted`, 400);
  const name = profile.name || profile.given_name || null;

  // Upsert user
  await env.DB.prepare(
    "INSERT INTO users (email, name, created_at, last_login_at) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(email) DO UPDATE SET name = COALESCE(users.name, excluded.name), last_login_at = excluded.last_login_at"
  ).bind(email, name, now(), now()).run();

  // Issue session
  const sessionToken = randomToken(32);
  const sessionExpires = now() + 30 * 86400 * 1000;
  await env.DB.prepare(
    "INSERT INTO auth_tokens (token, email, purpose, expires_at, created_at) VALUES (?, ?, 'session', ?, ?)"
  ).bind(sessionToken, email, sessionExpires, now()).run();

  const cookie = `iec_sess=${sessionToken}; Domain=.ieccalc.com; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${30 * 86400}`;
  const redirectTo = stateRow.redirect_to || "/account/";
  return new Response(null, {
    status: 302,
    headers: {
      "Location": `${env.SITE_URL || "https://ieccalc.com"}${redirectTo}`,
      "Set-Cookie": cookie,
      ...corsHeaders(req),
    },
  });
}

function siteApi(env) {
  // api.ieccalc.com — derived from SITE_URL host, or hard-coded if not set
  const site = env.SITE_URL || "https://ieccalc.com";
  return site.replace("://", "://api.").replace("api.www.", "api.");
}

// ════════════════════════════════════════════════════════════════════════
// CART / CHECKOUT
// ════════════════════════════════════════════════════════════════════════
async function cartQuote(req, env) {
  const { items } = await req.json();
  return json(await computeCartQuote(env, items));
}

async function computeCartQuote(env, items) {
  // items: [{calc_slug, period}, ...]
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "empty cart" };
  }
  const period = items[0].period;
  if (!items.every(i => i.period === period)) {
    return { error: "all items must share the same period" };
  }
  if (!["day", "month", "year", "lifetime"].includes(period)) {
    return { error: "invalid period" };
  }

  const { results: calcs } = await env.DB.prepare(
    "SELECT id, slug FROM calculators WHERE tier = 'active'"
  ).all();
  const slugToCalc = Object.fromEntries(calcs.map(c => [c.slug, c]));
  const itemCalcs = items.map(i => slugToCalc[i.calc_slug]).filter(Boolean);
  if (itemCalcs.length !== items.length) {
    return { error: "unknown calculator in cart" };
  }
  const itemIds = itemCalcs.map(c => c.id).sort();
  const allIds = calcs.map(c => c.id).sort();

  const { results: rules } = await env.DB.prepare(
    "SELECT * FROM pricing_rules WHERE active = 1 AND period = ? ORDER BY display_order"
  ).bind(period).all();

  // Try rules in order, pick best (lowest total)
  let best = null;
  for (const r of rules) {
    const match = evaluateRule(r, itemIds, allIds);
    if (!match) continue;
    if (!best || match.total < best.total) best = { rule: r, ...match };
  }
  if (!best) {
    // Fall back: per-item rule with no match → no quote
    return { error: "no pricing rule matches this cart — admin must add one" };
  }
  return {
    items: itemCalcs.map(c => ({ calc_id: c.id, calc_slug: c.slug })),
    period,
    rule_id: best.rule.id,
    rule_name: best.rule.name,
    badge: best.rule.badge,
    unit_price: best.rule.price_usd,
    total_usd: best.total,
    ls_variant_id: best.rule.ls_variant_id || null,
  };
}

function evaluateRule(rule, itemIds, allActiveIds) {
  const count = itemIds.length;
  if (rule.match_type === "per_item") {
    return { total: round2(rule.price_usd * count) };
  }
  if (rule.match_type === "bundle_all") {
    if (itemIds.length === allActiveIds.length &&
        itemIds.every((id, i) => id === allActiveIds[i])) {
      return { total: round2(rule.price_usd) };
    }
    return null;
  }
  if (rule.match_type === "bundle_specific") {
    const wanted = JSON.parse(rule.calc_ids_json || "[]").map(Number).sort();
    if (wanted.length === itemIds.length && wanted.every((id, i) => id === itemIds[i])) {
      return { total: round2(rule.price_usd) };
    }
    return null;
  }
  if (rule.match_type === "count_range") {
    if (rule.count_min != null && count < rule.count_min) return null;
    if (rule.count_max != null && count > rule.count_max) return null;
    return { total: round2(rule.price_usd * count) };
  }
  return null;
}

function round2(x) { return Math.round(x * 100) / 100; }

async function cartCheckout(req, env) {
  const body = await req.json();
  const quote = await computeCartQuote(env, body.items);
  if (quote.error) return err(quote.error);
  // If rule has direct LS variant, link to it; otherwise return error
  // (dynamic-price checkout via LS API would be Phase 2).
  if (!quote.ls_variant_id) {
    return err("this cart needs admin to bind an LS variant to the matched pricing rule (id=" + quote.rule_id + ")", 501,
               { quote });
  }
  const sub = env.LS_STORE_SUBDOMAIN || "ieccalc";
  const checkoutUrl = `https://${sub}.lemonsqueezy.com/buy/${quote.ls_variant_id}` +
                      `?embed=1&desc=0&logo=0` +
                      (body.email ? `&checkout[email]=${encodeURIComponent(body.email)}` : "") +
                      `&checkout[custom][cart]=${encodeURIComponent(JSON.stringify(quote.items))}` +
                      `&checkout[custom][rule_id]=${quote.rule_id}`;
  return json({ checkout_url: checkoutUrl, quote });
}

async function saveLead(req, env) {
  const { email, source, calc_slug } = await req.json();
  if (!validEmail(email)) return err("invalid email");
  await env.DB.prepare(
    "INSERT INTO leads (email, source, calc_slug, created_at) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(email, source) DO NOTHING"
  ).bind(email.toLowerCase(), source || "unknown", calc_slug || null, now()).run();
  return json({ ok: true });
}

async function logEvent(req, env) {
  const body = await req.json();
  if (!body.event_type) return err("missing event_type");
  const user = await getSessionUser(req, env).catch(() => null);
  const ipHash = await sha256Hex((req.headers.get("CF-Connecting-IP") || "") + (env.JWT_SECRET || ""));
  await env.DB.prepare(
    "INSERT INTO events (user_id, email, calc_slug, event_type, feature, payload_json, ip_hash, user_agent, created_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    user?.id || null,
    body.email || user?.email || null,
    body.calc_slug || null,
    body.event_type,
    body.feature || null,
    body.payload ? JSON.stringify(body.payload) : null,
    ipHash.slice(0, 16),
    (req.headers.get("User-Agent") || "").slice(0, 200),
    now(),
  ).run();
  return json({ ok: true });
}

// ════════════════════════════════════════════════════════════════════════
// LEMON SQUEEZY WEBHOOK
// ════════════════════════════════════════════════════════════════════════
async function handleWebhook(req, env) {
  const signature = req.headers.get("X-Signature");
  const body = await req.text();
  const valid = await hmacVerifyHex(body, signature, env.LS_WEBHOOK_SIGNING_SECRET);
  if (!valid) return new Response("invalid signature", { status: 401 });

  const event = JSON.parse(body);
  const evtName = event?.meta?.event_name || "";
  const attr = event?.data?.attributes || {};
  const email = (attr.user_email || event?.meta?.custom_data?.email || "").toLowerCase();
  if (!email) return err("no email in event");

  // Parse custom cart data set by /cart/checkout
  const customData = event?.meta?.custom_data || {};
  const cartItems = customData.cart ? safeParse(customData.cart) : null;
  const ruleId = customData.rule_id ? Number(customData.rule_id) : null;

  // Upsert user
  await env.DB.prepare(
    "INSERT INTO users (email, created_at, last_login_at) VALUES (?, ?, ?) " +
    "ON CONFLICT(email) DO UPDATE SET last_login_at = excluded.last_login_at"
  ).bind(email, now(), now()).run();
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();

  if (["order_created", "subscription_created", "subscription_updated", "subscription_resumed"].includes(evtName)) {
    // Resolve cart & period
    let items = cartItems;
    let period = "lifetime";
    if (ruleId) {
      const rule = await env.DB.prepare("SELECT period FROM pricing_rules WHERE id = ?").bind(ruleId).first();
      if (rule) period = rule.period;
    }
    if (!items || items.length === 0) {
      // Fallback: single all-bundle by variant heuristics — buyer didn't go through our cart flow
      const { results: actives } = await env.DB.prepare("SELECT id, slug FROM calculators WHERE tier = 'active'").all();
      items = actives.map(c => ({ calc_id: c.id, calc_slug: c.slug }));
    }
    const orderId = String(attr.identifier || attr.order_number || event?.data?.id || ("ls-" + now()));
    await env.DB.prepare(
      "INSERT INTO orders (user_id, ls_order_id, ls_event, amount_usd, currency, status, items_json, pricing_rule_id, created_at, paid_at) " +
      "VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?) " +
      "ON CONFLICT(ls_order_id) DO UPDATE SET status='paid', paid_at=excluded.paid_at"
    ).bind(
      user.id, orderId, evtName,
      Number(attr.total_usd || attr.total || 0) / 100,
      attr.currency || "USD",
      JSON.stringify(items), ruleId, now(), now()
    ).run();
    const order = await env.DB.prepare("SELECT id FROM orders WHERE ls_order_id = ?").bind(orderId).first();

    const expires = computeExpires(period);
    for (const it of items) {
      const calcId = it.calc_id || (await env.DB.prepare("SELECT id FROM calculators WHERE slug = ?").bind(it.calc_slug).first())?.id;
      if (!calcId) continue;
      await env.DB.prepare(
        "INSERT INTO licenses (user_id, calc_id, order_id, period, starts_at, expires_at, source, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, 'purchase', ?)"
      ).bind(user.id, calcId, order.id, period, now(), expires, now()).run();
    }

    // Issue legacy JWT for backward-compat license.js
    const jwt = await signJwt({ email, plan: period, exp: expires ? Math.floor(expires / 1000) : 0 }, env.JWT_SECRET);
    await env.LICENSES?.put?.(email, JSON.stringify({ jwt, plan: period, expires, revoked: false }),
      { expirationTtl: expires ? Math.max(Math.floor((expires - now()) / 1000), 60) : 100 * 365 * 86400 });
    await sendPurchaseEmail(email, jwt, period, items, env);
  } else if (["subscription_cancelled", "subscription_expired"].includes(evtName)) {
    await env.DB.prepare(
      "UPDATE licenses SET revoked = 1, revoked_reason = ? WHERE user_id = ? AND source = 'purchase' AND (expires_at IS NULL OR expires_at > ?)"
    ).bind(evtName, user.id, now()).run();
  }

  return json({ ok: true, processed: evtName });
}

function computeExpires(period) {
  const t = now();
  if (period === "day")      return t +       24 * 3600 * 1000;
  if (period === "month")    return t +  30 * 24 * 3600 * 1000;
  if (period === "year")     return t + 365 * 24 * 3600 * 1000;
  if (period === "lifetime") return null;
  return null;
}

// ════════════════════════════════════════════════════════════════════════
// LEGACY v1
// ════════════════════════════════════════════════════════════════════════
async function legacyVerify(req, env, url) {
  const token = url.searchParams.get("token");
  const calcSlug = url.searchParams.get("calc");
  if (!token) return err("missing token");
  const result = await verifyJwt(token, env.JWT_SECRET);
  if (!result.valid) return json(result, { status: 401 });

  // If calc_slug given, also check D1 entitlement
  let entitled = true;
  if (calcSlug) {
    const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(result.payload.email).first();
    if (user) {
      const lic = await env.DB.prepare(
        "SELECT id FROM licenses l JOIN calculators c ON c.id = l.calc_id " +
        "WHERE l.user_id = ? AND c.slug = ? AND l.revoked = 0 AND (l.expires_at IS NULL OR l.expires_at > ?)"
      ).bind(user.id, calcSlug, now()).first();
      entitled = !!lic;
    }
  }
  return json({ valid: true, entitled, ...result.payload });
}

async function legacyRestore(req, env) {
  const { email } = await req.json();
  if (!validEmail(email)) return err("invalid email");
  // Replace v1 KV flow with magic-link flow (login)
  return authRequest(new Request(req.url, { method: "POST", body: JSON.stringify({ email }) }), env);
}

// ════════════════════════════════════════════════════════════════════════
// ADMIN
// ════════════════════════════════════════════════════════════════════════
async function requireAdmin(req, env) {
  // 1) X-Admin-Key header (machine-to-machine)
  const headerKey = req.headers.get("X-Admin-Key");
  if (headerKey && env.ADMIN_API_KEY && timingSafeEqual(headerKey, env.ADMIN_API_KEY)) return true;
  // 2) Logged-in user whose email is in admin_users
  const user = await getSessionUser(req, env);
  if (user) {
    const row = await env.DB.prepare("SELECT 1 FROM admin_users WHERE email = ?").bind(user.email).first();
    if (row) return true;
  }
  // 3) Cloudflare Access JWT header (CF Access protected route)
  const cfJwt = req.headers.get("Cf-Access-Jwt-Assertion");
  if (cfJwt) {
    // Trust CF Access — if the JWT is present, CF has already authenticated.
    // For strict verification, validate against env.CF_ACCESS_AUD with crypto.
    return true;
  }
  return err("admin auth required", 401);
}

async function adminRouter(req, env, url, path) {
  const seg = path.split("/").filter(Boolean); // ['admin', 'calculators', '5']
  const resource = seg[1];
  const id = seg[2];
  const action = seg[3];
  const method = req.method;

  const handlers = {
    calculators:    { table: "calculators",    listCols: "*" },
    "pricing-rules":{ table: "pricing_rules",  listCols: "*" },
    articles:       { table: "articles",       listCols: "*" },
    posts:          { table: "posts",          listCols: "*" },
    videos:         { table: "videos",         listCols: "*" },
    presentations:  { table: "presentations",  listCols: "*" },
    "presentation-slides": { table: "presentation_slides", listCols: "*" },
    "forum-categories":  { table: "forum_categories",  listCols: "*" },
    "forum-threads":     { table: "forum_threads",     listCols: "*" },
    "forum-replies":     { table: "forum_replies",     listCols: "*" },
    "settings":     { table: "site_settings",  listCols: "*" },
    "projects":     { table: "projects",       listCols: "*" },
    "network-schemes":   { table: "network_schemes",   listCols: "*" },
    licenses:       { table: "licenses",       listCols: "*" },
    leads:          { table: "leads",          listCols: "*" },
    orders:         { table: "orders",         listCols: "*" },
    users:          { table: "users",          listCols: "*" },
    campaigns:      { table: "email_campaigns",listCols: "*" },
  };

  if (resource === "analytics" && id === "summary" && method === "GET") return adminAnalyticsSummary(env);
  if (resource === "events" && method === "GET") return adminEvents(env, url);
  // site_settings uses string key as PK — handle specially
  if (resource === "settings" && id && method === "PUT") {
    const body = await req.json();
    if (typeof body.value !== "string") return err("missing value");
    await env.DB.prepare("UPDATE site_settings SET value = ?, updated_at = ? WHERE key = ?")
      .bind(body.value, now(), decodeURIComponent(id)).run();
    return json({ ok: true });
  }
  if (resource === "settings" && !id && method === "GET") {
    const { results } = await env.DB.prepare("SELECT key, value, kind, description, updated_at FROM site_settings ORDER BY key").all();
    return json({ items: results });
  }
  if (resource === "campaigns" && action === "send" && method === "POST") return adminCampaignSend(env, Number(id));

  const h = handlers[resource];
  if (!h) return err("unknown admin resource: " + resource, 404);

  if (!id && method === "GET")    return adminList(env, h, url);
  if (!id && method === "POST")   return adminCreate(env, h, await req.json());
  if (id && method === "GET")     return adminGet(env, h, Number(id));
  if (id && method === "PUT")     return adminUpdate(env, h, Number(id), await req.json());
  if (id && method === "DELETE")  return adminDelete(env, h, Number(id));
  return err("method not allowed", 405);
}

async function adminList(env, h, url) {
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 1000);
  const offset = Number(url.searchParams.get("offset") || 0);
  const { results } = await env.DB.prepare(
    `SELECT ${h.listCols} FROM ${h.table} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();
  return json({ items: results });
}

async function adminGet(env, h, id) {
  const row = await env.DB.prepare(`SELECT * FROM ${h.table} WHERE id = ?`).bind(id).first();
  if (!row) return err("not found", 404);
  return json({ item: row });
}

const TABLES_WITH_UPDATED_AT = new Set([
  "calculators","pricing_rules","articles","posts","videos",
  "presentations","forum_threads","forum_replies","forum_categories",
]);

async function adminCreate(env, h, body) {
  body.created_at = body.created_at || now();
  if (TABLES_WITH_UPDATED_AT.has(h.table)) body.updated_at = now();
  // Auto-publish: if body.publish is true, set published_at and status
  if (body.publish) {
    body.status = "published";
    body.published_at = body.published_at || now();
    delete body.publish;
  }
  const cols = Object.keys(body);
  const placeholders = cols.map(() => "?").join(", ");
  const vals = cols.map(c => body[c]);
  const r = await env.DB.prepare(
    `INSERT INTO ${h.table} (${cols.join(", ")}) VALUES (${placeholders})`
  ).bind(...vals).run();
  return json({ ok: true, id: r.meta?.last_row_id });
}

async function adminUpdate(env, h, id, body) {
  delete body.id;
  if (TABLES_WITH_UPDATED_AT.has(h.table)) body.updated_at = now();
  const cols = Object.keys(body);
  if (!cols.length) return err("nothing to update");
  const set = cols.map(c => `${c} = ?`).join(", ");
  const vals = cols.map(c => body[c]);
  await env.DB.prepare(`UPDATE ${h.table} SET ${set} WHERE id = ?`).bind(...vals, id).run();
  return json({ ok: true });
}

async function adminDelete(env, h, id) {
  await env.DB.prepare(`DELETE FROM ${h.table} WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

async function adminAnalyticsSummary(env) {
  const stats = {};
  const counts = await env.DB.prepare(
    "SELECT " +
    " (SELECT COUNT(*) FROM users) AS users, " +
    " (SELECT COUNT(*) FROM orders WHERE status='paid') AS paid_orders, " +
    " (SELECT IFNULL(SUM(amount_usd),0) FROM orders WHERE status='paid') AS revenue_usd, " +
    " (SELECT COUNT(*) FROM licenses WHERE revoked=0) AS active_licenses, " +
    " (SELECT COUNT(*) FROM leads WHERE subscribed=1) AS subscribed_leads, " +
    " (SELECT COUNT(*) FROM events WHERE created_at > ?) AS events_24h"
  ).bind(now() - 86400 * 1000).first();
  Object.assign(stats, counts);
  const { results: topCalcs } = await env.DB.prepare(
    "SELECT calc_slug, COUNT(*) AS hits FROM events " +
    "WHERE created_at > ? AND calc_slug IS NOT NULL " +
    "GROUP BY calc_slug ORDER BY hits DESC LIMIT 10"
  ).bind(now() - 7 * 86400 * 1000).all();
  stats.top_calculators_7d = topCalcs;
  return json(stats);
}

async function adminEvents(env, url) {
  const type = url.searchParams.get("type");
  const calc = url.searchParams.get("calc");
  const limit = Math.min(Number(url.searchParams.get("limit") || 200), 2000);
  let sql = "SELECT * FROM events WHERE 1=1";
  const args = [];
  if (type) { sql += " AND event_type = ?"; args.push(type); }
  if (calc) { sql += " AND calc_slug = ?"; args.push(calc); }
  sql += " ORDER BY created_at DESC LIMIT ?";
  args.push(limit);
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return json({ events: results });
}

async function adminCampaignSend(env, id) {
  const camp = await env.DB.prepare("SELECT * FROM email_campaigns WHERE id = ?").bind(id).first();
  if (!camp) return err("campaign not found", 404);
  if (camp.status === "sent") return err("already sent");
  // Build segment
  let sql = "SELECT DISTINCT email FROM leads WHERE subscribed = 1";
  if (camp.segment_query) sql += " AND (" + camp.segment_query + ")";
  const { results: recipients } = await env.DB.prepare(sql).all();
  let sent = 0, failed = 0;
  for (const r of recipients) {
    try { await sendCampaignEmail(r.email, camp, env); sent++; }
    catch (e) { console.error("send fail", r.email, e); failed++; }
  }
  await env.DB.prepare(
    "UPDATE email_campaigns SET status='sent', sent_at=?, recipients_count=? WHERE id=?"
  ).bind(now(), sent, id).run();
  return json({ ok: true, sent, failed });
}

// ════════════════════════════════════════════════════════════════════════
// EMAIL
// ════════════════════════════════════════════════════════════════════════
async function sendMagicLinkEmail(email, link, env) {
  const html = `
    <p>Hi,</p>
    <p>Click the button below to sign in to your <b>ieccalc.com</b> account.
    The link is valid for 30 minutes and can be used once.</p>
    <p><a href="${link}" style="display:inline-block;padding:10px 22px;background:#3c4043;color:#fff;text-decoration:none;border-radius:3px;font-family:Arial,sans-serif">Sign in</a></p>
    <p style="font-size:12px;color:#666">Or paste this URL into your browser:<br><code style="word-break:break-all">${link}</code></p>
    <p style="font-size:11px;color:#888">If you didn't request this, just ignore the email.</p>`;
  return resendSend(email, "Sign in to ieccalc.com", html, env);
}

async function sendPurchaseEmail(email, jwt, period, items, env) {
  const itemsHtml = items.map(i => `<li>${i.calc_slug}</li>`).join("");
  const html = `
    <p>Thank you for your purchase on <b>ieccalc.com</b>.</p>
    <p>Plan: <b>${period}</b>. Includes:</p>
    <ul>${itemsHtml}</ul>
    <p>Open your dashboard to manage licenses, download invoices and switch devices:</p>
    <p><a href="${env.SITE_URL || "https://ieccalc.com"}/account/" style="display:inline-block;padding:10px 22px;background:#3c4043;color:#fff;text-decoration:none;border-radius:3px">Open dashboard</a></p>
    <p style="font-size:11px;color:#666">Activate any device by signing in with this email at the calculator page or via the magic-link button on /account/.</p>`;
  return resendSend(email, `Your ieccalc.com ${period} license is ready`, html, env);
}

async function sendCampaignEmail(email, camp, env) {
  return resendSend(email, camp.subject, camp.body_html, env);
}

async function resendSend(to, subject, html, env) {
  if (!env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — email skipped:", to, subject);
    return;
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL || "license@ieccalc.com",
      to, subject, html,
    }),
  });
  if (!resp.ok) {
    console.error("resend failed:", await resp.text());
    throw new Error("email send failed");
  }
}

// ════════════════════════════════════════════════════════════════════════
// CRYPTO / UTILS
// ════════════════════════════════════════════════════════════════════════
function readSessionCookie(req) {
  const c = req.headers.get("Cookie") || "";
  const m = c.match(/(?:^|;\s*)iec_sess=([^;]+)/);
  return m ? m[1] : null;
}

function randomToken(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function validEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

async function signJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const data = `${enc(header)}.${enc(payload)}`;
  const sig  = await hmacSignBase64Url(data, secret);
  return `${data}.${sig}`;
}

async function verifyJwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, error: "malformed token" };
  const data = `${parts[0]}.${parts[1]}`;
  const expectedSig = await hmacSignBase64Url(data, secret);
  if (expectedSig !== parts[2]) return { valid: false, error: "bad signature" };
  const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
  if (payload.exp && Date.now() / 1000 > payload.exp) return { valid: false, error: "expired" };
  return { valid: true, payload };
}

async function hmacSignBase64Url(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function hmacVerifyHex(body, sigHex, secret) {
  if (!sigHex || !secret) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const computed = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(computed, sigHex);
}

// ════════════════════════════════════════════════════════════════════════
// CONTENT — posts, videos, presentations (public reads)
// ════════════════════════════════════════════════════════════════════════
async function listPublished(env, table) {
  const cols = {
    posts: "id, author_id, body_md, image_url, tags_json, published_at",
    videos: "id, slug, title, description, source, youtube_id, video_url, embed_html, cover_url, duration_sec, tags_json, published_at",
    presentations: "id, slug, title, description, cover_url, tags_json, published_at",
  }[table];
  const { results } = await env.DB.prepare(
    `SELECT ${cols} FROM ${table} WHERE status='published' ORDER BY published_at DESC LIMIT 100`
  ).all();
  return json({ items: results, type: table });
}

async function getContentItem(env, table, id, idCol = "id") {
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE ${idCol} = ? AND status='published'`).bind(id).first();
  if (!row) return err("not found", 404);
  return json({ item: row });
}

async function getPresentation(env, slug) {
  const p = await env.DB.prepare("SELECT * FROM presentations WHERE slug = ? AND status='published'").bind(slug).first();
  if (!p) return err("not found", 404);
  const { results: slides } = await env.DB.prepare(
    "SELECT id, idx, image_url, caption FROM presentation_slides WHERE presentation_id = ? ORDER BY idx"
  ).bind(p.id).all();
  return json({ item: p, slides });
}

async function contentFeed(env, url) {
  const limit = Math.min(Number(url.searchParams.get("limit") || 30), 100);
  const sql = `
    SELECT 'article' AS type, id, slug AS key, title, excerpt AS preview, cover_image AS cover, published_at FROM articles WHERE status='published'
    UNION ALL
    SELECT 'post' AS type, id, CAST(id AS TEXT) AS key, NULL AS title, body_md AS preview, image_url AS cover, published_at FROM posts WHERE status='published'
    UNION ALL
    SELECT 'video' AS type, id, slug AS key, title, description AS preview, cover_url AS cover, published_at FROM videos WHERE status='published'
    UNION ALL
    SELECT 'presentation' AS type, id, slug AS key, title, description AS preview, cover_url AS cover, published_at FROM presentations WHERE status='published'
    ORDER BY published_at DESC
    LIMIT ?
  `;
  const { results } = await env.DB.prepare(sql).bind(limit).all();
  return json({ feed: results });
}

// ════════════════════════════════════════════════════════════════════════
// COMMENTS (polymorphic)
// ════════════════════════════════════════════════════════════════════════
async function listComments(env, url) {
  const target_type = url.searchParams.get("type");
  const target_id = Number(url.searchParams.get("id") || 0);
  if (!target_type || !target_id) return err("missing type or id");
  const { results } = await env.DB.prepare(
    "SELECT c.id, c.author_id, u.email AS author_email, u.name AS author_name, c.parent_id, c.body_md, c.votes_up, c.votes_down, c.created_at " +
    "FROM comments c LEFT JOIN users u ON u.id = c.author_id " +
    "WHERE c.target_type = ? AND c.target_id = ? AND c.deleted = 0 " +
    "ORDER BY c.created_at"
  ).bind(target_type, target_id).all();
  return json({ comments: results });
}

async function createComment(req, env) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  const { target_type, target_id, parent_id, body_md } = await req.json();
  if (!target_type || !target_id || !body_md) return err("missing fields");
  if (body_md.length > 4000) return err("body too long");
  const r = await env.DB.prepare(
    "INSERT INTO comments (target_type, target_id, author_id, parent_id, body_md, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(target_type, Number(target_id), user.id, parent_id || null, body_md, now(), now()).run();
  return json({ ok: true, id: r.meta?.last_row_id });
}

async function voteComment(req, env, id) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  const { direction } = await req.json();
  const dir = direction > 0 ? 1 : -1;
  await env.DB.prepare(
    "INSERT INTO comment_votes (comment_id, user_id, direction, created_at) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(comment_id, user_id) DO UPDATE SET direction = excluded.direction"
  ).bind(id, user.id, dir, now()).run();
  const tot = await env.DB.prepare(
    "SELECT SUM(CASE WHEN direction>0 THEN 1 ELSE 0 END) AS up, SUM(CASE WHEN direction<0 THEN 1 ELSE 0 END) AS dn FROM comment_votes WHERE comment_id = ?"
  ).bind(id).first();
  await env.DB.prepare("UPDATE comments SET votes_up = ?, votes_down = ? WHERE id = ?")
    .bind(tot.up || 0, tot.dn || 0, id).run();
  return json({ ok: true, votes_up: tot.up || 0, votes_down: tot.dn || 0 });
}

// ════════════════════════════════════════════════════════════════════════
// FORUM
// ════════════════════════════════════════════════════════════════════════
async function forumCategories(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, slug, name, description, icon, thread_count, last_activity FROM forum_categories ORDER BY display_order, id"
  ).all();
  return json({ categories: results });
}

async function forumThreads(env, catSlug, url) {
  const cat = await env.DB.prepare("SELECT id FROM forum_categories WHERE slug = ?").bind(catSlug).first();
  if (!cat) return err("category not found", 404);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
  const { results } = await env.DB.prepare(
    "SELECT t.id, t.slug, t.title, t.pinned, t.locked, t.views, t.reply_count, t.last_reply_at, t.created_at, " +
    "       u.email AS author_email, u.name AS author_name " +
    "FROM forum_threads t LEFT JOIN users u ON u.id = t.author_id " +
    "WHERE t.category_id = ? ORDER BY t.pinned DESC, t.last_reply_at DESC, t.created_at DESC LIMIT ?"
  ).bind(cat.id, limit).all();
  return json({ category_id: cat.id, threads: results });
}

async function forumThread(env, id) {
  const t = await env.DB.prepare(
    "SELECT t.*, c.slug AS category_slug, c.name AS category_name, u.email AS author_email, u.name AS author_name " +
    "FROM forum_threads t " +
    "JOIN forum_categories c ON c.id = t.category_id " +
    "LEFT JOIN users u ON u.id = t.author_id " +
    "WHERE t.id = ?"
  ).bind(id).first();
  if (!t) return err("thread not found", 404);
  await env.DB.prepare("UPDATE forum_threads SET views = views + 1 WHERE id = ?").bind(id).run();
  return json({ thread: t });
}

async function forumReplies(env, threadId) {
  const { results } = await env.DB.prepare(
    "SELECT r.id, r.parent_id, r.body_md, r.votes_up, r.votes_down, r.created_at, r.deleted, " +
    "       u.email AS author_email, u.name AS author_name " +
    "FROM forum_replies r LEFT JOIN users u ON u.id = r.author_id " +
    "WHERE r.thread_id = ? ORDER BY r.created_at"
  ).bind(threadId).all();
  return json({ replies: results });
}

async function forumCreateThread(req, env, catSlug) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  const { title, body_md } = await req.json();
  if (!title || !body_md) return err("missing title or body");
  const cat = await env.DB.prepare("SELECT id FROM forum_categories WHERE slug = ?").bind(catSlug).first();
  if (!cat) return err("category not found", 404);
  const slug = title.toLowerCase().replace(/[^a-z0-9\-\s]/g, "").trim().replace(/\s+/g, "-").slice(0, 80) + "-" + Math.random().toString(36).slice(2, 6);
  const r = await env.DB.prepare(
    "INSERT INTO forum_threads (category_id, author_id, slug, title, body_md, created_at, updated_at, last_reply_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(cat.id, user.id, slug, title, body_md, now(), now(), now()).run();
  await env.DB.prepare("UPDATE forum_categories SET thread_count = thread_count + 1, last_activity = ? WHERE id = ?")
    .bind(now(), cat.id).run();
  return json({ ok: true, id: r.meta?.last_row_id, slug });
}

async function forumCreateReply(req, env, threadId) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  const { body_md, parent_id } = await req.json();
  if (!body_md) return err("missing body");
  const thread = await env.DB.prepare("SELECT category_id, locked FROM forum_threads WHERE id = ?").bind(threadId).first();
  if (!thread) return err("thread not found", 404);
  if (thread.locked) return err("thread locked", 403);
  const r = await env.DB.prepare(
    "INSERT INTO forum_replies (thread_id, author_id, parent_id, body_md, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(threadId, user.id, parent_id || null, body_md, now(), now()).run();
  await env.DB.prepare(
    "UPDATE forum_threads SET reply_count = reply_count + 1, last_reply_at = ?, last_reply_by = ? WHERE id = ?"
  ).bind(now(), user.id, threadId).run();
  await env.DB.prepare("UPDATE forum_categories SET last_activity = ? WHERE id = ?")
    .bind(now(), thread.category_id).run();
  return json({ ok: true, id: r.meta?.last_row_id });
}

async function forumVoteReply(req, env, replyId) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  const { direction } = await req.json();
  const dir = direction > 0 ? 1 : -1;
  await env.DB.prepare(
    "INSERT INTO forum_reply_votes (reply_id, user_id, direction, created_at) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(reply_id, user_id) DO UPDATE SET direction = excluded.direction"
  ).bind(replyId, user.id, dir, now()).run();
  const tot = await env.DB.prepare(
    "SELECT SUM(CASE WHEN direction>0 THEN 1 ELSE 0 END) AS up, SUM(CASE WHEN direction<0 THEN 1 ELSE 0 END) AS dn FROM forum_reply_votes WHERE reply_id = ?"
  ).bind(replyId).first();
  await env.DB.prepare("UPDATE forum_replies SET votes_up = ?, votes_down = ? WHERE id = ?")
    .bind(tot.up || 0, tot.dn || 0, replyId).run();
  return json({ ok: true, votes_up: tot.up || 0, votes_down: tot.dn || 0 });
}

// ════════════════════════════════════════════════════════════════════════
// MEDIA (R2 — requires MEDIA binding)
// ════════════════════════════════════════════════════════════════════════
async function mediaUploadInit(req, env) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  if (!env.MEDIA) return err("R2 not configured (env.MEDIA binding missing)", 503);
  const { filename } = await req.json();
  if (!filename) return err("missing filename");
  const d = new Date();
  const ym = `${d.getUTCFullYear()}/${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  const key = `${ym}/u${user.id}_${randomToken(6)}_${filename.replace(/[^\w.\-]/g,'_').slice(0,80)}`;
  return json({ ok: true, key, upload_url: `/media/upload-direct?key=${encodeURIComponent(key)}`,
                 public_url: `/media/file/${key}` });
}

async function mediaServe(env, key) {
  if (!env.MEDIA) return err("R2 not configured", 503);
  const obj = await env.MEDIA.get(key);
  if (!obj) return err("not found", 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
}

// ════════════════════════════════════════════════════════════════════════
// PROJECTS — user-scoped CRUD
// ════════════════════════════════════════════════════════════════════════
async function listProjects(req, env) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  const { results } = await env.DB.prepare(
    "SELECT id, name, kind, description, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC"
  ).bind(user.id).all();
  return json({ projects: results });
}

async function createProject(req, env) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  const { name, kind, description } = await req.json();
  if (!name) return err("missing name");

  // Enforce free-tier project limit (skip for admins)
  const isAdmin = await env.DB.prepare("SELECT 1 FROM admin_users WHERE email = ?").bind(user.email).first();
  if (!isAdmin) {
    const settings = await loadSettings(env);
    const limit = parseInt(settings.free_max_projects || "0", 10);
    if (limit > 0) {
      // Paid users get more — count by max(license-permitted, free limit)
      const hasAnyLicense = await env.DB.prepare(
        "SELECT 1 FROM licenses WHERE user_id = ? AND revoked = 0 AND (expires_at IS NULL OR expires_at > ?)"
      ).bind(user.id, now()).first();
      if (!hasAnyLicense) {
        const { count } = await env.DB.prepare("SELECT COUNT(*) AS count FROM projects WHERE user_id = ?")
          .bind(user.id).first();
        if (count >= limit) {
          return err(`Free tier limit reached: max ${limit} project(s). Upgrade to add more.`, 402);
        }
      }
    }
  }

  const r = await env.DB.prepare(
    "INSERT INTO projects (user_id, name, kind, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(user.id, name, kind || "grid", description || null, now(), now()).run();
  return json({ ok: true, id: r.meta?.last_row_id });
}

// Helper: load all site settings as a flat map
async function loadSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM site_settings").all();
  const out = {};
  for (const r of results) out[r.key] = r.value;
  return out;
}

// Public settings (only safe-to-expose keys)
async function publicSettings(env) {
  const s = await loadSettings(env);
  return json({
    free_max_projects: parseInt(s.free_max_projects || "0", 10),
    free_max_calc_runs: parseInt(s.free_max_calc_runs || "0", 10),
    free_max_elements: parseInt(s.free_max_elements || "0", 10),
    free_allowed_calcs: (function() { try { return JSON.parse(s.free_allowed_calcs || "[]"); } catch(e) { return []; } })(),
  });
}

async function getProject(req, env, id) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  const row = await env.DB.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").bind(id, user.id).first();
  if (!row) return err("not found", 404);
  return json({ project: row });
}

async function updateProject(req, env, id) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  const body = await req.json();
  delete body.id; delete body.user_id; delete body.created_at;
  body.updated_at = now();
  const cols = Object.keys(body); if (!cols.length) return err("nothing to update");
  await env.DB.prepare(
    `UPDATE projects SET ${cols.map(c => `${c} = ?`).join(", ")} WHERE id = ? AND user_id = ?`
  ).bind(...cols.map(c => body[c]), id, user.id).run();
  return json({ ok: true });
}

async function deleteProject(req, env, id) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  await env.DB.prepare("DELETE FROM network_schemes WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND user_id = ?)")
    .bind(id, user.id).run();
  await env.DB.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").bind(id, user.id).run();
  return json({ ok: true });
}

// ════════════════════════════════════════════════════════════════════════
// NETWORK SCHEMES
// ════════════════════════════════════════════════════════════════════════
async function ownsProject(env, userId, projectId) {
  const row = await env.DB.prepare("SELECT 1 FROM projects WHERE id = ? AND user_id = ?").bind(projectId, userId).first();
  return !!row;
}
async function ownsScheme(env, userId, schemeId) {
  const row = await env.DB.prepare(
    "SELECT s.id FROM network_schemes s JOIN projects p ON p.id = s.project_id WHERE s.id = ? AND p.user_id = ?"
  ).bind(schemeId, userId).first();
  return !!row;
}

async function listNetworks(req, env, projectId) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  if (!(await ownsProject(env, user.id, projectId))) return err("forbidden", 403);
  const { results } = await env.DB.prepare(
    "SELECT id, name, kind, updated_at, created_at FROM network_schemes WHERE project_id = ? ORDER BY updated_at DESC"
  ).bind(projectId).all();
  return json({ networks: results });
}

async function createNetwork(req, env, projectId) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  if (!(await ownsProject(env, user.id, projectId))) return err("forbidden", 403);
  const { name, kind, schema_json } = await req.json();
  if (!name) return err("missing name");
  const r = await env.DB.prepare(
    "INSERT INTO network_schemes (project_id, name, kind, schema_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(projectId, name, kind || "grid", schema_json || "{}", now(), now()).run();
  // bump project updated_at
  await env.DB.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").bind(now(), projectId).run();
  return json({ ok: true, id: r.meta?.last_row_id });
}

async function getNetwork(req, env, id) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  if (!(await ownsScheme(env, user.id, id))) return err("forbidden", 403);
  const row = await env.DB.prepare("SELECT * FROM network_schemes WHERE id = ?").bind(id).first();
  if (!row) return err("not found", 404);
  return json({ network: row });
}

async function updateNetwork(req, env, id) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  if (!(await ownsScheme(env, user.id, id))) return err("forbidden", 403);
  const body = await req.json();
  delete body.id; delete body.project_id; delete body.created_at;
  body.updated_at = now();
  const cols = Object.keys(body); if (!cols.length) return err("nothing to update");
  await env.DB.prepare(`UPDATE network_schemes SET ${cols.map(c => `${c} = ?`).join(", ")} WHERE id = ?`)
    .bind(...cols.map(c => body[c]), id).run();
  return json({ ok: true });
}

async function deleteNetwork(req, env, id) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  if (!(await ownsScheme(env, user.id, id))) return err("forbidden", 403);
  await env.DB.prepare("DELETE FROM network_schemes WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function calculateNetwork(req, env, id) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  if (!(await ownsScheme(env, user.id, id))) return err("forbidden", 403);
  const { calcs } = await req.json();
  if (!Array.isArray(calcs) || !calcs.length) return err("no calculations selected");

  // Enforce: free user can only run calcs in free_allowed_calcs, unless
  // they own a license for a calculator that covers that calc.
  const isAdmin = await env.DB.prepare("SELECT 1 FROM admin_users WHERE email = ?").bind(user.email).first();
  if (!isAdmin) {
    const settings = await loadSettings(env);
    let freeAllowed = [];
    try { freeAllowed = JSON.parse(settings.free_allowed_calcs || "[]"); } catch (e) {}
    // Licenses the user has (active)
    const { results: licRows } = await env.DB.prepare(
      "SELECT c.slug FROM licenses l JOIN calculators c ON c.id = l.calc_id " +
      "WHERE l.user_id = ? AND l.revoked = 0 AND (l.expires_at IS NULL OR l.expires_at > ?)"
    ).bind(user.id, now()).all();
    const licensedSlugs = new Set(licRows.map(r => r.slug));
    // Map calc kind → calc slug it requires
    const SLUG_BY_CALC = {
      voltage_drop: "001",
      short_circuit: "002",
      grounding: "003",
      ampacity: "004",
      protection: "002",  // protection studies use 002 engine for now
    };
    const denied = calcs.filter(c => !freeAllowed.includes(c) && !licensedSlugs.has(SLUG_BY_CALC[c]));
    if (denied.length) {
      return err(`Not allowed: ${denied.join(", ")}. ` +
                 `Free tier includes: ${freeAllowed.join(", ") || "none"}. ` +
                 `Buy a licence to unlock more.`, 402, { denied });
    }
    // Free-run quota
    const limit = parseInt(settings.free_max_calc_runs || "0", 10);
    if (limit > 0 && licensedSlugs.size === 0) {
      const { count } = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM network_calc_runs r " +
        "JOIN network_schemes s ON s.id = r.scheme_id JOIN projects p ON p.id = s.project_id " +
        "WHERE p.user_id = ?"
      ).bind(user.id).first();
      if (count >= limit) {
        return err(`Free tier limit reached: max ${limit} calculation runs. Upgrade for unlimited runs.`, 402);
      }
    }
  }

  // Queue all runs (engine wiring is per-calc; voltage_drop wired client-side
  // for Phase 1, other engines come from the existing standalone calculators)
  const runIds = [];
  for (const kind of calcs) {
    const r = await env.DB.prepare(
      "INSERT INTO network_calc_runs (scheme_id, calc_kind, status, created_at) VALUES (?, ?, 'queued', ?)"
    ).bind(id, kind, now()).run();
    runIds.push(r.meta?.last_row_id);
  }
  return json({ ok: true, queued: runIds });
}

async function listNetworkReports(req, env, id) {
  const user = await getSessionUser(req, env);
  if (!user) return err("auth required", 401);
  if (!(await ownsScheme(env, user.id, id))) return err("forbidden", 403);
  const { results } = await env.DB.prepare(
    "SELECT id, name, format, file_url, generated_at FROM network_reports WHERE scheme_id = ? ORDER BY generated_at DESC"
  ).bind(id).all();
  return json({ reports: results });
}
