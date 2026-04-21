export type EmailPreset = {
  key: string;
  name: string;
  endpointExample: string;
  method: string;
  contentType: string;
  httpHeaders: Record<string, string>;
  bodyTemplate: string;
  docs: string;
};

export async function fetchEmailPresets(): Promise<EmailPreset[]> {
  const resp = await fetch("/api/get-http-email-presets", { credentials: "include" });
  if (!resp.ok) throw new Error(`presets fetch failed: ${resp.status}`);
  const json = await resp.json();
  return (json.data ?? json) as EmailPreset[];
}
