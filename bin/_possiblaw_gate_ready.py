#!/usr/bin/env python3
"""Validate a gate-proxy production readiness attestation."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import sys

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def startup_proof(instance_id: str, company_id: str, policy_digest: str, secret: str) -> str:
    message = f"{instance_id}\n{company_id}\n{policy_digest}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def validate(
    document: object,
    company_id: str,
    policy_digest: str,
    instance_id: str,
    startup_secret: str,
) -> str:
    if not isinstance(document, dict):
        raise ValueError("gate readiness must be a JSON object")
    expected = {"ok": True, "receipts": "ready", "paperclip": "ready"}
    for key, value in expected.items():
        if document.get(key) != value:
            raise ValueError(f"gate readiness field {key} is not {value!r}")
    actual_instance_id = document.get("instanceId")
    if not isinstance(actual_instance_id, str) or not UUID_RE.fullmatch(actual_instance_id):
        raise ValueError("gate readiness instanceId is not a UUIDv4")
    if not UUID_RE.fullmatch(instance_id) or actual_instance_id != instance_id:
        raise ValueError("gate readiness instanceId does not match the launched instance")
    if document.get("companyId") != company_id:
        raise ValueError("gate readiness companyId does not match")
    if not SHA256_RE.fullmatch(policy_digest) or document.get("policyDigest") != policy_digest:
        raise ValueError("gate readiness policyDigest does not match")
    if len(startup_secret) < 32:
        raise ValueError("gate readiness startup secret is invalid")
    proof = document.get("startupProof")
    expected_proof = startup_proof(instance_id, company_id, policy_digest, startup_secret)
    if not isinstance(proof, str) or not hmac.compare_digest(proof, expected_proof):
        raise ValueError("gate readiness startup proof does not match")
    return actual_instance_id


def _self_test() -> int:
    company = "company-1"
    digest = "a" * 64
    secret = "s" * 32
    instance_id = "123e4567-e89b-42d3-a456-426614174000"
    good = {
        "ok": True,
        "receipts": "ready",
        "paperclip": "ready",
        "instanceId": instance_id,
        "companyId": company,
        "policyDigest": digest,
        "startupProof": startup_proof(instance_id, company, digest, secret),
    }
    assert validate(good, company, digest, instance_id, secret) == good["instanceId"]
    for bad in (
        {**good, "companyId": "other"},
        {**good, "policyDigest": "b" * 64},
        {**good, "instanceId": "123e4567-e89b-42d3-a456-426614174001"},
        {**good, "startupProof": "0" * 64},
        {"ok": True},
    ):
        try:
            validate(bad, company, digest, instance_id, secret)
            raise AssertionError(f"unsafe gate readiness accepted: {bad!r}")
        except ValueError:
            pass
    print("OK: _possiblaw_gate_ready self-test passed")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--company-id")
    parser.add_argument("--policy-digest")
    parser.add_argument("--instance-id")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        return _self_test()
    startup_secret = os.environ.get("POSSIBLAW_GATE_STARTUP_SECRET", "")
    if not args.company_id or not args.policy_digest or not args.instance_id or not startup_secret:
        parser.error(
            "--company-id, --policy-digest, --instance-id, and "
            "POSSIBLAW_GATE_STARTUP_SECRET are required"
        )
    try:
        instance_id = validate(
            json.load(sys.stdin),
            args.company_id,
            args.policy_digest,
            args.instance_id,
            startup_secret,
        )
    except (json.JSONDecodeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(instance_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
