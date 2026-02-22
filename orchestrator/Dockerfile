# Dockerfile for 12-Agent Orchestrator System
# Monolithic image: All agents + orchestrator + infrastructure in one container
#
# Build: docker build -t wagging-orchestrator:latest .
# Run: docker run -p 3000:3000 wagging-orchestrator:latest

# Multi-stage build for optimization

# Stage 1: Dependencies
FROM node:20-alpine AS dependencies
WORKDIR /app

# Copy package files
COPY orchestrator/package*.json ./
COPY orchestrator/package-lock.json* ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY orchestrator/package*.json ./
COPY orchestrator/package-lock.json* ./

# Install all dependencies (dev + prod for building)
RUN npm ci

# Copy source code
COPY orchestrator/src ./src
COPY orchestrator/tsconfig.json ./
COPY orchestrator/tsconfig.app.json ./

# Build TypeScript
RUN npm run build

# Build tests (for validation layer)
COPY orchestrator/test ./test
RUN npm run test:build 2>/dev/null || true

# Stage 3: Production Image
FROM node:20-alpine

LABEL maintainer="Orchestrator Team"
LABEL version="1.0.0"
LABEL description="12-Agent Orchestrator System - Production"

WORKDIR /app

# Install dumb-init (PID 1 process manager)
RUN apk add --no-cache dumb-init curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S orchestrator -u 1001

# Copy production dependencies from dependencies stage
COPY --from=dependencies --chown=orchestrator:nodejs /app/node_modules ./node_modules

# Copy package files
COPY --chown=orchestrator:nodejs orchestrator/package*.json ./

# Copy built application from builder stage
COPY --from=builder --chown=orchestrator:nodejs /app/dist ./dist

# Copy configuration files
COPY --chown=orchestrator:nodejs orchestrator/src/config ./config
COPY --chown=orchestrator:nodejs orchestrator/.env.example ./.env.example

# Create required directories
RUN mkdir -p /app/logs /app/data /app/tmp && \
    chown -R orchestrator:nodejs /app/logs /app/data /app/tmp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Security: Drop unnecessary capabilities
RUN setcap -r /usr/sbin/setcap 2>/dev/null || true

# Switch to non-root user
USER orchestrator

# Environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV PORT=3000
ENV LOG_LEVEL=info

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]

# Start application
CMD ["node", "dist/orchestrator/src/index.js"]
