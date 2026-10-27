import {
  DESK_COUNT,
  EDITING_ROLES,
  FREE_ACCOUNTS,
  ROLE_NAMES,
  WORKER_ROLES,
  type Account,
  type AccountStatus,
  type AgentKind,
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
  type Lang,
} from '../shared/types.ts';
import { applyLang, getLang, translate } from './i18n.ts';
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
  quota: {
    claude: { status: 'unknown' },
    codex: { status: 'unknown' },
    antigravity: { status: 'unknown' },
    opencode: { status: 'unknown' },
  } as Record<Account, Quota>,
  autoSwitch: true,
  models: { claude: [], codex: [], antigravity: [], opencode: [] } as ModelCatalog,
  accounts: undefined as Record<Account, AccountStatus> | undefined,
  project: '',
  selectedId: undefined as string | undefined,
  /** Who the message box talks to: the whole team (general command) or one agent. */
  target: 'equipe' as string,
};

const scene = new Scene($<HTMLCanvasElement>('scene'));
let socket: WebSocket | undefined;
const commandField = $<HTMLTextAreaElement>('command');
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
    badge.querySelector('span')!.textContent = 'conectado';
    badge.classList.add('is-on');
  };
  ws.onclose = () => {
    socket = undefined;
    badge.querySelector('span')!.textContent = 'desconectado';
    badge.classList.remove('is-on');
    setTimeout(connect, 2000);
  };
  ws.onmessage = (event) => receive(JSON.parse(event.data) as ServerMessage);
}

function receive(msg: ServerMessage) {
  switch (msg.type) {
    case 'snapshot':
      shell.clear();
      if (msg.lang !== getLang()) setLang(msg.lang);
      state.agents = msg.agents;
      state.log = msg.log;
      state.permissions = msg.permissions;
      state.terminal = msg.terminal;
      state.plan = msg.plan;
      state.quota = msg.quota;
      state.autoSwitch = msg.autoSwitch;
      state.models = msg.models;
      state.accounts = msg.accounts;
      state.project = msg.project;
      if (!state.selectedId || !agentById(state.selectedId)) state.selectedId = msg.agents[0]?.id;
      scene.doneCount = msg.log.filter((e) => e.kind === 'result').length;
      $<HTMLInputElement>('project').value = msg.project;
      renderProject();
      renderAll();
      redraw();
      // localhost:4321/#configuracoes opens straight into the team settings, and so does an
      // empty office the first time the page connects, so the user can put a team together.
      if (!$<HTMLDialogElement>('settings').open && (location.hash === '#configuracoes' || (!askedForTeam && !teamAgents().length))) {
        openSettings();
      }
      askedForTeam = true;
      break;
    case 'accounts':
      state.accounts = msg.accounts;
      if ($<HTMLDialogElement>('settings').open) {
        renderAccounts();
        renderSettings();
      }
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
    case 'language':
      // Reloading starts the page from its Portuguese source, then translates if needed.
      setLang(msg.lang);
      location.reload();
      break;
    case 'auto-switch':
      state.autoSwitch = msg.enabled;
      renderUsage();
      break;
    case 'project':
      state.project = msg.project;
      $<HTMLInputElement>('project').value = msg.project;
      renderProject();
      renderDesk();
      toast(`Projeto: ${msg.project}`);
      break;
    case 'notice':
      toast(msg.text);
      break;
  }
}

/* ---------- Language ---------- */

const LANG_KEY = 'virtualof.idioma';

function setLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Without storage the page shows Portuguese until the office says otherwise.
  }
  applyLang(lang);
}

// Translate before the first paint when this computer already chose English.
try {
  if (localStorage.getItem(LANG_KEY) === 'en') applyLang('en');
} catch {
  // Same as above.
}

for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="idioma"]')) {
  radio.addEventListener('change', () => {
    if (radio.checked) send({ type: 'language', lang: radio.value as Lang });
  });
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

  // Built from pieces, so each piece is translated on its own.
  const parts: string[] = [translate(ACCOUNT_NAMES[account])];
  if (quota.window) parts.push(translate(`limite de ${quota.window}`));
  if (quota.resetsAt) parts.push(translate(`${quota.status === 'limited' ? 'volta' : 'renova'} ${clock(quota.resetsAt)}`));
  const sharing = state.agents.filter((a) => a.id !== agent.id && accountOf(a) === account).map((a) => a.name);
  const sentences = [parts.join(' · ') + '.'];
  if (sharing.length) sentences.push(translate(`Divide esse limite com ${sharing.join(', ')}.`));
  if (!exact && stress.level !== 'esgotado') {
    sentences.push(
      translate(
        account === 'claude'
          ? 'O Claude só informa a porcentagem quando o uso fica alto.'
          : `O ${account === 'codex' ? 'Codex' : 'Gemini'} só avisa quando bate o limite.`,
      ),
    );
  }
  $('stress-detail').textContent = sentences.join(' ');
}

/** A small ten-block stress meter for the team cards. */
function miniStress(stress: Stress) {
  const row = el('span', 'card__stress');
  const meter = el('span', 'card__meter');
  const lit = stress.level === 'sem-dados' ? 0 : Math.max(1, Math.round(stress.value * 10));
  meter.append(
    ...Array.from({ length: 10 }, (_, i) => {
      const block = el('i');
      if (i < lit) block.style.background = stressColor((i + 1) / 10);
      return block;
    }),
  );
  meter.setAttribute('aria-hidden', 'true');
  row.append(meter, `estresse: ${STRESS_TEXT[stress.level].toLowerCase()}`);
  return row;
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
      const stress = stressFor(agent);
      if (stress) card.append(miniStress(stress));
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
  $('desk-name').textContent = agent.name;
  renderStress(agent);
  const tokens = agent.usage.inputTokens + agent.usage.outputTokens;
  $('desk-activity').textContent =
    tokens > 0
      ? `${formatTokens(tokens)} tokens nesta sessão` + (agent.usage.costUsd ? ` (≈ US$ ${agent.usage.costUsd.toFixed(2)} se fosse API)` : '')
      : 'Ainda não trabalhou nesta sessão.';
  renderToolkit(agent);
  $('watch-only').hidden = agent.controllable;
}

function accountOf(agent: AgentView): Account | undefined {
  // Antigravity IDE conversations are only watched; the Gemini agent (agy) bills to Google.
  return agent.controllable ? agent.kind : undefined;
}

const ACCOUNT_NAMES: Record<Account, string> = {
  claude: 'Conta do Claude',
  codex: 'Conta do ChatGPT (Codex)',
  antigravity: 'Conta do Google (Gemini)',
  opencode: 'OpenCode (modelos grátis)',
};

/** What drives each agent, for the settings list. */
const ENGINE_NAMES: Record<AgentView['kind'], string> = {
  claude: 'Claude',
  codex: 'Codex',
  antigravity: 'Gemini pelo Antigravity CLI',
  opencode: 'OpenCode, modelos grátis',
};

function clock(ms: number) {
  const at = new Date(ms);
  const sameDay = at.toDateString() === new Date().toDateString();
  const time = at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `às ${time}` : `${at.toLocaleDateString('pt-BR', { weekday: 'short' })} às ${time}`;
}

/** Subscription limits per account, then what each agent spent. */
/** How much of the account's limit is used, and what is left until it runs out. */
function limitCells(agent: AgentView): [string, string] {
  const account = accountOf(agent);
  if (!account) return ['—', '—'];
  const quota = state.quota[account];
  if (quota.status === 'limited') return ['esgotado', quota.resetsAt ? `volta ${clock(quota.resetsAt)}` : '0%'];
  if (quota.utilization !== undefined) {
    const used = Math.round(Math.min(1, quota.utilization) * 100);
    return [`${used}%`, `${100 - used}%`];
  }
  if (quota.status === 'warning') return ['perto', 'pouco'];
  if (quota.status === 'ok') return ['ok', '—'];
  return ['—', '—'];
}

function renderUsage() {
  const rows = state.agents.filter((a) => a.controllable);
  $('usage-rows').replaceChildren(
    ...rows.map((agent) => {
      const tr = el('tr');
      const name = el('th');
      name.scope = 'row';
      const dot = el('span', 'usage__dot');
      dot.style.background = agent.color;
      name.append(dot, agent.name);
      const [used, left] = limitCells(agent);
      const limitCell = el('td', 'usage__limit', used);
      limitCell.dataset.status = accountOf(agent) ? state.quota[accountOf(agent)!].status : 'unknown';
      tr.append(name, el('td', undefined, String(agent.usage.tasks)), limitCell, el('td', undefined, left));
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

/** One line of the "Para" list: portrait, name, and what that choice means. */
function targetLine(agent: AgentView | undefined) {
  const line = el('span', 'picker__line');
  if (agent) {
    line.append(portrait(agent), el('span', 'picker__name', agent.name), el('span', 'picker__role', agent.role));
  } else {
    line.append(el('span', 'picker__team', '★'), el('span', 'picker__name', 'Equipe'), el('span', 'picker__role', 'Comando geral'));
  }
  return line;
}

/** "Para": a button showing who gets the message; clicking it opens the list of the team. */
function renderTargets() {
  const options = [undefined, ...state.agents.filter((a) => a.controllable)];
  if (!options.some((a) => (a?.id ?? 'equipe') === state.target)) state.target = 'equipe';
  const chosen = options.find((a) => (a?.id ?? 'equipe') === state.target);
  $('target-button').replaceChildren(targetLine(chosen), el('span', 'picker__caret', '▾'));
  $('targets').replaceChildren(
    ...options.map((agent) => {
      const id = agent?.id ?? 'equipe';
      const li = el('li');
      const option = el('button', 'picker__option');
      option.type = 'button';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(id === state.target));
      if (agent) option.dataset.status = agent.status;
      option.append(targetLine(agent));
      if (agent) option.append(el('span', 'picker__status', STATUS_TEXT[agent.status]));
      option.addEventListener('click', () => {
        closeTargets();
        setTarget(id);
      });
      li.append(option);
      return li;
    }),
  );
}

function openTargets() {
  $('targets').hidden = false;
  $('target-button').setAttribute('aria-expanded', 'true');
  $('targets').querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
}

function closeTargets() {
  $('targets').hidden = true;
  $('target-button').setAttribute('aria-expanded', 'false');
}

$('target-button').addEventListener('click', () => ($('targets').hidden ? openTargets() : closeTargets()));
document.addEventListener('click', (event) => {
  if (!(event.target as Element).closest('.picker')) closeTargets();
});
$('targets').addEventListener('keydown', (event) => {
  const options = [...$('targets').querySelectorAll<HTMLButtonElement>('.picker__option')];
  const index = options.indexOf(document.activeElement as HTMLButtonElement);
  if (event.key === 'Escape') {
    closeTargets();
    $('target-button').focus();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    options[(index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length]?.focus();
  }
});

function setTarget(id: string) {
  state.target = id;
  if (id !== 'equipe') state.selectedId = id;
  renderTeam();
  renderDesk();
  renderCommand();
  renderLog();
  commandField.focus();
}

function renderProject() {
  const path = state.project;
  $('project-name').textContent = path ? (path.split(/[\\/]/).filter(Boolean).pop() ?? path) : 'Nenhum projeto aberto';
  $('project-path').textContent = path || 'Os agentes só conversam até você escolher uma pasta.';
  $('project-change').textContent = path ? 'Trocar' : 'Escolher';
  $('project-edit').hidden = true;
  $('project-view').hidden = false;
}

function renderCommand() {
  const coordinator = state.agents.find((a) => a.roleKey === 'coordenador');
  const workers = state.agents.filter((a) => a.roleKey && WORKER_ROLES.includes(a.roleKey)).map((a) => a.name);
  const plan = state.plan;
  const running = plan?.status === 'planning' || plan?.status === 'running';
  renderTargets();

  const agent = state.target === 'equipe' ? undefined : agentById(state.target);
  const busy = agent ? BUSY.includes(agent.status) : running;
  if (agent) {
    $('command-hint').textContent = state.project ? `Só ${agent.name} recebe.` : 'Sem projeto aberto: só conversa, não mexe em arquivos.';
    commandField.placeholder = state.project ? `O que ${agent.name} deve fazer?` : `Mensagem para ${agent.name}`;
  } else {
    $('command-hint').textContent = coordinator
      ? `${coordinator.name} divide o trabalho com ${workers.join(', ') || 'a equipe'}.`
      : 'Escolha um coordenador em Ajustes.';
    commandField.placeholder = 'O que a equipe deve fazer?';
  }
  // Like a chat app: while something runs, the send button turns into a stop button.
  $('send-command').hidden = busy;
  $<HTMLButtonElement>('send-command').disabled = !agent && !coordinator;
  $('stop-plan').hidden = !busy;
  updateIdeas();

  const box = $('plan');
  box.hidden = !plan;
  if (!plan) return;
  const finished = plan.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  $('plan-count').textContent = plan.steps.length ? `${finished} de ${plan.steps.length} passos` : '';
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

/** With one agent picked in "Para", the conversation shows only that agent. */
function logVisible(entry: LogEntry) {
  return state.target === 'equipe' || entry.agentId === state.target;
}

/** What the user last typed to each agent, so the agent's own copy of the task is not shown twice. */
const lastAsked = new Map<string, string>();

function logItem(entry: LogEntry): HTMLElement | undefined {
  const agent = agentById(entry.agentId);
  if (entry.kind === 'user') {
    lastAsked.set(entry.agentId, entry.text.trim());
    const li = el('li', 'msg msg--user');
    li.append(el('p', 'msg__meta', entry.agentId === 'equipe' ? 'Você para a equipe' : `Você para ${agentName(entry.agentId)}`));
    li.append(el('div', 'msg__bubble', entry.text));
    return li;
  }
  if (entry.kind === 'task' && lastAsked.get(entry.agentId) === entry.text.trim()) return undefined;
  if (entry.kind === 'text') {
    const li = el('li', 'msg msg--agent');
    const head = el('p', 'msg__who');
    if (agent) head.append(portrait(agent));
    const name = el('span', undefined, agentName(entry.agentId));
    name.style.color = agent?.color ?? '';
    head.append(name);
    li.append(head, el('div', 'msg__text', entry.text));
    return li;
  }
  // Tool calls, hand-offs and results: one quiet line each.
  const li = el('li', 'event');
  li.dataset.kind = entry.kind;
  const who = el('span', 'event__who', agentName(entry.agentId));
  who.style.color = agent?.color ?? '';
  if (entry.kind === 'task') {
    const box = el('details');
    const summary = el('summary');
    summary.append(who, el('span', 'event__text', `recebeu: ${entry.text.split('\n')[0]}`));
    box.append(summary, el('p', 'event__full', entry.text));
    li.append(box);
  } else {
    li.append(who, el('span', 'event__text', entry.text));
  }
  return li;
}

function renderLog() {
  lastAsked.clear();
  const items = state.log.filter(logVisible).flatMap((entry) => logItem(entry) ?? []);
  $('chat-empty').hidden = items.length > 0;
  $('log').replaceChildren(...items);
  scrollChat(true);
}

function appendLog(entry: LogEntry) {
  if (!logVisible(entry)) return;
  const item = logItem(entry);
  if (!item) return;
  const chat = $('log').parentElement!;
  const atBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
  $('chat-empty').hidden = true;
  $('log').append(item);
  scrollChat(atBottom || entry.kind === 'user');
}

function scrollChat(force: boolean) {
  const chat = $('log').parentElement!;
  if (force) chat.scrollTop = chat.scrollHeight;
}

let toastTimer: number | undefined;
function toast(text: string) {
  const box = $('toast');
  box.textContent = text;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (box.hidden = true), 5000);
}

/* ---------- Tool windows: Ambiente, Skills and Ajustes ---------- */

// They open without blocking the page, so the toolbar button that opened one also closes it.
const PANELS: Record<string, string> = { ambiente: 'open-ambiente', skills: 'open-skills', settings: 'open-settings' };

function panelOpen(id: string) {
  return $<HTMLDialogElement>(id).open;
}

/** Closes a window without saving; Ajustes only saves through its own button. */
function closePanel(id: string) {
  $<HTMLDialogElement>(id).close('cancel');
}

function showPanel(id: string) {
  for (const other of Object.keys(PANELS)) if (other !== id && panelOpen(other)) closePanel(other);
  $<HTMLDialogElement>(id).show();
  $(PANELS[id]).setAttribute('aria-pressed', 'true');
}

for (const [id, button] of Object.entries(PANELS)) {
  $(id).addEventListener('close', () => $(button).setAttribute('aria-pressed', 'false'));
}
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const open = Object.keys(PANELS).find(panelOpen);
  if (open) {
    closePanel(open);
    $(PANELS[open]).focus();
  }
});

/* ---------- Settings: accounts, who sits at each desk, roles, models and desk order ---------- */

/** The office's own agents (Antigravity IDE conversations are only watched). */
function teamAgents() {
  return state.agents.filter((a) => a.controllable && a.roleKey);
}

/** Set once the first snapshot arrived, so an empty office opens Ajustes only once per page. */
let askedForTeam = false;

type DraftEntry = { id: string; kind: AgentKind; role: RoleKey; nickname: string; model: string; agent?: AgentView };
let draft: DraftEntry[] = [];
let nextDraftId = 1;

const KINDS: AgentKind[] = ['claude', 'codex', 'antigravity', 'opencode'];
const DRAFT_COLORS = ['#e3a04f', '#4fb3a5', '#d9705a', '#5fbf8f', '#6f8cf0', '#c98bd9'];

/** A paid account counts only once this machine has its login; free ones always do. */
function hasAccount(kind: AgentKind) {
  return FREE_ACCOUNTS.includes(kind) || state.accounts?.[kind].signedIn === true;
}

function engineOption(kind: AgentKind) {
  const free = FREE_ACCOUNTS.includes(kind);
  const status = state.accounts?.[kind];
  const label = { claude: 'Claude', codex: 'Codex (ChatGPT)', antigravity: 'Gemini', opencode: 'OpenCode' }[kind];
  if (free) return `${label} · ${translate('grátis')}${status && !status.installed ? ` · ${translate('falta instalar')}` : ''}`;
  return hasAccount(kind) ? label : `${label} · ${translate('sem login')}`;
}

function newEntry(kind: AgentKind, role: RoleKey): DraftEntry {
  return { id: `novo-${nextDraftId++}`, kind, role, nickname: '', model: '' };
}

/**
 * A full team from the accounts this machine has: the paid ones take planning, building and
 * review, and every desk they can't cover gets a free AI, alternating the two free ones so a
 * limit on one doesn't stop them all.
 */
function suggestedTeam(): DraftEntry[] {
  const free: AgentKind[] = ['opencode', 'antigravity'];
  let turn = 0;
  const pick = (...prefer: AgentKind[]) => prefer.find(hasAccount) ?? free[turn++ % free.length];
  return [
    newEntry(pick('claude', 'codex'), 'coordenador'),
    newEntry(pick('codex', 'claude'), 'designer'),
    newEntry(pick('claude', 'codex'), 'executor'),
    newEntry(pick('codex'), 'executor'),
    newEntry(pick(), 'tester'),
    newEntry(pick('claude', 'codex'), 'revisor'),
  ];
}

/** What the desk will look like, for the portrait and names before it is saved. */
function previewAgent(entry: DraftEntry, index: number): AgentView {
  const base = entry.agent ?? {
    id: entry.id,
    name: '',
    defaultName: '',
    role: '',
    color: DRAFT_COLORS[index % DRAFT_COLORS.length],
    status: 'idle' as const,
    activity: '',
    controllable: true,
    usage: { tasks: 0, inputTokens: 0, outputTokens: 0 },
  };
  const engine = { claude: 'Claude', codex: 'Codex', antigravity: 'Gemini', opencode: 'OpenCode' }[entry.kind];
  const same = draft.slice(0, index).filter((d) => d.kind === entry.kind).length;
  const name = same ? `${engine} ${same + 1}` : engine;
  return { ...base, kind: entry.kind, defaultName: name, name: entry.nickname.trim() || name };
}

function openSettings() {
  draft = teamAgents().map((agent) => ({
    id: agent.id,
    kind: agent.kind,
    role: agent.roleKey!,
    nickname: agent.name === agent.defaultName ? '' : agent.name,
    model: agent.model ?? '',
    agent,
  }));
  $<HTMLInputElement>('auto-switch').checked = state.autoSwitch;
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="idioma"]')) radio.checked = radio.value === getLang();
  send({ type: 'check-accounts' }); // a login done in the terminal shows up without restarting
  renderAccounts();
  renderSettings();
  showPanel('settings');
}

function renderAccounts() {
  const accounts = state.accounts;
  $('settings-accounts').replaceChildren(
    ...KINDS.map((kind) => {
      const li = el('li', 'account');
      const info = el('span', 'account__info');
      const status = accounts?.[kind];
      const free = FREE_ACCOUNTS.includes(kind);
      const [tone, text] = !status
        ? ['', '…']
        : !status.installed
          ? ['off', 'Falta instalar']
          : free
            ? ['on', 'Grátis']
            : status.signedIn
              ? ['on', 'Logado neste computador']
              : ['off', 'Sem login'];
      const badge = el('span', 'account__status', text);
      badge.dataset.state = tone;
      info.append(el('strong', undefined, ACCOUNT_NAMES[kind]), badge);
      const button = el('button', 'ghost small', !status?.installed ? 'Instalar' : status.signedIn === false ? 'Entrar' : free ? 'Configurar' : 'Entrar de novo');
      button.type = 'button';
      button.disabled = !status;
      button.addEventListener('click', () => {
        if (!status) return;
        $<HTMLDialogElement>('settings').close('cancel');
        shell.run(status.login);
        toast(status.hint);
      });
      li.append(info, button);
      return li;
    }),
  );
}

function draftProblem() {
  if (!draft.length) return null; // an empty office is allowed; it just can't take commands
  if (draft.filter((d) => d.role === 'coordenador').length !== 1) return 'Escolha exatamente um supervisor.';
  if (!draft.some((d) => d.role === 'executor')) return 'Escolha pelo menos um fullstack.';
  return null;
}

function renderSettings() {
  $('settings-team').replaceChildren(
    ...draft.map((entry, index) => {
      const agent = previewAgent(entry, index);
      const li = el('li', 'member');
      const frame = el('span', 'card__portrait');
      frame.style.setProperty('--agent', agent.color);
      frame.append(portrait(agent));

      const info = el('span', 'member__info');
      // Typing a nickname only updates the draft; re-rendering here would steal the focus.
      const nickname = el('input', 'member__nickname');
      nickname.value = entry.nickname;
      nickname.placeholder = agent.defaultName;
      nickname.maxLength = 24;
      nickname.setAttribute('aria-label', `Apelido de ${agent.defaultName}`);
      nickname.addEventListener('input', () => (entry.nickname = nickname.value));
      info.append(nickname, el('span', 'card__role', translate(ENGINE_NAMES[entry.kind])));
      if (!hasAccount(entry.kind)) {
        info.append(el('span', 'member__warn', 'Este computador não tem login nessa conta. Entre em Contas, acima.'));
      }
      if (entry.kind === 'codex' && EDITING_ROLES.includes(entry.role)) {
        info.append(el('span', 'member__warn', 'Como executor, o Codex edita arquivos sem post-it de permissão.'));
      }
      if (entry.kind === 'antigravity') {
        info.append(
          el('span', 'member__warn', 'O Gemini edita arquivos do projeto sem post-it; comandos de terminal ficam bloqueados.'),
        );
      }
      if (entry.kind === 'opencode') {
        info.append(el('span', 'member__warn', 'O OpenCode edita arquivos sem post-it; o que ele pedir permissão para fazer é recusado.'));
      }

      const engine = el('select');
      engine.setAttribute('aria-label', `IA de ${agent.name}`);
      for (const kind of KINDS) {
        const option = el('option', undefined, engineOption(kind));
        option.value = kind;
        option.selected = kind === entry.kind;
        engine.append(option);
      }
      engine.addEventListener('change', () => {
        entry.kind = engine.value as AgentKind;
        entry.model = ''; // a model belongs to the AI it was picked for
        renderSettings();
      });

      const select = el('select');
      select.setAttribute('aria-label', `Papel de ${agent.name}`);
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
      model.setAttribute('aria-label', `Modelo de ${agent.defaultName}`);
      const options = state.models[entry.kind] ?? [];
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
      choices.append(engine, select, model);

      const move = (delta: number) => {
        const target = index + delta;
        [draft[index], draft[target]] = [draft[target], draft[index]];
        renderSettings();
      };
      const up = el('button', 'ghost small', '↑');
      up.type = 'button';
      up.disabled = index === 0;
      up.setAttribute('aria-label', `Subir ${agent.name}`);
      up.addEventListener('click', () => move(-1));
      const down = el('button', 'ghost small', '↓');
      down.type = 'button';
      down.disabled = index === draft.length - 1;
      down.setAttribute('aria-label', `Descer ${agent.name}`);
      down.addEventListener('click', () => move(1));
      const remove = el('button', 'ghost small', '×');
      remove.type = 'button';
      remove.title = 'Esvaziar a mesa';
      remove.setAttribute('aria-label', `Tirar ${agent.name} da equipe`);
      remove.addEventListener('click', () => {
        draft.splice(index, 1);
        renderSettings();
      });
      const order = el('span', 'member__order');
      order.append(up, down, remove);

      li.append(frame, info, choices, order);
      return li;
    }),
  );
  if (!draft.length) {
    const empty = el('li', 'settings__empty', 'Nenhuma mesa ocupada. Adicione um agente ou monte a equipe com as suas contas.');
    $('settings-team').append(empty);
  }
  const full = draft.length >= DESK_COUNT;
  $<HTMLButtonElement>('team-add').disabled = full;
  $('team-add').textContent = translate(full ? 'Todas as mesas ocupadas' : 'Adicionar agente');

  const problem = draftProblem();
  const warning = $('settings-warning');
  warning.hidden = !problem;
  warning.textContent = problem ?? '';
  $('settings-form').querySelector<HTMLButtonElement>('button[value="save"]')!.disabled = !!problem;
}

$('team-add').addEventListener('click', () => {
  if (draft.length >= DESK_COUNT) return;
  // The first desk plans; the next ones build. Paid accounts first, then the free AI.
  const kind = (['claude', 'codex'] as AgentKind[]).find(hasAccount) ?? 'opencode';
  draft.push(newEntry(kind, draft.some((d) => d.role === 'coordenador') ? 'executor' : 'coordenador'));
  renderSettings();
});

$('team-suggest').addEventListener('click', () => {
  draft = suggestedTeam();
  renderSettings();
});

$('open-settings').addEventListener('click', () => (panelOpen('settings') ? closePanel('settings') : openSettings()));
$('settings').addEventListener('close', () => {
  const dialog = $<HTMLDialogElement>('settings');
  if (dialog.returnValue === 'save' && !draftProblem()) {
    send({
      type: 'team',
      team: draft.map((d) => ({ id: d.id, kind: d.kind, role: d.role, nickname: d.nickname, model: d.model })),
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
  if (panelOpen('ambiente')) return closePanel('ambiente');
  fillAmbienteForm(scene.theme);
  showPanel('ambiente');
});

scene.theme = loadTheme();
applyView(readStored(VIEW_KEY));

/* ---------- Skills: see what is installed and import new ones ---------- */

const SKILL_OWNERS: Record<Account, string> = { claude: 'Claude', codex: 'Codex', antigravity: 'Gemini', opencode: 'OpenCode' };
const SKILL_LIMIT_BYTES = 10 * 1024 * 1024;
let pendingSkill: SkillFile[] | null = null;

/** One list for the whole office: each skill once, with a note when some agents still miss it. */
function renderSkills(skills: SkillCatalog) {
  const accounts = Object.keys(SKILL_OWNERS) as Account[];
  const byName = new Map<string, { description: string; has: Set<Account> }>();
  for (const account of accounts) {
    for (const skill of skills[account]) {
      const entry = byName.get(skill.name) ?? { description: skill.description, has: new Set<Account>() };
      entry.has.add(account);
      byName.set(skill.name, entry);
    }
  }
  const names = [...byName.keys()].sort((a, b) => a.localeCompare(b));
  const missing = names.filter((name) => byName.get(name)!.has.size < accounts.length).length;

  $('skills-count').textContent = names.length
    ? `${names.length} ${names.length === 1 ? 'skill' : 'skills'}, para todos os agentes`
    : 'Nenhuma skill ainda. Importe a primeira abaixo.';
  $('skills-missing').hidden = !missing;
  $('skills-missing-text').textContent = `${missing} ${missing === 1 ? 'skill está' : 'skills estão'} só com parte dos agentes.`;

  $('skills-installed').replaceChildren(
    ...names.map((name) => {
      const { description, has } = byName.get(name)!;
      const li = el('li', 'skill');
      li.append(el('strong', 'skill__name', name), el('span', 'skill__desc', description));
      const lacking = accounts.filter((a) => !has.has(a));
      if (lacking.length) li.append(el('span', 'skill__lacking', `falta em ${lacking.map((a) => SKILL_OWNERS[a]).join(', ')}`));
      li.title = description;
      return li;
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
  if (panelOpen('skills')) return closePanel('skills');
  send({ type: 'list-skills' });
  showPanel('skills');
});
$('skills-share').addEventListener('click', () => send({ type: 'share-skills' }));
$('skill-folder').addEventListener('change', (e) => void pickSkill(e.target as HTMLInputElement, true));
$('skill-file').addEventListener('change', (e) => void pickSkill(e.target as HTMLInputElement, false));
$('skill-import').addEventListener('click', () => {
  if (!pendingSkill) return;
  send({ type: 'import-skill', files: pendingSkill });
  $<HTMLButtonElement>('skill-import').disabled = true;
});

/* ---------- Actions ---------- */

function select(id: string) {
  const agent = agentById(id);
  // A desk click picks who the message box talks to; watched-only desks just show their details.
  if (agent?.controllable) return setTarget(id);
  state.selectedId = id;
  renderTeam();
  renderDesk();
}

$('scene').addEventListener('click', (event) => {
  const rect = (event.target as HTMLElement).getBoundingClientRect();
  const id = scene.hit(event.clientX - rect.left, event.clientY - rect.top);
  if (id) {
    select(id);
  }
});

// The message box reads like a chat: Enter sends, Shift + Enter starts a new line.
commandField.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $<HTMLFormElement>('command-form').requestSubmit();
  }
});
function growCommand() {
  commandField.style.height = 'auto';
  commandField.style.height = `${Math.min(commandField.scrollHeight + 2, 220)}px`;
  updateIdeas();
}
commandField.addEventListener('input', growCommand);

/** Ready-made commands, shown with the empty conversation while the box is empty. */
function updateIdeas() {
  $('command-ideas').hidden = commandField.value.trim() !== '';
}
for (const idea of document.querySelectorAll<HTMLButtonElement>('.idea')) {
  idea.addEventListener('click', () => {
    commandField.value = idea.textContent ?? '';
    growCommand();
    commandField.focus();
  });
}

// The team drawer on the left opens and closes from its tab; the choice is remembered.
const DRAWER_KEY = 'virtualof.equipe-aberta';
function setDrawer(open: boolean) {
  $('drawer').classList.toggle('is-closed', !open);
  $('drawer-tab').setAttribute('aria-expanded', String(open));
  try {
    localStorage.setItem(DRAWER_KEY, open ? '1' : '0');
  } catch {
    // Storage can be off in private windows; the drawer just opens next time.
  }
}
try {
  if (localStorage.getItem(DRAWER_KEY) === '0') setDrawer(false);
} catch {
  // Same as above.
}
$('drawer-tab').addEventListener('click', () => setDrawer($('drawer').classList.contains('is-closed')));

$('project-change').addEventListener('click', () => {
  $('project-view').hidden = true;
  $('project-edit').hidden = false;
  $<HTMLInputElement>('project').focus();
});

$('command-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const prompt = commandField.value;
  if (!prompt.trim()) return;
  if (state.target === 'equipe') send({ type: 'command', prompt });
  else send({ type: 'task', agentId: state.target, prompt });
  commandField.value = '';
  growCommand();
});

$('stop-plan').addEventListener('click', () => {
  if (state.target === 'equipe') send({ type: 'stop-plan' });
  else send({ type: 'stop', agentId: state.target });
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
$('shell-kill').addEventListener('click', () => shell.kill());
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
