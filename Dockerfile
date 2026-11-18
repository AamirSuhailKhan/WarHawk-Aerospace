# WARHAWK AEROSPACE — PRODUCTION DOCKERFILE
# Multi-stage lightweight secure Node.js production image

FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5173
ENV HOST=0.0.0.0

# Copy package manifests
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application files
COPY . .

# Run build verification
RUN node scripts/build.js

# Ensure permissions for persistent data directory
RUN mkdir -p /app/data /app/backups && chown -R node:node /app

# Switch to non-root user for security
USER node

# Expose dynamic application port
EXPOSE 5173

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 5173) + '/api/health/liveness').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Boot server
CMD ["node", "server/server.js"]
