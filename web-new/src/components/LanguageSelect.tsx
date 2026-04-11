import { useState, useRef, useEffect, useCallback } from "react";

const LANGUAGES = [
  { code: "en", flag: "\u{1F1FA}\u{1F1F8}", en: "English", zh: "英语" },
  { code: "zh", flag: "\u{1F1E8}\u{1F1F3}", en: "Chinese", zh: "中文" },
];

export default function LanguageSelect({ selected, onChange }: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const locale = localStorage.getItem("locale") ?? "en";
  const isZh = locale.startsWith("zh");

  const toggle = (code: string) => {
    onChange(
      selected.includes(code)
        ? selected.filter((c) => c !== code)
        : [...selected, code]
    );
  };

  return (
    <div className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 space-y-1">
      {LANGUAGES.map((lang) => {
        const isSelected = selected.includes(lang.code);
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => toggle(lang.code)}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-left transition-colors ${
              isSelected ? "bg-accent/10 text-accent font-medium" : "text-text-primary hover:bg-surface-3"
            }`}
          >
            <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-[1.5px] transition-colors ${
              isSelected ? "border-accent bg-accent text-white" : "border-border bg-surface-1"
            }`}>
              {isSelected && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="text-base">{lang.flag}</span>
            <span>{isZh ? lang.zh : lang.en}</span>
            <span className="text-text-muted font-mono text-[11px] ml-auto">{lang.code}</span>
          </button>
        );
      })}
    </div>
  );
}
