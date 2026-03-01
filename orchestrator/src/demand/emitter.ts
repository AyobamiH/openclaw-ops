import { createHmac, randomBytes } from "node:crypto";
import type {
  DemandSummaryDeliveryRecord,
  OrchestratorConfig,
  OrchestratorState,
} from "../types.js";
import { buildDemandSummarySnapshot } from "./summary-builder.js";

const MAX_DELIVERY_ATTEMPTS = 3;

function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as object).sort()) {
      sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

function signEnvelope(payload: unknown, secret: string): string {
  return createHmac("sha256", secret)
    .update(JSON.stringify(sortObjectKeys(payload)))
    .digest("hex");
}

export class DemandSummaryEmitter {
  constructor(
    private config: OrchestratorConfig,
    private getState: () => OrchestratorState,
    private persistState: () => Promise<void>,
  ) {}

  async emit(): Promise<void> {
    const now = new Date().toISOString();
    const snapshot = buildDemandSummarySnapshot(this.getState(), now);
    const idempotencyKey = randomBytes(16).toString("hex");

    if (
      this.config.demandSummaryIngestUrl &&
      !process.env.MILESTONE_SIGNING_SECRET
    ) {
      console.warn(
        "[demand-summary]",
        "demandSummaryIngestUrl is set but MILESTONE_SIGNING_SECRET env var is missing — deliveries will not be sent.",
      );
    }

    const record: DemandSummaryDeliveryRecord = {
      idempotencyKey,
      summaryId: snapshot.summaryId,
      sentAtUtc: now,
      snapshot,
      status: "pending",
      attempts: 0,
    };

    this.getState().demandSummaryDeliveries.push(record);
    await this.persistState();

    this.deliverPending().catch((err) => {
      console.warn(
        "[demand-summary] background delivery failed:",
        (err as Error).message,
      );
    });
  }

  async deliverPending(): Promise<void> {
    const ingestUrl = this.config.demandSummaryIngestUrl;
    if (!ingestUrl) return;

    const secret = process.env.MILESTONE_SIGNING_SECRET;
    if (!secret) return;

    const state = this.getState();
    const pending = state.demandSummaryDeliveries.filter(
      (record) => record.status === "pending" || record.status === "retrying",
    );
    if (pending.length === 0) return;

    let changed = false;

    for (const record of pending) {
      const envelope = {
        idempotencyKey: record.idempotencyKey,
        sentAtUtc: record.sentAtUtc,
        snapshot: record.snapshot,
      };
      const timestamp = new Date().toISOString();
      const signature = signEnvelope(envelope, secret);

      try {
        const response = await fetch(ingestUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-openclaw-signature": signature,
            "x-openclaw-timestamp": timestamp,
          },
          body: JSON.stringify(envelope),
          signal: AbortSignal.timeout(10_000),
        });

        record.lastAttemptAt = timestamp;
        record.attempts += 1;

        if (response.ok) {
          const body = (await response.json()) as { status?: string };
          record.status =
            body.status === "duplicate" ? "duplicate" : "delivered";
          state.lastDemandSummaryDeliveryAt = timestamp;
          changed = true;
        } else if (response.status >= 400 && response.status < 500) {
          const body = await response.text().catch(() => "");
          record.status = "rejected";
          record.lastError = `HTTP ${response.status}: ${body.slice(0, 200)}`;
          changed = true;
        } else {
          record.lastError = `HTTP ${response.status}`;
          record.status =
            record.attempts >= MAX_DELIVERY_ATTEMPTS
              ? "dead-letter"
              : "retrying";
          changed = true;
        }
      } catch (error) {
        record.lastAttemptAt = timestamp;
        record.attempts += 1;
        record.lastError = (error as Error).message;
        record.status =
          record.attempts >= MAX_DELIVERY_ATTEMPTS ? "dead-letter" : "retrying";
        changed = true;
      }
    }

    if (changed) {
      await this.persistState();
    }
  }
}

let _emitter: DemandSummaryEmitter | null = null;

export function initDemandSummaryEmitter(
  config: OrchestratorConfig,
  getState: () => OrchestratorState,
  persistState: () => Promise<void>,
): DemandSummaryEmitter {
  _emitter = new DemandSummaryEmitter(config, getState, persistState);
  return _emitter;
}

export function getDemandSummaryEmitter(): DemandSummaryEmitter | null {
  return _emitter;
}
