# Deploy runbook

The site runs at https://aim.lukashellesch.com on Cloudflare Workers, behind one shared password. Every step marked **(Lukáš)** is outward-facing and needs his yes when it happens.

## How it fits together

- **Cloudflare Workers with `@opennextjs/cloudflare`.** The app has server routes (`/api/briefs/[reader]`, `/api/chat`, `/api/login`), so a static Pages export cannot run it. Wrangler drives Workers, D1 and secrets because the project has a `wrangler.jsonc`.
- **Domain.** `lukashellesch.com` is an active zone in Lukáš's Cloudflare account. The first deploy creates the `aim` record and its certificate from the `routes` entry. `workers.dev` and preview URLs are off, so the custom domain is the only way in.
- **Password.** `proxy.ts` sends every route, including `/api`, to `/login` (pages) or answers 401 (API) unless the request carries a valid session cookie. `/api/login` checks the password in constant time and sets an HttpOnly, Secure, SameSite=Lax cookie for 7 days, signed with the password. Because of that, and because wrong passwords are only slowed by a 400 ms pause, the password must be random and at least 16 characters (23 recommended, for example four groups of five from a 31-letter alphabet, about 99 bits). Without the `SITE_PASSWORD` secret, or with one shorter than 16 characters, production answers 503 to every request.
- **Spend.** `lib/ai/budget.ts` reserves each model call's worst case in D1 (`MODEL_SPEND_DB`) with one conditional `UPDATE`, capped at `MODEL_BUDGET_USD` per UTC day (10 cents, never above 20). Without the binding, or if D1 errors, there is no model call and the chat answers from its offline shortcuts.
- **Briefs.** Aim's briefs are not in git. A build bundles whatever is in `data/briefs/` into the Worker, behind the password. On the Mac they are local files. In CI they are restored from GitHub secrets. The company tags are tracked (headline hashes and names only).
- **No secrets in the build.** OpenNext compiles every `.env*` file into the Worker. `scripts/cf-build.sh` hides `.env*` during the build and puts them back afterwards, fails if the compiled env names a secret, and runs `scripts/check-public-assets.mjs`, which fails if brief text or ids land in the public static files. `pnpm cf:preview` and `pnpm cf:deploy` both go through it.

## First deploy, from the Mac

Run in `~/code/work/AIM-startup/task/aim-personalized-web`, on `main`, with the three brief files in `data/briefs/`.

1. Local check, nothing leaves the machine. Preview secrets go in `.dev.vars` (git-ignored, read by the local Worker). `.env.local` is hidden from the build automatically.
   ```sh
   grep '^SITE_PASSWORD=' .env.local > .dev.vars
   pnpm cf:preview
   ```
   Without a cookie, `/` must redirect to `/login`. After signing in, all three readers must load.
2. Wrangler is already logged in on this Mac (`pnpm exec wrangler whoami`). If not, `pnpm exec wrangler login`.
3. **(Lukáš)** The spend database. The table is created on first use:
   ```sh
   pnpm exec wrangler d1 create aim-model-spend --binding MODEL_SPEND_DB
   ```
   Put the printed `database_id` into the `d1_databases` entry in `wrangler.jsonc`.
4. **(Lukáš)** Deploy: `pnpm cf:deploy`. This creates the DNS record and the certificate. Until step 5 the site answers 503 everywhere, which is safe.
5. **(Lukáš)** Secrets, from the local file or the prompt, never typed into a command line. `SITE_PASSWORD` must be random and at least 16 characters, or the site keeps answering 503. The one in `.env.local` is 23.
   ```sh
   grep '^SITE_PASSWORD=' .env.local | cut -d= -f2- | pnpm exec wrangler secret put SITE_PASSWORD
   pnpm exec wrangler secret put AZURE_OPENAI_API_KEY   # paste the key at the prompt
   ```
6. **(Lukáš)** HTTPS for the zone. Both settings apply to every host on `lukashellesch.com`, his main site included. Run each with `--dry-run` first:
   ```sh
   cf zones settings edit always_use_https --zone lukashellesch.com --body '{"value":"on"}'
   cf zones settings edit security_header --zone lukashellesch.com --body '{"value":{"strict_transport_security":{"enabled":true,"max_age":15552000,"include_subdomains":false,"preload":false,"nosniff":true}}}'
   ```
   HSTS is remembered by browsers for `max_age` (6 months here), so it cannot be taken back quickly. Confidence: MODERATE that the zone header reaches responses from the Worker's custom domain. Check it with `curl -sI https://aim.lukashellesch.com/login | grep -i strict-transport`.
7. Verify:
   ```sh
   SITE_URL=https://aim.lukashellesch.com SITE_PASSWORD="$(grep '^SITE_PASSWORD=' .env.local | cut -d= -f2-)" bash scripts/smoke-prod.sh
   ```
   Then sign in once in a browser and send one chat message. `pnpm exec wrangler tail` shows one `llm_call` line per message.

**Roll back:** `pnpm exec wrangler rollback`.
**Kill switch for the model:** `pnpm exec wrangler secret delete AZURE_OPENAI_API_KEY`, which takes effect at once because no build carries the key. Or set `CHAT_LIVE` to `"0"` in `wrangler.jsonc` and run `pnpm cf:deploy`. Either way the chat keeps working on its offline shortcuts.

## Publishing the repo (submission day)

The working repo's history contains Aim's briefs, so its push URL is disabled. The public repo is one fresh commit of the vetted tip, built with `git archive` in a separate folder (research/08-security.md, section 1.5). `git archive` ships only tracked files, so `.env.local`, `.dev.vars` and the briefs cannot ride along. No history rewrite and no force push anywhere. The public repo loses the checkpoint history. The local repo keeps it for the talk, and the README says why.

```sh
# 1. On main, tree clean
cd ~/code/work/AIM-startup/task/aim-personalized-web && git status --short

# 2. Only the tracked files of main, in a fresh folder
rm -rf /tmp/aim-public && mkdir /tmp/aim-public
git archive main | tar -x -C /tmp/aim-public

# 3. Gate: must print "RESULT: clean". The scanner reads the briefs and secrets to compare and never prints them
A=(--allow "Sirius Space Services")
python3 -I ../research/08-security-scan.py /tmp/aim-public --briefs data/briefs --env .env.local --env .dev.vars "${A[@]}"
gitleaks dir --redact /tmp/aim-public

# 4. One commit, explicit paths from main's own file list
cd /tmp/aim-public && git init -b main
git -C ~/code/work/AIM-startup/task/aim-personalized-web ls-tree -r --name-only main | xargs git --literal-pathspecs add --
git -c user.name="Lukáš Hellesch" -c user.email="<his public address>" commit -m "feat: aim personalized brief"
python3 -I ~/code/work/AIM-startup/task/research/08-security-scan.py /tmp/aim-public --briefs ~/code/work/AIM-startup/task/aim-personalized-web/data/briefs --env ~/code/work/AIM-startup/task/aim-personalized-web/.env.local "${A[@]}"
```

5. **(Lukáš)** Push the one commit to the empty remote. No force is needed:
   ```sh
   git remote add origin https://github.com/TheXik/aim-personalized-web.git
   git push -u origin main
   ```
6. **(Lukáš)** Look at the repo on GitHub while it is still private, then make it public.

Never push from the working repo, never with `--all` or `--mirror`, and never the `ui` or `infra` branches.

## CI/CD on GitHub

`.github/workflows/ci.yml`:
- **Every push and pull request (`check`):** install, typecheck, lint, tests on the synthetic briefs. No secrets, no model. Fork pull requests never get secrets, because nothing uses `pull_request_target`.
- **Production, by hand only:** in GitHub, Actions, CI, "Run workflow" on `main`. It runs only if the repository variable `ENABLE_PRODUCTION` is `true`, and waits for approval in the `production` environment. A push never deploys. The job:
  1. Restore the briefs from secrets.
  2. Run the real-data tests. Their output stays on the runner, because a failing diff can quote a brief and the logs are public.
  3. Run the model smoke check: 20 calls, gated, capped at 10 cents.
  4. Build through `scripts/cf-build.sh`.
  5. Deploy.
  6. Smoke-test the live site: strangers are refused, then sign in, all three readers, the briefs API, and one chat answer from the offline shortcuts.

`.github/workflows/eval.yml` runs all 74 requests on demand, behind the same switch and approval, capped at 10 cents.

Until production CI is switched on, the site is deployed from the Mac as above, and no key, token or brief has to sit in GitHub. That is the security advisor's recommendation. Turning it on is Lukáš's call.

**(Lukáš)** One-time setup, only if he turns production CI on:
1. Create the `production` environment with himself as required reviewer, and restrict its deployment branches to `main` (Settings, Environments). Required reviewers are free on public repositories.
2. A Cloudflare API token with an expiry date, this account only, zone `lukashellesch.com` only. Start from the "Edit Cloudflare Workers" template and remove Workers KV Storage, Workers R2 Storage and Workers Tail. Leave D1 out, because the database is created once from the Mac. Confidence: MODERATE that this is the minimal set. The first CI deploy names any missing permission.
3. `gh variable set ENABLE_PRODUCTION --body true`
4. Environment secrets. Each command reads its value from stdin or the prompt:
   ```sh
   E="--env production"
   gh secret set AZURE_OPENAI_API_KEY $E                    # paste at the prompt
   gh secret set CLOUDFLARE_API_TOKEN $E                    # paste at the prompt
   gh secret set CLOUDFLARE_ACCOUNT_ID $E                   # paste at the prompt
   grep '^SITE_PASSWORD=' .env.local | cut -d= -f2- | gh secret set SITE_PASSWORD $E
   base64 -i data/briefs/brief-space-launch.json  | gh secret set BRIEF_SPACE_LAUNCH $E
   base64 -i data/briefs/brief-enterprise-ai.json | gh secret set BRIEF_ENTERPRISE_AI $E
   base64 -i data/briefs/brief-cz-sk-ai.json      | gh secret set BRIEF_CZ_SK_AI $E
   ```
   The largest brief is 23 KB, about 31 KB as base64, under GitHub's 48 KB secret limit.

## Cost per run

| Run | When | Model calls | Model cost | Runner time |
|---|---|---|---|---|
| `check` | every push and PR | 0 | $0 | about 3 min |
| Production | "Run workflow", after approval | 20 | about $0.012 with the prompt cache, $0.028 without, hard cap $0.10 | about 6 min |
| Full eval | "Run workflow", after approval | 74 | about $0.045 cached, $0.104 uncached, cap $0.10 | about 5 min |
| Live site | per reader message | 1 | about $0.0006 to $0.0014, at most $0.10 a day | |

- Model cost uses the measured $0.00061 per call with the prompt cache and about $0.0014 without (research 05). Confidence: MODERATE. An uncached full eval can hit the 10-cent cap a few calls before the end and stop.
- Runner minutes are free on public repositories.
- A CI run spends against its own 10-cent cap in a fresh file ledger. It does not count toward the live site's daily cap in D1.

## Known limits, accepted for the demo

- The session cookie is signed with the password. Anyone holding a cookie could try to guess the password offline. With a random 23-character password (about 99 bits) that is out of reach, and production refuses to run with one shorter than 16 characters. A separate random `SESSION_SECRET` would remove the link if the password ever becomes something memorable.
- Wrong passwords only cost a 400 ms pause. Optional: one Cloudflare WAF rate-limiting rule on `POST /api/login` per IP (dashboard, Security, WAF, Rate limiting rules).
