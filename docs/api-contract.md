# Frontend ⇄ API contract

What the pages call, what they send and what they expect back. Types live in
`src/lib/api/contract.ts`. Every call goes through `src/lib/api/client.ts`, which never throws:

| Response | How the frontend treats it |
| --- | --- |
| JSON 2xx | Success. Field names may be camelCase or snake_case, optionally wrapped in `{ data: … }`. |
| JSON 4xx `{ "error": "…" }` | Shown to the shopper as is, so keep it short and human. |
| 5xx, HTML (missing route), timeout | "Not available yet". The page falls back and keeps working. |

The routes below are implemented. Provider-backed features require the environment and migrations described in the [backend deployment guide](backend-handoff.md). The frontend retains fallbacks when those services are unavailable.

| Endpoint | Implementation | Fallback when unavailable |
| --- | --- | --- |
| `POST /api/recommend` | implemented | Kit page rebuilds the kit on the server from the token |
| `GET /api/catalog` | implemented | — |
| `POST /api/click` | implemented | `/go/[id]` sends the shopper to the product's `buyUrl` |
| `POST /api/kits`, `GET /api/kits/[slug]` | implemented | Kit saved on the device, share link is the long `/kit?k=…` URL |
| `POST /api/reminders` | implemented | "Add replacement dates to my calendar" (.ics download) |
| `POST /api/subscribe`, `GET /api/subscribe?session_id=` | implemented | Pro page says checkout is being connected |
| `GET /api/stats` | implemented | Nothing is shown |

Set `NEXT_PUBLIC_API_MOCKS=1` only for local frontend demonstrations. Leave it unset or `0` in production.

## Catalog and recommendations

### POST /api/recommend

Body: questionnaire answers. Clothing sizes are one string, top and pants: `"L / 34x32"`
(men's pants are waist x inseam, women's are numeric, `"M / 8"`). The questionnaire only
offers sizes most of the catalog carries, and only sends a clothing size when both parts are set.

```json
{ "trade": "electrician", "extraHazards": ["arc_flash"], "climate": "cold", "gender": "men",
  "shoeSize": "10.5", "clothingSize": "L / 34x32", "hoursPerWeek": 50, "budget": "balanced",
  "employer": ["hard_hat"] }
```

Response `200 { "token": "eyJ0cmFkZ…", "kit": KitResult }`. The token is the URL-safe answers;
`/kit?k=<token>` rebuilds the same kit.

### POST /api/click

Called by `/go/[productId]?kit=…` before it forwards the shopper (every "Check price" button).

```json
{ "productId": "tb-pitboss-st", "kitId": "eyJ0cmFkZ…" }
```

`kitId` is the saved-kit slug when there is one, otherwise the kit token.
Response `200 { "redirectUrl": "https://www.timberland.com/…", "tracked": true }`. The URL is the
catalog's maker page; only an Amazon fallback link gets `AFFILIATE_TAG`. Only `http(s)` URLs or
same-site paths are followed.

## Saved kits, reminders and checkout

### POST /api/kits

Save a kit without an account. Sent right after the shopper taps **Save kit** (the kit is
already on their device by then).

```json
{
  "answers": { "trade": "plumber", "…": "…" },
  "token": "eyJ0cmFkZ…",
  "choices": ["", "kb-boot-2", ""],
  "tradeLabel": "Plumber",
  "items": [
    { "category": "boots", "label": "Work boots", "productId": "kb-boot-2", "brand": "Keen",
      "name": "Utility", "price": 165, "lifespanMonths": 14.2, "costPerMonth": 11.62 }
  ],
  "totals": { "upfront": 412, "perMonth": 27.4 }
}
```

`choices[i]` is the product the shopper swapped in at item `i` (`""` = GearFit's pick).
Response `201 { "slug": "k7Pq2x", "createdAt": "2026-11-14T10:00:00Z" }`. Only validated answers and allowed choices affect storage; client display fields are ignored, and stale choices use the default pick. The short link `/k/<slug>` then works on any device.

### GET /api/kits/[slug]

Response `200 { "slug": "k7Pq2x", "answers": { … }, "items": [ … ], "createdAt": "2026-11-14T10:00:00Z" }`.
`answers` must pass `parseAnswers`; `items[].productId` restores the swaps. `404` if unknown.

### POST /api/reminders

```json
{ "email": "worker@example.com", "kitSlug": "k7Pq2x" }
```

Response `200 { "status": "pending" }` (double opt-in email sent) or `{ "status": "confirmed" }`.
Errors as `{ "error": "…" }`: `400` bad email, `429` too many requests.

Confirmation and unsubscribe routes redirect to
`/reminders?status=confirmed|unsubscribed|expired|invalid&kit=<slug>`; that page explains
each case and links back to `/k/<slug>`.

### POST /api/subscribe

```json
{ "email": "worker@example.com" }
```

Response `200 { "url": "https://checkout.stripe.com/c/pay/cs_test_…", "accessToken": "opaque-capability", "testMode": true }`. The UI saves the capability in the device's `gearfit.pro-access.v1` store **before** navigating to `url`. It is separate from shareable kit data and is sent only as `Authorization: Bearer <accessToken>` to Pro APIs, never in a URL or log. The current UI still uses local wear tracking rather than `/api/pro/wear`.
The server creates the Checkout Session with:

- `success_url`: `<origin>/pro?status=success&session_id={CHECKOUT_SESSION_ID}`
- `cancel_url`: `<origin>/pro?status=cancel`

### GET /api/subscribe?session_id=cs_test_…

Called once when the shopper lands on the success URL.
Response `200 { "active": true, "email": "worker@example.com" }` (`status: "active"` also works).
The backend checks the Stripe session, its server checkout binding and the subscription status, then persists active/trialing subscriptions. A redirect alone does not establish server-side Pro.

### GET /api/stats

Response `200 { "kitsCreated": 128, "clicks": 342, "clickTrackingAvailable": true, "reminderSignups": 41, "confirmedReminders": 30, "proConversions": 6, "activePro": 5, "stripeMode": "test" }`. The client maps `proConversions` to its `proSubscribers` label. The numbers in this example are illustrative; the live endpoint returns real SQL counts.

See [backend API examples](backend-handoff.md#retention-api-examples) for confirmation, unsubscribe, cron, webhook and retained Pro routes.

## Deal-alert switch

After checkout confirmation, `GET /api/pro` with the bearer capability returns `{ "pro": true, "features": ["unlimited_saved_kits", "wear_tracking", "deal_alerts"] }`. Device Pro state alone cannot authorize alerts.

`GET /api/pro/deals?kitSlug=<slug>` uses the same header and returns `{ "enabled": true, "deals": [], "source": "catalog_estimates" }`. `enabled` reflects this checkout's saved setting and current reminder consent. Deals contain `productId`, `name`, `savedPrice` and `currentPrice`, comparing fresh catalog data with the saved snapshot.

`POST /api/pro/deals` uses the bearer header and body `{ "kitSlug": "AbCdEf123_-x", "enabled": true }`; **200** returns `{ "enabled": true }` (or `false` when disabled). **409** asks the shopper to confirm replacement reminders for this email/kit and links to the form. **403** says "Pro isn't active on the server yet. Refresh in a minute." Network/5xx failures leave the switch off with a temporary-unavailability message. Free users see the Pro upsell.
