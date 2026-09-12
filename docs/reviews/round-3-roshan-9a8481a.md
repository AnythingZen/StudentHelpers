# Review round 3 — Roshan's client @ `9a8481a`

Checked out in isolation, run, and screenshotted in headless Chrome — both on its
own and proxied to C's running server. Roshan's files were not edited.

## What's good

It renders and it looks like a game: third-person avatar, a clean visual
identity (title type, 3D signboards for grove names, an *Enter the Grove* start
button). The typography and signboards are better than C's backup client — worth
keeping as the look of the real thing.

Its API calls — `GET /api/state/:worldId` and `POST /api/answer` — match the
routes C's server implements, so the two plug together directly.

## Verified problems

**1. In dev it never reaches a server.** There's no `vite.config.ts`, so there's
no `/api` proxy. Every call goes to the Vite dev server, gets a 404, and falls
back to the bundled mock. It looks like it works, but nothing is integrated yet.
**Fix:** add a `vite.config.ts` with
`server: { proxy: { '/api': 'http://localhost:3001' } }`. C's server is already
running and serves both demo worlds.

**2. The fallback overrides real server answers.** `api.ts` does
`if (!request.ok) throw`, and the `catch` grades locally. So *any* HTTP error is
treated as "server down". Tested against C's server: a tree in a locked grove
returns `409 This grove is still locked` — and this client would catch it,
grade the answer locally, and let the student through the gate. Same for a
`400`. **Fix:** only fall back when `fetch` itself rejects (a network failure);
for an HTTP error, show the server's `error` message.

**3. Answer keys ship to the browser.** `api.ts` imports `mockWorld.json`, which
includes `answerIndex` and `answerText`, into the client bundle. Anyone can read
every answer in devtools. The contract says answers never reach the browser.
If an offline mode is wanted, strip the keys from the bundled copy.

**4. The offline grading is a placeholder.** Any recall answer over 20 characters
counts as correct, and every sapling gets the literal id `'new-sapling'`.

**5. Answering still stops the game.** The overlay card calls
`controls.unlock()`. *Interactive first* — answer stones you walk onto — is now
on `development`; the card stays as the 3:30 fallback. C's backup client has a
working stones implementation in `backup-client/src/stones.ts` if it helps.

**6. Still on the older `shared/types.ts`** (`AnswerResult`; no `status`, `teach`,
`questName`). See round 2.

**Process, again:** these commits went straight to `development`. Please use
`feature/a-forest`.
