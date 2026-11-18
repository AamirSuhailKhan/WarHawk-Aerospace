/**
 * WARHAWK AEROSPACE — ENTERPRISE PRODUCTION HTTP SERVER
 * 
 * Features:
 * - Persistent dual-mode database engine (PostgreSQL connection pool & local fallback)
 * - Complete lead management & audit trail
 * - Secure admin session authentication with scrypt hashing and brute-force protection
 * - Resend transactional email notification outbox & delivery retry
 * - Formula-injection-safe CSV export
 * - Comprehensive HTTP security headers (CSP, HSTS, X-Frame-Options, nosniff)
 * - Liveness and readiness health checks
 * - Graceful shutdown and signal handling
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createDatabase, hashPassword, verifyPassword } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(path.join(projectRoot, '.env'));

export const ALLOWED_CATEGORIES = new Set([
  'Scheduled Drone Patrols',
  'AI Surveillance & Live Monitoring',
  'Industrial & Infrastructure Inspection',
  'Dedicated Industrial Monitoring',
  'Emergency & Incident Response',
  'Turnkey DaaS Contracts',
  'Technology & Software Partnership',
  'General Inquiry',
  'Drone Products',
  'Drone Services',
  'Technology Partnership',
  'Business Collaboration',
  'Technical Support',
  'Other'
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

const PUBLIC_FILES = new Set([
  'index.html',
  'contact.html',
  'admin-login.html',
  'admin.html',
  'privacy.html',
  'terms.html',
  'styles.css',
  'script.js',
  'contact-form.js',
  'robots.txt',
  'sitemap.xml'
]);

export function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Sanitize CSV cell against formula injection (DDE / CSV injection)
 * Prepends a single quote if the cell starts with =, +, -, @, tab, or carriage return.
 */
export function sanitizeCsvCell(str) {
  if (str === null || str === undefined) return '""';
  const val = String(str);
  const dangerous = /^[\s]*[=+\-@\t\r]/;
  const sanitized = dangerous.test(val) ? `'${val}` : val;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export function validateContactPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, errors: { _form: 'Invalid JSON request payload.' } };
  }

  // Honeypot trap: bots fill hidden fields
  if (typeof body.website === 'string' && body.website.trim().length > 0) {
    return { valid: false, spam: true, errors: { _form: 'Submission rejected.' } };
  }

  const errors = {};
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const workEmail = typeof body.workEmail === 'string' ? body.workEmail.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const company = typeof body.company === 'string' ? body.company.trim() : '';
  const industry = typeof body.industry === 'string' ? body.industry.trim() : '';
  const siteSize = typeof body.siteSize === 'string' ? body.siteSize.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const consent = body.consent === true;

  if (fullName.length < 2 || fullName.length > 120) {
    errors.fullName = 'Please enter your full name (2 to 120 characters).';
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!workEmail || workEmail.length > 254 || !emailRegex.test(workEmail)) {
    errors.workEmail = 'Please enter a valid work email address.';
  }

  if (phone && !/^[+()\d\s.-]{6,32}$/.test(phone)) {
    errors.phone = 'Phone number must be 6 to 32 valid digits or separators.';
  }

  if (company.length > 160) {
    errors.company = 'Company or organization name must be 160 characters or fewer.';
  }

  if (!ALLOWED_CATEGORIES.has(category)) {
    errors.category = 'Please select a valid inquiry category.';
  }

  if (message.length < 10 || message.length > 3000) {
    errors.message = 'Please describe your inquiry (10 to 3,000 characters).';
  }

  if (!consent) {
    errors.consent = 'Please confirm consent so Warhawk Aerospace can respond to your inquiry.';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: { fullName, workEmail, phone, company, industry, siteSize, category, message, consent }
  };
}

function buildOwnerEmailHtml(record) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;background:#0b1420;color:#f4f7fb;border:1px solid #2b4259;border-radius:12px;overflow:hidden">
    <div style="padding:20px 24px;background:#142336;border-bottom:1px solid #38516a">
      <div style="font-size:11px;letter-spacing:2px;color:#c9ff5e;text-transform:uppercase">Warhawk Aerospace Inquiry</div>
      <h2 style="margin:6px 0 0;font-size:20px;color:#f4f7fb">${escapeHtml(record.category)}</h2>
    </div>
    <div style="padding:24px;line-height:1.6">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#b8c9d9;width:150px">Reference ID</td><td style="padding:6px 0;font-weight:bold;color:#c9ff5e">${escapeHtml(record.inquiryId)}</td></tr>
        <tr><td style="padding:6px 0;color:#b8c9d9">Visitor Name</td><td style="padding:6px 0">${escapeHtml(record.fullName)}</td></tr>
        <tr><td style="padding:6px 0;color:#b8c9d9">Visitor Email</td><td style="padding:6px 0"><a href="mailto:${escapeHtml(record.workEmail)}" style="color:#408dd8">${escapeHtml(record.workEmail)}</a></td></tr>
        <tr><td style="padding:6px 0;color:#b8c9d9">Phone Number</td><td style="padding:6px 0">${record.phone ? escapeHtml(record.phone) : 'Not provided'}</td></tr>
        <tr><td style="padding:6px 0;color:#b8c9d9">Company</td><td style="padding:6px 0">${record.company ? escapeHtml(record.company) : 'Not provided'}</td></tr>
        <tr><td style="padding:6px 0;color:#b8c9d9">Submitted At</td><td style="padding:6px 0">${escapeHtml(record.submittedAt)}</td></tr>
      </table>
      <div style="margin-top:18px;padding:16px;background:#101c2b;border:1px solid #273c52;border-radius:8px">
        <div style="font-size:11px;letter-spacing:1.5px;color:#b8c9d9;text-transform:uppercase;margin-bottom:8px">Message / Requirements</div>
        <div style="white-space:pre-wrap;color:#f4f7fb;font-size:14px">${escapeHtml(record.message)}</div>
      </div>
    </div>
  </div>`;
}

function buildOwnerEmailText(record) {
  return [
    `New Warhawk Aerospace Inquiry — ${record.category}`,
    `Reference ID: ${record.inquiryId}`,
    `Submitted At: ${record.submittedAt}`,
    `Visitor Name: ${record.fullName}`,
    `Visitor Email: ${record.workEmail}`,
    `Phone Number: ${record.phone || 'Not provided'}`,
    `Company: ${record.company || 'Not provided'}`,
    '',
    'Message / Requirements:',
    record.message
  ].join('\n');
}

export function createRequestHandler(options = {}) {
  const rootDir = options.rootDir || projectRoot;
  const dataDir = options.dataDir || (process.env.VERCEL ? path.join(os.tmpdir(), 'warhawk-data') : path.join(rootDir, 'data'));
  const rateWindowMs = options.rateWindowMs ?? 15 * 60 * 1000;
  const rateMax = options.rateMax ?? Number(process.env.RATE_LIMIT_MAX || 8);
  const dedupeWindowMs = options.dedupeWindowMs ?? 5 * 60 * 1000;
  const sessionSecret = options.sessionSecret || process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_DEFAULT_PASSWORD || 'warhawk-session-secret-change-in-prod';

  const rateStore = new Map();
  const loginAttempts = new Map();
  const sessions = new Map(); // token -> { username, role, expiresAt }
  const dedupeStore = new Map();

  let dbInstance = null;
  let dbType = 'local';
  let dbInitPromise = null;

  async function getDb() {
    if (dbInstance) return dbInstance;
    if (dbInitPromise) return dbInitPromise;

    dbInitPromise = (async () => {
      const res = await createDatabase({
        dataDir,
        connectionString: options.connectionString || process.env.DATABASE_URL
      });
      dbType = res.type;
      dbInstance = res.db;

      // Seed initial admin user if empty
      const defaultUser = process.env.ADMIN_DEFAULT_USER || 'admin';
      const defaultPass = process.env.ADMIN_DEFAULT_PASSWORD || 'Warhawk@Admin2026!';
      const existing = await dbInstance.findAdminByUsername(defaultUser);
      if (!existing) {
        const hash = await hashPassword(defaultPass);
        await dbInstance.createAdminUser(defaultUser, hash, 'admin');
        console.info(`[auth] Initialized default admin account "${defaultUser}". Update ADMIN_DEFAULT_PASSWORD in production.`);
      }

      return dbInstance;
    })();

    return dbInitPromise;
  }

  function isEmailConfigured() {
    const apiKey = (options.emailApiKey ?? process.env.EMAIL_API_KEY ?? '').trim();
    const notifyEmail = (options.notifyEmail ?? process.env.CONTACT_NOTIFY_EMAIL ?? '').trim();
    const fromEmail = (options.fromEmail ?? process.env.CONTACT_FROM_EMAIL ?? '').trim();
    return Boolean(
      apiKey &&
      notifyEmail &&
      fromEmail &&
      !notifyEmail.includes('yourdomain.com') &&
      !fromEmail.includes('yourdomain.com')
    );
  }

  async function sendViaResend(record) {
    if (typeof options.sendEmail === 'function') {
      return options.sendEmail(record);
    }

    const apiKey = (options.emailApiKey ?? process.env.EMAIL_API_KEY ?? '').trim();
    const notifyEmail = (options.notifyEmail ?? process.env.CONTACT_NOTIFY_EMAIL ?? '').trim();
    const fromEmail = (options.fromEmail ?? process.env.CONTACT_FROM_EMAIL ?? '').trim();
    const sendConfirmation = (options.sendConfirmation ?? process.env.CONTACT_SEND_CONFIRMATION) === 'true';
    const endpoint = process.env.EMAIL_PROVIDER_URL || 'https://api.resend.com/emails';

    const ownerRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [notifyEmail],
        reply_to: record.workEmail,
        subject: `New Warhawk Aerospace Inquiry — ${record.category}`,
        html: buildOwnerEmailHtml(record),
        text: buildOwnerEmailText(record)
      })
    });

    if (!ownerRes.ok) {
      const errText = await ownerRes.text().catch(() => '');
      throw new Error(`Email provider responded with status ${ownerRes.status}${errText ? `: ${errText.slice(0, 160)}` : ''}`);
    }

    const ownerJson = await ownerRes.json().catch(() => ({}));

    if (sendConfirmation && record.workEmail) {
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [record.workEmail],
          subject: `Warhawk Aerospace — Inquiry Received (${record.inquiryId})`,
          text: [
            `Hello ${record.fullName},`,
            '',
            `Thank you for contacting Warhawk Aerospace. We have received your inquiry under "${record.category}".`,
            `Reference ID: ${record.inquiryId}`,
            `Timestamp: ${record.submittedAt}`,
            '',
            'Our commercial operations team will review your message and respond shortly.',
            '',
            'Warhawk Aerospace — Commercial DaaS Platform'
          ].join('\n')
        })
      }).catch((err) => {
        console.warn(`[contact] Confirmation email error (${record.inquiryId}):`, err.message);
      });
    }

    return { providerId: ownerJson.id || 'resend_ok' };
  }

  function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || '127.0.0.1';
  }

  function checkRateLimit(ip) {
    const now = Date.now();
    const windowStart = now - rateWindowMs;
    const timestamps = rateStore.get(ip) || [];
    const recent = timestamps.filter((ts) => ts > windowStart);
    if (recent.length >= rateMax) {
      const oldest = recent[0];
      const retrySec = Math.max(1, Math.ceil((oldest + rateWindowMs - now) / 1000));
      return { allowed: false, retrySec };
    }
    recent.push(now);
    rateStore.set(ip, recent);
    return { allowed: true };
  }

  function parseCookies(req) {
    const list = {};
    const rc = req.headers.cookie;
    if (rc) {
      rc.split(';').forEach((cookie) => {
        const parts = cookie.split('=');
        list[parts.shift().trim()] = decodeURI(parts.join('='));
      });
    }
    return list;
  }

  function createSignedToken(payload) {
    const jsonStr = JSON.stringify(payload);
    const encoded = Buffer.from(jsonStr).toString('base64url');
    const signature = crypto.createHmac('sha256', sessionSecret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  function verifySignedToken(token) {
    if (!token || typeof token !== 'string') return null;
    const dotIdx = token.indexOf('.');
    if (dotIdx === -1) return null;
    const encoded = token.slice(0, dotIdx);
    const signature = token.slice(dotIdx + 1);
    const expectedSig = crypto.createHmac('sha256', sessionSecret).update(encoded).digest('base64url');
    if (signature.length !== expectedSig.length) return null;
    try {
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) return null;
      const data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      if (typeof data.expiresAt === 'number' && Date.now() > data.expiresAt) return null;
      return data;
    } catch {
      return null;
    }
  }

  function getAuthenticatedSession(req) {
    const cookies = parseCookies(req);
    const token = cookies.wh_admin_session;
    if (!token) return null;
    // 1. Verify stateless HMAC signed session (persists across serverless instances)
    const verified = verifySignedToken(token);
    if (verified) return verified;
    // 2. Fallback to in-memory sessions
    const session = sessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      sessions.delete(token);
      return null;
    }
    return session;
  }

  function setSecurityHeaders(res, extraHeaders = {}) {
    const isHttps = process.env.NODE_ENV === 'production';
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-ancestors 'none'"
    ].join('; ');

    const headers = {
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      ...extraHeaders
    };

    if (isHttps) {
      headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    }

    return headers;
  }

  function sendJson(res, status, payload, extraHeaders = {}) {
    const body = JSON.stringify(payload);
    res.writeHead(status, setSecurityHeaders(res, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }));
    res.end(body);
  }

  async function serveStatic(reqPath, res) {
    let relative = reqPath === '/' ? 'index.html' : reqPath === '/contact' ? 'contact.html' : reqPath.replace(/^\/+/, '');
    if (relative === 'privacy') relative = 'privacy.html';
    if (relative === 'terms') relative = 'terms.html';
    if (relative === 'admin/login') relative = 'admin-login.html';
    if (relative === 'admin') relative = 'admin.html';

    if (relative.includes('..') || relative.includes('\0')) {
      sendJson(res, 403, { ok: false, error: 'Forbidden' });
      return;
    }

    const isAllowedAsset = relative.startsWith('assets/') && !relative.includes('/.');
    if (!PUBLIC_FILES.has(relative) && !isAllowedAsset) {
      sendJson(res, 404, { ok: false, error: 'Not Found' });
      return;
    }

    const fullPath = path.resolve(rootDir, relative);
    if (!fullPath.startsWith(path.resolve(rootDir))) {
      sendJson(res, 403, { ok: false, error: 'Forbidden' });
      return;
    }

    try {
      const stat = await fsp.stat(fullPath);
      if (!stat.isFile()) {
        sendJson(res, 404, { ok: false, error: 'Not Found' });
        return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const content = await fsp.readFile(fullPath);

      const cacheControl = ext === '.html' || ext === '.css' || ext === '.js'
        ? 'no-cache, must-revalidate'
        : 'public, max-age=86400';

      res.writeHead(200, setSecurityHeaders(res, {
        'Content-Type': mime,
        'Content-Length': content.length,
        'Cache-Control': cacheControl
      }));
      res.end(content);
    } catch {
      sendJson(res, 404, { ok: false, error: 'Not Found' });
    }
  }

  function readJsonBody(req, limitBytes = 32768) {
    return new Promise((resolve, reject) => {
      let total = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        total += chunk.length;
        if (total > limitBytes) {
          reject(Object.assign(new Error('Payload too large'), { status: 413 }));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve(text ? JSON.parse(text) : {});
        } catch {
          reject(Object.assign(new Error('Malformed JSON payload'), { status: 400 }));
        }
      });
      req.on('error', (err) => reject(err));
    });
  }

  return async function handleRequest(req, res) {
    const rawPath = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'] || req.url || '/';
    const url = new URL(rawPath.startsWith('http') ? rawPath : `http://${req.headers.host || 'localhost'}${rawPath.startsWith('/') ? '' : '/'}${rawPath}`);
    let pathname = url.pathname;
    if (pathname === '/api/index' || pathname === '/api/index.js') {
      const orig = req.headers['x-vercel-matched-path'] || req.headers['x-forwarded-uri'] || req.url;
      if (orig && orig !== '/api/index' && orig !== '/api/index.js') {
        try {
          pathname = new URL(orig.startsWith('http') ? orig : `http://localhost${orig.startsWith('/') ? '' : '/'}${orig}`).pathname;
        } catch {}
      }
    }

    // --- HEALTH CHECKS ---
    if (req.method === 'GET' && pathname === '/api/health') {
      const configured = isEmailConfigured();
      await getDb().catch(() => {});
      sendJson(res, 200, {
        ok: true,
        status: 'healthy',
        database: dbType,
        emailConfigured: configured,
        mode: configured ? 'live' : 'development'
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/health/liveness') {
      sendJson(res, 200, { ok: true, status: 'alive' });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/health/readiness') {
      try {
        const db = await getDb();
        await db.getMetrics();
        sendJson(res, 200, { ok: true, status: 'ready', database: dbType });
      } catch (err) {
        sendJson(res, 503, { ok: false, status: 'unavailable', error: 'Database disconnected' });
      }
      return;
    }

    // --- AI CV DETECTION PREVIEW CONTRACT ---
    if (req.method === 'GET' && pathname === '/api/ai/preview') {
      sendJson(res, 200, {
        ok: true,
        service: 'Warhawk Edge Computer Vision',
        architecture: 'RTSP Stream -> Edge GStreamer -> ONNX/YOLO Bounding Box Inference -> Human Supervisor Queue',
        timestamp: new Date().toISOString(),
        sampleInference: {
          frameId: 'FRM-20261117-09412',
          latencyMs: 22.4,
          detections: [
            { id: 'DET-1', label: 'person', confidence: 0.94, bbox: [142, 60, 85, 190], humanVerified: true },
            { id: 'DET-2', label: 'vehicle', confidence: 0.98, bbox: [320, 110, 260, 165], humanVerified: true },
            { id: 'DET-3', label: 'thermal_anomaly', confidence: 0.89, deltaTempC: 18.4, humanVerified: true }
          ]
        },
        disclaimer: 'Edge AI detects observable physical anomalies and queues alerts for human operational review. Autonomous punitive actions are prohibited.'
      });
      return;
    }

    // --- CONTACT FORM SUBMISSION ---
    if (req.method === 'POST' && pathname === '/api/contact') {
      const ip = getClientIp(req);
      const limit = checkRateLimit(ip);
      if (!limit.allowed) {
        sendJson(
          res,
          429,
          {
            ok: false,
            code: 'RATE_LIMITED',
            error: `Too many inquiry submissions. Please retry in ${limit.retrySec} seconds.`
          },
          { 'Retry-After': String(limit.retrySec) }
        );
        return;
      }

      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      if (!contentType.includes('application/json')) {
        sendJson(res, 415, { ok: false, error: 'Content-Type must be application/json.' });
        return;
      }

      let rawBody;
      try {
        rawBody = await readJsonBody(req);
      } catch (err) {
        sendJson(res, err.status || 400, { ok: false, error: err.message });
        return;
      }

      const validation = validateContactPayload(rawBody);
      if (!validation.valid) {
        sendJson(res, 400, {
          ok: false,
          code: validation.spam ? 'SPAM_REJECTED' : 'VALIDATION_ERROR',
          error: 'Please review the highlighted fields and try again.',
          errors: validation.errors
        });
        return;
      }

      const d = validation.data;
      const now = Date.now();
      const db = await getDb();

      // Clean up in-memory dedupe cache
      for (const [key, entry] of dedupeStore.entries()) {
        if (now - entry.ts > dedupeWindowMs) dedupeStore.delete(key);
      }

      async function appendLegacyLog(record) {
        try {
          if (!fs.existsSync(dataDir)) await fsp.mkdir(dataDir, { recursive: true });
          await fsp.appendFile(path.join(dataDir, 'inquiries.jsonl'), `${JSON.stringify(record)}\n`, 'utf8');
        } catch {}
      }

      const idempKey = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'].trim() : '';
      const contentHash = crypto
        .createHash('sha256')
        .update(`${d.workEmail.toLowerCase()}|${d.category}|${d.message}`)
        .digest('hex');

      // Check dedupe store and DB
      const existingByIdemp = idempKey ? dedupeStore.get(`idemp:${idempKey}`) : null;
      const existingByContent = dedupeStore.get(`hash:${contentHash}`);
      const duplicate = existingByIdemp || existingByContent;

      if (duplicate) {
        sendJson(res, 409, {
          ok: false,
          code: 'DUPLICATE_SUBMISSION',
          inquiryId: duplicate.inquiryId,
          error: 'We have already received this inquiry. Our operations team is reviewing it.'
        });
        return;
      }

      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randToken = crypto.randomBytes(3).toString('hex').toUpperCase();
      const inquiryId = `WH-${today}-${randToken}`;
      const submittedAt = new Date().toISOString();

      let createdRecord;
      try {
        createdRecord = await db.createInquiry({
          reference_id: inquiryId,
          full_name: d.fullName,
          email: d.workEmail,
          phone: d.phone,
          company: d.company,
          industry: d.industry,
          site_size: d.siteSize,
          inquiry_category: d.category,
          message: d.message,
          consent_given: true,
          consent_timestamp: submittedAt,
          created_at: submittedAt,
          status: 'New',
          idempotency_key: idempKey || null,
          notification_status: 'pending'
        });
      } catch (dbErr) {
        console.error('[contact] Database write failed:', dbErr.message);
        sendJson(res, 500, {
          ok: false,
          error: 'Could not record your inquiry due to an internal persistence error. Please retry shortly.'
        });
        return;
      }

      dedupeStore.set(`hash:${contentHash}`, { inquiryId, ts: now });
      if (idempKey) dedupeStore.set(`idemp:${idempKey}`, { inquiryId, ts: now });

      const configured = isEmailConfigured();
      if (configured) {
        try {
          const delivery = await sendViaResend({
            inquiryId,
            fullName: d.fullName,
            workEmail: d.workEmail,
            phone: d.phone,
            company: d.company,
            category: d.category,
            message: d.message,
            submittedAt
          });

          await db.updateInquiry(inquiryId, {
            notification_status: 'sent',
            notification_attempts: 1
          });
          await appendLegacyLog({
            inquiryId,
            fullName: d.fullName,
            workEmail: d.workEmail,
            phone: d.phone,
            company: d.company,
            category: d.category,
            message: d.message,
            submittedAt,
            status: 'sent'
          });

          console.info(`[contact] Inquiry accepted & emailed (${inquiryId}, ${d.category})`);
          sendJson(res, 201, {
            ok: true,
            inquiryId,
            submittedAt,
            deliveryMode: 'live',
            message: 'Your inquiry has been received and forwarded to the Warhawk Aerospace team.'
          });
          return;
        } catch (err) {
          await db.updateInquiry(inquiryId, {
            notification_status: 'failed',
            notification_attempts: 1,
            last_notification_error: err.message
          });
          console.error(`[contact] Email delivery failed (${inquiryId}):`, err.message);
          sendJson(res, 502, {
            ok: false,
            code: 'EMAIL_DELIVERY_FAILED',
            inquiryId,
            error: 'We recorded your reference ID, but our email dispatch encountered an error. Please retry shortly.'
          });
          return;
        }
      }

      // Development / Local queue fallback
      await db.updateInquiry(inquiryId, {
        notification_status: 'dev_queued',
        notification_attempts: 0
      });
      await appendLegacyLog({
        inquiryId,
        fullName: d.fullName,
        workEmail: d.workEmail,
        phone: d.phone,
        company: d.company,
        category: d.category,
        message: d.message,
        submittedAt,
        status: 'dev_queued'
      });

      console.info(`[contact] Inquiry recorded in development mode (${inquiryId}, ${d.category})`);
      sendJson(res, 201, {
        ok: true,
        inquiryId,
        submittedAt,
        deliveryMode: 'development',
        message: 'Inquiry validated and saved in database (development mode). Configure EMAIL_API_KEY to enable live email delivery.'
      });
      return;
    }

    // --- ADMIN AUTHENTICATION ---
    if (req.method === 'POST' && pathname === '/api/admin/login') {
      const ip = getClientIp(req);
      const now = Date.now();
      const attempts = loginAttempts.get(ip) || { count: 0, lockUntil: 0 };

      if (now < attempts.lockUntil) {
        const sec = Math.ceil((attempts.lockUntil - now) / 1000);
        sendJson(res, 429, { ok: false, error: `Too many failed login attempts. Account locked for ${sec} seconds.` });
        return;
      }

      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(res, 400, { ok: false, error: 'Malformed JSON payload' });
        return;
      }

      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      if (!username || !password) {
        sendJson(res, 400, { ok: false, error: 'Username and password required.' });
        return;
      }

      const db = await getDb();
      const user = await db.findAdminByUsername(username);

      if (!user || !(await verifyPassword(password, user.password_hash))) {
        attempts.count++;
        if (attempts.count >= 5) {
          attempts.lockUntil = now + 15 * 60 * 1000; // 15 min lock
        }
        loginAttempts.set(ip, attempts);
        sendJson(res, 401, { ok: false, error: 'Invalid username or password.' });
        return;
      }

      // Success -> reset attempts
      loginAttempts.delete(ip);
      await db.updateAdminLastLogin(username);

      // Create session (stateless HMAC signed + in-memory cached)
      const maxAgeMs = 8 * 60 * 60 * 1000; // 8 hours
      const sessionData = {
        username: user.username,
        role: user.role || 'admin',
        expiresAt: now + maxAgeMs
      };
      const token = createSignedToken(sessionData);
      sessions.set(token, sessionData);

      const isProd = process.env.NODE_ENV === 'production';
      const cookieHeader = `wh_admin_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeMs / 1000}${isProd ? '; Secure' : ''}`;

      sendJson(res, 200, { ok: true, username: user.username, role: user.role }, {
        'Set-Cookie': cookieHeader
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/logout') {
      const cookies = parseCookies(req);
      const token = cookies.wh_admin_session;
      if (token) sessions.delete(token);

      sendJson(res, 200, { ok: true, message: 'Logged out successfully.' }, {
        'Set-Cookie': 'wh_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
      });
      return;
    }

    // --- PROTECTED ADMIN APIS ---
    if (pathname.startsWith('/api/admin/')) {
      const session = getAuthenticatedSession(req);
      if (!session) {
        sendJson(res, 401, { ok: false, error: 'Unauthorized. Please log in.' });
        return;
      }

      const db = await getDb();

      if (req.method === 'GET' && pathname === '/api/admin/me') {
        sendJson(res, 200, { ok: true, username: session.username, role: session.role });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/admin/metrics') {
        const metrics = await db.getMetrics();
        sendJson(res, 200, metrics);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/admin/inquiries') {
        const search = url.searchParams.get('search') || '';
        const status = url.searchParams.get('status') || '';
        const category = url.searchParams.get('category') || '';
        const sortOrder = url.searchParams.get('sortOrder') || 'desc';
        const page = parseInt(url.searchParams.get('page') || '1', 10);
        const limit = parseInt(url.searchParams.get('limit') || '20', 10);

        const data = await db.getInquiries({ search, status, category, sortOrder, page, limit });
        sendJson(res, 200, data);
        return;
      }

      if (req.method === 'GET' && pathname.startsWith('/api/admin/inquiries/')) {
        const refId = pathname.replace('/api/admin/inquiries/', '').trim();
        const inquiry = await db.getInquiryById(refId);
        if (!inquiry) {
          sendJson(res, 404, { ok: false, error: 'Inquiry not found.' });
          return;
        }
        const history = await db.getStatusHistory(inquiry.id);
        sendJson(res, 200, { inquiry, history });
        return;
      }

      if (req.method === 'PATCH' && pathname.startsWith('/api/admin/inquiries/')) {
        const refId = pathname.replace('/api/admin/inquiries/', '').trim();
        let body;
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { ok: false, error: 'Invalid JSON payload' });
          return;
        }

        const updates = {};
        if (body.status) updates.status = body.status;
        if (typeof body.assigned_to === 'string') updates.assigned_to = body.assigned_to;
        if (typeof body.admin_notes === 'string') updates.admin_notes = body.admin_notes;

        const updated = await db.updateInquiry(refId, updates, session.username);
        if (!updated) {
          sendJson(res, 404, { ok: false, error: 'Inquiry not found.' });
          return;
        }
        sendJson(res, 200, { ok: true, inquiry: updated });
        return;
      }

      if (req.method === 'POST' && pathname.endsWith('/retry-notification')) {
        const refId = pathname.split('/')[4];
        const inquiry = await db.getInquiryById(refId);
        if (!inquiry) {
          sendJson(res, 404, { ok: false, error: 'Inquiry not found.' });
          return;
        }

        const configured = isEmailConfigured();
        if (!configured) {
          await db.updateInquiry(refId, {
            notification_status: 'dev_queued',
            notification_attempts: (inquiry.notification_attempts || 0) + 1
          });
          sendJson(res, 200, { ok: true, message: 'Notification queued (development mode). Email provider not configured.' });
          return;
        }

        try {
          await sendViaResend({
            inquiryId: inquiry.reference_id,
            fullName: inquiry.full_name,
            workEmail: inquiry.email,
            phone: inquiry.phone,
            company: inquiry.company,
            category: inquiry.inquiry_category,
            message: inquiry.message,
            submittedAt: inquiry.created_at
          });

          await db.updateInquiry(refId, {
            notification_status: 'sent',
            notification_attempts: (inquiry.notification_attempts || 0) + 1,
            last_notification_error: null
          });
          sendJson(res, 200, { ok: true, message: 'Notification dispatched successfully.' });
        } catch (err) {
          await db.updateInquiry(refId, {
            notification_status: 'failed',
            notification_attempts: (inquiry.notification_attempts || 0) + 1,
            last_notification_error: err.message
          });
          sendJson(res, 502, { ok: false, error: `Dispatch failed: ${err.message}` });
        }
        return;
      }

      // Safe CSV Export with Formula Injection Sanitization
      if (req.method === 'GET' && pathname === '/api/admin/export') {
        const search = url.searchParams.get('search') || '';
        const status = url.searchParams.get('status') || '';
        const category = url.searchParams.get('category') || '';

        const data = await db.getInquiries({ search, status, category, limit: 100000 });
        const headers = [
          'Reference ID',
          'Date',
          'Full Name',
          'Work Email',
          'Phone',
          'Company',
          'Industry',
          'Service Category',
          'Status',
          'Assigned To',
          'Notification Status',
          'Message',
          'Admin Notes'
        ];

        const rows = [headers.map(sanitizeCsvCell).join(',')];
        for (const item of data.inquiries) {
          rows.push([
            sanitizeCsvCell(item.reference_id),
            sanitizeCsvCell(item.created_at),
            sanitizeCsvCell(item.full_name),
            sanitizeCsvCell(item.email),
            sanitizeCsvCell(item.phone),
            sanitizeCsvCell(item.company),
            sanitizeCsvCell(item.industry),
            sanitizeCsvCell(item.inquiry_category),
            sanitizeCsvCell(item.status),
            sanitizeCsvCell(item.assigned_to),
            sanitizeCsvCell(item.notification_status),
            sanitizeCsvCell(item.message),
            sanitizeCsvCell(item.admin_notes)
          ].join(','));
        }

        const csvContent = '\uFEFF' + rows.join('\r\n');
        const filename = `warhawk-inquiries-${new Date().toISOString().slice(0, 10)}.csv`;

        res.writeHead(200, setSecurityHeaders(res, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store'
        }));
        res.end(csvContent);
        return;
      }

      sendJson(res, 404, { ok: false, error: 'Admin API route not found.' });
      return;
    }

    // --- STATIC FILES & WEB PAGES ---
    if (req.method === 'GET' || req.method === 'HEAD') {
      // Admin dashboard route protection
      if (pathname === '/admin') {
        const session = getAuthenticatedSession(req);
        if (!session) {
          res.writeHead(302, { Location: '/admin/login' });
          res.end();
          return;
        }
      }
      if (pathname === '/admin/login') {
        const session = getAuthenticatedSession(req);
        if (session) {
          res.writeHead(302, { Location: '/admin' });
          res.end();
          return;
        }
      }

      await serveStatic(pathname, res);
      return;
    }

    sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  };
}

export function createAppServer(options = {}) {
  const handler = createRequestHandler(options);
  return http.createServer(handler);
}

const defaultHandler = createRequestHandler();
export default async function handler(req, res) {
  return defaultHandler(req, res);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const port = Number(process.env.PORT || 5173);
  const host = process.env.HOST || '0.0.0.0';
  const server = createAppServer();

  server.listen(port, host, () => {
    console.log(`Warhawk Aerospace server running at http://${host}:${port}`);
  });

  // Graceful shutdown handling
  const shutdown = () => {
    console.log('\n[server] Gracefully shutting down HTTP service...');
    server.close(() => {
      console.log('[server] Server closed cleanly.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[server] Forced shutdown after timeout.');
      process.exit(1);
    }, 5000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
