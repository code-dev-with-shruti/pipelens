---
doc: prd
status: approved
---

# PipeLens — Product Requirements

PipeLens is a lightweight SQL pipeline explorer that helps a new engineer understand how stored procedures connect, what depends on what, and what breaks downstream when one procedure fails. It is specifically built for a short hackathon proof-of-concept based on a small sample of T-SQL files.

Source: scope.md > The Unique Kernel, The Core Loop, What "Working" Looks Like, The POC Boundary.

## The Core Journey

1. The user opens the app and sees a clean starting surface with a sample project loaded by default.
2. The app displays an interactive graph of procedures and tables. Solid arrows represent parser-confirmed reads, writes, and direct procedure calls; dashed arrows represent uncertain edges, such as dynamic SQL.
3. The user clicks a procedure, such as load_invoices, and the graph immediately highlights the procedure, the tables it reads and writes, and the downstream procedures and reports affected by it.
4. A side panel updates with the procedure summary, ordered steps, and severity-tagged risks such as missing error handling or an unfiltered delete.
5. The user can see how one failure ripples through the pipeline and understand what is impacted without reading raw SQL.
6. The user exports a Markdown onboarding document and companion SVG snapshot for the whole pipeline.

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

- Start with the seven-file sample as the default working set.
- Uploading `.sql` files merges them into the current working set. A same-name file is replaced with a notice; if multiple files define the same procedure, the latest file wins with a warning.
- Show a “Files in this analysis” list with a remove action per file. Removal only affects the in-memory working set and re-analyzes the remaining files; it never deletes a disk or repository file.
- Provide “Reset to sample” to restore the original seven files. Removing every file shows an empty state that invites upload or reset. Refreshing the page starts over with the sample; no project history is persisted.
- Accept `.sql` files only, up to 15 selected at a time and 20,000 characters per file. Explain invalid files individually while continuing to analyze valid files.
- The app shows procedures as nodes and tables as nodes.
- Edges show read, write, and direct procedure-call relationships.
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
- The summary leads with business purpose and explains why the procedure matters to the workflow, without claiming facts not supported by parsed data.
- Ordered steps describing the procedure’s flow.
- A deterministic “If this fails” impact line counts downstream procedures and tables.
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

Gemini writes only the plain-English summary and ordered steps from parser-derived relationships. Risk detection is deterministic code; the model never decides risks, graph edges, or downstream impact.

### Export onboarding doc

The user can export the current pipeline analysis as a Markdown document and companion SVG for onboarding or handoff.

- The header button is labeled “Export” and downloads the Markdown and SVG files from one click.
- Markdown contains procedure, table, and uncertain-edge counts; a severity summary with affected procedures; the procedure with the largest downstream impact; details for every procedure including summary, ordered steps, reads, writes, severity-tagged risks, “If this fails” counts, and separate downstream procedure/table lists; a note explaining unresolved dynamic SQL; and a Mermaid flowchart generated from graph edges.
- The companion SVG shows the entire graph at full opacity with a legend. If a node is selected, it outlines the selected node and downstream path in the accent color.
- The export is generated in the browser from the current analysis, including the current in-memory file set.
- The export button is disabled when no files are loaded.
- The document is useful to a teammate who needs a readable map of the system.

The ground-truth F1 badge is labeled as verified on the sample project and appears only for the unchanged bundled sample set.

### Loading and error states

The app handles empty, invalid, oversized, or failed inputs in a readable way.

- There is a clear loading state while analysis runs.
- Uploaded graph analysis and deterministic risks appear before any live AI explanation request completes.
- Empty input produces a clear explanation.
- Invalid files or API issues show a human-readable failure.
- A header status dot shows parser connectivity; it turns red with a “Backend unreachable” tooltip when an API request cannot reach the backend.
- If an uploaded file has an unavailable AI explanation, its parsed graph and deterministic risks remain usable.

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
- Compare parsed dependencies against a planted ground truth and show the result in a compact accuracy badge with precision/recall details.
- Export a Markdown onboarding document that includes the pipeline overview, each procedure’s summary, steps, reads/writes, risks and downstream impact.
- Demonstrate the full loop in under a minute as the submission proof.
- Keep Gemini limited to writing summaries and ordered steps from parsed data; never let it decide risks, graph edges, or downstream impact.

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
