#!/usr/bin/env bash
set -euo pipefail
export PORT=18373
export POSTGRES_PASSWORD BEN_PASSWORD ROBIN_PASSWORD ERWIN_PASSWORD
POSTGRES_PASSWORD="$(openssl rand -hex 24)"
BEN_PASSWORD="$(openssl rand -hex 24)"
ROBIN_PASSWORD="$(openssl rand -hex 24)"
ERWIN_PASSWORD="$(openssl rand -hex 24)"
compose=(docker compose -p hoi4wise-ci -f docker-compose.yml -f tests/compose.ci.yml)
jar="$(mktemp)"
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then "${compose[@]}" logs --tail=100; fi
  rm -f "$jar"
  "${compose[@]}" down -v
}
trap cleanup EXIT

docker build -t hoi4wise:smoke .
"${compose[@]}" up -d --wait --wait-timeout 120
status="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:18373/api/state)"
test "$status" = 401
# Het testwachtwoord komt via stdin binnen; er worden geen productiecredentials gebruikt.
printf '{"username":"erwin","password":"%s"}' "$ERWIN_PASSWORD" | curl -fsS -c "$jar" -H 'Content-Type: application/json' --data-binary @- http://localhost:18373/api/login
curl -fsS -b "$jar" -H 'X-HOI4Wise-User: erwin' -X PUT -H 'Content-Type: application/json' --data '{"profile":{"dlc":[],"version":"1.19.4"},"favorites":[],"campaigns":[{"id":"smoke","country":"GER","route":"ger-basis","date":"1936-01-01","done":[],"notes":"persist-marker"}]}' http://localhost:18373/api/state
"${compose[@]}" restart hoi4wise
for i in {1..30}; do curl -fsS http://localhost:18373/api/health && break || sleep 1; done
curl -fsS -b "$jar" -H 'X-HOI4Wise-User: erwin' http://localhost:18373/api/state | grep 'persist-marker'
"${compose[@]}" stop postgres
status="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:18373/api/health)"
test "$status" = 503
status="$(curl -s -b "$jar" -H 'X-HOI4Wise-User: erwin' -o /dev/null -w '%{http_code}' http://localhost:18373/api/state)"
test "$status" = 503
"${compose[@]}" rm -f postgres
"${compose[@]}" up -d --wait --wait-timeout 120
curl -fsS -b "$jar" -H 'X-HOI4Wise-User: erwin' http://localhost:18373/api/state | grep 'persist-marker'
curl -fsS -b "$jar" -H 'X-HOI4Wise-User: erwin' -X DELETE http://localhost:18373/api/campaigns/smoke
state="$(curl -fsS -b "$jar" -H 'X-HOI4Wise-User: erwin' http://localhost:18373/api/state)"
if grep -q 'persist-marker' <<< "$state"; then exit 1; fi
