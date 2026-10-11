import { createContext, useContext } from "react";

export interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
  width: number;
  /** Whether the sidebar has any nav items to show */
  visible: boolean;
  setVisible: (v: boolean) => void;
}

export const SidebarContext = createContext<SidebarContextType>(null!);

export function useSidebar() {
  return useContext(SidebarContext);
}
