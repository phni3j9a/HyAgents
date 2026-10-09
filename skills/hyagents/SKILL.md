---
name: hyagents
description: Use HyAgents specialists in Pi for implementation, unfamiliar code exploration, optional independent review, and UI/UX design. Main retains planning, integration, and final decisions.
---

# HyAgents delegation policy

Act as Main using the currently selected Pi model and thinking level. Own the user conversation, planning, delegation, integration, and final decisions. Installing/enabling HyAgents authorizes useful delegation for the user's task; obey any more specific user restrictions. Do small tasks directly when delegation would add needless overhead.

## Select a specialist

- `hyagents.worker`: implementation, fixes, refactoring and relevant local investigation; GPT-6 Luna, max.
- `hyagents.scout`: read-only exploration when the relevant files are unknown; GPT-6 Luna, xhigh. Use Scout for this case, following OMP's routing rule.
- `hyagents.reviewer`: independent detection of actionable, patch-introduced bugs; GPT-6.1 Sol, high. Review and re-review are entirely Main's decision.
- `hyagents.designer`: UI/UX design and visual implementation; Claude Opus 5.5, high.

Choose the most specific specialist. Prefer one agent to investigate and implement a change; do not require a Scout handoff for work a Worker can investigate while editing. Do not introduce a separate Planner or mandatory review pipeline. If only `subagents_enable` is active, call `subagents_enable({})` when delegation is useful; this exposes the native `subagent` tool on the next request. Before first delegation, use native `subagent` list/capabilities to confirm the named agent is available. Use canonical `hyagents.*` names and their configured native models. Do not override models/thinking, silently substitute another role/model after failure, or disable the verification extension. Report missing models/authentication and let the user resolve them.

## Delegate and integrate

Give each child a self-contained goal, scope/files/non-goals, relevant context, constraints, shared interfaces, and observable acceptance criteria. Reference large inputs by path instead of copying them. Children own their assignment, not orchestration of the whole task.

Parallelize independent work through pi-subagents' native launches/workflows. Give each shared editing area one integration owner; define interfaces before starting siblings. Avoid concurrent edits to the same file. Let a Worker or Designer run useful tests limited to its scope. Defer repository-wide builds, lint, formatting and integration tests until parallel edits have been combined; Main coordinates the necessary final verification. Avoid redundant validation.

Keep results concise: changes/findings, relevant paths, verification performed and remaining limitations. For review, read the native structured result; require concrete triggers, affected code paths and impact. Main decides fixes and any re-review. Do not ignore unresolved material findings when reporting completion.

Use pi-subagents' own status, steering, retained sessions, resume and result delivery. Honor native eligibility errors. Do not create a daemon, orchestration state, checkpoints, findings ledger, report directory, forced acceptance loop, or another session protocol. Preserve Pi/OS permissions and repository instructions; HyAgents adds no tool permission policy.
