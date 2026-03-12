import "fastify";
import type { AppEnv } from "../config/env.js";
import type { DatabaseAdapter } from "../lib/database.js";
import type { ObjectStorageAdapter } from "../lib/object-storage.js";
import type { QueueAdapter } from "../lib/queue.js";
import type { EvidenceLedgerStore } from "../lib/ledger-store.js";

declare module "fastify" {
  interface FastifyInstance {
    runtimeContext: {
      env: AppEnv;
      database: DatabaseAdapter;
      objectStorage: ObjectStorageAdapter;
      queue: QueueAdapter;
      ledger: EvidenceLedgerStore;
      reviewRequiredForPublish: boolean;
    };
  }
}
