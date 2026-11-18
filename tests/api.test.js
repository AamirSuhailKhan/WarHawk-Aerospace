import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { createAppServer } from '../server/server.js';

async function withServer(options, fn) {
  const tmpData = await fsp.mkdtemp(path.join(os.tmpdir(), 'wh-api-test-'));
  const server = createAppServer({ dataDir: tmpData, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await fn({ baseUrl, dataDir: tmpData });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fsp.rm(tmpData, { recursive: true, force: true });
  }
}

test('serves HTML pages and blocks private server files', async () => {
  await withServer({}, async ({ baseUrl }) => {
    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /WARHAWK AEROSPACE/);

    const contact = await fetch(`${baseUrl}/contact`);
    assert.equal(contact.status, 200);
    assert.match(await contact.text(), /START A/);

    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    const healthJson = await health.json();
    assert.equal(healthJson.ok, true);

    const blocked = await fetch(`${baseUrl}/server.js`);
    assert.equal(blocked.status, 404);

    const envBlocked = await fetch(`${baseUrl}/.env`);
    assert.equal(envBlocked.status, 404);
  });
});

test('rejects invalid contact payloads and honeypot spam', async () => {
  await withServer({}, async ({ baseUrl }) => {
    const invalidRes = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'A',
        workEmail: 'not-an-email',
        category: 'Unknown Category',
        message: 'short',
        consent: false
      })
    });
    assert.equal(invalidRes.status, 400);
    const invalidJson = await invalidRes.json();
    assert.equal(invalidJson.ok, false);
    assert.ok(invalidJson.errors.fullName);
    assert.ok(invalidJson.errors.workEmail);
    assert.ok(invalidJson.errors.category);
    assert.ok(invalidJson.errors.message);
    assert.ok(invalidJson.errors.consent);

    const spamRes = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Bot User',
        workEmail: 'bot@example.com',
        category: 'General Inquiry',
        message: 'Automated spam message test content.',
        consent: true,
        website: 'http://spam.example.com'
      })
    });
    assert.equal(spamRes.status, 400);
    assert.equal((await spamRes.json()).code, 'SPAM_REJECTED');
  });
});

test('accepts valid inquiry in development mode, persists record, and blocks duplicates', async () => {
  await withServer({}, async ({ baseUrl, dataDir }) => {
    const payload = {
      fullName: 'Elena Vance',
      workEmail: 'elena@aerodynamics-partner.example',
      phone: '+1 555 204 8899',
      company: 'Aero Partner Ltd',
      category: 'Technology Partnership',
      message: 'Interested in discussing telemetry collaboration and sensor integration.',
      consent: true
    };

    const res = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'key-elena-1'
      },
      body: JSON.stringify(payload)
    });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.deliveryMode, 'development');
    assert.match(json.inquiryId, /^WH-\d{8}-[A-F0-9]{6}$/);

    const saved = await fsp.readFile(path.join(dataDir, 'inquiries.jsonl'), 'utf8');
    const parsed = JSON.parse(saved.trim());
    assert.equal(parsed.inquiryId, json.inquiryId);
    assert.equal(parsed.status, 'dev_queued');

    const dupRes = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'key-elena-1'
      },
      body: JSON.stringify(payload)
    });
    assert.equal(dupRes.status, 409);
    assert.equal((await dupRes.json()).code, 'DUPLICATE_SUBMISSION');
  });
});

test('dispatches live email notification when configured and handles provider failures', async () => {
  const sentRecords = [];
  await withServer(
    {
      emailApiKey: 'test-key-123',
      notifyEmail: 'team@warhawk.test',
      fromEmail: 'noreply@warhawk.test',
      sendEmail: async (record) => {
        sentRecords.push(record);
        return { providerId: 'email_ok_1' };
      }
    },
    async ({ baseUrl }) => {
      const res = await fetch(`${baseUrl}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Marcus Reid',
          workEmail: 'marcus@partner.test',
          category: 'Drone Products',
          message: 'Requesting product specifications for unmanned aerial platforms.',
          consent: true
        })
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.deliveryMode, 'live');
      assert.equal(sentRecords.length, 1);
      assert.equal(sentRecords[0].category, 'Drone Products');
    }
  );

  await withServer(
    {
      emailApiKey: 'test-key-123',
      notifyEmail: 'team@warhawk.test',
      fromEmail: 'noreply@warhawk.test',
      sendEmail: async () => {
        throw new Error('Upstream SMTP/API timeout');
      }
    },
    async ({ baseUrl }) => {
      const failRes = await fetch(`${baseUrl}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Marcus Reid',
          workEmail: 'marcus@partner.test',
          category: 'Drone Products',
          message: 'Requesting product specifications for unmanned aerial platforms.',
          consent: true
        })
      });
      assert.equal(failRes.status, 502);
      const failJson = await failRes.json();
      assert.equal(failJson.ok, false);
      assert.equal(failJson.code, 'EMAIL_DELIVERY_FAILED');
    }
  );
});

test('enforces rate limiting per client IP', async () => {
  await withServer({ rateMax: 2, rateWindowMs: 60000 }, async ({ baseUrl }) => {
    for (let i = 0; i < 2; i++) {
      const r = await fetch(`${baseUrl}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Rate Check',
          workEmail: `user${i}@example.com`,
          category: 'Other',
          message: 'Rate limit testing inquiry message content.',
          consent: true
        })
      });
      assert.equal(r.status, 201);
    }
    const blocked = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Rate Check 3',
        workEmail: 'user3@example.com',
        category: 'Other',
        message: 'Rate limit testing third inquiry message content.',
        consent: true
      })
    });
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get('retry-after'));
  });
});

test('provides health liveness, readiness, and AI preview contracts', async () => {
  await withServer({}, async ({ baseUrl }) => {
    const live = await fetch(`${baseUrl}/api/health/liveness`);
    assert.equal(live.status, 200);
    assert.equal((await live.json()).status, 'alive');

    const ready = await fetch(`${baseUrl}/api/health/readiness`);
    assert.equal(ready.status, 200);
    assert.equal((await ready.json()).status, 'ready');

    const ai = await fetch(`${baseUrl}/api/ai/preview`);
    assert.equal(ai.status, 200);
    const aiJson = await ai.json();
    assert.equal(aiJson.ok, true);
    assert.ok(Array.isArray(aiJson.sampleInference.detections));
    assert.ok(aiJson.disclaimer.includes('human'));
  });
});

test('protects admin routes, authenticates operators, and audits status transitions', async () => {
  await withServer({}, async ({ baseUrl }) => {
    // 1. Unauthorized access to admin endpoints returns 401
    const unauthedMetrics = await fetch(`${baseUrl}/api/admin/metrics`);
    assert.equal(unauthedMetrics.status, 401);

    const unauthedInquiries = await fetch(`${baseUrl}/api/admin/inquiries`);
    assert.equal(unauthedInquiries.status, 401);

    // 2. Invalid credentials return 401
    const badLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong-password' })
    });
    assert.equal(badLogin.status, 401);

    // 3. Submit a customer inquiry first
    const inquiryRes = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Dr. Vikram Sarabhai',
        workEmail: 'vikram@isro-partner.in',
        phone: '+91 98765 43210',
        company: 'Apex Space Industries',
        category: 'Dedicated Industrial Monitoring',
        message: 'Requesting multi-tier perimeter drone inspection with optical and FLIR sensors.',
        consent: true
      })
    });
    assert.equal(inquiryRes.status, 201);
    const { inquiryId } = await inquiryRes.json();

    // 4. Successful admin login with default credentials
    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Warhawk@Admin2026!' })
    });
    assert.equal(loginRes.status, 200);
    const cookie = loginRes.headers.get('set-cookie');
    assert.ok(cookie && cookie.includes('wh_admin_session='));

    // Extract cookie token for subsequent requests
    const sessionCookie = cookie.split(';')[0];

    // 5. Authorized metrics
    const metricsRes = await fetch(`${baseUrl}/api/admin/metrics`, {
      headers: { Cookie: sessionCookie }
    });
    assert.equal(metricsRes.status, 200);
    const metrics = await metricsRes.json();
    assert.ok(metrics.total >= 1);
    assert.ok(metrics.new >= 1);

    // 6. Retrieve inquiry details
    const detailRes = await fetch(`${baseUrl}/api/admin/inquiries/${inquiryId}`, {
      headers: { Cookie: sessionCookie }
    });
    assert.equal(detailRes.status, 200);
    const { inquiry, history } = await detailRes.json();
    assert.equal(inquiry.reference_id, inquiryId);
    assert.equal(inquiry.status, 'New');

    // 7. Update status to 'Qualified' with internal notes and assignment
    const patchRes = await fetch(`${baseUrl}/api/admin/inquiries/${inquiryId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      },
      body: JSON.stringify({
        status: 'Qualified',
        assigned_to: 'Captain Rajesh Kumar',
        admin_notes: 'Site survey scheduled for Friday. 120-acre facility clearance verified.'
      })
    });
    assert.equal(patchRes.status, 200);

    // 8. Verify status change in audit history
    const updatedRes = await fetch(`${baseUrl}/api/admin/inquiries/${inquiryId}`, {
      headers: { Cookie: sessionCookie }
    });
    const updatedData = await updatedRes.json();
    assert.equal(updatedData.inquiry.status, 'Qualified');
    assert.equal(updatedData.inquiry.assigned_to, 'Captain Rajesh Kumar');
    assert.ok(updatedData.history.length >= 1);
    assert.equal(updatedData.history[0].previous_status, 'New');
    assert.equal(updatedData.history[0].new_status, 'Qualified');
    assert.equal(updatedData.history[0].changed_by, 'admin');

    // 9. Safe CSV Export with formula injection sanitization
    const exportRes = await fetch(`${baseUrl}/api/admin/export`, {
      headers: { Cookie: sessionCookie }
    });
    assert.equal(exportRes.status, 200);
    assert.equal(exportRes.headers.get('content-type'), 'text/csv; charset=utf-8');
    const csv = await exportRes.text();
    assert.match(csv, /"Reference ID"/);
    assert.match(csv, /Vikram Sarabhai/);
    assert.match(csv, /Qualified/);
  });
});


