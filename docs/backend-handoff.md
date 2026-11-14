# Backend deployment and frontend integration

This branch is based on MVP commit `100e863` from PR #1 because `main` contained only `mango.py` when work began. Merge the MVP first if reviewing the backend-only diff; this branch keeps the frontend files identical to that commit.

## Live data integration owned by frontend

- `src/app/kit/page.tsx`: both `generateMetadata` and the page call synchronous `recommend(answers)`. Load `getProducts` from `@/lib/server/catalog` in the server component and pass the resulting list to `recommend(answers, products)`. Cache/share the promise within the request if both need it. Do not import server modules into `KitView.tsx`.
- `src/app/catalog/page.tsx`: replace the snapshot import for listing with `await getProducts(activeCategory)`. Handle a 503-style failure in the page's error UI.
- `src/app/page.tsx`: its illustrative catalog cards intentionally use the bundled snapshot. Decide whether the demo should follow database changes too.
- `src/app/build/Wizard.tsx` currently ignores the API kit. If the frontend uses that response instead of regenerating it on `/kit`, it must also preserve the no-account share-link behavior.
- No frontend files were edited in this backend change. Until this handoff is implemented, APIs use Postgres while pages use the checked-in snapshot. Seeding makes them initially agree, but future database-only edits do not update existing pages.

## Click integration

Existing `buyUrl(product)` returns `/api/click?productId=...`; ordinary anchors therefore log without frontend changes. POST clients send `{productId, kitId?}` and navigate to the returned `redirectUrl`. A kit token from `POST /api/recommend` is valid as `kitId`; it is optional and not a foreign key. Destinations come only from the validated catalog, cached for 60 seconds, or the bundled snapshot if that lookup fails. GET sends a 302 before recording the click with Next.js `after()`; an insert failure cannot change the redirect. POST reports `tracked:true` only after a successful insert; missing storage or a failed insert returns the same destination with `tracked:false`. Unknown products remain 404. GET ignores unrelated query parameters, including repeated marketing parameters, but rejects duplicate `productId` or `kitId` values. POST still rejects arbitrary redirect URLs in its body.

## Smoke checks after migration and seed

Run the following in a browser console on your deployment (no keys are sent from the browser):

```js
const catalog = await fetch('/api/catalog?category=boots').then(r => r.json());
console.assert(catalog.count > 0 && catalog.products[0].price_usd > 0);
const recommendation = await fetch('/api/recommend', {
  method: 'POST', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({trade:'electrician', gender:'women', shoeSize:'8',
    climate:'mild', hoursPerWeek:40, budget:'balanced', extraHazards:[], employer:[]})
}).then(r => r.json());
const productId = recommendation.kit.items[0].pick.product.id;
const click = await fetch('/api/click', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body:JSON.stringify({productId, kitId:recommendation.token})
}).then(r => r.json());
console.assert(click.tracked === true && click.redirectUrl.startsWith('https://'));
```

Then inspect `public.clicks` in Supabase: the event must have the same product and kit token and a server timestamp. In a disposable preview project, change one product price; `/api/catalog` and `/api/recommend` must reflect it on the next request. Run `npm run seed` to restore the snapshot afterward. A preview without any database credentials must still build and return the JSON catalog. Neither test constitutes proof that the frontend has adopted the live catalog; complete the integration above separately.

## Operational choices

- RLS is enabled and all table privileges are revoked from `anon` and `authenticated`. Server API keys can bypass RLS, so they stay in server-only modules. The public Next.js APIs expose the intended catalog and click insertion behavior.
- Reads have a five-second timeout, no Next.js fetch cache and stable ID pagination. They honor smaller PostgREST result caps. A configured empty/invalid catalog causes a visible 503 rather than silent stale results.
- The seed upserts in batches of 200 and does not delete. If a later batch fails, rerun after fixing configuration; already-written batches remain valid.
- The JSON seed and Postgres records share a Zod schema. `price`/`name`/`lifespanMonths` remain backward-compatible aliases of canonical fields.
- Do not interpret cut/NRR/hi-vis defaults as universal legal minima. Gloves split by task are not approved for simultaneous hazards. Employer assessment must choose chemical compatibility and required arc rating.
- The existing single clothing-size field can contain `L / 34x32`; each category matches a known size exactly. A lone top size does not infer a pants waist, and women's boots never silently substitute men's sizing.
- No IP address or user agent is stored. Public click events can be repeated or automated; they are telemetry, not billable conversions. Configure Vercel rate controls if campaign traffic warrants them.
- Runtime uses native fetch rather than a Supabase SDK: only two REST tables are needed. No connection pooling or migration credentials are shipped to the browser.
