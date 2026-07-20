#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

python3 -c 'import yaml' >/dev/null 2>&1 || {
  echo "PyYAML is required for the static Compose contract test" >&2
  exit 1
}
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s "$root/tests" -p '*_test.py'

for script in "$root"/scripts/*.sh "$root"/tests/*.sh; do
  sh -n "$script"
done

python3 - "$root" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
for path in sorted(root.glob("scripts/*.py")) + sorted(root.glob("tests/*.py")):
    compile(path.read_text(encoding="utf-8"), str(path), "exec")
print("Python and shell syntax checks passed")
PY

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  PAPERCLIP_COMPANY_ID=static-check \
  PAPERCLIP_GATE_AGENT_ID=static-check \
    docker compose -f "$root/compose.yaml" config --quiet
  echo "Docker Compose config validation passed"
else
  echo "SKIP: Docker Compose config validation (Docker Compose unavailable)"
fi
