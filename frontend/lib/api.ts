/**
 * API client for backend Web API.
 *
 * When `publicApiBase` is empty, requests go to same-origin `/api/*` and Next.js
 * rewrites them to `BACKEND_API_URL` (or `NEXT_PUBLIC_API_URL` / localhost). No CORS needed.
 * Set `NEXT_PUBLIC_API_URL` only if you want the browser to call the backend directly
 * (then configure CORS on the backend).
 */
export const publicApiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "")
const API_BASE = publicApiBase

export type AuthRole = "specialist" | "parent" | "administration"

export interface AuthUser {
  id: number
  email: string
  full_name: string | null
  phone?: string | null
  role: "specialist" | "parent" | "administration"
  accountType?: "therapist" | "parent" | "administration"
  auth_token?: string
  created_at?: string | null
}

// Map backend role to frontend accountType for AuthGuard
export function toAccountType(role: AuthRole): "therapist" | "parent" | "administration" {
  if (role === "specialist") return "therapist"
  if (role === "administration") return "administration"
  return "parent"
}

export async function login(
  email: string,
  password: string,
  role: AuthRole
): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role }),
    credentials: "include",
  })
  if (!res.ok) {
    const parsed = (await res.json().catch(() => ({}))) as { error?: string }
    if (parsed.error) {
      throw new Error(parsed.error)
    }
    if (res.status === 502 || res.status === 503) {
      throw new Error(
        `Server unreachable (${res.status}). Check BACKEND_API_URL on Vercel and that Render is Live.`,
      )
    }
    throw new Error(
      `Login failed (${res.status}). If you renamed the backend, set BACKEND_API_URL to the new Render URL and redeploy Vercel.`,
    )
  }
  return res.json()
}

export async function register(
  email: string,
  password: string,
  role: AuthRole,
  full_name?: string
): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role, full_name }),
    credentials: "include",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || "Registration failed")
  }
  return res.json()
}

export function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {}
  const raw = localStorage.getItem("adhdAssistCurrentUser")
  if (!raw) return {}
  try {
    const user = JSON.parse(raw)
    const headers: Record<string, string> = {}
    if (user.auth_token) {
      headers.Authorization = `Bearer ${user.auth_token}`
    }
    return headers
  } catch {
    //
  }
  return {}
}

export async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = { ...getAuthHeaders(), ...(init?.headers as Record<string, string>) }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...headers },
    credentials: "include",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Request failed: ${res.status}`)
  }
  return res.json()
}
