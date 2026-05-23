import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  TRAINEE_ASSIGNMENT_PERIODS_SELECT_COLUMNS,
  TRAINEE_ASSIGNMENT_PERIODS_TABLE,
} from "@/lib/domain/trainee-assignment-periods-db-contract";

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

describe("trainee_assignment_periods schema guard (remote DB)", () => {
  it.skipIf(!hasSchemaGuardEnv())(
    "migration applicata: PostgREST espone le colonne del contratto",
    async () => {
      const supabase = createGuardClient();
      const selectList = TRAINEE_ASSIGNMENT_PERIODS_SELECT_COLUMNS.join(",");

      const { error } = await supabase.from(TRAINEE_ASSIGNMENT_PERIODS_TABLE).select(selectList).limit(0);

      expect(error).toBeNull();
    },
  );

  it.skipIf(!hasSchemaGuardEnv())(
    "vincolo overlap: secondo insert stesso ambito sovrapposto fallisce",
    async () => {
      const supabase = createGuardClient();
      const traineeId = process.env.SCHEMA_GUARD_TRAINEE_ID?.trim();
      if (!traineeId) return;

      const base = {
        trainee_id: traineeId,
        ambito: "sala_base" as const,
      };

      const first = await supabase
        .from(TRAINEE_ASSIGNMENT_PERIODS_TABLE)
        .insert({ ...base, starts_on: "2099-01-01", ends_on: "2099-03-31", note: "schema-guard-1" })
        .select("id")
        .single();

      expect(first.error).toBeNull();
      const firstId = first.data?.id;
      expect(firstId).toBeTruthy();

      const overlap = await supabase.from(TRAINEE_ASSIGNMENT_PERIODS_TABLE).insert({
        ...base,
        starts_on: "2099-02-01",
        ends_on: "2099-04-30",
        note: "schema-guard-overlap",
      });

      expect(overlap.error).not.toBeNull();
      expect(overlap.error?.message?.toLowerCase() ?? "").toMatch(/exclusion|overlap|sovrapp|trainee_assignment_periods_no_overlap/i);

      const adjacent = await supabase
        .from(TRAINEE_ASSIGNMENT_PERIODS_TABLE)
        .insert({
          ...base,
          starts_on: "2099-04-01",
          ends_on: "2099-06-30",
          note: "schema-guard-adjacent",
        })
        .select("id")
        .single();

      expect(adjacent.error).toBeNull();
      const adjacentId = adjacent.data?.id;

      const ids = [firstId, adjacentId].filter((id): id is string => Boolean(id));
      if (ids.length) {
        await supabase.from(TRAINEE_ASSIGNMENT_PERIODS_TABLE).delete().in("id", ids);
      }
    },
  );
});
