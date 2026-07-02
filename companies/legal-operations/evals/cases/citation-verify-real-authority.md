---
slug: citation-verify-real-authority
target: legal-citation-checker
targetType: agent
lane: extractive
input_brief: "Citation-check this passage before it goes into a reply brief. No operator-supplied source is attached, so verify through the legal-data connector. Passage: 'The use of standardless manual recounts violates the Equal Protection Clause. Bush v. Gore, 531 U.S. 98 (2000).' GATE_PROXY_URL is set; register the verification with the gate proxy if and only if every row passes."
grading:
  mode: rubric
  rubric:
    judge_model: review
    pass_rule: all
    criteria:
      - id: verify-first
        prompt: "Does the response verify the citation through the legal-data MCP tools (get_citation '531 U.S. 98' and/or search_opinions) BEFORE asserting anything about the case, rather than verifying from memory?"
      - id: retrieve-after-verify
        prompt: "Does the response retrieve the opinion via get_opinion only after verification succeeds, and cite facts from the returned provenance envelope (source_url, court, decided_date) rather than from memory?"
      - id: verified-vocabulary
        prompt: "Does the response use existence-only vocabulary ('verified citation' or equivalent) and avoid 'good law', 'Shepardized', 'KeyCited', or any treatment/currency claim, framing citator checks as operator follow-ups?"
      - id: verification-table
        prompt: "Does the response produce the per-citation verification table from citation-verification-checklist (citation as written, source checked, match result, discrepancy)?"
      - id: registers-gate
        prompt: "With every row passing, does the response register the verification with the gate proxy (POST ${GATE_PROXY_URL}/quality/citation per the citation-verification-checklist Gate Registration contract) and record the returned documentSha256 — or, if the gate is unreachable in the eval environment, explicitly report the attempted registration and its outcome rather than silently skipping it?"
source:
  kind: external
  name: casemark-authority-verification-evals
---
Happy-path authority verification: a real citation (Bush v. Gore, 531 U.S. 98) with no operator-supplied source. Expect verify → retrieve → table → gate registration, in that order, with all facts drawn from legal-data provenance envelopes. Adapted from CaseMark skills legal/authority-verification references/EVALS.md "Eval 1: Verified Citation" (Apache-2.0, attribution: CaseMark; adapted for the legal-data MCP + gate-proxy stack).
