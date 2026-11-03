#!/usr/bin/env bash
# Restores Aim's briefs from base64 GitHub secrets into data/briefs/ for the
# production job. The tags files are tracked in git (names and hashes only). Prints file names, sizes and short hashes only, never content.
set -euo pipefail
mkdir -p data/briefs

restore() {
  local var="$1" file="data/briefs/$2" value="${!1:-}"
  if [ -z "$value" ]; then
    echo "::error::GitHub secret $var is not set"
    exit 1
  fi
  printf '%s' "$value" | base64 --decode > "$file"
  echo "restored $2: $(wc -c < "$file" | tr -d ' ') bytes, sha256 $(sha256sum "$file" | cut -c1-12)"
}

restore BRIEF_SPACE_LAUNCH brief-space-launch.json
restore BRIEF_ENTERPRISE_AI brief-enterprise-ai.json
restore BRIEF_CZ_SK_AI brief-cz-sk-ai.json
