// One shared password for the whole site, so strangers cannot spend the model budget.
// The reader signs in once on /login and gets a signed session cookie.
// Runs in Next's proxy and route handlers, on Node in dev and on Cloudflare Workers
// in production, so it only uses Web APIs (crypto.subtle, TextEncoder, btoa).

export const SESSION_COOKIE = "aim_session"

// The cookie is signed with the password and the login has no rate limit, which
// is safe only with a long random password (offline and online guessing are then
// out of reach). So production treats anything shorter than this as unset.
export const MIN_PASSWORD_LENGTH = 16

// The site password, or null when the gate is not configured. In production a
// short password counts as not configured, so the site fails closed with a 503.
export function sitePassword(env: { SITE_PASSWORD?: string; NODE_ENV?: string } = process.env): string | null {
  const p = env.SITE_PASSWORD ?? ""
  if (!p) return null
  if (env.NODE_ENV === "production" && p.length < MIN_PASSWORD_LENGTH) return null
  return p
}
export const SESSION_DAYS = 7
const VERSION = "v1"
const enc = new TextEncoder()

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))
}

// Compares fixed-length digests in constant time, so timing does not reveal
// how much of a guess was right.
export async function passwordMatches(given: string, password: string): Promise<boolean> {
  if (!password) return false
  return sameBytes(await sha256(given), await sha256(password))
}

// The cookie is signed with the password itself, so changing the password
// signs everyone out.
async function sign(message: string, password: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message))))
}

export async function createSession(password: string, now = Date.now()): Promise<string> {
  const expires = Math.floor(now / 1000) + SESSION_DAYS * 24 * 60 * 60
  const body = `${VERSION}.${expires}`
  return `${body}.${await sign(body, password)}`
}

export async function verifySession(value: string | undefined, password: string, now = Date.now()): Promise<boolean> {
  if (!value || !password) return false
  const parts = value.split(".")
  if (parts.length !== 3 || parts[0] !== VERSION) return false
  const expires = Number(parts[1])
  if (!Number.isInteger(expires) || expires * 1000 <= now) return false
  const expected = await sign(`${parts[0]}.${parts[1]}`, password)
  return sameBytes(enc.encode(expected), enc.encode(parts[2]))
}

// Where to go after signing in. Only same-site paths, never "//evil.example" or a full URL.
// Control characters are refused first, because URL parsing drops tabs and newlines,
// so "/\t/evil.example" would otherwise become "//evil.example". The result is then
// resolved against a fixed origin and must still be on it.
const PLACEHOLDER = "https://placeholder.invalid"

export function safeNext(next: unknown): string {
  if (typeof next !== "string" || next.length > 500 || /[\x00-\x1f\x7f\\]/.test(next) || !/^\/(?!\/)/.test(next)) return "/"
  let u: URL
  try {
    u = new URL(next, PLACEHOLDER)
  } catch {
    return "/"
  }
  if (u.origin !== PLACEHOLDER) return "/"
  const path = u.pathname + u.search + u.hash
  // Dot segments can collapse into a new leading "//", e.g. "/.%2e/%2e%2e//evil.example".
  if (!/^\/(?!\/)/.test(path)) return "/"
  return path.startsWith("/login") || path.startsWith("/api/") ? "/" : path
}

export const cookieOptions = (secure: boolean) => ({
  httpOnly: true,
  secure,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
})
