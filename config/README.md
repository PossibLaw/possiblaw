# PossibLaw configuration contract

`possiblaw/config/v1` is the portable, strict configuration contract for a
customer-owned PossibLaw deployment. The contract is intentionally separate
from the launcher in this milestone foundation: validation reads local catalog
files but performs no network calls, imports, secret resolution, or mutations.

## Files

- `schema/possiblaw-config-v1.schema.json` — JSON Schema Draft 2020-12 contract.
- `examples/firm.json` — production firm configuration.
- `examples/in-house.json` — production in-house legal configuration.
- `examples/hybrid.json` — hybrid configuration, including disabled optional
  connectors that do not require environment references.
- `possiblaw_config.py` — dependency-free validation, catalog-reference checks,
  schema-default application, and deterministic redacted effective output.

JSON is used for the reference documents because it is unambiguous and is also
a valid YAML 1.2 subset. A later launcher integration can add YAML parsing, but
must preserve the same validated data model and fail before network calls or
company imports.

## Validate or render

From the repository root:

```sh
python3 config/possiblaw_config.py validate config/examples/firm.json
python3 config/possiblaw_config.py effective config/examples/firm.json
python3 -m unittest discover -s config/tests -v
```

The `effective` command always replaces every environment-variable reference
with `<redacted-env-ref>`. It never reads the referenced environment variable.
Output keys are sorted, so the same validated input produces byte-identical
output.

## Security and reference rules

- Unknown keys fail at every fixed object boundary.
- Credentials may appear only as `secretRefs` whose values are `{ "env":
  "ENVIRONMENT_VARIABLE_NAME" }`; raw credential fields are rejected.
- Recognized API-token, bearer-token, and private-key value shapes are rejected
  in every string field as a best-effort defense in depth check. Pattern
  detection cannot recognize every credential format; schema-defined
  environment references remain the primary control, and operators must still
  avoid placing secrets in any configuration field.
- Trusted destination object IDs are also environment references. An enabled
  Google Drive destination requires `folderIdRef`; an enabled OneDrive
  destination requires both `driveIdRef` and `parentItemIdRef`.
- A disabled connector or trusted destination may omit its environment
  references.
- Agent, skill, connector, model-variant, model-lane, gate-tool, routine, and
  budget/capacity references are checked against the repository catalogs.
- Enabled production connectors are checked against `catalog/connectors-v1.json`:
  a complete alternative credential set, a compatible tool, a matching trusted
  destination, and an enabled agent with the immutable Gate grant must all line
  up. Unsupported combinations fail before import.
- Metered or mixed billing declares a positive company budget. Subscription
  configurations may declare unknown dollar cost as zero, but must still set
  positive run, turn, timeout, and heartbeat capacity bounds.
- `gate.policyRef` must identify an existing YAML file inside the repository.
- The eight workflow-pack IDs currently come from the public production-parity
  plan. Milestone 5 should replace that temporary in-code list with actual
  workflow-pack manifests.

Launcher precedence and rendering remain integration work: schema defaults,
selected profile, business configuration, then explicit CLI override. The
launcher must use this validator before contacting Paperclip and must not add an
unredacted effective-config mode.
