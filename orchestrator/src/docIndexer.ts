import { promises as fs } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import chokidar from "chokidar";
import { DocRecord } from "./types.js";

export class DocIndexer {
  private static readonly INDEXABLE_EXTENSIONS = new Set([
    ".md",
    ".mdx",
    ".txt",
    ".ipynb",
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
  ]);
  private static readonly ASSET_MANIFEST_DIRECTORY_NAMES = new Set([
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
  private static readonly BINARY_ASSET_EXTENSIONS = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".webp",
    ".bmp",
    ".ico",
    ".mp3",
    ".wav",
    ".ogg",
    ".m4a",
    ".flac",
    ".mp4",
    ".mov",
    ".webm",
    ".avi",
    ".mkv",
    ".pdf",
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".xls",
    ".xlsx",
    ".zip",
    ".tar",
    ".gz",
    ".parquet",
    ".feather",
    ".avro",
    ".rdb",
  ]);
  private docsPath: string;
  private index: Map<string, DocRecord> = new Map();

  constructor(docsPath: string) {
    this.docsPath = docsPath;
  }

  async buildInitialIndex() {
    this.index.clear();
    await this.walk(this.docsPath, true);
  }

  private async walk(dir: string, includeContent: boolean) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (this.shouldIgnoreDirectoryName(entry.name)) {
          continue;
        }
        if (this.isAssetManifestDirectoryName(entry.name)) {
          await this.addAssetManifest(fullPath, includeContent);
        }
        await this.walk(fullPath, includeContent);
      } else if (this.shouldIndexFile(fullPath)) {
        await this.addFile(fullPath, includeContent);
      }
    }
  }

  private isIgnoredDirectoryName(name: string) {
    const normalized = name.toLowerCase();
    return normalized.startsWith(".") || DocIndexer.IGNORED_DIRECTORY_NAMES.has(normalized);
  }

  private isAssetManifestDirectoryName(name: string) {
    const normalized = name.toLowerCase();
    return (
      normalized === "results" ||
      normalized.startsWith("results_") ||
      DocIndexer.ASSET_MANIFEST_DIRECTORY_NAMES.has(normalized)
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
      content: includeContent ? await this.readKnowledgeContent(path) : "",
      lastModified: stat.mtimeMs,
    });
  }

  private async addAssetManifest(dirPath: string, includeContent = true) {
    const manifestPath = `${dirPath}#asset-manifest`;
    const stats = await fs.stat(dirPath);
    this.index.set(manifestPath, {
      path: manifestPath,
      content: includeContent ? await this.buildAssetManifest(dirPath) : "",
      lastModified: stats.mtimeMs,
    });
  }

  private async readKnowledgeContent(path: string) {
    const raw = await fs.readFile(path, "utf-8");
    if (extname(path).toLowerCase() !== ".ipynb") {
      return raw;
    }

    try {
      const parsed = JSON.parse(raw) as {
        cells?: Array<{ cell_type?: string; source?: string[] | string; outputs?: unknown[] }>;
        metadata?: Record<string, unknown>;
        nbformat?: number;
        nbformat_minor?: number;
      };
      const cells = Array.isArray(parsed.cells) ? parsed.cells : [];
      const previews = cells
        .slice(0, 12)
        .map((cell, index) => {
          const source = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source ?? "");
          return `[cell ${index} | ${cell.cell_type ?? "unknown"}] ${source.replace(/\s+/g, " ").trim()}`;
        })
        .filter(Boolean)
        .join("\n");
      const metadataKeys = Object.keys(parsed.metadata ?? {}).join(", ");
      return [
        `Notebook ${basename(path)} (${parsed.nbformat ?? "?"}.${parsed.nbformat_minor ?? "?"})`,
        metadataKeys ? `metadata: ${metadataKeys}` : "",
        previews,
      ]
        .filter(Boolean)
        .join("\n");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Notebook ${basename(path)} could not be parsed cleanly: ${message}`;
    }
  }

  private async buildAssetManifest(dirPath: string) {
    const extensionCounts = new Map<string, number>();
    const sampleAssets: string[] = [];
    const textClues: string[] = [];
    let totalFiles = 0;
    let totalBytes = 0;

    const walk = async (currentDir: string, currentPrefix: string) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (this.shouldIgnoreDirectoryName(entry.name)) {
          continue;
        }

        const absolute = join(currentDir, entry.name);
        const nestedRelative = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(absolute, nestedRelative);
          continue;
        }

        const stats = await fs.stat(absolute);
        totalFiles += 1;
        totalBytes += stats.size;

        const extension = extname(entry.name).toLowerCase() || "(no extension)";
        extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1);

        if (this.shouldIndexFile(absolute)) {
          if (textClues.length < 10) {
            textClues.push(nestedRelative);
          }
          continue;
        }

        if (DocIndexer.BINARY_ASSET_EXTENSIONS.has(extension) && sampleAssets.length < 12) {
          sampleAssets.push(nestedRelative);
        }
      }
    };

    await walk(dirPath, "");

    const relativeDir = relative(this.docsPath, dirPath);
    const topExtensions = Array.from(extensionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([extension, count]) => `${extension}:${count}`);

    return [
      `Asset manifest for ${relativeDir}: ${totalFiles} files totaling ${totalBytes} bytes.`,
      topExtensions.length > 0 ? `Top extensions ${topExtensions.join(", ")}.` : "",
      sampleAssets.length > 0 ? `Sample assets: ${sampleAssets.join(", ")}.` : "",
      textClues.length > 0 ? `Embedded text/code clues: ${textClues.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  private findAssetManifestRoot(path: string) {
    const relativePath = relative(this.docsPath, path);
    if (!relativePath || relativePath.startsWith("..")) {
      return null;
    }

    const segments = relativePath.split(/[\\/]+/).filter(Boolean);
    if (segments.length === 0) {
      return null;
    }

    for (let index = 0; index < segments.length - 1; index += 1) {
      if (this.isAssetManifestDirectoryName(segments[index])) {
        return join(this.docsPath, ...segments.slice(0, index + 1));
      }
    }

    return null;
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
      const assetRoot = this.findAssetManifestRoot(path);
      if (assetRoot) {
        await this.addAssetManifest(assetRoot, true);
      }
      if (!this.shouldIndexFile(path)) return;
      await this.addFile(path, true);
      const rec = this.index.get(path);
      if (rec) onChange(rec);
    });

    watcher.on("change", async (path) => {
      const assetRoot = this.findAssetManifestRoot(path);
      if (assetRoot) {
        await this.addAssetManifest(assetRoot, true);
      }
      if (!this.shouldIndexFile(path)) return;
      await this.addFile(path, true);
      const rec = this.index.get(path);
      if (rec) onChange(rec);
    });

    watcher.on("unlink", async (path) => {
      this.index.delete(path);
      const assetRoot = this.findAssetManifestRoot(path);
      if (assetRoot) {
        await this.addAssetManifest(assetRoot, true);
        const rec = this.index.get(`${assetRoot}#asset-manifest`);
        if (rec) onChange(rec);
      }
    });

    return watcher;
  }
}
