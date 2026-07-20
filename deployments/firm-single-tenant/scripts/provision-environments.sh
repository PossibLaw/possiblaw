#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
repo_root=$(CDPATH= cd -- "$root/../.." && pwd)
secret_dir=$root/.secrets
runtime_dir=$root/runtime
compose_file=$root/compose.yaml
bindings_file=${POSSIBLAW_PRINCIPAL_BINDINGS_FILE:-$runtime_dir/principal-bindings.json}
paperclip_port=${PAPERCLIP_HOST_PORT:-3100}
case "$paperclip_port" in
  ""|*[!0-9]*) echo "PAPERCLIP_HOST_PORT must be numeric" >&2; exit 1 ;;
esac
if [ "$paperclip_port" -lt 1 ] || [ "$paperclip_port" -gt 65535 ]; then
  echo "PAPERCLIP_HOST_PORT is out of range" >&2
  exit 1
fi
base_url=http://127.0.0.1:$paperclip_port
board_key_file=${PAPERCLIP_BOARD_API_KEY_FILE:-$secret_dir/board-api-key}

command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }

require_id() {
  name=$1
  eval "value=\${$name:-}"
  case "$value" in
    ""|*[!A-Za-z0-9_-]*) echo "$name is missing or invalid" >&2; exit 1 ;;
  esac
}
for variable in PAPERCLIP_COMPANY_ID PAPERCLIP_GATE_AGENT_ID WORKER_A_AGENT_ID WORKER_B_AGENT_ID; do
  require_id "$variable"
done
if [ "$PAPERCLIP_GATE_AGENT_ID" = "$WORKER_A_AGENT_ID" ] \
  || [ "$PAPERCLIP_GATE_AGENT_ID" = "$WORKER_B_AGENT_ID" ] \
  || [ "$WORKER_A_AGENT_ID" = "$WORKER_B_AGENT_ID" ]; then
  echo "Gate, worker A, and worker B must use three distinct immutable agent identities" >&2
  exit 1
fi
board_key=${PAPERCLIP_API_KEY:-}
board_key_from_file=false
if [ -z "$board_key" ]; then
  if [ ! -f "$board_key_file" ] || [ -L "$board_key_file" ]; then
    echo "set PAPERCLIP_API_KEY or point PAPERCLIP_BOARD_API_KEY_FILE at a regular private file" >&2
    exit 1
  fi
  IFS= read -r board_key < "$board_key_file" || true
  board_key_from_file=true
fi
if [ -z "$board_key" ]; then
  echo "board API key file is empty" >&2
  exit 1
fi
case "$board_key" in
  *[!A-Za-z0-9._~+/=-]*) echo "board API key is malformed" >&2; exit 1 ;;
esac
if [ "$board_key_from_file" = true ] && [ "$(wc -l < "$board_key_file" | tr -d ' ')" -gt 1 ]; then
  echo "board API key file must contain one line" >&2
  exit 1
fi
umask 077
if [ -L "$runtime_dir" ]; then
  echo "refusing symlink runtime directory" >&2
  exit 1
fi
mkdir -p "$runtime_dir"
header_file=$(mktemp "$runtime_dir/.board-header.XXXXXX")
agents_file=
agent_header=
key_temp=
worker_keys_changed=false
cleanup() {
  rm -f "$header_file"
  if [ -n "$agents_file" ]; then
    rm -f "$agents_file"
  fi
  if [ -n "$agent_header" ]; then
    rm -f "$agent_header"
  fi
  if [ -n "$key_temp" ]; then
    rm -f "$key_temp"
  fi
}
trap cleanup EXIT HUP INT TERM
printf 'Authorization: Bearer %s\n' "$board_key" > "$header_file"
unset board_key

mint_agent_key() {
  agent_id=$1
  key_name=$2
  output=$3
  worker_key=${4:-false}
  current=
  if [ -L "$output" ]; then
    echo "refusing symlink agent key file" >&2
    exit 1
  fi
  if [ -f "$output" ] && [ ! -L "$output" ]; then
    IFS= read -r current < "$output" || true
  fi
  case "$current" in
    UNPROVISIONED_*) ;;
    "") ;;
    *) return 0 ;;
  esac
  response=$(printf '{"name":"%s"}' "$key_name" | api POST "/api/agents/$agent_id/keys" --data-binary @-)
  key_temp=$output.tmp.$$
  printf '%s' "$response" | jq -er '.token | strings | select(length > 0)' > "$key_temp"
  printf '\n' >> "$key_temp"
  chmod 600 "$key_temp"
  mv "$key_temp" "$output"
  key_temp=
  if [ "$worker_key" = true ]; then
    worker_keys_changed=true
  fi
  response=
  current=
}

# api accepts optional curl payload arguments without placing secret bodies in argv.
api() {
  method=$1
  path=$2
  shift 2
  curl --fail --silent --show-error --max-time 30 \
    -X "$method" \
    -H "@$header_file" \
    -H "Content-Type: application/json" \
    "$@" \
    "$base_url$path"
}

verify_agent_key() {
  agent_id=$1
  key_path=$2
  if [ ! -f "$key_path" ] || [ -L "$key_path" ]; then
    echo "agent key file is missing or unsafe" >&2
    exit 1
  fi
  IFS= read -r agent_key < "$key_path" || true
  case "$agent_key" in
    ""|*[!A-Za-z0-9._~+/=-]*) echo "agent key file is malformed" >&2; exit 1 ;;
  esac
  if [ "$(wc -l < "$key_path" | tr -d ' ')" -gt 1 ]; then
    echo "agent key file must contain one line" >&2
    exit 1
  fi
  agent_header=$(mktemp "$runtime_dir/.agent-header.XXXXXX")
  printf 'Authorization: Bearer %s\n' "$agent_key" > "$agent_header"
  identity=$(curl --fail --silent --show-error --max-time 15 -H "@$agent_header" "$base_url/api/agents/me")
  rm -f "$agent_header"
  agent_header=
  printf '%s' "$identity" | jq -e \
    --arg agent "$agent_id" \
    --arg company "$PAPERCLIP_COMPANY_ID" \
    '.id == $agent and .companyId == $company' >/dev/null || {
      echo "agent key is not bound to the expected immutable agent/company" >&2
      exit 1
    }
  agent_key=
  identity=
}

agents_file=$(mktemp "$runtime_dir/.agents.XXXXXX")
api GET "/api/companies/$PAPERCLIP_COMPANY_ID/agents" > "$agents_file"
python3 "$repo_root/bin/_possiblaw_authorization.py" \
  --template "$repo_root/companies/legal-operations/gate-authorization.json" \
  --bindings "$bindings_file" \
  --agents "$agents_file" \
  --company-id "$PAPERCLIP_COMPANY_ID" \
  --catalog-root "$repo_root/companies/legal-operations/agents" \
  --output "$runtime_dir/gate-authorization.json"

verify_worker_agent_config() {
  agent_id=$1
  agent=$(api GET "/api/agents/$agent_id")
  printf '%s' "$agent" | jq -e \
    --arg agent "$agent_id" \
    --arg company "$PAPERCLIP_COMPANY_ID" '
      .id == $agent and
      .companyId == $company and
      ([
        .. | objects | keys[] |
        select(
          test("(^|_)(API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|CLIENT_SECRET|PASSWORD|PRIVATE_KEY|AUTH_SECRET)$") or
          . == "BETTER_AUTH_SECRET" or
          . == "DATABASE_URL" or
          . == "PAPERCLIP_SECRETS_MASTER_KEY" or
          . == "PAPERCLIP_SECRETS_MASTER_KEY_FILE"
        )
      ] | length == 0)
    ' >/dev/null || {
      echo "worker agent configuration is cross-company or carries a forbidden direct secret" >&2
      exit 1
    }
}

verify_worker_agent_config "$WORKER_A_AGENT_ID"
verify_worker_agent_config "$WORKER_B_AGENT_ID"

mint_agent_key "$PAPERCLIP_GATE_AGENT_ID" "possiblaw-gate-control" "$secret_dir/gate-control-agent-key" false
mint_agent_key "$WORKER_A_AGENT_ID" "possiblaw-worker-a-gate" "$secret_dir/worker-a-gate-key" true
mint_agent_key "$WORKER_B_AGENT_ID" "possiblaw-worker-b-gate" "$secret_dir/worker-b-gate-key" true
verify_agent_key "$PAPERCLIP_GATE_AGENT_ID" "$secret_dir/gate-control-agent-key"
verify_agent_key "$WORKER_A_AGENT_ID" "$secret_dir/worker-a-gate-key"
verify_agent_key "$WORKER_B_AGENT_ID" "$secret_dir/worker-b-gate-key"

if [ "$worker_keys_changed" = true ]; then
  # Compose file-backed secrets may retain the old sentinel inode in a running
  # container after atomic replacement. Recreate before any SSH probe so the
  # worker can only observe the newly verified agent credential.
  docker compose -f "$compose_file" up -d --force-recreate --no-deps worker-a worker-b >/dev/null
  for worker in worker-a worker-b; do
    attempts=0
    while ! docker compose -f "$compose_file" exec -T "$worker" /usr/local/bin/worker-healthcheck >/dev/null 2>&1; do
      attempts=$((attempts + 1))
      if [ "$attempts" -ge 30 ]; then
        echo "$worker did not become healthy after credential remount" >&2
        exit 1
      fi
      sleep 1
    done
  done
fi

host_public_key() {
  worker=$1
  docker compose -f "$compose_file" exec -T "$worker" \
    sh -c 'awk "NR == 1 { print \$1 \" \" \$2; exit }" /var/lib/possiblaw-worker/ssh_host_ed25519_key.pub'
}

ensure_environment() {
  suffix=$1
  agent_id=$2
  ingress=ssh-ingress-$suffix
  name="PossibLaw worker $(printf '%s' "$suffix" | tr '[:lower:]' '[:upper:]')"
  client_key=$secret_dir/worker-$suffix-ssh-client-key
  if [ ! -f "$client_key" ] || [ -L "$client_key" ]; then
    echo "worker $suffix SSH client key is missing or unsafe" >&2
    exit 1
  fi
  host_key=$(host_public_key "worker-$suffix")
  case "$host_key" in ssh-ed25519\ *) ;; *) echo "worker $suffix host key is unavailable" >&2; exit 1 ;; esac
  known_hosts="[$ingress]:2222 $host_key"

  environments=$(api GET "/api/companies/$PAPERCLIP_COMPANY_ID/environments?driver=ssh")
  existing=$(printf '%s' "$environments" | jq -c --arg name "$name" '[.[] | select(.name == $name)]')
  count=$(printf '%s' "$existing" | jq 'length')
  if [ "$count" -gt 1 ]; then
    echo "multiple SSH environments have the reserved name: $name" >&2
    exit 1
  fi
  if [ "$count" -eq 1 ]; then
    environment=$(printf '%s' "$existing" | jq -c '.[0]')
    printf '%s' "$environment" | jq -e \
      --arg host "$ingress" \
      --arg known "$known_hosts" \
      '.driver == "ssh" and .config.host == $host and .config.port == 2222 and .config.username == "possiblaw" and .config.remoteWorkspacePath == "/workspace" and .config.strictHostKeyChecking == true and .config.knownHosts == $known and .config.privateKey == null and .config.privateKeySecretRef.type == "secret_ref"' \
      >/dev/null || {
        echo "existing environment $name differs from the attested topology; rotate it explicitly" >&2
        exit 1
      }
  else
    environment=$(jq -cn \
      --arg name "$name" \
      --arg host "$ingress" \
      --arg known "$known_hosts" \
      --rawfile privateKey "$client_key" \
      '{name:$name,description:"PossibLaw isolated non-root SSH worker",driver:"ssh",status:"active",config:{host:$host,port:2222,username:"possiblaw",remoteWorkspacePath:"/workspace",privateKey:$privateKey,knownHosts:$known,strictHostKeyChecking:true},metadata:{possiblawReference:"firm-single-tenant-v1"}}' \
      | api POST "/api/companies/$PAPERCLIP_COMPANY_ID/environments" --data-binary @-)
  fi
  printf '%s' "$environment" | jq -e \
    '.config.privateKey == null and .config.privateKeySecretRef.type == "secret_ref"' >/dev/null || {
      echo "Paperclip did not persist the SSH private key through a secret reference" >&2
      exit 1
    }
  environment_id=$(printf '%s' "$environment" | jq -er '.id | strings')
  probe=$(api POST "/api/environments/$environment_id/probe" --data-binary @/dev/null)
  printf '%s' "$probe" | jq -e '.ok == true' >/dev/null || {
    echo "SSH environment probe failed for worker $suffix" >&2
    exit 1
  }
  printf '{"defaultEnvironmentId":"%s"}' "$environment_id" \
    | api PATCH "/api/agents/$agent_id" --data-binary @- >/dev/null
}

ensure_environment a "$WORKER_A_AGENT_ID"
ensure_environment b "$WORKER_B_AGENT_ID"

echo "Provisioned two company-scoped SSH environments and immutable gate authorization."
echo "No credential values were printed."
