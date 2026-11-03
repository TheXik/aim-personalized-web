import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { createSession, passwordMatches, safeNext, SESSION_COOKIE, verifySession } from "./auth"
import { proxy } from "@/proxy"
import { POST as login } from "@/app/api/login/route"

const PW = "test-password-1"
const SITE = "https://aim.lukashellesch.com"
const now = Date.parse("2026-11-03T12:00:00Z")

describe("password and session", () => {
  it("matches only the exact password", async () => {
    expect(await passwordMatches(PW, PW)).toBe(true)
    expect(await passwordMatches("test-password-2", PW)).toBe(false)
    expect(await passwordMatches("", PW)).toBe(false)
    expect(await passwordMatches("", "")).toBe(false)
  })

  it("a session verifies for a week, then expires", async () => {
    const s = await createSession(PW, now)
    expect(await verifySession(s, PW, now)).toBe(true)
    expect(await verifySession(s, PW, now + 6.9 * 864e5)).toBe(true)
    expect(await verifySession(s, PW, now + 7.1 * 864e5)).toBe(false)
  })

  it("rejects tampered, foreign and malformed sessions", async () => {
    const s = await createSession(PW, now)
    const [v, exp, sig] = s.split(".")
    expect(await verifySession(`${v}.${Number(exp) + 999999}.${sig}`, PW, now)).toBe(false)
    expect(await verifySession(`${v}.${exp}.${sig.slice(0, -2)}xx`, PW, now)).toBe(false)
    expect(await verifySession(`v2.${exp}.${sig}`, PW, now)).toBe(false)
    expect(await verifySession("garbage", PW, now)).toBe(false)
    expect(await verifySession(undefined, PW, now)).toBe(false)
  })

  it("changing the password signs everyone out", async () => {
    expect(await verifySession(await createSession(PW, now), "a-new-password", now)).toBe(false)
  })

  it("only redirects to same-site paths after sign-in", () => {
    expect(safeNext("/r/space-launch?x=1")).toBe("/r/space-launch?x=1")
    expect(safeNext("/r/cz-sk-ai#top")).toBe("/r/cz-sk-ai#top")
    const bad = [
      "//evil.example", "/\\evil.example", "https://evil.example", "evil", "/login", "/login?next=/x", "/api/chat",
      "/\t/evil.example", "/\n/evil.example", "/\r//evil.example", "/\u0000/evil.example", "\t//evil.example",
      "/.%2e/%2e%2e//evil.example", "/./..//evil.example", "/a/..//evil.example",
      "/" + "a".repeat(600), null, 42,
    ]
    for (const b of bad) expect(safeNext(b), JSON.stringify(b)).toBe("/")
  })

  it("an encoded slash stays a path on this site", () => {
    expect(safeNext("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example")
    expect(new URL(safeNext("/%2F%2Fevil.example"), SITE).origin).toBe(SITE)
  })
})

describe("proxy", () => {
  beforeEach(() => vi.stubEnv("SITE_PASSWORD", PW))
  afterEach(() => vi.unstubAllEnvs())

  const req = (path: string, cookie?: string) =>
    new NextRequest(`${SITE}${path}`, { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} })

  it("sends pages to /login and keeps where the reader was going", async () => {
    const res = await proxy(req("/r/space-launch"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(`${SITE}/login?next=%2Fr%2Fspace-launch`)
  })

  it("answers the API with 401, including the chat", async () => {
    for (const path of ["/api/chat", "/api/briefs/space-launch"]) {
      const res = await proxy(req(path))
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: "sign_in_required" })
    }
  })

  it("lets the sign-in page and the sign-in route through", async () => {
    for (const path of ["/login", "/api/login"]) expect((await proxy(req(path))).headers.get("x-middleware-next")).toBe("1")
  })

  it("lets a signed-in reader through, and not a forged cookie", async () => {
    expect((await proxy(req("/api/chat", await createSession(PW)))).headers.get("x-middleware-next")).toBe("1")
    expect((await proxy(req("/api/chat", await createSession("guess")))).status).toBe(401)
  })

  it("fails closed in production without a password, stays open in development", async () => {
    vi.stubEnv("SITE_PASSWORD", "")
    vi.stubEnv("NODE_ENV", "production")
    expect((await proxy(req("/login"))).status).toBe(503)
    vi.stubEnv("NODE_ENV", "development")
    expect((await proxy(req("/"))).headers.get("x-middleware-next")).toBe("1")
  })
})

describe("POST /api/login", () => {
  beforeEach(() => vi.stubEnv("SITE_PASSWORD", PW))
  afterEach(() => vi.unstubAllEnvs())

  const post = (fields: Record<string, string>) =>
    login(new Request(`${SITE}/api/login`, { method: "POST", body: new URLSearchParams(fields) }))

  it("the right password sets a secure session cookie and goes to next", async () => {
    const res = await post({ password: PW, next: "/r/cz-sk-ai" })
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe(`${SITE}/r/cz-sk-ai`)
    const cookie = res.headers.get("set-cookie")!
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=v1\\.`))
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Secure/i)
    expect(cookie).toMatch(/SameSite=lax/i)
    const value = decodeURIComponent(cookie.split(";")[0].split("=").slice(1).join("="))
    expect(await verifySession(value, PW)).toBe(true)
  })

  it("a wrong password goes back to /login with an error and no cookie", async () => {
    const res = await post({ password: "nope", next: "/r/cz-sk-ai" })
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe(`${SITE}/login?error=1&next=%2Fr%2Fcz-sk-ai`)
    expect(res.headers.get("set-cookie")).toBeNull()
  })

  it("never redirects off-site, including a tab-split protocol-relative path", async () => {
    for (const next of ["//evil.example", "/\t/evil.example", "/\n/evil.example"]) {
      const res = await post({ password: PW, next })
      expect(res.headers.get("location")).toBe(`${SITE}/`)
    }
  })
})

describe("sitePassword", () => {
  it("fails closed in production when the password is short", async () => {
    const { sitePassword } = await import("./auth")
    expect(sitePassword({ SITE_PASSWORD: "short-pass", NODE_ENV: "production" })).toBeNull()
    expect(sitePassword({ SITE_PASSWORD: "a-long-random-password-23", NODE_ENV: "production" })).toBe("a-long-random-password-23")
    expect(sitePassword({ SITE_PASSWORD: "", NODE_ENV: "production" })).toBeNull()
    expect(sitePassword({ SITE_PASSWORD: "short-pass", NODE_ENV: "development" })).toBe("short-pass")
  })
})
