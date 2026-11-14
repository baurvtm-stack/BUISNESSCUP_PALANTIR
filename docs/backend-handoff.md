# Backend deployment and operations

The catalog, saved kits, reminders, test checkout and stats routes are implemented. See the [README](../README.md) for the architecture, local setup and complete environment table, and the [frontend contract](api-contract.md) for client payloads.

## Supabase setup

1. Apply `supabase/migrations/202611140001_catalog.sql`, then `202611140002_clicks.sql` in the project's SQL Editor.
2. Configure `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) in the ignored `.env.local` file. Run `npm run catalog:check`, then `npm run seed`.
3. Paste `supabase/retention-setup.sql` into SQL Editor and run it **once**. It wraps the four retention migrations, a PostgREST schema reload and a transaction. Alternatively apply `20261114100001`–`20261114100004` individually in order; use one method only. Do not replay these migrations over an existing retention schema.
4. Configure the same server variables in Vercel's intended environments, select Node.js 24 and redeploy. Preview environments need their own provider configuration.
5. Run `npm run smoke` against production, then exercise saved kits, email and test billing with the demo below.

The seed validates all records before connecting, upserts in batches of 200 by stable ID and never deletes custom products or clicks. Repeating it restores snapshot values for its IDs. Regenerate the combined SQL with `node scripts/retention-setup.mjs` after changing a retention migration. Service API keys cannot apply SQL migrations.

## Click integration

Existing `buyUrl(product)` returns `/api/click?productId=...`; ordinary anchors therefore log without frontend changes. POST clients send `{productId, kitId?}` and navigate to the returned `redirectUrl`. A kit token from `POST /api/recommend` is valid as `kitId`; it is optional and not a foreign key. Destinations come only from the validated catalog, cached for 60 seconds, or the bundled snapshot if that lookup fails. For a known product, GET sends a 302 before recording the click with Next.js `after()`; an insert failure cannot change the redirect. POST reports `tracked:true` only after a successful insert; missing storage or a failed insert returns the same destination with `tracked:false`. Unknown products remain 404. GET ignores unrelated query parameters such as `utm_*` and `fbclid`, including repeated marketing parameters, but rejects duplicate `productId` or `kitId` values. POST still rejects arbitrary redirect URLs in its body.

## Runtime and data boundaries

- Catalog and click tables have RLS and service-only access. Retention tables/RPCs are also private to the server service role. Keys remain in server modules; public APIs expose only their intended responses.
- The catalog DAL uses native fetch, validated rows, stable ID pagination and a five-second request timeout. Without database credentials it uses the bundled JSON. A configured empty/invalid database makes `/api/catalog` and `/api/recommend` return 503, so missing migrations or seed data are visible.
- Kit pages, catalog views and saved-kit rebuilding use `src/lib/server/kit-view.ts`: the same 60-second catalog cache as click redirects, with snapshot fallback and size relaxation when needed. Engine safety filters remain mandatory. Landing-page reference facts and wizard size options use the bundled snapshot. Deal price checks deliberately call the uncached catalog DAL; `/api/catalog` and `/api/recommend` also retain their existing behavior.
- Click destinations come from catalog retailer URLs, never a caller-supplied URL. The optional `kitId` is a slug or answer token, not a foreign key. Click events store a product, optional kit ID and timestamp, not raw IPs or user agents. Counts are events, not unique shoppers or purchases.
- Missing required retention services yield a redacted 503. Persistent rate limits use hashed IP buckets; without `RATE_LIMIT_SECRET`, an unsalted SHA-256 hash keeps limits working but offers weaker privacy against guessed addresses.
- Public `/k/<slug>` links can be viewed by anyone who has the link. Client prices and safety claims are ignored when saving a kit.
- Prices and service lives are planning estimates. See [catalog sources and limitations](catalog-sources.md); employer hazard assessments and manufacturer replacement rules take precedence.

## Email, payments and scheduling

Set `APP_URL=https://palantirbuisness.vercel.app`, or rely on Vercel's `VERCEL_PROJECT_PRODUCTION_URL` fallback. Local development supports `http://localhost:3000`.

**Resend's onboarding sender only delivers to the account owner's inbox; other recipients need a verified sending domain.** Configure `RESEND_API_KEY` and `RESEND_FROM`. See [Resend's sender restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

Create a Stripe **test-mode** webhook at `<APP_URL>/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`. Set its signing secret as `STRIPE_WEBHOOK_SECRET`. Local `stripe listen --forward-to localhost:3000/api/stripe/webhook` uses a different secret. Checkout status verifies the Stripe session and server binding and records activation even if the webhook is late; the webhook handles later subscription changes. Live Stripe keys are rejected. See [Stripe's success-page guidance](https://docs.stripe.com/payments/checkout/custom-success-page).

Vercel cron calls `GET /api/cron/reminders` with `Authorization: Bearer <CRON_SECRET>` daily at **08:00 UTC / 13:00 UTC+5**. Set `CRON_SECRET`. For an immediate demonstration, also set `REMINDER_TEST_MODE=true` and use the authenticated POST below; turn it off afterward.

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
| `POST /api/cron/reminders`, same auth/mode, body `{"kitSlug":"AbCdEf123_-x","deals":true}` | **200** `{"sent":1,"failed":0,"deals":[{"productId":"tb-pitboss-st","name":"Pit Boss","savedPrice":150,"currentPrice":140}],"reasons":[]}` (illustrative prices). Sends only real catalog drops to enabled, confirmed Pro subscribers for this kit. |

The deal demo returns `{ "sent": 0, "failed": 0, "deals": [], "reasons": ["no_price_drop"] }` when no lower price exists. Other reasons are `no_enabled_alert`, `no_confirmed_reminder`, `no_active_pro`, or `delivery_failed` when delivery could not be completed (`failed` is then nonzero). Multiple ineligible subscribers can produce multiple reasons. Up to ten enabled subscribers are checked per demo request. Unknown kit → 404; wrong secret → 401; disabled demo mode → 403.

**No new SQL migration is required for deal alerts.** Already-applied migrations are unchanged. Each demo send inserts a fresh `demo:<uuid>` fingerprint in the existing `deal_alert_deliveries` table and uses a fresh Resend idempotency key. It does not claim, reset or consume the daily cron's deterministic price fingerprint. Repeat the demo request without another price edit to rehearse again.

Confirmation tokens expire after 24 hours and are stored hashed. `confirm_reminder` returns `{status,slug}`; an old consumed link cannot reactivate a later unsubscribe. Unsubscribe cancels unsent replacements and suppresses deal mail. Every email links to `${APP_URL}/k/<slug>`. Real reminder `due_at = kit.created_at + lifespanMonths × 30.4 days − 7 days`; daily cron sends on or after that time, once per item. A past-due signup is eligible at the next cron run. No live wear sensor or manufacturer service-life guarantee is implied.

Real jobs retain deduplication and leases across retries. Rehearsals are separate from real jobs. Resend [idempotency keys expire after 24 hours](https://resend.com/docs/api-reference/emails/send-email); ambiguous deliveries older than 23 hours remain quarantined for operator review. Check provider delivery before manually resetting a failed/ambiguous job. Turn demo mode off after judging.

### Checkout and retained Pro APIs

`POST /api/subscribe` body `{"email":"worker@example.com"}` → **200** `{"url":"https://checkout.stripe.com/c/pay/cs_test_...","accessToken":"opaque-secret-capability","testMode":true}`. Limit **30/hour/IP**. Monthly price is fixed at $4 USD. The URLs are:

- Success: `${APP_URL}/pro?status=success&session_id={CHECKOUT_SESSION_ID}`
- Cancel: `${APP_URL}/pro?status=cancel`

`GET /api/subscribe?session_id=cs_test_...` → **200** `{"active":true,"email":"worker@example.com"}` when Checkout is complete and the bound subscription is active/trialing; otherwise `active:false`. Unknown/foreign sessions return 404; malformed/live IDs return 400. Active responses also persist through `apply_stripe_subscription`, event ID `checkout:<session id>`, so stats do not depend on webhook arrival.

`POST /api/stripe/webhook`, raw signed Stripe event JSON such as `{"id":"evt_...","type":"customer.subscription.updated","data":{"object":{"id":"sub_..."}}}` plus `Stripe-Signature` → **200** `{"received":true}`. The example is abbreviated: Stripe sends the full signed event. Duplicate events are deduplicated; current state is retrieved from Stripe, and canceled subscriptions cannot be reactivated by stale delivery. Do not call this endpoint from the frontend.

The UI saves `accessToken` in the separate `gearfit.pro-access.v1` device store before leaving for Checkout. It verifies server Pro with `GET /api/pro`, restores deal settings with GET and toggles them with POST `/api/pro/deals`. Those routes require the originating checkout capability, not a claimed email address. Keep it out of URLs, shared kit records and logs. Losing browser storage loses that server capability; recovery is outside this no-account demo. Device wear tracking remains local; the current UI does not call `/api/pro/wear`.

| Request (bearer `accessToken`) | Response example |
| --- | --- |
| `GET /api/pro` | **200** `{"pro":true,"features":["unlimited_saved_kits","wear_tracking","deal_alerts"]}`; inactive/missing token → `{"pro":false,"features":[]}`. |
| `POST /api/pro/wear` body `{"kitSlug":"AbCdEf123_-x","productId":"tb-pitboss-st","date":"2026-11-14","hours":8}` | **200** `{"saved":true}`; replaces absolute hours for that item/day, 0–24. |
| `GET /api/pro/wear?kitSlug=AbCdEf123_-x` | **200** `{"entries":[{"product_id":"tb-pitboss-st","worn_on":"2026-11-14","hours":8}]}`; latest 1,000 entries for this capability. |
| `POST /api/pro/deals` body `{"kitSlug":"AbCdEf123_-x","enabled":true}` | **200** `{"enabled":true}`; enabling requires confirmed reminder consent for this email/kit (otherwise 409) and active Pro (otherwise 403). `false` disables it without requiring renewed consent. |
| `GET /api/pro/deals?kitSlug=AbCdEf123_-x` | **200** `{"enabled":true,"deals":[],"source":"catalog_estimates"}`; reads current settings for this checkout, checks consent and compares uncached Supabase prices against saved prices, with snapshot fallback on catalog failure. No invented retailer discounts. |

### Stats

`GET /api/stats` → **200**:

```json
{"kitsCreated":12,"clicks":34,"clickTrackingAvailable":true,"reminderSignups":5,"confirmedReminders":3,"proConversions":1,"activePro":1,"stripeMode":"test"}
```

Field names remain compatible. The frontend maps `proConversions` to its `proSubscribers` label. Counts come from SQL, including the existing `public.clicks` table; zero clicks is `0`. Signups include pending/unsubscribed email-kit records; confirmed reminders count current consent. Pro conversions count distinct emails ever active/trialing, and active Pro counts current unexpired active/trialing subscriptions. These are test conversions, not revenue or unique-person marketing metrics.

## 60-second production demo

Prerequisites: the existing SQL and catalog are deployed, Production variables are configured, `REMINDER_TEST_MODE=true`, and the inbox and test card are ready. No migrations need replaying. Have the SQL Editor open; mail/Checkout latency can make the demo longer than a minute.

1. Build a kit, tap **Save**, choose **Remind me** with the Resend account owner's email, then open the email and press **Confirm**. A verified sending domain allows other recipients.
2. Open `/pro` in the **same browser/device**, use the same email and test card **4242 4242 4242 4242** (future expiry, any CVC). Return to `/pro` with **Pro is active** and alert access ready.
3. Open that saved kit and turn on **Deal alerts**. If it asks for consent, confirm reminders for the same Pro email and kit, then retry.
4. Pick an item in that saved kit whose price is above $10. In Supabase SQL Editor, lower its current price once:

   ```sql
   update public.products set price_usd = price_usd - 10
   where id = '<id of an item in that kit>' returning id, price_usd;
   ```

5. Send the immediate deal demo and open the email. The price comparison bypasses the 60-second page cache; there is no need to wait.

   ```bash
   curl -X POST "$APP_URL/api/cron/reminders" \
     -H "Authorization: Bearer $CRON_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"kitSlug":"<slug>","deals":true}'
   ```

6. Restore that item's price once, even if the email step failed:

   ```sql
   update public.products set price_usd = price_usd + 10
   where id = '<same item id>' returning id, price_usd;
   ```

Repeat step 5 before restoring if another rehearsal is needed; each call gets a fresh demo delivery. The reminder-only demo still accepts `{ "kitSlug": "<slug>" }`. `GET /api/stats` shows real kit, reminder and test Pro counts. Turn demo mode off afterward.

Run `npm run lint`, `npx tsc --noEmit`, `npm test`, and `npm run build` before every push. Tests cover the exact frontend payload, canonical snapshots, stale choices, redirects, Stripe session binding, limits/config fallbacks and real Postgres migration/RPC execution. Live delivery, Checkout, webhook callbacks and deployed counts require the production demo above.
