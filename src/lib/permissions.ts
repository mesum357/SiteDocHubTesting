// =============================================================================
// SiteDocHB — Role-Based Permission Helpers
// =============================================================================
// Use these on the frontend to gate UI elements. The backend enforces the same
// rules via RLS policies, but hiding controls prevents confusing 403 errors.
// =============================================================================

export type UserRole = "field_worker" | "office_staff" | "admin";
export type UserStatus = "pending" | "approved" | "rejected" | "banned";

export const ROLES = {
  FIELD_WORKER: "field_worker" as UserRole,
  OFFICE_STAFF: "office_staff" as UserRole,
  ADMIN: "admin" as UserRole,
} as const;

/**
 * All actions that can be gated by role in the UI.
 */
export type PermissionAction =
  | "VIEW_JOBS"
  | "CREATE_JOB"
  | "EDIT_JOB"
  | "ARCHIVE_JOB"
  | "VIEW_FLOORS"
  | "CREATE_FLOOR"
  | "DELETE_FLOOR"
  | "VIEW_PINS"
  | "PLACE_PIN"
  | "MOVE_PIN"
  | "DELETE_PIN"
  | "UPLOAD_PHOTO"
  | "ADD_NOTES"
  | "GENERATE_SHARE"
  | "EXPORT_REPORT"
  | "MANAGE_USERS";

/**
 * Permission matrix — maps each action to the set of roles that can perform it.
 *
 * | Action              | field_worker | office_staff | admin |
 * |---------------------|:-------------|:-------------|:------|
 * | VIEW_JOBS           | ✅           | ✅           | ✅    |
 * | CREATE_JOB          | ❌           | ✅           | ✅    |
 * | EDIT_JOB            | ❌           | ✅           | ✅    |
 * | ARCHIVE_JOB         | ❌           | ❌           | ✅    |
 * | VIEW_FLOORS         | ✅           | ✅           | ✅    |
 * | CREATE_FLOOR        | ❌           | ✅           | ✅    |
 * | DELETE_FLOOR         | ❌           | ❌           | ✅    |
 * | VIEW_PINS           | ✅           | ✅           | ✅    |
 * | PLACE_PIN           | ❌           | ✅           | ✅    |
 * | MOVE_PIN            | ❌           | ✅           | ✅    |
 * | DELETE_PIN           | ❌           | ✅           | ✅    |
 * | UPLOAD_PHOTO        | ✅           | ✅           | ✅    |
 * | ADD_NOTES           | ✅           | ✅           | ✅    |
 * | GENERATE_SHARE      | ❌           | ✅           | ✅    |
 * | EXPORT_REPORT       | ❌           | ✅           | ✅    |
 * | MANAGE_USERS        | ❌           | ❌           | ✅    |
 */
const PERMISSIONS: Record<PermissionAction, ReadonlySet<UserRole>> = {
  VIEW_JOBS: new Set<UserRole>(["field_worker", "office_staff", "admin"]),
  CREATE_JOB: new Set<UserRole>(["office_staff", "admin"]),
  EDIT_JOB: new Set<UserRole>(["office_staff", "admin"]),
  ARCHIVE_JOB: new Set<UserRole>(["admin"]),
  VIEW_FLOORS: new Set<UserRole>(["field_worker", "office_staff", "admin"]),
  CREATE_FLOOR: new Set<UserRole>(["office_staff", "admin"]),
  DELETE_FLOOR: new Set<UserRole>(["admin"]),
  VIEW_PINS: new Set<UserRole>(["field_worker", "office_staff", "admin"]),
  PLACE_PIN: new Set<UserRole>(["office_staff", "admin"]),
  MOVE_PIN: new Set<UserRole>(["office_staff", "admin"]),
  DELETE_PIN: new Set<UserRole>(["office_staff", "admin"]),
  UPLOAD_PHOTO: new Set<UserRole>(["field_worker", "office_staff", "admin"]),
  ADD_NOTES: new Set<UserRole>(["field_worker", "office_staff", "admin"]),
  GENERATE_SHARE: new Set<UserRole>(["office_staff", "admin"]),
  EXPORT_REPORT: new Set<UserRole>(["office_staff", "admin"]),
  MANAGE_USERS: new Set<UserRole>(["admin"]),
};

/**
 * Check if a role is allowed to perform a specific action.
 *
 * @example
 * ```ts
 * if (canPerform(userRole, "CREATE_JOB")) {
 *   // show the "New Job" button
 * }
 * ```
 */
export function canPerform(
  role: UserRole | null | undefined,
  action: PermissionAction
): boolean {
  if (!role) return false;
  return PERMISSIONS[action]?.has(role) ?? false;
}

/**
 * Get all actions a role is allowed to perform.
 */
export function getAllowedActions(role: UserRole): PermissionAction[] {
  return (Object.keys(PERMISSIONS) as PermissionAction[]).filter((action) =>
    PERMISSIONS[action].has(role)
  );
}

/**
 * Role display labels for the UI.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  field_worker: "Field Worker",
  office_staff: "Office Staff",
  admin: "Admin",
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  banned: "Banned",
};
