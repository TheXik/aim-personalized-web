#!/usr/bin/env bash
# Builds the Cloudflare Worker without baking secrets into it.
# OpenNext compiles every .env* file it finds into the Worker script, so the
# Azure key and the site password in .env.local would ship in plaintext and
# override the real Cloudflare secrets. This hides those files for the build,
# puts them back afterwards (also on failure), then checks the output:
# no secret names in the compiled env, no brief text in public assets.
# Secrets for production are Cloudflare secrets. For `cf:preview` use .dev.vars.
set -euo pipefail
cd "$(dirname "$0")/.."

hidden=()
restore() {
  for f in "${hidden[@]+"${hidden[@]}"}"; do mv "$f.cf-build-hidden" "$f"; done
}
trap restore EXIT

for f in .env .env.local .env.production .env.production.local .env.development .env.development.local; do
  if [ -f "$f" ]; then
    mv "$f" "$f.cf-build-hidden"
    hidden+=("$f")
  fi
done
[ ${#hidden[@]} -gt 0 ] && echo "hid ${hidden[*]} for the build"

pnpm exec opennextjs-cloudflare build

env_file=.open-next/cloudflare/next-env.mjs
if [ -f "$env_file" ] && grep -qE 'AZURE_OPENAI_API_KEY|SITE_PASSWORD' "$env_file"; then
  echo "::error::$env_file names a secret. It would ship in the Worker. Not deploying."
  exit 1
fi

node scripts/check-public-assets.mjs
