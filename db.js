/**
 * WARHAWK AEROSPACE — DATABASE & PERSISTENCE ARCHITECTURE
 * 
 * Supports dual persistence modes:
 * 1. PostgreSQL (Production / Staging) via connection pooling ('pg') when DATABASE_URL is configured.
 * 2. SQLite / Durable Local ACID Store (Development / Test / Airgapped fallback) when DATABASE_URL is omitted.
 * 
 * Includes automated schema migrations, status history audit trails, 
 * parameterized queries, connection health checks, and admin user store.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const INQUIRY_STATUSES = [
  'New',
  'Contacted',
  'Qualified',
  'Proposal Sent',
  'Negotiation',
  'Won',
  'Lost',
  'Archived'
];

export const NOTIFICATION_STATUSES = [
  'pending',
  'sent',
  'dev_queued',
  'failed'
];

/**
 * Hash password with scrypt (salt + key)
 */
export async function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verify password against stored scrypt hash
 */
export async function verifyPassword(password, storedHash) {
  return new Promise((resolve) => {
    if (!storedHash || !storedHash.includes(':')) return resolve(false);
    const [salt, keyHex] = storedHash.split(':');
    const key = Buffer.from(keyHex, 'hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        resolve(crypto.timingSafeEqual(key, derivedKey));
      } catch {
        resolve(false);
      }
    });
  });
}

class LocalDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {
      inquiries: [],
      statusHistory: [],
      adminUsers: []
    };
    this.loaded = false;
    this.writePromise = Promise.resolve();
  }

  async init() {
    let dir = path.dirname(this.filePath);
    try {
      if (!fs.existsSync(dir)) {
        await fsp.mkdir(dir, { recursive: true });
      }
    } catch (err) {
      if (err.code === 'EROFS' || err.code === 'EACCES') {
        const fallbackDir = path.join(os.tmpdir(), 'warhawk-data');
        await fsp.mkdir(fallbackDir, { recursive: true }).catch(() => {});
        this.filePath = path.join(fallbackDir, path.basename(this.filePath));
        dir = fallbackDir;
      } else {
        throw err;
      }
    }
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = await fsp.readFile(this.filePath, 'utf8');
        this.data = JSON.parse(raw);
        if (!Array.isArray(this.data.inquiries)) this.data.inquiries = [];
        if (!Array.isArray(this.data.statusHistory)) this.data.statusHistory = [];
        if (!Array.isArray(this.data.adminUsers)) this.data.adminUsers = [];
      } catch {
        this.data = { inquiries: [], statusHistory: [], adminUsers: [] };
      }
    } else {
      await this.persist();
    }
    this.loaded = true;
  }

  async persist() {
    this.writePromise = this.writePromise.then(async () => {
      try {
        const tempPath = `${this.filePath}.${Date.now()}.tmp`;
        const json = JSON.stringify(this.data, null, 2);
        await fsp.writeFile(tempPath, json, 'utf8');
        await fsp.rename(tempPath, this.filePath);
      } catch (err) {
        if (err.code === 'EROFS' || err.code === 'EACCES') {
          const fallbackDir = path.join(os.tmpdir(), 'warhawk-data');
          await fsp.mkdir(fallbackDir, { recursive: true }).catch(() => {});
          this.filePath = path.join(fallbackDir, path.basename(this.filePath));
          const tempPath = `${this.filePath}.${Date.now()}.tmp`;
          const json = JSON.stringify(this.data, null, 2);
          await fsp.writeFile(tempPath, json, 'utf8');
          await fsp.rename(tempPath, this.filePath);
        } else {
          throw err;
        }
      }
    });
    return this.writePromise;
  }

  async createInquiry(record) {
    const id = this.data.inquiries.length > 0
      ? Math.max(...this.data.inquiries.map((i) => i.id || 0)) + 1
      : 1;

    const row = {
      id,
      reference_id: record.reference_id,
      full_name: record.full_name,
      email: record.email,
      phone: record.phone || '',
      company: record.company || '',
      industry: record.industry || '',
      site_size: record.site_size || '',
      inquiry_category: record.inquiry_category,
      message: record.message,
      consent_given: Boolean(record.consent_given),
      consent_timestamp: record.consent_timestamp || new Date().toISOString(),
      created_at: record.created_at || new Date().toISOString(),
      updated_at: record.updated_at || new Date().toISOString(),
      status: record.status || 'New',
      assigned_to: record.assigned_to || null,
      admin_notes: record.admin_notes || '',
      idempotency_key: record.idempotency_key || null,
      notification_status: record.notification_status || 'pending',
      notification_attempts: record.notification_attempts || 0,
      last_notification_error: record.last_notification_error || null
    };

    this.data.inquiries.unshift(row);
    await this.persist();
    return row;
  }

  async getInquiries({ search = '', status = '', category = '', page = 1, limit = 25, sortOrder = 'desc' } = {}) {
    let rows = [...this.data.inquiries];

    if (status && status !== 'all') {
      rows = rows.filter((r) => r.status.toLowerCase() === status.toLowerCase());
    }

    if (category && category !== 'all') {
      rows = rows.filter((r) => r.inquiry_category.toLowerCase() === category.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        r.reference_id?.toLowerCase().includes(q) ||
        r.full_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.company?.toLowerCase().includes(q) ||
        r.message?.toLowerCase().includes(q)
      );
    }

    rows.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    const total = rows.length;
    const offset = (page - 1) * limit;
    const paginated = rows.slice(offset, offset + limit);

    return {
      inquiries: paginated,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    };
  }

  async getInquiryById(idOrRef) {
    return this.data.inquiries.find(
      (r) => String(r.id) === String(idOrRef) || r.reference_id === idOrRef
    ) || null;
  }

  async getInquiryByIdempotency(key) {
    if (!key) return null;
    return this.data.inquiries.find((r) => r.idempotency_key === key) || null;
  }

  async getInquiryByHash(email, category, message) {
    const norm = `${email.toLowerCase()}|${category}|${message.trim()}`;
    return this.data.inquiries.find((r) => {
      const rNorm = `${r.email.toLowerCase()}|${r.inquiry_category}|${r.message.trim()}`;
      return rNorm === norm;
    }) || null;
  }

  async updateInquiry(idOrRef, updates, changedBy = 'system') {
    const index = this.data.inquiries.findIndex(
      (r) => String(r.id) === String(idOrRef) || r.reference_id === idOrRef
    );
    if (index === -1) return null;

    const current = this.data.inquiries[index];
    const prevStatus = current.status;

    const updated = {
      ...current,
      ...updates,
      updated_at: new Date().toISOString()
    };

    if (updates.status && updates.status !== prevStatus) {
      this.data.statusHistory.unshift({
        id: this.data.statusHistory.length + 1,
        inquiry_id: current.id,
        previous_status: prevStatus,
        new_status: updates.status,
        changed_by: changedBy,
        notes: updates.admin_notes || `Status changed from ${prevStatus} to ${updates.status}`,
        created_at: new Date().toISOString()
      });
    }

    this.data.inquiries[index] = updated;
    await this.persist();
    return updated;
  }

  async getStatusHistory(inquiryId) {
    return this.data.statusHistory.filter((h) => String(h.inquiry_id) === String(inquiryId));
  }

  async getMetrics() {
    const total = this.data.inquiries.length;
    const counts = {
      total,
      new: 0,
      contacted: 0,
      qualified: 0,
      proposalSent: 0,
      negotiation: 0,
      won: 0,
      lost: 0,
      archived: 0
    };

    for (const r of this.data.inquiries) {
      const s = (r.status || 'new').toLowerCase().replace(/\s+/g, '');
      if (s === 'new') counts.new++;
      else if (s === 'contacted') counts.contacted++;
      else if (s === 'qualified') counts.qualified++;
      else if (s === 'proposalsent') counts.proposalSent++;
      else if (s === 'negotiation') counts.negotiation++;
      else if (s === 'won') counts.won++;
      else if (s === 'lost') counts.lost++;
      else if (s === 'archived') counts.archived++;
    }

    const conversionRate = total > 0 ? ((counts.won / total) * 100).toFixed(1) : '0.0';
    return { ...counts, conversionRate };
  }

  async findAdminByUsername(username) {
    return this.data.adminUsers.find((u) => u.username.toLowerCase() === username.toLowerCase()) || null;
  }

  async createAdminUser(username, passwordHash, role = 'admin') {
    const existing = await this.findAdminByUsername(username);
    if (existing) {
      existing.password_hash = passwordHash;
      existing.role = role;
      await this.persist();
      return existing;
    }
    const user = {
      id: this.data.adminUsers.length + 1,
      username,
      password_hash: passwordHash,
      role,
      created_at: new Date().toISOString(),
      last_login_at: null
    };
    this.data.adminUsers.push(user);
    await this.persist();
    return user;
  }

  async updateAdminLastLogin(username) {
    const user = await this.findAdminByUsername(username);
    if (user) {
      user.last_login_at = new Date().toISOString();
      await this.persist();
    }
  }
}

class PostgresDatabase {
  constructor(pool) {
    this.pool = pool;
  }

  async init() {
    await this.runMigrations();
  }

  async runMigrations() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Inquiries table
      await client.query(`
        CREATE TABLE IF NOT EXISTS inquiries (
          id SERIAL PRIMARY KEY,
          reference_id VARCHAR(64) UNIQUE NOT NULL,
          full_name VARCHAR(128) NOT NULL,
          email VARCHAR(256) NOT NULL,
          phone VARCHAR(64),
          company VARCHAR(160),
          industry VARCHAR(120),
          site_size VARCHAR(120),
          inquiry_category VARCHAR(128) NOT NULL,
          message TEXT NOT NULL,
          consent_given BOOLEAN DEFAULT TRUE,
          consent_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          status VARCHAR(64) DEFAULT 'New',
          assigned_to VARCHAR(128),
          admin_notes TEXT DEFAULT '',
          idempotency_key VARCHAR(128) UNIQUE,
          notification_status VARCHAR(64) DEFAULT 'pending',
          notification_attempts INT DEFAULT 0,
          last_notification_error TEXT
        );
      `);

      // Indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_inquiries_ref ON inquiries(reference_id);
        CREATE INDEX IF NOT EXISTS idx_inquiries_email ON inquiries(email);
        CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
        CREATE INDEX IF NOT EXISTS idx_inquiries_category ON inquiries(inquiry_category);
        CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries(created_at DESC);
      `);

      // 2. Status History Audit Trail table
      await client.query(`
        CREATE TABLE IF NOT EXISTS inquiry_status_history (
          id SERIAL PRIMARY KEY,
          inquiry_id INT REFERENCES inquiries(id) ON DELETE CASCADE,
          previous_status VARCHAR(64),
          new_status VARCHAR(64) NOT NULL,
          changed_by VARCHAR(128) NOT NULL,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 3. Admin Users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(128) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role VARCHAR(64) DEFAULT 'admin',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          last_login_at TIMESTAMPTZ
        );
      `);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async createInquiry(record) {
    const query = `
      INSERT INTO inquiries (
        reference_id, full_name, email, phone, company, industry, site_size,
        inquiry_category, message, consent_given, consent_timestamp,
        created_at, updated_at, status, assigned_to, admin_notes,
        idempotency_key, notification_status, notification_attempts, last_notification_error
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *;
    `;
    const now = new Date().toISOString();
    const values = [
      record.reference_id,
      record.full_name,
      record.email,
      record.phone || '',
      record.company || '',
      record.industry || '',
      record.site_size || '',
      record.inquiry_category,
      record.message,
      Boolean(record.consent_given),
      record.consent_timestamp || now,
      record.created_at || now,
      record.updated_at || now,
      record.status || 'New',
      record.assigned_to || null,
      record.admin_notes || '',
      record.idempotency_key || null,
      record.notification_status || 'pending',
      record.notification_attempts || 0,
      record.last_notification_error || null
    ];

    const res = await this.pool.query(query, values);
    return res.rows[0];
  }

  async getInquiries({ search = '', status = '', category = '', page = 1, limit = 25, sortOrder = 'desc' } = {}) {
    const conditions = [];
    const values = [];

    if (status && status !== 'all') {
      values.push(status);
      conditions.push(`LOWER(status) = LOWER($${values.length})`);
    }

    if (category && category !== 'all') {
      values.push(category);
      conditions.push(`LOWER(inquiry_category) = LOWER($${values.length})`);
    }

    if (search) {
      values.push(`%${search.toLowerCase()}%`);
      const p = `$${values.length}`;
      conditions.push(`(
        LOWER(reference_id) LIKE ${p} OR
        LOWER(full_name) LIKE ${p} OR
        LOWER(email) LIKE ${p} OR
        LOWER(company) LIKE ${p} OR
        LOWER(message) LIKE ${p}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = `ORDER BY created_at ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;

    const countRes = await this.pool.query(`SELECT COUNT(*) as total FROM inquiries ${whereClause}`, values);
    const total = parseInt(countRes.rows[0].total, 10);

    const offset = (page - 1) * limit;
    values.push(limit, offset);
    const dataQuery = `
      SELECT * FROM inquiries
      ${whereClause}
      ${orderClause}
      LIMIT $${values.length - 1} OFFSET $${values.length};
    `;

    const res = await this.pool.query(dataQuery, values);
    return {
      inquiries: res.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    };
  }

  async getInquiryById(idOrRef) {
    const isNum = !isNaN(Number(idOrRef));
    const query = isNum
      ? 'SELECT * FROM inquiries WHERE id = $1 OR reference_id = $2'
      : 'SELECT * FROM inquiries WHERE reference_id = $1';
    const values = isNum ? [Number(idOrRef), String(idOrRef)] : [String(idOrRef)];
    const res = await this.pool.query(query, values);
    return res.rows[0] || null;
  }

  async getInquiryByIdempotency(key) {
    if (!key) return null;
    const res = await this.pool.query('SELECT * FROM inquiries WHERE idempotency_key = $1', [key]);
    return res.rows[0] || null;
  }

  async getInquiryByHash(email, category, message) {
    const query = `
      SELECT * FROM inquiries 
      WHERE LOWER(email) = LOWER($1) 
        AND inquiry_category = $2 
        AND message = $3
      ORDER BY created_at DESC 
      LIMIT 1;
    `;
    const res = await this.pool.query(query, [email, category, message.trim()]);
    return res.rows[0] || null;
  }

  async updateInquiry(idOrRef, updates, changedBy = 'system') {
    const existing = await this.getInquiryById(idOrRef);
    if (!existing) return null;

    const setClauses = [];
    const values = [existing.id];

    Object.entries(updates).forEach(([key, val]) => {
      values.push(val);
      setClauses.push(`${key} = $${values.length}`);
    });

    values.push(new Date().toISOString());
    setClauses.push(`updated_at = $${values.length}`);

    const query = `
      UPDATE inquiries 
      SET ${setClauses.join(', ')} 
      WHERE id = $1 
      RETURNING *;
    `;

    const res = await this.pool.query(query, values);
    const updated = res.rows[0];

    if (updates.status && updates.status !== existing.status) {
      await this.pool.query(`
        INSERT INTO inquiry_status_history (inquiry_id, previous_status, new_status, changed_by, notes)
        VALUES ($1, $2, $3, $4, $5);
      `, [
        existing.id,
        existing.status,
        updates.status,
        changedBy,
        updates.admin_notes || `Status changed from ${existing.status} to ${updates.status}`
      ]);
    }

    return updated;
  }

  async getStatusHistory(inquiryId) {
    const res = await this.pool.query(
      'SELECT * FROM inquiry_status_history WHERE inquiry_id = $1 ORDER BY created_at DESC',
      [inquiryId]
    );
    return res.rows;
  }

  async getMetrics() {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE LOWER(status) = 'new') as new,
        COUNT(*) FILTER (WHERE LOWER(status) = 'contacted') as contacted,
        COUNT(*) FILTER (WHERE LOWER(status) = 'qualified') as qualified,
        COUNT(*) FILTER (WHERE LOWER(status) = 'proposal sent') as "proposalSent",
        COUNT(*) FILTER (WHERE LOWER(status) = 'negotiation') as negotiation,
        COUNT(*) FILTER (WHERE LOWER(status) = 'won') as won,
        COUNT(*) FILTER (WHERE LOWER(status) = 'lost') as lost,
        COUNT(*) FILTER (WHERE LOWER(status) = 'archived') as archived
      FROM inquiries;
    `;
    const res = await this.pool.query(query);
    const row = res.rows[0];
    const total = parseInt(row.total, 10) || 0;
    const won = parseInt(row.won, 10) || 0;
    const conversionRate = total > 0 ? ((won / total) * 100).toFixed(1) : '0.0';

    return {
      total,
      new: parseInt(row.new, 10) || 0,
      contacted: parseInt(row.contacted, 10) || 0,
      qualified: parseInt(row.qualified, 10) || 0,
      proposalSent: parseInt(row.proposalSent, 10) || 0,
      negotiation: parseInt(row.negotiation, 10) || 0,
      won,
      lost: parseInt(row.lost, 10) || 0,
      archived: parseInt(row.archived, 10) || 0,
      conversionRate
    };
  }

  async findAdminByUsername(username) {
    const res = await this.pool.query(
      'SELECT * FROM admin_users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    return res.rows[0] || null;
  }

  async createAdminUser(username, passwordHash, role = 'admin') {
    const query = `
      INSERT INTO admin_users (username, password_hash, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (username) DO UPDATE 
        SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
      RETURNING *;
    `;
    const res = await this.pool.query(query, [username, passwordHash, role]);
    return res.rows[0];
  }

  async updateAdminLastLogin(username) {
    await this.pool.query(
      'UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE LOWER(username) = LOWER($1)',
      [username]
    );
  }
}

/**
 * Initialize Database Connection
 */
export async function createDatabase({ dataDir, connectionString } = {}) {
  const dbUrl = connectionString || process.env.DATABASE_URL;

  if (dbUrl && dbUrl.startsWith('postgres')) {
    try {
      const { default: pg } = await import('pg');
      const sslConfig = process.env.DATABASE_SSL === 'false' 
        ? false 
        : { rejectUnauthorized: false };

      const pool = new pg.Pool({
        connectionString: dbUrl,
        ssl: sslConfig,
        max: parseInt(process.env.DB_POOL_MAX || '10', 10),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });

      // Test connection
      const client = await pool.connect();
      client.release();

      const pgDb = new PostgresDatabase(pool);
      await pgDb.init();
      return {
        type: 'postgres',
        db: pgDb,
        close: () => pool.end()
      };
    } catch (err) {
      console.warn(`[db] PostgreSQL connection to ${dbUrl.replace(/:[^:@]+@/, ':****@')} failed: ${err.message}. Falling back to durable local store.`);
    }
  }

  // Local fallback with serverless read-only protection
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const resolvedDataDir = dataDir || (isServerless ? path.join(os.tmpdir(), 'warhawk-data') : path.join(__dirname, 'data'));
  const storePath = path.join(resolvedDataDir, 'warhawk-db.json');
  const localDb = new LocalDatabase(storePath);
  await localDb.init();
  return {
    type: 'local',
    db: localDb,
    close: async () => {}
  };
}
