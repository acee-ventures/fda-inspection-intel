# fda-inspection-intel

A Claude skill that answers FDA regulatory questions from official data sources instead of model memory: facility inspection history and 483 cited clauses, current CFR text, device recalls, adverse-event trends, and the FDA rulemaking feed. Every answer carries its source URL and retrieval time.

中文文档见 [README.zh.md](README.zh.md).

## Install

A standard Claude skill folder: `SKILL.md` + one zero-dependency Node script (Node 18+).

- **Claude Code**: copy this folder into your project's `.claude/skills/` (or `~/.claude/skills/` for all projects). It triggers automatically on FDA data questions.

## Commands

| Command | Returns |
|---|---|
| `regulation "21 CFR 820.10"` | Current clause text + eCFR version date |
| `recalls "Acme Medical"` | Recall/enforcement history (class, status, reason) |
| `device LIT` | Classification, regulation number, market pathway |
| `events LIT` | MAUDE adverse events by year and type |
| `changes "quality management system"` | Latest FDA rules/documents (Federal Register) |
| `inspections "Acme Medical"` | Inspection history with NAI/VAI/OAI classifications |
| `citations "Acme Medical"` | 483 cited clauses with frequency ranking |

## Credentials

Five of the seven commands need **no key** (eCFR and the Federal Register are unauthenticated; openFDA allows 1,000 requests/day keyless).

- `ALKINO_OPENFDA_API_KEY` (optional): instant key from [open.fda.gov](https://open.fda.gov/apis/authentication/); raises the daily limit to 120,000.
- `ALKINO_FDA_DASHBOARD_USER` + `ALKINO_FDA_DASHBOARD_KEY` (for `inspections`/`citations` only): free registration at the [OII Unified Logon](https://www.accessdata.fda.gov/scripts/oul/) — tick **FDA Data Dashboard API**; the key arrives by email.

Credentials are read from environment variables only and redacted in all output.

## Boundaries

- Full 483 observation text is not in any public API; clause-level citations are provided instead.
- Inspection data covers FDA inspections worldwide; other regulators are not included.
- MAUDE counts are spontaneous reports, not incidence rates.
- Facts with sources only — no compliance verdicts.

## License

Apache-2.0 · Copyright 2026 ALKINO
