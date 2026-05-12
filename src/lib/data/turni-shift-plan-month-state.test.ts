import { describe, expect, it } from "vitest";

import { parseTurniShiftPlanMonthStateRpcPayload } from "./turni-shift-plan-month-state";

describe("parseTurniShiftPlanMonthStateRpcPayload (contratto RPC turni_shift_plan_month_state)", () => {
  it("variant none", () => {
    expect(parseTurniShiftPlanMonthStateRpcPayload({ variant: "none" })).toEqual({ variant: "none" });
    expect(parseTurniShiftPlanMonthStateRpcPayload(null)).toEqual({ variant: "none" });
    expect(parseTurniShiftPlanMonthStateRpcPayload(undefined)).toEqual({ variant: "none" });
  });

  it("variant published", () => {
    expect(parseTurniShiftPlanMonthStateRpcPayload({ variant: "published" })).toEqual({ variant: "published" });
  });

  it("variant internal con plan_id e plan_status", () => {
    expect(
      parseTurniShiftPlanMonthStateRpcPayload({
        variant: "internal",
        plan_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        plan_status: "draft",
      }),
    ).toEqual({
      variant: "internal",
      plan_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      plan_status: "draft",
    });
    expect(
      parseTurniShiftPlanMonthStateRpcPayload({
        variant: "internal",
        plan_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        plan_status: "approved",
      }),
    ).toEqual({
      variant: "internal",
      plan_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      plan_status: "approved",
    });
  });

  it("internal malformato → none", () => {
    expect(parseTurniShiftPlanMonthStateRpcPayload({ variant: "internal" })).toEqual({ variant: "none" });
    expect(
      parseTurniShiftPlanMonthStateRpcPayload({
        variant: "internal",
        plan_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        plan_status: "bogus",
      }),
    ).toEqual({ variant: "none" });
  });
});
