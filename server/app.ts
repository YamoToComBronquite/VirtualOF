import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { extname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/types.ts';
import { detectAccounts } from './accounts.ts';
import { watchAntigravity } from './agents/antigravity.ts';
import { loadConfig, saveLanguage, saveProject } from './config.ts';
import { loadModels } from './models.ts';
import { Office } from './office.ts';
import { Orchestrator } from './orchestrator.ts';
import { Shell } from './shell.ts';
import { importSkill, listSkills, shareSkills } from './skills.ts';
import type { RunOutcome } from './agents/runner.ts';
import { Team, type Member } from './team.ts';

const HOST = '127.0.0.1';

export interface OfficeOptions {
  /** 0 picks any free port (the desktop app); omitted uses the one in escritorio.config.json. */
  port?: number;
  /** 'dev' serves the page through Vite; a folder serves the built page (the desktop app). */
  web: 'dev' | { dir: string };
  /** Project root, for Vite in dev mode. */
  root?: string;
}

/** Where agents work when no project is open: an empty folder of their own. */
const LOBBY = join(homedir(), '.virtualof', 'sala');
const LOBBY_NOTE =
  '[Aviso do escritório: o usuário ainda não abriu nenhum projeto. Você está numa pasta vazia, só para conversar ' +
  'e mostrar que está funcionando. Responda normalmente, mas não crie, altere nem apague arquivos.]';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

/** Serves the built page; unknown paths fall back to index.html. Never leaves `dir`. */
function serveStatic(dir: string) {
  const base = resolve(dir);
  return (req: IncomingMessage, res: ServerResponse) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = normalize(join(base, path));
    if (!file.startsWith(base + sep) && file !== base) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(base, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  };
}

function isFolder(path: string) {
  return isAbsolute(path) && existsSync(path) && statSync(path).isDirectory();
}

export async function startOffice(options: OfficeOptions) {
  const config = loadConfig();
  const office = new Office(config.projeto, detectAccounts());
  office.autoSwitch = config.trocaAutomatica ?? true;
  office.lang = config.idioma ?? 'pt';
  office.models = await loadModels((models) => office.setModels(models));
  const team = new Team(config, office);
  const orchestrator = new Orchestrator(office, team);
  const stopWatching = watchAntigravity(config.antigravity, office);
  mkdirSync(LOBBY, { recursive: true });
  const shell = new Shell((msg) => office.publish(msg), () => office.project);

  /**
   * A task typed straight to one agent. If its account hits the limit (before or during the task),
   * another agent on a different account picks it up with a summary of what was already done.
   */
  async function runDirect(member: Member, prompt: string) {
    // No project yet: chat from an empty folder, just to see the agent respond and its status.
    const [cwd, note] = isFolder(office.project) ? [office.project, undefined] : [LOBBY, LOBBY_NOTE];
    const role = member.config.papel === 'folga' || member.config.papel === 'coordenador' ? 'executor' : member.config.papel;
    let current = member;
    let task = prompt;
    let since = office.lastLogId;
    let outcome: RunOutcome = { ok: false, text: '', limited: office.isLimited(team.account(current)) };
    if (!outcome.limited) outcome = await current.runner.run(task, cwd, note);
    while (outcome.limited) {
      const cover = office.autoSwitch ? team.substitute(current) : null;
      if (!cover) {
        office.notice(
          office.autoSwitch
            ? `${team.label(current)} bateu o limite de uso e ninguém de outra conta está livre agora. Veja em Consumo quando volta.`
            : `${team.label(current)} bateu o limite de uso. A troca automática está desligada (Ajustes).`,
        );
        return;
      }
      const text = `${team.label(current)} bateu o limite de uso. ${team.label(cover)} assumiu a tarefa e continua de onde parou.`;
      office.write(cover.config.id, 'permission', text);
      office.notice(text);
      task = team.handoverNote(current, task, since, outcome.text);
      current = cover;
      since = office.lastLogId;
      outcome = await team.runAs(current, role, task, cwd, note);
    }
  }

  function handle(msg: ClientMessage) {
    switch (msg.type) {
      case 'task': {
        const member = team.get(msg.agentId);
        const runner = member?.runner;
        const prompt = msg.prompt.trim();
        if (!member || !runner || !prompt) return;
        if (orchestrator.running) return office.notice('Tem um comando geral em andamento. Pare o plano para falar direto com um agente.');
        if (runner.busy) return office.notice('Esse agente ainda está numa tarefa. Espere terminar ou clique em Parar.');
        office.write(member.config.id, 'user', prompt);
        void runDirect(member, prompt);
        return;
      }
      case 'stop':
        team.get(msg.agentId)?.runner.stop();
        return;
      case 'command': {
        const prompt = msg.prompt.trim();
        if (!prompt) return;
        if (!isFolder(office.project)) return office.notice('Escolha a pasta do projeto antes de mandar um comando.');
        office.write('equipe', 'user', prompt);
        void orchestrator.start(prompt, office.project);
        return;
      }
      case 'language':
        if (msg.lang !== 'pt' && msg.lang !== 'en') return;
        office.lang = msg.lang;
        saveLanguage(msg.lang);
        office.publish({ type: 'language', lang: msg.lang });
        return;
      case 'stop-plan':
        orchestrator.stop();
        return;
      case 'check-accounts':
        office.setAccounts(detectAccounts());
        return;
      case 'list-skills':
        office.publish({ type: 'skills', skills: listSkills() });
        return;
      case 'import-skill': {
        const result = importSkill(msg.files);
        office.publish({ type: 'skill-imported', ...result });
        if (result.ok) office.publish({ type: 'skills', skills: listSkills() });
        return;
      }
      case 'share-skills': {
        const result = shareSkills();
        office.publish({ type: 'skill-imported', ...result });
        office.publish({ type: 'skills', skills: listSkills() });
        return;
      }
      case 'team': {
        if (orchestrator.running) return office.notice('Pare o comando geral antes de mudar a equipe.');
        const error = team.apply(msg.team, msg.autoSwitch !== false);
        office.notice(error ?? 'Equipe atualizada.');
        return;
      }
      case 'permission':
        office.answerPermission(msg.id, msg.allow);
        return;
      case 'terminal-done':
        office.clearTerminal(msg.id);
        return;
      case 'shell-input':
        if (typeof msg.data === 'string') shell.input(msg.data);
        return;
      case 'shell-run':
        if (typeof msg.command === 'string' && msg.command.trim()) shell.run(msg.command.trim());
        return;
      case 'shell-resize':
        shell.resize(msg.cols, msg.rows);
        return;
      case 'shell-restart':
        shell.restart();
        return;
      case 'shell-kill':
        shell.close();
        return;
      case 'project': {
        const path = resolve(msg.path.trim());
        if (!isFolder(path)) return office.notice(`Essa pasta não existe: ${msg.path}`);
        office.setProject(path);
        saveProject(path);
        return;
      }
    }
  }

  const server = createServer();
  if (options.web === 'dev') {
    // Vite is a development tool; the desktop app never loads it.
    const { createServer: createVite } = await import('vite');
    const vite = await createVite({ root: options.root, appType: 'spa', server: { middlewareMode: true, hmr: { server } } });
    server.on('request', (req, res) => vite.middlewares(req, res));
  } else {
    server.on('request', serveStatic(options.web.dir));
  }

  // The agents can run commands on this machine, so only the office page itself may connect:
  // any other site open in the browser could otherwise reach a localhost socket.
  const allowedOrigins = new Set<string>();
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws') return; // Vite's HMR socket handles its own upgrades.
    if (!allowedOrigins.has(req.headers.origin ?? '')) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  wss.on('connection', (ws: WebSocket) => {
    const send = (msg: ServerMessage) => ws.send(JSON.stringify(msg));
    send(office.snapshot());
    if (shell.running) {
      send({ type: 'shell-state', running: true, cwd: shell.cwd });
      send({ type: 'shell-output', data: shell.history() });
    }
    const unsubscribe = office.subscribe(send);
    ws.on('message', (data) => {
      try {
        handle(JSON.parse(String(data)) as ClientMessage);
      } catch {
        // Ignore malformed messages; the page only sends well-formed ones.
      }
    });
    ws.on('close', unsubscribe);
  });

  await new Promise<void>((done) => server.listen(options.port ?? config.porta, HOST, done));
  const port = (server.address() as AddressInfo).port;
  allowedOrigins.add(`http://localhost:${port}`).add(`http://${HOST}:${port}`);

  return {
    url: `http://localhost:${port}`,
    /** Stops every agent and closes the server, e.g. when the app window closes. */
    shutdown() {
      orchestrator.stop();
      for (const member of team.list()) member.runner.stop();
      stopWatching();
      shell.close();
      wss.close();
      server.close();
    },
  };
}
