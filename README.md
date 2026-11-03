# Aim weekly brief, personalised

A Next.js page that shows a reader their weekly Aim brief, plus a chat that reshapes the page in plain language. The reader's view is saved as a small spec and applied to every future brief without calling the model.

## Run

```bash
pnpm install
cp .env.example .env.local   # then paste the Azure key
pnpm dev                     # http://localhost:3000
pnpm test                    # engine unit tests, no model calls
```

The full README (design, decisions, what next) is written at the end of the build.
