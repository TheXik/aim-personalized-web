# Aim weekly brief, personalised

A page of Aim's web app that shows one reader their weekly market brief as a front page that fits one screen: the verdict, what it means for them, the threads they follow, one figure and the other headlines. Every full story is one click away in a reading panel. Laptop, tablet and phone each have their own layout.
Next to it is a chat, "Change what you see", where the reader reshapes the page in plain language ("numbers first", "hide the one-liners"). The change is saved as small settings and applies to every later brief without calling the model again.
The model never writes text that reaches the page. Every word comes from Aim's brief or from fixed copy in the code, so it cannot add facts. If the model is slow, makes a mistake or is offline, the page keeps working on saved settings and built-in shortcuts.

Built by Lukáš Hellesch as the Aim hiring take-home, 3 Nov 2026. Why each choice was made, with evidence: [docs/decisions.md](docs/decisions.md).

## Try it

Three ways, easiest first.

**About the data.** This public repo does not include Aim's three sample briefs. For options 2 and 3, copy the three JSON files from the assignment into `data/briefs/` with their names unchanged: `brief-space-launch.json`, `brief-enterprise-ai.json` and `brief-cz-sk-ai.json`. Without them the app shows a message instead of a brief, and the tests run on synthetic briefs. If you add the files while the app is running, restart it. The live site has the data.

### 1. Live

Open **https://aim.lukashellesch.com**. It has the real briefs and sits behind one shared password, which Lukáš sends you himself. The live chat calls the model under a small daily spend cap (see [Spend caps](#spend-caps)). When the cap is used up, the four suggested requests still work.

### 2. With your own AI agent

Paste this into any coding agent that can run shell commands:

````text
Set up and run the Aim personalised brief prototype on this machine, then show it to me.

1. Check that Node.js 20.9 or newer and pnpm are installed. If pnpm is missing, run `corepack enable` (or `npm install -g pnpm`).
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
   With the briefs in place, the JSON answer should have "changed": true. "source" is "offline" without a key and "model" with one.
10. Tell me: the test summary, the HTTP status of each page, the chat reply text, and how to stop the server.
````

### 3. Manual

You need Node.js 20.9 or newer and pnpm 10 (`corepack enable` provides it).

```bash
git clone https://github.com/TheXik/aim-personalized-web
cd aim-personalized-web
pnpm install                  # an "ignored build scripts" warning is expected
cp /path/to/assignment/brief-*.json data/briefs/   # the three briefs, names unchanged
cp .env.example .env.local
pnpm test                     # no model calls. Without the briefs, their tests are skipped
pnpm dev                      # http://localhost:3000
```

To turn on the live chat, put your key after `AZURE_OPENAI_API_KEY=` in `.env.local` and set `CHAT_LIVE=1`. Then restart `pnpm dev`. `MODEL_BUDGET_USD` sets the daily spend cap (see [Spend caps](#spend-caps)).

**Works without a key** (with the three briefs in `data/briefs/`):
- All three reader pages, the front page and the reading panel, every figure type, the phone, tablet and laptop layouts.
- Saved settings that survive a reload, the setting chips, Reset, and "Copy for your agent".
- The chat for the brief's four example requests, which are also the suggestion chips: "Only what's new this week", "Numbers first", "Hide the one-liners", "Group it by company". Built-in shortcuts also cover "group by thread", "group by topic", "headlines only", "newest first", "hide the threads", "hide the figures", "hide the sources" and "reset". A request only uses a shortcut when every part of it matches one.
- Questions about the brief, "Ask your own AI" and "Tell Lukáš" (see [How the chat works](#how-the-chat-works)). None of them call the model.

**Needs the key and `CHAT_LIVE=1`:** any other request, for example "Put Isar, RFA and Sirius at the top" or "hide the data-center thread". Without the model the chat says so and leaves the page as it was.

## The three readers

| Page | Brief | Reader |
|---|---|---|
| `/brief/space-launch` | `data/briefs/brief-space-launch.json` | A European launch provider |
| `/brief/enterprise-ai` | `data/briefs/brief-enterprise-ai.json` | A San Francisco enterprise-AI founder raising a round |
| `/brief/cz-sk-ai` | `data/briefs/brief-cz-sk-ai.json` | A Czech or Slovak AI founder |

The page loads its brief through `GET /api/briefs/<reader>`, which returns the file unchanged with about 300 ms of simulated latency, as if it came from Aim's API. The JSON has no reader id, so the slug stands in for one reader.

## How the chat works

1. The reader types a request. The route sends the model three things: a catalog of this week's brief (tiers, statuses, figure types, thread labels, scope names, company names, how many items carry numbers), the reader's current settings, and the request. It never sends the brief's paragraphs, so the model has no text to copy facts from and nothing inside the brief can instruct it.
2. The model (`gpt-5-mini-hiring` on Azure, reasoning effort low, strict structured output) returns at most 6 edit operations: filter, pin, remove, parts, group, order, layout, sections, rename, reset, or `not_supported` with a reason and the nearest thing that would help.
3. Code applies and checks every operation. Each value in a rule must exist in this week's brief or in the reader's own words. Section labels come only from the brief's own lists. Rules have size limits.
4. Code writes the chat reply from the change: what changed, which items matched, how many are hidden. No model text reaches the page.
5. The settings are saved per reader in the browser (`localStorage`, key `aim.view.v1.<reader>`). They apply to every later brief with no model call. Settings about a field last forever, settings about a thread last while that thread exists, and settings about one item expire with the week. Reset returns to the default design.
6. If the model is off, times out after 15 seconds, is blocked by Azure's content filter or is over budget, the chat uses a built-in shortcut when the whole request matches one. Otherwise it leaves the page unchanged and says why.
7. The chat only changes the view. It does not answer questions, on purpose (decision 11). Code catches questions such as "who led Nscale's round?" before any model call, so they cost nothing. The reader gets the closest view as one click (the companies or areas they named), then "Ask your own AI", which copies the whole brief as Markdown with their question on top, for the assistant they already use.
8. When the chat cannot help, or the reader sounds frustrated (their words, capitals, "!!!", or two declines in a row), it offers "Tell Lukáš": a prefilled email with the request, the page, the active settings and the time. The reader sees all of it in their own mail app before anything is sent. The link also sits under the chat input. Every declined request is logged without IP or cookie, so the roadmap comes from what readers asked for.

**The chat prompt is in [`prompts/view-editor.md`](prompts/view-editor.md).** The one-time company tagging prompt is in [`prompts/company-tags.md`](prompts/company-tags.md). The operations are defined in `lib/view/ops.ts`, the settings in `lib/view/spec.ts`, and the pure function from (brief, settings) to page in `lib/view/engine.ts`.

## Spend caps

- **Live calls are opt-in.** The chat calls the model only when `CHAT_LIVE=1` and a key are both set. Tests never call it.
- **Daily cap.** The live site may spend at most $10 per UTC day (`MODEL_BUDGET_USD` in `wrangler.jsonc`, and the code never allows more on Cloudflare). Dev, tests and evals default to $0.10 and never go above $0.20. Each call reserves its worst-case cost before it is sent (prompt bytes as an upper bound on input tokens, 2,000 output tokens, list price plus 20%), and a call that could cross the cap is never sent. After the call the reservation is settled to the real cost.
- **Where spend is counted.** In `.model-spend.json` locally and in a Cloudflare D1 table on the live site. If there is no safe place to count, no call is made.
- **Rate limits.** 8 chat requests per minute per client, 30 model calls per minute across all clients, requests capped at 500 characters, 15 second timeout, no automatic retries.
- **Eval.** `pnpm eval` runs the 75 research requests offline for free. It needs the briefs in `data/briefs/` and says it skipped otherwise. The live run (`EVAL_APPROVED=1 pnpm eval -- --live`) prints its call count first and refuses to start without that flag. It also runs as a manual GitHub workflow that waits for Lukáš's approval.
- **Live eval result, 3 Nov.** 74 calls through `gpt-5-mini-hiring`, about 4 cents. 27 of 37 view changes came out right (2 more partly). 14 of 15 hostile requests were refused. The 15th, "keep making it more compact until nothing is left", made the page compact. It added no text, and Reset undoes it. Median reply time 3.9 s.

## Project map

| Path | What it holds |
|---|---|
| `app/brief/[reader]/` | The reader page (old `/r/<reader>` links redirect here) |
| `app/api/briefs/[reader]/` | The brief endpoint |
| `app/api/chat/` | The chat route and its rate limits |
| `components/` | The front page, reading panel, figures and chat UI |
| `lib/brief/` | Schema and normalisation of Aim's brief JSON |
| `lib/front/` | Which stories, threads and figure make the front page |
| `lib/view/` | Settings, rules, engine, edit operations, reply writer |
| `lib/chat/` | Chat handling, offline shortcuts, question and frustration checks, the "Tell Lukáš" link |
| `lib/export/` | Markdown for "Copy for your agent" and "Ask your own AI" |
| `lib/ai/` | The Azure call and the spend ledger |
| `lib/infra/` | Password gate and the decline log |
| `prompts/` | The model prompt |
| `tests/` | Engine, request-suite, hostile-input and carry-over tests, plus the eval |
| `docs/decisions.md` | Every decision with its reasoning and evidence |
| `docs/DEPLOY.md` | How the live site is deployed |

The live site runs on Cloudflare Workers through OpenNext.

## What I would do next

1. **An MCP tool for the reader's personal view.** "Copy for your agent" already exports the reader's view as Markdown with links, every word from the brief. An MCP tool would let the reader's own agent fetch that view directly, with their settings applied.
2. **Questions about the brief, answered only from the brief.** Today the chat only changes the view, on purpose, because that is what the assignment asks for, and it hands questions to the reader's own AI with the brief attached. Next, readers could ask questions such as "who led the biggest round this week?" and get answers built only from this week's brief, each sentence linked to the item or update it comes from, with a code check that every name and number in the answer appears in the brief. It would also give a home to the requests the chat declines today because they need new text: 6 of the 60 realistic test requests.
3. **Company ids in Aim's API.** Today companies are tagged once per brief with gpt-5-mini and checked word for word against each item. Ids from Aim's own pipeline would make "group by company" exact and unlock "rounds, biggest first" with no model at all.
4. **Settings saved per user on the server.** They live in the browser now. A versioned row per reader would follow them across devices and make the Monday email open with the same view.
5. **Fix the misses from the live eval, then gate on it.** The one live run got 27 of 37 view changes right. Each of the 10 misses gets a look: a prompt fix, a missing setting, or a test expectation that was wrong. Then the live run goes on every prompt change under its own spend cap and fails the build when the score drops.
6. **More design rounds with real readers.** Five readers of each type with their own brief, the decline log of every request the chat could not do, and Aim's device data to confirm that the laptop should stay the main stage.
