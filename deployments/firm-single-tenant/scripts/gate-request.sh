#!/bin/sh
set -eu

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "usage: possiblaw-gate-request GET|POST /exact/path [json-file]" >&2
  exit 64
fi
method=$1
request_path=$2
body_file=${3:-}

case "$method" in GET|POST) ;; *) echo "unsupported method" >&2; exit 64 ;; esac
case "$request_path" in
  /*) ;;
  *) echo "gate path must be absolute" >&2; exit 64 ;;
esac
case "$request_path" in
  *://*|*..*|*\\*) echo "gate path is unsafe" >&2; exit 64 ;;
esac
case "$request_path" in
  *" "*|*"	"*) echo "gate path is unsafe" >&2; exit 64 ;;
esac
case "${POSSIBLAW_GATE_URL:-}" in
  http://gate-ingress-a:3802|http://gate-ingress-b:3802) ;;
  *) echo "gate URL is not an approved internal endpoint" >&2; exit 78 ;;
esac

key_file=${POSSIBLAW_GATE_API_KEY_FILE:-}
if [ -z "$key_file" ] || [ ! -f "$key_file" ] || [ -L "$key_file" ]; then
  echo "gate credential file is missing or unsafe" >&2
  exit 78
fi
IFS= read -r gate_key < "$key_file" || true
if [ -z "$gate_key" ]; then
  echo "gate credential file is empty" >&2
  exit 78
fi
if [ "$(wc -c < "$key_file" | tr -d ' ')" -gt 4096 ] \
  || [ "$(wc -l < "$key_file" | tr -d ' ')" -gt 1 ]; then
  echo "gate credential file is malformed" >&2
  exit 78
fi
case "$gate_key" in
  *[!A-Za-z0-9._~+/=-]*) echo "gate credential file is malformed" >&2; exit 78 ;;
esac
header_file=/run/possiblaw-gate-header.$$
umask 077
printf 'Authorization: Bearer %s\n' "$gate_key" > "$header_file"
unset gate_key
trap 'rm -f "$header_file"' EXIT HUP INT TERM

if [ "$method" = POST ]; then
  if [ -z "$body_file" ] || [ ! -f "$body_file" ] || [ -L "$body_file" ]; then
    echo "POST requires a regular JSON body file" >&2
    exit 64
  fi
  if [ "$(wc -c < "$body_file" | tr -d ' ')" -gt 36700160 ]; then
    echo "POST body file exceeds the worker request limit" >&2
    exit 64
  fi
  curl --fail-with-body --silent --show-error --max-time 35 \
    -X POST \
    -H "@$header_file" \
    -H "Content-Type: application/json" \
    --data-binary "@$body_file" \
    "${POSSIBLAW_GATE_URL}${request_path}"
  exit $?
fi

if [ -n "$body_file" ]; then
  echo "GET does not accept a body file" >&2
  exit 64
fi
curl --fail-with-body --silent --show-error --max-time 35 \
  -H "@$header_file" \
  "${POSSIBLAW_GATE_URL}${request_path}"
