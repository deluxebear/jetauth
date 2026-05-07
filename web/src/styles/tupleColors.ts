// Per-type Tailwind color classes for ReBAC tuple chips and graph nodes.
// Each entry is the (object|user) type prefix as it appears in tuple
// strings (e.g. "user:alice", "document:r1"). Unknown types fall back
// to FALLBACK_TUPLE_COLOR.
export const KIND_COLORS: Record<string, string> = {
  user: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  group: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  folder: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  document: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  organization: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
  relation: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

export const FALLBACK_TUPLE_COLOR = "bg-surface-2 text-text-secondary";
