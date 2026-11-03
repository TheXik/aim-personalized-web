import Link from "next/link"

const READERS = [
  { slug: "space-launch", name: "European launch provider" },
  { slug: "enterprise-ai", name: "San Francisco enterprise AI founder" },
  { slug: "cz-sk-ai", name: "Czech and Slovak AI founder" },
]

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-8">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Aim weekly brief</p>
      <ul className="flex flex-col gap-3">
        {READERS.map((r) => (
          <li key={r.slug}>
            <Link className="text-lg font-semibold underline-offset-4 hover:underline" href={`/r/${r.slug}`}>
              {r.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
