#!/usr/bin/env bash
# Post-deploy smoke test against production. Signs in with SITE_PASSWORD, then
# checks the three reader pages, the briefs API and one chat request that is
# answered by the offline shortcuts, so it costs no model call.
set -uo pipefail
url="${SITE_URL:?SITE_URL is not set}"
: "${SITE_PASSWORD:?SITE_PASSWORD is not set}"
jar="$(mktemp)"
trap 'rm -f "$jar"' EXIT
fail=0

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$@"; }
check() {
  if [ "$2" = "$1" ]; then echo "ok   $3 ($2)"; else echo "FAIL $3: got $2, want $1"; fail=1; fi
}

check 307 "$(code "$url/")" "home sends a stranger to sign-in"
check 308 "$(code "$url/r/space-launch")" "old /r/ link redirects permanently to /brief/"
check 307 "$(code "$url/brief/space-launch")" "reader page sends a stranger to sign-in"
check 307 "$(code -H 'RSC: 1' "$url/brief/space-launch")" "reader page RSC request sends a stranger to sign-in"
check 401 "$(code "$url/api/briefs/space-launch")" "briefs API refuses a stranger"
check 401 "$(code -H 'RSC: 1' "$url/api/briefs/space-launch")" "briefs API refuses a stranger RSC request"
check 401 "$(code -X POST -H 'content-type: application/json' -d '{}' "$url/api/chat")" "chat API refuses a stranger"
check 303 "$(code -c "$jar" -X POST --data-urlencode "password=$SITE_PASSWORD" "$url/api/login")" "sign in"
for reader in space-launch enterprise-ai cz-sk-ai; do
  check 200 "$(code -b "$jar" "$url/brief/$reader")" "reader page /brief/$reader"
  check 200 "$(code -b "$jar" "$url/api/briefs/$reader")" "briefs API $reader"
done

# x-chat-offline makes the route skip the model and use its shortcuts. It can only lower spend.
answer="$(curl -s --max-time 30 -b "$jar" -H 'content-type: application/json' -H 'x-chat-offline: 1' \
  -d '{"reader":"enterprise-ai","request":"numbers first","spec":null}' "$url/api/chat")"
case "$answer" in
  *'"source":"offline"'*) echo "ok   chat answered by the offline shortcuts" ;;
  *) echo "FAIL chat: expected an offline answer"; fail=1 ;;
esac
exit "$fail"
