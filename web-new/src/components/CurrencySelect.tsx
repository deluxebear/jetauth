import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useTranslation } from "../i18n";

const CURRENCIES = [
  { code: "USD", flag: "\u{1F1FA}\u{1F1F8}", en: "US Dollar", zh: "美元" },
  { code: "CNY", flag: "\u{1F1E8}\u{1F1F3}", en: "Chinese Yuan", zh: "人民币" },
  { code: "EUR", flag: "\u{1F1EA}\u{1F1FA}", en: "Euro", zh: "欧元" },
  { code: "JPY", flag: "\u{1F1EF}\u{1F1F5}", en: "Japanese Yen", zh: "日元" },
  { code: "GBP", flag: "\u{1F1EC}\u{1F1E7}", en: "British Pound", zh: "英镑" },
  { code: "AUD", flag: "\u{1F1E6}\u{1F1FA}", en: "Australian Dollar", zh: "澳大利亚元" },
  { code: "CAD", flag: "\u{1F1E8}\u{1F1E6}", en: "Canadian Dollar", zh: "加拿大元" },
  { code: "CHF", flag: "\u{1F1E8}\u{1F1ED}", en: "Swiss Franc", zh: "瑞士法郎" },
  { code: "KRW", flag: "\u{1F1F0}\u{1F1F7}", en: "Korean Won", zh: "韩元" },
  { code: "SGD", flag: "\u{1F1F8}\u{1F1EC}", en: "Singapore Dollar", zh: "新加坡元" },
  { code: "HKD", flag: "\u{1F1ED}\u{1F1F0}", en: "Hong Kong Dollar", zh: "港币" },
  { code: "TWD", flag: "\u{1F1F9}\u{1F1FC}", en: "Taiwan Dollar", zh: "新台币" },
  { code: "INR", flag: "\u{1F1EE}\u{1F1F3}", en: "Indian Rupee", zh: "印度卢比" },
  { code: "RUB", flag: "\u{1F1F7}\u{1F1FA}", en: "Russian Ruble", zh: "俄罗斯卢布" },
  { code: "MYR", flag: "\u{1F1F2}\u{1F1FE}", en: "Malaysian Ringgit", zh: "马来西亚林吉特" },
  { code: "IDR", flag: "\u{1F1EE}\u{1F1E9}", en: "Indonesian Rupiah", zh: "印尼盾" },
  { code: "VND", flag: "\u{1F1FB}\u{1F1F3}", en: "Vietnamese Dong", zh: "越南盾" },
  { code: "THB", flag: "\u{1F1F9}\u{1F1ED}", en: "Thai Baht", zh: "泰铢" },
  { code: "TRY", flag: "\u{1F1F9}\u{1F1F7}", en: "Turkish Lira", zh: "土耳其里拉" },
  { code: "BRL", flag: "\u{1F1E7}\u{1F1F7}", en: "Brazilian Real", zh: "巴西雷亚尔" },
];

export default function CurrencySelect({ value, onChange, disabled }: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { t, locale } = useTranslation();
  const isZh = locale.startsWith("zh");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    };
    if (open) { document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler); }
  }, [open]);

  const current = CURRENCIES.find((c) => c.code === value);
  const filtered = CURRENCIES.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.code.toLowerCase().includes(s) || c.en.toLowerCase().includes(s) || c.zh.includes(s);
  });

  const label = current ? `${current.flag} ${isZh ? current.zh : current.en} (${current.code})` : value;

  if (disabled) {
    return (
      <div className="flex items-center rounded-lg border border-border bg-surface-2 px-2.5 py-2 min-h-[38px] opacity-50 cursor-not-allowed">
        <span className="text-[13px] text-text-primary flex-1">{label}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div onClick={() => { setOpen(!open); setSearch(""); }}
        className={`flex items-center rounded-lg border bg-surface-2 px-2.5 py-2 min-h-[38px] cursor-pointer transition-colors ${open ? "border-accent ring-1 ring-accent/30" : "border-border"}`}>
        {open ? (
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search" as any)}
            className="flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted" />
        ) : (
          <span className="text-[13px] text-text-primary flex-1">{label}</span>
        )}
        <ChevronDown size={14} className={`text-text-muted shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </div>
      {open && (
        <div className="absolute z-[60] mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-surface-1 py-1 shadow-lg">
          {filtered.map((c) => {
            const selected = c.code === value;
            return (
              <button key={c.code} type="button" onClick={() => { onChange(c.code); setOpen(false); setSearch(""); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors ${
                  selected ? "text-accent bg-accent/5 font-medium" : "text-text-primary hover:bg-surface-2"
                }`}>
                <span className="text-base leading-none">{c.flag}</span>
                <span className="flex-1">{isZh ? c.zh : c.en} ({c.code})</span>
                {selected && <Check size={14} className="text-accent shrink-0" />}
              </button>
            );
          })}
          {filtered.length === 0 && <div className="px-3 py-4 text-center text-[12px] text-text-muted">{t("common.noResults" as any)}</div>}
        </div>
      )}
    </div>
  );
}

export { CURRENCIES };
