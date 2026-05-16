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

const CORS_ORIGIN = "*"; // tighten to https://ieccalc.com after deploy

function corsHeaders(req) {
  return {
    "Access-Control-Allow-Origin":  CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Signature, X-Admin-Key",
    "Access-Control-Allow-Credentials": "true",
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

  // ── Cart / leads / events ──────────────────────────────────────────────
  if (path === "/cart/quote" && method === "POST") return cartQuote(req, env);
  if (path === "/cart/checkout" && method === "POST") return cartCheckout(req, env);
  if (path === "/leads" && method === "POST") return saveLead(req, env);
  if (path === "/events" && method === "POST") return logEvent(req, env);

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
    "SELECT id, slug, name, short_desc, standards, category, tier, base_url, paid_features_json, preview_image, display_order " +
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

  const cookie = `iec_sess=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`;
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
      "Set-Cookie": "iec_sess=; Path=/; Max-Age=0",
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
  return json({ authenticated: true, user, licenses });
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
    licenses:       { table: "licenses",       listCols: "*" },
    leads:          { table: "leads",          listCols: "*" },
    orders:         { table: "orders",         listCols: "*" },
    users:          { table: "users",          listCols: "*" },
    campaigns:      { table: "email_campaigns",listCols: "*" },
  };

  if (resource === "analytics" && id === "summary" && method === "GET") return adminAnalyticsSummary(env);
  if (resource === "events" && method === "GET") return adminEvents(env, url);
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

async function adminCreate(env, h, body) {
  body.created_at = body.created_at || now();
  if ("updated_at" in (h.cols || {}) || h.table === "calculators" || h.table === "pricing_rules" || h.table === "articles") {
    body.updated_at = now();
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
  if (["calculators","pricing_rules","articles"].includes(h.table)) body.updated_at = now();
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
