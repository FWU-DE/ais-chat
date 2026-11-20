#!/bin/bash

# Set this variable to "true" to enable exporting the realm and users after Keycloak shuts down.
RUN_EXPORT="false"

export() {
  kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true

  if [[ "$RUN_EXPORT" != "true" ]]; then
    echo "RUN_EXPORT is not true, skipping export."
    return
  fi

  echo "Exporting realm and users..."
  mkdir -p /opt/keycloak/data/import/export
  rm -f /opt/keycloak/data/import/export/ais-chat-*.json
  if /opt/keycloak/bin/kc.sh export \
    --db dev-file \
    --file /opt/keycloak/data/import/export/ais-chat-local-realm.json \
    --users same_file \
    --realm ais-chat-local; then
    echo "Realm and users exported successfully."
  else
    echo "Realm and users export failed." >&2
  fi
  if /opt/keycloak/bin/kc.sh export \
    --db dev-file \
    --file /opt/keycloak/data/import/export/ais-chat-admin-local-realm.json \
    --users same_file \
    --realm ais-chat-admin-local; then
    echo "Admin Realm and users exported successfully."
  else
    echo "Admin Realm and users export failed." >&2
  fi
}

trap 'export' SIGTERM

/opt/keycloak/bin/kc.sh start-dev --import-realm --db dev-file &
PID=$!
wait $PID
