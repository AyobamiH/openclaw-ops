import { promises as fs } from "node:fs";
import { join } from "node:path";
import chokidar from "chokidar";
export class DocIndexer {
    docsPath;
    index = new Map();
    constructor(docsPath) {
        this.docsPath = docsPath;
    }
    async buildInitialIndex() {
        this.index.clear();
        await this.walk(this.docsPath);
    }
    async walk(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await this.walk(fullPath);
            }
            else {
                await this.addFile(fullPath);
            }
        }
    }
    async addFile(path) {
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
    watch(onChange) {
        const watcher = chokidar.watch(this.docsPath, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
        });
        watcher.on("add", async (path) => {
            await this.addFile(path);
            const rec = this.index.get(path);
            if (rec)
                onChange(rec);
        });
        watcher.on("change", async (path) => {
            await this.addFile(path);
            const rec = this.index.get(path);
            if (rec)
                onChange(rec);
        });
        return watcher;
    }
}
