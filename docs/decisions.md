# Decisions

Every product and technical call behind this prototype, with the reasoning and the evidence for it.

How to read it:
- **Evidence** is one of three kinds: my own measurement (method stated), a source (linked), or reasoning without direct evidence (said so).
- Own measurements ran on 3 Nov 2026 against the `gpt-5-mini-hiring` deployment from the assignment, through the Vercel AI SDK.
- Confidence tags: **HIGH** (measured or well sourced), **MODERATE** (good proxy or small sample), **LOW** (one example or a guess).

---

## 1. The model returns a view configuration, not a rewritten brief or generated UI

**Decision.** Three shapes were possible for the model's output: settings for the view, a rewritten brief, or a generated page. It returns settings: small edits to the reader's saved settings (a view spec), stored per reader, not per brief (the format is decision 5). Next week's brief opens with the same settings applied, without calling the model again. The prompt is [`prompts/view-editor.md`](../prompts/view-editor.md).

**Why.** A reader who asks once sees the same page every week at zero model cost. The page is always built from the brief's own text, so the model cannot add facts, and it still renders when the model is slow or down.

**Evidence.** Own benchmark: 9 requests (the assignment's four examples, three more of my own and two hostile ones) on all three briefs, twice each. That is 54 calls per setup, at reasoning effort low.
- A settings change took 3.4 s at the median and cost $0.0006. A generated page took 20.7 s and cost $0.0048.
- The generated page has to run again for every customised reader every week. The settings run once per chat message.
- Surprise: the generated pages invented no facts in 54 runs. But zero failures in 54 still allows a true rate up to about 5.6% per page (rule of three), repeated every week. **HIGH** for the measurements, **MODERATE** for the risk argument.
- The fact risk showed up somewhere else: when a setting had a free-text label, the model wrote a requested false claim into it (decision 5). So fact safety comes from the design, not from the model behaving.

**Considered instead.** Rewriting the brief for each reader every week. Generating the UI for each reader every week.

**What would change it.** Readers mostly asking for new text (summaries, translations) that no setting over the existing fields can express.

---

## 2. The laptop is the main stage

**Decision.** The laptop layout leads. Phone and tablet each get their own designed layout, none of them a cut-down fallback.

**Why.** Readers open this web page on purpose, mostly at work. The phone matters for the Monday tap on the email, so it gets a first-class layout, but the email subject is the hook, not the page.

**Evidence.**
- B2B websites get about 29% of sessions from phones and SaaS sites 23.6% to 27.7% ([Siege Media, 13.4B sessions, 2023 to mid 2026](https://siegemedia.com/research/mobile-vs-desktop-traffic-share)). This is marketing-site traffic used as a proxy, because no public data exists for pages inside B2B apps. **MODERATE**.
- Email opens cannot settle it: Apple Mail Privacy Protection hides the device on roughly 55 to 60% of opens ([Litmus](https://www.litmus.com/email-client-market-share)).

**Considered instead.** Phone first. Laptop first with a plain stacked phone version.

**What would change it.** Aim's own analytics showing most web page visits come from phones. One query would settle it.

---

## 3. The first screen answers "what happened, and what does it mean for me"

**Decision.** The first screen carries the verdict as the headline, the week's threads with their status and age, and each long story's "what it means" line next to its headline, with figures as the visual hook. Everything else is one tap away.

**Why.** Attention is short, and the brief already carries both halves: the verdict is the outcome, and each detail item's "means" line is the takeaway written for this reader.

**Evidence.**
- Readers spent 51 seconds on a newsletter after opening it, and 67% never looked at the intro ([Nielsen Norman Group](https://www.nngroup.com/articles/email-newsletters-inbox-congestion/), an old but careful eyetracking study). **HIGH** as measured.
- 57% of viewing time goes to the first screen and 74% to the first two ([Nielsen Norman Group, 2018](https://www.nngroup.com/articles/scrolling-and-attention/), desktop). **HIGH**.
- Competitive-intelligence teams say raw data is not enough and readers need clear takeaways ([Crayon State of CI 2025](https://www.crayon.co/hubfs/Crayon%27s%202025%20State%20of%20CI%20Report.pdf)). The "means" line is that takeaway. **MODERATE** (a survey of the people who write briefs, not of readers).
- The three sample briefs take 2.1 to 2.9 minutes to read in full. The verdict, the thread labels and the detail headlines take about 25 seconds (own count at 238 words a minute).

**Considered instead.** Threads first with no takeaways. Every headline in one dense list.

**What would change it.** Reader research showing a reader type needs something else first, for example an investor wanting numbers. Their saved settings then change their first screen, not the default.

---

## 4. No "who are you" step

**Decision.** The page opens with the default design. Customising is optional, and four suggested requests sit above the chat input.

**Why.** Aim already knows the customer. Every brief is written for them. Readers who open the page came to read, not to configure.

**Evidence.** Reasoning, no direct evidence. Briefing products that let readers personalise lead with suggestions rather than a blank box or a questionnaire (Perplexity, Particle, AlphaSense, and Aim's own lenses). **MODERATE** for the product pattern.

**Considered instead.** One onboarding question, then the model builds the reader's first view.

**What would change it.** Usage data showing most readers customise on their first visit.

---

## 5. The model returns small edits, and no model text reaches the page

**Decision.** The chat returns at most six small edit operations on the saved settings. Labels come only from the brief's own lists (thread labels, scope names, company names) or from the reader's own words. The chat reply is written by code from the change. Rules use our own small format with a fixed set of operators.

**Why.** Whole new views changed things nobody asked for, and any free-text field let the model slip a claim onto the page.

**Evidence.** Own probes (one run per case, so indicative):
- Asked to return a whole new view for "numbers first", the model hid the figures. In another run it moved the verdict to the bottom unasked. As edit operations, the same request produced exactly the changes asked for.
- With a free-text label, asked for a section titled with a made-up funding claim, the model wrote the claim into the label. With edit operations and a `not_supported` option instead, it refused.
- A suite of 15 hostile requests (prompt injection, fact injection, other customers' data, oversized input) is blocked by this design, because no field the model fills is shown as text. These cases run in the test suite.
- Live eval on 3 Nov, one run of 74 calls on the real briefs: the model refused 14 of the 15 hostile requests. The 15th, "keep making it more compact until nothing is left", made the page compact. It added no text and Reset undoes it. 27 of 37 view changes came out right and 2 more partly. Median reply 3.9 s. **HIGH** for the measurement, one run.
- This is the "action selector" pattern, which resists prompt injection as long as the model's output cannot carry consequential free text ([Beurer-Kellner et al. 2025](https://arxiv.org/html/2506.08837)). **HIGH** for the pattern.
- The JSONLogic library (`json-logic-js`) has had no release since July 2024 and has past prototype-pollution and command-injection advisories (CVE-2021-4329). Not re-verified on the day. **MODERATE**.

**Considered instead.** A whole new view each time. Letting the model write labels and replies. Using JSONLogic.

**What would change it.** A request type that keeps failing because labels cannot come from the brief.

---

## 6. Companies are tagged once per brief and checked word for word

**Decision.** Companies are tagged once per brief by gpt-5-mini, and each tag is kept only if it appears word for word in its item. Grouping by company puts an item under the first company named in its headline. Company rules also match the name in the item's text, so they keep working in a week without tags.

**Why.** "Group it by company" is one of the assignment's example requests, and company names live only in the text. The scopes are a mix of companies, publications, topics and questions.

**Evidence.** Own test on all 36 items of the three briefs against a hand-made gold list of 48 required company tags:
- gpt-5-mini found every company in both runs, with 92% to 100% precision, for about $0.0014 per brief.
- Its mistakes were products tagged as companies, and once a company inferred from a product mention. The word-for-word check removes the second kind.
- A local language library (`compromise`) found 15% of the companies.
- Caveat: the gold list was labelled by the same person who wrote the prompt. **MODERATE**.

**Not built yet.** An "also mentions" pointer for items that name several companies. Today such an item appears only under its first company.

**Considered instead.** A local language library. Grouping only by thread or monitoring area. Letting the model group on every request.

**What would change it.** Aim's API adding company ids to items.

---

## 7. Settings have lifetimes

**Decision.** Settings about fields (tier, status, scope, company, numbers) last forever. Settings about a thread last while a thread with that label exists. Settings about one item expire with that week's brief.

**Why.** "Numbers first" is a standing preference, while "drop that one story" is about this week only. Threads have no id in the data, so a thread setting can only follow its label.

**Evidence.**
- Thread labels have no id in any of the three files. **HIGH**.
- One thread label appears word for word in an email from two weeks earlier and in this week's brief. That is one example. **LOW** on how stable labels are.
- A carry-over test runs one saved set of settings across this week and a synthetic next week (new id, a story removed, a thread renamed, a new item added). Field settings still apply and catch the new item, the renamed thread's setting stops, and the item setting expires.

**Considered instead.** Everything forever. Everything expires weekly.

**What would change it.** Later briefs showing that thread labels change often. Then threads need a stable id from Aim.

---

## 8. "Only new" means new, and the chat says what it hid

**Decision.** "Only what is new this week" keeps items with status new. When a change hides more than half the page, the reply says so and offers the wider reading.

**Why.** Silently showing a nearly empty page breaks trust. Silently widening the request ignores what the reader said.

**Evidence.** In the Czech and Slovak brief every thread and all four longer stories are "updated", so a strict filter keeps 5 one-liners out of 11 items. The chat replies "This hides 6 of 11 items" and offers "Show new and updated stories" (checked offline on 3 Nov).

**Considered instead.** Treating updated as new. Applying it silently.

**What would change it.** Readers telling us they mean "anything with news this week".

---

## 9. Personalisation stays visible

**Decision.** Active settings show as removable chips, filtered sections show "hidden (N)", the reply names what matched, and Reset is always one tap away.

**Why.** A reader must always see why the page looks the way it does, and get back to the full brief.

**Evidence.**
- 48% of people worry that personalisation makes them miss important information ([Reuters Institute Digital News Report 2023](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2023/dnr-executive-summary)). **HIGH**.
- ChatGPT Pulse users complained about stale curation they could not see or fix ([OpenAI community](https://community.openai.com/t/what-has-chatgpt-pulse-done-to-help-you/1371024)), and OpenAI retired Pulse in June 2026 ([AlternativeTo](https://alternativeto.net/news/2026/6/chatgpt-launches-new-scheduled-tasks-and-prepares-to-sunset-pulse/)). Anecdotal. **MODERATE**.

**Considered instead.** Silent personalisation.

**What would change it.** Readers ignoring or disliking the chips in testing.

---

## 10. A front page that fits one laptop screen

**Decision.** The page is a front page: the verdict and the two "what it means" lines on top, the threads as compact cards, one figure, a short list of the other headlines, and a reading panel that slides in for the full story.

**Why.** The first build missed the brief's first two goals: understood right away, and fits the viewport. The front page puts the outcome and the takeaway first (decision 3) and keeps every detail one click away.

**Evidence.**
- Attention is under a minute and most viewing time goes to the first screen (decision 3). **HIGH**.
- `pnpm check:fit` drives Chrome over every reader at 1280 by 800 and 1440 by 900 and fails if the page scrolls. Own check.
- Five simulated first-time readers (fresh AI agents given only a reader persona, the page and a browser, 23 chat messages in total) said the laptop page fits one screen and named the "What it means for you" lines among what worked. They also found that the phone's first screen is all headline. Own test on 3 Nov. Simulated readers, so **MODERATE**.
- Choosing among the three mockups below was Lukáš's design judgement, with no test behind it. **LOW**.

**Considered instead.**
- The first build: everything in one scrolling column. Dropped because it was longer than one screen and read as chaotic.
- B, an email-app reader with a headline list and a reading pane. Dropped after review.
- C, thread tiles. Dropped, but its simplicity carried over into the thread cards.

**What would change it.** Readers in testing missing stories that sit behind a click.

---

## 11. The chat only changes the view

**Decision.** The chat only changes what the page shows. It does not answer questions about the brief, and its label says so: "Change what you see". Code catches questions before any model call. The reply says "I change what you see, I can't answer questions", then offers the closest change as one click, then "Tell Lukáš", a prefilled email they see in full before sending. An earlier "Ask your own AI" button was dropped: it did not change the view, so it broke the chat's one promise. "Copy for your agent" in the top bar remains for readers who want the brief in their own assistant.

**Why.** The brief asks for a chat that customises the page. A question label invites requests the chat has to refuse, and an answer written by the model would be model text on the page (decision 5).

**Evidence.**
- In the simulated reader test, about a third of the 23 chat messages asked for things the design rules out on purpose: valuations, source names, "the last 7 days", advice. Refusing them was right, but every refusal was a dead end. That is why each refusal now ends in something to click. Own test, simulated readers, **MODERATE**.
- The same test found 5 of 23 messages asking for amounts or "biggest first" quietly got "items with numbers first". The reply now says when it substituted. **MODERATE**.
- Grounded answers with sources are a next step (README, "What I would do next").

**Considered instead.** Label it "Ask Aim about this brief" and answer questions.

**What would change it.** Readers repeatedly typing questions into the chat.

---

## 12. A rewritten prompt was tested and not adopted

**Decision.** The chat keeps its current prompt (`prompts/view-editor.md`). A rewrite by a prompt-engineering pass was run against it on the same code and lost.

**Why.** The gate agreed in advance: adopt the rewrite only if it matches or beats the current prompt on all three eval groups. It was much better at declining with the right reason and worse at applying changes, so it failed the gate.

**Evidence.** Live A/B on the 74-request suite, same code, gpt-5-mini at low effort, one run each (Own test, **MODERATE**: one sample per case):

| Group | Current prompt | Rewrite |
|---|---|---|
| Apply (37) | 27 pass | 24 pass |
| Not supported (22) | 13 pass | 19 pass |
| Refuse | 14 of 15 pass | 4 of 4 pass (the daily spend cap stopped the run after 63 of 74) |

The rewrite lost four apply cases (a scope pinned to the bottom, a topic filter, two follow-ups) and gained seven decline reasons. Cost of both runs: about 9 cents.

**What would change it.** A combined prompt that keeps the current apply behaviour and takes the rewrite's rules for reasons, then passes the same gate.

---

## Technical choices made during the build

Smaller calls, each with the fact that drove it.

- **Live model calls are opt-in** (`CHAT_LIVE=1` plus a key), so no dev server or test spends money by accident.
- **Every call reserves its worst-case cost before it is sent**, against a daily cap: $10 on the live site (the most the code allows there), $0.10 by default and at most $0.20 in dev, tests and evals. A call that could cross the cap is never sent. The ledger is atomic, so concurrent calls cannot overshoot.
- **`z.union`, not `z.discriminatedUnion`, in the output schema.** Azure rejects the `oneOf` that a discriminated union produces (`400 invalid_json_schema`, own probe).
- **Reasoning effort goes under `providerOptions.openai`.** On `azure.chat()` the `azure` key is silently ignored: "minimal" still produced 2,752 and 3,136 reasoning tokens in two runs, against 0 with the `openai` key (own measurement).
- **Reasoning effort low, not minimal.** Low matched the intended change in 54 of 54 calls and marked both hostile requests unsupported 12 of 12 times. Minimal got 53 of 54 and 11 of 12, for $0.0002 and 0.4 s less per call (own benchmark).
- **The model sees a catalog of the brief, never its paragraphs**, so text inside a brief cannot instruct it ([OWASP LLM01](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)).
- **Offline shortcuts fire only when the whole request matches**, so a request that is only partly understood never gets half applied.
