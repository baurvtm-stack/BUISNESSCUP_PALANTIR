# GearFit

**The right work gear for your trade, bought once.** GearFit is a web app for US tradespeople who pay for their own boots and PPE. Answer 5 questions (trade, hazards, climate and hours, employer rules, fit and budget) and get a complete kit that meets the OSHA, ASTM and ANSI standards your job calls for, with the real **cost per month of wear** for every item.

Business Cup 2.0, Money track.

## What it does

- **Questionnaire** (`/build`): 11 trades, 16 hazards, 4 climates, employer requirements, sizing and budget.
- **Rule-based matching engine** (`src/lib/engine.ts`): hazards → hard/soft requirements (ASTM F2413, ANSI Z87.1+, Z89.1, ISEA 105/107/138, NFPA 70E) → compliant products → ranked by price, cost per month and quality according to the user's budget priority. Handles budget caps, women's sizing, and splits gloves into two pairs when one pair can't cover every hazard.
- **Kit page** (`/kit?k=…`): every pick explains which standard it meets and why, with swap options (lowest price, lowest cost per month, top quality), totals, and savings vs the cheapest compliant kit.
- **Share without accounts**: the answers are encoded in the URL, so the kit link is permanent and needs no login.
- **Replacement reminders**: one click downloads an `.ics` file with a calendar event per item when it's due for replacement.
- **Catalog** (`/catalog`): ~80 real products sorted by cost per month.

## API

- `POST /api/recommend` with answers JSON → `{ token, kit }`
- `GET /api/catalog?category=boots` → products, trades, hazards

## Run locally

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # engine tests
npm run build
```

Stack: Next.js 15 (App Router), React 19, Tailwind CSS 4, TypeScript, Vitest. No database or secrets required; deploys to Vercel as-is.

Prices are approximate street prices; lifespans are GearFit estimates. Always confirm specs with the product page and your site's safety rules.
