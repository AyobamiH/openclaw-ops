import { promises as fs } from "node:fs";
import { join } from "node:path";
import chokidar from "chokidar";
import { DocRecord } from "./types.js";

export class DocIndexer {
  private docsPath: string;
  private index: Map<string, DocRecord> = new Map();

  constructor(docsPath: string) {
    this.docsPath = docsPath;
  }

  async buildInitialIndex() {
    this.index.clear();
    await this.walk(this.docsPath);
  }

  private async walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(fullPath);
      } else {
        await this.addFile(fullPath);
      }
    }
  }

  private async addFile(path: string) {
    const stat = await fs.stat(path);
    const content = await fs.readFile(path, "utf-8");
    this.index.set(path, {
      path,
      content,
      lastModified: stat.mtimeMs,
    });
  }

  getIndex() {
    return this.index;
  }

  watch(onChange: (record: DocRecord) => void) {
    const watcher = chokidar.watch(this.docsPath, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
    });

    watcher.on("add", async (path) => {
      await this.addFile(path);
      const rec = this.index.get(path);
      if (rec) onChange(rec);
    });

    watcher.on("change", async (path) => {
      await this.addFile(path);
      const rec = this.index.get(path);
      if (rec) onChange(rec);
    });

    return watcher;
  }
}
