// Deterministic frustration signals, no model: the reader's words (EN, CZ, SK),
// shouting in capitals, or a run of "!!!" / "???". Two declines in a row are
// counted by the chat handler from the turn history the browser sends.

// Lower case, accents removed, typographic apostrophes as "'".
const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[‘’]/g, "'").toLowerCase()

const PHRASES = [
  // English
  "useless", "doesn't work", "doesnt work", "does not work", "not working", "wtf", "what the hell", "stupid",
  "terrible", "awful", "garbage", "rubbish", "annoying", "frustrating", "frustrated", "pointless", "sucks", "come on",
  "not what i asked", "not what i wanted", "wrong again", "still wrong", "you don't understand", "you dont understand",
  // Czech (accents removed)
  "k nicemu", "nefunguje", "nejde to", "blbost", "hruza", "priserne", "otravne", "nesmysl", "sakra", "kurva", "do prdele",
  "zase spatne", "porad spatne", "nerozumis", "to neni ono",
  // Slovak (accents removed)
  "nanic", "blbost", "hroza", "nezmysel", "do riti", "zase zle", "stale zle", "nerozumies", "to nie je ono",
]
const PHRASE_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${PHRASES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`, "u")

export type FrustrationSignal = "words" | "shouting" | "punctuation"

export function frustrationSignal(request: string): FrustrationSignal | null {
  if (PHRASE_RE.test(plain(request))) return "words"
  const letters = request.match(/\p{L}/gu) ?? []
  const upper = letters.filter((c) => c !== c.toLowerCase() && c === c.toUpperCase()).length
  if (letters.length >= 8 && upper / letters.length >= 0.7) return "shouting"
  if (/[!?]{3,}/.test(request)) return "punctuation"
  return null
}
