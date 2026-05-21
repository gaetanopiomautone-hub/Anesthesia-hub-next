import { describe, expect, it } from "vitest";

import { cancellableLeaveDbStatuses } from "@/lib/domain/leave-requests-db-contract";

describe("leave-requests-db-contract", () => {
  it("cancellableLeaveDbStatuses includes approvato for scheduler", () => {
    expect(cancellableLeaveDbStatuses(true)).toEqual(["in_attesa", "approvato"]);
    expect(cancellableLeaveDbStatuses(false)).toEqual(["in_attesa"]);
  });
});
