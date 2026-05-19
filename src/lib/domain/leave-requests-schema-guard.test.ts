import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  mapLeaveRequestToDbCancel,
  mapLeaveRequestToDbInsert,
  mapLeaveRequestToDbReview,
  mapLeaveRequestToDbUpdate,
} from "@/lib/domain/leave-request-db";
import {
  LEAVE_REQUESTS_ACTIVE_OVERLAP_STATUSES,
  LEAVE_REQUESTS_COLUMNS,
  LEAVE_REQUESTS_FORBIDDEN_LEGACY_COLUMNS,
  LEAVE_REQUESTS_FORBIDDEN_LEGACY_MARKERS,
  LEAVE_REQUESTS_INTEGRITY_CONSTRAINT,
  LEAVE_REQUESTS_POLICY_MARKERS,
  LEAVE_REQUESTS_RLS_POLICIES,
  LEAVE_REQUESTS_SELECT_COLUMNS,
  LEAVE_REQUESTS_STATUSES,
} from "@/lib/domain/leave-requests-db-contract";
import { activeLeaveDbStatuses } from "@/lib/domain/leave-request-db";
import { LEAVE_SELECT } from "@/lib/data/leave-requests";

function objectKeys(obj: Record<string, unknown>) {
  return Object.keys(obj);
}

function parseSelectList(select: string) {
  return select
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

function readLeaveRequestsPoliciesSqlBlock() {
  const sql = readFileSync(join(process.cwd(), "supabase/policies.sql"), "utf8");
  const start = sql.indexOf("-- leave_requests");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("-- procedure_catalog");
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

function readLeaveRequestsSchemaSqlSnippet() {
  const sql = readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8");
  const tableStart = sql.indexOf("create table if not exists public.leave_requests");
  expect(tableStart).toBeGreaterThanOrEqual(0);
  return sql.slice(tableStart, tableStart + 2500);
}

describe("leave_requests schema guard (static)", () => {
  it("overlap active statuses match contract", () => {
    expect(activeLeaveDbStatuses()).toEqual([...LEAVE_REQUESTS_ACTIVE_OVERLAP_STATUSES]);
  });

  it("LEAVE_SELECT only references contract columns", () => {
    const selected = parseSelectList(LEAVE_SELECT);
    for (const col of selected) {
      expect(LEAVE_REQUESTS_COLUMNS).toContain(col);
    }
    expect(selected.length).toBe(LEAVE_REQUESTS_SELECT_COLUMNS.length);
  });

  it("mapper write payloads use only contract column names", () => {
    const insertKeys = objectKeys(
      mapLeaveRequestToDbInsert({
        userId: "u1",
        requestType: "vacation",
        startDate: "2026-07-01",
        endDate: "2026-07-02",
      }) as Record<string, unknown>,
    );
    const updateKeys = objectKeys(
      mapLeaveRequestToDbUpdate({
        requestType: "vacation",
        startDate: "2026-07-01",
        endDate: "2026-07-02",
      }) as Record<string, unknown>,
    );
    const cancelKeys = objectKeys(mapLeaveRequestToDbCancel(new Date().toISOString()) as Record<string, unknown>);
    const reviewKeys = objectKeys(
      mapLeaveRequestToDbReview({ reviewerId: "r1", status: "approvato" }) as Record<string, unknown>,
    );

    for (const key of [...insertKeys, ...updateKeys, ...cancelKeys, ...reviewKeys]) {
      expect(LEAVE_REQUESTS_COLUMNS).toContain(key);
      expect(LEAVE_REQUESTS_FORBIDDEN_LEGACY_COLUMNS).not.toContain(key);
    }

    expect(insertKeys).toContain("user_id");
    expect(insertKeys).toContain("reviewed_by");
    expect(cancelKeys).toContain("cancelled_at");
    expect(reviewKeys).toContain("reviewed_at");
  });

  it("policies.sql defines expected RLS policies for leave_requests", () => {
    const block = readLeaveRequestsPoliciesSqlBlock();
    for (const policy of LEAVE_REQUESTS_RLS_POLICIES) {
      expect(block).toContain(`"${policy}"`);
    }
    for (const marker of LEAVE_REQUESTS_POLICY_MARKERS) {
      expect(block).toContain(marker);
    }
    for (const forbidden of LEAVE_REQUESTS_FORBIDDEN_LEGACY_MARKERS) {
      expect(block).not.toContain(forbidden);
    }
  });

  it("schema.sql documents real columns and integrity constraint", () => {
    const snippet = readLeaveRequestsSchemaSqlSnippet();
    expect(snippet).toContain("user_id uuid");
    expect(snippet).toContain("reviewed_by uuid");
    expect(snippet).toContain("reviewed_at timestamptz");
    expect(snippet).toContain("cancelled_at timestamptz");
    expect(snippet).not.toContain("requester_profile_id");
    expect(readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8")).toContain(
      LEAVE_REQUESTS_INTEGRITY_CONSTRAINT,
    );
  });

  it("status contract covers mapper enum", () => {
    expect(LEAVE_REQUESTS_STATUSES).toEqual(["in_attesa", "approvato", "rifiutato", "annullato"]);
  });
});
