import { createContext, useContext } from "react";

export interface OrgOption {
  name: string;
  displayName: string;
}

export interface OrganizationContextType {
  /** Currently selected org name, or "All" */
  selectedOrg: string;
  setSelectedOrg: (org: string) => void;
  /** Organization list for dropdown */
  orgOptions: OrgOption[];
  /** The owner param to pass to list APIs: returns "" when "All", otherwise the org name */
  getRequestOwner: () => string;
  /** The owner to use when creating new entities: returns "built-in" when "All", otherwise the org name */
  getNewEntityOwner: () => string;
  /** Refresh the organization options dropdown */
  refreshOrgOptions: () => void;
  /** Whether "All" is selected */
  isAll: boolean;
  /** Whether the current user is a global admin (built-in org) */
  isGlobalAdmin: boolean;
}

export const OrganizationContext = createContext<OrganizationContextType>(null!);

export function useOrganization() {
  return useContext(OrganizationContext);
}
