import { CONTACT_EMAIL, CONTACT_NAME } from "../config"

// "Tell Lukáš": a mailto link with everything needed to reproduce the problem.
// The reader's mail app opens with it prefilled, so they see all of it before
// anything is sent. No server call, no tracking.

// How the chat response tells the UI to offer the direct line.
// "after": once the closest-view and Ask-your-own-AI offers were not enough.
// "now": the reader sounds frustrated, so offer it right away.
export type ContactOffer = { when: "after" | "now"; reason: "declined" | "frustrated" }

export type ContactDetails = {
  request?: string // what the reader asked, empty for the always-visible link
  page: string // the reader page URL
  settings: string[] // code-written labels of the active settings
  time: string // ISO time
}

const cut = (s: string, n: number) => Array.from(s).slice(0, n).join("")

export const contactLine = () => `Not what you needed? Tell ${CONTACT_NAME} directly. He reads every message and fixes it fast.`

export function contactMailto(d: ContactDetails, email: string = CONTACT_EMAIL): string | null {
  if (!email) return null
  // Cut by code points, never inside an emoji: half a surrogate pair makes
  // encodeURIComponent throw and would blank the page.
  const request = cut((d.request ?? "").replace(/\s+/g, " ").trim(), 500)
  const short = cut(request, 60)
  const subject = request ? `Aim brief: "${short}${short.length < request.length ? "..." : ""}"` : "Aim brief feedback"
  const body = [
    `Hi ${CONTACT_NAME},`,
    "",
    "",
    "---",
    ...(request ? [`What I asked: ${request}`] : []),
    `Page: ${d.page}`,
    `My settings: ${d.settings.length ? d.settings.slice(0, 12).join("; ") : "default view"}`,
    `Time: ${d.time}`,
  ].join("\n")
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
