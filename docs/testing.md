# Testing and CI

Everything here runs without provider credentials unless a section says otherwise. For the overview, see the [README](../README.md#tests-and-ci).

## Checks

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run catalog:check
npm run smoke
# Optional target: npm run smoke -- http://localhost:3000
```

GitHub Actions runs lint, TypeScript, tests and the production build on every push and pull request. Unit and API tests use Vitest, mocked provider calls and PGlite for the actual Postgres migrations and RPCs; those checks need no Docker or live secrets.

Coverage includes all 11 trades, mandatory standards, deterministic picks, workload scaling, tiny budgets, women's sizes, empty extra hazards, API validation, saved swaps, reminder timing and consent, repeatable demos, Stripe binding, deal alerts, price drops and stats. `npm run catalog:check` validates the full snapshot without contacting Supabase.

`scripts/smoke.mjs` defaults to the live URL and checks `/`, `/api/catalog`, an electrician recommendation and the click's 302 destination. It prints PASS/FAIL and exits nonzero if any check fails. **It creates one click event when tracking is available**, does not follow the retailer redirect, and does not create kits, emails or payments.

## Playwright judge journey

```bash
npm ci
npx playwright install chromium
# Start Docker Desktop / Docker Engine, then:
npm run e2e
# Existing deployment (no Docker or local build):
PLAYWRIGHT_BASE_URL=https://your-preview.vercel.app npm run e2e
# PowerShell: $env:PLAYWRIGHT_BASE_URL='https://your-preview.vercel.app'; npm run e2e
npx playwright show-report
```

The default run provisions disposable PostgreSQL 17 and PostgREST with every actual SQL migration and the bundled catalog, then builds and serves the production app on port 3000. Docker Compose is required; leave that port free. Random database credentials stay in process memory, the gateway binds only to loopback, and the runner removes its own containers and data afterward. It never seeds or changes your configured Supabase project. An explicit `PLAYWRIGHT_BASE_URL` uses the existing deployment as-is and requires working cloud saves and stats. Export test variables in the shell; the runner does not load `.env.local`.

The same journey runs in desktop Chromium and mobile Chromium (Pixel 7): landing → five questionnaire steps → electrician, men, L / 32×30, US 10, 45 hours, mild climate, balanced budget → all six categories and the monthly cost → a differently priced swap → Save 201 → `/k/<slug>` in a fresh browser context with identical picks and totals → Check price. Separate specs cover SQL stats counters, Pro price drops and fixes from code review. Tests use roles and text, automatic waits and response assertions, with no fixed sleeps or mocked GearFit APIs. Only the final external retailer document is intercepted, so merchant bot protection cannot break the redirect check.

The separate **Playwright judge journey** Actions job selects a ready Vercel preview tied to the exact PR head via its successful commit status and matching `vercel[bot]` comment. If no ready and accessible preview exists, or it explicitly reports missing Supabase configuration, the job records why and runs the local production stack. A configured preview with a failing API stays the target and fails the test. Configure Preview Supabase variables, migrations and catalog to exercise hosted persistence; optionally add `VERCEL_AUTOMATION_BYPASS_SECRET` as a GitHub Actions secret for protected previews. The runner checks readiness once after the other CI checks; it never substitutes production for a missing preview.

HTML reports, screenshots and failure traces are retained as Actions artifacts for seven days. Traces are disabled when a preview bypass secret is supplied because traces capture request headers. An external run creates one saved kit and two click events per browser project (retries may add more); it sends no emails or payments and does not delete existing data. These records remain on external targets, so prefer a test Supabase project.

## Where to start reading the code

`src/lib/engine.ts`, `src/lib/server/`, `src/lib/retention/`, `supabase/migrations/` and `tests/`. Product evidence is in [catalog-sources.md](catalog-sources.md).
