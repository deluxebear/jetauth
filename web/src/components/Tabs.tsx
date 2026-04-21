import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";

interface Tab {
  key: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  /** Controlled active tab — when provided, internal state is ignored */
  activeTab?: string;
  /** Callback when tab changes (for controlled mode) */
  onTabChange?: (key: string) => void;
  /** Hide the built-in tab bar (use with controlled mode + external TabBar) */
  hideTabBar?: boolean;
}

export default function Tabs({ tabs, defaultTab, activeTab: controlledTab, onTabChange, hideTabBar }: TabsProps) {
  const [internalActive, setInternalActive] = useState(defaultTab ?? tabs[0]?.key ?? "");
  const active = controlledTab ?? internalActive;
  const setActive = (key: string) => {
    if (onTabChange) onTabChange(key);
    else setInternalActive(key);
  };

  return (
    <div>
      {!hideTabBar && (
        <div className="flex border-b border-border gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-colors ${
                active === tab.key
                  ? "text-accent"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {tab.icon}
              {tab.label}
              {active === tab.key && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent rounded-t-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      )}
      <div className={hideTabBar ? "" : "pt-5"}>
        {tabs.find((t) => t.key === active)?.content}
      </div>
    </div>
  );
}

/** Tab bar only — for use inside StickyEditHeader's `tabs` prop. Pair with controlled `Tabs`. */
export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string; icon?: ReactNode }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex border-b border-border -mb-px gap-0.5">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`relative flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-colors ${
            active === tab.key
              ? "text-accent"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          {tab.icon}
          {tab.label}
          {active === tab.key && (
            <motion.div
              layoutId="tab-indicator-sticky"
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent rounded-t-full"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}
