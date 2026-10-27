# VirtualOF

A pixel-art virtual office for your AI coding agents. Hand out tasks, approve what they want to run, and watch them work, all from one page in your browser.

![The office at night: agents at their desks](docs/screenshot.png)

[Leia em português](README.pt-BR.md)

## What it does

- **A team built from your accounts.** The office starts empty. In **Ajustes** (settings), the **Contas** (accounts) section shows which accounts are signed in on this machine, with a button to sign in to (or install) each one from the built-in PowerShell. Then you fill up to six desks: **Adicionar agente** adds one at a time, and **Montar com minhas contas** builds a whole team (supervisor, UI/UX designer, two fullstack developers, tester and reviewer) using Claude and ChatGPT where you are signed in and a free AI everywhere else. For each desk you pick the AI (Claude, Codex, Gemini or OpenCode), job, nickname and model, and you can reorder or empty desks.
- **A chat, like any AI app.** The right-hand panel is a conversation: your messages, the agents' replies and what they are doing scroll up, and the message box stays at the bottom. **Enter** sends, **Shift + Enter** adds a line. While something runs, the send button turns into a stop button.
- **Talk to the team or to one agent.** Under **Para** (to), pick **Equipe** (team) for a general command, or pick one agent from the list. Clicking a desk picks that agent too, and the conversation then shows only that agent.
- **One general command, a whole team.** The supervisor plans the steps in the best order, the office hands each step to the right agent, and after every step the supervisor can rework the rest of the plan (for example, to fix what the reviewer found). The plan sits above the message box as a live checklist.
- **The team at a glance.** A drawer on the left (open or close it from its tab) shows every agent with their job, what they are doing and a **stress** meter: how close their account is to its limit. Below it, **Consumo** (usage) lists tasks, how much of the limit is used and how much is left.
- **Automatic switch on limits, with a handover note.** When an account hits its limit mid-task, an agent on another account takes over, free ones (Gemini and OpenCode) first. The new agent gets the original task, what the previous one already did and where it stopped, so it carries on instead of starting over. This works for general commands and for direct chats.
- **Skills for everyone.** The **Skills** window lists your skills once for the whole team. Importing one installs it for Claude, Codex and Gemini, so every agent, including ones added later, gets it. **Passar para todos** (share with everyone) copies skills that only some agents have. Only import skills you trust: they can include scripts the agents run.
- **Your setup comes along.** Claude agents load the same skills, plugins, MCP servers and CLAUDE.md as your Claude Code; Codex uses its own `~/.codex` setup. Each agent's details list what it loaded.
- **Built-in PowerShell.** A real terminal along the bottom of the window (button **Terminal** or Ctrl + '), opened in the project folder.
- **"Needs the terminal" cards.** If an agent needs something only you can do (a login, an install, an interactive command), it stops and the office shows the exact command. Click **Rodar no PowerShell** to run it in the built-in terminal, then **Já rodei** ("I ran it") and the agent carries on.
- **Manual or automatic approval.** In **Manual** mode (the default), Claude tool requests that require approval appear as sticky notes with **Aprovar** (approve) and **Negar** (deny); with multiple requests, **Aprovar todas** and **Negar todas** answer all currently pending notes. **Automática** mode approves these requests without asking and also approves notes already waiting. The mode is saved for the next start. Terminal cards still need the user in both modes. This switch does not change Codex, Gemini or OpenCode permissions.
- **Make the room yours.** The **Ambiente** window sets the time of day (night, sunset, day), wall color and floor, hides or shows the cat, rug, plants and the coffee corner, and can put your own picture in the window, drawn as pixel art.
- **Portuguese or English.** Pick the language in **Ajustes**; the agents are told to answer in it too.
- **Watches Antigravity.** Antigravity IDE conversations show up as characters that light up while they work (watch-only), when there is a free desk.
- **Live status at every desk.** The screen, the speech bubble and the desk lamp show whether each agent is thinking, reading, writing, running a command, waiting for you, done or stuck. Desktop notifications fire when the window is in the background.

Claude runs through the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk), Codex through the [Codex SDK](https://github.com/openai/codex/tree/main/sdk/typescript) Gemini through the [Antigravity CLI](https://antigravity.google/docs/cli/headless/) (`agy`) and the free models through [OpenCode](https://opencode.ai/docs/cli/) (`opencode run`), both in headless mode.

## Getting started

VirtualOF is **not a website**: it runs on your computer, because that is where the agents read and change your files and use your accounts. The window (or browser tab) is just its screen.

### Option 1: install the app (Windows)

1. Download `VirtualOF-Setup.exe` from [Releases](https://github.com/YamoToComBronquite/VirtualOF/releases) and install it.
2. Open **VirtualOF** from the Start menu. Closing the window turns the office and its agents off.
3. Click **Escolher…** (choose), pick your project folder and send a task.

The installer carries everything it needs (including the Claude Code and Codex engines), which is why it is large.

The app updates itself: when it opens (and every 4 hours) it checks Releases for a newer version, downloads it in the background and asks before restarting. Your settings are kept.

The app is not code-signed, so on first install Windows shows "Windows protected your PC". Click **More info → Run anyway**.

### Option 2: run from source

1. Install [Node.js](https://nodejs.org) 22 or newer.
2. Get the project: **Code → Download ZIP** on GitHub, or `git clone https://github.com/YamoToComBronquite/VirtualOF.git`.
3. On Windows, double-click `Abrir escritorio.cmd`. Elsewhere, run `npm install` and then `npm start -- --abrir` in the folder.
4. Your browser opens http://localhost:4321. Keep the console window open: closing it turns the office off.

To build the installer yourself, run `npm run dist` (output in `release/`).

To ship a new version: bump `version` in `package.json` and run `npm run release` with a GitHub token in `GH_TOKEN`. It publishes `VirtualOF-Setup.exe`, `VirtualOF-Setup.exe.blockmap` and `latest.yml` to a Release, and installed apps pick it up.

### Accounts

Everyone uses their own subscriptions, and the agents count against their usual limits. Nobody needs all of them: **Contas** in Ajustes shows what this machine has, and desks without an account can use a free AI.

- **Claude:** an account signed in to Claude Code on this machine (the CLI or the IDE extension), or an `ANTHROPIC_API_KEY`.
- **Codex:** a ChatGPT account. If it isn't signed in, the office shows the command on a **Precisa do terminal** card, ready to run in the built-in PowerShell.
- **Gemini:** the [Antigravity CLI](https://antigravity.google/docs/getting-started) (`agy`), signed in with your Google account (run `agy` once in the built-in PowerShell; it has its own login, separate from the IDE). If it is missing, the office shows the install command.
- **OpenCode (free):** [OpenCode](https://opencode.ai) (`npm install -g opencode-ai`, needs Node.js) with its free models, such as Big Pickle, DeepSeek Flash and GLM Flash, no sign-in needed. The free lineup changes from time to time; the office reads the current one with `opencode models opencode`. Running headless, OpenCode refuses anything it would ask permission for.
- **Optional:** [Antigravity](https://antigravity.google), to see its IDE conversations in the office.

Several agents working at once use those limits up faster.

## Configuration

Everything lives in `escritorio.config.json`:

| Key | What it sets |
| --- | --- |
| `porta` | Port for the local server (default `4321`) |
| `papeis` | Instructions for each job: `coordenador` (supervisor), `designer` (UI/UX), `executor` (fullstack), `tester`, `revisor` (reviewer) |
| `agentes` | The team: `id`, `nome` (name), `tipo` (`claude`, `codex` or `antigravity`), `papel` (starting job) and `cor` (shirt color) |
| `antigravity.pasta` | Where Antigravity keeps its conversations (`~/.gemini/antigravity-ide/conversations`) |
| `antigravity.ativoSegundos` | How recently a conversation must have changed to count as working |
| `antigravity.maximo` | How many Antigravity conversations to show |

What you change in the page (project folder, jobs, nicknames, models, desk order, automatic switch, language) is saved to `.escritorio.local.json` (in the desktop app, in its app-data folder), which is not committed.

## Security

The agents can read and change files and run commands on your machine, so:

- The server only listens on `127.0.0.1`, and the WebSocket only accepts connections from the office page itself.
- In manual mode, Claude tool requests that reach the office's approval hook wait for your answer. Automatic mode approves them, including pending notes; enabling it asks for confirmation. Cancelled requests are denied in both modes. Terminal cards are never approved by the mode switch or the answer-all buttons.
- Codex has no per-action approval in this mode, so it runs in a `read-only` sandbox unless its job changes files (designer, fullstack or tester, or covering for one). Then it can edit project files without a sticky note; the settings dialog warns about this.
- The built-in PowerShell has the same access you have. Only the office page can reach it.
- Antigravity is only observed: the office checks when its conversation files change and never opens or modifies them.

## How it works

```
browser (canvas + panel)  ⇄  WebSocket  ⇄  Node server
                                              ├─ Claude Agent SDK  → Claude agents
                                              ├─ Codex SDK         → Codex agents
                                              ├─ Antigravity CLI   → Gemini
                                              ├─ node-pty          → built-in PowerShell
                                              └─ file watcher      → Antigravity (read-only)
```

- `server/`: the office state, the agents, the team (roles and stand-ins), the orchestrator that runs general commands, and the WebSocket server (Vite runs inside it as middleware).
- `src/`: the page. `scene.ts` draws the office on a small canvas that is scaled up; `main.ts` runs the panels; `i18n.ts` holds the English texts.
- `electron/`: the desktop app, which starts the same server and opens it in a window.
- `shared/types.ts`: the messages exchanged between the two.

## Roadmap

- New-project flow with a native folder picker and `git init`
- A git checkpoint before every task, with an undo button, and Codex reviewing that exact diff

## Disclaimer

VirtualOF is an independent project. It is not affiliated with or endorsed by Anthropic, OpenAI or Google. Claude, Codex and Antigravity are trademarks of their respective owners.

## License

[MIT](LICENSE)
