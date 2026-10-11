import { useState, type ReactNode } from "react";
import { SidebarContext } from "./SidebarContext";

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [visible, setVisible] = useState(true);
  const width = visible ? (collapsed ? 64 : 240) : 0;
  const toggle = () => setCollapsed((c) => !c);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle, width, visible, setVisible }}>
      {children}
    </SidebarContext.Provider>
  );
}
