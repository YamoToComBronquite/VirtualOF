/**
 * English for the office. The page is written in Portuguese; with English chosen, every text
 * the page shows (its own and the notices the server sends) is looked up here as it appears.
 * Exact texts go in EXACT; texts with names or numbers in them go in PATTERNS.
 * Anything not listed (like what the agents write) is shown as it is.
 */
import type { Lang } from '../shared/types.ts';

const EXACT: Record<string, string> = {
  // Header, tools and project
  'conectando…': 'connecting…',
  conectado: 'connected',
  desconectado: 'disconnected',
  'Conexão com o escritório': 'Connection to the office',
  Ferramentas: 'Tools',
  'Terminal (Ctrl + \')': "Terminal (Ctrl + ')",
  Ambiente: 'Scene',
  'Mudar o visual do escritório': 'Change how the office looks',
  'Ver e importar skills': 'See and import skills',
  Ajustes: 'Settings',
  'Papéis, apelidos e modelos da equipe': 'Team roles, nicknames and models',
  Trocar: 'Change',
  Escolher: 'Choose',
  'Escolher…': 'Choose…',
  Usar: 'Use',
  'Pasta do projeto': 'Project folder',
  'C:\\Users\\…\\meu-projeto': 'C:\\Users\\…\\my-project',
  'Nenhum projeto aberto': 'No project open',
  'Os agentes só conversam até você escolher uma pasta.': 'Agents only chat until you pick a folder.',

  // Conversation and message box
  Conversa: 'Conversation',
  'Comece por aqui': 'Start here',
  'Mande um comando para a equipe inteira ou escolha alguém em': 'Send a command to the whole team, or pick someone under',
  'para falar só com essa pessoa.': 'to talk to just them.',
  Para: 'To',
  'Ideias de comando': 'Command ideas',
  'Revise o projeto e aponte os bugs': 'Review the project and point out bugs',
  'Escreva testes para o que já existe': 'Write tests for what already exists',
  'Explique como o projeto está organizado': 'Explain how the project is organized',
  Mensagem: 'Message',
  'O que a equipe deve fazer?': 'What should the team do?',
  Mandar: 'Send',
  'Mandar (Enter)': 'Send (Enter)',
  Parar: 'Stop',
  Equipe: 'Team',
  'Comando geral: o coordenador divide o trabalho': 'General command: the coordinator splits the work',
  'Sem projeto aberto: só conversa, não mexe em arquivos.': 'No project open: chat only, no file changes.',
  'Escolha um coordenador em Ajustes.': 'Pick a coordinator in Settings.',
  'Você para a equipe': 'You to the team',
  'Precisa do terminal': 'Needs the terminal',
  'Pedidos de permissão': 'Permission requests',
  'Rodar no PowerShell': 'Run in PowerShell',
  Copiar: 'Copy',
  Copiado: 'Copied',
  'Já rodei': 'I ran it',
  Aprovar: 'Approve',
  Negar: 'Deny',
  'Clique para ver a tarefa inteira': 'Click to see the whole task',
  'Executando o plano': 'Running the plan',
  'Plano concluído': 'Plan finished',
  'Plano parado por você': 'Plan stopped by you',
  'O plano parou com erro': 'The plan stopped with an error',
  'Comando geral concluído': 'General command finished',
  'O comando geral parou': 'The general command stopped',

  // Statuses
  livre: 'free',
  pensando: 'thinking',
  lendo: 'reading',
  escrevendo: 'writing',
  'rodando comando': 'running a command',
  'esperando você': 'waiting for you',
  terminou: 'finished',
  'deu erro': 'error',
  'na fila': 'queued',
  fazendo: 'doing',
  feito: 'done',
  falhou: 'failed',
  pulado: 'skipped',
  'sem limite': 'out of limit',
  Livre: 'Free',
  Pensando: 'Thinking',
  'Lendo a tarefa': 'Reading the task',
  'Terminou a tarefa': 'Finished the task',
  'Parado por você': 'Stopped by you',
  'Deu erro, veja o registro': 'Error, see the conversation',
  'Parou com erro': 'Stopped with an error',
  'Permissão negada': 'Permission denied',
  'Limite de uso do Claude atingido': 'Claude usage limit reached',
  'Limite de uso do ChatGPT atingido': 'ChatGPT usage limit reached',
  'Limite de uso do Google atingido': 'Google usage limit reached',
  'Falta entrar com a conta do Google': 'Google account sign-in needed',
  'Trabalhando no Antigravity': 'Working in Antigravity',
  'Parou agora há pouco': 'Stopped a moment ago',
  'Só acompanhamento': 'Watch only',
  'Começou a trabalhar': 'Started working',
  Parou: 'Stopped',
  'Pronto.': 'Done.',
  'Tarefa interrompida.': 'Task stopped.',

  // Roles
  Coordenador: 'Coordinator',
  Executor: 'Executor',
  Revisor: 'Reviewer',
  'De folga': 'Off duty',
  Supervisor: 'Supervisor',
  'UI/UX Designer': 'UI/UX Designer',
  Fullstack: 'Fullstack',
  Tester: 'Tester',

  // Team drawer, stress and usage
  'Mostrar ou esconder a equipe': 'Show or hide the team',
  Estresse: 'Stress',
  Tranquilo: 'Calm',
  Apertado: 'Tight',
  Esgotado: 'Out',
  'Sem dados': 'No data',
  'estresse: tranquilo': 'stress: calm',
  'estresse: apertado': 'stress: tight',
  'estresse: esgotado': 'stress: out',
  'estresse: sem dados': 'stress: no data',
  Consumo: 'Usage',
  Agente: 'Agent',
  Tarefas: 'Tasks',
  Limite: 'Limit',
  Falta: 'Left',
  'Quanto da conta já foi usado': 'How much of the account is used',
  'Quanto falta para bater o limite': 'How much is left before the limit',
  esgotado: 'out',
  perto: 'close',
  pouco: 'little',
  'Ainda não trabalhou nesta sessão.': "Hasn't worked this session yet.",
  'O escritório só acompanha o Antigravity. Para dar uma tarefa, abra o Antigravity.':
    'The office only watches Antigravity. To give it a task, open Antigravity.',
  'Conta do Claude': 'Claude account',
  'Conta do ChatGPT (Codex)': 'ChatGPT account (Codex)',
  'Conta do Google (Gemini)': 'Google account (Gemini)',
  'O Claude só informa a porcentagem quando o uso fica alto.': 'Claude only reports the percentage when usage gets high.',
  'O Codex só avisa quando bate o limite.': 'Codex only says so when it hits the limit.',
  'O Gemini só avisa quando bate o limite.': 'Gemini only says so when it hits the limit.',
  'Troca automática ligada: se uma conta bater o limite no meio de um comando geral, um agente de outra conta assume.':
    'Auto-switch on: if an account hits its limit mid-task, an agent from another account takes over.',
  'Troca automática desligada. Ligue em Configurações.': 'Auto-switch off. Turn it on in Settings.',
  Modelo: 'Model',
  padrão: 'default',
  'Padrão do Claude Code': 'Claude Code default',
  'Padrão do Codex': 'Codex default',
  'Padrão do Antigravity': 'Antigravity default',
  'As skills, plugins e servidores MCP aparecem aqui depois da primeira tarefa.':
    'Skills, plugins and MCP servers show up here after the first task.',
  Plugins: 'Plugins',
  'Usa a configuração do Codex (~/.codex): servidores MCP e skills de lá.': 'Uses the Codex config (~/.codex): its MCP servers and skills.',
  'Usa a configuração do Antigravity CLI (~/.gemini/antigravity-cli).': 'Uses the Antigravity CLI config (~/.gemini/antigravity-cli).',
  'Gemini pelo Antigravity CLI': 'Gemini through the Antigravity CLI',

  // Terminal panel
  'Novo PowerShell (fecha o atual)': 'New PowerShell (closes the current one)',
  'Novo PowerShell': 'New PowerShell',
  'Encerrar o PowerShell': 'End PowerShell',
  "Esconder (Ctrl + ')": "Hide (Ctrl + ')",
  'Esconder o terminal': 'Hide the terminal',
  'encerrado: digite algo para abrir de novo': 'ended: type something to open it again',
  'Escritório com os agentes nas mesas': 'Office with the agents at their desks',

  // Settings
  'Configurações da equipe': 'Team settings',
  'Escolha o papel de cada um e a ordem das mesas. Precisa de um supervisor e pelo menos um fullstack.':
    'Choose each role and the desk order. You need one supervisor and at least one fullstack.',
  'Quando uma conta bater o limite de uso, passar a tarefa para um agente de outra conta':
    'When an account hits its usage limit, hand the task to an agent on another account',
  'Agentes da mesma conta batem o limite juntos, então quem cobre é sempre de outra conta: Claude, ChatGPT ou Google.':
    'Agents on the same account hit the limit together, so the cover is always on another account: Claude, ChatGPT or Google.',
  'Salvar equipe': 'Save team',
  Cancelar: 'Cancel',
  Idioma: 'Language',
  'O escritório não mandou a equipe. Feche e abra o escritório de novo.': "The office didn't send the team. Close and reopen the office.",
  'Escolha exatamente um coordenador.': 'Choose exactly one coordinator.',
  'Escolha pelo menos um executor.': 'Choose at least one executor.',
  'Escolha exatamente um supervisor.': 'Choose exactly one supervisor.',
  'Escolha pelo menos um fullstack.': 'Choose at least one fullstack.',
  'A equipe precisa de pelo menos um fullstack.': 'The team needs at least one fullstack.',
  'Comando geral': 'General command',
  'Como executor, o Codex edita arquivos sem post-it de permissão.': 'As an executor, Codex edits files without a permission note.',
  'O Gemini edita arquivos do projeto sem post-it; comandos de terminal ficam bloqueados.':
    'Gemini edits project files without a permission note; terminal commands stay blocked.',
  'Equipe atualizada.': 'Team updated.',
  'Equipe inválida.': 'Invalid team.',
  'Espere os agentes terminarem antes de mudar a equipe.': 'Wait for the agents to finish before changing the team.',
  'Pare o comando geral antes de mudar a equipe.': 'Stop the general command before changing the team.',

  // Scene dialog
  'As mudanças aparecem na hora no escritório e ficam salvas neste computador.': 'Changes show up in the office right away and are saved on this computer.',
  'Período do dia': 'Time of day',
  Noite: 'Night',
  Entardecer: 'Sunset',
  Dia: 'Day',
  Parede: 'Wall',
  Ameixa: 'Plum',
  Floresta: 'Forest',
  Terracota: 'Terracotta',
  Grafite: 'Graphite',
  Piso: 'Floor',
  Madeira: 'Wood',
  Carpete: 'Carpet',
  'Ladrilho xadrez': 'Checkered tile',
  Mostrar: 'Show',
  'Gato na janela': 'Cat at the window',
  Tapete: 'Rug',
  Plantas: 'Plants',
  'Cafeteira e rack': 'Coffee maker and rack',
  'Vista da janela': 'Window view',
  'Usar uma imagem minha': 'Use my own image',
  'Voltar para a cidade': 'Back to the city',
  'Mostrando a cidade.': 'Showing the city.',
  'Mostrando a sua imagem, em pixel art.': 'Showing your image, in pixel art.',
  'Não consegui abrir essa imagem.': "Couldn't open that image.",
  Pronto: 'Done',
  'Restaurar padrão': 'Reset to default',

  // Skills dialog
  'Uma skill ensina os agentes a fazer algo específico. É uma pasta com um arquivo SKILL.md e, às vezes, scripts.':
    'A skill teaches the agents something specific. It is a folder with a SKILL.md file and sometimes scripts.',
  'Toda skill vale para a equipe inteira, inclusive para quem entrar depois.': 'Every skill works for the whole team, including agents added later.',
  'Nenhuma skill ainda. Importe a primeira abaixo.': 'No skills yet. Import the first one below.',
  'Passar para todos': 'Share with everyone',
  'Importar skill': 'Import skill',
  'Escolher pasta da skill': 'Choose skill folder',
  'Só o SKILL.md': 'Just the SKILL.md',
  'Skills podem trazer scripts que os agentes executam no seu computador. Importe só skills de quem você confia.':
    'Skills can bring scripts that agents run on your computer. Only import skills from people you trust.',
  'Importar para todos os agentes': 'Import for all agents',
  Fechar: 'Close',
  'A skill passa de 10 MB. Tire arquivos grandes que ela não precisa.': 'The skill is over 10 MB. Remove large files it does not need.',
  'Essa pasta não tem um SKILL.md na raiz. Escolha a pasta da skill em si.': "That folder has no SKILL.md at its root. Choose the skill's own folder.",
  'Esse SKILL.md não tem "name:" no topo; o escritório vai recusar.': 'This SKILL.md has no "name:" at the top; the office will refuse it.',
  'Todos os agentes já tinham as mesmas skills.': 'All agents already had the same skills.',
  'Não achei o SKILL.md na raiz da pasta da skill.': "Couldn't find SKILL.md at the root of the skill folder.",
  'O SKILL.md precisa de um "name:" no topo, só com letras, números, - ou _.': 'SKILL.md needs a "name:" at the top, with only letters, numbers, - or _.',
  'O SKILL.md precisa de uma "description:" no topo.': 'SKILL.md needs a "description:" at the top.',

  // Server notices
  'Tem um comando geral em andamento. Pare o plano para falar direto com um agente.': 'A general command is running. Stop the plan to talk to one agent directly.',
  'Esse agente ainda está numa tarefa. Espere terminar ou clique em Parar.': 'That agent is still on a task. Wait for it to finish or click Stop.',
  'Escolha a pasta do projeto antes de mandar um comando.': 'Choose the project folder before sending a command.',
  'O coordenador não montou um plano que eu consiga seguir.': "The coordinator didn't write a plan the office can follow.",
  'Todos os passos terminaram, mas o coordenador bateu o limite antes do resumo.': 'All steps finished, but the coordinator hit its limit before the summary.',
  'Um agente bateu o limite de uso e a troca automática está desligada (Configurações).': 'An agent hit its usage limit and auto-switch is off (Settings).',
  'Todas as contas bateram o limite de uso. Veja em Consumo quando cada uma volta e mande o comando de novo.':
    'Every account hit its usage limit. Check Usage for when each comes back and send the command again.',
  'Um agente bateu o limite de uso e não havia ninguém livre de outra conta para assumir.': 'An agent hit its usage limit and nobody on another account was free to take over.',
  'O Antigravity CLI (agy) não está instalado neste computador.': 'The Antigravity CLI (agy) is not installed on this computer.',
  'O Gemini roda pelo Antigravity CLI (agy), que ainda não está instalado. É o instalador oficial do Google.':
    "Gemini runs through the Antigravity CLI (agy), which isn't installed yet. This is Google's official installer.",
  'O Antigravity CLI tem login próprio. Rode este comando num terminal novo, entre com sua conta do Google no navegador e, se aparecer um código, cole no terminal.':
    'The Antigravity CLI has its own sign-in. Run this command in a new terminal, sign in with your Google account in the browser and, if a code shows up, paste it in the terminal.',
  'O Codex ainda não está logado na sua conta do ChatGPT.': "Codex isn't signed in to your ChatGPT account yet.",
  Contas: 'Accounts',
  'As mesas usam as contas logadas neste computador. Mesa sem conta pode ficar com uma IA grátis.':
    'Desks use the accounts signed in on this computer. Desks with no account can use a free AI.',
  'Escolha a IA e o papel de cada um e a ordem das mesas. Precisa de um supervisor e pelo menos um fullstack.':
    'Pick each one’s AI and role and the desk order. You need one supervisor and at least one fullstack.',
  'OpenCode (modelos grátis)': 'OpenCode (free models)',
  'OpenCode, modelos grátis': 'OpenCode, free models',
  grátis: 'free',
  'falta instalar': 'not installed',
  'sem login': 'not signed in',
  Grátis: 'Free',
  'Falta instalar': 'Not installed',
  'Logado neste computador': 'Signed in on this computer',
  'Sem login': 'Not signed in',
  Instalar: 'Install',
  Entrar: 'Sign in',
  'Entrar de novo': 'Sign in again',
  Configurar: 'Set up',
  'Adicionar agente': 'Add agent',
  'Montar com minhas contas': 'Build from my accounts',
  'Todas as mesas ocupadas': 'Every desk is taken',
  'Esvaziar a mesa': 'Empty the desk',
  'Nenhuma mesa ocupada. Adicione um agente ou monte a equipe com as suas contas.':
    'No desk is taken yet. Add an agent or build the team from your accounts.',
  'Este computador não tem login nessa conta. Entre em Contas, acima.': "This computer isn't signed in to that account. Sign in under Accounts, above.",
  'O OpenCode edita arquivos sem post-it; o que ele pedir permissão para fazer é recusado.':
    'OpenCode edits files without sticky notes; anything it asks permission for is refused.',
  'Usa a configuração do OpenCode (~/.config/opencode).': 'Uses the OpenCode config (~/.config/opencode).',
  'O escritório está vazio. Monte a equipe em Ajustes.': 'The office is empty. Put a team together in Settings.',
  'Modelo desconhecido para um dos agentes.': 'Unknown model for one of the agents.',
  'O OpenCode não está instalado neste computador.': 'OpenCode is not installed on this computer.',
  'Os modelos grátis rodam pelo OpenCode, que ainda não está instalado. Precisa do Node.js.':
    "The free models run through OpenCode, which isn't installed yet. It needs Node.js.",
  'Este modelo pede login. Escolha o provedor OpenCode e siga o que aparecer.': 'This model needs a sign-in. Pick the OpenCode provider and follow the prompts.',
  'Limite do modelo grátis atingido': 'Free model limit reached',
  'Falta entrar no OpenCode': 'OpenCode sign-in needed',
  'Quando o Claude Code abrir, digite /login, entre com sua conta no navegador e depois digite /exit.':
    'When Claude Code opens, type /login, sign in with your account in the browser, then type /exit.',
  'Entre com sua conta do ChatGPT no navegador que abrir.': 'Sign in with your ChatGPT account in the browser that opens.',
  'Entre com sua conta do Google no navegador e, se aparecer um código, cole no terminal.':
    'Sign in with your Google account in the browser and, if a code shows up, paste it in the terminal.',
  'Instala o Antigravity CLI, o instalador oficial do Google. Depois clique em Entrar.':
    "Installs the Antigravity CLI with Google's official installer. Then click Sign in.",
  'Os modelos grátis funcionam sem login. Entre só se quiser usar outro provedor.':
    'The free models work without signing in. Sign in only to use another provider.',
  'Instala o OpenCode pelo npm (precisa do Node.js). Os modelos grátis funcionam sem login.':
    'Installs OpenCode with npm (needs Node.js). The free models work without signing in.',
};

const PATTERNS: [RegExp, string][] = [
  [/^(.+) pede permissão$/, '$1 asks for permission'],
  [/^(.+) precisa do terminal$/, '$1 needs the terminal'],
  [/^(.+) terminou$/, '$1 finished'],
  [/^Estresse de (.+): (.+)$/, "$1's stress: $2"],
  [/^limite de (.+)$/, '$1 limit'],
  [/^Divide esse limite com (.+)\.$/, 'Shares this limit with $1.'],
  [/^(.+) tokens nesta sessão(.*)$/, '$1 tokens this session$2'],
  [/^ \(≈ US\$ (.+) se fosse API\)$/, ' (≈ US$ $1 if it were the API)'],
  [/^Só (.+) recebe\.$/, 'Only $1 gets it.'],
  [/^O que (.+) deve fazer\?$/, 'What should $1 do?'],
  [/^Mensagem para (.+)$/, 'Message to $1'],
  [/^(.+) divide o trabalho com (.+)\.$/, '$1 splits the work with $2.'],
  [/^(.+) está montando o plano…$/, '$1 is writing the plan…'],
  [/^(\d+) de (\d+) passos$/, '$1 of $2 steps'],
  [/^Você para (.+)$/, 'You to $1'],
  [/^recebeu: (.*)$/s, 'received: $1'],
  [/^ quer usar (.+)$/, ' wants to use $1'],
  [/^Apelido de (.+)$/, "$1's nickname"],
  [/^Papel de (.+)$/, "$1's role"],
  [/^Modelo de (.+)$/, "$1's model"],
  [/^(\d+) skills?, para todos os agentes$/, '$1 skills, for all agents'],
  [/^(\d+) skills? (?:está|estão) só com parte dos agentes\.$/, '$1 skill(s) only some agents have.'],
  [/^falta em (.+)$/, 'missing in $1'],
  [/^Pronto em (\d+) s\.$/, 'Done in $1 s.'],
  [/^Pronto: (\d+) cópia\(s\) feitas\. Agora todos os agentes têm as mesmas skills\.$/, 'Done: $1 copies made. All agents now have the same skills.'],
  [/^Skill "(.+)" instalada para todos os agentes\. Vale a partir da próxima tarefa\.$/, 'Skill "$1" installed for all agents. It applies from the next task.'],
  [/^Todos os agentes já têm uma skill "(.+)"\. Apague ou renomeie a antiga antes de importar\.$/, 'All agents already have a skill "$1". Delete or rename the old one before importing.'],
  [/^Caminho de arquivo inválido na skill: (.+)$/, 'Invalid file path in the skill: $1'],
  [/^A skill precisa ter entre 1 e (\d+) arquivos\.$/, 'The skill needs between 1 and $1 files.'],
  [/^Esperando você aprovar: (.+)$/, 'Waiting for your approval: $1'],
  [/^Parado há (\d+) min$/, 'Idle for $1 min'],
  [/^Lendo (.+)$/, 'Reading $1'],
  [/^Procurando (.+)$/, 'Searching $1'],
  [/^Pesquisando (.+)$/, 'Searching $1'],
  [/^Abrindo (.+)$/, 'Opening $1'],
  [/^Criando (.+)$/, 'Creating $1'],
  [/^Editando (.+)$/, 'Editing $1'],
  [/^Editou (.+)$/, 'Edited $1'],
  [/^Precisa do terminal: (.+)$/s, 'Needs the terminal: $1'],
  [/^Pediu permissão: (.+)$/s, 'Asked permission: $1'],
  [/^Aprovado: (.+)$/, 'Approved: $1'],
  [/^Negado: (.+)$/, 'Denied: $1'],
  [/^Projeto: (.+)$/, 'Project: $1'],
  [/^Essa pasta não existe: (.+)$/, "That folder doesn't exist: $1"],
  [/^Modelo desconhecido para (.+)\.$/, 'Unknown model for $1.'],
  [/^Padrão \((.+)\)$/, 'Default ($1)'],
  [/^O Antigravity terminou com status (.+)\.$/, 'Antigravity finished with status $1.'],
  [/^O agy saiu com código (.+)\.$/, 'agy exited with code $1.'],
  [/^Ferramentas do Antigravity CLI: (\d+)\.$/, 'Antigravity CLI tools: $1.'],
  [/^Não achei as conversas do Antigravity em (.+)\.$/, "Couldn't find the Antigravity conversations in $1."],
  [/^(.+) bateu o limite de uso\. (.+) assumiu a tarefa e continua de onde parou\.$/, '$1 hit its usage limit. $2 took over the task and is picking up where it stopped.'],
  [/^(.+) bateu o limite de uso\. (.+) assumiu a coordenação\.$/, '$1 hit its usage limit. $2 took over coordination.'],
  [/^(.+) bateu o limite de uso\. (.+) assumiu o passo (\d+)\.$/, '$1 hit its usage limit. $2 took over step $3.'],
  [/^(.+) bateu o limite de uso e ninguém de outra conta está livre agora\. Veja em Consumo quando volta\.$/, '$1 hit its usage limit and nobody on another account is free right now. Check Usage for when it comes back.'],
  [/^(.+) bateu o limite de uso\. A troca automática está desligada \(Ajustes\)\.$/, '$1 hit its usage limit. Auto-switch is off (Settings).'],
  [/^(.+) está sem limite de uso agora \(veja em Consumo\)\.(.*)$/, '$1 is out of usage right now (see Usage).$2'],
  [/^volta (.+)$/, 'back $1'],
  [/^renova (.+)$/, 'renews $1'],
  [/^às (\d\d:\d\d)$/, 'at $1'],
  [/^(\S+) às (\d\d:\d\d)$/, '$1 at $2'],
  [/^(\d+)% usado$/, '$1% used'],
];

let current: Lang = 'pt';

export function getLang() {
  return current;
}

/** Text as it should be shown in the chosen language. */
export function translate(text: string): string {
  if (current === 'pt' || !text) return text;
  const trimmed = text.trim();
  if (!trimmed) return text;
  const exact = EXACT[trimmed];
  if (exact !== undefined) return text.replace(trimmed, exact);
  for (const [pattern, english] of PATTERNS) {
    if (pattern.test(trimmed)) return text.replace(trimmed, trimmed.replace(pattern, english));
  }
  return text;
}

const ATTRIBUTES = ['placeholder', 'title', 'aria-label'];

/** Agents' own words are shown as they wrote them. */
const KEEP = '.msg__text, .msg__bubble, .event__full, .xterm, code, pre, input, textarea';

function translateNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentElement?.closest(KEEP)) return;
    const next = translate(node.nodeValue ?? '');
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (!(node instanceof Element) || node.closest('.xterm')) return;
  for (const name of ATTRIBUTES) {
    const value = node.getAttribute(name);
    if (value) {
      const next = translate(value);
      if (next !== value) node.setAttribute(name, next);
    }
  }
  for (const child of node.childNodes) translateNode(child);
}

let observer: MutationObserver | undefined;

/** Switches the page to `lang`; in English, texts are translated now and whenever they change. */
export function applyLang(lang: Lang) {
  current = lang;
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
  observer?.disconnect();
  if (lang === 'pt') return;
  translateNode(document.body);
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') translateNode(record.target);
      else if (record.type === 'characterData') translateNode(record.target);
      else record.addedNodes.forEach(translateNode);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
}
