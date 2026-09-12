# Review round 2 — Zen `e479d07`, Roshan `9b2334b`

Same method as round 1: isolated checkouts, real builds and tests, and edge cases
reproduced rather than guessed. **Nobody's files were edited.** Two suspicions
did *not* hold up under testing and are deliberately left out below.

---

## Zen — `feature/b-brain` @ `e479d07`

**Tests 10/10 pass, `tsc` clean.** `llm.ts` as the single file that names a model
is a good design, and both providers are spec-compatible with `ai@7` — all three
packages depend on `@ai-sdk/provider 4.0.14` (verified).

### Zen was right, and the plan was wrong

The earlier brief said to enable Claude's citations API alongside `Output.object`.
Anthropic's docs: citations *"are incompatible with structured outputs"* — HTTP
400. Filling `{ page, quote }` in-schema is the correct approach. **The briefs
have been corrected.**

Consequence: a model-written quote can be invented. Add server-side verification
against the per-page text you already extract — the snippet is now in your brief
under *Citations — the model writes them, the server verifies them*.

### Two team decisions — not Zen's to make alone

| Decision | Zen's branch | Recommendation |
|---|---|---|
| **Model provider** | GLM (`glm-5.3` / `glm-5.3-flash`) is the default | Use GLM for cheap iteration, but **set `LLM_PROVIDER=anthropic` for rehearsal and the demo.** The commit only claims `BRAIN_MOCK` was verified, so a real GLM call is untested — including whether that endpoint enforces the JSON schema. The diagnosis `z.enum` depends on it. Anthropic's docs confirm structured outputs work with streaming. It's one env var. |
| **Khan Academy scraper** | Built — `scrape.py` via `browser-use` | **Turn it off by default.** It works by getting past a bot challenge Khan Academy puts up deliberately, which is a terms-of-service problem for an edtech team with a sponsor in the room. It also adds Python 3.12, `browser-use` and a Chromium binary to C's Railway deploy. The agreed plan said not to build it. If the team keeps it, gate it behind `BRAIN_BROWSER_FALLBACK=1` and never demo it. |

### Verified bugs

**1. Windows-only Python path — crashes on macOS and Linux.** `source.ts:34`
defaults to `.venv/Scripts/python.exe`, which is the Windows venv layout. Mac and
Linux venvs use `.venv/bin/python`. Reproduced on macOS with no `BRAIN_PYTHON` set:

```
THREW after 89 ms: ENOENT spawn .../server/brain/.venv/Scripts/python.exe
```

C develops on a Mac and deploys to Linux, so this breaks for both.
Fix: `process.platform === 'win32' ? ['Scripts','python.exe'] : ['bin','python']`.

**2. Any fetch failure goes to the browser, not just JS shells.** `plainFetch`
throws on any non-2xx, `fetchSource` catches it as `null`, and `null` routes to
`browserFetch`. The probe above was CK-12's plain **403** — not a JS shell —
and it went down the browser path. With a working venv, a mistyped URL on stage
waits up to the 90-second timeout. Fix: only fall back when the fetch *succeeded*
with too little text; rethrow real HTTP errors.

**3. Scanned PDFs silently produce empty worlds.** `unpdf` reads the text layer
only. An image-only worksheet — common in schools — extracts to almost nothing
and spawns an empty forest. Fix: under ~200 characters extracted, fail with a
clear "looks scanned — paste the text or pick a topic" error. (By reading; text
extraction cannot OCR.)

**4. Commit message claims a change that isn't in the commit.** `e479d07` says
*".env.example gains ZAI_* keys (C, please copy)"* — the diff contains no
`.env.example` change. C has nothing to copy.

### Still open from round 1

Round 1 was written before this push and hadn't reached GitHub when you
committed, so none of it is applied yet. Still needed: the four-line
`schedule.ts` fix, `Buffer` → `Uint8Array` in `shared/types.ts`, and the new
`questName` / presence / `GameEvent` types.

---

## Roshan — pushed to `development` @ `9b2334b`

**`tsc -b && vite build` passes** (verified in a clean checkout). The third-person
avatar is started, which was the one structural decision that had to happen early.

### Process

**Commits went straight to `development`.** The plan is `feature/a-forest`, merged
into `development` only at the 2:30 / 3:30 / 5:00 checkpoints. It matters more
than it sounds: `development` is what everyone pulls to stay current, so partial
client work landing there is what everyone else inherits.

### Verified problems

**1. Two conflicting `shared/types.ts`, and yours is stale.** You and Zen both
created the file independently. Yours is missing `World.status` — the exact field
an earlier contract revision accidentally dropped — and has no `teach` tree kind,
no `rubric`, and no `questName`. It also calls the answer result `AnswerResult`
where Zen's calls it `AnswerResponse`. When `feature/b-brain` merges, git will hit
an add/add conflict on a file you both import.

**Resolution: Zen's `shared/types.ts` is canonical** (with round 1's fixes). Switch
your imports to it rather than merging the two.

**2. `client/tsconfig.tsbuildinfo` is committed.** It's TypeScript's incremental
build cache and is rewritten on every build — your third commit is exactly that
churn. It will conflict between anyone who builds. `*.tsbuildinfo` is now in
`.gitignore`; untrack the existing file:

```bash
git rm --cached client/tsconfig.tsbuildinfo
```

### Not your fault

**`questionCard.ts` is the old answer UI.** The *Interactive first* plan — answer
stones you walk into — hadn't been pushed when you built it. It's pushed now.
The card isn't wasted: it's the official 3:30 fallback if stones aren't reliable.

---

## Checked and ruled out

So nobody spends time on them:

- The macOS-only `@rolldown/binding-darwin-arm64` devDependency does **not** break
  a Linux install — a real `npm ci --os=linux --cpu=x64` succeeded.
- `@ai-sdk/openai-compatible@3.0.48` **is** compatible with `ai@7.0.99`.
