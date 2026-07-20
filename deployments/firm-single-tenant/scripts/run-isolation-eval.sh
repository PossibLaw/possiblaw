#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_file=$root/compose.yaml
secret_dir=$root/.secrets
known_hosts=$(mktemp "${TMPDIR:-/tmp}/possiblaw-known-hosts.XXXXXX")
trap 'rm -f "$known_hosts"' EXIT HUP INT TERM
chmod 600 "$known_hosts"

command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }
command -v ssh >/dev/null 2>&1 || { echo "ssh is required" >&2; exit 1; }

docker compose -f "$compose_file" --profile isolation-eval up -d

validate_result() {
  result=$1
  printf '%s' "$result" | jq -e '
    type == "object" and
    (to_entries | length > 0) and
    (to_entries | all(
      (.value == true) or
      ((.value | type) == "string" and (.value | test("^[0-9a-f]{64}$")))
    ))
  ' >/dev/null
}

run_worker() {
  suffix=$1
  port=$2
  private_key=$secret_dir/worker-$suffix-ssh-client-key
  if [ ! -f "$private_key" ] || [ -L "$private_key" ]; then
    echo "worker $suffix SSH client key is missing or unsafe" >&2
    exit 1
  fi
  : > "$known_hosts"
  host_key=$(docker compose -f "$compose_file" exec -T "worker-$suffix" \
    sh -c 'awk "NR == 1 { print \$1 \" \" \$2; exit }" /var/lib/possiblaw-worker/ssh_host_ed25519_key.pub')
  case "$host_key" in ssh-ed25519\ *) ;; *) echo "worker $suffix host key is unavailable" >&2; exit 1 ;; esac
  printf '[127.0.0.1]:%s %s\n' "$port" "$host_key" > "$known_hosts"
  if ! result=$(ssh \
      -i "$private_key" \
      -p "$port" \
      -o BatchMode=yes \
      -o IdentitiesOnly=yes \
      -o StrictHostKeyChecking=yes \
      -o UserKnownHostsFile="$known_hosts" \
      possiblaw@127.0.0.1 \
      "env PAPERCLIP_API_KEY=synthetic-bridge-token-$suffix /usr/local/bin/possiblaw-isolation-probe"); then
    echo "worker $suffix isolation probe failed" >&2
    exit 1
  fi
  validate_result "$result" || {
    echo "worker $suffix isolation result did not satisfy the fail-closed contract" >&2
    exit 1
  }
  printf '%s\n' "$result"
}

run_worker a "${WORKER_A_SSH_HOST_PORT:-22221}"
run_worker b "${WORKER_B_SSH_HOST_PORT:-22222}"
