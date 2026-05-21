import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePathMock: vi.fn(),
  requireUserMock: vi.fn(),
  createServerSupabaseClientMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePathMock,
}));

vi.mock("@/lib/auth/get-current-user-profile", () => ({
  requireUser: mocks.requireUserMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClientMock,
}));

import {
  approveLeaveRequestAction,
  cancelLeaveRequestAction,
  createLeaveRequestAction,
  updateLeaveRequestAction,
} from "./actions";

function formData(values: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    fd.set(key, value);
  }
  return fd;
}

function lastRedirectPath() {
  const path = mocks.redirectMock.mock.calls.at(-1)?.[0];
  expect(typeof path).toBe("string");
  return path as string;
}

function readRedirectQuery(path: string) {
  const query = path.split("?")[1] ?? "";
  return new URLSearchParams(query);
}

function makeCreateSupabase({
  overlapRows = [],
  overlapError = null,
  insertError = null,
}: {
  overlapRows?: Array<{ id: string }>;
  overlapError?: { code: string } | null;
  insertError?: { code: string } | null;
}) {
  let fromCalls = 0;
  return {
    from: () => {
      fromCalls += 1;

      if (fromCalls === 1) {
        const overlapResult = { data: overlapRows, error: overlapError };
        const overlapQuery = {
          select: () => overlapQuery,
          eq: () => overlapQuery,
          in: () => overlapQuery,
          lte: () => overlapQuery,
          gte: () => overlapQuery,
          limit: () => overlapQuery,
          neq: () => overlapQuery,
          then: (resolve: (value: typeof overlapResult) => unknown) => Promise.resolve(overlapResult).then(resolve),
        };
        return overlapQuery;
      }

      return {
        insert: () => Promise.resolve({ error: insertError }),
      };
    },
  };
}

function makeCancelSupabase({
  existing,
  existingError = null,
  updateData = [{ id: "updated-id" }],
  updateError = null,
}: {
  existing: {
    id: string;
    user_id: string;
    status: string;
    reviewed_by?: string | null;
    reviewed_at?: string | null;
  } | null;
  existingError?: { code: string } | null;
  updateData?: Array<{ id: string }>;
  updateError?: { code: string } | null;
}) {
  let fromCalls = 0;
  return {
    from: () => {
      fromCalls += 1;
      if (fromCalls === 1) {
        const existingQuery = {
          select: () => existingQuery,
          eq: () => existingQuery,
          single: () => Promise.resolve({ data: existing, error: existingError }),
        };
        return existingQuery;
      }

      const updateQuery = {
        eq: () => updateQuery,
        in: () => updateQuery,
        select: () => Promise.resolve({ data: updateData, error: updateError }),
      };
      return {
        update: () => updateQuery,
      };
    },
  };
}

function makeUpdateSupabase({
  existing,
  overlapRows = [],
  updateData = [{ id: "updated-id" }],
  updateError = null,
}: {
  existing: { id: string; user_id: string; status: string } | null;
  overlapRows?: Array<{ id: string }>;
  updateData?: Array<{ id: string }>;
  updateError?: { code: string } | null;
}) {
  let fromCalls = 0;
  return {
    from: () => {
      fromCalls += 1;
      if (fromCalls === 1) {
        const existingQuery = {
          select: () => existingQuery,
          eq: () => existingQuery,
          single: () => Promise.resolve({ data: existing, error: null }),
        };
        return existingQuery;
      }

      if (fromCalls === 2) {
        const overlapResult = { data: overlapRows, error: null };
        const overlapQuery = {
          select: () => overlapQuery,
          eq: () => overlapQuery,
          in: () => overlapQuery,
          lte: () => overlapQuery,
          gte: () => overlapQuery,
          limit: () => overlapQuery,
          neq: () => overlapQuery,
          then: (resolve: (value: typeof overlapResult) => unknown) => Promise.resolve(overlapResult).then(resolve),
        };
        return overlapQuery;
      }

      const updateQuery = {
        eq: () => updateQuery,
        select: () => Promise.resolve({ data: updateData, error: updateError }),
      };
      return {
        update: () => updateQuery,
      };
    },
  };
}

describe("ferie actions (integration-like)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create redirects with month/day on valid context", async () => {
    mocks.requireUserMock.mockResolvedValue({ id: "u1", role: "specializzando" });
    mocks.createServerSupabaseClientMock.mockResolvedValue(makeCreateSupabase({}));

    await expect(
      createLeaveRequestAction(
        formData({
          month: "2026-07",
          day: "2026-07-15",
          requestType: "vacation",
          startDate: "2026-07-15",
          endDate: "2026-07-16",
          reason: "test",
        }),
      ),
    ).rejects.toThrow("REDIRECT:");

    const path = lastRedirectPath();
    expect(path).toBe("/ferie?month=2026-07&day=2026-07-15&ok=created");
    expect(mocks.revalidatePathMock).toHaveBeenCalledWith("/ferie");
  });

  it("create redirects to request month when calendar view month differs", async () => {
    mocks.requireUserMock.mockResolvedValue({ id: "u1", role: "specializzando" });
    mocks.createServerSupabaseClientMock.mockResolvedValue(makeCreateSupabase({}));

    await expect(
      createLeaveRequestAction(
        formData({
          month: "2026-05",
          day: "",
          requestType: "vacation",
          startDate: "2026-06-01",
          endDate: "2026-06-02",
          reason: "test",
        }),
      ),
    ).rejects.toThrow("REDIRECT:");

    expect(lastRedirectPath()).toBe("/ferie?month=2026-06&day=2026-06-01&ok=created");
  });

  it("create overlap redirects with overlap error and preserves valid day", async () => {
    mocks.requireUserMock.mockResolvedValue({ id: "u1", role: "specializzando" });
    mocks.createServerSupabaseClientMock.mockResolvedValue(makeCreateSupabase({ overlapRows: [{ id: "ov1" }] }));

    await expect(
      createLeaveRequestAction(
        formData({
          month: "2026-07",
          day: "2026-07-15",
          requestType: "vacation",
          startDate: "2026-07-15",
          endDate: "2026-07-16",
          reason: "overlap-check",
        }),
      ),
    ).rejects.toThrow("REDIRECT:");

    const query = readRedirectQuery(lastRedirectPath());
    expect(query.get("month")).toBe("2026-07");
    expect(query.get("day")).toBe("2026-07-15");
    expect(query.get("errorCode")).toBe("overlap");
  });

  it("create maps known DB error code to user-friendly message", async () => {
    mocks.requireUserMock.mockResolvedValue({ id: "u1", role: "specializzando" });
    mocks.createServerSupabaseClientMock.mockResolvedValue(makeCreateSupabase({ insertError: { code: "23505" } }));

    await expect(
      createLeaveRequestAction(
        formData({
          month: "2026-07",
          day: "2026-07-15",
          requestType: "vacation",
          startDate: "2026-07-15",
          endDate: "2026-07-16",
          reason: "db-known",
        }),
      ),
    ).rejects.toThrow("REDIRECT:");

    const query = readRedirectQuery(lastRedirectPath());
    expect(query.get("month")).toBe("2026-07");
    expect(query.get("day")).toBe("2026-07-15");
    expect(query.get("error")).toBe("Esiste già un record che impedisce questa operazione.");
  });

  it("update redirects to request month after save", async () => {
    mocks.requireUserMock.mockResolvedValue({ id: "u1", role: "specializzando" });
    mocks.createServerSupabaseClientMock.mockResolvedValue(
      makeUpdateSupabase({ existing: { id: "r1", user_id: "u1", status: "pending" } }),
    );

    await expect(
      updateLeaveRequestAction(
        formData({
          id: "11111111-1111-4111-8111-111111111111",
          month: "2026-06",
          day: "2026-06-01",
          requestType: "vacation",
          startDate: "2026-07-20",
          endDate: "2026-07-22",
          reason: "update-check",
        }),
      ),
    ).rejects.toThrow("REDIRECT:");

    const query = readRedirectQuery(lastRedirectPath());
    expect(query.get("month")).toBe("2026-07");
    expect(query.get("day")).toBe("2026-07-20");
    expect(query.get("ok")).toBe("updated");
  });

  it("update maps unknown DB error to safe generic fallback", async () => {
    mocks.requireUserMock.mockResolvedValue({ id: "u1", role: "specializzando" });
    mocks.createServerSupabaseClientMock.mockResolvedValue(
      makeUpdateSupabase({
        existing: { id: "r1", user_id: "u1", status: "pending" },
        updateError: { code: "XX000" },
      }),
    );

    await expect(
      updateLeaveRequestAction(
        formData({
          id: "11111111-1111-4111-8111-111111111111",
          month: "2026-06",
          day: "2026-06-01",
          requestType: "vacation",
          startDate: "2026-07-20",
          endDate: "2026-07-22",
          reason: "db-unknown",
        }),
      ),
    ).rejects.toThrow("REDIRECT:");

    const query = readRedirectQuery(lastRedirectPath());
    expect(query.get("month")).toBe("2026-06");
    expect(query.get("day")).toBe("2026-06-01");
    expect(query.get("error")).toBe("Operazione non riuscita. Riprova più tardi.");
  });

  it("cancel succeeds only when owner and pending", async () => {
    mocks.requireUserMock.mockResolvedValue({ id: "u1", role: "specializzando" });
    mocks.createServerSupabaseClientMock.mockResolvedValue(
      makeCancelSupabase({ existing: { id: "r1", user_id: "u1", status: "pending" } }),
    );

    await expect(
      cancelLeaveRequestAction(
        formData({
          id: "11111111-1111-4111-8111-111111111111",
          month: "2026-04",
          day: "2026-04-15",
        }),
      ),
    ).rejects.toThrow("REDIRECT:");

    expect(lastRedirectPath()).toBe("/ferie?month=2026-04&day=2026-04-15&ok=cancelled");
  });

  it("cancel is denied when status is not pending", async () => {
    mocks.requireUserMock.mockResolvedValue({ id: "u1", role: "specializzando" });
    mocks.createServerSupabaseClientMock.mockResolvedValue(
      makeCancelSupabase({ existing: { id: "r1", user_id: "u1", status: "approved" } }),
    );

    await expect(
      cancelLeaveRequestAction(
        formData({
          id: "11111111-1111-4111-8111-111111111111",
          month: "2026-04",
          day: "2026-04-15",
        }),
      ),
    ).rejects.toThrow("REDIRECT:");

    const query = readRedirectQuery(lastRedirectPath());
    expect(query.get("error")).toContain("Puoi annullare solo richieste ancora in attesa.");
  });

  it("tutor can cancel approved request of another user", async () => {
    mocks.requireUserMock.mockResolvedValue({ id: "tutor-1", role: "tutor" });
    mocks.createServerSupabaseClientMock.mockResolvedValue(
      makeCancelSupabase({
        existing: {
          id: "r1",
          user_id: "u2",
          status: "approved",
          reviewed_by: "tutor-1",
          reviewed_at: "2026-04-01T10:00:00.000Z",
        },
      }),
    );

    await expect(
      cancelLeaveRequestAction(
        formData({
          id: "11111111-1111-4111-8111-111111111111",
          month: "2026-04",
          day: "2026-04-15",
        }),
      ),
    ).rejects.toThrow("REDIRECT:");

    expect(lastRedirectPath()).toBe("/ferie?month=2026-04&day=2026-04-15&ok=cancelled");
  });

  it("cancel is denied for non-owner", async () => {
    mocks.requireUserMock.mockResolvedValue({ id: "u1", role: "specializzando" });
    mocks.createServerSupabaseClientMock.mockResolvedValue(
      makeCancelSupabase({ existing: { id: "r1", user_id: "u2", status: "pending" } }),
    );

    await expect(
      cancelLeaveRequestAction(
        formData({
          id: "11111111-1111-4111-8111-111111111111",
          month: "2026-04",
          day: "2026-04-15",
        }),
      ),
    ).rejects.toThrow("REDIRECT:");

    const query = readRedirectQuery(lastRedirectPath());
    expect(query.get("error")).toContain("Non puoi annullare richieste di altri utenti.");
  });

  it("approve is denied to non-approver roles", async () => {
    mocks.requireUserMock.mockResolvedValue({ id: "u1", role: "specializzando" });

    await expect(
      approveLeaveRequestAction(
        formData({
          id: "11111111-1111-4111-8111-111111111111",
          month: "2026-04",
          day: "2026-04-15",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/forbidden");
  });
});
