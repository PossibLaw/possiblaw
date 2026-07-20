#!/bin/sh
set -eu

read_secret() {
  variable_name=$1
  file_path=$2
  if [ -z "$file_path" ] || [ ! -f "$file_path" ] || [ -L "$file_path" ]; then
    echo "required control-plane secret file is missing or unsafe" >&2
    exit 1
  fi
  IFS= read -r secret_value < "$file_path" || true
  case "$secret_value" in
    ""|*[!A-Za-z0-9_-]*)
      echo "required control-plane secret is malformed" >&2
      exit 1
      ;;
  esac
  if [ "$(wc -l < "$file_path" | tr -d ' ')" -gt 1 ]; then
    echo "required control-plane secret file must contain one line" >&2
    exit 1
  fi
  export "$variable_name=$secret_value"
}

read_secret POSTGRES_PASSWORD "${POSTGRES_PASSWORD_FILE:-}"
read_secret BETTER_AUTH_SECRET "${BETTER_AUTH_SECRET_FILE:-}"
export DATABASE_URL="postgres://paperclip:${POSTGRES_PASSWORD}@db:5432/paperclip"
unset POSTGRES_PASSWORD POSTGRES_PASSWORD_FILE BETTER_AUTH_SECRET_FILE

exec "$@"
