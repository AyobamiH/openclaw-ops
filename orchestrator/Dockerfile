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
COPY package.json ./

# Install production dependencies only
RUN npm install --only=production && \
    npm cache clean --force

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package.json ./

# Install all dependencies (dev + prod for building)
RUN npm install

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Stage 3: Production Image
FROM node:20-alpine

LABEL maintainer="Orchestrator Team"
LABEL version="1.0.0"
LABEL description="12-Agent Orchestrator System - Production"

WORKDIR /app

# Install curl, dumb-init, and git for health checks, signal handling, and feed push
RUN apk add --no-cache curl dumb-init git

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S orchestrator -u 1001

# Copy production dependencies from dependencies stage
COPY --from=dependencies --chown=orchestrator:nodejs /app/node_modules ./node_modules

# Copy package files
COPY --chown=orchestrator:nodejs package.json ./
COPY --chown=orchestrator:nodejs package-lock.json* ./

# Copy built application from builder stage
COPY --from=builder --chown=orchestrator:nodejs /app/dist ./dist

# Copy .env.example for reference
COPY --chown=orchestrator:nodejs .env.example ./.env.example

# Copy config
COPY --chown=orchestrator:nodejs orchestrator_config.json ./

# Create required directories
RUN mkdir -p /app/logs /app/data /app/tmp /app/docs && \
    chown -R orchestrator:nodejs /app/logs /app/data /app/tmp /app/docs

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
ENV ORCHESTRATOR_CONFIG=/app/orchestrator_config.json

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js"]
