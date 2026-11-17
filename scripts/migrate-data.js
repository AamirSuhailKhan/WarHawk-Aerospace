/**
 * WARHAWK AEROSPACE — HISTORICAL INQUIRY MIGRATION UTILITY
 * 
 * Safely parses data/inquiries.jsonl, validates each record, 
 * and inserts it into the primary database without duplicates.
 */

import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function runMigration() {
  const jsonlPath = path.join(rootDir, 'data', 'inquiries.jsonl');
  if (!fs.existsSync(jsonlPath)) {
    console.log('[migrate-data] No data/inquiries.jsonl file found. Nothing to migrate.');
    return;
  }

  console.log(`[migrate-data] Reading records from ${jsonlPath}...`);
  const { db, close } = await createDatabase();

  const fileStream = fs.createReadStream(jsonlPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let totalLines = 0;
  let importedCount = 0;
  let skippedCount = 0;
  let invalidCount = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    totalLines++;

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      invalidCount++;
      console.warn(`[migrate-data] Line ${totalLines}: Malformed JSON, skipping.`);
      continue;
    }

    if (!parsed.workEmail && !parsed.email) {
      invalidCount++;
      console.warn(`[migrate-data] Line ${totalLines}: Missing email, skipping.`);
      continue;
    }

    const email = parsed.email || parsed.workEmail;
    const category = parsed.category || parsed.inquiry_category || 'General Inquiry';
    const message = parsed.message || '';

    // Check if duplicate already exists
    const existing = await db.getInquiryByHash(email, category, message);
    if (existing) {
      skippedCount++;
      continue;
    }

    await db.createInquiry({
      reference_id: parsed.inquiryId || parsed.reference_id || `WH-MIGRATED-${totalLines}`,
      full_name: parsed.fullName || parsed.full_name || 'Legacy Visitor',
      email,
      phone: parsed.phone || '',
      company: parsed.company || '',
      industry: parsed.industry || '',
      site_size: parsed.site_size || '',
      inquiry_category: category,
      message,
      consent_given: true,
      consent_timestamp: parsed.submittedAt || parsed.created_at || new Date().toISOString(),
      created_at: parsed.submittedAt || parsed.created_at || new Date().toISOString(),
      status: parsed.status === 'sent' || parsed.status === 'dev_queued' ? 'New' : (parsed.status || 'New'),
      notification_status: parsed.status === 'sent' ? 'sent' : 'dev_queued',
      notification_attempts: parsed.status === 'sent' ? 1 : 0
    });

    importedCount++;
  }

  console.log(`[migrate-data] Completed. Total: ${totalLines}, Imported: ${importedCount}, Skipped duplicates: ${skippedCount}, Invalid: ${invalidCount}`);
  await close();
}

runMigration().catch((err) => {
  console.error('[migrate-data] Migration failed:', err);
  process.exit(1);
});
