# GearFit

**The right work gear for your trade, bought once.** GearFit helps US tradespeople who pay for their own boots and PPE compare a kit based on their trade, hazards, climate, hours, employer rules, fit and budget. Each recommendation includes documented standards and estimated **cost per month of wear**. Missing compliant products are explicitly reported instead of replaced with a noncompliant alternative.

Business Cup 2.0, Money track.

## What it does

- **Questionnaire** (`/build`): 11 trades, 16 hazards, 4 climates, employer requirements, sizing and budget.
- **Rule-based matching engine** (`src/lib/engine.ts`): mandatory standards, protective features and available sizes are hard filters. Rank by price, estimated cost per month and quality; ties always use product ID. Tiny budgets never relax protection. Separate gloves cover separate tasks, with a warning that they do not combine protection against simultaneous hazards.
- **Kit page** (`/kit?k=…`): every pick explains which standard it meets and why, with swap options (lowest price, lowest cost per month, top quality), totals, and savings vs the cheapest compliant kit.
- **Share without accounts**: the answers are encoded in the URL, so the kit link is permanent and needs no login.
- **Replacement reminders**: one click downloads an `.ics` file with a calendar event per item when it's due for replacement.
- **Catalog**: 150+ real product entries across nine categories, including women's models. `src/data/catalog.json` is the reproducible seed/offline snapshot. Model evidence, price limitations and estimation methodology are in [catalog sources](docs/catalog-sources.md).
- **Supabase Postgres**: request-time catalog reads through a typed, Zod-validated server layer. `products` and `clicks` use RLS and service-only access. When database credentials are absent, APIs and builds use JSON without a database connection.
- **Affiliate clicks**: existing buy links use a server redirect that records clicks when Supabase is configured and adds the affiliate tag from server environment variables.

## API

- `POST /api/recommend` with answers JSON → `{ token, kit }`
- `GET /api/catalog?category=boots` → `{ count, products, trades, hazards }`
- `POST /api/click` with `{ "productId": "tb-pitboss-st", "kitId": "optional-url-safe-token" }` → `{ redirectUrl, tracked }`
- `GET /api/click?productId=tb-pitboss-st` → logs the event and returns a 302 to the retailer (for existing anchors).

All original response fields remain. Products additionally expose `model`, `price_usd`, `price_approximate`, `last_checked`, `lifespan_months`, `sizes`, `climate`, `retailer_url` and `source_url`; picks add `why` while retaining `reasons`. Invalid inputs return 400, JSON bodies over 16 KiB return 413, unknown click products return 404, and configured database failures return 503. A configured-but-empty or malformed database fails visibly; it is never silently replaced by the snapshot. Local clicks return `tracked: false` because they were not persisted.

## Run locally

```bash
npm ci
npm run dev     # http://localhost:3000
npm run catalog:check
npm run lint
npm test        # engine, API, data access, catalog and actual Postgres migration tests
npm run build
```

Use Node.js 24 (see `.nvmrc`; minimum 22.12). Stack: Next.js 15 (App Router), React 19, Tailwind CSS 4, TypeScript, Zod and Vitest. Migration tests run Postgres in-process through PGlite; no Docker, external database or secrets are needed for checks.

## Supabase and Vercel setup

1. In your Supabase project's SQL Editor, apply `supabase/migrations/202611140001_catalog.sql`, then `202611140002_clicks.sql`. These are one-time migrations; rerunning the seed is safe.
2. Copy `.env.example` to `.env.local`, fill in the project's URL and **server** secret API key (or legacy service-role JWT).
3. Run `npm run catalog:check`, then `npm run seed`. The seed validates everything before connecting, upserts by stable ID, updates existing entries and never deletes custom products or click history. Re-running it restores the checked-in snapshot for its IDs.
4. In Vercel, select Node.js 24 and set the same variables for the intended Preview/Production environments. Redeploy after adding/changing env values. No secret should have a `NEXT_PUBLIC_` prefix.
5. Check `GET /api/catalog`, post answers to `/api/recommend`, then `POST /api/click` for a returned product ID. Confirm `tracked: true` and a new `public.clicks` row. See [backend handoff](docs/backend-handoff.md) for smoke checks and the remaining frontend integration.

| Variable | Purpose | Required |
| --- | --- | --- |
| `SUPABASE_URL` | Project API URL; HTTPS in production. Local Supabase may use localhost HTTP. | With a database key |
| `SUPABASE_SECRET_KEY` | Preferred `sb_secret_...` backend API key; sent only via the `apikey` header. | Either this or legacy key |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy service-role JWT alternative. Ignored if `SUPABASE_SECRET_KEY` is present. | Alternative only |
| `AFFILIATE_TAG` | Optional partner identifier appended to the catalog retailer URL. Empty means an ordinary untagged link. | No |
| `AFFILIATE_PARAM` | Partner's query parameter name; defaults to `tag` (Amazon). | No |

An affiliate query tag alone does not establish a partner agreement or guarantee commission. This simple adapter supports one tag/parameter pair; each linked retailer must actually support your configured partnership. Destinations come from validated catalog data, never from a caller-provided URL. Clicks store only product ID, optional kit token, generated event ID and timestamp; events are not unique-user counts, verified purchases, or fraud-resistant analytics.

## Frontend handoff (no pages/components changed)

The APIs read Supabase at request time. Existing `/kit`, `/catalog` and homepage components still import the bundled snapshot synchronously. The wizard navigates using the returned token and currently discards the API kit. The frontend team should use `getProducts()` plus `recommend(answers, products)` in its server pages, or consume the API kit, before database-only catalog edits appear in those views. Existing buy anchors already pass through `/api/click` via `buyUrl()`; POST callers can additionally supply the kit token for attribution. See [exact integration points](docs/backend-handoff.md).

## Data and safety boundaries

Prices are approximate USD estimates and are marked with `price_approximate: true` and a catalog review date, not a live retailer quote. Availability and sizing may change. Lifespans are GearFit planning estimates at 20/40/60 hours per week, interpolated for entered hours; they are not manufacturer replacement intervals. Inspect PPE and follow manufacturer limits, damage/impact replacement rules and employer policy even if an estimate is longer.

Trade rules are conservative buying-guide defaults, not a substitute for a workplace hazard assessment. NFPA 70E is a workplace standard, not a product certification; arc clothing requires ASTM F1506 evidence and a suitable arc rating. Welding helmets, respirators, fall protection and energized-work insulating gloves are outside this catalog. A missing-category warning means the returned kit is incomplete; selected glasses or ordinary gloves cannot substitute for those protections.

## Retention backend deployment

The retention routes implement the frontend's [API contract](docs/api-contract.md). Save now creates a public `/k/<slug>` link, reminders return to `/reminders`, and Stripe returns to `/pro`. This branch includes PR #3's live catalog integration: its `buildKit` uses the live catalog with a bundled snapshot fallback and the page's size relaxation. The earlier frontend handoff above describes the pre-PR #3 state.

Use the existing Supabase project `qcocsowyfyqprfddndcg`. First apply the two catalog/click migrations described above and seed the catalog. **Paste `supabase/retention-setup.sql` into SQL Editor and run it once.** It contains `BEGIN`, the four retention migrations (`20261114100001`–`20261114100004`), a PostgREST schema reload notification, and `COMMIT`. It does not replay or modify PR #2's migrations. Alternatively apply the four individual files in order; use one method only. These migrations have been edited before their first deployment, so do not replay this setup over a previously applied retention schema. Regenerate the combined file with `node scripts/retention-setup.mjs` after any migration edit.

Tables and RPCs are private to the server service role; public responses contain no subscriber addresses or payment tokens except the caller's own checkout response. Public kit links are bearer links: anyone with the slug can view the saved gear. The service API key can read/write data but cannot apply SQL migrations. Never commit `.env.local` or enter a key in chat.

Configure these values in Vercel **Production**, then redeploy. Preview currently has no provider credentials; a successful Preview build does not verify email, billing or persistence. Run the live smoke/demo after #2, #3 and this PR are merged. Builds and the original catalog fallback do not require these services; retention APIs return a redacted 503 when required services are missing.

| Variable | Purpose / default |
| --- | --- |
| `SUPABASE_URL` | Existing shared Supabase project URL |
| `SUPABASE_SECRET_KEY` | Preferred server key (`sb_secret_...`); same precedence as the catalog DAL |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy server key fallback when `SUPABASE_SECRET_KEY` is blank |
| `APP_URL` | Canonical HTTPS origin, e.g. `https://palantirbuisness.vercel.app`; local development may use `http://localhost:3000` |
| `VERCEL_PROJECT_PRODUCTION_URL` | Vercel-provided hostname. When `APP_URL` is blank, links use `https://${VERCEL_PROJECT_PRODUCTION_URL}`. Do not override it with a preview hostname. |
| `VERCEL` | Vercel sets `1`; selects its trusted `x-vercel-forwarded-for` header for rate limits. Other environments share a `local` bucket. |
| `RATE_LIMIT_SECRET` | Recommended random 32+ byte secret for HMAC-hashing IP buckets. If absent, SHA-256 without a salt keeps limits working; this provides weaker privacy against guessed IP addresses. Raw IPs are never stored. |
| `CRON_SECRET` | Required independent random bearer secret for cron and demo calls |
| `RESEND_API_KEY` | Resend server API key |
| `RESEND_FROM` | Sender, e.g. `GearFit <onboarding@resend.dev>` for the account owner's test inbox, or a verified domain sender |
| `REMINDER_TEST_MODE` | `true` enables the authenticated immediate demo; default `false` |
| `STRIPE_SECRET_KEY` | `sk_test_...` only; live keys are rejected; $4 USD/month price is set on the server |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` belonging to the deployed webhook destination |
| `AFFILIATE_TAG`, `AFFILIATE_PARAM` | Existing click configuration; optional tag and parameter name (default `tag`) |
| `NEXT_PUBLIC_API_MOCKS` | Leave unset or `0` in production. `1` simulates missing endpoints for local frontend demos only. |
| `NEXT_PUBLIC_SITE_URL` | Optional public canonical origin for frontend metadata/share previews |
| `VERCEL_URL` | Vercel-provided deployment hostname; the existing frontend's final metadata fallback |

In Stripe **test mode**, create a webhook destination at `${APP_URL}/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Set its signing secret in Vercel. Local `stripe listen --forward-to localhost:3000/api/stripe/webhook` uses a different signing secret. Checkout confirmation retrieves the session and subscription from Stripe, verifies the server checkout binding, and records an active/trialing subscription using `apply_stripe_subscription` even if the webhook is late. The webhook remains necessary for later subscription changes. A redirect alone never establishes server-side Pro. See [Stripe's success-page guidance](https://docs.stripe.com/payments/checkout/custom-success-page).

**Resend's onboarding sender only delivers to the Resend account owner's inbox; other recipients need a verified sending domain.** See [Resend's sender restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain). Use an inbox you control for rehearsal. Vercel cron runs `GET /api/cron/reminders` daily at **08:00 UTC / 13:00 UTC+5** with `Authorization: Bearer CRON_SECRET`. That is after the noon deadline, so use the authenticated demo endpoint during judging.

## Retention API examples

All JSON POSTs require `Content-Type: application/json`, with a 128 KiB limit. Errors use `{ "error": "..." }`; validation can add `fields`. Statuses include 400 invalid input, 401 invalid cron secret, 403 inactive Pro/demo disabled, 404 unknown resource, 409 missing email consent, 413 oversized body, 415 wrong content type, 429 rate limit (with `Retry-After`), and 503 unavailable configuration/provider. Responses are not cached. Rate limits are durable SQL counters shared by Vercel instances.

### Saved kits

`POST /api/kits` accepts the exact `ensureCloudSlug` request:

```json
{
  "answers": { "trade": "plumber", "climate": "mild", "gender": "men", "hoursPerWeek": 40, "budget": "balanced", "extraHazards": [], "employer": [] },
  "token": "eyJ0cmFkZ...",
  "choices": ["", "stale-product"],
  "tradeLabel": "Plumber",
  "items": [],
  "totals": { "upfront": 412, "perMonth": 27.4 }
}
```

Response **201** `{"slug":"AbCdEf123_-x","createdAt":"2026-11-14T10:00:00.000Z"}`. Only validated `answers` and optional `choices` (max 20 product IDs or empty strings) affect storage. `token`, `tradeLabel`, `items`, and `totals` are accepted and discarded. `buildKit(answers)` rebuilds current server picks. Each choice must belong to that position's pick/alternatives; an empty, missing or stale choice keeps the pick. Storage is `{category,label,pick}` per item, without alternatives; client prices, lifespans and safety claims cannot overwrite it.

There is one abuse limit of **200 saves/hour/IP**. The frontend's `FREE_KIT_LIMIT` controls the three free kits per device; cloud saves have no per-IP free quota and do not need a Pro token. A shared venue therefore has 200 saves/hour rather than three saves for everyone.

`GET /api/kits/AbCdEf123_-x` → **200** (illustrative item values):

```json
{
  "slug": "AbCdEf123_-x",
  "answers": { "trade": "plumber", "extraHazards": [], "climate": "mild", "gender": "men", "hoursPerWeek": 40, "budget": "balanced", "employer": [] },
  "items": [{ "category": "boots", "label": "Work boots", "productId": "tb-pitboss-st", "brand": "Timberland PRO", "name": "Pit Boss", "price": 150, "lifespanMonths": 12, "costPerMonth": 12.5 }],
  "createdAt": "2026-11-14T10:00:00.000Z"
}
```

Unknown slug → **404** `{"error":"Kit not found"}`. `items[].productId` restores swaps on the frontend `/k/<slug>` page.

### Reminders and cron

| Request | Response / action |
| --- | --- |
| `POST /api/reminders` body `{"email":"worker@example.com","kitSlug":"AbCdEf123_-x"}` | **200** `{"status":"pending"}` after sending confirmation; `{"status":"confirmed"}` for an already active signup. 30/hour/IP and 10/hour/email. |
| `GET /api/reminders/confirm?token=<opaque-token>` | **200 HTML** mobile confirmation form. Does not confirm consent; link scanners cannot subscribe someone. Invalid token → **303** `/reminders?status=invalid`. |
| `POST /api/reminders/confirm?token=<opaque-token>` (form, no JSON body required) | **303** `/reminders?status=confirmed&kit=AbCdEf123_-x`, `status=expired&kit=AbCdEf123_-x`, or `status=invalid`. GET/POST share 60/hour/IP. |
| `GET /api/reminders/unsubscribe?token=<opaque-token>` | **303** `/reminders?status=unsubscribed&kit=AbCdEf123_-x`, or `status=invalid`; 60/hour/IP. |
| `POST /api/reminders/unsubscribe?token=<opaque-token>` (mail provider's one-click unsubscribe) | **200** `{"status":"unsubscribed"}`; invalid token → **400** `{ "error": "Invalid unsubscribe link" }`. Shares the 60/hour/IP limit. |
| `GET /api/cron/reminders`, bearer `CRON_SECRET` | **200** `{"sent":1,"failed":0,"queued":0,"deals":{"sent":0,"failed":0}}`; sends due confirmed items and opted-in Pro deal alerts. |
| `POST /api/cron/reminders`, bearer `CRON_SECRET`, body `{"kitSlug":"AbCdEf123_-x"}` | Requires `REMINDER_TEST_MODE=true`. **200** `{"sent":1,"failed":0,"queued":1}` for one confirmed recipient. Each deliberate call creates a fresh demo delivery ID/idempotency key, using the first item's real name. No confirmed recipients → all counts zero. |

Confirmation tokens expire after 24 hours and are stored hashed. `confirm_reminder` returns `{status,slug}`; an old consumed link cannot reactivate a later unsubscribe. Unsubscribe cancels unsent replacements and suppresses deal mail. Every email links to `${APP_URL}/k/<slug>`. Real reminder `due_at = kit.created_at + lifespanMonths × 30.4 days − 7 days`; daily cron sends on or after that time, once per item. A past-due signup is eligible at the next cron run. No live wear sensor or manufacturer service-life guarantee is implied.

Real jobs retain deduplication and leases across retries. Rehearsals are separate from real jobs. Resend [idempotency keys expire after 24 hours](https://resend.com/docs/api-reference/emails/send-email); ambiguous deliveries older than 23 hours remain quarantined for operator review. Check provider delivery before manually resetting a failed/ambiguous job. Turn demo mode off after judging.

### Checkout and retained Pro APIs

`POST /api/subscribe` body `{"email":"worker@example.com"}` → **200** `{"url":"https://checkout.stripe.com/c/pay/cs_test_...","accessToken":"opaque-secret-capability","testMode":true}`. Limit **30/hour/IP**. Monthly price is fixed at $4 USD. The URLs are:

- Success: `${APP_URL}/pro?status=success&session_id={CHECKOUT_SESSION_ID}`
- Cancel: `${APP_URL}/pro?status=cancel`

`GET /api/subscribe?session_id=cs_test_...` → **200** `{"active":true,"email":"worker@example.com"}` when Checkout is complete and the bound subscription is active/trialing; otherwise `active:false`. Unknown/foreign sessions return 404; malformed/live IDs return 400. Active responses also persist through `apply_stripe_subscription`, event ID `checkout:<session id>`, so stats do not depend on webhook arrival.

`POST /api/stripe/webhook`, raw signed Stripe event JSON such as `{"id":"evt_...","type":"customer.subscription.updated","data":{"object":{"id":"sub_..."}}}` plus `Stripe-Signature` → **200** `{"received":true}`. The example is abbreviated: Stripe sends the full signed event. Duplicate events are deduplicated; current state is retrieved from Stripe, and canceled subscriptions cannot be reactivated by stale delivery. Do not call this endpoint from the frontend.

The current UI **does not call `/api/pro`, `/api/pro/wear`, `/api/pro/deals` or retain `accessToken`**. Those capabilities are preserved for a later client; device wear tracking continues as implemented by the frontend. They require the capability returned by the originating Checkout, not a claimed email address. Keep the token out of URLs and logs. Losing it loses that server capability; recovery is outside this no-account demo.

| Request (bearer `accessToken`) | Response example |
| --- | --- |
| `GET /api/pro` | **200** `{"pro":true,"features":["unlimited_saved_kits","wear_tracking","deal_alerts"]}`; inactive/missing token → `{"pro":false,"features":[]}`. |
| `POST /api/pro/wear` body `{"kitSlug":"AbCdEf123_-x","productId":"tb-pitboss-st","date":"2026-11-14","hours":8}` | **200** `{"saved":true}`; replaces absolute hours for that item/day, 0–24. |
| `GET /api/pro/wear?kitSlug=AbCdEf123_-x` | **200** `{"entries":[{"product_id":"tb-pitboss-st","worn_on":"2026-11-14","hours":8}]}`; latest 1,000 entries for this capability. |
| `POST /api/pro/deals` body `{"kitSlug":"AbCdEf123_-x","enabled":true}` | **200** `{"enabled":true}`; enabling requires confirmed reminder consent for this email/kit. `false` disables it. |
| `GET /api/pro/deals?kitSlug=AbCdEf123_-x` | **200** `{"deals":[],"source":"catalog_estimates"}`; compares the retained bundled catalog against saved prices, never invents retailer discounts. |

### Stats

`GET /api/stats` → **200**:

```json
{"kitsCreated":12,"clicks":34,"clickTrackingAvailable":true,"reminderSignups":5,"confirmedReminders":3,"proConversions":1,"activePro":1,"stripeMode":"test"}
```

Field names remain compatible. The frontend maps `proConversions` to its `proSubscribers` label. Counts come from SQL, including the existing `public.clicks` table; zero clicks is `0`. Signups include pending/unsubscribed email-kit records; confirmed reminders count current consent. Pro conversions count distinct emails ever active/trialing, and active Pro counts current unexpired active/trialing subscriptions. These are test conversions, not revenue or unique-person marketing metrics.

## 60-second production demo

Prerequisites: merge #2 and #3 before retention, apply SQL once, seed catalog, set Production env, redeploy, use a permitted Resend inbox, enable demo mode. Have the inbox and test card ready.

1. **0–15 s:** Build a kit, swap an item, tap **Save**, open `/k/<slug>` on a phone and check the selected product.
2. **15–30 s:** Choose **Remind me**, enter your email, open its link, press **Confirm** and land on `/reminders?status=confirmed&kit=<slug>`.
3. **30–40 s:** Run the following operator command and open the demo email. Repeat if needed; every call gets a new demo delivery.

   ```bash
   curl -X POST "$APP_URL/api/cron/reminders" \
     -H "Authorization: Bearer $CRON_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"kitSlug":"<slug>"}'
   ```

4. **40–55 s:** Open `/pro`, pay with test card **4242 4242 4242 4242**, any future expiry and CVC, return to `/pro` and see **Pro is active**.
5. **55–60 s:** Open `GET /api/stats` and show the increased kit, reminder and Pro counts. Actual email/Checkout latency can lengthen the demo.

Run `npm run lint`, `npm test`, and `npm run build` before every push. Tests cover the exact frontend payload, canonical snapshots, stale choices, redirects, Stripe session binding, limits/config fallbacks and real Postgres migration/RPC execution. Live delivery, Checkout, webhook callbacks and deployed counts require the post-merge production smoke above.
