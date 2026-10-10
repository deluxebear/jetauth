// Small Casbin model (.CONF) parser used to make forms model-aware.

export type ModelSections = Record<string, Record<string, string>>;

export interface ModelSupport {
  /** model declares a [role_definition]: Roles are honoured */
  hasRole: boolean;
  /** a role definition with 3 arguments (g = _, _, _): Domains are honoured */
  hasDomain: boolean;
}

/** The built-in model used by the backend when a permission leaves Model empty. */
export const DEFAULT_PERMISSION_MODEL = `[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act, eft, "", permissionId

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act`;

/** Parses "[section]\nkey = value" text; ignores blank lines and # comments; supports "\" continuation. */
export function parseCasbinModel(text: string): ModelSections {
  const sections: ModelSections = {};
  let current = "";
  let pendingKey = "";
  for (const raw of (text || "").split(/\r?\n/)) {
    let line = raw.trim();
    if (pendingKey) {
      sections[current][pendingKey] += " " + line.replace(/\\$/, "").trim();
      if (!line.endsWith("\\")) pendingKey = "";
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      current = header[1].trim();
      sections[current] = sections[current] || {};
      continue;
    }
    if (!current) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const continued = line.endsWith("\\");
    if (continued) line = line.slice(0, -1);
    sections[current][key] = line.slice(eq + 1).trim();
    if (continued) pendingKey = key;
  }
  return sections;
}

/** Which permission fields the model can use. Empty text means the built-in default model. */
export function getModelSupport(text: string): ModelSupport {
  const sections = parseCasbinModel(text.trim() ? text : DEFAULT_PERMISSION_MODEL);
  const roleDef = sections["role_definition"] || {};
  const gKeys = Object.keys(roleDef).filter((k) => /^g\d*$/.test(k));
  return {
    hasRole: gKeys.length > 0,
    hasDomain: gKeys.some((k) => roleDef[k].split(",").length >= 3),
  };
}
