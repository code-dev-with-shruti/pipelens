---
doc: checklist
status: draft
---

# Build Checklist

Build mode: learn

## Slices

- [ ] **1. SQL parsing spike proves reads/writes extraction**
  Becomes usable: A parser can read the sample T-SQL and output procedure/table reads and writes, including wrapper logic and uncertain dynamic SQL handling.
  Why now: This is the critical risk and kernel proof; the graph and UI rely on it.
  PRD ref: `prd.md > The Core Journey`, `prd.md > What We're Building`
  Spec ref: `spec.md > Build Order`, `spec.md > Data Model`, `spec.md > Components`
  Build: Create the sample project SQL, add a parser spike that extracts procedure names and table references, and validate it against a ground-truth file.
  Verify (mechanical): Run the parser test and confirm the extracted edges match the expected reads/writes.
  Learner check: Open the sample SQL and confirm the parser sees the same procedure/table relationships the app is meant to expose.
  Commit: `Add SQL parser spike`

- [ ] **2. Backend graph and downstream impact**
  Becomes usable: The backend can process the sample project and return graph data with downstream impact.
  Why now: The graph is the foundation for the proof of value.
  PRD ref: `prd.md > Downstream impact view`
  Spec ref: `spec.md > Data Model`, `spec.md > File Structure`
  Build: Add graph-building, downstream traversal, and API endpoints for `GET /health` and `POST /analyze`.
  Verify (mechanical): Run the API tests and call the analyze endpoint against the sample files.
  Learner check: Load the sample project and confirm the backend returns procedures, tables, and edges.
  Commit: `Build backend graph API`

- [ ] **3. Frontend graph with click-to-highlight**
  Becomes usable: The graph renders and highlights downstream impact on click.
  Why now: The graph is the user-facing proof of the product idea.
  PRD ref: `prd.md > The Core Journey`, `prd.md > Downstream impact view`
  Spec ref: `spec.md > Components`, `spec.md > Stack`
  Build: Add the React Flow graph, DAG layout, and click-to-highlight state.
  Verify (mechanical): Start the Vite app and confirm the graph renders without runtime errors and the selected procedure updates the highlight state.
  Learner check: Click a procedure and confirm the downstream nodes light up as expected.
  Commit: `Render interactive graph UI`

- [ ] **4. Detail panel and risk display**
  Becomes usable: The selected procedure shows the summary, steps, reads/writes, and risk list.
  Why now: This converts a raw graph into an actionable explanation.
  PRD ref: `prd.md > Procedure detail panel`, `prd.md > Risk detection`
  Spec ref: `spec.md > Components`, `spec.md > Data Model`
  Build: Add the detail panel and deterministic risk detection rules.
  Verify (mechanical): Confirm the selected procedure includes the expected summary, risk severities, and read/write list.
  Learner check: Click a procedure and verify the side panel feels clear and trustworthy.
  Commit: `Add detail panel and risk rules`

- [ ] **5. Accuracy test**
  Becomes usable: The project reports found vs. missed dependencies and false edges against the planted ground truth.
  Why now: This is the credibility check that sets PipeLens apart from a generic SQL chat.
  PRD ref: `prd.md > What We're Building`
  Spec ref: `spec.md > Build Order`, `spec.md > Data Model`
  Build: Compare the parsed graph to `ground_truth.json` and output a precision/recall summary.
  Verify (mechanical): Run the accuracy test and inspect the counts.
  Learner check: Review the reported counts and confirm the app is honest about what it found.
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

- [ ] Early usable behavior explored — sample SQL parser and graph output reviewed
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

