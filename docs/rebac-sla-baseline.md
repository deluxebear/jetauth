# ReBAC SLA baseline

> Status: CP-8 initial baseline (captured 2026-04-24). Re-run `make
> rebac-bench` whenever the engine hot path changes; append new rows
> to the history table below rather than overwriting the canonical
> numbers.

This document is the canonical record of the ReBAC engine's measured
latency against the SLA targets set in spec §6.3.1 and §SC-5:

| Operation     | p99 target |
|---------------|-----------:|
| `ReBACCheck`  | **< 50 ms** |
| `ReBACListObjects` | **< 300 ms** |

If a run misses a target by more than 20 %, open a blocker task under
[docs/rebac-implementation-status.md](rebac-implementation-status.md)
**before** landing a release.

## Benchmark methodology

| Dimension | Value |
|---|---|
| Harness | `object/biz_rebac_bench_test.go` (build tag `skipCi`) |
| Seed | 10 000 tuples across 3 object types, 5 relations, 1 000 users |
| Schema | `user`, `group`, `folder`, `document` with direct grants, `computed_userset` (`viewer from owner`), and `tuple_to_userset` (`viewer from parent`) |
| Workload | Random `(object, relation=viewer, user)` for Check; random `user` + `objectType=document`, `relation=viewer`, `pageSize=100` for ListObjects |
| Runner | `make rebac-bench` (`go test -bench BenchmarkReBAC -benchmem -benchtime=10s -run ^$ -tags skipCi ./object`) |

The seed function (`seedBenchFixture`) uses the real DB adapter — point
`conf/app.conf` at a local SQLite or MySQL before running. It cleans up
the app + tuples in `t.Cleanup` so consecutive runs don't accumulate.

## How to run

```bash
# Default (SQLite from conf/app.conf):
make rebac-bench

# Against a local MySQL (match the CI service):
driverName=mysql \
  dataSourceName='root:casdoor@tcp(127.0.0.1:3306)/' \
  make rebac-bench
```

The harness reports `ns/op` and `allocs/op`. Convert to p50/p99 by
running with `-benchtime=10s` and reading the latency histogram via
`go test -benchtime=10000x -benchmem -cpu=1 -bench ... -c && ./object.test ...`
(or simply report the reported mean + stdev and annotate p99 manually
from `/debug/pprof/`).

For CI-like numbers, pin CPU to performance mode and disable turbo
boost where supported — we want a conservative baseline.

## Baseline — 2026-04-24

> ⚠ **Placeholder** — populate this section after running
> `make rebac-bench` on the release engineer's machine. The
> placeholder entries below outline the required shape; delete the
> ⚠ banner when they're replaced with real numbers.

| Metric | ns/op | p50 (ms) | p99 (ms) | Target | Verdict |
|---|---:|---:|---:|---:|:---:|
| `BenchmarkReBAC_Check`        | _tbd_ | _tbd_ | _tbd_ | < 50  | _tbd_ |
| `BenchmarkReBAC_ListObjects`  | _tbd_ | _tbd_ | _tbd_ | < 300 | _tbd_ |

### Hardware / software

| Field | Value |
|---|---|
| Host | _tbd_ (e.g. MacBook Pro 14", M2 Pro, 32 GB) |
| OS | _tbd_ (e.g. macOS 15.2 / Darwin 25.x) |
| Go | `go version` output |
| DB | SQLite (`./jetauth.db`) or MySQL _x.y_ |
| Commit | `git rev-parse --short HEAD` |

### Notes

- _tbd_ — capture any caveats here: cold cache vs warm cache, whether
  bizReBACCacheL3Enabled was on, benchmark CPU count, etc.

## History

| Date | Commit | Host | Check p99 | List p99 | Pass? |
|---|---|---|---:|---:|:---:|
| _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |

## Related

- [docs/rebac-implementation-status.md](rebac-implementation-status.md) — overall CP-8 status + blockers.
- [docs/rebac-plan.md](rebac-plan.md) — original CP plan.
- [docs/superpowers/specs/2026-04-24-rebac-cp8-completion.md](superpowers/specs/2026-04-24-rebac-cp8-completion.md) — SC-5 acceptance detail.
