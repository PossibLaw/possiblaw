#!/bin/sh
set -eu

secret_file=${PAPERCLIP_GATE_API_KEY_FILE:-}
if [ -z "$secret_file" ] || [ ! -f "$secret_file" ] || [ -L "$secret_file" ]; then
  echo "gate control credential file is missing or unsafe" >&2
  exit 1
fi

IFS= read -r PAPERCLIP_GATE_API_KEY < "$secret_file" || true
case "$PAPERCLIP_GATE_API_KEY" in
  ""|*[!A-Za-z0-9._~+/=-]*)
    echo "gate control credential file is malformed" >&2
    exit 1
    ;;
esac
if [ "$(wc -l < "$secret_file" | tr -d ' ')" -gt 1 ]; then
  echo "gate control credential file must contain one line" >&2
  exit 1
fi

export PAPERCLIP_GATE_API_KEY
unset PAPERCLIP_GATE_API_KEY_FILE

load_optional_secret() {
  variable_name=$1
  eval "optional_file=\${${variable_name}_FILE:-}"
  if [ -z "$optional_file" ]; then
    return 0
  fi
  if [ ! -f "$optional_file" ] || [ -L "$optional_file" ]; then
    echo "optional gate credential file is missing or unsafe" >&2
    exit 1
  fi
  IFS= read -r optional_value < "$optional_file" || true
  if [ -z "$optional_value" ] || [ "$(wc -l < "$optional_file" | tr -d ' ')" -gt 1 ]; then
    echo "optional gate credential file must contain one non-empty line" >&2
    exit 1
  fi
  export "$variable_name=$optional_value"
  unset "${variable_name}_FILE"
}

for variable_name in \
  EXTERNAL_MODEL_API_KEY \
  GDRIVE_ACCESS_TOKEN GDRIVE_CLIENT_ID GDRIVE_CLIENT_SECRET GDRIVE_REFRESH_TOKEN \
  GMAIL_TOKEN GMAIL_CLIENT_ID GMAIL_CLIENT_SECRET GMAIL_REFRESH_TOKEN \
  MS_GRAPH_TOKEN MS_TENANT_ID MS_CLIENT_ID MS_CLIENT_SECRET \
  NOTION_API_KEY
do
  load_optional_secret "$variable_name"
done

exec "$@"
