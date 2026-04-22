import { describe, expect, it } from "vitest";

import { normalizeDayInMonth } from "./day-in-month";

describe("normalizeDayInMonth", () => {
  it("returns normalized day when valid and in the selected month", () => {
    expect(normalizeDayInMonth("2026-04-15", "2026-04")).toBe("2026-04-15");
  });

  it("trims input and still validates", () => {
    expect(normalizeDayInMonth(" 2026-04-05 ", "2026-04")).toBe("2026-04-05");
  });

  it("returns null for invalid format", () => {
    expect(normalizeDayInMonth("2026/04/15", "2026-04")).toBeNull();
  });

  it("returns null when day is outside selected month", () => {
    expect(normalizeDayInMonth("2026-05-01", "2026-04")).toBeNull();
  });
});
