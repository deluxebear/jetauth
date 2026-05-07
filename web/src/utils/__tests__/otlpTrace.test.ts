import { describe, it, expect } from "vitest";
import {
  parseOtlpTrace, formatDuration, formatOtlpTimestamp, unwrapAnyValue,
} from "../otlpTrace";

// Builds a representative OTLP/protojson payload mirroring the shape that
// controllers/entry_opentelemetry.go writes via protojson.Marshal — string
// nanoseconds, base64 trace/span IDs, AnyValue-wrapped attributes.
function makeFixture() {
  return JSON.stringify({
    resourceSpans: [{
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: "claude-agent" } },
          { key: "service.version", value: { stringValue: "1.0.0" } },
        ],
      },
      scopeSpans: [{
        scope: { name: "openclaw", version: "0.1" },
        spans: [
          {
            traceId: "AAAA",
            spanId: "ROOT",
            parentSpanId: "",
            name: "agent.task",
            kind: "SPAN_KIND_INTERNAL",
            startTimeUnixNano: "1735000000000000000",
            endTimeUnixNano: "1735000001500000000", // 1.5s
            attributes: [
              { key: "agent.id", value: { stringValue: "main" } },
              { key: "tokens", value: { intValue: "1250" } },
            ],
            status: { code: "STATUS_CODE_OK" },
            events: [
              {
                name: "model.start",
                timeUnixNano: "1735000000200000000", // +200ms
                attributes: [
                  { key: "model", value: { stringValue: "claude-opus-4-7" } },
                ],
              },
            ],
          },
          {
            traceId: "AAAA",
            spanId: "CHILD1",
            parentSpanId: "ROOT",
            name: "tool.search",
            kind: "SPAN_KIND_CLIENT",
            startTimeUnixNano: "1735000000300000000", // +300ms
            endTimeUnixNano: "1735000000800000000",   // 500ms
            attributes: [],
            status: { code: "STATUS_CODE_OK" },
          },
          {
            traceId: "AAAA",
            spanId: "CHILD2",
            parentSpanId: "ROOT",
            name: "tool.fetch",
            kind: "SPAN_KIND_CLIENT",
            startTimeUnixNano: "1735000000900000000",
            endTimeUnixNano: "1735000001100000000",
            attributes: [],
            status: { code: "STATUS_CODE_ERROR", message: "timeout" },
          },
        ],
      }],
    }],
  });
}

describe("parseOtlpTrace", () => {
  it("returns null for empty / malformed input", () => {
    expect(parseOtlpTrace("")).toBeNull();
    expect(parseOtlpTrace("not-json")).toBeNull();
    expect(parseOtlpTrace("{}")).toBeNull();
    expect(parseOtlpTrace(JSON.stringify({ resourceSpans: [] }))).toBeNull();
  });

  it("extracts every span with correct timing and metadata", () => {
    const trace = parseOtlpTrace(makeFixture());
    expect(trace).not.toBeNull();
    expect(trace!.spans).toHaveLength(3);
    expect(trace!.serviceNames).toEqual(["claude-agent"]);

    const root = trace!.spans.find((s) => s.spanId === "ROOT")!;
    expect(root.name).toBe("agent.task");
    expect(root.kind).toBe("INTERNAL");
    expect(root.status).toBe("OK");
    expect(root.serviceName).toBe("claude-agent");
    expect(root.scopeName).toBe("openclaw");
    expect(root.durationMs).toBeCloseTo(1500);
    expect(root.attributes).toEqual([
      { key: "agent.id", value: "main", raw: "main" },
      { key: "tokens", value: "1250", raw: "1250" },
    ]);
    expect(root.events).toHaveLength(1);
    expect(root.events[0].offsetMs).toBeCloseTo(200);
  });

  it("builds the parent-child tree by parentSpanId", () => {
    const trace = parseOtlpTrace(makeFixture())!;
    expect(trace.roots.map((r) => r.spanId)).toEqual(["ROOT"]);
    const rootChildren = trace.childrenOf.get("ROOT")!;
    expect(rootChildren.map((c) => c.spanId)).toEqual(["CHILD1", "CHILD2"]); // sorted by start
  });

  it("computes trace bounds + counts errors", () => {
    const trace = parseOtlpTrace(makeFixture())!;
    expect(trace.startNano).toBe(1735000000000000000n);
    expect(trace.endNano).toBe(1735000001500000000n);
    expect(trace.durationMs).toBeCloseTo(1500);
    expect(trace.errorCount).toBe(1);
  });

  it("treats spans with missing parents as roots (multi-trace payload)", () => {
    const payload = JSON.stringify({
      resourceSpans: [{
        resource: { attributes: [] },
        scopeSpans: [{
          spans: [
            { spanId: "A", parentSpanId: "MISSING", name: "a", startTimeUnixNano: "1000000000", endTimeUnixNano: "2000000000", status: { code: "STATUS_CODE_OK" } },
            { spanId: "B", parentSpanId: "", name: "b", startTimeUnixNano: "3000000000", endTimeUnixNano: "4000000000", status: { code: "STATUS_CODE_OK" } },
          ],
        }],
      }],
    });
    const trace = parseOtlpTrace(payload)!;
    expect(trace.roots).toHaveLength(2);
  });
});

describe("unwrapAnyValue", () => {
  it("handles every AnyValue variant", () => {
    expect(unwrapAnyValue({ stringValue: "hi" }).display).toBe("hi");
    expect(unwrapAnyValue({ intValue: "42" }).display).toBe("42");
    expect(unwrapAnyValue({ doubleValue: 3.14 }).display).toBe("3.14");
    expect(unwrapAnyValue({ boolValue: true }).display).toBe("true");
    expect(unwrapAnyValue({ arrayValue: { values: [{ stringValue: "a" }, { intValue: "1" }] } }).display).toBe("[a, 1]");
    expect(unwrapAnyValue({ kvlistValue: { values: [{ key: "k", value: { stringValue: "v" } }] } }).display).toBe("{k=v}");
  });
});

describe("formatDuration", () => {
  it("scales units appropriately", () => {
    expect(formatDuration(0)).toBe("0");
    expect(formatDuration(0.42)).toBe("420µs");
    expect(formatDuration(5.5)).toBe("5.50ms");
    expect(formatDuration(123.4)).toBe("123.4ms");
    expect(formatDuration(1234.5)).toBe("1.23s");
    expect(formatDuration(75_000)).toBe("1.25min");
  });
});

describe("formatOtlpTimestamp", () => {
  it("converts nano-int64 to ISO timestamp", () => {
    const nano = 1735000000000000000n;
    const out = formatOtlpTimestamp(nano);
    // 1735000000000000000ns = 1735000000000ms = Dec 24 2024 00:26:40 UTC
    expect(out).toBe("2024-12-24T00:26:40.000Z");
  });
  it("returns empty string for zero", () => {
    expect(formatOtlpTimestamp(0n)).toBe("");
  });
});
