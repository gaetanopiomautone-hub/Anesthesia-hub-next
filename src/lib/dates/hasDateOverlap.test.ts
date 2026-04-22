import { describe, expect, test } from "vitest";

import { hasDateOverlap } from "./hasDateOverlap";

describe("hasDateOverlap", () => {
  const cases = [
    {
      name: "no overlap",
      a: ["2026-04-01", "2026-04-05"],
      b: ["2026-04-06", "2026-04-10"],
      expected: false,
    },
    {
      name: "touching edge overlaps",
      a: ["2026-04-01", "2026-04-05"],
      b: ["2026-04-05", "2026-04-10"],
      expected: true,
    },
    {
      name: "inside range overlaps",
      a: ["2026-04-01", "2026-04-10"],
      b: ["2026-04-03", "2026-04-05"],
      expected: true,
    },
    {
      name: "partial overlap",
      a: ["2026-04-01", "2026-04-05"],
      b: ["2026-04-04", "2026-04-08"],
      expected: true,
    },
    {
      name: "same range overlaps",
      a: ["2026-04-01", "2026-04-05"],
      b: ["2026-04-01", "2026-04-05"],
      expected: true,
    },
  ] as const;

  test.each(cases)("$name", ({ a, b, expected }) => {
    expect(hasDateOverlap(a[0], a[1], b[0], b[1])).toBe(expected);
  });
});
