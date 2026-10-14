import { request } from "./client";

/**
 * Account administration. Every route here is admin-only on the server; the
 * app shows the screen to admins, but the server is what enforces it.
 */

export type Account = {
  username: string;
  email: string;
  full_name: string;
  role: string;
  enabled: boolean;
  created_at: string | null;
  last_login: string | null;
};

export const ROLES = [
  { value: "analyst", label: "Analyst" },
  { value: "risk_manager", label: "Risk manager" },
  { value: "admin", label: "Administrator" },
] as const;

export const listUsers = () => request<Account[]>("/users");

export const setUserEnabled = (username: string, enabled: boolean) =>
  request<{ status: string }>(`/users/${encodeURIComponent(username)}/enabled`, {
    method: "PATCH",
    body: { enabled },
  });

export const createUser = (u: {
  username: string;
  email: string;
  full_name: string;
  password: string;
  role: string;
}) => request<Account>("/users", { method: "POST", body: u });
