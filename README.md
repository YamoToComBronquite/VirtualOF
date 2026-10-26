# VirtualOF

A pixel-art virtual office for your AI coding agents. Hand out tasks, approve what they want to run, and watch them work, all from one page in your browser.

![The office at night: agents at their desks](docs/screenshot.png)

[Leia em português](README.pt-BR.md)

## What it does

- **Command agents from the office.** Click a desk, type a task, send it. No terminal needed.
- **Claude and Codex, side by side.** Two Claude agents (a coordinator and an executor) run through the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk); a Codex reviewer runs through the [Codex SDK](https://github.com/openai/codex/tree/main/sdk/typescript) in a read-only sandbox.
- **Approvals as sticky notes.** When Claude wants to edit a file or run a command, a note pops up with **Aprovar** (approve) and **Negar** (deny).
- **"Open the terminal" cards.** If an agent needs something only you can do (a login, an install, an interactive command), it stops and the office shows the exact command to copy. Click **Já rodei** ("I ran it") and the agent carries on.
- **Watches Antigravity.** Antigravity conversations show up as characters that light up while they work. This is watch-only: tasks for Antigravity still go through Antigravity.
- **Live status at every desk.** The screen, the speech bubble and the desk lamp show whether each agent is thinking, reading, writing, running a command, waiting for you, done or stuck. Desktop notifications fire when the tab is in the background.

The interface is in Portuguese (Brazil).

## Requirements

- Node.js 22 or newer
- A Claude account signed in to Claude Code on this machine (the CLI or the IDE extension), or an `ANTHROPIC_API_KEY`
- For the Codex reviewer: a ChatGPT account. Sign in once with `npx codex login` from the project folder
- Optional: [Antigravity](https://antigravity.google), if you want to see its agents in the office

Agents run on your own subscriptions and count against their usual limits. Several agents working at once use those limits up faster.

## Quick start

```bash
git clone https://github.com/YamoToComBronquite/VirtualOF.git
cd VirtualOF
npm install
npm start -- --abrir
```

`--abrir` opens the browser at http://localhost:4321. On Windows you can also double-click `Abrir escritorio.cmd`.

Then paste the path of the project you want the agents to work on, click **Usar**, pick a desk and send a task.

## Configuration

Everything lives in `escritorio.config.json`:

| Key | What it sets |
| --- | --- |
| `porta` | Port for the local server (default `4321`) |
| `agentes` | The team: `id`, `nome` (name), `tipo` (`claude` or `codex`), `papel` (role), `cor` (shirt color), `instrucoes` (role instructions), and for Codex `sandbox` (`read-only` by default) |
| `antigravity.pasta` | Where Antigravity keeps its conversations (`~/.gemini/antigravity-ide/conversations`) |
| `antigravity.ativoSegundos` | How recently a conversation must have changed to count as working |
| `antigravity.maximo` | How many Antigravity conversations to show |

The project folder you choose in the page is saved to `.escritorio.local.json`, which is not committed.

## Security

The agents can read and change files and run commands on your machine, so:

- The server only listens on `127.0.0.1`, and the WebSocket only accepts connections from the office page itself.
- Every Claude action that needs permission goes through a sticky note you approve.
- Codex has no per-action approval in this mode, so it runs in a `read-only` sandbox by default. Change `sandbox` only if you trust it to write.
- Antigravity is only observed: the office checks when its conversation files change and never opens or modifies them.

## How it works

```
browser (canvas + panel)  ⇄  WebSocket  ⇄  Node server
                                              ├─ Claude Agent SDK  → Claude agents
                                              ├─ Codex SDK         → Codex reviewer
                                              └─ file watcher      → Antigravity (read-only)
```

- `server/`: the office state, the agents and the WebSocket server (Vite runs inside it as middleware).
- `src/`: the page. `scene.ts` draws the office on a small canvas that is scaled up; `main.ts` runs the panel.
- `shared/types.ts`: the messages exchanged between the two.

## Roadmap

- New-project flow with a native folder picker and `git init`
- A git checkpoint before every task, with an undo button, and Codex reviewing that exact diff
- The coordinator handing tasks to the other agents on its own
- A desktop app build

## Disclaimer

VirtualOF is an independent project. It is not affiliated with or endorsed by Anthropic, OpenAI or Google. Claude, Codex and Antigravity are trademarks of their respective owners.

## License

[MIT](LICENSE)
