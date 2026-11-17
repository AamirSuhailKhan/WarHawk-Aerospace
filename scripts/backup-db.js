/**
 * WARHAWK AEROSPACE — DATABASE BACKUP & RESTORATION UTILITY
 * 
 * Supports automated backups for both PostgreSQL and Local JSON store.
 * Retains daily snapshots in backups/ directory with timestamping and SHA-256 verification.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function runBackup() {
  const backupDir = path.join(rootDir, 'backups');
  if (!fs.existsSync(backupDir)) {
    await fsp.mkdir(backupDir, { recursive: true });
  }

  const { type, db, close } = await createDatabase();
  console.log(`[backup] Initiating backup for database type: ${type}...`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `warhawk-backup-${timestamp}.json`);

  // Fetch all data cleanly through database abstraction
  const { inquiries } = await db.getInquiries({ page: 1, limit: 1000000 });
  const metrics = await db.getMetrics();

  const backupPayload = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    databaseType: type,
    metrics,
    totalRecords: inquiries.length,
    inquiries
  };

  const rawJson = JSON.stringify(backupPayload, null, 2);
  const hash = crypto.createHash('sha256').update(rawJson).digest('hex');

  await fsp.writeFile(backupFile, rawJson, 'utf8');

  // Write checksum file
  await fsp.writeFile(`${backupFile}.sha256`, `${hash}  ${path.basename(backupFile)}\n`, 'utf8');

  console.log(`[backup] Backup completed successfully.`);
  console.log(`[backup] Destination: ${backupFile}`);
  console.log(`[backup] Total inquiries backed up: ${inquiries.length}`);
  console.log(`[backup] SHA-256 Checksum: ${hash}`);

  await close();
}

runBackup().catch((err) => {
  console.error('[backup] Backup failed:', err);
  process.exit(1);
});
