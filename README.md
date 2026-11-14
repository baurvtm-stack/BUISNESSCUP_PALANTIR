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
