# Codex PR Playbook

Use this file when asking Codex to implement changes in this repo.

## Purpose

This project uses a strict, low-risk workflow:
- small scoped PRs
- explicit branch and PR naming
- clear scope boundaries
- no unrelated refactors
- required validation
- required docs updates when behaviour/structure changes
- version badge update on every PR

This playbook is the default instruction set for all future coding tasks unless the current task explicitly overrides it.

---

## Default working style

For every coding task:

1. Keep the change narrowly scoped.
2. Change only what is required for the requested feature or fix.
3. Do not refactor unrelated code.
4. Do not rename unrelated functions, files, or variables.
5. Preserve existing behaviour except for the requested change.
6. Reuse existing systems where practical instead of creating parallel ones.
7. Keep patches small, local, and easy to review.
8. Prefer explicit validation over assumptions.

---

## Required PR structure

Every implementation prompt should include:

### 1. Objective
State exactly what the PR is meant to achieve.

### 2. PR requirements
Always specify:
- branch name
- PR title
- what must be included in the PR description

### 3. Strict scope
List exactly what may change.
List exactly what must not change.

### 4. Behaviour requirements
Describe the intended user-visible behaviour in plain language.

### 5. Implementation guidance
State the preferred implementation approach.
Say what existing systems should be reused.

### 6. Validation
List the exact things that must be tested and confirmed.

### 7. Documentation
Require docs updates when architecture, structure, behaviour, or controls change.

### 8. Version badge
Require the top-left version badge to be updated on every PR.

### 9. Output
Require a concise summary of:
- files changed
- how the change was implemented
- confirmation that unrelated behaviour was not changed

---

## Mandatory rules for all prompts

Use wording equivalent to the following in every Codex prompt:

### Strict scope
- Change only what is required for this task.
- Do not refactor unrelated code.
- Do not rename unrelated functions or files.
- Keep the patch as small and local as possible.

### Documentation
- If this PR changes architecture, structure, behaviour, controls, or user flow:
  - update `docs/ARCHITECTURE.md` and `docs/DEVELOPMENT.md` accordingly
- If no doc changes are needed:
  - explicitly state `No documentation changes required`

### Version badge
- Update the version badge in `index.html`
- Do not change styling or placement unless explicitly requested

### Validation
- Confirm no unrelated UI/layout/interaction changes occurred
- Confirm no console errors
- Confirm requested behaviour works as specified

---

## Recommended file location in repo

Store this file at:

`docs/CODEX_PR_PLAYBOOK.md`

That keeps it:
- visible
- versioned
- easy to reference from future prompts

A good companion location for task-specific notes is:

`docs/tasks/`

Examples:
- `docs/tasks/PR31-share-schema-notes.md`
- `docs/tasks/PR32-overlay-performance-notes.md`

---

## How to use this in Codex

At the start of a new Codex request, tell Codex to follow this playbook.

Recommended wording:

> Follow the workflow and constraints in `docs/CODEX_PR_PLAYBOOK.md` for this task.  
> Then apply the task-specific instructions below.

Then add the task-specific objective and constraints.

---

## Recommended prompt template

Copy this structure for future prompts.

### Template

```text
Follow the workflow and constraints in docs/CODEX_PR_PLAYBOOK.md for this task.

Objective:
[State exactly what needs to change.]

PR requirements:
1. Create branch:
   [branch-name]

2. Create PR title:
   [PR title]

3. PR description must include:
   - [summary item 1]
   - [summary item 2]
   - confirmation that no unrelated behaviour changed
   - testing instructions

Strict scope:
Only change what is required for:
1. [allowed area 1]
2. [allowed area 2]

Do NOT change:
- [excluded area 1]
- [excluded area 2]
- [excluded area 3]

Behaviour required:
- [behaviour 1]
- [behaviour 2]

Implementation guidance:
- [preferred implementation]
- [systems to reuse]
- [anything to avoid]

Validation:
Verify:
1. [test 1]
2. [test 2]
3. no console errors
4. no unrelated UI/layout/interaction changes

Documentation:
- update docs as required by the playbook
- or explicitly state: No documentation changes required

Version badge:
- update index.html version badge to:
  [PRx.y]

Output:
Provide a concise summary of:
- files changed
- how the change was implemented
- confirmation that no unrelated behaviour changed
```

---

## Review checklist for merged-quality changes

Before merging, check:

- branch name and PR title are correct
- version badge is updated
- scope stayed narrow
- docs were updated if needed
- no console errors
- behaviour matches request
- no accidental UI/layout changes
- no opportunistic cleanup slipped in

---

## Notes for this repo

This repo especially benefits from:
- avoiding broad refactors
- keeping help-overlay changes tightly scoped
- keeping render/input/view changes separated
- reusing existing placement policy instead of creating manual positioning
- ensuring desktop and touch behaviour are both considered when controls change
- preserving export/share/history behaviour unless explicitly in scope

---

## Default closing instruction for future prompts

Add this at the end of future prompts:

> If anything is unclear, prefer the smallest safe implementation that matches the requested behaviour without changing unrelated systems.
