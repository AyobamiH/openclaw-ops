import PQueue from "p-queue";
import { createHash, randomUUID } from "node:crypto";
import { validateTaskType, ALLOWED_TASK_TYPES } from "./taskHandlers.js";
export class TaskQueue {
    queue = new PQueue({ concurrency: 2 });
    listeners = [];
    deriveIdempotencyKey(type, payload) {
        const provided = payload.idempotencyKey;
        if (typeof provided === "string" && provided.trim().length > 0) {
            return provided.trim();
        }
        const serialized = JSON.stringify(payload);
        const digest = createHash("sha256").update(`${type}:${serialized}`).digest("hex");
        return `auto-${digest}`;
    }
    enqueue(type, payload) {
        // Enforce task type allowlist at queue entry point (deny-by-default)
        if (!validateTaskType(type)) {
            throw new Error(`Invalid task type: ${type}. Allowed types: ${ALLOWED_TASK_TYPES.join(', ')}`);
        }
        const attemptValue = Number(payload.__attempt ?? 1);
        const retryValue = Number(payload.maxRetries ?? 2);
        const task = {
            id: randomUUID(),
            type,
            payload,
            createdAt: Date.now(),
            idempotencyKey: this.deriveIdempotencyKey(type, payload),
            attempt: Number.isFinite(attemptValue) && attemptValue > 0 ? Math.floor(attemptValue) : 1,
            maxRetries: Number.isFinite(retryValue) && retryValue >= 0 ? Math.floor(retryValue) : 2,
        };
        this.queue.add(async () => {
            for (const listener of this.listeners) {
                await listener(task);
            }
        });
        return task;
    }
    onProcess(listener) {
        this.listeners.push(listener);
    }
    getPendingCount() {
        return this.queue.pending;
    }
    getQueuedCount() {
        return this.queue.size;
    }
}
