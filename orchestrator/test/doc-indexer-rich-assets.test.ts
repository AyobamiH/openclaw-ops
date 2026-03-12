import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { DocIndexer } from "../src/docIndexer.js";

const tempDirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("DocIndexer rich source indexing", () => {
  it("indexes notebook text and asset manifests", async () => {
    const root = await mkdtemp(join(tmpdir(), "doc-indexer-rich-"));
    tempDirs.push(root);

    await mkdir(join(root, "images"), { recursive: true });
    await writeFile(
      join(root, "techniques.ipynb"),
      JSON.stringify({
        nbformat: 4,
        nbformat_minor: 5,
        metadata: { accelerator: "gpu" },
        cells: [{ cell_type: "markdown", source: ["# Tool Calling\n", "Use structured outputs."] }],
      }),
      "utf-8",
    );
    await writeFile(join(root, "images", "README.md"), "# Assets\nScreenshots for agent tuning.\n", "utf-8");
    await writeFile(join(root, "images", "panel.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const indexer = new DocIndexer(root);
    await indexer.buildInitialIndex();
    const index = indexer.getIndex();

    const notebookRecord = index.get(join(root, "techniques.ipynb"));
    const manifestRecord = index.get(join(root, "images#asset-manifest"));

    expect(notebookRecord?.content).toContain("Notebook techniques.ipynb");
    expect(notebookRecord?.content).toContain("Tool Calling");
    expect(manifestRecord?.content).toContain("Asset manifest for images");
    expect(manifestRecord?.content).toContain("panel.png");
    expect(manifestRecord?.content).toContain("README.md");
  });
});
