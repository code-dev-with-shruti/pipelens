---
doc: checklist
status: approved
---

# Build Checklist

Build mode: learn

## Slices

- [x] **1. SQL parsing spike proves reads/writes extraction**
  Becomes usable: A parser can read the sample T-SQL and output procedure/table reads and writes, including wrapper logic and uncertain dynamic SQL handling.
  Why now: This is the critical risk and kernel proof; the graph and UI rely on it.
  PRD ref: `prd.md > The Core Journey`, `prd.md > What We're Building`
  Spec ref: `spec.md > Build Order`, `spec.md > Data Model`, `spec.md > Components`
  Build: Create the sample project SQL, add a parser spike that extracts procedure names and table references, and validate it against a ground-truth file.
  Verify (mechanical): Run the parser test and confirm the extracted edges match the expected reads/writes.
  Learner check: Open the sample SQL and confirm the parser sees the same procedure/table relationships the app is meant to expose.
  Commit: `Add SQL parser spike`

- [x] **2. Backend graph and downstream impact**
  Becomes usable: The backend can process the sample project and return graph data with downstream impact.
  Why now: The graph is the foundation for the proof of value.
  PRD ref: `prd.md > Downstream impact view`
  Spec ref: `spec.md > Data Model`, `spec.md > File Structure`
  Build: Add graph-building, downstream traversal, and API endpoints for `GET /health` and `POST /analyze`.
  Verify (mechanical): Run the API tests and call the analyze endpoint against the sample files.
  Learner check: Load the sample project and confirm the backend returns procedures, tables, and edges.
  Commit: `Build backend graph API`

- [x] **3. Frontend graph with click-to-highlight**
  Becomes usable: The sample pipeline appears as an interactive left-to-right graph, and selecting any procedure, table, or uncertain dependency highlights its downstream impact in the graph and side panel.
  Why now: The graph is the user-facing proof of the product idea.
  PRD ref: `prd.md > The Core Journey`, `prd.md > Downstream impact view`
  Spec ref: `spec.md > Components`, `spec.md > Stack`
  Build: Load the sample project from the backend, render procedure/table nodes and read/write edges with uncertain edges dashed, add the downstream side panel and legend, support responsive layouts, and enable Vite-to-backend CORS. This graph was reviewed and the learner confirmed downstream highlighting works.
  Verify (mechanical): Run the frontend production build and backend tests; start both servers and confirm the sample graph loads, node selection updates downstream highlighting, and uncertain edges remain visibly dashed.
  Learner check: Open the app on desktop and a narrow mobile screen, click a procedure and a table, and confirm the affected objects and downstream list are clear and usable.
  Commit: `Render interactive graph UI`

- [ ] **4. Detail panel and risk display**
  Becomes usable: The selected procedure shows reads/writes, a plain-English summary and ordered steps, and deterministic severity-tagged risks; the graph frames downstream impact clearly.
  Why now: This converts a raw graph into an actionable explanation.
  PRD ref: `prd.md > Procedure detail panel`, `prd.md > Risk detection`
  Spec ref: `spec.md > Components`, `spec.md > Data Model`
  Build: Improve graph readability with larger labels, compact Dagre spacing, accent-colored impact edges and selection framing. Add deterministic rules for missing TRY/CATCH, unfiltered DELETE, hard-coded values, and dynamic SQL. Generate summaries and ordered steps from parsed data with Gemini for uploads; use the local sample cache for the built-in project.
  Verify (mechanical): Run the backend tests and frontend build; confirm sample analysis reads cached explanations without calling Gemini and uploads request Gemini summaries; inspect risk severities and detail fields.
  Learner check: Click a procedure and verify its downstream graph view, reads/writes, summary, steps, and risk descriptions are clear.
  Commit: `Add detail panel and risk rules`

- [ ] **5. Accuracy test**
  Becomes usable: The sample view shows a compact precision/recall-derived accuracy badge against the planted ground truth.
  Why now: This is the credibility check that sets PipeLens apart from a generic SQL chat.
  PRD ref: `prd.md > What We're Building`
  Spec ref: `spec.md > Build Order`, `spec.md > Data Model`
  Build: Compare parsed reads, writes, procedure calls, and uncertain relationships to `ground_truth.json`; show an F1 badge with precision/recall details.
  Verify (mechanical): Run the accuracy test and confirm the badge values and missing/extra relationship lists match the computed result.
  Learner check: Review the accuracy badge and its explanation against the sample project.
  Commit: `Add accuracy check`

- [ ] **6. Export and polish**
  Becomes usable: The user can export a Markdown onboarding document and the app feels demo-ready.
  Why now: The export and polish make the single-minute demo story strong.
  PRD ref: `prd.md > Export onboarding doc`, `prd.md > Loading and error states`
  Spec ref: `spec.md > Components`, `spec.md > Important Failure Modes`
  Build: Add export logic, loading/error states, sample project defaults, and clear UI polish.
  Verify (mechanical): Run the app and export a sample document successfully.
  Learner check: Run the full one-minute demo and confirm the story is clear and quick.
  Commit: `Finalize export and polish`

## Hands-on Checkpoints

- [x] Early usable behavior explored — sample SQL parser and graph output reviewed
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, or prior practice connected
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: [fill in after build]
Route and stops: [fill in after build]
Edit outcome: [fill in after build]
Reflection: [fill in after build]
Activity mode: [fill in after build]

## Revisions

- The learner confirmed the initial graph and downstream behavior, closing slice 3. Slice 4 now includes the specifically requested readability refinement and Gemini/deterministic-risk detail behavior; slice 5 displays its ground-truth result in the UI.
