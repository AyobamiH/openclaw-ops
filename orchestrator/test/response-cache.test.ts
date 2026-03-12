import { afterEach, describe, expect, it } from "vitest";
import {
  getCachedJson,
  invalidateResponseCacheTags,
  resetResponseCacheForTests,
} from "../src/cache/response-cache.js";

const originalRedisUrl = process.env.REDIS_URL;

afterEach(async () => {
  if (typeof originalRedisUrl === "undefined") {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = originalRedisUrl;
  }
  await resetResponseCacheForTests();
});

describe("response-cache", () => {
  it("reuses cached values for repeated reads", async () => {
    delete process.env.REDIS_URL;
    let computeCalls = 0;

    const first = await getCachedJson({
      namespace: "test.repeated-read",
      keyData: { route: "/api/dashboard/overview" },
      tags: ["runtime-state"],
      ttlSeconds: 60,
      compute: async () => {
        computeCalls += 1;
        return { value: "cached", computeCalls };
      },
    });

    const second = await getCachedJson({
      namespace: "test.repeated-read",
      keyData: { route: "/api/dashboard/overview" },
      tags: ["runtime-state"],
      ttlSeconds: 60,
      compute: async () => {
        computeCalls += 1;
        return { value: "cached", computeCalls };
      },
    });

    expect(first.meta.status).toBe("miss");
    expect(second.meta.status).toBe("hit");
    expect(first.meta.store).toBe("memory");
    expect(second.meta.store).toBe("memory");
    expect(computeCalls).toBe(1);
    expect(second.value).toEqual(first.value);
  });

  it("invalidates cached values when a tag version changes", async () => {
    delete process.env.REDIS_URL;
    let computeCalls = 0;

    await getCachedJson({
      namespace: "test.invalidate",
      keyData: { route: "/api/tasks/runs" },
      tags: ["runtime-state"],
      ttlSeconds: 60,
      compute: async () => {
        computeCalls += 1;
        return { value: "before-invalidation", computeCalls };
      },
    });

    await invalidateResponseCacheTags(["runtime-state"]);

    const next = await getCachedJson({
      namespace: "test.invalidate",
      keyData: { route: "/api/tasks/runs" },
      tags: ["runtime-state"],
      ttlSeconds: 60,
      compute: async () => {
        computeCalls += 1;
        return { value: "after-invalidation", computeCalls };
      },
    });

    expect(next.meta.status).toBe("miss");
    expect(computeCalls).toBe(2);
    expect(next.value).toEqual({
      value: "after-invalidation",
      computeCalls: 2,
    });
  });
});
