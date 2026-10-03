#!/bin/sh
set -eu
case "${TOKTOK_BACKEND:?backend required}" in
  sqlite) exec flock -n -F "${TOKTOK_SQLITE_FILE:?SQLite file required}.owner" node dist/main.mjs "$@" ;;
  postgres) exec node dist/main.mjs "$@" ;;
  *) exit 64 ;;
esac
