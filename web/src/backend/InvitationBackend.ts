import { request, paginationQuery } from "./request";

export interface Invitation {
  owner: string;
  name: string;
  createdTime: string;
  updatedTime: string;
  displayName: string;
  code: string;
  defaultCode: string;
  quota: number;
  usedCount: number;
  application: string;
  username: string;
  email: string;
  phone: string;
  signupGroup: string;
  state: string;
  isCreatedByPlan: boolean;
  [key: string]: unknown;
}

export function getInvitations(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  const qs = paginationQuery(params);
  return request<Invitation[]>("GET", `/api/get-invitations?${qs}`);
}

export function getInvitation(owner: string, name: string) {
  return request<Invitation>(
    "GET",
    `/api/get-invitation?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addInvitation(invitation: Invitation) {
  return request("POST", "/api/add-invitation", invitation);
}

export function updateInvitation(owner: string, name: string, invitation: Invitation) {
  return request(
    "POST",
    `/api/update-invitation?id=${owner}/${encodeURIComponent(name)}`,
    invitation
  );
}

export function deleteInvitation(invitation: Invitation) {
  return request("POST", "/api/delete-invitation", invitation);
}

export function sendInvitation(invitation: Invitation, destinations: string[]) {
  return request(
    "POST",
    `/api/send-invitation?id=${invitation.owner}/${encodeURIComponent(invitation.name)}`,
    destinations
  );
}

export function newInvitation(orgName: string): Invitation {
  const rand = Math.random().toString(36).substring(2, 8);
  const code = Math.random().toString(36).slice(-10);
  return {
    owner: orgName,
    name: `invitation_${rand}`,
    createdTime: new Date().toISOString(),
    updatedTime: new Date().toISOString(),
    displayName: `New Invitation - ${rand}`,
    code,
    defaultCode: code,
    quota: 1,
    usedCount: 0,
    application: "All",
    username: "",
    email: "",
    phone: "",
    signupGroup: "",
    state: "Active",
    isCreatedByPlan: false,
  };
}
