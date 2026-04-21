// W6 a11y: register vitest-axe matchers (toHaveNoViolations).
import * as matchers from "vitest-axe/matchers";
import { expect } from "vitest";

expect.extend(matchers);

// Vitest 4.x moved custom-matcher augmentation from `namespace Vi` to
// the `Matchers` interface in @vitest/expect. vitest-axe still targets
// the old namespace, so we re-declare the matcher here to keep tsc happy.
declare module "@vitest/expect" {
  // Type params must match @vitest/expect's own declaration.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Matchers<T = any> {
    toHaveNoViolations(): T;
  }
}
