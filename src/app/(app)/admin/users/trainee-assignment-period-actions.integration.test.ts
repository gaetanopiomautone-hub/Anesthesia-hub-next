import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requireRoleMock: vi.fn(),
  createServerSupabaseClientMock: vi.fn(),
  listTraineeAssignmentPeriodsForUserMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePathMock,
}));

vi.mock("@/lib/auth/get-current-user-profile", () => ({
  requireRole: mocks.requireRoleMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClientMock,
}));

vi.mock("@/lib/data/trainee-assignment-periods", () => ({
  listTraineeAssignmentPeriodsForUser: mocks.listTraineeAssignmentPeriodsForUserMock,
}));

import {
  addTraineeAssignmentPeriodAction,
  updateTraineeAssignmentPeriodAction,
} from "@/app/(app)/admin/users/trainee-assignment-period-actions";

function formData(values: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    fd.set(key, value);
  }
  return fd;
}

function makeSupabase(
  opts: {
    insertError?: { message: string } | null;
    updateCalls?: Array<Record<string, unknown>>;
  } = {},
) {
  const { insertError = null, updateCalls = [] } = opts;
  const profileUpdate = vi.fn().mockResolvedValue({ error: null });
  return {
    from: (table: string) => {
      if (table === "trainee_assignment_periods") {
        return {
          insert: () => ({
            then: (resolve: (v: { error: typeof insertError }) => unknown) =>
              Promise.resolve({ error: insertError }).then(resolve),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: () => ({
              eq: () => ({
                then: (resolve: (v: { error: null }) => unknown) => {
                  updateCalls.push(payload);
                  return Promise.resolve({ error: null }).then(resolve);
                },
              }),
            }),
          }),
        };
      }
      if (table === "specializzandi_profiles") {
        return {
          update: (payload: Record<string, unknown>) => ({
            eq: () => ({
              then: (resolve: (v: { error: null }) => unknown) => {
                profileUpdate(payload);
                return Promise.resolve({ error: null }).then(resolve);
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    profileUpdate,
  };
}

describe("trainee assignment period actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRoleMock.mockResolvedValue(undefined);
    mocks.listTraineeAssignmentPeriodsForUserMock.mockResolvedValue([]);
  });

  it("consente due periodi stesso ambito non sovrapposti", async () => {
    mocks.listTraineeAssignmentPeriodsForUserMock.mockResolvedValue([
      {
        id: "existing",
        trainee_id: "u1",
        starts_on: "2024-01-01",
        ends_on: "2024-06-30",
        ambito: "sala_base",
        note: null,
      },
    ]);
    mocks.createServerSupabaseClientMock.mockResolvedValue(makeSupabase());

    const res = await addTraineeAssignmentPeriodAction(
      null,
      formData({
        traineeId: "u1",
        startsOn: "2025-01-01",
        endsOn: "2025-06-30",
        ambito: "sala_base",
      }),
    );

    expect(res).toEqual({ ok: true });
  });

  it("rifiuta sovrapposizione stesso ambito prima dell’insert", async () => {
    mocks.listTraineeAssignmentPeriodsForUserMock.mockResolvedValue([
      {
        id: "existing",
        trainee_id: "u1",
        starts_on: "2024-01-01",
        ends_on: "2024-06-30",
        ambito: "sala_base",
        note: null,
      },
    ]);

    const res = await addTraineeAssignmentPeriodAction(
      null,
      formData({
        traineeId: "u1",
        startsOn: "2024-03-01",
        endsOn: "2024-09-01",
        ambito: "sala_base",
      }),
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/sovrappone/i);
    }
    expect(mocks.createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("mappa errore DB exclusion su sovrapposizione", async () => {
    mocks.createServerSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        insertError: {
          message: 'conflicting key value violates exclusion constraint "trainee_assignment_periods_no_overlap_same_ambito"',
        },
      }),
    );

    const res = await addTraineeAssignmentPeriodAction(
      null,
      formData({
        traineeId: "u1",
        startsOn: "2026-01-01",
        endsOn: "2026-06-30",
        ambito: "rianimazione",
      }),
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/sovrapposizione/i);
    }
  });

  it("allinea assegnazione profilo solo con un periodo attivo oggi", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-23T12:00:00Z"));

    mocks.listTraineeAssignmentPeriodsForUserMock.mockResolvedValue([
      {
        id: "active",
        trainee_id: "u1",
        starts_on: "2026-01-01",
        ends_on: "2026-12-31",
        ambito: "sala_avanzata",
        note: null,
      },
    ]);

    const client = makeSupabase();
    mocks.createServerSupabaseClientMock.mockResolvedValue(client);

    await addTraineeAssignmentPeriodAction(
      null,
      formData({
        traineeId: "u1",
        startsOn: "2028-01-01",
        endsOn: "2028-06-30",
        ambito: "sala_base",
      }),
    );

    expect(client.profileUpdate).toHaveBeenCalledWith({ assegnazione: "sala_avanzata" });

    vi.useRealTimers();
  });

  it("non allinea profilo con due periodi attivi oggi", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-23T12:00:00Z"));

    mocks.listTraineeAssignmentPeriodsForUserMock.mockResolvedValue([
      {
        id: "a",
        trainee_id: "u1",
        starts_on: "2026-01-01",
        ends_on: "2026-12-31",
        ambito: "sala_base",
        note: null,
      },
      {
        id: "b",
        trainee_id: "u1",
        starts_on: "2026-05-01",
        ends_on: "2026-06-30",
        ambito: "rianimazione",
        note: null,
      },
    ]);

    const client = makeSupabase();
    mocks.createServerSupabaseClientMock.mockResolvedValue(client);

    await updateTraineeAssignmentPeriodAction(
      null,
      formData({
        periodId: "b",
        traineeId: "u1",
        startsOn: "2026-05-01",
        endsOn: "2026-06-30",
        ambito: "rianimazione",
      }),
    );

    expect(client.profileUpdate).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
