import { request } from "./client";

/**
 * Authentication against the fusion engine.
 *
 * The backend issues a JWT with a long expiry (eight hours by default) and
 * enforces roles server-side. This layer only carries the token; it never
 * decides what the holder may do, because a client that decides its own
 * permissions is not enforcing anything.
 */

export type User = {
  username: string;
  email: string;
  full_name: string;
  role: string;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  /** Seconds until the token expires. */
  expires_in: number;
  user: User;
};

/**
 * Exchange credentials for a token.
 *
 * Sent anonymously — attaching a stale bearer token to a login would have the
 * client's central 401 handler fire on the very request meant to fix it.
 */
export const login = (username: string, password: string) =>
  request<LoginResponse>("/auth/login", {
    method: "POST",
    body: { username, password },
    anonymous: true,
  });

/**
 * Who the current token belongs to.
 *
 * Used to check a restored session rather than trusting it: a token read from
 * storage may have expired while the app was closed, and finding that out on
 * launch is better than on the first thing the user taps.
 */
export const getMe = () => request<User>("/auth/me");

export const logout = () =>
  request<{ detail?: string }>("/auth/logout", { method: "POST" });

/** Change your own display name or email. Username and role are not yours to change. */
export const updateMe = (changes: { full_name?: string; email?: string }) =>
  request<User>("/auth/me", { method: "PATCH", body: changes });

/**
 * Change your own password. The server invalidates every token issued before
 * the change, this one included, so the caller signs in again afterwards.
 */
export const changePassword = (current_password: string, new_password: string) =>
  request<{ status: string; note: string }>("/auth/change-password", {
    method: "POST",
    body: { current_password, new_password },
  });
