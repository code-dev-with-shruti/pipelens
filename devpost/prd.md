---
doc: prd
status: approved
---

# PipeLens — Product Requirements

PipeLens is a lightweight SQL pipeline explorer that helps a new engineer understand how stored procedures connect, what depends on what, and what breaks downstream when one procedure fails. It is specifically built for a short hackathon proof-of-concept based on a small sample of T-SQL files.

Source: scope.md > The Unique Kernel, The Core Loop, What "Working" Looks Like, The POC Boundary.

## The Core Journey

1. The user opens the app and sees a clean starting surface with a sample project loaded by default.
2. The app displays an interactive graph of procedures and tables. Solid arrows represent parser-confirmed reads and writes; dashed arrows represent uncertain edges, such as dynamic SQL or fallback inference.
3. The user clicks a procedure, such as load_invoices, and the graph immediately highlights the procedure, the tables it reads and writes, and the downstream procedures and reports affected by it.
4. A side panel updates with the procedure summary, ordered steps, and severity-tagged risks such as missing error handling or an unfiltered delete.
5. The user can see how one failure ripples through the pipeline and understand what is impacted without reading raw SQL.
6. The user exports the output as a Markdown onboarding document for the whole pipeline.

Success is defined by this moment: a newcomer understands the system at a glance and can answer “what breaks if this fails?” within a minute.

## Screens and Layout

The product consists of one main experience with three related surfaces:

- A top-level action area with a sample-project loader and file upload controls.
- A central graph canvas showing procedures and tables as nodes.
- A side panel that updates based on the selected node and shows details, risks, and summary content.

The app is intentionally minimal: one screen for analysis, one panel for details, and one export action.

## Look and Feel

The visual identity is practical and technical rather than playful or consumer-facing. The product should feel trustworthy, precise, and audit-friendly. The interface should use a clean, modern engineering aesthetic with strong contrast, obvious emphasis on the selected node, and a clear hierarchy between graph, detail panel, and action buttons.

The tone should feel like an internal engineering tool: useful, direct, and calm. The product should not feel chatty or vague.

## Features and Behavior

### Load and inspect a pipeline

The user can load a sample project or upload a small set of SQL files. The app turns the files into a dependency graph that makes the connections visible.

- The app shows procedures as nodes and tables as nodes.
- Edges show read and write relationships.
- Confirmed edges are solid; uncertain edges are dashed.
- The graph is interactive enough for a person to inspect the pattern and focus on one area.

### Downstream impact view

When the user clicks a procedure or table, the app highlights the downstream impact.

- Affected tables and procedures are visually emphasized.
- The side panel lists the impacted items.
- The result is derived from graph traversal, not from a freeform LLM guess.
- The behavior is deterministic: the same input produces the same downstream answer.

### Procedure detail panel

When a procedure is selected, the app presents an immediate summary and supporting detail.

- Plain-English summary in a few sentences.
- Ordered steps describing the procedure’s flow.
- Reads and writes listed in a structured format.
- Risk list with severity labels.

### Risk detection

The app surfaces obvious risk patterns in the SQL flow.

- Missing error handling.
- Unfiltered delete or truncate behavior.
- Hard-coded values.
- Dynamic SQL or other uncertain patterns.
- Missing logging or weak operational guardrails.

Each risk should show a severity and a description tied to the relevant procedure.

The LLM is used only to write summaries, ordered steps, and risk explanations. It never decides graph edges or downstream impact; those are derived from the parser and graph traversal.

### Export onboarding doc

The user can export the pipeline analysis as a Markdown document for onboarding or handoff.

- The export includes the pipeline overview and the selected procedure details.
- The document is useful to a teammate who needs a readable map of the system.

### Loading and error states

The app handles empty, invalid, oversized, or failed inputs in a readable way.

- There is a clear loading state while analysis runs.
- Empty input produces a clear explanation.
- Invalid files or API issues show a human-readable failure.

## States and Boundaries

- Initial state — the app loads with a sample project and invites the user to inspect or upload files.
- Loading state — the system reads and analyzes the SQL; the graph is not yet ready.
- Successful analysis state — the graph and detail panel are fully populated.
- Selected-node state — the side panel updates and the downstream impact is highlighted.
- Empty state — no files or no valid SQL was supplied.
- Error state — the upload failed, the file data is invalid, or the analysis backend returned an error.
- Uncertain-edge state — dynamic SQL or unsupported patterns are identified and shown as dashed or flagged links.

## Product Decisions

- Use sample data as the default demo path so the app can prove the value immediately without a custom upload.
- Favor parser-first dependency mapping with an explicit uncertainty flag over a pure LLM-generated graph.
- Keep the app focused on a small set of T-SQL files and a short, demoable workflow.
- Treat the export as an onboarding artifact rather than a broad documentation platform.

## What We're Building

The proof of concept must do all of the following:

- Accept a sample project as the default first experience, with upload also supported.
- Parse the SQL and identify procedure/table relationships.
- Render the relationship graph clearly.
- Let the user click a procedure or table and see downstream impact.
- Provide a plain-English summary, steps, and risk list for that procedure.
- Flag uncertain edges explicitly.
- Compare the parsed graph against a planted ground truth and report found vs. missed dependencies and false edges.
- Export a Markdown onboarding document that includes the pipeline overview, each procedure’s summary, steps, reads/writes, risks and downstream impact.
- Demonstrate the full loop in under a minute as the submission proof.
- Keep the LLM limited to writing summaries, steps, and risk explanations; never allowing it to decide graph edges or downstream impact.

## Deferred From the POC

The following are intentionally out of scope for the hackathon build:

- SSIS packages and scheduled jobs.
- Cross-dialect support beyond T-SQL.
- User accounts or saved history.
- Chat-based Q&A about the whole pipeline.
- Production hosting or deployment workflows.

## Possible Later Enhancements

- Support for additional SQL dialects and pipeline sources.
- Better handling of dynamic SQL and ambiguous statements.
- Highlighting exact source lines behind each procedure step.
- More advanced export to Confluence or developer documentation tools.
- A conversational layer grounded in the graph instead of free-form chat.

## Non-Goals

- Real database access or production data processing.
- A broad enterprise DevOps platform.
- A general-purpose SQL assistant unrelated to pipeline mapping.
- Full visual redesign work for a big product launch.

## Open Questions

- Resolved: the sample project is the default first-use experience, with upload also supported.
- Resolved: the export includes the pipeline overview, each procedure’s summary, steps, reads/writes, risks, and downstream impact.
- Resolved: the one-minute demo is the submission proof, so no extra walkthrough view will be built.

No open blockers remain before the spec phase.
