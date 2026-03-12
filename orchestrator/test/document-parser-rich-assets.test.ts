import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { executeDocumentParser } from "../../skills/documentParser.js";

const tempDirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("documentParser rich source support", () => {
  it("extracts notebook structure from ipynb files", async () => {
    const root = await mkdtemp(join(tmpdir(), "doc-parser-ipynb-"));
    tempDirs.push(root);
    const notebookPath = join(root, "example.ipynb");

    await writeFile(
      notebookPath,
      JSON.stringify({
        nbformat: 4,
        nbformat_minor: 5,
        metadata: { kernelspec: { name: "python3" } },
        cells: [
          { cell_type: "markdown", source: ["# Retrieval\n", "Ground answers with local docs."] },
          { cell_type: "code", source: ["print('tool calling')"], outputs: [{ output_type: "stream", text: "ok" }] },
        ],
      }),
      "utf-8",
    );

    const result = await executeDocumentParser({ filePath: notebookPath, format: "ipynb" });

    expect(result.success).toBe(true);
    expect(result.data?.kind).toBe("notebook");
    expect(result.data?.cellCount).toBe(2);
    expect(result.data?.markdownCellCount).toBe(1);
    expect(result.blocks[0]?.content).toContain("Retrieval");
  });

  it("extracts metadata from binary assets without reading them as text", async () => {
    const root = await mkdtemp(join(tmpdir(), "doc-parser-asset-"));
    tempDirs.push(root);
    const imagePath = join(root, "control-room.png");

    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const result = await executeDocumentParser({ filePath: imagePath, format: "image" });

    expect(result.success).toBe(true);
    expect(result.data?.kind).toBe("asset");
    expect(result.data?.format).toBe("image");
    expect(result.data?.basename).toBe("control-room.png");
    expect(result.blocks[0]?.content).toContain("image asset");
  });
});
