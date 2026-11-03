# Aim weekly brief, personalised

A page for Aim's web app that shows one reader their weekly market brief on one screen.

A chat beside it, "Change what you see", reshapes the page in plain words. The change is saved and applies to every later brief.

The model never writes text onto the page, so it cannot add facts. The page keeps working when the model is slow, wrong or down.

**Live:** [aim.lukashellesch.com](https://aim.lukashellesch.com), behind one shared password that Lukáš sends separately.

## Try it

Three ways, easiest first. Each one shows the same three sample readers:

| Page | Reader |
|---|---|
| `/brief/space-launch` | A European launch provider |
| `/brief/enterprise-ai` | A San Francisco enterprise-AI founder raising a round |
| `/brief/cz-sk-ai` | A Czech or Slovak AI founder |

**About the data.** Aim's three sample briefs are not in this repo. For options 2 and 3, put your own copies of `brief-space-launch.json`, `brief-enterprise-ai.json` and `brief-cz-sk-ai.json` into `data/briefs/` with the names unchanged. Without them the pages show a message instead of a brief, and the tests run on synthetic briefs only. The live site has the data.

### 1. Live site

Open [aim.lukashellesch.com](https://aim.lukashellesch.com) and sign in with the shared password. The live chat calls the model under a $10 daily cap. When the cap is used up, the four suggested requests still work, because code handles them.

### 2. With your own AI agent

Paste this into any coding agent that can run shell commands:

````text
Set up and run the Aim personalised brief prototype on this machine, then show it to me.

1. Check that Node.js 22.12 or newer and pnpm are installed. If pnpm is missing, run `corepack enable` (or `npm install -g pnpm`).
2. In an empty folder, run `git clone https://github.com/TheXik/aim-personalized-web` and cd into `aim-personalized-web`.
3. Run `pnpm install`. A warning that build scripts for esbuild and workerd were ignored is expected. Do not run `pnpm approve-builds`.
4. Copy Aim's three sample briefs from the assignment into `data/briefs/` with their names unchanged: `brief-space-launch.json`, `brief-enterprise-ai.json`, `brief-cz-sk-ai.json`. Ask me where they are. Do not search my disk for them. If I have none, skip this step: the pages then show a message instead of a brief, and the tests run on synthetic briefs.
5. Create the file `.env.local` in the repo root with exactly these two lines:
   AZURE_OPENAI_API_KEY=
   CHAT_LIVE=1
   I will paste my Azure OpenAI key after the `=` myself. If I give you no key, leave it empty: the app then runs offline and the chat uses built-in shortcuts. Never print the key, never put it anywhere else, never commit `.env.local`.
6. Run `pnpm test`. It makes no model calls. No test should fail. Without the briefs, the tests that need them are skipped.
7. Start the app in the background with `pnpm dev --port 3737` and wait until http://localhost:3737 answers. Keep it running.
8. Check that each brief loads: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3737/api/briefs/<reader>` for `space-launch`, `enterprise-ai` and `cz-sk-ai` should print 200 (404 means the brief files are missing). The pages themselves always return 200 because they load the brief in the browser. Then open all three pages in my browser (on macOS: `open <url>`):
   http://localhost:3737/brief/space-launch
   http://localhost:3737/brief/enterprise-ai
   http://localhost:3737/brief/cz-sk-ai
9. Try the chat once from the command line:
   curl -s -X POST http://localhost:3737/api/chat -H 'content-type: application/json' -d '{"reader":"space-launch","request":"hide the one-liners","spec":null}'
   With the briefs in place, the JSON answer should have "changed": true. "source" is "offline" with or without a key, because this request is a built-in shortcut that never reaches the model.
10. Tell me: the test summary, the HTTP status of each page, the chat reply text, and how to stop the server.
````

### 3. By hand

You need Node.js 22.12 or newer and pnpm 10 (`corepack enable` or `npm install -g pnpm`).

```bash
git clone https://github.com/TheXik/aim-personalized-web
cd aim-personalized-web
pnpm install                  # an "ignored build scripts" warning is expected
cp /path/to/assignment/brief-*.json data/briefs/   # the three briefs, names unchanged
cp .env.example .env.local
pnpm test                     # no model calls. Without the briefs, their tests are skipped
pnpm dev                      # http://localhost:3000
```

Without a key, everything works except chat requests that no shortcut covers (see [the chat](#the-chat-in-two-layers)). To turn on the live chat, put your Azure OpenAI key after `AZURE_OPENAI_API_KEY=` in `.env.local`, set `CHAT_LIVE=1` and restart `pnpm dev`. `MODEL_BUDGET_USD` sets the daily spend cap.

## How it works

### The front page

- On a laptop one screen holds the verdict as the headline, up to two "What it means for you" lines, the week's threads as cards, one figure, and "Also this week" with the other headlines.
- Every full story is one click away in a reading panel.
- From 1024 px wide the page itself never scrolls. `pnpm check:fit` (with `pnpm dev` running) checks this in Chrome at 1280 by 800 and 1440 by 900. Tablets and phones get their own stacked layouts.
- Every figure type in the samples renders: timeline, bar chart, table and comparison.
- The page loads its brief from `GET /api/briefs/<reader>`, which returns the file unchanged after about 300 ms, as if it came from Aim's API. The JSON has no reader id, so each page stands in for one reader.
- "Copy for your agent" in the top bar copies the current view as Markdown. Code builds it from the brief, with no model call.

### The chat, in two layers

The panel is called "Change what you see". It only changes the view and never answers questions, on purpose ([decision 11](docs/decisions.md#11-the-chat-only-changes-the-view)).

**Layer 1: code.** Frequent requests never reach the model. They are free, instant, the same every time, and they work without a key.

- The assignment's four examples, which are also the suggestion chips: "Only what's new this week", "Numbers first", "Hide the one-liners", "Group it by company".
- More shortcuts: "group by thread", "group by topic", "headlines only", "newest first", "hide the threads", "hide the figures", "hide the sources", "reset".
- Hide or show the threads, figures and sources, and hide "Also this week", even with typos or in Czech or Slovak ("remvo charts", "skryj grafy").
- A shortcut fires only when every part of the request matches one. A half-understood request is never half applied.
- Questions such as "who led Nscale's round?" never reach the model either. The reply says "I change what you see, I can't answer questions" and offers the closest change as one click when the question names a company or area from the brief.

**Layer 2: the model.** Everything else goes to `gpt-5-mini-hiring` on Azure, for example "Put Isar, RFA and Sirius at the top" or "hide the data-center thread".

- The route sends three things: a catalog of this week's brief, the reader's current settings and the request. The catalog holds names and counts only: tiers, statuses, figure types, thread labels, scope names, company names and how many items carry numbers. The model never sees headlines, paragraphs or "what it means" lines, so it has no text to copy facts from, and the stories cannot instruct it.
- With reasoning effort low and strict structured output, the model returns at most 6 small edits: filter, pin, remove, parts, group, order, sections, rename, reset, or `not_supported` with a reason and the nearest change that would help.
- Code checks every edit. Each value must exist in this week's brief or in the reader's own words. Labels come only from the brief's own lists or the reader's words. Rules have size limits. An edit that would match nothing this week is refused.
- Code writes the reply from the change: what changed, what matched, how many items are hidden. No model text reaches the page.
- If the model is off, times out after 20 seconds, is blocked by Azure's content filter or is over budget, the page stays as it was and the reply says why.

**When the chat cannot help**, or the reader sounds frustrated (their words, capitals, "!!!", or two declines in a row), it offers "Tell Lukáš". This opens a prefilled email with the request, the page, the active settings and the time. The reader sees all of it in their own mail app before anything is sent. The link also sits under the chat input. Every declined request is logged without IP or cookie, so the roadmap comes from what readers asked for.

### Prompt, settings and reset

- The chat prompt is [`prompts/view-editor.md`](prompts/view-editor.md). The one-time company tagging prompt is [`prompts/company-tags.md`](prompts/company-tags.md).
- The edits are defined in `lib/view/ops.ts`, the settings in `lib/view/spec.ts`, and the pure function from brief and settings to page in `lib/view/engine.ts`.
- Settings are saved per reader in the browser (`localStorage`, key `aim.view.v1.<reader>`). They apply to every later brief with no model call.
- Settings about a field last forever. Settings about a thread last while that thread exists. Settings about one item expire with the week.
- "Your view" at the top of the chat shows each active setting as a removable chip. "Reset to default" returns to the default design.

### Spend caps

- **Live calls are opt-in.** The chat calls the model only when `CHAT_LIVE=1` and a key are both set. Tests never call it.
- **Daily cap.** The live site may spend at most $10 per UTC day (`MODEL_BUDGET_USD` in `wrangler.jsonc`, and the code never allows more on Cloudflare). Dev, tests and evals default to $0.10 and never go above $0.20.
- **Worst case first.** Each call reserves its worst-case cost before it is sent: prompt bytes as an upper bound on input tokens, 2,000 output tokens, list price plus 20%. A call that could cross the cap is never sent. Afterwards the reservation is settled to the real cost.
- **Where spend is counted.** In `.model-spend.json` locally and in a Cloudflare D1 table on the live site. With no safe place to count, no call is made.
- **Rate limits.** 8 chat requests per minute per client on each page, 30 model calls per minute across all clients, 500 characters per request, a 20 second timeout, no automatic retries.
- **Eval.** `pnpm eval` runs the 74 test requests offline for free. It needs the briefs and says it skipped otherwise. `pnpm eval -- --live` only prints its planned calls and cost unless `EVAL_APPROVED=1` is set. It also runs as a manual GitHub workflow that waits for Lukáš's approval.
- **Live eval, 3 Nov.** 74 real requests through `gpt-5-mini-hiring` on the current code, about 4 cents per run. 27 of 37 view changes came out right. 13 of 22 requests it cannot do got the right kind of no. 14 of 15 hostile requests were refused. The 15th, "keep making it more compact until nothing is left", made the page compact. It added no text, and Reset undoes it. Median reply 3.7 s, slowest 6.2 s.

## Project map

| Path | What it holds |
|---|---|
| `app/brief/[reader]/` | The reader page. Old `/r/<reader>` links redirect here |
| `app/api/briefs/[reader]/` | The brief endpoint, standing in for Aim's API |
| `app/api/chat/` | The chat route and its rate limits |
| `components/` | The front page, reading panel, figures and chat panel |
| `lib/front/` | Which stories, threads and figure make the front page |
| `lib/view/` | Settings, edits and their checks, the engine, the reply writer |
| `lib/chat/` | One chat turn: shortcuts, question and frustration checks, "Tell Lukáš" |
| `lib/ai/` | The Azure call and the spend ledger |
| `prompts/` | The two model prompts |
| `tests/` | Request-suite, hostile-input and carry-over tests, plus the eval. Unit tests sit next to the code |

The live site runs on Cloudflare Workers through OpenNext.

## What I would do next

- **An MCP tool for the reader's view.** "Copy for your agent" already exports the view as Markdown. An MCP tool would let the reader's own agent fetch it directly, with their settings applied.
- **Answers from the brief only.** Answer questions such as "who led the biggest round this week?" from this week's brief alone. Each sentence links to its item, and code checks that every name and number appears in the brief. This would also cover the 6 of 60 realistic test requests that the chat declines today because they need new text.
- **Company ids in Aim's API.** Today gpt-5-mini tags companies once per brief, and code keeps a tag only if it appears word for word in its item. Company ids and round amounts from Aim's own pipeline would make "group by company" exact and allow "rounds, biggest first" with no model at all.
- **Settings saved per user on the server.** A versioned row per reader would follow them across devices and make the Monday email open with the same view.
- **Fix the live eval misses, then gate on it.** Each of the 10 misses gets a look: a prompt fix, a missing setting, or a test expectation that was wrong. Then the live eval runs on every prompt change under its own spend cap and fails the build when the score drops.
- **More design rounds with real readers.** Five readers of each type with their own brief, the decline log, and Aim's device data to confirm that the laptop should stay the main stage.

## More

- [docs/decisions.md](docs/decisions.md): every decision with its reasoning and evidence.
- [docs/DEPLOY.md](docs/DEPLOY.md): how the live site is deployed.
- [docs/how-i-worked-with-ai.md](docs/how-i-worked-with-ai.md): every prompt I typed while building this, to show how I steered the work.

Built by Lukáš Hellesch as the Aim hiring take-home, 3 Nov 2026.
