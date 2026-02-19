import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Telemetry } from "../../shared/telemetry.js";

interface DriftRepairPayload {
  id: string;
  docPaths: string[];
  targetAgents: string[];
  requestedBy: string;
}

const telemetry = new Telemetry({ component: "doc-specialist" });

async function generateKnowledgePack(paths: string[], outputDir: string) {
  await telemetry.info("pack.start", { files: paths.length });
  await mkdir(outputDir, { recursive: true });
  const packPath = resolve(outputDir, `knowledge-pack-${Date.now()}.json`);
  await writeFile(
    packPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), files: paths }, null, 2),
    "utf-8",
  );
  await telemetry.info("pack.complete", { packPath });
  return packPath;
}

async function run() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    throw new Error("Usage: tsx src/index.ts <payload.json>");
  }

  const raw = await readFile(payloadPath, "utf-8");
  const task = JSON.parse(raw) as DriftRepairPayload;
  await telemetry.info("task.received", { id: task.id, files: task.docPaths.length });

  const pack = await generateKnowledgePack(task.docPaths, resolve(dirname(payloadPath), "../artifacts"));

  await telemetry.info("task.success", {
    id: task.id,
    pack,
    targets: task.targetAgents,
    requestedBy: task.requestedBy,
  });
}

run().catch(async (error) => {
  await telemetry.error("task.failed", { message: (error as Error).message });
  process.exit(1);
});
