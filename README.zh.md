# fda-inspection-intel

一个用官方数据源回答 FDA 监管问题的 Claude 技能——设施检查史与 483 被引条款、CFR 现行条文、器械召回、不良事件趋势、法规变更流。每个答案带来源 URL 与取数时间，不凭模型记忆。

English docs: [README.md](README.md)。

## 安装

标准 Claude 技能目录：`SKILL.md` + 一个零依赖 Node 脚本（Node 18+）。

- **Claude Code**：复制本目录到项目的 `.claude/skills/`（或 `~/.claude/skills/` 全局生效）。问 FDA 数据问题自动触发。

## 命令

| 命令 | 返回 |
|---|---|
| `regulation "21 CFR 820.10"` | 现行条文 + eCFR 版本日期 |
| `recalls "Acme Medical"` | 召回/执法史（级别、状态、原因） |
| `device LIT` | 分类、监管条款号、上市路径 |
| `events LIT` | MAUDE 不良事件按年与类型 |
| `changes "quality management system"` | Federal Register 上 FDA 的最新规则与文件 |
| `inspections "Acme Medical"` | 检查史与 NAI/VAI/OAI 结论分级 |
| `citations "Acme Medical"` | 483 被引条款与频次排行 |

## 凭证

七个命令里五个**免 key**（eCFR 与 Federal Register 无需认证；openFDA 免 key 1,000 次/天）。

- `ALKINO_OPENFDA_API_KEY`（可选）：[open.fda.gov](https://open.fda.gov/apis/authentication/) 秒发，日限升至 120,000。
- `ALKINO_FDA_DASHBOARD_USER` + `ALKINO_FDA_DASHBOARD_KEY`（仅 `inspections`/`citations` 需要）：在 [OII Unified Logon](https://www.accessdata.fda.gov/scripts/oul/) 免费注册，勾选 **FDA Data Dashboard API**，key 发邮箱。

凭证只从环境变量读取，所有输出一律脱敏。

## 边界

- 483 观察原文全文不在任何公开 API；提供条款级引用。
- 检查数据覆盖 FDA 全球检查，不含其他监管机构。
- MAUDE 是自发报告库，计数≠发生率。
- 只陈述带出处的事实，不出合规结论。

## 许可

Apache-2.0 · Copyright 2026 ALKINO
