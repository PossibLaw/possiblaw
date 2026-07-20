#!/bin/sh
set -eu

case "${POSSIBLAW_WORKER_ID:-}" in
  worker-a)
    key_file=/run/secrets/worker_a_ssh_authorized_key
    expected_gate_url=http://gate-ingress-a:3802
    expected_gate_key_file=/run/secrets/worker_a_gate_key
    expected_ai_url=http://ai-gateway-a:4000
    expected_ai_key_file=/run/secrets/worker_a_ai_gateway_key
    expected_peer_host=worker-b
    expected_peer_ip=172.32.0.20
    expected_foreign_host=foreign-company-sentinel
    expected_foreign_ip=172.34.0.20
    expected_ssh_ingress_host=ssh-ingress-a
    ;;
  worker-b)
    key_file=/run/secrets/worker_b_ssh_authorized_key
    expected_gate_url=http://gate-ingress-b:3802
    expected_gate_key_file=/run/secrets/worker_b_gate_key
    expected_ai_url=http://ai-gateway-b:4000
    expected_ai_key_file=/run/secrets/worker_b_ai_gateway_key
    expected_peer_host=worker-a
    expected_peer_ip=172.31.0.20
    expected_foreign_host=foreign-company-sentinel
    expected_foreign_ip=172.34.0.20
    expected_ssh_ingress_host=ssh-ingress-b
    ;;
  *)
    echo "worker identity is missing or invalid" >&2
    exit 1
    ;;
esac
if [ "${POSSIBLAW_GATE_URL:-}" != "$expected_gate_url" ] \
  || [ "${POSSIBLAW_GATE_API_KEY_FILE:-}" != "$expected_gate_key_file" ] \
  || [ "${POSSIBLAW_AI_GATEWAY_URL:-}" != "$expected_ai_url" ] \
  || [ "${POSSIBLAW_AI_GATEWAY_API_KEY_FILE:-}" != "$expected_ai_key_file" ] \
  || [ "${POSSIBLAW_PEER_WORKER_HOST:-}" != "$expected_peer_host" ] \
  || [ "${POSSIBLAW_PEER_WORKER_IP:-}" != "$expected_peer_ip" ] \
  || [ "${POSSIBLAW_FOREIGN_COMPANY_HOST:-}" != "$expected_foreign_host" ] \
  || [ "${POSSIBLAW_FOREIGN_COMPANY_IP:-}" != "$expected_foreign_ip" ] \
  || [ "${POSSIBLAW_SSH_INGRESS_HOST:-}" != "$expected_ssh_ingress_host" ]; then
  echo "worker boundary endpoint configuration does not match its immutable lane" >&2
  exit 1
fi

if [ ! -f "$key_file" ] || [ -L "$key_file" ]; then
  echo "worker SSH authorized key is missing or unsafe" >&2
  exit 1
fi
IFS= read -r public_key < "$key_file" || true
case "$public_key" in
  ssh-ed25519\ *) ;;
  *)
    echo "worker SSH authorized key must be Ed25519" >&2
    exit 1
    ;;
esac
if [ "$(wc -l < "$key_file" | tr -d ' ')" -gt 1 ]; then
  echo "worker SSH authorized key must contain one line" >&2
  exit 1
fi

state=/var/lib/possiblaw-worker
host_key=$state/ssh_host_ed25519_key
authorized_keys=$state/authorized_keys
runtime_config=/run/possiblaw-sshd_config
mkdir -p /run/sshd
if [ ! -f "$host_key" ]; then
  ssh-keygen -q -t ed25519 -N "" -f "$host_key"
fi
if [ -L "$host_key" ] || [ ! -f "$host_key" ]; then
  echo "worker SSH host key is unsafe" >&2
  exit 1
fi
umask 077
printf 'restrict %s\n' "$public_key" > "$authorized_keys.tmp"
mv "$authorized_keys.tmp" "$authorized_keys"
chmod 600 "$host_key" "$authorized_keys"

cp /etc/possiblaw/sshd_config "$runtime_config.tmp"
printf '%s\n' \
  "SetEnv POSSIBLAW_GATE_URL=$expected_gate_url POSSIBLAW_GATE_API_KEY_FILE=$expected_gate_key_file POSSIBLAW_AI_GATEWAY_URL=$expected_ai_url POSSIBLAW_AI_GATEWAY_API_KEY_FILE=$expected_ai_key_file POSSIBLAW_PEER_WORKER_HOST=$expected_peer_host POSSIBLAW_PEER_WORKER_IP=$expected_peer_ip POSSIBLAW_FOREIGN_COMPANY_HOST=$expected_foreign_host POSSIBLAW_FOREIGN_COMPANY_IP=$expected_foreign_ip POSSIBLAW_SSH_INGRESS_HOST=$expected_ssh_ingress_host" \
  >> "$runtime_config.tmp"
mv "$runtime_config.tmp" "$runtime_config"
chmod 600 "$runtime_config"
/usr/sbin/sshd -t -f "$runtime_config" -h "$host_key"

exec /usr/sbin/sshd \
  -D \
  -e \
  -f "$runtime_config" \
  -h "$host_key"
