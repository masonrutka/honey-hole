#!/usr/bin/env bash
# Run the security suite against a throwaway local Postgres.
#
# These tests exercise the Row Level Security policies, the rate limits and the
# signup trigger by actually trying to break them. They need a real Postgres
# because none of that logic runs anywhere else -- it is invisible to tsc,
# eslint and vitest.
#
#   brew install postgresql@16
#   ./supabase/test/run.sh
set -euo pipefail

export LC_ALL=C
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
export PATH="$PG_BIN:$PATH"
# A free high port, so this never collides with anything already running.
PORT="${PGPORT:-$(python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()")}"
DATA="$(mktemp -d /tmp/hhdata.XXXX)/pgdata"
SOCK="$(mktemp -d /tmp/hhpg.XXXX)"
HERE="$(cd "$(dirname "$0")" && pwd)"

cleanup() { pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; }
trap cleanup EXIT

initdb -D "$DATA" -U postgres --locale=C -E UTF8 >/dev/null
pg_ctl -D "$DATA" -o "-p $PORT -k $SOCK" -l "$DATA/pg.log" start >/dev/null
sleep 2

psql_q() { psql -h 127.0.0.1 -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1 "$@"; }

psql_q -f "$HERE/00_supabase_harness.sql" >/dev/null
psql_q -f "$HERE/../schema.sql" >/dev/null
echo "schema loaded"
# Re-running must be safe; the file says so, so prove it.
psql_q -f "$HERE/../schema.sql" >/dev/null
echo "schema is re-runnable"

psql -h 127.0.0.1 -p "$PORT" -U postgres -q -f "$HERE/01_security.sql" >/dev/null 2>&1 || true

psql -h 127.0.0.1 -p "$PORT" -U postgres \
  -c "select case when pass then 'PASS' else '*** FAIL ***' end as r, name, left(detail,52) as detail from results order by n;"

FAILED=$(psql -h 127.0.0.1 -p "$PORT" -U postgres -tAc "select count(*) from results where not pass;")
TOTAL=$(psql -h 127.0.0.1 -p "$PORT" -U postgres -tAc "select count(*) from results;")
echo
echo "$((TOTAL - FAILED)) passed / $TOTAL total"
[ "$FAILED" = "0" ] || { echo "SECURITY TESTS FAILED"; exit 1; }
