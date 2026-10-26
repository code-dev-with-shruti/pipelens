---
doc: scope
status: approved
---

# PipeLens

A verifiable map of how a SQL data pipeline fits together, and what breaks when a procedure fails.

## The Unique Kernel
PipeLens is not just a SQL explainer. Its distinctive value is that it turns a messy set of stored procedures into a dependency graph that can answer a real operational question: “What breaks downstream if this procedure fails?” The graph is built from parser-confirmed reads and writes, and the impact is computed by traversal rather than guessed by an LLM.

## Who It's For
A new engineer joining a team with undocumented SQL pipelines. They are trying to understand how procedures connect, where data flows, and which reports or downstream processes are affected when one step fails. Today they would read dozens of SQL files, ask teammates, or infer the relationships by hand.

## The Core Loop
The user opens the app with a sample project loaded or uploads SQL files into the current working set. They can remove files from that in-memory set, and each change re-analyzes the full set. They click one procedure or table, immediately see what is downstream of it, and read an explanation of that procedure with associated risks. The loop is: inspect → understand impact → export the summary.

## Inspiration & Identity
The product should feel like a practical engineering tool, not a generic chat interface. It should feel precise, trustworthy, and fast. The identity is “database operations clarity for busy engineers”: a clean graph, sharp highlights, clear side-panel details, and a reference-quality export.

## Why This Matters to the Learner
This project is meaningful because it solves a real onboarding and troubleshooting problem. It turns a confused area of a codebase into something inspectable and explainable in a minute, without requiring someone to read through raw SQL and rely on tribal knowledge.

## What "Working" Looks Like
A new engineer loads the sample project, sees procedures and tables as nodes with arrows, clicks `load_invoices`, and everything downstream lights up instantly. The side panel lists the affected tables and procedures, explains what the procedure does, and highlights risks such as missing error handling or an unfiltered delete. The user can then export the Markdown onboarding doc for the whole pipeline.

## The POC Boundary
In scope:
- T-SQL stored procedures only
- 3–5 uploaded SQL files or a sample project with ~7 procedures
- Add/replace/remove SQL files in a non-persistent working set; reset to the sample at any time
- Interactive graph with reads/writes and downstream impact
- Plain-English procedure summary, ordered steps, and risk list
- Markdown export for the pipeline
- Accuracy check against a planted ground truth
- One-minute demo flow showing the core loop clearly

Out of scope for this hackathon:
- SSIS packages and job schedules
- Other SQL dialects
- A general chat over the pipeline
- Saved user accounts or history
- Deployment to production hosting

## Later
- Support for more SQL dialects and pipeline sources
- Better handling of dynamic SQL and missing edge cases
- “Ask the pipeline” chat grounded in the graph
- Highlighting source lines behind each procedure step
- Export to Confluence or richer documentation formats

## Explicitly Cut
- Real database integration or production data access: not needed to prove the concept.
- Full deployment and login flows: optional later, not core to the demo.
- Open-ended chat Q&A over the entire pipeline: stronger as a next feature, not the MVP.
- Broad enterprise platform support: the proof is a focused T-SQL workflow in a small sample project.
