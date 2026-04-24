// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import "testing"

// Exhaustive 9-way table drives the invariant: union is MAX, intersect
// is MIN over the lattice {denied < cycle < allowed}. Difference uses
// a different rule — see TestCycleState_DiffTable.
func TestCycleState_UnionTable(t *testing.T) {
	cases := []struct {
		a, b, want checkState
	}{
		{StateDenied, StateDenied, StateDenied},
		{StateDenied, StateCycle, StateCycle},
		{StateDenied, StateAllowed, StateAllowed},
		{StateCycle, StateDenied, StateCycle},
		{StateCycle, StateCycle, StateCycle},
		{StateCycle, StateAllowed, StateAllowed},
		{StateAllowed, StateDenied, StateAllowed},
		{StateAllowed, StateCycle, StateAllowed},
		{StateAllowed, StateAllowed, StateAllowed},
	}
	for _, c := range cases {
		if got := unionState(c.a, c.b); got != c.want {
			t.Errorf("union(%v,%v)=%v want %v", c.a, c.b, got, c.want)
		}
	}
}

func TestCycleState_IntersectTable(t *testing.T) {
	cases := []struct {
		a, b, want checkState
	}{
		{StateDenied, StateDenied, StateDenied},
		{StateDenied, StateCycle, StateDenied},
		{StateDenied, StateAllowed, StateDenied},
		{StateCycle, StateDenied, StateDenied},
		{StateCycle, StateCycle, StateCycle},
		{StateCycle, StateAllowed, StateCycle},
		{StateAllowed, StateDenied, StateDenied},
		{StateAllowed, StateCycle, StateCycle},
		{StateAllowed, StateAllowed, StateAllowed},
	}
	for _, c := range cases {
		if got := intersectState(c.a, c.b); got != c.want {
			t.Errorf("intersect(%v,%v)=%v want %v", c.a, c.b, got, c.want)
		}
	}
}

// diffState = "a AND NOT b". Key insight: if b is cycle we can't prove NOT b,
// so the whole expression is cycle (conservative). If a is cycle but b is
// definitely allowed, the diff is definitely denied (cycle AND NOT allowed).
func TestCycleState_DiffTable(t *testing.T) {
	cases := []struct {
		a, b, want checkState
	}{
		// a=denied → diff=denied regardless of b
		{StateDenied, StateDenied, StateDenied},
		{StateDenied, StateCycle, StateDenied},
		{StateDenied, StateAllowed, StateDenied},
		// b=allowed (NOT b = false) → diff=denied regardless of a
		{StateCycle, StateAllowed, StateDenied},
		{StateAllowed, StateAllowed, StateDenied},
		// a=cycle AND b=denied/cycle → can't prove true → cycle
		{StateCycle, StateDenied, StateCycle},
		{StateCycle, StateCycle, StateCycle},
		// a=allowed AND b=cycle → a proven true but b indeterminate → cycle
		{StateAllowed, StateCycle, StateCycle},
		// a=allowed AND b=denied → diff=allowed
		{StateAllowed, StateDenied, StateAllowed},
	}
	for _, c := range cases {
		if got := diffState(c.a, c.b); got != c.want {
			t.Errorf("diff(%v,%v)=%v want %v (a AND NOT b)", c.a, c.b, got, c.want)
		}
	}
}

// Key scenario that motivated this module: OpenFGA's
// true_butnot_cycle_return_false test. A legal schema has "base: this"
// and "subtract: this with a cycle". Check returns cycle-in-subtract.
// Before ternary: subtract→false, diff=true→deny=missed (returns true).
// With ternary: subtract→cycle, diff(true, cycle)=cycle → top-level
// conservative deny.
func TestCycleState_TrueButNotCycle(t *testing.T) {
	if got := diffState(StateAllowed, StateCycle); got != StateCycle {
		t.Fatalf("diff(true, cycle) must be cycle (conservative), got %v", got)
	}
}
