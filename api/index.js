/**
 * WARHAWK AEROSPACE — VERCEL SERVERLESS FUNCTION HANDLER
 * 
 * Adapts the enterprise request handler for Vercel Serverless Functions.
 * Caches database connection pools across warm invocations.
 */

import { createRequestHandler } from '../server/server.js';

const handler = createRequestHandler();

export default async function vercelHandler(req, res) {
  return handler(req, res);
}
