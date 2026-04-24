// Scenario templates shown on the Overview empty state. Each template
// seeds a minimum-viable ReBAC app so the admin can go from "I just
// enabled ReBAC on this app" to "there's something to poke at in the
// Tester" in one click. Data-only — no React — so it's unit-testable
// and consumable from the DSL editor's "insert template" menu too.

import type { BizTupleKey } from "../backend/BizBackend";

export interface ReBACTemplate {
  id: string;
  /** i18n key suffix under rebac.templates.<i18nKey>.title / .subtitle */
  i18nKey: string;
  /** Lucide icon name; resolved by the caller so this module stays
   *  free of React/component imports. */
  icon: "FileText" | "Building2" | "Share2";
  dsl: string;
  sampleTuples: BizTupleKey[];
  /** One example Check the admin can run after applying. */
  sampleCheck: BizTupleKey;
}

export const REBAC_TEMPLATES: ReBACTemplate[] = [
  {
    id: "document-collab",
    i18nKey: "documentCollab",
    icon: "FileText",
    dsl: `model
  schema 1.1

type user

type folder
  relations
    define owner: [user]
    define viewer: [user] or owner

type document
  relations
    define parent: [folder]
    define owner: [user]
    define editor: [user] or owner
    define viewer: [user] or editor or viewer from parent
`,
    sampleTuples: [
      { object: "folder:legal", relation: "owner", user: "user:alice" },
      { object: "document:d1", relation: "parent", user: "folder:legal" },
      { object: "document:d1", relation: "editor", user: "user:bob" },
    ],
    sampleCheck: {
      object: "document:d1",
      relation: "viewer",
      user: "user:alice",
    },
  },
  {
    id: "team-saas",
    i18nKey: "teamSaas",
    icon: "Building2",
    dsl: `model
  schema 1.1

type user

type team
  relations
    define member: [user, team#member]
    define admin: [user]

type workspace
  relations
    define owner: [user]
    define member: [user, team#member] or owner
`,
    sampleTuples: [
      { object: "team:eng", relation: "admin", user: "user:alice" },
      { object: "team:eng", relation: "member", user: "user:bob" },
      {
        object: "workspace:prod",
        relation: "member",
        user: "team:eng#member",
      },
    ],
    sampleCheck: {
      object: "workspace:prod",
      relation: "member",
      user: "user:bob",
    },
  },
  {
    id: "resource-share",
    i18nKey: "resourceShare",
    icon: "Share2",
    dsl: `model
  schema 1.1

type user

type resource
  relations
    define owner: [user]
    define shared_with: [user, user:*]
    define viewer: [user] or shared_with or owner
`,
    sampleTuples: [
      { object: "resource:r1", relation: "owner", user: "user:alice" },
      { object: "resource:r1", relation: "shared_with", user: "user:*" },
    ],
    sampleCheck: {
      object: "resource:r1",
      relation: "viewer",
      user: "user:carol",
    },
  },
];

export function getTemplateById(id: string): ReBACTemplate | null {
  return REBAC_TEMPLATES.find((t) => t.id === id) ?? null;
}
