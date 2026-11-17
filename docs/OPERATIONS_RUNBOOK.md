# Warhawk Aerospace — Production Operations & Engineering Runbook

**Version:** 3.0  
**Target Architecture:** Node.js 20+ / PostgreSQL / Docker / Resend / Static Edge  
**Platform Classification:** Drone-as-a-Service (DaaS) & AI Aerial Surveillance Platform

---

## 1. System Architecture Overview

Warhawk Aerospace operates as a hybrid architecture:
- **Client Presentation Layer:** Semantic, responsive web platform (`index.html`, `contact.html`, `admin.html`, `privacy.html`, `terms.html`) utilizing dark-navy frosted navigation, damped `requestAnimationFrame` flight sequence engine, and CSS/SVG telemetry views.
- **Application & API Server:** Pure ES Module Node.js server (`server.js`) with zero heavy framework bloat, dynamic port binding, security headers (CSP, HSTS, X-Frame-Options, nosniff), and brute-force protected routes.
- **Persistence Layer:** Dual-mode database engine (`db.js`) supporting **PostgreSQL** in production with connection pooling (`pg.Pool`), SSL, schema migrations, and a local ACID fallback for zero-dependency dev/test workflows.
- **Operator Portal:** Role-based administrative console (`/admin`) for lead qualification, status transition tracking with audit trail, notes, notification delivery monitoring, and formula-injection-safe CSV exports.
- **Notification Outbox:** Resend transactional email integration with automatic delivery failure tracking and retry queues.

---

## 2. Environment Variables & Credentials

Configure production secrets in your hosting dashboard (never commit `.env` to Git):

| Variable | Description | Example / Required |
| :--- | :--- | :--- |
| `PORT` | HTTP port assigned by hosting provider | `5173` (dynamic) |
| `HOST` | Interface to bind | `0.0.0.0` |
| `NODE_ENV` | Environment mode | `production` |
| `DATABASE_URL` | PostgreSQL connection string with SSL | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `DATABASE_SSL` | Enable SSL for managed PostgreSQL | `true` |
| `ADMIN_DEFAULT_USER` | Initial administrative operator | `admin` |
| `ADMIN_DEFAULT_PASSWORD` | Strong password for admin portal | `ChangeThisSecretKeyInProduction2026!` |
| `EMAIL_API_KEY` | Resend API credential | `re_1234567890abcdef` |
| `CONTACT_FROM_EMAIL` | Verified sending domain email | `Warhawk Aerospace <inquiries@warhawk.aero>` |
| `CONTACT_NOTIFY_EMAIL` | Internal operations recipient | `operations@warhawk.aero` |
| `CONTACT_SEND_CONFIRMATION` | Dispatch visitor confirmation email | `true` |
| `RATE_LIMIT_MAX` | Max submissions per 15 min per IP | `8` |

---

## 3. Database Management & Schema

### Automated Migrations
On startup, the server automatically verifies and creates the required database tables:
1. `inquiries`: Stores customer identity, company, service package, message, status, consent timestamp, and notification state.
2. `inquiry_status_history`: Immutable audit trail recording each status transition, who executed it, timestamp, and internal notes.
3. `admin_users`: Stores operator credentials with unique per-user salts and `scrypt` cryptographic hashes.

### Historical Data Migration
To migrate legacy JSONL records into PostgreSQL:
```bash
node scripts/migrate-data.js
```

### Database Backup
Run the backup script to generate an encrypted snapshot with SHA-256 checksum:
```bash
node scripts/backup-db.js
```
Backups are written to the `backups/` directory.

---

## 4. Operator Console & Lead Management

The private operator portal is available at `/admin`:
- **Login:** Enter configured `ADMIN_DEFAULT_USER` and `ADMIN_DEFAULT_PASSWORD`.
- **Brute-Force Protection:** Automatically locks out any IP/user with 5 consecutive failures for 15 minutes.
- **Lead Lifecycle States:**
  - `New`: Unreviewed inquiry.
  - `Contacted`: Operations has reached out via phone or email.
  - `Qualified`: Site acreage, airspace viability, and budget validated.
  - `Proposal Sent`: Binding commercial DaaS proposal delivered.
  - `Negotiation`: Commercial review of SLA, pilot coverage, and flight frequency.
  - `Won`: Executed service contract.
  - `Lost`: Feasibility or commercial decline.
  - `Archived`: Closed reference.
- **Export CSV:** Secure download button sanitizes formula injection (`=`, `+`, `-`, `@`).

---

## 5. Deployment Options

### Option A: Docker / Container (Railway, Render, Fly.io, Cloud Run)
A production-ready `Dockerfile` is provided:
```bash
docker build -t warhawk-aerospace .
docker run -p 5173:5173 -e DATABASE_URL=... warhawk-aerospace
```

### Option B: Bare-Metal / VPS (Ubuntu / Debian / Nginx)
```bash
npm ci --omit=dev
npm run build
npm start
```

---

## 6. DGCA Regulatory Compliance Checklist

Prior to deploying live drone operations at a customer site in India:
1. **Airframe Certification:** Confirm commercial aircraft possesses DGCA Type Certification and an active UIN on Digital Sky.
2. **Pilot Certification:** Ensure designated pilots hold valid Remote Pilot Certificates (RPC) from DGCA-approved RPTOs.
3. **Airspace Verification:** Check Digital Sky map for Green (unrestricted up to 400ft AGL), Yellow (requires ATC/airport clearance), or Red (requires MoCA authorization) status.
4. **Site Feasibility Survey:** Verify RF interference, GPS multipath, emergency landing zones, and private property boundary authorizations.
5. **Human-in-the-Loop AI:** Ensure all automated video/thermal detections are verified by human operators before initiating physical security responses.
