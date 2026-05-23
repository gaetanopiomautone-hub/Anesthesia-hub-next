export const TRAINEE_ASSIGNMENT_PERIODS_TABLE = "trainee_assignment_periods" as const;

export const TRAINEE_ASSIGNMENT_PERIODS_COLUMNS = [
  "id",
  "trainee_id",
  "starts_on",
  "ends_on",
  "ambito",
  "note",
  "created_at",
  "updated_at",
] as const;

export const TRAINEE_ASSIGNMENT_PERIODS_SELECT_COLUMNS = [
  "id",
  "trainee_id",
  "starts_on",
  "ends_on",
  "ambito",
  "note",
] as const;
