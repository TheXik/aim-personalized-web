import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE, sitePassword, verifySession } from "@/lib/infra/auth"

// Every route, including /api, needs the signed session cookie from /login.
// The password is the SITE_PASSWORD secret (at least 16 characters in production).
// Without it, production refuses every request and development stays open.

const PUBLIC = new Set(["/login", "/api/login"])

export async function proxy(request: NextRequest) {
  const password = sitePassword()
  if (!password) {
    if (process.env.NODE_ENV === "production") return new NextResponse("Not configured.", { status: 503 })
    return NextResponse.next()
  }

  const { pathname, search } = request.nextUrl
  if (PUBLIC.has(pathname)) return NextResponse.next()
  if (await verifySession(request.cookies.get(SESSION_COOKIE)?.value, password)) return NextResponse.next()

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401, headers: { "Cache-Control": "no-store" } })
  }
  const login = new URL("/login", request.url)
  if (pathname !== "/") login.searchParams.set("next", pathname + search)
  return NextResponse.redirect(login)
}

// Everything except Next's static build files and the icons.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
}
