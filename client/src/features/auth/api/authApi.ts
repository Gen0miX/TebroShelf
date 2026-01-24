import type { User, LoginCredentials } from "../types/auth";

const API_BASE = "/api/v1/auth";

export async function login(credentials: LoginCredentials): Promise<User> {
  const response = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // Important for cookies
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Login failed");
  }

  const data = await response.json();
  return data.data;
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function getCurrentUser(): Promise<User | null> {
  const response = await fetch(`${API_BASE}/me`, {
    credentials: "include",
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.data;
}
