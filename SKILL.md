---
name: fda-inspection-intel
description: Answer FDA regulatory-intelligence questions with official data instead of model memory — facility inspection history and 483 cited clauses, current CFR text, device recalls and enforcement, adverse-event trends, rulemaking feed, device identity (classification/510(k)). Use this skill for ANY factual question about FDA data, even casual ones. Triggers include - FDA inspection, 483, citation, recall, warning letter, 21 CFR, QMSR, MAUDE, supplier check, audit prep, 检查, 召回, 条款原文, 供应商核查, 迎审. Never answer FDA data questions from memory.
---

# FDA Inspection Intel

## Discipline (non-negotiable)

1. **Always fetch, never recite.** For any factual FDA question, run `scripts/fda_data.mjs` first and answer from its output. If the script fails, say so honestly — never fill the gap from memory.
2. **Every answer carries provenance.** Preserve the script's `source:` URLs and `retrieved:` timestamps.
3. **Absence of records ≠ zero.** Answer "no records found in [source] using [search term]"; retry with a name variant before any provisional conclusion.
4. **No compliance verdicts.** Present the data; judgment belongs to the user.
5. Answer in the user's language; keep regulation text in the original English.
6. Angle-bracket values are placeholders — always substitute the entity the user actually asked about.

## Subcommands

`node scripts/fda_data.mjs <subcommand> <argument>` (Node 18+, zero dependencies)

| Subcommand | Purpose |
|---|---|
| `regulation <citation>` | Current CFR text + version date (eCFR); removed sections fall back to the last pre-removal text, labeled historical |
| `recalls <firm>` | Device recall/enforcement history (openFDA) |
| `device <code or name>` | Classification / regulatory pathway; three uppercase letters = product code |
| `events <product code>` | MAUDE adverse-event trend by year + event type |
| `changes <term>` | FDA rulemaking feed (Federal Register) |
| `inspections <firm>` | Inspection history with NAI/VAI/OAI — requires Dashboard credentials |
| `citations <firm>` | 483 cited clauses + frequency — requires Dashboard credentials |

## Credentials (environment variables, optional)

- `ALKINO_OPENFDA_API_KEY`: raises the openFDA daily limit 1,000 → 120,000.
- `ALKINO_FDA_DASHBOARD_USER` / `ALKINO_FDA_DASHBOARD_KEY`: required for `inspections`/`citations`; without them the script prints free registration steps.

## Boundaries (state proactively)

- Part 820 was restructured under QMSR; old QSR section numbers are removed from the current CFR. For such citations `regulation` reports the removed status plus the last historical text — always distinguish "current requirement" from "historical text" in answers.
- Full 483 observation text is not in any public API; clause-level citations only.
- Covers FDA inspections worldwide; no other regulators.
- MAUDE counts are not incidence rates.
