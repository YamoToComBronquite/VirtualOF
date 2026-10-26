import type { AgentStatus, AgentView, ClientMessage, LogEntry, PermissionRequest, ServerMessage, TerminalAlert } from '../shared/types.ts';
import { DESKS, Scene } from './scene.ts';

const STATUS_TEXT: Record<AgentStatus, string> = {
  idle: 'livre',
  thinking: 'pensando',
  reading: 'lendo',
  writing: 'escrevendo',
  running: 'rodando comando',
  waiting: 'esperando você',
  done: 'terminou',
  error: 'deu erro',
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const state = {
  agents: [] as AgentView[],
  log: [] as LogEntry[],
  permissions: [] as PermissionRequest[],
  terminal: [] as TerminalAlert[],
  project: '',
  selectedId: undefined as string | undefined,
};

const scene = new Scene($<HTMLCanvasElement>('scene'));
let socket: WebSocket | undefined;

function send(msg: ClientMessage) {
  socket?.send(JSON.stringify(msg));
}

function agentName(id: string) {
  return state.agents.find((a) => a.id === id)?.name ?? id;
}

/* ---------- Connection ---------- */

function connect() {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  const badge = $('connection');
  ws.onopen = () => {
    socket = ws;
    badge.textContent = 'conectado';
    badge.classList.add('is-on');
  };
  ws.onclose = () => {
    socket = undefined;
    badge.textContent = 'desconectado, tentando de novo…';
    badge.classList.remove('is-on');
    setTimeout(connect, 2000);
  };
  ws.onmessage = (event) => receive(JSON.parse(event.data) as ServerMessage);
}

function receive(msg: ServerMessage) {
  switch (msg.type) {
    case 'snapshot':
      state.agents = msg.agents;
      state.log = msg.log;
      state.permissions = msg.permissions;
      state.terminal = msg.terminal;
      state.project = msg.project;
      state.selectedId ??= msg.agents[0]?.id;
      scene.doneCount = msg.log.filter((e) => e.kind === 'result').length;
      $<HTMLInputElement>('project').value = msg.project;
      renderAll();
      redraw();
      break;
    case 'agent': {
      const index = state.agents.findIndex((a) => a.id === msg.agent.id);
      const previous = index >= 0 ? state.agents[index].status : undefined;
      if (index >= 0) state.agents[index] = msg.agent;
      else state.agents.push(msg.agent);
      if (msg.agent.status === 'done' && previous !== 'done') {
        scene.markFinished(msg.agent.id);
        notify(`${msg.agent.name} terminou`, msg.agent.activity);
      }
      renderTeam();
      renderDesk();
      break;
    }
    case 'agent-removed':
      state.agents = state.agents.filter((a) => a.id !== msg.id);
      if (state.selectedId === msg.id) state.selectedId = state.agents[0]?.id;
      renderTeam();
      renderDesk();
      break;
    case 'log':
      state.log.push(msg.entry);
      if (msg.entry.kind === 'result') scene.doneCount++;
      appendLog(msg.entry);
      break;
    case 'permission':
      state.permissions.push(msg.request);
      renderNotes();
      notify(`${agentName(msg.request.agentId)} pede permissão`, `${msg.request.tool}: ${msg.request.summary}`);
      break;
    case 'permission-resolved':
      state.permissions = state.permissions.filter((p) => p.id !== msg.id);
      renderNotes();
      break;
    case 'terminal':
      state.terminal.push(msg.alert);
      renderTerminal();
      notify(`${agentName(msg.alert.agentId)} precisa do terminal`, msg.alert.reason);
      break;
    case 'terminal-cleared':
      state.terminal = state.terminal.filter((t) => t.id !== msg.id);
      renderTerminal();
      break;
    case 'project':
      state.project = msg.project;
      $<HTMLInputElement>('project').value = msg.project;
      toast(`Projeto: ${msg.project}`);
      break;
    case 'notice':
      toast(msg.text);
      break;
  }
}

/* ---------- Desktop notifications (only while the tab is in the background) ---------- */

function notify(title: string, body: string) {
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(title, { body });
}

document.addEventListener(
  'click',
  () => {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
  },
  { once: true },
);

/* ---------- Rendering ---------- */

function renderAll() {
  renderTeam();
  renderDesk();
  renderTerminal();
  renderNotes();
  renderLog();
}

function renderTeam() {
  scene.agents = state.agents.slice(0, DESKS.length);
  scene.selectedId = state.selectedId;
  const list = $('team');
  list.replaceChildren(
    ...state.agents.map((agent) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(agent.id === state.selectedId));
      button.addEventListener('click', () => select(agent.id));

      const swatch = document.createElement('span');
      swatch.className = 'team__swatch';
      swatch.style.background = agent.color;

      const name = document.createElement('span');
      name.className = 'team__name';
      name.textContent = agent.name;
      const role = document.createElement('span');
      role.className = 'team__role';
      role.textContent = agent.role;
      name.append(role);

      const status = document.createElement('span');
      status.className = 'team__status';
      status.dataset.status = agent.status;
      status.textContent = STATUS_TEXT[agent.status];

      button.append(swatch, name, status);
      li.append(button);
      return li;
    }),
  );
}

function renderDesk() {
  const agent = state.agents.find((a) => a.id === state.selectedId);
  const desk = $('desk');
  desk.hidden = !agent;
  if (!agent) return;
  $('desk-name').textContent = `${agent.name} · ${agent.role}`;
  const usage =
    agent.usage.inputTokens + agent.usage.outputTokens > 0
      ? ` · ${formatTokens(agent.usage.inputTokens + agent.usage.outputTokens)} tokens` +
        (agent.usage.costUsd ? ` (≈ US$ ${agent.usage.costUsd.toFixed(2)} se fosse API)` : '')
      : '';
  $('desk-activity').textContent = `${agent.activity}${usage}`;
  $('task-form').hidden = !agent.controllable;
  $('watch-only').hidden = agent.controllable;
  $('task-label').textContent = `O que ${agent.name} deve fazer?`;
  const busy = ['thinking', 'reading', 'writing', 'running', 'waiting'].includes(agent.status);
  $<HTMLButtonElement>('send').disabled = busy;
  $<HTMLButtonElement>('stop').disabled = !busy;
}

function formatTokens(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} mil` : String(n);
}

function renderTerminal() {
  $('terminal').replaceChildren(
    ...state.terminal.map((alert) => {
      const li = document.createElement('li');
      li.className = 'term';
      const title = document.createElement('h3');
      title.textContent = 'Abra o terminal';
      const reason = document.createElement('p');
      reason.textContent = `${agentName(alert.agentId)}: ${alert.reason}`;
      const code = document.createElement('code');
      code.textContent = alert.command;

      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copiar comando';
      copy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(alert.command);
        copy.textContent = 'Copiado';
      });
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'ghost';
      done.textContent = 'Já rodei';
      done.addEventListener('click', () => {
        send({ type: 'terminal-done', id: alert.id });
        const agent = state.agents.find((a) => a.id === alert.agentId);
        const idle = agent && !['thinking', 'reading', 'writing', 'running', 'waiting'].includes(agent.status);
        if (agent?.controllable && idle) {
          send({ type: 'task', agentId: agent.id, prompt: `Rodei no terminal: ${alert.command}\nPode continuar de onde parou.` });
        }
      });

      const actions = document.createElement('div');
      actions.className = 'term__actions';
      actions.append(copy, done);
      li.append(title, reason, code, actions);
      return li;
    }),
  );
}

function renderNotes() {
  $('notes').replaceChildren(
    ...state.permissions.map((request) => {
      const li = document.createElement('li');
      li.className = 'note';
      const text = document.createElement('p');
      const who = document.createElement('strong');
      who.textContent = agentName(request.agentId);
      const code = document.createElement('code');
      code.textContent = request.summary;
      text.append(who, ` quer usar ${request.tool}`, code);

      const allow = document.createElement('button');
      allow.type = 'button';
      allow.textContent = 'Aprovar';
      allow.addEventListener('click', () => send({ type: 'permission', id: request.id, allow: true }));
      const deny = document.createElement('button');
      deny.type = 'button';
      deny.className = 'ghost';
      deny.textContent = 'Negar';
      deny.addEventListener('click', () => send({ type: 'permission', id: request.id, allow: false }));

      const actions = document.createElement('div');
      actions.className = 'note__actions';
      actions.append(allow, deny);
      li.append(text, actions);
      return li;
    }),
  );
}

function logVisible(entry: LogEntry) {
  return !$<HTMLInputElement>('only-selected').checked || entry.agentId === state.selectedId;
}

function logItem(entry: LogEntry) {
  const li = document.createElement('li');
  li.dataset.kind = entry.kind;
  const who = document.createElement('span');
  who.className = 'log__who';
  who.textContent = agentName(entry.agentId);
  who.style.color = state.agents.find((a) => a.id === entry.agentId)?.color ?? '';
  li.append(who, entry.text);
  return li;
}

function renderLog() {
  const list = $('log');
  const entries = state.log.filter(logVisible);
  if (!entries.length) {
    const empty = document.createElement('li');
    empty.className = 'log__empty';
    empty.textContent = 'Nada por aqui ainda. Escolha uma mesa e mande a primeira tarefa.';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...entries.map(logItem));
  list.scrollTop = list.scrollHeight;
}

function appendLog(entry: LogEntry) {
  const list = $('log');
  if (!logVisible(entry)) return;
  list.querySelector('.log__empty')?.remove();
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.append(logItem(entry));
  if (atBottom) list.scrollTop = list.scrollHeight;
}

let toastTimer: number | undefined;
function toast(text: string) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 5000);
}

/* ---------- Actions ---------- */

function select(id: string) {
  state.selectedId = id;
  renderTeam();
  renderDesk();
  renderLog();
}

$('scene').addEventListener('click', (event) => {
  const rect = (event.target as HTMLElement).getBoundingClientRect();
  const id = scene.hit(event.clientX - rect.left, event.clientY - rect.top);
  if (id) {
    select(id);
    $<HTMLTextAreaElement>('task').focus();
  }
});

$('task-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const field = $<HTMLTextAreaElement>('task');
  if (!state.selectedId || !field.value.trim()) return;
  send({ type: 'task', agentId: state.selectedId, prompt: field.value });
  field.value = '';
});

$('task').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) $<HTMLFormElement>('task-form').requestSubmit();
});

$('stop').addEventListener('click', () => {
  if (state.selectedId) send({ type: 'stop', agentId: state.selectedId });
});

$('project-form').addEventListener('submit', (event) => {
  event.preventDefault();
  send({ type: 'project', path: $<HTMLInputElement>('project').value });
});

$('only-selected').addEventListener('change', renderLog);

/* ---------- Loop ---------- */

const FRAME_MS = 1000 / 12; // a low frame rate keeps the pixel-art feel and spares the CPU
let last = 0;
function frame(time: number) {
  if (time - last >= FRAME_MS) {
    scene.draw(time);
    last = time;
  }
  requestAnimationFrame(frame);
}

function redraw() {
  scene.resize();
  scene.draw(performance.now());
}

window.addEventListener('resize', redraw);
redraw();
document.fonts.ready.then(redraw);
requestAnimationFrame(frame);
connect();
