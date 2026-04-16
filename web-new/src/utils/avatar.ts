const AVATAR_COLORS = [
  "from-indigo-500 to-purple-500",
  "from-cyan-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-emerald-500 to-green-500",
  "from-blue-500 to-sky-500",
];

export function getInitial(s: string): string {
  const name = s.includes("/") ? s.split("/")[1] : s;
  return name.charAt(0).toUpperCase();
}

export function getAvatarColor(s: string): string {
  return AVATAR_COLORS[
    Math.abs([...s].reduce((h, c) => (h << 5) - h + c.charCodeAt(0), 0)) % AVATAR_COLORS.length
  ];
}

/** Returns true if the avatar URL is a real uploaded image (not the default placeholder). */
export function hasRealAvatar(avatar?: string): boolean {
  return !!avatar && avatar !== "/img/avatar.png" && avatar !== "";
}
