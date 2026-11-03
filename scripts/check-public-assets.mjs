// Fails when text from Aim's briefs appears in .open-next/assets, the files
// Cloudflare serves without the password. Run after the build, before deploy.
// Prints counts and file paths only, never the matched text.
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const briefFiles = readdirSync("data/briefs").filter((f) => /^brief-.+\.json$/.test(f))
if (briefFiles.length === 0) {
  console.error("No briefs in data/briefs, nothing to check against.")
  process.exit(1)
}

// The longest plain-ASCII run of every text field: verdict, headlines, paragraphs,
// "what it means" lines, thread labels and lines, scope names. Bundlers escape
// typographic quotes, so ASCII runs are what survives verbatim. Plus every id
// (recap, sig_, upd_), which is unique to the brief whatever its length.
const asciiRun = (s) => String(s ?? "").split(/[^\x20-\x7E]+/).sort((a, b) => b.length - a.length)[0] ?? ""
const needles = briefFiles.flatMap((f) => {
  const raw = readFileSync(join("data/briefs", f), "utf8")
  const d = JSON.parse(raw)
  const doc = d.recap.doc
  const texts = [
    doc.verdict,
    ...doc.items.flatMap((i) => [i.headline, ...(i.paragraphs ?? []), i.means]),
    ...doc.currents.flatMap((c) => [c.label, c.line]),
    ...d.scopes.map((s) => s.name),
  ]
    .map(asciiRun)
    .filter((s) => s.length >= 20)
  const ids = [d.recap.id, ...new Set(raw.match(/\b(?:sig|upd)_[A-Za-z0-9]{8,}\b/g) ?? [])]
  return [...texts, ...ids]
})

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else yield p
  }
}

let scanned = 0
const hits = []
for (const p of walk(".open-next/assets")) {
  if (!/\.(js|mjs|html|json|txt|rsc|map|css)$/.test(p)) continue
  scanned++
  const text = readFileSync(p, "utf8")
  if (needles.some((n) => text.includes(n))) hits.push(p)
}
console.log(`Scanned ${scanned} public files for ${needles.length} brief snippets and ids: ${hits.length} with brief content.`)
for (const p of hits) console.error(`brief content in ${p}`)
process.exit(hits.length ? 1 : 0)
