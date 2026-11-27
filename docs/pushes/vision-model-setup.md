# Push record — enabling a vision model in the pi harness (outside the repo)

Scope note: this is not game work. It configures the **harness** (pi) so that image input
— screenshots from browser tests, in particular — can be reviewed. It touches
`~/.pi/agent/settings.json`, `~/.pi/agent/models.json`, and this file. No game source,
test, or document in `angry-pigs` was changed.

## Goal and finish line

- The session model `qwen3.8-flash-next-gyro-gyro-s` cannot read images. Give the agent a
  model that can, so browser-test screenshots can be looked at rather than only asserted
  numerically (`docs/browser-testing.md` says assertions are numeric "so they do not depend
  on image review" — that was a consequence of the missing capability, not a design choice).
- Finish line: a vision-capable model configured and **empirically verified** on the real
  provider, plus the harness state recorded honestly. No repo changes required.

## Steps

- [x] Read the harness docs in full before changing anything:
      `docs/models.md`, `docs/environment-variables.md`, `docs/codemode.md`,
      `docs/custom-provider.md`.
- [x] Inventoried the live configuration: pi 1.6.0; `settings.json` selects
      `qwen3.8-flash-next-gyro-gyro-s` from a custom provider named **`gyro`**
      (`api: "anthropic"`, baseUrl `https://gyro.tarhe.one/api`, apiKey taken from the
      `gyro` environment variable — no key in any file); `models.json` registers three
      models on that provider. `PI_MODEL` and `PI_SMALL_MODEL` are the same id, so there is
      no separate vision slot.
- [x] Read the provider's own model list (`GET /api/models`): `vision: true` on
      `qwen3.6-flash-gyro` and `qwen3.8-plus-orbit-orbit`, and **no** vision flag on
      `qwen3.8-flash-next-gyro-gyro-s` — matching the empirical check done earlier in this
      session, which rejected an image on that model.
- [x] Registered the vision flag in `~/.pi/agent/models.json`:
      `qwen3.8-plus-orbit-orbit` gains `vision: true` (contextWindow kept at 128000).
      Flags come from `models.json`, not from the provider's list, so the flag has to be
      written here (docs/models.md).
- [x] Set `vision.enabled: true` and `vision.model: "qwen3.8-plus-orbit-orbit"` in
      `~/.pi/agent/settings.json`. `vision.model` may differ from the working model
      (docs/codemode.md), which keeps the cheap coding model in charge and only spends the
      vision model on images.
- [x] **Verified against the real provider**, not just against config: POSTed
      `/api/v1/messages` with `model: "qwen3.8-plus-orbit-orbit"`, a base64 PNG, and a
      text prompt. HTTP 200, and the description was correct ("blue square on white
      background"). That is the gate for this push — config that merely claims a capability
      is not evidence.

## What did not work, and why the capability is still off

pi's vision gate (SDK `resolveVisionConfig`) treats a model as vision-capable only when the
model is in a **built-in** provider's registry. A model declared in `models.json` under a
custom provider id passes the `vision-capable` check but fails the provider check, so
`vision.enabled: true` resolves to "off". This is why the harness reports vision disabled
even though the provider demonstrably accepts images and the flag is set correctly.

**Deliberate decision, not a workaround:** I did not fork the SDK or rename the provider to
a built-in id. The consequence is that `expandMediaBlocks` strips image blocks and
`--vision` warns "Vision model is disabled; image input is unavailable" — both are the
harness's documented behaviour for an unresolved vision config, and forcing it past the gate
would send images to a model the harness has not vetted. The config is written so that it
works as soon as the gate accepts custom providers.

- Filed upstream: <https://github.com/earendil-works/pi/issues> — custom-provider models
  with `vision: true` are rejected by the vision gate; asks for `customProviders` in the
  gate (SDK exposes `customProviderCapabilities()` already) or a `vision.allowCustom` flag.
- Config lives outside the repo, so **the repo carries no evidence of this setup** — the
  file you are reading is the record. Restart pi to load `settings.json`/`models.json`; they
  are read at startup, and `--vision` is a CLI override, not a file edit.

## State right now — **vision works**

Resolved on 2026-11-26 after the provider switched to **strata** (`pi-strata-provider`,
`PI_PROVIDER=strata`): images arrive as attachments and the session model reads them.
Verified by generating a 300×150 Chromium screenshot (`scratch/vision-halfblue.png`, blue
left half labelled `LEFT BLUE`, white right half) and reading it — the description matched.

The config above is no longer in place: `settings.json` has no `vision` block and
`models.json` holds only the lmstudio provider, because the strata setup replaced both
files. Vision now comes from the strata provider itself, so pi's built-in-provider gate
never applies — that is why the gate described above stopped being a blocker. No
`PI_VISION`/`PI_VISION_MODEL` is set; the working model (`PI_MODEL`,
`qwen3.8-flash-next-gyro-gyro-s`) receives image blocks directly.

**Consequence for the repo:** screenshots can be looked at, not only sampled. Keep numeric
assertions as the CI gate; visual review is the judgment layer, since "does this read as
Tron" is not a pixel-sample question. A test that passes only when a model describes a
screenshot would be non-deterministic and unrunnable in CI.

**Working-rule note:** harness and strata configuration is the user's to change. Do not edit
`~/.pi/agent/settings.json`, `~/.pi/agent/models.json`, or provider packages unless asked
explicitly.

## Follow-ups

1. Visual review in the browser harness: a test can now screenshot a frame and attach it for
   review (`docs/browser-testing.md` "Canvas pixels"). Keep the assertion numeric and treat
   the image as evidence for a human or agent to judge, not as a pass condition.
2. Alternative without the gate: write a small script tool that calls
   `/api/v1/messages` with an image directly. That is a tool addition, not a config change,
   and it belongs in the repo's dev tooling — needs its own scope decision.
3. Still blocked and unrelated to vision: the real finger-drag check needs a physical touch
   device (`docs/checklist.md` §1).
