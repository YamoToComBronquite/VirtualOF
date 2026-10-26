import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/types.ts';
import { watchAntigravity } from './agents/antigravity.ts';
import { loadConfig, saveProject } from './config.ts';
import { Office } from './office.ts';
import { Orchestrator } from './orchestrator.ts';
import { Team } from './team.ts';

const HOST = '127.0.0.1';
const root = fileURLToPath(new URL('..', import.meta.url));
const config = loadConfig();
const office = new Office(config.projeto);
office.autoSwitch = config.trocaAutomatica ?? true;
const team = new Team(config, office);
const orchestrator = new Orchestrator(office, team);
watchAntigravity(config.antigravity, office);

function isFolder(path: string) {
  return isAbsolute(path) && existsSync(path) && statSync(path).isDirectory();
}

function handle(msg: ClientMessage) {
  switch (msg.type) {
    case 'task': {
      const member = team.get(msg.agentId);
      const runner = member?.runner;
      const prompt = msg.prompt.trim();
      if (!member || !runner || !prompt) return;
      if (office.isLimited(team.account(member))) {
        const cover = team.substitute(member);
        return office.notice(
          `${member.config.nome} está sem limite de uso agora (veja em Consumo).` + (cover ? ` ${cover.config.nome} está livre para essa tarefa.` : ''),
        );
      }
      if (!isFolder(office.project)) return office.notice('Escolha a pasta do projeto antes de mandar uma tarefa.');
      if (orchestrator.running) return office.notice('Tem um comando geral em andamento. Pare o plano para falar direto com um agente.');
      if (runner.busy) return office.notice('Esse agente ainda está numa tarefa. Espere terminar ou clique em Parar.');
      void runner.run(prompt, office.project);
      return;
    }
    case 'stop':
      team.get(msg.agentId)?.runner.stop();
      return;
    case 'command': {
      const prompt = msg.prompt.trim();
      if (!prompt) return;
      if (!isFolder(office.project)) return office.notice('Escolha a pasta do projeto antes de mandar um comando.');
      void orchestrator.start(prompt, office.project);
      return;
    }
    case 'stop-plan':
      orchestrator.stop();
      return;
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
const vite = await createVite({
  root,
  appType: 'spa',
  server: { middlewareMode: true, hmr: { server } },
});
server.on('request', (req, res) => vite.middlewares(req, res));

// The agents can run commands on this machine, so only the office page itself may connect:
// any other site open in the browser could otherwise reach a localhost socket.
const allowedOrigins = new Set([`http://localhost:${config.porta}`, `http://${HOST}:${config.porta}`]);
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

server.listen(config.porta, HOST, () => {
  const url = `http://localhost:${config.porta}`;
  console.log(`\n  Escritório aberto em ${url}\n  Deixe esta janela aberta; fechar ela desliga o escritório.\n`);
  if (process.argv.includes('--abrir')) {
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['open', [url]];
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  }
});
