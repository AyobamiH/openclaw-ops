import { describe, expect, it } from "vitest";

import { handleTask } from "../../agents/normalization-agent/src/index.js";

describe("normalization-agent rich structure support", () => {
  it("canonicalizes records when schema is omitted", async () => {
    const result = await handleTask({
      id: "normalize-1",
      type: "normalize-data",
      input: {
        kind: "asset",
        basename: " control-room.png ",
        tags: [" example ", " reference "],
        nested: {
          title: " notebook clue ",
        },
      },
      schema: {},
    });

    expect(result.success).toBe(true);
    expect(result.normalized[0]).toEqual({
      kind: "asset",
      basename: "control-room.png",
      tags: ["example", "reference"],
      nested: {
        title: "notebook clue",
      },
    });
  });

  it("supports nested object and array schema definitions", async () => {
    const result = await handleTask({
      id: "normalize-2",
      type: "normalize-data",
      input: {
        metadata: {
          owner: " doc-specialist ",
          count: "12",
        },
        samples: [" one ", " two "],
      },
      schema: {
        metadata: {
          type: "object",
          shape: {
            owner: "string",
            count: "number",
          },
        },
        samples: {
          type: "array",
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.normalized[0]).toEqual({
      metadata: {
        owner: " doc-specialist ",
        count: 12,
      },
      samples: ["one", "two"],
    });
  });
});
