#!/bin/bash

export() {
  kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
  echo "Exporting realm and users..."
  mkdir -p /opt/keycloak/data/import/export
  rm -f /opt/keycloak/data/import/export/ais-chat-local-users-*.json
  if /opt/keycloak/bin/kc.sh export \
    --db dev-file \
    --file /opt/keycloak/data/import/export/ais-chat-local-realm.json \
    --users same_file \
    --realm ais-chat-local; then
    echo "Realm and users exported successfully."
  else
    echo "Realm and users export failed." >&2
  fi
}

trap 'export' SIGTERM

/opt/keycloak/bin/kc.sh start-dev --import-realm --db dev-file &
PID=$!
wait $PID
