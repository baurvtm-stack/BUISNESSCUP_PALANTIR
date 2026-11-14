# Frontend ⇄ API contract

What the pages call, what they send and what they expect back. Types live in
`src/lib/api/contract.ts`. Every call goes through `src/lib/api/client.ts`, which never throws:

| Response | How the frontend treats it |
| --- | --- |
| JSON 2xx | Success. Field names may be camelCase or snake_case, optionally wrapped in `{ data: … }`. |
| JSON 4xx `{ "error": "…" }` | Shown to the shopper as is, so keep it short and human. |
| 5xx, HTML (missing route), timeout | "Not available yet". The page falls back and keeps working. |

So an endpoint can ship at any time: until it does, the site uses the fallback in the last column.

| Endpoint | Status | Fallback while missing |
| --- | --- | --- |
| `POST /api/recommend` | live | Kit page rebuilds the kit on the server from the token |
| `GET /api/catalog` | live | — |
| `POST /api/click` | live | `/go/[id]` sends the shopper to the product's `buyUrl` |
| `POST /api/kits`, `GET /api/kits/[slug]` | planned | Kit saved on the device, share link is the long `/kit?k=…` URL |
| `POST /api/reminders` | planned | "Add replacement dates to my calendar" (.ics download) |
| `POST /api/subscribe`, `GET /api/subscribe?session_id=` | planned | Pro page says checkout is being connected |
| `GET /api/stats` | planned | Nothing is shown |

Set `NEXT_PUBLIC_API_MOCKS=1` locally to simulate the planned endpoints.

## Live

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
Response `200 { "redirectUrl": "https://…?tag=…", "tracked": true }`. Only `http(s)` URLs or
same-site paths are followed.

## Planned (backend-retention)

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
Response `201 { "slug": "k7Pq2x" }`. The short link `/k/<slug>` then works on any device.

### GET /api/kits/[slug]

Response `200 { "slug": "k7Pq2x", "answers": { … }, "items": [ … ], "createdAt": "2026-11-14T10:00:00Z" }`.
`answers` must pass `parseAnswers`; `items[].productId` restores the swaps. `404` if unknown.

### POST /api/reminders

```json
{ "email": "worker@example.com", "kitSlug": "k7Pq2x" }
```

Response `200 { "status": "pending" }` (double opt-in email sent) or `{ "status": "confirmed" }`.
Errors as `{ "error": "…" }`: `400` bad email, `429` too many requests.

Links in the emails should land on
`/reminders?status=confirmed|unsubscribed|expired|invalid&kit=<slug>`; that page explains
each case and links back to `/k/<slug>`.

### POST /api/subscribe

```json
{ "email": "worker@example.com" }
```

Response `200 { "url": "https://checkout.stripe.com/c/pay/cs_test_…" }`; the browser goes there.
Create the Checkout Session with:

- `success_url`: `<origin>/pro?status=success&session_id={CHECKOUT_SESSION_ID}`
- `cancel_url`: `<origin>/pro?status=cancel`

### GET /api/subscribe?session_id=cs_test_…

Called once when the shopper lands on the success URL.
Response `200 { "active": true, "email": "worker@example.com" }` (`status: "active"` also works).
Until this exists the Pro page trusts the redirect and unlocks Pro on that device only.

### GET /api/stats

Response `200 { "kitsCreated": 128, "clicks": 342, "reminderSignups": 41, "proSubscribers": 6 }`.
