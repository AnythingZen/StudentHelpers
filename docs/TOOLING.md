# TOOLING — CLIs and MCP servers

Everything here was checked against npm and each tool's own README, not recalled.
Set this up **before** the clock starts: it's configuration, not application code.

---

## Node 22.12 or newer — this one will bite

| Package | Requires |
|---|---|
| `ai@7.0.99` | Node `>=22` |
| `vite@8.3.0` | Node `^20.19.0 \|\| >=22.12.0` |
| `express@5.2.1` | Node `>=18` |

**Node 20 LTS is what most machines have, and `ai@7` will not run on it.** Zen's
install fails at minute 5 with an error that doesn't obviously say "wrong Node".

The repo has a `.nvmrc` pinned to `22`:

```bash
nvm install && nvm use      # reads .nvmrc
node -v                     # must print v22.12 or higher
```

Add this to the handshake in `START-HERE.md`: all three say their `node -v` out
loud along with the commit hash.

---

## MCP servers — already configured for the whole team

`.mcp.json` at the repo root is committed, written by `claude mcp add -s project`,
with versions pinned like the rest of the stack. When you open the repo in Claude
Code you'll be asked once to approve the project's servers — approve both.

| Server | Pinned | Who it's for | Why |
|---|---|---|---|
| **Context7** | `@upstash/context7-mcp@4.1.0` | everyone, **Zen most** | Current docs for `ai`, `three`, `express`. The AI SDK moved three majors since most tutorials — `generateObject` is gone, `mimeType` became `mediaType`. Don't write AI SDK code from memory. |
| **Playwright** | `@playwright/mcp@0.0.80` | **Roshan** | Lets Claude Code open the Vite dev server and screenshot the page. It can't otherwise see a WebGL canvas, so without this it's debugging your 3D scene blind. Runs headed by default, which is what you want for WebGL. |

### Context7 API key (optional, recommended)

The committed config has no key, so nothing secret is in git. Context7's README
documents usage with a key; if you hit limits, add your own at **user** scope so
it stays out of the repo:

```bash
claude mcp add --scope user context7 -- npx -y @upstash/context7-mcp --api-key YOUR_API_KEY
```

---

## CLIs by person

### Everyone

| Tool | Check | Why |
|---|---|---|
| Node 22.12+ | `node -v` | see above |
| git | `git --version` | branches per builder |
| GitHub CLI | `gh --version` | PRs, checking what teammates pushed |
| Claude Code | `claude --version` | reads `.mcp.json` automatically |

**Before every push:** `git fetch` and look at what teammates pushed. Never
force-push `development` or anyone else's branch.

### Roshan — A

Nothing beyond the above. Playwright MCP covers visual debugging.

### Zen — B

- `ANTHROPIC_API_KEY` in `server/.env` — never committed.
- `server/brain/` is its own npm package (Zen's call, accepted — it keeps
  `server/package.json` single-owner). Run `npm ci` inside it.

### C — deploy

**Railway**, via the Railway CLI (`@railway/cli`, currently `5.54.0`):

```bash
npm i -g @railway/cli
railway login
railway up
```

**Do not deploy the server to a serverless platform** such as Vercel Functions.
The whole backend is in-memory by design — the worlds `Map` and the presence
`Map`. Serverless instances are ephemeral and can run several copies at once, so
worlds would vanish between requests and two players could land on different
instances and never see each other. It needs one persistent Node process, which
is what Railway runs.

**Install both packages in the deploy build**, or `ai` won't resolve at runtime:

```bash
npm ci --prefix server && npm ci --prefix server/brain && npm ci --prefix client && npm run build --prefix client
```

Serve the built client as static files from Express — one origin, no CORS.

---

## Not needed

- **Supabase MCP / any database tooling** — there is no database. State is in
  memory on purpose.
- **GitHub MCP** — `gh` covers it. Optional if you already use it.
- **React Three Fiber** — ruled out: `@react-three/fiber@9.7.0` declares
  `react >=19 <19.3`, and React is at `19.3.0`.
