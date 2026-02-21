# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Copy orchestrator
COPY orchestrator ./orchestrator

# Install dependencies
RUN npm install && \
    cd orchestrator && \
    npm install && \
    npm run build

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy compiled code from builder
COPY --from=builder /app/orchestrator/dist ./dist
COPY --from=builder /app/orchestrator/package.json ./package.json
COPY --from=builder /app/orchestrator/node_modules ./node_modules

# Copy configuration (will be mounted or injected)
COPY orchestrator_config.json orchestrator_state.json* ./

# Create logs directory
RUN mkdir -p logs/knowledge-packs logs/digests

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "try { require('fs').statSync('orchestrator_state.json'); } catch(e) { process.exit(1); }"

# Use dumb-init to handle signals properly
ENTRYPOINT ["/sbin/dumb-init", "--"]

# Start orchestrator
CMD ["node", "dist/index.js"]
