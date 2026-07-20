#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
secret_dir=$root/.secrets
umask 077

command -v openssl >/dev/null 2>&1 || { echo "openssl is required" >&2; exit 1; }
command -v ssh-keygen >/dev/null 2>&1 || { echo "ssh-keygen is required" >&2; exit 1; }
if [ -L "$secret_dir" ]; then
  echo "refusing symlink secret directory" >&2
  exit 1
fi
mkdir -p "$secret_dir"
chmod 700 "$secret_dir"

random_secret() {
  target=$1
  prefix=${2:-}
  if [ -L "$target" ]; then
    echo "refusing symlink secret file" >&2
    exit 1
  fi
  if [ ! -e "$target" ]; then
    temp=$target.tmp.$$
    printf '%s' "$prefix" > "$temp"
    openssl rand -hex 32 >> "$temp"
    printf '\n' >> "$temp"
    chmod 600 "$temp"
    mv "$temp" "$target"
  fi
  chmod 600 "$target"
}

random_secret "$secret_dir/postgres-password"
random_secret "$secret_dir/better-auth-secret"
random_secret "$secret_dir/worker-a-ai-gateway-key"
random_secret "$secret_dir/worker-b-ai-gateway-key"
random_secret "$secret_dir/gate-control-agent-key" "UNPROVISIONED_"
random_secret "$secret_dir/worker-a-gate-key" "UNPROVISIONED_"
random_secret "$secret_dir/worker-b-gate-key" "UNPROVISIONED_"

for worker in a b; do
  private_key=$secret_dir/worker-$worker-ssh-client-key
  if [ -L "$private_key" ] || [ -L "$private_key.pub" ]; then
    echo "refusing symlink SSH key material" >&2
    exit 1
  fi
  if [ ! -e "$private_key" ] && [ ! -e "$private_key.pub" ]; then
    ssh-keygen -q -t ed25519 -N "" -C "possiblaw-worker-$worker" -f "$private_key"
  elif [ ! -f "$private_key" ] || [ ! -f "$private_key.pub" ]; then
    echo "incomplete SSH client keypair for worker $worker" >&2
    exit 1
  fi
  chmod 600 "$private_key"
  chmod 644 "$private_key.pub"
done

for secret in \
  postgres-password better-auth-secret \
  gate-control-agent-key worker-a-gate-key worker-b-gate-key \
  worker-a-ai-gateway-key worker-b-ai-gateway-key
do
  path=$secret_dir/$secret
  if [ ! -s "$path" ] || [ -L "$path" ] || [ "$(wc -l < "$path" | tr -d ' ')" -gt 1 ]; then
    echo "secret material is empty, multiline, or unsafe: $secret" >&2
    exit 1
  fi
done
if cmp -s "$secret_dir/worker-a-ai-gateway-key" "$secret_dir/worker-b-ai-gateway-key"; then
  echo "worker AI gateway credentials must be distinct" >&2
  exit 1
fi
if cmp -s "$secret_dir/worker-a-ssh-client-key.pub" "$secret_dir/worker-b-ssh-client-key.pub"; then
  echo "worker SSH identities must be distinct" >&2
  exit 1
fi

echo "Initialized private deployment material under $secret_dir"
echo "Gate key files remain fail-closed UNPROVISIONED sentinels until provision-environments.sh succeeds."
