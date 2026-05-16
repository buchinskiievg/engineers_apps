# ieccalc.com — Payment & License Setup Guide

Stack: **Lemon Squeezy** (payments + tax) → **Cloudflare Worker** (license issue / verify) → **Resend** (license-email delivery) → **Cloudflare Pages** (static hosting of calculators).

## Required accounts (one-time)

| Service | URL | Cost | Why |
|---|---|---|---|
| Lemon Squeezy | lemonsqueezy.com | 5% + $0.50 / sale | Merchant of record, handles VAT / Apple Pay / Google Pay / global cards |
| Cloudflare | (already have) | Free for ≤ 100 K req/day, ≤ 100 K KV reads | Worker + Pages + KV + DNS |
| Resend | resend.com | Free 3000 emails/month | License email delivery |

## Step 1 — Lemon Squeezy products (15 min)

1. Sign up / log in at lemonsqueezy.com.
2. **Settings → Stores** → Create store. Name: `ieccalc`. Currency: USD. The store URL becomes `https://ieccalc.lemonsqueezy.com`.
3. **Products → New Product** — create FOUR products:

   | Product name | Type | Price | Variant ID (copy after save) |
   |---|---|---|---|
   | Day pass — ieccalc.com | One-time | $3.99 | `VARIANT_DAY` |
   | Monthly subscription | Subscription, monthly | $12.99 | `VARIANT_MONTH` |
   | Yearly subscription | Subscription, yearly | $119 | `VARIANT_YEAR` |
   | Lifetime | One-time | $319 | `VARIANT_LIFETIME` |

   In each product:
   - Description: brief 2-line text — what the plan unlocks.
   - Enable "Apple Pay" and "Google Pay" toggles.
   - Save → copy the **variant ID** (small number under the variant name).

4. **Settings → Webhooks → New webhook**:
   - URL: `https://api.ieccalc.com/license/webhook` (the Worker route, set up below)
   - Events: ☑ `order_created` ☑ `subscription_created` ☑ `subscription_updated` ☑ `subscription_resumed` ☑ `subscription_cancelled` ☑ `subscription_expired`
   - Generate a **signing secret** (long random string) — copy it for Worker config.

5. **Settings → API → Create API key** — copy it; goes into Worker as `LS_API_KEY`.

## Step 2 — Resend account (5 min)

1. Sign up at resend.com.
2. **Domains → Add Domain** → `ieccalc.com`.
3. Resend gives you DNS records (TXT for SPF, CNAME for DKIM). Add them to Cloudflare DNS for ieccalc.com (you already manage DNS there). Click "Verify".
4. **API Keys → Create** → copy the key as `RESEND_API_KEY`.

## Step 3 — Cloudflare Worker (10 min)

1. Cloudflare dashboard → **Workers & Pages → Create → Worker**.
2. Name: `ieccalc-license`. Click "Deploy" with default code (we'll replace).
3. Open the new Worker → **Edit Code** → paste the contents of `engineers_apps/_lib/worker.js` → Save and Deploy.
4. **Settings → Variables and Secrets** → add the secrets:

   ```
   JWT_SECRET                  = <run "openssl rand -hex 32" — paste 64-char hex>
   LS_WEBHOOK_SIGNING_SECRET   = <from step 1.4>
   LS_API_KEY                  = <from step 1.5>
   RESEND_API_KEY              = <from step 2.4>
   VARIANT_DAY                 = <variant ID from step 1.3>
   VARIANT_MONTH               = <variant ID from step 1.3>
   VARIANT_YEAR                = <variant ID from step 1.3>
   VARIANT_LIFETIME            = <variant ID from step 1.3>
   ```

   (All as **Secret** type, not plaintext.)

5. **KV** → Create Namespace → name `LICENSES`. Open the Worker → Settings → Bindings → Add → Type: KV → Variable name `LICENSES` → Namespace `LICENSES`.

6. **Triggers → Custom Domains → Add** → `api.ieccalc.com`. Cloudflare auto-creates the DNS record (since the zone is already on Cloudflare). Done — Worker is live.

7. Test: `curl https://api.ieccalc.com/health` → should return `{"ok":true,"time":...}`.

## Step 4 — Wire up calculator frontend (5 min)

In `engineers_apps/_lib/upgrade-modal.js`, replace the placeholders at top:

```js
const STORE_SUBDOMAIN = "ieccalc";    // already correct
const PRODUCTS = [
  { id: "day",      ... lsId: "<paste VARIANT_DAY>" },
  { id: "month",    ... lsId: "<paste VARIANT_MONTH>", recommended: true },
  { id: "year",     ... lsId: "<paste VARIANT_YEAR>", savings: "save 24 %" },
  { id: "lifetime", ... lsId: "<paste VARIANT_LIFETIME>" },
];
```

In `engineers_apps/_lib/license.js`, change:

```js
const VERIFY_URL = "https://api.ieccalc.com/license/verify";
```

(already set — no change needed.)

## Step 5 — Cloudflare Pages (host the static site, 10 min)

Currently the site is on GitHub Pages. To migrate:

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → select `buchinskiievg/engineers_apps` repo.
2. Build settings: **Framework: None**, build command: empty, build output directory: `/`.
3. Deploy. Cloudflare assigns a `*.pages.dev` URL.
4. **Custom Domains → Add** → `ieccalc.com` and `www.ieccalc.com`. DNS auto-configured.
5. After deploy succeeds, GitHub Pages can be left as-is (Cloudflare takes priority via DNS) or disabled.

## Step 6 — End-to-end test

1. Open `https://ieccalc.com/003/`. Plan badge shows "Free".
2. Click "Layout mode" → "Sketch". Upgrade modal opens.
3. Click any "Buy" button → Lemon Squeezy checkout, use Apple Pay / Google Pay / test card `4242 4242 4242 4242`.
4. After purchase: email arrives from `license@ieccalc.com` with magic link.
5. Click the magic link → URL opens with `?lic=<JWT>` → license auto-applied → badge changes to "Lifetime" / "Monthly" etc.
6. Sketch editor now opens, .docx full report unlocks.

## Cost summary

For a calculator with **100 paying users / month** averaging $20:
- Revenue: $2,000
- Lemon Squeezy fees: $113 (5.65 %)
- Resend: $0 (well under 3 K emails)
- Cloudflare: $0 (well under free-tier limits)
- **Net: ~$1,887**

## Maintenance

- **License revocation** — open Cloudflare KV → LICENSES namespace → find email → set `revoked: true` in JSON.
- **Manual license issue** (gift / promo) — use the admin panel (Phase 4) or call the Worker `/license/issue` endpoint with admin token.
- **Logs** — Cloudflare Worker → Logs tab shows webhook hits and errors.
