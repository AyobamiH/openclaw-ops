import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApiSpec } from '../src/openapi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function run() {
  const targetPath = resolve(__dirname, '../openapi.json');
  const spec = buildOpenApiSpec(process.env.PORT ?? 3000);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf-8');
  console.log(`[openapi] generated ${targetPath}`);
}

run().catch((error) => {
  console.error('[openapi] generation failed', error);
  process.exit(1);
});
