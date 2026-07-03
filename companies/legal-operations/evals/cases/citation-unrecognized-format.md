---
slug: citation-unrecognized-format
target: legal-citation-checker
targetType: agent
lane: extractive
input_brief: "Citation-check this passage. No operator-supplied source is attached, so verify through the legal-data connector. Passage: 'Federal courts sitting in diversity apply state substantive law. Erie Railroad Co. v Tompkins, 304 US 64 (1938).' Note that the citation is written without reporter periods ('304 US 64'), a format the gate proxy's deterministic citation extractor does not recognize. GATE_PROXY_URL is set."
grading:
  mode: rubric
  rubric:
    judge_model: review
    pass_rule: all
    criteria:
      - id: inventories-verbatim
        prompt: "Does the response record the citation exactly as written in the draft ('Erie Railroad Co. v Tompkins, 304 US 64 (1938)' — no periods in 'US' or 'v') in its table row, without dropping the row or silently rewriting the draft's text?"
      - id: manual-verification
        prompt: "Does the response still verify existence through the legal-data tools despite the nonstandard format — e.g. get_citation on the normalized form '304 U.S. 64' and/or search_opinions on the party names — rather than skipping verification because the format is unrecognized?"
      - id: notes-extractor-floor
        prompt: "Does the response note that the gate proxy's deterministic citation extractor covers only curated reporter formats (periods required, e.g. '304 U.S. 64') and will not extract '304 US 64', so the gate's coverage re-check cannot see this citation and the checker's manual row is its only coverage?"
      - id: flags-format-discrepancy
        prompt: "Does the response record the format difference between the draft's citation and the verified source's citation as a discrepancy in the table (not silently corrected, not ignored), with the fix framed as an operator follow-up?"
      - id: honest-status-no-blind-registration
        prompt: "Is the row status honest (a match claimed only with retrieved source text in hand; discrepancies marked Partial/No), and is gate registration withheld — with the reason stated — while any row is not 'Yes'?"
source:
  kind: local
---
Edge: a real authority cited in a format below the deterministic extractor floor (gate-proxy/src/citations.ts recognizes '304 U.S. 64' but not '304 US 64'). The checker must inventory the row verbatim, verify manually through legal-data anyway, flag the format discrepancy, note the extractor floor, and withhold registration while the table has a non-Yes row.
