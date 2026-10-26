import {
  ROLE_NAMES,
  type Account,
  type ModelCatalog,
  type Quota,
  type SkillCatalog,
  type SkillFile,
  type AgentStatus,
  type AgentView,
  type ClientMessage,
  type LogEntry,
  type PermissionRequest,
  type Plan,
  type PlanStepStatus,
  type RoleKey,
  type ServerMessage,
  type TerminalAlert,
} from '../shared/types.ts';
import { ShellDock } from './shell.ts';
import { DEFAULT_THEME, DESKS, Scene, paintCharacter, stressColor, type Stress, type Theme } from './scene.ts';

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

const STEP_TEXT: Record<PlanStepStatus, string> = {
  pending: 'na fila',
  running: 'fazendo',
  done: 'feito',
  error: 'falhou',
  skipped: 'pulado',
};

const BUSY: AgentStatus[] = ['thinking', 'reading', 'writing', 'running', 'waiting'];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const state = {
  agents: [] as AgentView[],
  log: [] as LogEntry[],
  permissions: [] as PermissionRequest[],
  terminal: [] as TerminalAlert[],
  plan: null as Plan | null,
  quota: { claude: { status: 'unknown' }, codex: { status: 'unknown' }, antigravity: { status: 'unknown' } } as Record<Account, Quota>,
  autoSwitch: true,
  models: { claude: [], codex: [], antigravity: [] } as ModelCatalog,
  project: '',
  selectedId: undefined as string | undefined,
};

const scene = new Scene($<HTMLCanvasElement>('scene'));
let socket: WebSocket | undefined;
const shell = new ShellDock($('shell'), $('shell-screen'), $('shell-cwd'), (msg) => send(msg), () => {
  $('open-shell').setAttribute('aria-pressed', String(shell.visible));
});

function send(msg: ClientMessage) {
  socket?.send(JSON.stringify(msg));
}

function agentById(id: string) {
  return state.agents.find((a) => a.id === id);
}

function agentName(id: string) {
  return agentById(id)?.name ?? id;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Head-and-shoulders pixel portrait, the same character that sits at the desk. */
function portrait(agent: AgentView) {
  const canvas = el('canvas', 'portrait');
  canvas.width = 20;
  canvas.height = 18;
  const ctx = canvas.getContext('2d');
  if (ctx) paintCharacter(ctx, agent, 2, 3);
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
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
    badge.textContent = 'desconectado';
    badge.classList.remove('is-on');
    setTimeout(connect, 2000);
  };
  ws.onmessage = (event) => receive(JSON.parse(event.data) as ServerMessage);
}

function receive(msg: ServerMessage) {
  switch (msg.type) {
    case 'snapshot':
      shell.clear();
      state.agents = msg.agents;
      state.log = msg.log;
      state.permissions = msg.permissions;
      state.terminal = msg.terminal;
      state.plan = msg.plan;
      state.quota = msg.quota;
      state.autoSwitch = msg.autoSwitch;
      state.models = msg.models;
      state.project = msg.project;
      if (!state.selectedId || !agentById(state.selectedId)) state.selectedId = msg.agents[0]?.id;
      scene.doneCount = msg.log.filter((e) => e.kind === 'result').length;
      $<HTMLInputElement>('project').value = msg.project;
      renderAll();
      redraw();
      // localhost:4321/#configuracoes opens straight into the team settings
      if (location.hash === '#configuracoes' && !$<HTMLDialogElement>('settings').open) openSettings();
      break;
    case 'agent': {
      const index = state.agents.findIndex((a) => a.id === msg.agent.id);
      const previous = index >= 0 ? state.agents[index].status : undefined;
      if (index >= 0) state.agents[index] = msg.agent;
      else state.agents.push(msg.agent);
      if (msg.agent.status === 'done' && previous !== 'done') {
        scene.markFinished(msg.agent.id);
        if (!state.plan || state.plan.status !== 'running') notify(`${msg.agent.name} terminou`, msg.agent.activity);
      }
      renderTeam();
      renderDesk();
      renderCommand();
      renderUsage();
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
    case 'shell-output':
      shell.output(msg.data);
      break;
    case 'shell-state':
      shell.state(msg.running, msg.cwd);
      break;
    case 'terminal-cleared':
      state.terminal = state.terminal.filter((t) => t.id !== msg.id);
      renderTerminal();
      break;
    case 'plan': {
      const was = state.plan?.status;
      state.plan = msg.plan;
      renderCommand();
      if (msg.plan && was !== msg.plan.status && (msg.plan.status === 'done' || msg.plan.status === 'error')) {
        notify(msg.plan.status === 'done' ? 'Comando geral concluído' : 'O comando geral parou', msg.plan.summary ?? '');
      }
      break;
    }
    case 'quota':
      state.quota = msg.quota;
      renderUsage();
      renderTeam();
      renderDesk();
      break;
    case 'skills':
      renderSkills(msg.skills);
      break;
    case 'skill-imported': {
      const result = $('skill-result');
      result.textContent = msg.message;
      result.dataset.ok = String(msg.ok);
      result.hidden = false;
      $<HTMLButtonElement>('skill-import').disabled = false;
      if (msg.ok) {
        pendingSkill = null;
        $('skill-preview').hidden = true;
      }
      break;
    }
    case 'models':
      state.models = msg.models;
      if ($<HTMLDialogElement>('settings').open) renderSettings();
      renderDesk();
      break;
    case 'auto-switch':
      state.autoSwitch = msg.enabled;
      renderUsage();
      break;
    case 'project':
      state.project = msg.project;
      $<HTMLInputElement>('project').value = msg.project;
      renderDesk();
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
  renderUsage();
  renderTeam();
  renderDesk();
  renderCommand();
  renderTerminal();
  renderNotes();
  renderLog();
}

/**
 * An agent's "stress" is how close its account is to the subscription limit. Only Claude
 * gives a percentage (and only once usage is high), so otherwise the bar follows the level.
 */
function stressFor(agent: AgentView): Stress | undefined {
  const account = accountOf(agent);
  if (!account) return undefined;
  const quota = state.quota[account];
  if (quota.status === 'limited') return { level: 'esgotado', value: 1 };
  if (quota.utilization !== undefined) {
    const value = Math.min(1, quota.utilization);
    return { level: quota.status === 'warning' || value >= 0.75 ? 'apertado' : 'calmo', value };
  }
  if (quota.status === 'warning') return { level: 'apertado', value: 0.8 };
  if (quota.status === 'ok') return { level: 'calmo', value: 0.15 };
  return { level: 'sem-dados', value: 0 };
}

const STRESS_TEXT: Record<Stress['level'], string> = {
  calmo: 'Tranquilo',
  apertado: 'Apertado',
  esgotado: 'Esgotado',
  'sem-dados': 'Sem dados',
};

function renderStress(agent: AgentView) {
  const box = $('stress');
  const stress = stressFor(agent);
  box.hidden = !stress;
  if (!stress) return;
  const account = accountOf(agent)!;
  const quota = state.quota[account];
  const exact = quota.utilization !== undefined && stress.level !== 'esgotado';
  const percent = Math.round(stress.value * 100);

  const label = $('stress-label');
  label.textContent = exact ? `${STRESS_TEXT[stress.level]} · ${percent}%` : STRESS_TEXT[stress.level];
  label.dataset.level = stress.level;

  // Ten pixel blocks, each coloured by where it sits on the scale
  const bar = $('stress-bar');
  const lit = stress.level === 'sem-dados' ? 0 : Math.max(1, Math.round(stress.value * 10));
  bar.replaceChildren(
    ...Array.from({ length: 10 }, (_, i) => {
      const block = el('span');
      if (i < lit) block.style.background = stressColor((i + 1) / 10);
      return block;
    }),
  );
  bar.setAttribute('aria-valuenow', String(exact ? percent : lit * 10));
  bar.setAttribute('aria-label', `Estresse de ${agent.name}: ${label.textContent}`);

  const parts: string[] = [ACCOUNT_NAMES[account]];
  if (quota.window) parts.push(`limite de ${quota.window}`);
  if (quota.resetsAt) parts.push(`${quota.status === 'limited' ? 'volta' : 'renova'} ${clock(quota.resetsAt)}`);
  const sharing = state.agents.filter((a) => a.id !== agent.id && accountOf(a) === account).map((a) => a.name);
  let detail = parts.join(' · ') + '.';
  if (sharing.length) detail += ` Divide esse limite com ${sharing.join(', ')}.`;
  if (!exact && stress.level !== 'esgotado') {
    detail +=
      account === 'claude'
        ? ' O Claude só informa a porcentagem quando o uso fica alto.'
        : ' O Codex só avisa quando bate o limite.';
  }
  $('stress-detail').textContent = detail;
}

function renderTeam() {
  scene.agents = state.agents.slice(0, DESKS.length);
  scene.selectedId = state.selectedId;
  scene.stress = new Map(state.agents.flatMap((a) => (stressFor(a) ? [[a.id, stressFor(a)!] as const] : [])));
  $('team').replaceChildren(
    ...state.agents.map((agent) => {
      const li = el('li');
      const card = el('button', 'card');
      card.type = 'button';
      card.dataset.status = agent.status;
      card.setAttribute('aria-pressed', String(agent.id === state.selectedId));
      card.addEventListener('click', () => select(agent.id));

      const frame = el('span', 'card__portrait');
      frame.style.setProperty('--agent', agent.color);
      frame.append(portrait(agent));

      const body = el('span', 'card__body');
      const top = el('span', 'card__top');
      top.append(el('span', 'card__name', agent.name), el('span', 'card__role', agent.role));
      body.append(top, el('span', 'card__activity', agent.activity));

      const limited = accountOf(agent) && state.quota[accountOf(agent)!].status === 'limited';
      const status = el('span', 'card__status', limited ? 'sem limite' : STATUS_TEXT[agent.status]);
      status.dataset.status = limited ? 'error' : agent.status;

      card.append(frame, body, status);
      li.append(card);
      return li;
    }),
  );
}

function renderDesk() {
  const agent = state.selectedId ? agentById(state.selectedId) : undefined;
  const desk = $('desk');
  desk.hidden = !agent;
  if (!agent) return;
  $('desk-name').textContent = `Falar com ${agent.name}`;
  renderStress(agent);
  const tokens = agent.usage.inputTokens + agent.usage.outputTokens;
  $('desk-activity').textContent =
    tokens > 0
      ? `${formatTokens(tokens)} tokens nesta sessão` + (agent.usage.costUsd ? ` (≈ US$ ${agent.usage.costUsd.toFixed(2)} se fosse API)` : '')
      : 'Ainda não trabalhou nesta sessão.';
  renderToolkit(agent);
  $('task-form').hidden = !agent.controllable;
  $('watch-only').hidden = agent.controllable;
  $('task-label').textContent = state.project ? `O que ${agent.name} deve fazer?` : `Mensagem para ${agent.name}`;
  $('desk-lobby').hidden = !!state.project;
  const busy = BUSY.includes(agent.status);
  $<HTMLButtonElement>('send').disabled = busy;
  $<HTMLButtonElement>('stop').disabled = !busy;
}

function accountOf(agent: AgentView): Account | undefined {
  // Antigravity IDE conversations are only watched; the Gemini agent (agy) bills to Google.
  return agent.controllable ? agent.kind : undefined;
}

const ACCOUNT_NAMES: Record<Account, string> = {
  claude: 'Conta do Claude',
  codex: 'Conta do ChatGPT (Codex)',
  antigravity: 'Conta do Google (Gemini)',
};

/** What drives each agent, for the settings list. */
const ENGINE_NAMES: Record<AgentView['kind'], string> = {
  claude: 'Claude',
  codex: 'Codex',
  antigravity: 'Gemini pelo Antigravity CLI',
};

function clock(ms: number) {
  const at = new Date(ms);
  const sameDay = at.toDateString() === new Date().toDateString();
  const time = at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `às ${time}` : `${at.toLocaleDateString('pt-BR', { weekday: 'short' })} às ${time}`;
}

/** Subscription limits per account, then what each agent spent. */
function renderUsage() {
  $('quota').replaceChildren(
    ...(Object.keys(ACCOUNT_NAMES) as Account[]).map((account) => {
      const quota = state.quota[account];
      const li = el('li', 'quota__row');
      li.dataset.status = quota.status;
      const head = el('div', 'quota__head');
      const word: Record<Quota['status'], string> = {
        unknown: 'sem dados ainda',
        ok: 'dentro do limite',
        warning: 'perto do limite',
        limited: 'limite atingido',
      };
      head.append(el('span', 'quota__name', ACCOUNT_NAMES[account]), el('span', 'quota__state', word[quota.status]));
      li.append(head);

      if (quota.utilization !== undefined) {
        const percent = Math.round(Math.min(1, quota.utilization) * 100);
        const bar = el('div', 'quota__bar');
        bar.setAttribute('role', 'meter');
        bar.setAttribute('aria-valuenow', String(percent));
        bar.setAttribute('aria-valuemin', '0');
        bar.setAttribute('aria-valuemax', '100');
        bar.setAttribute('aria-label', `${ACCOUNT_NAMES[account]}: ${percent}% usado`);
        const fill = el('span');
        fill.style.width = `${percent}%`;
        bar.append(fill);
        li.append(bar);
      }

      const details: string[] = [];
      if (quota.utilization !== undefined) details.push(`${Math.round(quota.utilization * 100)}% usado`);
      if (quota.window) details.push(`limite de ${quota.window}`);
      if (quota.resetsAt) details.push(`${quota.status === 'limited' ? 'volta' : 'renova'} ${clock(quota.resetsAt)}`);
      if (!details.length) {
        details.push(
          account === 'codex'
            ? 'O Codex só avisa quando bate o limite.'
            : 'Aparece quando um agente Claude trabalhar.',
        );
      }
      li.append(el('p', 'quota__detail', details.join(' · ')));
      return li;
    }),
  );

  const rows = state.agents.filter((a) => a.controllable);
  $('usage-rows').replaceChildren(
    ...rows.map((agent) => {
      const tr = el('tr');
      const name = el('th');
      name.scope = 'row';
      const dot = el('span', 'usage__dot');
      dot.style.background = agent.color;
      name.append(dot, agent.name);
      const tokens = agent.usage.inputTokens + agent.usage.outputTokens;
      tr.append(
        name,
        el('td', undefined, String(agent.usage.tasks)),
        el('td', undefined, tokens ? formatTokens(tokens) : '—'),
        el('td', undefined, agent.usage.costUsd ? `US$ ${agent.usage.costUsd.toFixed(2)}` : '—'),
      );
      return tr;
    }),
  );

  $('auto-switch-state').textContent = state.autoSwitch
    ? 'Troca automática ligada: se uma conta bater o limite no meio de um comando geral, um agente de outra conta assume.'
    : 'Troca automática desligada. Ligue em Configurações.';
}

/** Skills, plugins and MCP servers the agent loaded, so the user knows what it can use. */
function renderToolkit(agent: AgentView) {
  const list = $('desk-toolkit');
  list.hidden = !agent.controllable;
  if (!agent.controllable) return;
  const models = state.models[agent.kind] ?? [];
  const modelLabel = models.find((m) => m.id === (agent.model ?? ''))?.label ?? agent.model ?? 'padrão';
  const model = [el('dt', undefined, 'Modelo'), el('dd', undefined, modelLabel)];
  const kit = agent.toolkit;
  if (!kit) {
    list.replaceChildren(...model, el('dd', 'hint', 'As skills, plugins e servidores MCP aparecem aqui depois da primeira tarefa.'));
    return;
  }
  if (kit.note) {
    list.replaceChildren(...model, el('dd', 'hint', kit.note));
    return;
  }
  const rows: [string, string[]][] = [
    ['Skills', kit.skills],
    ['Plugins', kit.plugins],
    ['MCP', kit.mcp],
  ];
  list.replaceChildren(
    ...model,
    ...rows.flatMap(([label, items]) => [el('dt', undefined, label), el('dd', undefined, items.length ? items.join(', ') : 'nenhum')]),
  );
}

function formatTokens(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} mil` : String(n);
}

/** Plan steps the user expanded, kept open across re-renders. */
const openSteps = new Set<number>();

function renderCommand() {
  const coordinator = state.agents.find((a) => a.roleKey === 'coordenador');
  const workers = state.agents.filter((a) => a.roleKey === 'executor' || a.roleKey === 'revisor').map((a) => a.name);
  $('command-hint').textContent = coordinator
    ? `${coordinator.name} monta a ordem e passa cada parte para ${workers.join(', ') || 'a equipe'}.`
    : 'Escolha um coordenador em Configurações.';

  const plan = state.plan;
  const running = plan?.status === 'planning' || plan?.status === 'running';
  $<HTMLButtonElement>('send-command').disabled = running || !coordinator;
  $('stop-plan').hidden = !running;

  const box = $('plan');
  box.hidden = !plan;
  if (!plan) return;
  const statusText: Record<Plan['status'], string> = {
    planning: `${coordinator?.name ?? 'O coordenador'} está montando o plano…`,
    running: 'Executando o plano',
    done: 'Plano concluído',
    stopped: 'Plano parado por você',
    error: 'O plano parou com erro',
  };
  const status = $('plan-status');
  status.textContent = statusText[plan.status];
  status.dataset.status = plan.status;

  $('plan-steps').replaceChildren(
    ...plan.steps.map((step) => {
      const agent = agentById(step.agentId);
      const li = el('li', 'step');
      li.dataset.status = step.status;
      const who = el('span', 'step__who', agent?.name ?? step.agentId);
      who.style.color = agent?.color ?? '';
      // Coordinators write long, self-contained tasks; show two lines and open on click.
      const task = el('p', 'step__task', step.task);
      task.title = 'Clique para ver a tarefa inteira';
      if (openSteps.has(step.id)) task.classList.add('is-open');
      task.addEventListener('click', () => {
        task.classList.toggle('is-open');
        if (!openSteps.delete(step.id)) openSteps.add(step.id);
      });
      li.append(who, el('span', 'step__state', STEP_TEXT[step.status]), task);
      return li;
    }),
  );
  const summary = $('plan-summary');
  summary.hidden = !plan.summary;
  summary.textContent = plan.summary ?? '';
}

function renderTerminal() {
  $('terminal').replaceChildren(
    ...state.terminal.map((alert) => {
      const li = el('li', 'term');
      const run = el('button', undefined, 'Rodar no PowerShell');
      run.type = 'button';
      run.addEventListener('click', () => shell.run(alert.command));
      const copy = el('button', 'ghost', 'Copiar');
      copy.type = 'button';
      copy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(alert.command);
        copy.textContent = 'Copiado';
      });
      const done = el('button', 'ghost', 'Já rodei');
      done.type = 'button';
      done.addEventListener('click', () => {
        send({ type: 'terminal-done', id: alert.id });
        const agent = agentById(alert.agentId);
        if (agent?.controllable && !BUSY.includes(agent.status)) {
          send({ type: 'task', agentId: agent.id, prompt: `Rodei no terminal: ${alert.command}\nPode continuar de onde parou.` });
        }
      });
      const actions = el('div', 'term__actions');
      actions.append(run, copy, done);
      li.append(
        el('h3', undefined, 'Precisa do terminal'),
        el('p', undefined, `${agentName(alert.agentId)}: ${alert.reason}`),
        el('code', undefined, alert.command),
        actions,
      );
      return li;
    }),
  );
}

function renderNotes() {
  $('notes').replaceChildren(
    ...state.permissions.map((request) => {
      const li = el('li', 'note');
      const text = el('p');
      text.append(el('strong', undefined, agentName(request.agentId)), ` quer usar ${request.tool}`, el('code', undefined, request.summary));
      const allow = el('button', undefined, 'Aprovar');
      allow.type = 'button';
      allow.addEventListener('click', () => send({ type: 'permission', id: request.id, allow: true }));
      const deny = el('button', 'ghost', 'Negar');
      deny.type = 'button';
      deny.addEventListener('click', () => send({ type: 'permission', id: request.id, allow: false }));
      const actions = el('div', 'note__actions');
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
  const li = el('li');
  li.dataset.kind = entry.kind;
  const who = el('span', 'log__who', agentName(entry.agentId));
  who.style.color = agentById(entry.agentId)?.color ?? '';
  li.append(who, entry.text);
  return li;
}

function renderLog() {
  const list = $('log');
  const entries = state.log.filter(logVisible);
  if (!entries.length) {
    list.replaceChildren(el('li', 'log__empty', 'Nada por aqui ainda. Mande um comando geral ou fale direto com uma mesa.'));
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
  const box = $('toast');
  box.textContent = text;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (box.hidden = true), 5000);
}

/* ---------- Settings: roles, nicknames, models and desk order ---------- */

let draft: { agent: AgentView; role: RoleKey; nickname: string; model: string }[] = [];

function openSettings() {
  draft = state.agents
    .filter((a) => a.controllable && a.roleKey)
    .map((agent) => ({
      agent,
      role: agent.roleKey!,
      nickname: agent.name === agent.defaultName ? '' : agent.name,
      model: agent.model ?? '',
    }));
  $<HTMLInputElement>('auto-switch').checked = state.autoSwitch;
  renderSettings();
  $<HTMLDialogElement>('settings').showModal();
}

function draftProblem() {
  if (!draft.length) return 'O escritório não mandou a equipe. Feche e abra o escritório de novo.';
  if (draft.filter((d) => d.role === 'coordenador').length !== 1) return 'Escolha exatamente um coordenador.';
  if (!draft.some((d) => d.role === 'executor')) return 'Escolha pelo menos um executor.';
  return null;
}

function renderSettings() {
  $('settings-team').replaceChildren(
    ...draft.map((entry, index) => {
      const li = el('li', 'member');
      const frame = el('span', 'card__portrait');
      frame.style.setProperty('--agent', entry.agent.color);
      frame.append(portrait(entry.agent));

      const info = el('span', 'member__info');
      // Typing a nickname only updates the draft; re-rendering here would steal the focus.
      const nickname = el('input', 'member__nickname');
      nickname.value = entry.nickname;
      nickname.placeholder = entry.agent.defaultName;
      nickname.maxLength = 24;
      nickname.setAttribute('aria-label', `Apelido de ${entry.agent.defaultName}`);
      nickname.addEventListener('input', () => (entry.nickname = nickname.value));
      info.append(nickname, el('span', 'card__role', `${entry.agent.defaultName} · ${ENGINE_NAMES[entry.agent.kind]}`));
      if (entry.agent.kind === 'codex' && entry.role === 'executor') {
        info.append(el('span', 'member__warn', 'Como executor, o Codex edita arquivos sem post-it de permissão.'));
      }
      if (entry.agent.kind === 'antigravity') {
        info.append(
          el('span', 'member__warn', 'O Gemini edita arquivos do projeto sem post-it; comandos de terminal ficam bloqueados.'),
        );
      }

      const select = el('select');
      select.setAttribute('aria-label', `Papel de ${entry.agent.name}`);
      for (const key of Object.keys(ROLE_NAMES) as RoleKey[]) {
        const option = el('option', undefined, ROLE_NAMES[key]);
        option.value = key;
        option.selected = key === entry.role;
        select.append(option);
      }
      select.addEventListener('change', () => {
        entry.role = select.value as RoleKey;
        renderSettings();
      });

      const model = el('select');
      model.setAttribute('aria-label', `Modelo de ${entry.agent.defaultName}`);
      const options = state.models[entry.agent.kind] ?? [];
      // Keep a saved model visible even if the list hasn't loaded it (yet).
      const known = options.some((m) => m.id === entry.model);
      for (const option of known ? options : [...options, { id: entry.model, label: entry.model }]) {
        const node = el('option', undefined, option.label);
        node.value = option.id;
        node.selected = option.id === entry.model;
        model.append(node);
      }
      model.addEventListener('change', () => (entry.model = model.value));

      const choices = el('span', 'member__choices');
      choices.append(select, model);

      const move = (delta: number) => {
        const target = index + delta;
        [draft[index], draft[target]] = [draft[target], draft[index]];
        renderSettings();
      };
      const up = el('button', 'ghost small', '↑');
      up.type = 'button';
      up.disabled = index === 0;
      up.setAttribute('aria-label', `Subir ${entry.agent.name}`);
      up.addEventListener('click', () => move(-1));
      const down = el('button', 'ghost small', '↓');
      down.type = 'button';
      down.disabled = index === draft.length - 1;
      down.setAttribute('aria-label', `Descer ${entry.agent.name}`);
      down.addEventListener('click', () => move(1));
      const order = el('span', 'member__order');
      order.append(up, down);

      li.append(frame, info, choices, order);
      return li;
    }),
  );
  const problem = draftProblem();
  const warning = $('settings-warning');
  warning.hidden = !problem;
  warning.textContent = problem ?? '';
  $('settings-form').querySelector<HTMLButtonElement>('button[value="save"]')!.disabled = !!problem;
}

$('open-settings').addEventListener('click', openSettings);
$('settings').addEventListener('close', () => {
  const dialog = $<HTMLDialogElement>('settings');
  if (dialog.returnValue === 'save' && !draftProblem()) {
    send({
      type: 'team',
      team: draft.map((d) => ({ id: d.agent.id, role: d.role, nickname: d.nickname, model: d.model })),
      autoSwitch: $<HTMLInputElement>('auto-switch').checked,
    });
  }
});

/* ---------- Ambiente: how the room looks, kept in this browser ---------- */

const THEME_KEY = 'virtualof.ambiente';
const VIEW_KEY = 'virtualof.vista';

// Storage can be missing or blocked (private window, cleared data); the room then uses defaults.
function readStored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not saved; the choice still applies until the page reloads.
  }
}

function loadTheme(): Theme {
  try {
    return { ...DEFAULT_THEME, ...(JSON.parse(readStored(THEME_KEY) ?? '{}') as Partial<Theme>) };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

function applyView(dataUrl: string | null) {
  if (!dataUrl) {
    scene.view = undefined;
    $('view-state').textContent = 'Mostrando a cidade.';
    return;
  }
  const image = new Image();
  image.onload = () => (scene.view = image);
  image.src = dataUrl;
  $('view-state').textContent = 'Mostrando a sua imagem, em pixel art.';
}

/** Crops the picture to the window's shape and shrinks it to the window's 120×34 pixels. */
function shrinkToWindow(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = el('canvas');
      canvas.width = 120;
      canvas.height = 34;
      const ctx = canvas.getContext('2d')!;
      const scale = Math.max(120 / image.width, 34 / image.height);
      const w = 120 / scale;
      const h = 34 / scale;
      ctx.drawImage(image, (image.width - w) / 2, (image.height - h) / 2, w, h, 0, 0, 120, 34);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não consegui abrir essa imagem.'));
    };
    image.src = url;
  });
}

function fillAmbienteForm(theme: Theme) {
  const form = $<HTMLFormElement>('ambiente-form');
  for (const key of ['periodo', 'parede', 'piso'] as const) {
    form.querySelector<HTMLInputElement>(`input[name="${key}"][value="${theme[key]}"]`)!.checked = true;
  }
  for (const key of ['gato', 'tapete', 'plantas', 'extras'] as const) {
    form.querySelector<HTMLInputElement>(`input[name="${key}"]`)!.checked = theme[key];
  }
}

function setTheme(theme: Theme) {
  scene.theme = theme;
  writeStored(THEME_KEY, JSON.stringify(theme));
}

$('ambiente-form').addEventListener('change', (event) => {
  if ((event.target as HTMLElement).id === 'view-file') return;
  const data = new FormData($<HTMLFormElement>('ambiente-form'));
  setTheme({
    periodo: data.get('periodo') as Theme['periodo'],
    parede: data.get('parede') as Theme['parede'],
    piso: data.get('piso') as Theme['piso'],
    gato: data.has('gato'),
    tapete: data.has('tapete'),
    plantas: data.has('plantas'),
    extras: data.has('extras'),
  });
});

$('view-file').addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const dataUrl = await shrinkToWindow(file);
    writeStored(VIEW_KEY, dataUrl);
    applyView(dataUrl);
  } catch (error) {
    $('view-state').textContent = error instanceof Error ? error.message : String(error);
  }
});

$('view-reset').addEventListener('click', () => {
  writeStored(VIEW_KEY, null);
  applyView(null);
});

$('ambiente-reset').addEventListener('click', () => {
  setTheme({ ...DEFAULT_THEME });
  fillAmbienteForm(DEFAULT_THEME);
  writeStored(VIEW_KEY, null);
  applyView(null);
});

$('open-ambiente').addEventListener('click', () => {
  fillAmbienteForm(scene.theme);
  $<HTMLDialogElement>('ambiente').showModal();
});

scene.theme = loadTheme();
applyView(readStored(VIEW_KEY));

/* ---------- Skills: see what is installed and import new ones ---------- */

const SKILL_OWNERS: Record<Account, string> = { claude: 'Claude', codex: 'Codex', antigravity: 'Gemini' };
const SKILL_LIMIT_BYTES = 10 * 1024 * 1024;
let pendingSkill: SkillFile[] | null = null;

function renderSkills(skills: SkillCatalog) {
  $('skills-installed').replaceChildren(
    ...(Object.keys(SKILL_OWNERS) as Account[]).map((account) => {
      const group = el('section', 'skills__group');
      group.append(el('h3', 'skills__owner', `${SKILL_OWNERS[account]} · ${skills[account].length}`));
      const list = el('ul', 'skills__list');
      if (!skills[account].length) list.append(el('li', 'hint', 'Nenhuma skill sua ainda.'));
      for (const skill of skills[account]) {
        const item = el('li', 'skills__chip', skill.name);
        item.title = skill.description;
        list.append(item);
      }
      group.append(list);
      return group;
    }),
  );
}

/** Same frontmatter reading as the server, for the preview before importing. */
function skillMeta(text: string) {
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const field = (key: string) => block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  return { name: field('name'), description: field('description') };
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Turns the picked files into paths relative to the skill folder, skipping git and OS clutter. */
async function readSkill(files: FileList, fromFolder: boolean) {
  const picked = [...files].filter((file) => {
    const path = fromFolder ? file.webkitRelativePath : file.name;
    return !/(^|\/)(\.git|node_modules)(\/|$)|(^|\/)(\.DS_Store|Thumbs\.db)$/.test(path);
  });
  const size = picked.reduce((sum, f) => sum + f.size, 0);
  if (size > SKILL_LIMIT_BYTES) throw new Error('A skill passa de 10 MB. Tire arquivos grandes que ela não precisa.');
  return Promise.all(
    picked.map(async (file) => ({
      // A picked folder comes as "nome-da-pasta/..."; the skill's own files start after it.
      path: fromFolder ? file.webkitRelativePath.split('/').slice(1).join('/') : 'SKILL.md',
      base64: toBase64(await file.arrayBuffer()),
    })),
  );
}

async function pickSkill(input: HTMLInputElement, fromFolder: boolean) {
  const result = $('skill-result');
  result.hidden = true;
  if (!input.files?.length) return;
  try {
    const files = await readSkill(input.files, fromFolder);
    const main = files.find((f) => f.path === 'SKILL.md');
    if (!main) throw new Error('Essa pasta não tem um SKILL.md na raiz. Escolha a pasta da skill em si.');
    const text = new TextDecoder().decode(Uint8Array.from(atob(main.base64), (c) => c.charCodeAt(0)));
    const meta = skillMeta(text);
    pendingSkill = files;
    $('skill-summary').textContent = meta.name
      ? `${meta.name} · ${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'}${meta.description ? ` · ${meta.description}` : ''}`
      : 'Esse SKILL.md não tem "name:" no topo; o escritório vai recusar.';
    $('skill-text').textContent = text.slice(0, 1500) + (text.length > 1500 ? '\n…' : '');
    $('skill-preview').hidden = false;
  } catch (error) {
    pendingSkill = null;
    $('skill-preview').hidden = true;
    result.textContent = error instanceof Error ? error.message : String(error);
    result.dataset.ok = 'false';
    result.hidden = false;
  } finally {
    input.value = '';
  }
}

$('open-skills').addEventListener('click', () => {
  send({ type: 'list-skills' });
  $<HTMLDialogElement>('skills').showModal();
});
$('skill-folder').addEventListener('change', (e) => void pickSkill(e.target as HTMLInputElement, true));
$('skill-file').addEventListener('change', (e) => void pickSkill(e.target as HTMLInputElement, false));
$('skill-import').addEventListener('click', () => {
  if (!pendingSkill) return;
  const targets = [...document.querySelectorAll<HTMLInputElement>('.skills__targets input:checked')].map((i) => i.value as Account);
  send({ type: 'import-skill', files: pendingSkill, targets });
  $<HTMLButtonElement>('skill-import').disabled = true;
});

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

function submitOnCtrlEnter(fieldId: string, formId: string) {
  $(fieldId).addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) $<HTMLFormElement>(formId).requestSubmit();
  });
}
submitOnCtrlEnter('task', 'task-form');
submitOnCtrlEnter('command', 'command-form');

$('task-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const field = $<HTMLTextAreaElement>('task');
  if (!state.selectedId || !field.value.trim()) return;
  send({ type: 'task', agentId: state.selectedId, prompt: field.value });
  field.value = '';
});

$('command-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const field = $<HTMLTextAreaElement>('command');
  if (!field.value.trim()) return;
  send({ type: 'command', prompt: field.value });
  field.value = '';
});

$('stop-plan').addEventListener('click', () => send({ type: 'stop-plan' }));

$('stop').addEventListener('click', () => {
  if (state.selectedId) send({ type: 'stop', agentId: state.selectedId });
});

// Only in the desktop app: the native Windows folder picker.
const desktop = (window as { virtualof?: { pickFolder(): Promise<string | null> } }).virtualof;
if (desktop) {
  const pick = $<HTMLButtonElement>('pick-folder');
  pick.hidden = false;
  pick.addEventListener('click', async () => {
    const folder = await desktop.pickFolder();
    if (!folder) return;
    $<HTMLInputElement>('project').value = folder;
    send({ type: 'project', path: folder });
  });
}

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

// The stage shrinks when the PowerShell dock opens, not only when the window resizes.
new ResizeObserver(redraw).observe($('scene').parentElement!);

$('open-shell').addEventListener('click', () => shell.toggle());
$('shell-close').addEventListener('click', () => shell.hide());
$('shell-restart').addEventListener('click', () => shell.restart());
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && (event.key === "'" || event.code === 'Backquote')) {
    event.preventDefault();
    shell.toggle();
  }
});
redraw();
document.fonts.ready.then(redraw);
requestAnimationFrame(frame);
connect();
