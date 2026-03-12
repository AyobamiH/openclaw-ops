import type { AppEnv } from "../config/env.js";

export interface ObjectStorageAdapter {
  driver: "s3" | "filesystem";
  bucket: string;
  endpoint: string;
  region: string;
  baseDir: string;
}

export function createObjectStorageAdapter(env: AppEnv): ObjectStorageAdapter {
  return {
    driver: env.OBJECT_STORAGE_DRIVER,
    bucket: env.OBJECT_STORAGE_BUCKET,
    endpoint: env.OBJECT_STORAGE_ENDPOINT,
    region: env.OBJECT_STORAGE_REGION,
    baseDir: env.OBJECT_STORAGE_BASE_DIR
  };
}
