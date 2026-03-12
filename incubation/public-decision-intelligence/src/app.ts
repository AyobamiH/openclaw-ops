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

export function buildApp(env: AppEnv) {
  const logger = createLogger(env);
  const app = Fastify({ loggerInstance: logger });

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

  app.get("/", async () => ({
    service: "public-decision-intelligence",
    mode: "scaffold",
    version: "0.1.0",
    docs: "See incubation/public-decision-intelligence/docs for the backend contract."
  }));

  app.register(healthRoutes);

  app.register(async (api) => {
    api.register(documentRoutes);
    api.register(claimRoutes);
    api.register(entityRoutes);
    api.register(eventRoutes);
    api.register(decisionChainRoutes);
    api.register(searchRoutes);
    api.register(reviewRoutes);
  }, { prefix: "/api/v1" });

  return app;
}
