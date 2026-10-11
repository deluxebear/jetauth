# Platform permission approval and enforcement

The platform permission approval workflow (`Pending` / `Approved` / `Rejected`) gates what
`/api/enforce`, `/api/batch-enforce` and the other platform enforcer APIs see.

## Policy rows follow the approval state

- Casbin policy rows (`permission_rule`, or the permission's adapter table) exist **only** for
  permissions whose state is `Approved`. A permission with an empty state is legacy data created
  before the workflow existed and is treated as approved; every current write path forces a state.
- `addPolicies` skips non-approved permissions, and `UpdatePermission` removes the old rows and
  re-adds them from the stored content. Approve therefore writes the rows; reject, revoke, resubmit
  and the demotion of a non-approver's edit remove them. Each of those writes invalidates the
  platform enforcer cache (`removePolicies`/`addPolicies` and the Permission xorm hooks).
- As defense in depth the enforce controllers skip non-approved permissions when they resolve
  permissions by id, owner, model or resource, and answer `false` for a non-approved `permissionId`.
- `IsEnabled` is intentionally not part of this gate. `check.go` honours it, but the platform
  enforcer never has, and it is a zero-valued bool for API clients that omit it.

## Startup reconciliation

Before this change Pending and Rejected permissions also had live rows. At boot
`object.InitPermissionPolicyReconciliation()` (called from `main.go` after
`InitCustomHttpEmailMigration`) removes the rows of every non-approved permission. It is idempotent:
on a clean database it is a single SELECT, and a failure on one permission (for example a deleted
model) is logged and does not stop the others.
