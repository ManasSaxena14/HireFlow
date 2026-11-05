#!/bin/sh
# Runs a private PostgreSQL database for development from .pgdata/ on port 5433.
# It does not touch any other database on your computer.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.pgdata"
PORT="${HIREFLOW_DB_PORT:-5433}"

# On macOS, PostgreSQL will not start without a valid locale.
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

command -v pg_ctl >/dev/null 2>&1 || {
  echo "pg_ctl not found. Install PostgreSQL 15+ first (macOS: brew install postgresql@16)." >&2
  exit 1
}

case "$1" in
  start)
    if [ ! -f "$DATA/PG_VERSION" ]; then
      initdb -D "$DATA" --username=hireflow --auth=trust --encoding=UTF8 >/dev/null
      echo "Created database cluster in .pgdata"
    fi
    if pg_ctl -D "$DATA" status >/dev/null 2>&1; then
      echo "PostgreSQL is already running on port $PORT"
    else
      pg_ctl -D "$DATA" -l "$DATA/server.log" -o "-p $PORT -k '' -c listen_addresses=localhost" -w start >/dev/null
      echo "PostgreSQL started on port $PORT"
    fi
    ;;
  stop)
    pg_ctl -D "$DATA" -m fast stop
    ;;
  *)
    echo "usage: local-db.sh start|stop" >&2
    exit 1
    ;;
esac
