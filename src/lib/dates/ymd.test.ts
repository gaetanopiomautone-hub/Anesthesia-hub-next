import { describe, expect, it } from "vitest";

import {
  addDaysYmd,
  addMonthsToYearMonth,
  compareYmd,
  formatYearMonthLabel,
  formatYmd,
  getMonthParam,
  isYmdInMonth,
  monthEndYmd,
  monthStartYmd,
  parseYmd,
  toLocalDateFromYmd,
} from "@/lib/dates/ymd";

describe("ymd", () => {
  it("parseYmd rejects invalid calendar days", () => {
    expect(() => parseYmd("2026-02-30")).toThrow();
    expect(() => parseYmd("bad")).toThrow();
  });

  it("formatYmd and getMonthParam round-trip", () => {
    expect(formatYmd({ year: 2026, month: 7, day: 15 })).toBe("2026-07-15");
    expect(getMonthParam("2026-07-15")).toBe("2026-07");
    expect(getMonthParam(new Date(2026, 6, 15, 15, 0, 0))).toBe("2026-07");
  });

  it("compareYmd orders lexicographically", () => {
    expect(compareYmd("2026-05-01", "2026-05-15")).toBe(-1);
    expect(compareYmd("2026-05-15", "2026-05-15")).toBe(0);
    expect(compareYmd("2026-06-01", "2026-05-31")).toBe(1);
  });

  it("addDaysYmd crosses month boundary", () => {
    expect(addDaysYmd("2026-07-31", 1)).toBe("2026-08-01");
  });

  it("isYmdInMonth respects month param", () => {
    expect(isYmdInMonth("2026-07-15", "2026-07")).toBe(true);
    expect(isYmdInMonth("2026-07-15", "2026-05")).toBe(false);
  });

  it("toLocalDateFromYmd uses local calendar (no UTC day shift)", () => {
    const d = toLocalDateFromYmd("2026-05-15");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(15);
  });

  it("monthStartYmd and monthEndYmd", () => {
    expect(monthStartYmd("2026-07")).toBe("2026-07-01");
    expect(monthEndYmd("2026-07")).toBe("2026-07-31");
    expect(monthEndYmd("2026-02")).toBe("2026-02-28");
  });

  it("addMonthsToYearMonth shifts across year boundary", () => {
    expect(addMonthsToYearMonth("2026-05", -1)).toBe("2026-04");
    expect(addMonthsToYearMonth("2026-05", 1)).toBe("2026-06");
    expect(addMonthsToYearMonth("2026-12", 1)).toBe("2027-01");
  });

  it("formatYearMonthLabel returns Italian month name", () => {
    expect(formatYearMonthLabel("2026-05")).toMatch(/maggio\s+2026/i);
  });
});
