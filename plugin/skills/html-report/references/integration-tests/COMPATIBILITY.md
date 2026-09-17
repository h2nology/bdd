# P1 Consumer Integration Compatibility Report

> html-report v2.2.0 Wave 3 verification — Integration test results for 4 P1 consumer skills
> Created: 2026-05-09

---

## 1. moai-bi:executive-summary → mode=status

### Suitable Mode

`status` mode — The executive summary report structure (What/So What/Now What/Risks/Next Review) maps naturally onto the status mode's header, highlights, and Carryover structure.

### Mapped Input Slots

| Markdown Section | status Template Slot | Mapping Method |
|---|---|---|
| `## What` 3 bullets | `{{#highlights}}` | Direct insertion |
| `## So What` 3 bullets | `{{#highlights}}` (extension) | Direct insertion |
| `## Now What` Options A/B + recommendation | `{{#carryover}}` | Group layout reuse |
| `## Risks` bullets | `{{#carryover.blocked}}` | Blocking group reuse |
| `## Next Review` | `footer` | Footer text |
| Headline (> quote) | `{{eyebrow}}` | Summary text |
| K-IFRS financial figures (4) | `{{#metrics}}` (stat-card) | 4 metric cards |

### Unmapped Sections

- **Decision option layout**: The Option A/B structure of Now What reuses the Carryover slot of the status template, but the original `shipped_table` (completed table) does not exist in the executive-summary output, leaving an empty slot.
- **Velocity chart source data**: executive-summary does not output time-series weekly data, so chart data must be manually reconstructed.
- **Author column**: The author information of shipped_table is not present in the executive-summary output.

### Recommended Usage

```
moai-bi:executive-summary → moai-core:ai-slop-reviewer → moai-content:html-report mode=status
```

We recommend manually specifying the 4 financial figures into the `{{#metrics}}` slot, or prompting automatic extraction of the bold figures from the `## What` section of the `executive-summary` output.

### Future Improvement Notes

- If executive-summary outputs K-IFRS financial indicators as a structured table, automatic extraction into the `metrics` slot of the status template becomes possible.
- Consider adding a dedicated `decisions` section for the "Now What" option pattern (targeting status template v2).
- Consider a variation that highlights the one-line headline as a separate call-out banner rather than as `eyebrow`.

---

## 2. moai-finance:financial-statements → mode=financial

### Suitable Mode

`financial` mode — The financial statement set (income statement / balance sheet / cash flow statement) structure maps directly to the financial template. The K-IFRS 5-category classification is naturally expressed using the `row-header` style.

### Mapped Input Slots

| Markdown Section | financial Template Slot | Mapping Method |
|---|---|---|
| Key financial indicator table | `{{#kpis}}` (kpi-card) | 4 KPI cards |
| `## Income Statement` operating/investing/financing categories | `{{#statement_rows}}` + `row-header` | 5-category grouping |
| Gross profit / Operating profit subtotals | `row-subtotal` class | Subtotal row styling |
| Net income total | `row-total` class | Total row emphasis |
| Period-over-period change / change rate | `change_abs` / `change_pct` | Direct insertion |
| `## Notes` numbered list | `{{#notes}}` | Direct insertion |

### Unmapped Sections

- **Balance sheet**: The financial template is centered on income statement layout, making it too narrow to accommodate the entire balance sheet. A separate section must be added, or it must be compressed into ~4 summary rows.
- **Cash flow statement**: There is no cash flow section in the template, so it must be compressed as text in the Notes slot.
- **Statement of changes in equity**: Among the complete financial statement set, the statement of changes in equity is currently outside the scope of the financial template.
- **Financial ratio analysis table**: There is no slot for a ratio table separate from the variance chart.

### Recommended Usage

```
moai-finance:financial-statements → moai-content:html-report mode=financial
```

Focus on the key items of the income statement, and compress the balance sheet and cash flow statement into summary KPI cards (4 cards) to stay within the 50KB limit.

### Future Improvement Notes

- Consider adding a separate "Balance Sheet Summary" section to the financial template (3-row card form for assets/liabilities/equity).
- Recommend adding parser hints for automatic recognition of the K-IFRS 5 categories (include category name list in the SKILL.md slot description).
- A chain configuration that also renders the financial ratio analysis results as a status mode metrics card grid is also valid.

---

## 3. moai-business:sbiz365-analyst → mode=plan

### Suitable Mode

`plan` mode — The 9-section report structure of sbiz365-analyst (Executive Summary / Analysis Overview / Each Analysis / Feasibility Assessment / Risks / Conclusion) corresponds well to the plan template's milestones, data flow, risks, and success metrics structure.

### Mapped Input Slots

| Markdown Section | plan Template Slot | Mapping Method |
|---|---|---|
| Comprehensive startup feasibility verdict + key findings | `{{goal_html}}` (goal-box) | Goal summary text |
| Verdict / feasibility score / foot traffic / number of businesses | `{{#summary_cells}}` (sum-cell) | 4 summary cards |
| Short-term and mid-term action items | `{{#milestones}}` | Startup phase timeline |
| Data flow (Small Business 365 → analysis → verdict) | `{{diagram_svg}}` | Inline SVG flowchart |
| `## Risk Factors and Response Strategies` table | `{{#risks}}` + `sev_class` | Risk matrix |
| 3 success conditions + measurement targets | `{{#success_metrics}}` | Success metric rows |

### Unmapped Sections

- **5 major analysis sections (foot traffic / sales / competition / location / feasibility)**: These have been restructured as startup phases in the plan template's milestones, but there is no slot to accommodate the original detailed numerical tables (gender ratio, time-of-day distribution, etc.).
- **4-axis evaluation score table**: There is no dedicated slot to accommodate the score matrix table format, so it is replaced with individual row representations using success_metrics.
- **Analysis data numerical tables**: The table data of the 5 analysis sections is detailed, making it difficult to fully fit within the 50KB limit.

### Recommended Usage

```
moai-business:sbiz365-analyst → moai-core:ai-slop-reviewer → moai-content:humanize-korean → moai-content:html-report mode=plan
```

We recommend rendering in plan mode by extracting only the core sections of the sbiz365 report: "Executive Summary" + "Startup Feasibility Assessment" + "Risks" + "Conclusion". For the 5 detailed analysis sections, guide users to refer to the original markdown report (docx).

### Future Improvement Notes

- Recommend documenting a prompt pattern that automatically emphasizes the 4-axis evaluation score (out of 100) from sbiz365-analyst using the accent style of `summary_cells`.
- Consider adding a "data-table" component slot to compactly express the numerical table for each analysis section.
- Consider an extension that visualizes the Small Business 365 public data commercial area as an inline SVG map (utilizing open data coordinates).

---

## 4. moai-business:daily-briefing → mode=status (daily variant)

### Suitable Mode

`status` mode — The standard sections of daily-briefing (headlines / industry news / competitors / regulations / market indicators / action items) correspond well to the status mode's metric cards, highlights, Shipped table, Velocity chart, and Carryover structure.

### Mapped Input Slots

| Markdown Section | status Template Slot | Mapping Method |
|---|---|---|
| 4 market indicators (KOSPI / KOSDAQ / FX rate / interest rate) | `{{#metrics}}` (stat-card) | 4 metric cards |
| `## Headline Summary` 3 lines | `{{#highlights}}` | Highlights list |
| `## Industry Top News` table (title / source / implication) | `table.shipped` | Completed table reuse |
| Competitor job postings count | `velocity_chart.bars` | Velocity chart data |
| `## Today's Action Items` P0/P1/P2 groups | `{{#carryover}}` groups | 3 Carryover groups |

### Unmapped Sections

- **Competitor activity narrative**: Text blocks describing key activities for each competitor are difficult to compress into shipped table format, and there is no separate section. Either summarize as 1-2 lines in the highlights list or omit.
- **Regulatory / policy updates**: A separate section is needed for visual emphasis, but the status template has no dedicated slot, so it is integrated into highlights or carryover.
- **Market indicator details (Bitcoin, etc.)**: Due to the 4-card limit, not all market indicators can be accommodated; only the main 4 are displayed.

### Recommended Usage

```
moai-business:daily-briefing → moai-content:html-report mode=status
```

Simple chain: The structure is clear enough to render directly without ai-slop-reviewer. Insert 1-2 line summaries of competitor activity / regulatory sections into highlights. Prioritize placement of 4 market indicators as metric cards.

### Future Improvement Notes

- Consider adding a status variant mode for daily-briefing: "status-daily" or add a `news_table` separate slot to the status template.
- Consider adding a `competitor_cards` panel component for the competitor section.
- Consider adding a `policy_alerts` banner slot for regulatory / policy updates (clay color emphasis).

---

## Compatibility Assessment Summary

### Compatibility Assessment Table

| Consumer Skill | Suitable Mode | Core Slot Mappings | Unmapped Sections | Compatibility Score (0-5) |
|---|---|---|---|---|
| moai-bi:executive-summary | status | 7 | 3 | **4** |
| moai-finance:financial-statements | financial | 6 | 4 | **4** |
| moai-business:sbiz365-analyst | plan | 6 | 3 | **4** |
| moai-business:daily-briefing | status | 5 | 3 | **4** |

**Score Criteria**:
- 5 = All sections fully mapped, no additional work required
- 4 = Core sections fully mapped, some sections require creative reinterpretation
- 3 = Major sections can be mapped but require significant structural adjustment
- 2 = Only partial mapping possible, separate custom mode recommended
- 1 = No compatibility, new mode required

### Phase 1 (P1) Recommended Chain Integration Conclusion

**All 4 are usable (Compatibility Score 4/5)**

We confirmed that all P1 consumer skills can be rendered with the specified html-report mode. The core information of each skill output (figures, headlines, actions, risks) is mapped to template slots, and the recommended usage pattern is to guide users to refer to the original markdown report for unmapped detail sections.

**Key Constraints**:
- The entire financial statement set (balance sheet + cash flow statement) of financial-statements must be compressed to focus on the key items of the income statement due to the 50KB single-file limit of the financial template.
- The 5 detailed analysis numerical tables of sbiz365-analyst are difficult to fully accommodate within plan mode, so we recommend rendering centered on key summary + feasibility verdict + risks + conclusion.
- The Now What decision option structure of executive-summary is expressed by reusing the carryover slot, but more natural rendering becomes possible when a dedicated `decisions` component is added in the future.
- For daily-briefing, there is room to extend the status template for the competitor / regulatory detail sections, but the current structure is sufficient for delivering core information.

---

*Written by: moai-content:html-report Wave 3 integration verification | html-report v2.2.0*
