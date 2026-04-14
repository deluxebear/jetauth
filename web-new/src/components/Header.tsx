import { LogOut, ChevronDown, Sun, Moon, Globe, UserCircle } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "../i18n";
import { useTheme } from "../theme";

interface HeaderProps {
  user: { owner: string; name: string; displayName: string; avatar: string } | null;
  onLogout: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const { t, locale, setLocale, locales } = useTranslation();
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
      if (langRef.current && !langRef.current.contains(e.target as Node))
        setLangMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-end border-b border-border bg-surface-1/80 backdrop-blur-md px-6">
      <div className="flex items-center gap-1.5">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors"
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* Language switcher */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setLangMenuOpen(!langMenuOpen)}
            className="flex items-center gap-1 rounded-lg p-2 text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors"
          >
            <Globe size={17} />
            <span className="text-[11px] font-mono font-medium uppercase">
              {locale}
            </span>
          </button>
          {langMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-border bg-surface-2 py-1 shadow-[var(--shadow-elevated)]">
              {locales.map((l) => (
                <button
                  key={l.value}
                  onClick={() => {
                    setLocale(l.value);
                    setLangMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-[13px] transition-colors ${
                    locale === l.value
                      ? "text-accent bg-accent-subtle"
                      : "text-text-secondary hover:bg-surface-3"
                  }`}
                >
                  <span className="font-mono text-[11px] font-bold uppercase w-5">
                    {l.value}
                  </span>
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 rounded-lg py-1 px-2 hover:bg-surface-2 transition-colors"
          >
            {(() => {
              const avatarUrl = user?.avatar || (() => { try { return JSON.parse(localStorage.getItem("organizationData") ?? "null")?.defaultAvatar; } catch { return null; } })();
              return avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover border border-border shrink-0" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-accent to-cyan-300 flex items-center justify-center text-[11px] font-bold text-white">
                  {user?.displayName?.[0] ?? user?.name?.[0] ?? "?"}
                </div>
              );
            })()}
            <span className="text-[13px] font-medium text-text-primary max-w-[100px] truncate">
              {user?.displayName ?? user?.name ?? "User"}
            </span>
            <ChevronDown size={14} className="text-text-muted" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-surface-2 py-1 shadow-[var(--shadow-elevated)]">
              <div className="px-3 py-2 border-b border-border-subtle">
                <div className="text-[13px] font-medium text-text-primary">
                  {user?.displayName ?? user?.name}
                </div>
                <div className="text-[11px] text-text-muted font-mono">
                  {user?.name}
                </div>
              </div>
              <Link
                to={`/users/${user?.owner}/${user?.name}`}
                onClick={() => setUserMenuOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-text-secondary hover:bg-surface-3 transition-colors"
              >
                <UserCircle size={14} />
                {t("nav.myProfile" as any)}
              </Link>
              <button
                onClick={onLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-danger hover:bg-surface-3 transition-colors"
              >
                <LogOut size={14} />
                {t("common.signOut")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
