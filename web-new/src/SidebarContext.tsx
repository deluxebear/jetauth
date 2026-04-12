import { createContext, useContext, useState, type ReactNode } from "react";

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
  width: number;
  /** Whether the sidebar has any nav items to show */
  visible: boolean;
  setVisible: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>(null!);

export function useSidebar() {
  return useContext(SidebarContext);
}

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
