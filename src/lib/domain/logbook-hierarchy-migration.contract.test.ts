import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION = join(process.cwd(), "supabase/migrations/20260524100000_logbook_procedure_hierarchy.sql");

describe("logbook_procedure_hierarchy migration contract", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("definisce participation_role e quantity", () => {
    expect(sql).toMatch(/logbook_participation_role/);
    expect(sql).toMatch(/quantity int/);
  });

  it("RLS logbook: tutor può leggere", () => {
    expect(sql).toMatch(/logbook_select_own_admin_tutor/);
    expect(sql).toMatch(/public\.is_tutor\(\)/);
  });
});
