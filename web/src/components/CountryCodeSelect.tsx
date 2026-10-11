import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "../i18n";
import { COUNTRIES, getCountriesByLocale } from "./countries";

export default function CountryCodeSelect({ selected, onChange }: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const { t, locale } = useTranslation();
  const isZh = locale.startsWith("zh");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [open]);

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) { setOpen(false); return; }
    setDropStyle({
      position: "fixed" as const,
      left: rect.left,
      width: rect.width,
      top: rect.bottom + 4,
      maxHeight: Math.min(350, window.innerHeight - rect.bottom - 16),
    });
  }, []);

  useEffect(() => {
    if (open) {
      updatePos();
      window.addEventListener("scroll", updatePos, true);
      window.addEventListener("resize", updatePos);
      return () => {
        window.removeEventListener("scroll", updatePos, true);
        window.removeEventListener("resize", updatePos);
      };
    }
  }, [open, updatePos]);

  const toggle = (code: string) => {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  };

  const getShortLabel = (code: string) => {
    const c = COUNTRIES.find((c) => c.code === code);
    return c ? `${c.flag} ${isZh ? c.zh : c.en}${c.phone}` : code;
  };

  const countries = getCountriesByLocale(locale);
  const filtered = countries.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.code.toLowerCase().includes(s) || c.en.toLowerCase().includes(s) || c.zh.includes(s) || c.phone.includes(s);
  });

  return (
    <div ref={ref}>
      <div
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={`flex flex-wrap gap-1.5 rounded-lg border bg-surface-2 px-2.5 py-2 min-h-[38px] cursor-pointer transition-colors ${
          open ? "border-accent ring-1 ring-accent/30" : "border-border"
        }`}
      >
        {selected.length === 0 && <span className="text-[12px] text-text-muted py-0.5">—</span>}
        {selected.map((code) => (
          <span key={code} className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/20 px-2 py-0.5 text-[11px] font-medium text-accent">
            {getShortLabel(code)}
            <button onClick={(e) => { e.stopPropagation(); toggle(code); }} className="hover:text-danger transition-colors text-[10px] ml-0.5">×</button>
          </span>
        ))}
      </div>

      {open && (
        <div style={dropStyle} className="z-[60] rounded-lg border border-border bg-surface-1 shadow-[var(--shadow-elevated)] overflow-hidden flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-border-subtle">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("common.searchCountry")}
                autoFocus
                className="w-full rounded border border-border bg-surface-2 pl-8 pr-2 py-1.5 text-[12px] text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
          {/* List */}
          <div className="overflow-y-auto flex-1">
            {filtered.map((c) => {
              const isSelected = selected.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => toggle(c.code)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors ${
                    isSelected ? "bg-accent/10 text-accent" : "text-text-primary hover:bg-surface-2"
                  }`}
                >
                  <span className="text-base">{c.flag}</span>
                  <span className="flex-1">{isZh ? c.zh : c.en}</span>
                  <span className="text-text-muted font-mono text-[11px]">{c.phone}</span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-[12px] text-text-muted text-center">
                {t("common.noResults")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
