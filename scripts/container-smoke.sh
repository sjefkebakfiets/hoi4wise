#!/usr/bin/env bash
set -euo pipefail
export PORT=18373
export POSTGRES_PASSWORD
POSTGRES_PASSWORD="$(openssl rand -hex 24)"
compose=(docker compose -p hoi4wise-ci -f docker-compose.yml -f tests/compose.ci.yml)
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then "${compose[@]}" logs --tail=100; fi
  "${compose[@]}" down -v
}
trap cleanup EXIT

docker build -t hoi4wise:smoke .
"${compose[@]}" up -d --wait --wait-timeout 120
curl -fsS -X PUT -H 'Content-Type: application/json' --data '{"profile":{"dlc":[],"version":"1.19.3"},"favorites":[],"campaigns":[{"id":"smoke","country":"GER","route":"ger-basis","date":"1936-01-01","done":[],"notes":"persist-marker"}]}' http://localhost:18373/api/state
"${compose[@]}" restart hoi4wise
for i in {1..30}; do curl -fsS http://localhost:18373/api/health && break || sleep 1; done
curl -fsS http://localhost:18373/api/state | grep 'persist-marker'

# Uitval moet zichtbaar worden, zonder campagnegegevens te wijzigen.
"${compose[@]}" stop postgres
status="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:18373/api/health)"
test "$status" = 503
status="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:18373/api/state)"
test "$status" = 503

# Ook na vervanging van de databasecontainer moet het volume behouden blijven.
"${compose[@]}" rm -f postgres
"${compose[@]}" up -d --wait --wait-timeout 120
curl -fsS http://localhost:18373/api/state | grep 'persist-marker'
