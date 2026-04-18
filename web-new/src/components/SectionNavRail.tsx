import { useEffect, useState, type ReactNode } from "react";

type Item = {
  id: string;
  label: string;
  icon?: ReactNode;
};

type Props = {
  items: Item[];
  className?: string;
};

export default function SectionNavRail({ items, className = "" }: Props) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    if (items.length === 0) return;
    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => !!el);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          visible.sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          );
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
  };

  return (
    <nav
      className={`sticky top-4 w-[180px] shrink-0 self-start ${className}`}
      aria-label="Section navigation"
    >
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => handleClick(item.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium rounded-r-md border-l-2 transition-colors text-left ${
                  active
                    ? "text-accent bg-accent/10 border-accent"
                    : "text-text-muted hover:text-text-secondary border-transparent hover:bg-surface-2/60"
                }`}
              >
                {item.icon && (
                  <span className="shrink-0 flex items-center">
                    {item.icon}
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
