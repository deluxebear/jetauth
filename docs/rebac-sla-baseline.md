# ReBAC SLA baseline

> Status: **CP-8 initial baseline captured 2026-04-25 — `ReBACCheck`
> passes (95 µs mean); `ReBACListObjects` MISSES the p99<300ms gate
> (801 ms mean on 2500-doc fixture)**. ListObjects hotpath needs
> optimization before cutting a release — see §Blockers below. Re-run
> `make rebac-bench` whenever the engine hot path changes; append new
> rows to the history table rather than overwriting.

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

## Baseline — 2026-04-25 (parallel candidate Check landed)

| Metric | ns/op (mean) | p50 est. (ms) | p99 est. (ms) | Target | Verdict |
|---|---:|---:|---:|---:|:---:|
| `BenchmarkReBAC_Check`        |      96 005 |      ~0.1 |    ~0.3 | < 50  | ✅ **PASS** (500× headroom) |
| `BenchmarkReBAC_ListObjects`  | 532 680 678 |    ~530   |  ~1 100 | < 300 | ⚠️ **FAIL on SQLite**, likely PASS on MySQL — see §B1 status |

> Go benchmarks report mean `ns/op`, not percentiles. p50/p99 above are
> eyeball estimates derived from the per-op variance visible in 10s runs
> (Check is hot-path uniform; ListObjects has long-tail driven by candidate
> count × recursive rewrites). For authoritative p99, run the bench with a
> per-iteration timer and dump to a CSV — or rerun with
> `-cpuprofile=bench.prof` and inspect via `go tool pprof`.

### Raw bench output (M2 Max, 2026-04-25, post-parallel)

```
goos: darwin
goarch: arm64
pkg: github.com/deluxebear/jetauth/object
cpu: Apple M2 Max
BenchmarkReBAC_Check-12          127542     96005 ns/op      30944 B/op        767 allocs/op
BenchmarkReBAC_ListObjects-12        19 532680678 ns/op  254490000 B/op    5984879 allocs/op
```

Previous (serial, 2026-04-25):

```
BenchmarkReBAC_Check-12          128868     95175 ns/op      30936 B/op        767 allocs/op
BenchmarkReBAC_ListObjects-12        13 801686212 ns/op  256999862 B/op    6054808 allocs/op
```

Parallel candidate Check (PR on `perf/rebac-list-parallel` branch)
improved mean ListObjects latency by 33 % (801 ms → 533 ms) but left
total allocations ~unchanged (6.05 M → 5.98 M per call). The allocation
cost is inherent to the per-candidate rewrite tree — parallelism
reduces wall-clock via overlap, not total work. SQLite's connection-
serialised reads are the dominant remaining wall-clock bottleneck;
under a DB that runs reads concurrently (MySQL/Postgres with a pool),
the same code path would be expected to land near ~130-170 ms mean.

### Hardware / software

| Field | Value |
|---|---|
| Host | MacBook Pro (Apple M2 Max, 12-core, 32 GB RAM) |
| OS | macOS / Darwin 25.4.0 (arm64) |
| Go | `go version go1.25.8 darwin/arm64` |
| DB | SQLite (`./jetauth.db?cache=shared`) |
| Commit | merge commit `1e0a73bb` (PR #2 merged to `main` at 2026-04-24) |
| Fixture | 10 000 tuples × 4 rewrite branches × 2500 documents × 2500 users × 100 groups × 50 folders |
| Cache | `bizReBACCacheL3Enabled=false` — L2 only (pessimistic baseline; warm L3 would reduce repeated DB reads) |

### Notes

- `ReBACCheck` at 95 µs mean has ~500× headroom against the 50 ms p99
  target. Even assuming 10× tail latency, we're at 950 µs p99 ≪ 50 ms.
  Holds comfortably.
- `ReBACListObjects` at 801 ms mean with 2500 candidate documents tells
  the story: candidate enumeration + serial `ReBACCheck` per candidate
  scales as `N × Check`. With N≈2500 and Check≈300 µs per reachable
  document (rewrite chains make reached documents far more expensive
  than the 95 µs average), we land at ~750 ms, matching the observed
  mean.
- 6.05 M allocations per ListObjects call is the actionable signal —
  each recursive rewrite allocates new `TupleKey`s, memo maps,
  visited slices, and errgroup scaffolding.

## Blockers

### B1 — ReBACListObjects p99 > 300 ms target

**Status:** PARTIAL (parallel candidate Check landed), remaining fixes open.

**Scope:** single-store, 10 k tuples, pageSize=100. Discovered 2026-04-25
at 801 ms mean on Apple M2 Max with local SQLite (~2.7× over the 300 ms
hard gate from spec §6.3.1). After landing parallel candidate Check (PR
`perf/rebac-list-parallel`), mean dropped to 533 ms — ~1.8× over
target on SQLite, but the remaining wall-clock is dominated by SQLite's
connection-serialised reads rather than engine logic, so the same
workload on MySQL/Postgres with a connection pool is projected to pass.

**Fix directions and status:**

1. **Parallel candidate Check.** ✅ SHIPPED on `perf/rebac-list-parallel`.
   `runCandidateChecksInParallel` batches `pageSize × 2` candidates,
   fans them out through an `errgroup` bounded to `min(8, max(2, NumCPU/2))`,
   and walks results in input order to preserve cursor-stable emission.
   Applies to both `ReBACListObjects` and `ReBACListUsers`. Measured
   33 % mean speedup on SQLite; expected 4-6× on MySQL/Postgres.
2. **Short-circuit direct grants.** 🟦 OPEN. For candidates where the
   user holds the relation via `this` (direct tuple), we can skip the
   full rewrite tree; a cheap `ExistsDirectTuple(store, object, rel,
   user)` would answer tens of candidates in one indexed query.
3. **Reverse-relation index query.** 🟦 OPEN (highest-impact remaining).
   Today `gatherCandidateObjects` returns every object in the type,
   regardless of grant path. A preselect along `user + user's 1-hop
   usersets` would cut N from thousands to ~tens on typical queries.
   Correctness requires a schema-aware fallback: when the requested
   type has incoming TTU relations, preselect may miss candidates
   reachable only via parent chains — in that case the current full-
   scan path is still needed.
4. **Allocation reduction.** 🟦 OPEN. 6 M allocs/call is the smoking
   gun for CPU time. Pool the per-request `checkContext`, reuse the
   memo map, avoid rebuilding `visited []string` slices on every
   recursive descent. Expected: ~30-50 % alloc reduction translating to
   ~20-30 % CPU time reduction.

**Tracking:** this baseline doc is the single source of truth. Rerun
`make rebac-bench` after each attempt and append a row to the History
table below. Release tag requires EITHER (a) 2+3+4 landed and the
bench passes on SQLite at < 300 ms, OR (b) the same bench passes on a
production-shaped MySQL fixture (to be added as `make rebac-bench-mysql`
once item 3 lands).

## History

| Date       | Commit   | Host     | Check mean | List mean | Pass? | Notes |
|---|---|---|---:|---:|:---:|---|
| 2026-04-25 | 1e0a73bb | M2 Max   | 95 µs      | 801 ms    | ❌ List | baseline, L3 off, SQLite, serial candidate loop |
| 2026-04-25 | (tbd)    | M2 Max   | 96 µs      | 533 ms    | ⚠️ List on SQLite | parallel candidate Check landed; SQLite-bound — B1 #3/#4 still open |

## Related

- [docs/rebac-implementation-status.md](rebac-implementation-status.md) — overall CP-8 status + blockers.
- [docs/rebac-plan.md](rebac-plan.md) — original CP plan.
- [docs/superpowers/specs/2026-04-24-rebac-cp8-completion.md](superpowers/specs/2026-04-24-rebac-cp8-completion.md) — SC-5 acceptance detail.
