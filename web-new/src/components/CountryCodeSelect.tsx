import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";

export const COUNTRIES = [
  { code: "US", phone: "+1", flag: "\u{1F1FA}\u{1F1F8}", en: "United States", zh: "美国" },
  { code: "CN", phone: "+86", flag: "\u{1F1E8}\u{1F1F3}", en: "China", zh: "中国" },
  { code: "JP", phone: "+81", flag: "\u{1F1EF}\u{1F1F5}", en: "Japan", zh: "日本" },
  { code: "KR", phone: "+82", flag: "\u{1F1F0}\u{1F1F7}", en: "South Korea", zh: "韩国" },
  { code: "GB", phone: "+44", flag: "\u{1F1EC}\u{1F1E7}", en: "United Kingdom", zh: "英国" },
  { code: "FR", phone: "+33", flag: "\u{1F1EB}\u{1F1F7}", en: "France", zh: "法国" },
  { code: "DE", phone: "+49", flag: "\u{1F1E9}\u{1F1EA}", en: "Germany", zh: "德国" },
  { code: "ES", phone: "+34", flag: "\u{1F1EA}\u{1F1F8}", en: "Spain", zh: "西班牙" },
  { code: "IN", phone: "+91", flag: "\u{1F1EE}\u{1F1F3}", en: "India", zh: "印度" },
  { code: "AU", phone: "+61", flag: "\u{1F1E6}\u{1F1FA}", en: "Australia", zh: "澳大利亚" },
  { code: "CA", phone: "+1", flag: "\u{1F1E8}\u{1F1E6}", en: "Canada", zh: "加拿大" },
  { code: "BR", phone: "+55", flag: "\u{1F1E7}\u{1F1F7}", en: "Brazil", zh: "巴西" },
  { code: "RU", phone: "+7", flag: "\u{1F1F7}\u{1F1FA}", en: "Russia", zh: "俄罗斯" },
  { code: "SG", phone: "+65", flag: "\u{1F1F8}\u{1F1EC}", en: "Singapore", zh: "新加坡" },
  { code: "MY", phone: "+60", flag: "\u{1F1F2}\u{1F1FE}", en: "Malaysia", zh: "马来西亚" },
  { code: "ID", phone: "+62", flag: "\u{1F1EE}\u{1F1E9}", en: "Indonesia", zh: "印尼" },
  { code: "VN", phone: "+84", flag: "\u{1F1FB}\u{1F1F3}", en: "Vietnam", zh: "越南" },
  { code: "TH", phone: "+66", flag: "\u{1F1F9}\u{1F1ED}", en: "Thailand", zh: "泰国" },
  { code: "PH", phone: "+63", flag: "\u{1F1F5}\u{1F1ED}", en: "Philippines", zh: "菲律宾" },
  { code: "HK", phone: "+852", flag: "\u{1F1ED}\u{1F1F0}", en: "Hong Kong", zh: "中国香港" },
  { code: "TW", phone: "+886", flag: "\u{1F1F9}\u{1F1FC}", en: "Taiwan", zh: "中国台湾" },
  { code: "IT", phone: "+39", flag: "\u{1F1EE}\u{1F1F9}", en: "Italy", zh: "意大利" },
  { code: "NL", phone: "+31", flag: "\u{1F1F3}\u{1F1F1}", en: "Netherlands", zh: "荷兰" },
  { code: "SE", phone: "+46", flag: "\u{1F1F8}\u{1F1EA}", en: "Sweden", zh: "瑞典" },
  { code: "CH", phone: "+41", flag: "\u{1F1E8}\u{1F1ED}", en: "Switzerland", zh: "瑞士" },
  { code: "NZ", phone: "+64", flag: "\u{1F1F3}\u{1F1FF}", en: "New Zealand", zh: "新西兰" },
  { code: "MX", phone: "+52", flag: "\u{1F1F2}\u{1F1FD}", en: "Mexico", zh: "墨西哥" },
  { code: "TR", phone: "+90", flag: "\u{1F1F9}\u{1F1F7}", en: "Turkey", zh: "土耳其" },
  { code: "SA", phone: "+966", flag: "\u{1F1F8}\u{1F1E6}", en: "Saudi Arabia", zh: "沙特阿拉伯" },
  { code: "AE", phone: "+971", flag: "\u{1F1E6}\u{1F1EA}", en: "UAE", zh: "阿联酋" },
  { code: "PK", phone: "+92", flag: "\u{1F1F5}\u{1F1F0}", en: "Pakistan", zh: "巴基斯坦" },
  { code: "BD", phone: "+880", flag: "\u{1F1E7}\u{1F1E9}", en: "Bangladesh", zh: "孟加拉国" },
  { code: "NG", phone: "+234", flag: "\u{1F1F3}\u{1F1EC}", en: "Nigeria", zh: "尼日利亚" },
  { code: "EG", phone: "+20", flag: "\u{1F1EA}\u{1F1EC}", en: "Egypt", zh: "埃及" },
  { code: "ZA", phone: "+27", flag: "\u{1F1FF}\u{1F1E6}", en: "South Africa", zh: "南非" },
  { code: "KE", phone: "+254", flag: "\u{1F1F0}\u{1F1EA}", en: "Kenya", zh: "肯尼亚" },
  { code: "UA", phone: "+380", flag: "\u{1F1FA}\u{1F1E6}", en: "Ukraine", zh: "乌克兰" },
  { code: "PL", phone: "+48", flag: "\u{1F1F5}\u{1F1F1}", en: "Poland", zh: "波兰" },
  { code: "AR", phone: "+54", flag: "\u{1F1E6}\u{1F1F7}", en: "Argentina", zh: "阿根廷" },
  { code: "CL", phone: "+56", flag: "\u{1F1E8}\u{1F1F1}", en: "Chile", zh: "智利" },
  { code: "CO", phone: "+57", flag: "\u{1F1E8}\u{1F1F4}", en: "Colombia", zh: "哥伦比亚" },
  { code: "IL", phone: "+972", flag: "\u{1F1EE}\u{1F1F1}", en: "Israel", zh: "以色列" },
  { code: "PT", phone: "+351", flag: "\u{1F1F5}\u{1F1F9}", en: "Portugal", zh: "葡萄牙" },
  { code: "AT", phone: "+43", flag: "\u{1F1E6}\u{1F1F9}", en: "Austria", zh: "奥地利" },
  { code: "NO", phone: "+47", flag: "\u{1F1F3}\u{1F1F4}", en: "Norway", zh: "挪威" },
  { code: "DK", phone: "+45", flag: "\u{1F1E9}\u{1F1F0}", en: "Denmark", zh: "丹麦" },
  { code: "FI", phone: "+358", flag: "\u{1F1EB}\u{1F1EE}", en: "Finland", zh: "芬兰" },
  { code: "IE", phone: "+353", flag: "\u{1F1EE}\u{1F1EA}", en: "Ireland", zh: "爱尔兰" },
];

export default function CountryCodeSelect({ selected, onChange }: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const locale = localStorage.getItem("locale") ?? navigator.language ?? "en";
  const isZh = locale.toLowerCase().startsWith("zh");

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

  const filtered = COUNTRIES.filter((c) => {
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
                placeholder={isZh ? "搜索国家..." : "Search countries..."}
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
                {isZh ? "无匹配结果" : "No matches"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
