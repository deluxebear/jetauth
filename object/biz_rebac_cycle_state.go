// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// biz_rebac_cycle_state.go introduces the ternary Check evaluation state
// needed to correctly handle cycles inside `difference` subtract branches.
//
// Background: before CP-8 C7, Check returned (bool, error) and treated a
// visited-path cycle as (false, nil). That's correct for union/intersect
// (a cycle IS a miss locally) but wrong inside the subtract branch of a
// difference: if `base(true) - subtract(cycle)` treats cycle as false,
// the whole diff returns true — missing the OpenFGA-consensus conservative
// deny. See OpenFGA's consolidated test `true_butnot_cycle_return_false`.
//
// The fix is to widen Check's return to 3 states: StateAllowed, StateDenied,
// StateCycle. Top-level ReBACCheck converts StateCycle → Allowed=false (same
// as before externally). Internal evaluators propagate state and combine it
// with the lattice-aware operators below. See spec §11.2 and CP-8 C7.

package object

// checkState is the ternary result of evaluating a rewrite node:
//   - StateDenied: provably no path from user to object#relation
//   - StateAllowed: provably a path exists
//   - StateCycle: couldn't prove either; a cycle was encountered during
//     resolution. Callers higher in the tree decide whether cycle is
//     conservative-deny (top level, or subtract branch of difference) or
//     "pending" (union / intersection still proceed to other branches).
type checkState int

const (
	// StateDenied means the check provably fails from this rewrite node.
	StateDenied checkState = iota
	// StateCycle means resolution hit a cycle before a definite answer.
	// Lattice role:
	//   - Union: allowed beats cycle beats denied (an upper-bound op; allowed
	//     wins outright, but a pending cycle beats a definite deny elsewhere).
	//   - Intersection: denied is absorbing (denied beats cycle beats allowed).
	//   - Difference: cycle in either operand usually propagates — see diffState.
	StateCycle
	// StateAllowed means the check provably succeeds from this node.
	StateAllowed
)

// unionState implements OR over the lattice {denied < cycle < allowed}.
// Allowed wins outright; otherwise cycle dominates; otherwise denied.
func unionState(a, b checkState) checkState {
	if a == StateAllowed || b == StateAllowed {
		return StateAllowed
	}
	if a == StateCycle || b == StateCycle {
		return StateCycle
	}
	return StateDenied
}

// intersectState implements AND over the same lattice. Denied short-circuits;
// otherwise cycle dominates; otherwise allowed.
func intersectState(a, b checkState) checkState {
	if a == StateDenied || b == StateDenied {
		return StateDenied
	}
	if a == StateCycle || b == StateCycle {
		return StateCycle
	}
	return StateAllowed
}

// String implements fmt.Stringer so test failure messages and logs show
// human-readable names (allowed/denied/cycle) instead of raw iota ints.
func (s checkState) String() string {
	switch s {
	case StateAllowed:
		return "allowed"
	case StateDenied:
		return "denied"
	case StateCycle:
		return "cycle"
	}
	return "unknown"
}

// diffState implements "a AND NOT b".
//   - a=denied        → diff=denied (base fails)
//   - b=allowed       → diff=denied (subtract forbids)
//   - a=cycle and b proven false → can't prove a is true → cycle
//   - a=allowed and b=cycle      → can't prove NOT b → cycle
//   - a=allowed and b=denied     → diff=allowed
//
// The cycle-in-subtract case is exactly what OpenFGA's
// `true_butnot_cycle_return_false` test exercises.
func diffState(a, b checkState) checkState {
	if a == StateDenied {
		return StateDenied
	}
	if b == StateAllowed {
		return StateDenied
	}
	if a == StateCycle || b == StateCycle {
		return StateCycle
	}
	// a=allowed, b=denied
	return StateAllowed
}
