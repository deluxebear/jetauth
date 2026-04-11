import { request, paginationQuery } from "./request";

export interface TicketMessage {
  author: string;
  text: string;
  timestamp: string;
  isAdmin: boolean;
}

export interface Ticket {
  owner: string;
  name: string;
  createdTime: string;
  updatedTime: string;
  displayName: string;
  user: string;
  title: string;
  content: string;
  state: string;
  messages: TicketMessage[];
  [key: string]: unknown;
}

export function getTickets(params: {
  owner: string;
  p?: number;
  pageSize?: number;
  field?: string;
  value?: string;
  sortField?: string;
  sortOrder?: string;
}) {
  return request<Ticket[]>("GET", `/api/get-tickets?${paginationQuery(params)}`);
}

export function getTicket(owner: string, name: string) {
  return request<Ticket>(
    "GET",
    `/api/get-ticket?id=${owner}/${encodeURIComponent(name)}`
  );
}

export function addTicket(ticket: Ticket) {
  return request("POST", "/api/add-ticket", ticket);
}

export function updateTicket(owner: string, name: string, ticket: Ticket) {
  return request(
    "POST",
    `/api/update-ticket?id=${owner}/${encodeURIComponent(name)}`,
    ticket
  );
}

export function deleteTicket(ticket: Ticket) {
  return request("POST", "/api/delete-ticket", ticket);
}

export function addTicketMessage(owner: string, name: string, message: TicketMessage) {
  return request(
    "POST",
    `/api/add-ticket-message?id=${owner}/${encodeURIComponent(name)}`,
    message
  );
}

export function newTicket(owner: string, user: string): Ticket {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    owner,
    name: `ticket_${rand}`,
    createdTime: new Date().toISOString(),
    updatedTime: new Date().toISOString(),
    displayName: `New Ticket - ${rand}`,
    user,
    title: "",
    content: "",
    state: "Open",
    messages: [],
  };
}
