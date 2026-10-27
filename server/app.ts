import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { extname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/types.ts';
import { MAX_TOTAL_IMAGE_BYTES, MAX_IMAGES, MAX_THUMBNAIL_BYTES } from '../shared/types.ts';
import { detectAccounts } from './accounts.ts';
import { watchAntigravity } from './agents/antigravity.ts';
import { loadConfig, saveLanguage, savePermissionMode, saveProject } from './config.ts';
import { loadModels } from './models.ts';
import { Office } from './office.ts';
import { Orchestrator } from './orchestrator.ts';
import { Shell } from './shell.ts';
import { importSkill, listSkills, shareSkills } from './skills.ts';
import type { RunImage, RunOutcome } from './agents/runner.ts';
import { Team, type Member } from './team.ts';
import { checkImages, discardImages, saveImages } from './uploads.ts';
import { runBackground } from './tasks.ts';

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

/** What the agents get when the user sent only images, with no text. */
const IMAGE_ONLY = 'Veja a imagem anexada.';

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
  office.permissionMode = config.aprovacao ?? 'manual';
  office.models = await loadModels((models) => office.setModels(models));
  const team = new Team(config, office);
  const orchestrator = new Orchestrator(office, team);
  const stopWatching = watchAntigravity(config.antigravity, office);
  mkdirSync(LOBBY, { recursive: true });
  const shell = new Shell((msg) => office.publish(msg), () => office.project);

  const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
  const reportFailure = (agentId: string, error: unknown) => {
    console.warn('Falha na tarefa:', error);
    office.setStatus(agentId, 'error', 'A tarefa falhou');
    office.write(agentId, 'error', `A tarefa falhou: ${errorText(error)}`);
  };
  const cleanupFailure = (error: unknown) => {
    console.warn('Falha na limpeza das imagens:', error);
    office.write('equipe', 'error', `Falha na limpeza das imagens temporárias: ${errorText(error)}`);
  };
  const recordSubmission = (agentId: string, prompt: string, images: Parameters<typeof saveImages>[0], requestId?: string) => {
    const saved = saveImages(images);
    try {
      office.write(agentId, 'user', prompt, images, requestId);
      if (requestId) office.acceptSubmission(requestId);
      return saved;
    } catch (error) {
      try { discardImages(saved); } catch (cleanupError) { cleanupFailure(cleanupError); }
      throw error;
    }
  };

  /**
   * A task typed straight to one agent. If its account hits the limit (before or during the task),
   * another agent on a different account picks it up with a summary of what was already done.
   */
  async function runDirect(member: Member, prompt: string, images: RunImage[]) {
    // No project yet: chat from an empty folder, just to see the agent respond and its status.
    const [cwd, note] = isFolder(office.project) ? [office.project, undefined] : [LOBBY, LOBBY_NOTE];
    const role = member.config.papel === 'folga' || member.config.papel === 'coordenador' ? 'executor' : member.config.papel;
    let current = member;
    try {
      let task = prompt;
      let since = office.lastLogId;
      let outcome: RunOutcome = { ok: false, text: '', limited: office.isLimited(team.account(current)) };
      if (!outcome.limited) outcome = await current.runner.run(task, cwd, note, images);
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
        outcome = await team.runAs(current, role, task, cwd, note, images);
      }
    } catch (error) {
      reportFailure(current.config.id, error);
    }
  }

  function handle(msg: ClientMessage, reply: (msg: ServerMessage) => void) {
    const submission = (accepted: boolean, text?: string, duplicate?: boolean) => {
      if ((msg.type === 'task' || msg.type === 'command') && msg.requestId) {
        reply({ type: 'submission', requestId: msg.requestId, accepted, text, duplicate, serverId: office.serverId });
      } else if (text) reply({ type: 'notice', text });
    };
    if (msg.type === 'task' || msg.type === 'command' || msg.type === 'submission-status') {
      if ((msg.type === 'submission-status' || msg.requestId !== undefined) &&
          (typeof msg.requestId !== 'string' || !msg.requestId.trim() || msg.requestId.length > 128)) {
        return reply({ type: 'notice', text: 'Identificador de envio inválido.' });
      }
      if (msg.type === 'submission-status') {
        return reply({ type: 'submission-status', requestId: msg.requestId, accepted: office.hasSubmission(msg.requestId), serverId: office.serverId });
      }
      // Check before busy/project/image validation: an accepted replay is only an acknowledgement.
      if (msg.requestId && office.hasSubmission(msg.requestId)) return submission(true, undefined, true);
    }
    switch (msg.type) {
      case 'task': {
        const member = team.get(msg.agentId);
        const runner = member?.runner;
        const prompt = msg.prompt.trim();
        const checked = checkImages(msg.images);
        if ('error' in checked) return submission(false, checked.error);
        const { images } = checked;
        if (!member || !runner || (!prompt && !images.length)) return submission(false, 'Escolha um agente e escreva uma mensagem ou anexe uma imagem.');
        if (orchestrator.running) return submission(false, 'Tem um comando geral em andamento. Pare o plano para falar direto com um agente.');
        if (runner.busy) return submission(false, 'Esse agente ainda está numa tarefa. Espere terminar ou clique em Parar.');
        const saved = recordSubmission(member.config.id, prompt, images, msg.requestId);
        void runBackground(() => runDirect(member, prompt || IMAGE_ONLY, saved), () => discardImages(saved),
          (error) => reportFailure(member.config.id, error), cleanupFailure);
        submission(true);
        return;
      }
      case 'stop':
        team.get(msg.agentId)?.runner.stop();
        return;
      case 'command': {
        const prompt = msg.prompt.trim();
        const checked = checkImages(msg.images);
        if ('error' in checked) return submission(false, checked.error);
        const { images } = checked;
        if (!prompt && !images.length) return submission(false, 'Escreva uma mensagem ou anexe uma imagem.');
        if (!isFolder(office.project)) return submission(false, 'Escolha a pasta do projeto antes de mandar um comando.');
        const error = orchestrator.startError();
        if (error) return submission(false, error);
        const saved = recordSubmission('equipe', prompt, images, msg.requestId);
        void runBackground(() => orchestrator.start(prompt || IMAGE_ONLY, office.project, saved), () => discardImages(saved),
          (error) => {
            const text = `O comando geral falhou: ${errorText(error)}`;
            console.warn(text, error);
            try { office.write('equipe', 'error', text); } finally { orchestrator.fail(text); }
          }, cleanupFailure);
        submission(true);
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
      case 'permission-all':
        if (typeof msg.allow !== 'boolean') return;
        office.answerAllPermissions(msg.allow);
        return;
      case 'permission-mode':
        if (msg.mode !== 'manual' && msg.mode !== 'auto') return;
        try {
          savePermissionMode(msg.mode);
        } catch {
          reply({ type: 'notice', text: 'Não foi possível salvar o modo de aprovação. O modo anterior foi mantido.' });
          return;
        }
        office.setPermissionMode(msg.mode);
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
    const vite = await createVite({ root: options.root, appType: 'spa', server: { middlewareMode: true, hmr: { server }, watch: { ignored: ['**/release/**', '**/dist/**', '**/dist-server/**'] } } });
    server.on('request', (req, res) => vite.middlewares(req, res));
  } else {
    server.on('request', serveStatic(options.web.dir));
  }

  // The agents can run commands on this machine, so only the office page itself may connect:
  // any other site open in the browser could otherwise reach a localhost socket.
  const allowedOrigins = new Set<string>();
  // Base64 images and previews, plus 1 MB for text and JSON metadata.
  // Anything bigger closes the socket before it reaches handle(), which rejects smaller excesses.
  const wss = new WebSocketServer({ noServer: true, maxPayload: Math.ceil((MAX_TOTAL_IMAGE_BYTES + MAX_IMAGES * MAX_THUMBNAIL_BYTES) / 3) * 4 + 1024 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws') return; // Vite's HMR socket handles its own upgrades.
    if (!allowedOrigins.has(req.headers.origin ?? '')) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  wss.on('connection', (ws: WebSocket) => {
    ws.on('error', (error) => {
      console.warn('Conexão WebSocket encerrada:', error.message);
      ws.terminate();
    });
    const send = (msg: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg), (error) => {
        if (error) console.warn('Não foi possível enviar a resposta WebSocket:', error);
      });
    };
    send(office.snapshot());
    if (shell.running) {
      send({ type: 'shell-state', running: true, cwd: shell.cwd });
      send({ type: 'shell-output', data: shell.history() });
    }
    const unsubscribe = office.subscribe(send);
    ws.on('message', (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(data)) as ClientMessage;
      } catch {
        return; // Ignore malformed JSON.
      }
      try {
        handle(msg, send);
      } catch (error) {
        console.warn('Não foi possível processar a mensagem:', error);
        const text = 'Não foi possível processar a mensagem. Tente novamente.';
        if ((msg?.type === 'task' || msg?.type === 'command') && msg.requestId) {
          send({ type: 'submission', requestId: msg.requestId, accepted: office.hasSubmission(msg.requestId), text, serverId: office.serverId });
        } else send({ type: 'notice', text });
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
