import { describe, expect, it } from "vitest";

import { feriePathWithContext, parseFerieContextFromForm } from "./ferie-url-context";

function buildFormData(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseFerieContextFromForm", () => {
  it("parses valid month and day", () => {
    const formData = buildFormData({ month: "2026-04", day: "2026-04-15" });
    expect(parseFerieContextFromForm(formData)).toEqual({ month: "2026-04", day: "2026-04-15" });
  });

  it("drops day when out of month", () => {
    const formData = buildFormData({ month: "2026-04", day: "2026-05-01" });
    expect(parseFerieContextFromForm(formData)).toEqual({ month: "2026-04", day: null });
  });

  it("drops both month and day when month is invalid", () => {
    const formData = buildFormData({ month: "2026/04", day: "2026-04-15" });
    expect(parseFerieContextFromForm(formData)).toEqual({ month: null, day: null });
  });
});

describe("feriePathWithContext", () => {
  it("builds path with month and valid day", () => {
    expect(feriePathWithContext({ month: "2026-04", day: "2026-04-15", ok: "updated" })).toBe(
      "/ferie?month=2026-04&day=2026-04-15&ok=updated",
    );
  });

  it("drops invalid day from URL while keeping month", () => {
    expect(feriePathWithContext({ month: "2026-04", day: "2026-05-01", ok: "approved" })).toBe(
      "/ferie?month=2026-04&ok=approved",
    );
  });

  it("builds error URL without month context", () => {
    expect(feriePathWithContext({ month: null, error: "x", errorCode: "overlap" })).toBe(
      "/ferie?error=x&errorCode=overlap",
    );
  });
});
