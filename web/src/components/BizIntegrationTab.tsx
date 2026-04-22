import { useState } from "react";
import { Copy, Check as CheckIcon } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";

// BizIntegrationTab — Task 9. Static snippet gallery showing how to
// call the ReBAC endpoints from Go / TypeScript / Python. Snippets are
// template strings with `{{APP_ID}}` placeholders substituted from the
// current app's id. No network calls here — all examples are opaque
// strings; changing the schema won't break them.

interface Props {
  appId: string;
}

type Lang = "ts" | "go" | "py";

interface Snippet {
  title: string;
  code: string;
}

export default function BizIntegrationTab({ appId }: Props) {
  const { t } = useTranslation();
  const [lang, setLang] = useState<Lang>("ts");
  const snippets = buildSnippets(lang, appId);

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-1 p-1 self-start">
        {(["ts", "go", "py"] as Lang[]).map((l) => (
          <button
            key={l}
            type="button"
            className={`px-3 py-1 rounded text-[12px] font-medium ${
              lang === l
                ? "bg-accent-primary text-white"
                : "text-text-muted hover:text-text-primary"
            }`}
            onClick={() => setLang(l)}
          >
            {t(`rebac.integration.lang.${l}` as any)}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {snippets.map((s, i) => (
          <SnippetBlock key={i} snippet={s} t={t} />
        ))}
      </div>
    </div>
  );
}

function SnippetBlock({
  snippet,
  t,
}: {
  snippet: Snippet;
  t: (k: any) => string;
}) {
  const modal = useModal();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      setCopied(true);
      modal.toast(t("rebac.integration.copied"), "success");
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      modal.toast(err instanceof Error ? err.message : String(err), "error");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface-1">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-[12px] font-semibold text-text-primary">
          {snippet.title}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-text-muted hover:text-text-primary hover:bg-surface-2"
          onClick={() => void handleCopy()}
        >
          {copied ? (
            <CheckIcon className="w-3 h-3 text-success" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
          {copied ? t("rebac.integration.copied") : t("rebac.integration.copy")}
        </button>
      </div>
      <pre className="p-3 text-[12px] font-mono overflow-x-auto whitespace-pre text-text-primary">
        {snippet.code}
      </pre>
    </div>
  );
}

function buildSnippets(lang: Lang, appId: string): Snippet[] {
  const fn = SNIPPET_BUILDERS[lang];
  return fn(appId);
}

const SNIPPET_BUILDERS: Record<Lang, (appId: string) => Snippet[]> = {
  ts: (appId) => [
    {
      title: "Check — is user:alice a viewer of document:d1?",
      code: `const res = await fetch("/api/biz-check", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    appId: "${appId}",
    tupleKey: {
      object: "document:d1",
      relation: "viewer",
      user: "user:alice",
    },
  }),
});
const { data } = await res.json();
console.log(data.allowed);`,
    },
    {
      title: "Write — grant user:alice editor on document:d1",
      code: `await fetch("/api/biz-write-tuples", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    appId: "${appId}",
    writes: [
      { object: "document:d1", relation: "editor", user: "user:alice" },
    ],
  }),
});`,
    },
    {
      title: "Batch Check — 3 checks in one request",
      code: `const res = await fetch("/api/biz-batch-check", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    appId: "${appId}",
    checks: [
      { tupleKey: { object: "document:d1", relation: "viewer", user: "user:alice" } },
      { tupleKey: { object: "document:d1", relation: "editor", user: "user:alice" } },
      { tupleKey: { object: "document:d2", relation: "viewer", user: "user:alice" } },
    ],
  }),
});
const { data } = await res.json();
data.results.forEach((r, i) => console.log(i, r.allowed));`,
    },
    {
      title: "Contextual tuple — grant ephemeral access for this Check only",
      code: `await fetch("/api/biz-check", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    appId: "${appId}",
    tupleKey: { object: "document:d1", relation: "viewer", user: "user:alice" },
    contextualTuples: [
      { object: "document:d1", relation: "viewer", user: "user:alice" },
    ],
  }),
});`,
    },
  ],
  go: (appId) => [
    {
      title: "Check — is user:alice a viewer of document:d1?",
      code: `import (
    "bytes"
    "encoding/json"
    "net/http"
)

body, _ := json.Marshal(map[string]any{
    "appId": "${appId}",
    "tupleKey": map[string]string{
        "object":   "document:d1",
        "relation": "viewer",
        "user":     "user:alice",
    },
})
req, _ := http.NewRequest("POST", "/api/biz-check", bytes.NewReader(body))
req.Header.Set("Content-Type", "application/json")
// Attach session cookie via your auth layer.
resp, _ := http.DefaultClient.Do(req)
defer resp.Body.Close()`,
    },
    {
      title: "Write — grant user:alice editor on document:d1",
      code: `body, _ := json.Marshal(map[string]any{
    "appId": "${appId}",
    "writes": []map[string]string{
        {"object": "document:d1", "relation": "editor", "user": "user:alice"},
    },
})
http.Post("/api/biz-write-tuples", "application/json", bytes.NewReader(body))`,
    },
  ],
  py: (appId) => [
    {
      title: "Check — is user:alice a viewer of document:d1?",
      code: `import requests

r = requests.post(
    "/api/biz-check",
    json={
        "appId": "${appId}",
        "tupleKey": {
            "object": "document:d1",
            "relation": "viewer",
            "user": "user:alice",
        },
    },
    cookies={"session": "..."},
)
print(r.json()["data"]["allowed"])`,
    },
    {
      title: "Write — grant user:alice editor on document:d1",
      code: `requests.post(
    "/api/biz-write-tuples",
    json={
        "appId": "${appId}",
        "writes": [
            {"object": "document:d1", "relation": "editor", "user": "user:alice"},
        ],
    },
    cookies={"session": "..."},
)`,
    },
  ],
};
