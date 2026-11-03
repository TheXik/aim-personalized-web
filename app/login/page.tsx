import type { Metadata } from "next"
import { Suspense } from "react"
import { safeNext } from "@/lib/infra/auth"

export const metadata: Metadata = { title: "Sign in · Aim weekly brief", robots: { index: false } }

type Search = Promise<{ next?: string; error?: string }>

const kicker = "font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground"

export default function Login({ searchParams }: { searchParams: Search }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 p-8">
      <div className="flex flex-col gap-3">
        <p className={kicker}>Aim weekly brief</p>
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight text-primary">This brief is private.</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">Enter the password you were given. You stay signed in on this device for a week.</p>
      </div>
      <Suspense fallback={<LoginForm next="/" error={false} />}>
        <LoginFromUrl searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function LoginFromUrl({ searchParams }: { searchParams: Search }) {
  const { next, error } = await searchParams
  return <LoginForm next={safeNext(next)} error={Boolean(error)} />
}

function LoginForm({ next, error }: { next: string; error: boolean }) {
  return (
    <form method="post" action="/api/login" className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="password" className={kicker}>
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoFocus
        autoComplete="current-password"
        aria-invalid={error || undefined}
        aria-describedby={error ? "login-error" : undefined}
        className="h-11 rounded-md border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-3 focus-visible:ring-ring aria-invalid:border-destructive"
      />
      {error ? (
        <p id="login-error" role="alert" className="text-[13px] text-destructive">
          That password didn&apos;t work. Try again.
        </p>
      ) : null}
      <button
        type="submit"
        className="mt-2 h-11 rounded-md bg-primary text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
      >
        Open the brief
      </button>
    </form>
  )
}
