import { promises as fs } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import chokidar from "chokidar";
import { DocRecord } from "./types.js";

export class DocIndexer {
  private static readonly INDEXABLE_EXTENSIONS = new Set([
    ".md",
    ".mdx",
    ".txt",
    ".json",
    ".yaml",
    ".yml",
    ".py",
    ".js",
    ".cjs",
    ".mjs",
    ".ts",
    ".tsx",
    ".html",
    ".css",
    ".scss",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".sh",
    ".sql",
  ]);
  private static readonly INDEXABLE_BASENAMES = new Set([
    "license",
    "makefile",
    "dockerfile",
    "justfile",
    "procfile",
    ".funcignore",
    ".gitignore",
  ]);
  private static readonly IGNORED_DIRECTORY_NAMES = new Set([
    "__pycache__",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "data",
    "datasets",
    "images",
    "image",
    "input_images",
    "output_images",
    "outputs",
    "audio",
    "video",
  ]);
  private docsPath: string;
  private index: Map<string, DocRecord> = new Map();

  constructor(docsPath: string) {
    this.docsPath = docsPath;
  }

  async buildInitialIndex() {
    this.index.clear();
    await this.walk(this.docsPath, false);
  }

  private async walk(dir: string, includeContent: boolean) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (this.shouldIgnoreDirectoryName(entry.name)) {
          continue;
        }
        await this.walk(fullPath, includeContent);
      } else if (this.shouldIndexFile(fullPath)) {
        await this.addFile(fullPath, includeContent);
      }
    }
  }

  private isIgnoredDirectoryName(name: string) {
    const normalized = name.toLowerCase();
    return (
      normalized.startsWith(".") ||
      normalized === "results" ||
      normalized.startsWith("results_") ||
      DocIndexer.IGNORED_DIRECTORY_NAMES.has(normalized)
    );
  }

  private shouldIgnoreDirectoryName(name: string) {
    return this.isIgnoredDirectoryName(name);
  }

  private shouldIgnoreRelativePath(path: string) {
    const segments = path
      .split(/[\\/]+/)
      .filter(Boolean)
      .map((segment) => segment.toLowerCase());

    for (const segment of segments.slice(0, -1)) {
      if (this.isIgnoredDirectoryName(segment)) {
        return true;
      }
    }

    return false;
  }

  private shouldIndexFile(path: string) {
    const relativePath = relative(this.docsPath, path);
    if (this.shouldIgnoreRelativePath(relativePath)) {
      return false;
    }

    const ext = extname(path).toLowerCase();
    if (DocIndexer.INDEXABLE_EXTENSIONS.has(ext)) {
      return true;
    }

    const filename = basename(path).toLowerCase();
    return DocIndexer.INDEXABLE_BASENAMES.has(filename);
  }

  private async addFile(path: string, includeContent = true) {
    const stat = await fs.stat(path);
    this.index.set(path, {
      path,
      content: includeContent ? await fs.readFile(path, "utf-8") : "",
      lastModified: stat.mtimeMs,
    });
  }

  getIndex() {
    return this.index;
  }

  watch(onChange: (record: DocRecord) => void) {
    const watcher = chokidar.watch(this.docsPath, {
      ignored: (path) => {
        const relativePath = relative(this.docsPath, path);
        if (relativePath === "" || relativePath === ".") {
          return false;
        }

        return this.shouldIgnoreRelativePath(relativePath);
      },
      ignoreInitial: true,
      persistent: true,
    });

    watcher.on("add", async (path) => {
      if (!this.shouldIndexFile(path)) return;
      await this.addFile(path, true);
      const rec = this.index.get(path);
      if (rec) onChange(rec);
    });

    watcher.on("change", async (path) => {
      if (!this.shouldIndexFile(path)) return;
      await this.addFile(path, true);
      const rec = this.index.get(path);
      if (rec) onChange(rec);
    });

    return watcher;
  }
}
