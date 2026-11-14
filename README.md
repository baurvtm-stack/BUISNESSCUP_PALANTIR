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

Use the **existing shared Supabase project**, not a new project. Apply `supabase/migrations/*.sql` in filename order with the Supabase SQL editor (or the team's linked Supabase CLI). These migrations create new tables/functions; apply once. RLS is enabled with no browser policies; only server-side service-role access is allowed. They do not change the catalog, engine, UI or click ingestion. Coordinate with the click owner to persist events in `public.clicks`; stats counts its rows if present and reports `null` otherwise.

Shared deployment: Supabase project `qcocsowyfyqprfddndcg`, production origin `https://palantirbuisness.vercel.app` (Vercel tracks `main`). Retention migration versions are `20261114100001` through `20261114100004`, distinct from the catalog team's `202611140001` and `202611140002`. The runtime service-role key grants Data API access, not SQL migration execution: applying migrations requires the dashboard SQL editor, a database connection, or a Supabase management access token. Keep these administrative credentials out of the application and repository. Before applying, inspect the target schema and migration history to avoid replaying already-applied SQL.

Copy `.env.example` to `.env.local` for local development. Configure the same values in Vercel Production and Preview as appropriate, then redeploy. Never use `NEXT_PUBLIC_` for these secrets.

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Existing shared project API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service-role key for that same project |
| `APP_URL` | Canonical HTTPS production origin; localhost HTTP allowed in development. Used for Stripe redirects and email links; never derived from request Host |
| `RATE_LIMIT_SECRET` | Random 32+ byte secret for hashing client IPs |
| `CRON_SECRET` | Independent random 32+ byte bearer secret for Vercel Cron and demo calls |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM` | Verified sender, e.g. `GearFit <reminders@your-domain.com>` |
| `REMINDER_TEST_MODE` | `true` enables secret-protected immediate demo reminder; default false |
| `STRIPE_SECRET_KEY` | `sk_test_...` only; live keys are rejected |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` for the exact deployed webhook destination |

Configure a Stripe **test** webhook destination at `APP_URL/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. For local work, `stripe listen --forward-to localhost:3000/api/stripe/webhook` provides a different local webhook secret. The monthly price is fixed server-side at **$4 USD**; no Stripe Price ID setup is needed. Complete Checkout using **4242 4242 4242 4242**, any future expiry and any CVC. Only signed webhook confirmation activates Pro; the redirect alone does not. This is demo billing, not revenue.

`vercel.json` schedules daily `GET /api/cron/reminders` at **08:00 UTC (13:00 UTC+5)**. Vercel supplies `Authorization: Bearer CRON_SECRET`. This is after the Nov 15 noon submission deadline, so use the immediate demo endpoint for judging. Daily cron is compatible with Hobby scheduling; do not depend on exact-minute execution. Resend onboarding sender can only email the account owner's address; verify a sending domain for other recipients.

## Retention API / frontend handoff

JSON POSTs require `Content-Type: application/json`; maximum body 128 KiB. Errors are `{ "error": "..." }` (validation also includes `fields`). Statuses: 400 invalid input, 401 invalid cron secret, 403 inactive Pro/test mode disabled, 404 absent kit, 409 missing email consent, 413 too large, 415 wrong content type, 429 limited, 503 service/configuration failure. Public POSTs are atomically rate-limited in Supabase, across Vercel instances. Stripe webhooks use signature authentication rather than public-user limits. All retention responses avoid caching.

### Save and load kits (no account/login)

`POST /api/kits`

```json
{"answers":{"trade":"electrician","climate":"mild","gender":"men","hoursPerWeek":40,"budget":"balanced","extraHazards":[],"employer":[]}}
```

201 response:

```json
{"slug":"AbCdEf123_-x","createdAt":"2026-11-14T10:00:00.000Z"}
```

Optional `items` accepts the current UI's selected items, in engine order, each with at least `{"pick":{"product":{"id":"product-id"}}}`. Omit it to save default picks. Server checks selected IDs against that item's engine options and stores canonical prices, standards and effective lifespans; it never trusts client-edited safety metadata. Free allowance: **3 saves per client IP per rolling 24 hours**. Pro has no saved-kit quota; both plans retain a 60 POST/hour abuse limit. Shared networks share the free allowance; no-login identity cannot enforce a per-person quota. Kit links are public bearer links: do not put private contact information in answers.

`GET /api/kits/AbCdEf123_-x` → 200:

```json
{"id":"uuid","slug":"AbCdEf123_-x","answers":{"trade":"electrician"},"items":[{"category":"boots","pick":{"product":{"id":"thorogood-moc","price":280},"lifespanMonths":30}}],"created_at":"2026-11-14T10:00:00Z"}
```

Example above is abbreviated; actual answers and items contain full snapshots. Frontend must load this endpoint for a slug and render the stored picks. Current `/kit?k=...` still recomputes the original URL answers and does not load slugs. No frontend files were edited. Email links currently expose the saved-kit JSON endpoint until frontend integration supplies a saved-kit view.

### Replacement reminders and demo

`POST /api/reminders` with `{"email":"worker@example.com","kitSlug":"AbCdEf123_-x"}` → 202 `{"status":"confirmation_required","message":"If confirmation is needed, check your email."}`. Limit 5/hour/IP, plus 3/hour/email globally. Duplicate active signup is a no-op; new or expired confirmation sends an email. The email contains a 24-hour link. `GET /api/reminders/confirm?token=...` renders a confirmation form without changing consent, so link scanners cannot subscribe users. Pressing the form posts to that URL → 200 `{"status":"confirmed","message":"Your replacement reminders are enabled."}`. Confirmation tokens are stored hashed.

`GET` or `POST /api/reminders/unsubscribe?token=...` → 200 `{"status":"unsubscribed"}` (with a message). No login required. Cancels unsent replacements and suppresses Pro deal email for that kit. Mail contains both a visible unsubscribe link and List-Unsubscribe headers.

`GET /api/cron/reminders`, with `Authorization: Bearer <CRON_SECRET>`, sends due items for confirmed subscribers only. Due date = kit creation + effective lifespan × 30.4 days. Each item generates one replacement email; saving a new kit starts a new cycle. This is an estimate, not a safety inspection or live wear sensor. Cron processes bounded batches; rerun authenticated GET to drain a backlog. Response includes sent/failed counts for reminders and deals.

For the immediate demo, set `REMINDER_TEST_MODE=true`, save a kit, sign up **with an inbox you control**, and confirm the email. Then:

```bash
curl -X POST "$APP_URL/api/cron/reminders" \
  -H "Authorization: Bearer $CRON_SECRET" -H 'Content-Type: application/json' \
  -d '{"kitSlug":"AbCdEf123_-x"}'
```

200 `{"sent":1,"failed":0,"queued":1}`. Demo sends a clearly labeled email immediately, only to confirmed subscribers of that kit. It is idempotent: one demo per signup, separate from real reminder dates. Unsubscribe and repeat to demonstrate suppression. Turn test mode off after judging. Keep cron secrets on the server/operator terminal, never in browser JS.

### Pro checkout, status, wear and deals

`POST /api/subscribe` with `{"email":"worker@example.com"}` → 201:

```json
{"url":"https://checkout.stripe.com/c/pay/...","accessToken":"opaque-secret-token","testMode":true}
```

Limit 5/hour/IP. **Retain accessToken before navigating to url.** Send it as `Authorization: Bearer <accessToken>` for Pro APIs and unlimited kit saves. Treat it as a secret; never put it in links or analytics. It is bound to this checkout, not any existing subscriber with the same submitted email. Store securely on the client for this no-account demo; losing it loses Pro access from that browser. Do not create a second paid checkout just to recover a lost token; account recovery is outside this hackathon backend.

`POST /api/stripe/webhook`: raw Stripe event JSON plus `Stripe-Signature` → 200 `{"received":true}`. Stripe sends this endpoint; frontend must not call it. Duplicate events are deduplicated atomically; current subscription state is retrieved from Stripe and older state cannot overwrite newer events. Canceling a test subscription disables Pro through this webhook.

`GET /api/pro`, with token → 200 `{"pro":true,"features":["unlimited_saved_kits","wear_tracking","deal_alerts"]}`; an inactive/missing token returns 200 `{"pro":false,"features":[]}`. Frontend can poll after Checkout until the webhook arrives. Other Pro endpoints return 403 without an active token.

`POST /api/pro/wear`, with token:

```json
{"kitSlug":"AbCdEf123_-x","productId":"thorogood-moc","date":"2026-11-14","hours":8}
```

200 `{"saved":true}`. Records absolute hours for that item/date, 0–24; retries replace rather than double-count. Future/invalid dates and products outside the saved kit are rejected. `GET /api/pro/wear?kitSlug=AbCdEf123_-x` → `{"entries":[{"product_id":"thorogood-moc","worn_on":"2026-11-14","hours":8}]}`. Returns latest 1,000 entries. Wear logs are personal to the Pro token and do not change the immutable kit or baseline reminder schedule.

`POST /api/pro/deals` with token and `{"kitSlug":"AbCdEf123_-x","enabled":true}` → `{"enabled":true}`. Requires confirmed reminder consent for this email/kit; `false` disables alerts. `GET /api/pro/deals?kitSlug=AbCdEf123_-x` → `{"deals":[],"source":"catalog_estimates"}`. Daily cron emails once per changed price fingerprint when a saved item's current catalog estimate falls below its saved price. No fabricated deals or live retailer scraping; the catalog engineer must update prices for drops to exist. Unsubscribe suppresses email. Both endpoints require active Pro.

### Pitch metrics

`GET /api/stats` → 200:

```json
{"kitsCreated":12,"clicks":null,"clickTrackingAvailable":false,"reminderSignups":5,"confirmedReminders":3,"proConversions":1,"activePro":1,"stripeMode":"test"}
```

Counts are actual SQL counts, with no email addresses. `reminderSignups` counts unique email/kit signup records including pending/unsubscribed; `confirmedReminders` counts currently confirmed subscriptions. `proConversions` is distinct emails that activated test subscriptions. `clicks:null` means `public.clicks` is not integrated yet, not zero clicks. These counts cannot establish LTV or CAC on their own. For the pitch, label $4/month revenue and lifetime/churn/CAC projections as assumptions, distinguish test conversions from paying customers, and report observed signup/conversion ratios separately.

## Reliability and validation

Run `npm run lint`, `npm test`, and `npm run build` before every push. Unit tests cover validation, selection integrity, opt-in boundaries, webhook handling and capabilities; SQL tests execute migrations in embedded Postgres (PGlite). Builds do not need service secrets. Live readiness still requires applying migrations, configuring provider credentials/webhook/domain, wiring frontend controls, and running the demo on the deployed origin.

Mail uses database claims plus stable Resend idempotency keys. Resend retains keys for 24 hours; ambiguous attempts older than 23 hours stop for operator review instead of risking duplicate email. Inspect `reminder_deliveries` / `deal_alert_deliveries` after failures; verify provider delivery before resetting an ambiguous attempt. Cron does not provide exactly-once transactional delivery across two services. Successful sends are never automatically repeated. Only anonymous aggregates are exposed publicly; emails, payment bindings, wear logs and tokens stay behind service-role APIs.
