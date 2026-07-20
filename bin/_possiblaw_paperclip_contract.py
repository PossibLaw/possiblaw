#!/usr/bin/env python3
"""Fail-closed checks for the pinned Paperclip contracts PossibLaw relies on.

Paperclip is an upstream pinned submodule and must not be modified here. These
checks make three cross-client isolation assumptions loud when the pin changes:

* board company listings are membership-filtered for non-admin board actors;
* issue-derived reads authorize with the loaded issue's companyId; and
* company responses expose the issuePrefix that Paperclip uniquely derives.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


class ContractError(RuntimeError):
    pass


def require(source: str, pattern: str, message: str) -> None:
    if not re.search(pattern, source, flags=re.MULTILINE | re.DOTALL):
        raise ContractError(message)


def route_block(source: str, route: str) -> str:
    marker = f'router.get("{route}"'
    start = source.find(marker)
    if start < 0:
        raise ContractError(f"Paperclip route is missing: GET {route}")
    end = source.find("\n  router.", start + len(marker))
    return source[start:] if end < 0 else source[start:end]


def check_sources(companies_route: str, company_service: str, issues_route: str) -> None:
    companies = route_block(companies_route, "/")
    require(
        companies,
        r"req\.actor\.source\s*===\s*[\"']local_implicit[\"']"
        r".*?req\.actor\.isInstanceAdmin.*?"
        r"new Set\(req\.actor\.companyIds\s*\?\?\s*\[\]\).*?"
        r"result\.filter\(\(company\)\s*=>\s*allowed\.has\(company\.id\)\)",
        "GET /api/companies is not visibly membership-filtered for non-admin board actors",
    )

    for route in (
        "/issues/:id",
        "/issues/:id/work-products",
        "/issues/:id/documents",
        "/issues/:id/documents/:key",
    ):
        block = route_block(issues_route, route)
        require(
            block,
            r"issue\s*=\s*await\s+svc\.getById\(id\)",
            f"GET {route} no longer loads its issue before access control",
        )
        require(
            block,
            r"assertCompanyAccess\(req,\s*issue\.companyId\)",
            f"GET {route} no longer authorizes against issue.companyId",
        )

    require(
        company_service,
        r"companySelection\s*=\s*\{.*?issuePrefix:\s*companies\.issuePrefix",
        "Paperclip company responses no longer visibly select issuePrefix",
    )
    require(
        company_service,
        r"function deriveIssuePrefixBase\(name:\s*string\).*?"
        r"toUpperCase\(\)\.replace\(/\[\^A-Z\]/g,\s*[\"'][\"']\).*?"
        r"slice\(0,\s*3\)",
        "Paperclip issue-prefix derivation no longer matches the verified first-three-letter contract",
    )
    require(
        company_service,
        r"\.values\(\{\s*\.\.\.data,\s*issuePrefix:\s*candidate\s*\}\)",
        "Paperclip company creation no longer visibly persists its derived unique issuePrefix",
    )


def git_output(*args: str, cwd: Path) -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(cwd), *args],
            text=True,
            stderr=subprocess.STDOUT,
        ).strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        detail = exc.output.strip() if isinstance(exc, subprocess.CalledProcessError) else str(exc)
        raise ContractError(f"could not verify Paperclip submodule pin: {detail}") from exc


def check_pin(repo_root: Path) -> None:
    line = git_output("ls-tree", "HEAD", "paperclip", cwd=repo_root)
    match = re.fullmatch(r"160000 commit ([0-9a-f]{40})\s+paperclip", line)
    if not match:
        raise ContractError("HEAD does not contain a pinned Paperclip gitlink")
    expected = match.group(1)
    actual = git_output("rev-parse", "HEAD", cwd=repo_root / "paperclip")
    if actual != expected:
        raise ContractError(
            f"Paperclip checkout {actual} does not match the repository gitlink {expected}"
        )


def check_repo(repo_root: Path) -> None:
    check_pin(repo_root)
    paperclip = repo_root / "paperclip"
    paths = {
        "companies": paperclip / "server/src/routes/companies.ts",
        "service": paperclip / "server/src/services/companies.ts",
        "issues": paperclip / "server/src/routes/issues.ts",
    }
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        raise ContractError(f"Paperclip contract source is missing: {', '.join(missing)}")
    check_sources(
        paths["companies"].read_text(encoding="utf-8"),
        paths["service"].read_text(encoding="utf-8"),
        paths["issues"].read_text(encoding="utf-8"),
    )


def self_test() -> int:
    companies_route = """
  router.get("/", async (req, res) => {
    const result = await svc.list();
    if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) {
      res.json(result);
      return;
    }
    const allowed = new Set(req.actor.companyIds ?? []);
    res.json(result.filter((company) => allowed.has(company.id)));
  });
  router.get("/next", async (_req, _res) => {});
"""
    company_service = """
  const companySelection = { id: companies.id, issuePrefix: companies.issuePrefix };
  function deriveIssuePrefixBase(name: string) {
    const normalized = name.toUpperCase().replace(/[^A-Z]/g, "");
    return normalized.slice(0, 3) || "CMP";
  }
  await db.insert(companies).values({ ...data, issuePrefix: candidate }).returning();
"""
    issue_blocks = []
    for route in (
        "/issues/:id",
        "/issues/:id/work-products",
        "/issues/:id/documents",
        "/issues/:id/documents/:key",
    ):
        issue_blocks.append(
            f'  router.get("{route}", async (req, res) => {{\n'
            "    const issue = await svc.getById(id);\n"
            "    assertCompanyAccess(req, issue.companyId);\n"
            "  });"
        )
    issues_route = "\n".join(issue_blocks) + '\n  router.get("/next", async (_req, _res) => {});'

    check_sources(companies_route, company_service, issues_route)

    try:
        check_sources(
            companies_route.replace(
                "res.json(result.filter((company) => allowed.has(company.id)));",
                "res.json(result);",
            ),
            company_service,
            issues_route,
        )
        raise AssertionError("unfiltered company listings must fail")
    except ContractError:
        pass

    try:
        check_sources(
            companies_route,
            company_service,
            issues_route.replace(
                "assertCompanyAccess(req, issue.companyId);",
                "assertCompanyAccess(req, req.query.companyId);",
                1,
            ),
        )
        raise AssertionError("issue reads without issue.companyId authorization must fail")
    except ContractError:
        pass

    print("OK: Paperclip isolation-contract self-test passed")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        return self_test()
    repo_root = (args.repo_root or Path(__file__).resolve().parent.parent).resolve()
    try:
        check_repo(repo_root)
    except ContractError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print("OK: pinned Paperclip isolation contracts verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
