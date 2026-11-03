import { NextResponse } from "next/server"
import { cookieOptions, createSession, passwordMatches, safeNext, SESSION_COOKIE, sitePassword } from "@/lib/infra/auth"

// POST /api/login  form fields: password, next
// Right password: sets the session cookie and goes to `next`.
// Wrong password: back to /login with an error, after a short pause to slow guessing.

export async function POST(request: Request) {
  const password = sitePassword()
  if (!password) return new NextResponse("Not configured.", { status: 503 })

  const form = await request.formData().catch(() => null)
  const given = String(form?.get("password") ?? "").slice(0, 200)
  const next = safeNext(form?.get("next"))

  if (!(await passwordMatches(given, password))) {
    await new Promise((r) => setTimeout(r, 400))
    const back = new URL("/login", request.url)
    back.searchParams.set("error", "1")
    if (next !== "/") back.searchParams.set("next", next)
    return NextResponse.redirect(back, 303)
  }

  // Belt and braces: the target must be on this site's origin.
  const target = new URL(next, request.url)
  const home = new URL("/", request.url)
  const res = NextResponse.redirect(target.origin === home.origin ? target : home, 303)
  res.cookies.set(SESSION_COOKIE, await createSession(password), cookieOptions(new URL(request.url).protocol === "https:"))
  return res
}
