import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Deep-link hash anchors (#section) used by list pages to scroll the
// detail page to a specific section after entity data has loaded.
// `ready` gates the scroll so we don't query the DOM before the target
// node is mounted — typically `role?.id` / `perm?.id` / similar sentinel.
export function useHashScroll(ready: unknown) {
  const location = useLocation();
  useEffect(() => {
    if (!location.hash || !ready) return;
    const id = location.hash.slice(1);
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(raf);
  }, [location.hash, ready]);
}
