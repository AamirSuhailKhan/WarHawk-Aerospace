/**
 * WARHAWK AEROSPACE — ROOT SERVER ENTRYPOINT
 * 
 * Re-exports the unified request handler and application server.
 * Supports Vercel Node.js Serverless runtime, Docker, and local development.
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequestHandler, createAppServer } from './server/server.js';

export * from './server/server.js';
export { createAppServer, createRequestHandler };

const defaultHandler = createRequestHandler({
  rootDir: path.dirname(fileURLToPath(import.meta.url))
});

export default async function handler(req, res) {
  return defaultHandler(req, res);
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const port = Number(process.env.PORT || 5173);
  const host = process.env.HOST || '0.0.0.0';
  const server = createAppServer({
    rootDir: path.dirname(__filename)
  });

  server.listen(port, host, () => {
    console.log(`Warhawk Aerospace server running at http://${host}:${port}`);
  });

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
