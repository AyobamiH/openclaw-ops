import PQueue from "p-queue";
import { randomUUID } from "node:crypto";
import { Task } from "./types.js";

export class TaskQueue {
  private queue = new PQueue({ concurrency: 2 });
  private listeners: Array<(task: Task) => void> = [];

  enqueue(type: string, payload: Record<string, unknown>) {
    const task: Task = {
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

  onProcess(listener: (task: Task) => Promise<void> | void) {
    this.listeners.push(listener);
  }
}
