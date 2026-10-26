# VirtualOF

A pixel-art virtual office for your AI coding agents. Hand out tasks, approve what they want to run, and watch them work, all from one page in your browser.

![The office at night: agents at their desks](docs/screenshot.png)

[Leia em português](README.pt-BR.md)

## What it does

- **One general command, a whole team.** Write what you want once. The coordinator plans the steps in the best order, the office hands each step to the right agent, and after every step the coordinator can rework the rest of the plan (for example, to fix what the reviewer found). The plan shows up as a live checklist.
- **Pick who does what.** In **Configurações**, choose each agent's role (coordinator, executor, reviewer or off duty) and the desk order. Any agent can coordinate, Codex included.
- **Usage at a glance.** The **Consumo** panel shows each account's subscription limit (Claude reports how much of the 5-hour or weekly window you used and when it resets; Codex reports when it hits the limit) and what each agent spent: tasks, tokens and the API-equivalent cost.
- **Automatic switch on limits.** When an account hits its limit in the middle of a general command, an agent on another account takes over that step, or the coordination itself, and the plan keeps going.
- **Your skills and plugins come along.** Claude agents load the same skills, plugins, MCP servers and CLAUDE.md as your Claude Code; Codex uses its own `~/.codex` setup. Each desk lists what its agent loaded.
- **Or talk to one agent directly.** Click a desk, type a task, send it. No terminal needed.
- **Claude and Codex, side by side.** Two Claude agents run through the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk); Codex runs through the [Codex SDK](https://github.com/openai/codex/tree/main/sdk/typescript), read-only unless it is an executor. Gemini runs through the [Antigravity CLI](https://antigravity.google/docs/cli/headless/) (`agy`) in headless mode and starts as a reserve, ready to cover when another account hits its limit.
- **Approvals as sticky notes.** When Claude wants to edit a file or run a command, a note pops up with **Aprovar** (approve) and **Negar** (deny).
- **"Open the terminal" cards.** If an agent needs something only you can do (a login, an install, an interactive command), it stops and the office shows the exact command to copy. Click **Já rodei** ("I ran it") and the agent carries on.
- **Watches Antigravity.** Antigravity conversations show up as characters that light up while they work. This is watch-only: tasks for Antigravity still go through Antigravity.
- **Live status at every desk.** The screen, the speech bubble and the desk lamp show whether each agent is thinking, reading, writing, running a command, waiting for you, done or stuck. Desktop notifications fire when the tab is in the background.

The interface is in Portuguese (Brazil).

## Requirements

- Node.js 22 or newer
- A Claude account signed in to Claude Code on this machine (the CLI or the IDE extension), or an `ANTHROPIC_API_KEY`
- For the Codex reviewer: a ChatGPT account. Sign in once with `npx codex login` from the project folder
- For the Gemini agent: the [Antigravity CLI](https://antigravity.google/docs/getting-started) (`agy`), signed in with your Google account (it shares the Antigravity IDE login). If it is missing, the office shows the install command
- Optional: [Antigravity](https://antigravity.google), if you want to see its IDE conversations in the office

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
| `papeis` | Instructions for each role: `coordenador`, `executor`, `revisor` |
| `agentes` | The team: `id`, `nome` (name), `tipo` (`claude` or `codex`), `papel` (starting role) and `cor` (shirt color) |
| `antigravity.pasta` | Where Antigravity keeps its conversations (`~/.gemini/antigravity-ide/conversations`) |
| `antigravity.ativoSegundos` | How recently a conversation must have changed to count as working |
| `antigravity.maximo` | How many Antigravity conversations to show |

What you change in the page (project folder, roles, desk order, automatic switch) is saved to `.escritorio.local.json`, which is not committed.

## Security

The agents can read and change files and run commands on your machine, so:

- The server only listens on `127.0.0.1`, and the WebSocket only accepts connections from the office page itself.
- Every Claude action that needs permission goes through a sticky note you approve.
- Codex has no per-action approval in this mode, so it runs in a `read-only` sandbox unless it is an executor (or covering for one). As an executor it can edit project files without a sticky note; the settings dialog warns about this.
- Antigravity is only observed: the office checks when its conversation files change and never opens or modifies them.

## How it works

```
browser (canvas + panel)  ⇄  WebSocket  ⇄  Node server
                                              ├─ Claude Agent SDK  → Claude agents
                                              ├─ Codex SDK         → Codex reviewer
                                              └─ file watcher      → Antigravity (read-only)
```

- `server/`: the office state, the agents, the team (roles and stand-ins), the orchestrator that runs general commands, and the WebSocket server (Vite runs inside it as middleware).
- `src/`: the page. `scene.ts` draws the office on a small canvas that is scaled up; `main.ts` runs the panel.
- `shared/types.ts`: the messages exchanged between the two.

## Roadmap

- New-project flow with a native folder picker and `git init`
- A git checkpoint before every task, with an undo button, and Codex reviewing that exact diff
- A desktop app build

## Disclaimer

VirtualOF is an independent project. It is not affiliated with or endorsed by Anthropic, OpenAI or Google. Claude, Codex and Antigravity are trademarks of their respective owners.

## License

[MIT](LICENSE)
