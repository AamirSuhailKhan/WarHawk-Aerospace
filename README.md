# Warhawk Aerospace — Drone-as-a-Service (DaaS) & AI Aerial Platform

Turnkey Drone-as-a-Service (DaaS) and AI-Powered Aerial Surveillance & Industrial Inspection web platform and inquiry service for enterprises, industrial plants, warehouses, solar farms, infrastructure operators, and campuses across India. 100% DGCA compliant.

## Project Structure

- `index.html` — Homepage with opening eagle reveal, hero, DaaS manifesto, 6-stage flight sequence, systems console, 7 interactive capability cards with live animations & category filters, indicative pricing hypotheses, CTA, and footer.
- `contact.html` — Dedicated `/contact` page with full responsive inquiry form.
- `styles.css` — Design system (`#060B12` base, `#142336`/`#182C43` frosted navy navbar, `#38516A` borders, `#C9FF5E` lime & `#408DD8` aerospace blue accents) and responsive layout.
- `script.js` — Opening aperture reveal, active navigation scroll-spy, mobile drawer, capability category pre-selection, damped `requestAnimationFrame` scroll engine, and ambient particle canvases.
- `contact-form.js` — Shared client-side form validation, live character count, idempotency keys, and API integration.
- `server.js` — Production HTTP server serving static files, `/contact`, `/api/health`, and `POST /api/contact`.
- `scripts/build.js` — Syntax verification and production bundle generation (`dist/`).
- `tests/api.test.js` — API integration tests (validation, spam honeypot, deduplication, rate limiting, live email dispatch & failure handling).
- `tests/e2e.test.js` — Headless browser Playwright tests across desktop (`1920px`, `1440px`, `1024px`), tablet (`768px`), and mobile (`390px`, `360px`).
- `.env.example` — Environment configuration template.

## Local Development

```bash
npm install
cp .env.example .env
npm run dev
```

Visit `http://localhost:5173` (or `http://localhost:5173/contact`).

## Transactional Email Setup (Resend)

When `EMAIL_API_KEY`, `CONTACT_FROM_EMAIL`, and `CONTACT_NOTIFY_EMAIL` are not configured, `/api/contact` runs in **local development mode**: it validates inputs, prevents duplicates, saves inquiries to `data/inquiries.jsonl`, and clearly reports development mode instead of faking live email delivery.

To enable live owner notifications:

1. Create an account and API key at [Resend](https://resend.com) and verify your sending domain.
2. Copy `.env.example` to `.env` and fill in your real credentials:
   ```env
   PORT=5173
   NODE_ENV=production
   EMAIL_API_KEY=re_your_live_api_key
   CONTACT_FROM_EMAIL="Warhawk Aerospace <inquiries@yourdomain.com>"
   CONTACT_NOTIFY_EMAIL=team@yourdomain.com
   CONTACT_SEND_CONFIRMATION=true
   ```
3. Restart the server (`npm start`). Owner notifications are sent with subject `New Warhawk Aerospace Inquiry — [Category]`, visitor contact details, timestamp, and unique `inquiryId`.

## Build, Lint, and Test

```bash
npm run lint
npm run build
npm test
```

## Production Deployment

1. Run `npm run build` to verify syntax and output deployable artifacts into `dist/`.
2. Deploy the project (or `dist/`) to any Node.js >= 20 hosting provider (Railway, Render, Fly.io, DigitalOcean App Platform, or a VPS with reverse proxy/HTTPS).
3. Configure `.env` environment variables in your host's secret manager and start with `npm start` (`node server.js`).
