# Platform permission policy layout

Scope: the **platform** permission system (`object/permission*.go`,
`object/permission_enforcer.go`, table `permission_rule`). The business
permission system (`biz_*`) is separate and unaffected.

## Storage

Policy rows live in a casbin_rule-shaped table with six value columns
`v0..v5`. Casbin's xorm adapter (`adapters/xormadapter`) hard-codes these six
columns, and the same `CasbinRule` struct is shared with the Enforcer entity
path, so the table is **not** widened.

**The permission id is always stored on the last column, `v5`**, whatever the
model declares. Enforcers are loaded with a filter on `v5`
(`LoadFilteredPolicy`) and rows are removed with `RemoveFilteredPolicy(5, id)`.

## Model shapes

`GetBuiltInModel` pads the model's `policy_definition` to six fields with the
permission id last (`parsePermissionPolicyDefinition`).

| Declared `p` fields | Result |
|---|---|
| 1 - 5 fields | Accepted; padded with empty fields, `permissionId` appended as the 6th |
| 6 fields, last is `permissionId` | Accepted (legacy explicit form) |
| 6 fields, last is anything else | Rejected: no column is left for the permission id |
| 7+ fields | Rejected |
| `permissionId` anywhere but 6th | Rejected |

So the supported width is **up to 5 model fields plus the reserved id column**.
A model such as `api-model-built-in` (6 distinct fields) still cannot be used
for permissions; supporting it would require widening the adapter table, which
is deliberately out of scope (it would touch both authorization subsystems).

## Row generation

`permissionPolicyLayout` (`object/permission_policy_layout.go`) maps a
permission onto columns using the model's field names (case-insensitive):

- subject: `sub`, `subject`, `user`
- domain: `dom`, `domain`, `tenant`
- object: `obj`, `object`, `res`, `resource`
- action: `act`, `action`
- effect: `eft`, `effect`

If sub, obj and act are all recognised the layout is *named*: each value is
written to its own column, unknown/extra columns stay empty, a domain column is
repeated per `permission.Domains` (empty if the permission has none; ignored if
the model has no domain field). If the model has no effect field the effect is
still written to the legacy position (column 3, or 4 with a domain field) when
free, so existing rows keep their exact shape.

Otherwise the **legacy positional layout** is used unchanged:
`[user, resource, action, effect, "", id]`, or
`[user, domain, resource, action, effect, id]` when the permission has domains.

For all pre-existing model shapes (default model, `user-model-built-in`,
`sub,dom,obj,act,eft`, explicit 6-field) the generated rows are byte-identical
to what older versions wrote.

## Compatibility and migration

No data migration is needed. Existing rows already have the id on `v5`.
Removal now deletes by `v5` instead of regenerating rows, so rows written by
an older layout or an older version of the permission are cleaned up too.
`GetAllObjects`/`GetAllActions` read the object/action column of each
permission's model (legacy columns 1 and 2 for unrecognised names).

## Enforcer cache

`permission_enforcer_cache.go` is untouched: cache keys, dependencies and
invalidation (`InvalidatePermissionEnforcers`) are keyed by permission id, which
is unchanged. Mutating paths still use private, uncached enforcers.
