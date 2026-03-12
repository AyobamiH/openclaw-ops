import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AppEnv } from "../config/env.js";
import type { LedgerState } from "../types/domain.js";

const EMPTY_LEDGER: LedgerState = {
  documents: [],
  chunks: [],
  citations: [],
  ingests: []
};

export interface EvidenceLedgerStore {
  path: string;
  read(): Promise<LedgerState>;
  write(state: LedgerState): Promise<void>;
  update<T>(updater: (state: LedgerState) => T | Promise<T>): Promise<T>;
}

class FilesystemLedgerStore implements EvidenceLedgerStore {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  async read(): Promise<LedgerState> {
    try {
      const content = await readFile(this.path, "utf8");
      return {
        ...EMPTY_LEDGER,
        ...JSON.parse(content)
      } as LedgerState;
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        return structuredClone(EMPTY_LEDGER);
      }
      throw error;
    }
  }

  async write(state: LedgerState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  async update<T>(updater: (state: LedgerState) => T | Promise<T>): Promise<T> {
    const state = await this.read();
    const result = await updater(state);
    await this.write(state);
    return result;
  }
}

export function createLedgerStore(env: AppEnv): EvidenceLedgerStore {
  if (env.LEDGER_DRIVER !== "filesystem") {
    throw new Error(`Unsupported ledger driver for incubation runtime: ${env.LEDGER_DRIVER}`);
  }

  return new FilesystemLedgerStore(env.FILESYSTEM_LEDGER_PATH);
}
