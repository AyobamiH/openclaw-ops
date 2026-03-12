FROM node:24-alpine AS builder

WORKDIR /workspace/orchestrator

COPY orchestrator/package.json orchestrator/package-lock.json ./
RUN npm ci

COPY orchestrator ./
RUN npm run build

FROM node:24-alpine

WORKDIR /workspace/orchestrator

RUN apk add --no-cache curl dumb-init

COPY --from=builder /workspace/orchestrator /workspace/orchestrator
COPY agents /workspace/agents
COPY skills /workspace/skills
COPY openclaw-docs /workspace/openclaw-docs
COPY openai-cookbook /workspace/openai-cookbook
COPY RUNTIME_ENGAGEMENT_OS.md /workspace/RUNTIME_ENGAGEMENT_OS.md
COPY rss_filter_config.json /workspace/rss_filter_config.json

RUN mkdir -p /workspace/logs /workspace/orchestrator/data /workspace/agents-deployed

ENV NODE_ENV=production
ENV ORCHESTRATOR_CONFIG=/workspace/orchestrator/orchestrator_config.json
ENV PORT=3000
ENV PROMETHEUS_PORT=9100

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost:3000/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
