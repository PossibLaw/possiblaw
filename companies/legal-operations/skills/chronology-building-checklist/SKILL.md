---
name: chronology-building-checklist
description: Build source-cited chronologies from investigation document sets when a chronology matter arrives, producing a date-ordered event table with conflict flags and a gap list.
metadata:
  sources:
    - path: companies/legal-operations/skills/chronology-building-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Chronology Building Checklist

Use this skill to build a source-cited chronology from an investigation document set. This is mechanical extraction and ordering: every event carries a citation, every source disagreement becomes a conflict flag, and no conclusion is drawn about what happened or why. Investigation document sets are sensitive: when the matter's `metadata.possiblaw.privacyTier` is `confidential` or `privileged`, run the `privacy-encoder` flow before any cloud-capable call and decode the final output before posting.

## Extraction Steps

1. Scope intake. Record the matter name, the investigation's stated scope, the document set with identifiers, the date range of interest, and any documents the operator excluded. If no document set is identified at all, gate with `missing-info-gate` instead of guessing.
2. Inventory the sources. List each document with the identifier or short citation form the chronology will use. Documents referenced in the materials but not supplied go in the gap list, not the chronology.
3. Extract events one source at a time. Record each event exactly as the source states it — no paraphrase of dates, names, amounts, or quoted language. Every event carries its source citation; an event with no citation does not enter the chronology.
4. Handle dates explicitly. Mark undated events `[UNDATED]`; record approximate dates with the basis for the approximation as the source states it. Never silently assign or infer a date.
5. Merge into date order. Where two sources disagree on a date, participant, or fact, create a conflict flag recording both versions with their citations; never pick one version or reconcile them.
6. State significance per event as factual relevance to the investigation's stated scope — never as a conclusion about intent, fault, or wrongdoing.
7. Build the gap list: uncovered date ranges, documents referenced but not supplied, undated events, and the follow-up actions for the operator to commission.
8. Produce the three outputs in the formats below.

## Output: Chronology Table

| Date | Event | Source | Witnesses | Significance | Flags |
|---|---|---|---|---|---|
| Date as stated, or `[UNDATED]` | The event exactly as the source states it | Document identifier and pin cite where available | Persons present or involved, as stated | Factual relevance to the stated scope | `Conflict`, `Approximate date`, or blank |

One row per event, in date order, with `[UNDATED]` rows grouped at the end.

## Output: Conflict Log

One entry per source disagreement, each recording both versions with their citations, what the sources disagree about, and no proposed resolution. Cross-reference each entry to its chronology row.

## Output: Gap List and Operator Follow-Ups

List uncovered date ranges, missing or unsupplied documents, and undated events, each with the follow-up action the operator could commission to close it.

## Escalation for Privileged Content

If a document appears privileged — counsel communications, legal-advice memos, litigation strategy — stop extracting from it, record only its existence and source in the gap list, and escalate to `chief-counsel` in a durable comment. Treat the matter as `privileged` tier for the `privacy-encoder` flow from that point on.

## Boundaries

- Do not conclude what happened, infer events no source states, or characterize conduct as wrongful; record cited events, conflicts, gaps, and follow-ups only.
- Do not resolve conflicts between sources or choose between disagreeing versions; both go in the conflict log for operator review.
- Do not transmit the chronology or any underlying document to any external party or system; the chronology is a work product pending operator approval.
