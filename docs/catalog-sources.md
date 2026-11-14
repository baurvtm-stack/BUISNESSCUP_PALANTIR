# Catalog provenance and estimates

The seed contains **153 distinct product records**, across 35 brands and all nine existing categories. Size and color variants are not counted as separate products. Some eyewear families have separate anti-fog or anti-scratch models because their manufacturer part numbers and features differ. The JSON in `src/data/catalog.json` is the seed and offline fallback; it is not a live retailer feed.

## Reading the fields

- `source_url` is the manufacturer product, specification sheet, catalog, or family page used as the reference. Some inherited MVP records still link to a manufacturer family/catalog entry rather than a model-specific technical sheet; these are **not independently audited certifications**. The retained records are real product names, with corrections below, but their full supplier documentation needs continued review.
- `retailer_url` is where **Check price** goes: the maker's own product page, reviewed for this snapshot on 2026-11-14.
  - Five rows use the maker's listing page because no model page could be confirmed: `carhartt-j131` (Active Jacs; the thermal-lined J131 is no longer on carhartt.com), `dickies-sherpa` and `dickies-stretch-w` (Dickies men's outerwear and women's work pants; both model pages returned server errors), `wells-hydrahyde` (HydraHyde family) and `bulwark-fr-shirt` (men's shirts).
  - Wrangler, SHOWA and Lincoln Electric refuse automated checks, so `wrangler-riggs`, `showa-730`, `lincoln-mig-stick` and `lincoln-fr-jacket` use the model URLs those makers publish in search listings. Open them by hand after catalog changes.
  - Some maker pages (3M, MSA, Honeywell, Milwaukee, DEWALT, Radians, Ansell, Thorogood) show specifications but no price.
  - `ammex-nitrile` is the only Amazon fallback, a model-specific search, because the AMMEX site could not be checked. Search results are not a guaranteed SKU: check the pack quantity and size before ordering.
  - Visitors outside the US go to a US Google Shopping search for the model instead (`gl=us`, chosen from Vercel's `x-vercel-ip-country` header), because many US sites refuse them: carhartt.com answers Kazakhstan with Akamai "Access Denied", and Amazon search shows its "Sorry" page.
  - No affiliate identifier is stored in JSON. The server adds `AFFILIATE_TAG` to Amazon links only.
  - An already seeded Supabase catalog takes these links from `supabase/manufacturer-links.sql`, which `npm run catalog:links-sql` regenerates.
- `price_usd` is an approximate, pretax planning price. Every row has `price_approximate: true`. Xena and the added Red Wing models use rounded manufacturer-listed prices reviewed for this snapshot; WEAR-DEFENSE uses rounded manufacturer launch MSRP. Other prices are editorial street-price estimates carried over from the MVP or estimated for the relevant model. They are not represented as scraped live offers.
- `last_checked: 2026-11-14` is this editorial review/snapshot date, not a promise of current inventory, a live price observation for every row, or a certification issue date. Search indexes and older manufacturer catalogs can lag the retailer.
- `sizes` lists a conservative catalog subset, not live inventory. Boots use US sizes, pants use the maker's waist/inseam or women's numeric sizes, and garments use letter sizes. General apparel size subsets carried over from the MVP should be confirmed with the retailer; fit conversions between men's and women's lasts are not inferred. `one-size` denotes adjustable/unsized PPE, not a guarantee that it fits every wearer.
- `climate` and `quality` are GearFit editorial preferences. Quality scores are not measured test results.

## Lifespan and monthly cost

`lifespan_months.light`, `.moderate`, and `.heavy` are **GearFit budgeting estimates** for 20, 40, and 60 work hours per week. They are not manufacturer replacement intervals, warranties, or validated durability measurements. Most estimates scale inversely with wear hours; head protection estimates additionally limit calendar life. Pack items describe the quantity their price and estimated supply duration cover. Replacement of damaged, contaminated, impacted, expired, or poorly fitting equipment takes precedence over the estimate. Resoling, replacement suspensions, consumables, shipping, and tax are not included in modeled monthly cost.

## Primary reference groups

| Records | Reference and use |
| --- | --- |
| `xena-*` | [Xena women's safety collection](https://xenaworkwear.com/collections/safety-shoes-women) lists the model names, prices, toe types, safety tags, and sizing. [2026 manufacturer catalog](https://cdn.shopify.com/s/files/1/0256/9748/4905/files/Xena_Product_Catalog_2026.pdf?v=1773324330) provides additional specification context. Direct links are used for models with a confirmed current product URL. |
| Added `redwing-####` | Each row links to its exact Red Wing model page. For example, [2440](https://www.redwingshoes.com/mens/work/safety-toe/traction-tred-lite-02440.html) and [2452](https://www.redwingshoes.com/mens/work/safety-toe/exos-lite-02452.html) distinguish non-metallic from aluminum toe and PR protection. |
| `milwaukee-nitrile-*`, `milwaukee-pu-*`, `milwaukee-winter-*` | [Milwaukee range expansion](https://www.milwaukeetool.com/News/Press-Releases/Milwaukee-Rounds-Out-Lineup-of-Winter-Dipped-Polyurethane-and-Nitrile-Gloves) documents cut levels, materials, sizes, and historical launch pricing. [Glove technical overview](https://www.milwaukeetool.com/products/work-gear/gloves) distinguishes cut and impact standards. |
| `milwaukee-wear-defense-*` | [Manufacturer launch announcement](https://www.milwaukeetool.com/news/press-releases/milwaukee-expands-hand-protection-lineup-with-nitrile-dipped-gloves-w-wear-defense-protection) specifies the five distinct A1/A3/A4/A5/A6 products, part numbers, S–2XL sizes, and 2026 MSRP. |
| Added `ergodyne-*` eyewear | [Ergodyne manufacturer eye-protection catalog](https://www.ergodyne.com/product-flyer/view-all-eye-protection) lists model/part numbers and high-impact markings. Every added eyewear row also links to its individual product page. Clear lenses are selected; these are not welding filters or prescription lenses. |
| `3m-sf401af`, `3m-sf402af` | [3M SecureFit catalog](https://multimedia.3m.com/mws/media/1742279O/3m-securefit-protective-eyewear-product-catalog.pdf) and [SF401AF product](https://www.3m.com/3M/en_US/p/d/v000276838/). |
| `3m-x4a`, `3m-x5a` | [3M X-series technical specifications](https://multimedia.3m.com/mws/media/845196O/3m-peltor-x-series-earmuffs-technical-specifications.pdf). These are US NRR values for headband variants, not European SNR values or helmet-mounted variants. |
| `carhartt-fr-force`, `carhartt-fr-canvas` | [100235 shirt](https://www.carhartt.com/product/100235-BLKXLREG/flame-resistant-force-cotton-long-sleeve-t-shirt), [104986 pants](https://www.carhartt.com/product/104986-I26W46L30). |
| `bulwark-fr-shirt-w`, `bulwark-fr-pant-w` | [QS53 women's shirt](https://www.bulwark.com/iq-series-womens-lightweight-comfort-woven-shirt/QS53.html), [PLW3 manufacturer's listing](https://wpg.wwof.com/Products/Details/579553). Generic ATPV estimates were replaced by model-specific entries. |
| `milwaukee-bolt-t2` | [48-73-1661 Class E Type 2 helmet](https://www.milwaukeetool.com/products/details/bolt-black-full-brim-safety-helmet-type-2-class-e/48-73-1661). Vented Class C variants are not interchangeable for electrical requirements. |

## Corrections to the MVP catalog

- Women's Timberland TiTAN is **alloy toe**, not composite. The [specific model](https://www.timberland.com/en-us/p/timberland-pro/womens-workwear-10176/womens-titan-6-alloy-toe-work-boot-TB126388210) is retained under its original ID.
- [Carhartt women's Rugged Flex 802279](https://www.carhartt.com/product/802279-00111M) and [Irish Setter Ashby 83606](https://www.irishsetterboots.com/work-boots/shop-by-family/ashby/) are not marked waterproof in this catalog. Water-resistant leather does not establish waterproof boot construction.
- Wolverine's legacy `wolverine-floorhand-ins` ID now describes the documented [non-insulated waterproof Floorhand](https://www.wolverine.com/US/en/floorhand-waterproof-steel-toe-6-inch-work-boot/26878M.html).
- [Radians SV55](https://www.radians.com/products/radians-sv55-class-2-heavy-woven-two-tone-engineer-vest) is the Class 2 model. A similarly named Class 3 variant must not be inferred.
- The discontinued H701V hard hat was removed, rather than confusing it with a newer SecureFit model. See [3M's discontinuation notice](https://multimedia.3m.com/mws/media/2126401O/3m-h-series-2021-discontinuation-notice-us.pdf).
- Lincoln K2985 does not claim NFPA 2112 certification here. Its welding-use description comes from the [manufacturer brochure](https://ch-delivery.lincolnelectric.com/api/public/content/1bc5cd9aa1774d1a9dc6df5bb691493d?v=96b76bd7); ASTM D6413 is also listed by the [authorized industrial retailer](https://www.airgas.com/product/Safety-Products/Clothing/Flame-Resistant-Clothing/p/LINK2985-L). Flame resistance alone does not establish an arc rating.
- AMMEX disposable nitrile gloves are no longer eligible for a hard chemical-protection requirement based only on ASTM D6319. Select chemical gloves against the actual chemical, concentration, permeation data, and task.
- Removed unsupported A1 numeric cut ratings on general-purpose leather/impact gloves. Impact protection and cut protection are separate properties.
- Xena's **WR** tag means water-resistant; only the listed Luna variant is encoded as waterproof. Valence is **SD**, not EH. Alloy Horizon is not encoded as composite toe.

NFPA 70E is a workplace electrical-safety standard, not a blanket product certification. Arc-rated clothing is selected with the employer's incident-energy/PPE assessment; an FR jacket or EH boot alone is not an arc-flash or energized-work system. Catalog matching checks the recorded standards and features and cannot replace that assessment.
