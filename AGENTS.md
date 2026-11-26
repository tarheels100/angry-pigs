# Working rules for this repo

## Scope and interaction

1. **Stay inside the requested scope.** Do the change the user asked for and nothing
   adjacent. Do not add extra files, refactors, "while you're there" fixes, or
   follow-up work the request did not call for. If related work seems useful, name it
   as a suggestion at the end and let the user decide — do not do it.
2. **Answer, don't edit.** A short question that does not intend to change the repo
   ("what does X do?", "is Y green?", "where is Z defined?") gets a direct answer from
   reading or running commands. No file writes, no commits.
3. **Broad autonomous work needs an explicit instruction.** Only run a wide, multi-step
   push without checking back when the user says so plainly. Otherwise stop after the
   scoped task and report; ask rather than assume.
4. **Ambiguity → ask, don't expand.** If the request could be read narrowly or broadly,
   do the narrow reading and surface the broader option.

### Work modes: `scoped:` and `autonomous:`

The user marks intent with a leading mode word. If no mode word is present, treat the
request as **scoped**.

| mode | priority | behaviour |
| --- | --- | --- |
| `scoped:` | timely change, quick feedback | Do exactly the named change, run the relevant gate, report. No extra work. |
| `autonomous:` | continuous work, no check-ins | Keep working across commits until the stated finish line, then stop and report. |

An `autonomous:` request **must** come with:

1. **A finish line** — a milestone, an acceptance criterion, or a budget ("until gates
   are green", "until deployed", "3 hours of work"). Autonomy without a finish line
   turns into endless improvement; if the request has none, ask for one before starting.
2. **A scope boundary, when given** — allowed and forbidden paths, e.g. "touch only
   `src/render/**` and `docs/theme-contract.md`; do not change physics". Honor it
   strictly: if real progress requires crossing it, report the blocker instead of
   crossing it.
3. **Gate discipline** — every commit leaves `npm run check` green; the browser and
   determinism gates run before the push closes.

**Overrides:** any user message sent mid-run is the new instruction. Read it as one of:

- **Clarification** of the current task (a correction, a preference, an answer to a
  question I asked) — fold it into the work in progress, keep going, do not restart or
  re-plan from scratch. If the clarification contradicts something already built, fix
  that part rather than continuing to build on the wrong assumption.
- **Addition** to the current task ("also do X") — append it to the plan and its finish
  line, then continue. This widens scope only because the user asked.
- **New task** — replaces the current scope; report the state of the abandoned work.
- **Question** — answer it and stop; do not treat a question as a directive.
- **`stop`** — end the push and report the current state, including anything half-done.

**Where the mode is recorded:** for a large push, the mode, finish line, and boundary go
in the push plan's first section (`docs/pushes/<slug>.md`), so the contract survives an
interrupted session and a resumed agent inherits it rather than re-deriving it from chat.

Example:

```
autonomous: implement the detailed cannon + motion trail from docs/post-m13-notes.md.
Boundary: src/render/**, src/game/cannon.ts, docs/theme-contract.md. Finish line:
browser tests green and deployed. Don't check in until done.
```

## Push work plans (required for large pushes)

A **large push** is any change that spans more than one milestone area, touches several
layers (`core`/`physics`/`game`/`presentation`), or needs more than a couple of commits.

For every large push:

1. **Write the plan before touching code.** Create `docs/pushes/<slug>.md` (slug =
   milestone or feature, e.g. `docs/pushes/M13-browser-tests.md`) containing:
   - work mode (`scoped:` / `autonomous:`), finish line, and scope boundary
   - goal and acceptance criteria (what must be true when the push is done)
   - the ordered steps, each as a checkbox
   - the gates that must pass (`npm run check`, `npm run test:browser`,
     `npm run check:determinism`)
   - open questions / decisions that need the user
2. **Track progress in the same file, as you go.** Tick each checkbox when it is
   genuinely done, and append a short running log entry per step: what changed, which
   command was run, what was measured, and anything blocked. Write the file after each
   step, not at the end — the point is that the work survives a harness crash or an
   interrupted process.
3. **Record state needed to resume.** In the same file keep the current git branch/HEAD,
   the last green gate run, and any constants/measurements discovered so far. A resumed
   session must be able to read only this file and continue without re-deriving context.
4. **Commit the plan file with the work it describes**, so the record is in history.
5. **Never delete the file.** When the push finishes, add a closing section: final
   outcome, gate results, what was deferred, and follow-up work. `docs/pushes/` is the
   permanent record of how the project got here — the earlier habit of deleting
   `docs/working-plan.md` after a push is retired.

Small changes (a single bug fix, a docs tweak, one tuning value) do not need a plan file.

## Other conventions

- Simulation/logic changes must be measurable: run `scratch/sweep-probe.ts` (or a probe)
  and record the numbers in `docs/tuning.md`, rather than guessing.
- Keep the four-layer dependency rule: `presentation → game → physics → core`.
- Decisions that change an interface or contract get an ADR entry in `docs/adr.md`.
- Do not kill processes by image name (`taskkill //F //IM node.exe`); use ephemeral
  ports and explicit handles instead.
