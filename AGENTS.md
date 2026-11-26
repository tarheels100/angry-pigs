# Working rules for this repo

## Push work plans (required for large pushes)

A **large push** is any change that spans more than one milestone area, touches several
layers (`core`/`physics`/`game`/`presentation`), or needs more than a couple of commits.

For every large push:

1. **Write the plan before touching code.** Create `docs/pushes/<slug>.md` (slug =
   milestone or feature, e.g. `docs/pushes/M13-browser-tests.md`) containing:
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
