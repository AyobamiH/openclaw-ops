import Fastify from "fastify";
import type { AppEnv } from "./config/env.js";
import { registerErrorHandling } from "./common/errors.js";
import { createLogger } from "./common/logger.js";
import { createDatabaseAdapter } from "./lib/database.js";
import { createLedgerStore } from "./lib/ledger-store.js";
import { createObjectStorageAdapter } from "./lib/object-storage.js";
import { createQueueAdapter } from "./lib/queue.js";
import { healthRoutes } from "./modules/health/routes.js";
import { documentRoutes } from "./modules/documents/routes.js";
import { claimRoutes } from "./modules/claims/routes.js";
import { entityRoutes } from "./modules/entities/routes.js";
import { eventRoutes } from "./modules/events/routes.js";
import { decisionChainRoutes } from "./modules/decision-chains/routes.js";
import { searchRoutes } from "./modules/search/routes.js";
import { reviewRoutes } from "./modules/review/routes.js";
import { relationshipRoutes } from "./modules/relationships/routes.js";
import { publicRoutes } from "./modules/public/routes.js";

export function buildApp(env: AppEnv) {
  const logger = createLogger(env);
  const app = Fastify({ loggerInstance: logger });
  const allowedOrigins = parseAllowedOrigins(env.PUBLIC_API_ALLOWED_ORIGINS);

  const database = createDatabaseAdapter(env);
  const ledger = createLedgerStore(env);
  const objectStorage = createObjectStorageAdapter(env);
  const queue = createQueueAdapter(env);

  app.decorate("runtimeContext", {
    env,
    database,
    ledger,
    objectStorage,
    queue,
    reviewRequiredForPublish: env.REVIEW_REQUIRED_FOR_PUBLISH
  });

  registerErrorHandling(app);

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/public/api/")) {
      return;
    }

    reply.header("Access-Control-Allow-Headers", "Content-Type");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

    const requestOrigin = request.headers.origin;
    const allowedOrigin = resolveAllowedOrigin(allowedOrigins, requestOrigin);

    if (allowedOrigin) {
      reply.header("Access-Control-Allow-Origin", allowedOrigin);
      if (allowedOrigin !== "*") {
        reply.header("Vary", "Origin");
      }
    }

    if (request.method === "OPTIONS") {
      if (requestOrigin && !allowedOrigin) {
        return reply.code(403).send({ message: "Origin not allowed" });
      }
      return reply.code(204).send();
    }
  });

  app.get("/", async () => ({
    service: "public-decision-intelligence",
    mode: "decision-intelligence",
    version: "0.1.0",
    docs: "See incubation/public-decision-intelligence/docs for the backend contract.",
    browse: env.PUBLIC_API_ENABLED ? "/browse" : null
  }));

  app.register(healthRoutes);

  app.register(async (api) => {
    api.register(documentRoutes);
    api.register(claimRoutes);
    api.register(entityRoutes);
    api.register(eventRoutes);
    api.register(relationshipRoutes);
    api.register(decisionChainRoutes);
    api.register(searchRoutes);
    api.register(reviewRoutes);
  }, { prefix: "/api/v1" });

  app.register(publicRoutes);

  return app;
}

function parseAllowedOrigins(value: string) {
  const origins = value
    .split(",")
    .map(normalizeOrigin)
    .filter((entry): entry is string => Boolean(entry));
  return origins.length > 0 ? origins : ["*"];
}

function resolveAllowedOrigin(allowedOrigins: string[], requestOrigin?: string) {
  if (allowedOrigins.includes("*")) {
    return "*";
  }
  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
  if (!normalizedRequestOrigin) {
    return null;
  }
  return allowedOrigins.includes(normalizedRequestOrigin) ? normalizedRequestOrigin : null;
}

function normalizeOrigin(value?: string) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed === "*") {
    return "*";
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}
