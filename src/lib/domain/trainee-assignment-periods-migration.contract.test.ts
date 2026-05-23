import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260523100000_trainee_assignment_periods.sql",
);

describe("trainee_assignment_periods migration contract", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("definisce vincolo exclusion overlap stesso ambito", () => {
    expect(sql).toMatch(/trainee_assignment_periods_no_overlap_same_ambito/);
    expect(sql).toMatch(/exclude using gist/i);
  });

  it("RLS: select per admin, tutor e proprio specializzando", () => {
    expect(sql).toMatch(/trainee_assignment_periods_select_admin_tutor_own/);
    expect(sql).toMatch(/public\.is_admin\(\)/);
    expect(sql).toMatch(/public\.is_tutor\(\)/);
    expect(sql).toMatch(/trainee_id = auth\.uid\(\)/);
  });

  it("RLS: insert/update/delete solo admin", () => {
    expect(sql).toMatch(/trainee_assignment_periods_insert_admin/);
    expect(sql).toMatch(/trainee_assignment_periods_update_admin/);
    expect(sql).toMatch(/trainee_assignment_periods_delete_admin/);
  });
});
