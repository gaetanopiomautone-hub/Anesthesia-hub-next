import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  LEAVE_REQUESTS_COLUMNS,
  LEAVE_REQUESTS_FORBIDDEN_LEGACY_COLUMNS,
  LEAVE_REQUESTS_SELECT_COLUMNS,
  LEAVE_REQUESTS_TABLE,
} from "@/lib/domain/leave-requests-db-contract";

function hasSchemaGuardEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

function createGuardClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

describe("leave_requests schema guard (remote DB)", () => {
  it.skipIf(!hasSchemaGuardEnv())(
    "PostgREST exposes all contract columns on leave_requests",
    async () => {
      const supabase = createGuardClient();
      const selectList = LEAVE_REQUESTS_SELECT_COLUMNS.join(",");

      const { error } = await supabase.from(LEAVE_REQUESTS_TABLE).select(selectList).limit(0);

      expect(error).toBeNull();
    },
  );

  it.skipIf(!hasSchemaGuardEnv())(
    "legacy column names are not present on leave_requests",
    async () => {
      const supabase = createGuardClient();

      for (const legacyColumn of LEAVE_REQUESTS_FORBIDDEN_LEGACY_COLUMNS) {
        const { error } = await supabase.from(LEAVE_REQUESTS_TABLE).select(legacyColumn).limit(0);
        expect(error).not.toBeNull();
        expect(error?.message?.toLowerCase() ?? "").toMatch(/column|schema|could not find/i);
      }
    },
  );

  it.skipIf(!hasSchemaGuardEnv())(
    "required columns are a subset of remote table (no missing contract field)",
    async () => {
      const supabase = createGuardClient();
      const { data, error } = await supabase.from(LEAVE_REQUESTS_TABLE).select("*").limit(1);

      expect(error).toBeNull();
      if (!data?.length) return;

      const row = data[0] as Record<string, unknown>;
      for (const col of LEAVE_REQUESTS_COLUMNS) {
        expect(Object.prototype.hasOwnProperty.call(row, col)).toBe(true);
      }
    },
  );
});
