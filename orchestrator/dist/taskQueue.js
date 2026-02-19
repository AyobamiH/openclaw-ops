import PQueue from "p-queue";
import { randomUUID } from "node:crypto";
export class TaskQueue {
    queue = new PQueue({ concurrency: 2 });
    listeners = [];
    enqueue(type, payload) {
        const task = {
            id: randomUUID(),
            type,
            payload,
            createdAt: Date.now(),
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
}
