# VirtualOF

Um escritório virtual em pixel art para os seus agentes de IA. Você passa tarefas, aprova o que eles querem rodar e acompanha o trabalho, tudo numa página no navegador.

![O escritório à noite, com os agentes nas mesas](docs/screenshot.png)

[Read in English](README.md)

## O que ele faz

- **Uma equipe montada com as suas contas.** O escritório começa vazio. Em **Ajustes**, a parte **Contas** mostra quais contas estão logadas neste computador, com um botão para entrar (ou instalar) em cada uma pelo PowerShell embutido. Depois você ocupa até seis mesas: **Adicionar agente** coloca um por vez, e **Montar com minhas contas** monta a equipe inteira (supervisor, UI/UX designer, dois fullstack, tester e revisor), usando Claude e ChatGPT onde você tem login e IA grátis no resto. Em cada mesa você escolhe a IA (Claude, Codex, Gemini ou OpenCode), a função, o apelido e o modelo, e muda a ordem ou esvazia a mesa.
- **Uma conversa, como em qualquer app de IA.** O painel da direita é um chat: suas mensagens, as respostas e o que os agentes estão fazendo sobem, e a caixa de mensagem fica embaixo. **Enter** manda, **Shift + Enter** pula linha. Enquanto algo roda, o botão de enviar vira um botão de parar.
- **Fale com a equipe ou com um agente.** Em **Para**, escolha **Equipe** para um comando geral, ou um agente da lista. Clicar numa mesa também escolhe aquele agente, e a conversa passa a mostrar só ele.
- **Um comando geral, a equipe inteira.** O supervisor monta os passos na melhor ordem, o escritório passa cada passo para o agente certo, e depois de cada passo o supervisor pode refazer o resto do plano (por exemplo, para corrigir o que o revisor apontou). O plano fica acima da caixa de mensagem, como uma lista ao vivo.
- **A equipe à vista.** Uma aba à esquerda (abre e fecha pela lingueta) mostra cada agente com a função, o que está fazendo e uma barra de **estresse**: o quanto a conta dele está perto do limite. Embaixo, o **Consumo** mostra tarefas, quanto do limite foi usado e quanto falta.
- **Troca automática no limite, com passagem de bastão.** Se uma conta bater o limite no meio de uma tarefa, um agente de outra conta assume, primeiro as gratuitas (Gemini e OpenCode). Quem assume recebe a tarefa original, o que o anterior já fez e onde parou, e continua dali em vez de começar de novo. Vale para o comando geral e para a conversa direta.
- **Skills para todos.** A janela **Skills** mostra uma lista só, para a equipe inteira. Importar uma skill instala para o Claude, o Codex e o Gemini, então todo agente, inclusive quem entrar depois, recebe. **Passar para todos** copia as skills que só alguns agentes têm. Importe só skills de quem você confia: elas podem trazer scripts que os agentes executam.
- **Sua configuração vai junto.** Os agentes Claude carregam as mesmas skills, plugins, servidores MCP e CLAUDE.md do seu Claude Code; o Codex usa a configuração dele em `~/.codex`. Os detalhes de cada agente mostram o que ele carregou.
- **PowerShell embutido.** Um terminal de verdade na parte de baixo da janela (botão **Terminal** ou Ctrl + '), aberto na pasta do projeto.
- **Cartão "Precisa do terminal".** Se um agente precisar de algo que só você pode fazer (login, instalação, comando interativo), ele para e o escritório mostra o comando exato. Clique em **Rodar no PowerShell** para rodar no terminal embutido, depois em **Já rodei**, e ele continua.
- **Aprovação manual ou automática.** No modo **Manual** (padrão), os pedidos de ferramentas do Claude que exigem aprovação aparecem como post-its com **Aprovar** e **Negar**; com vários pedidos, **Aprovar todas** e **Negar todas** respondem a todos os post-its pendentes naquele momento. O modo **Automática** aprova esses pedidos sem perguntar e também libera os que já estavam esperando. O modo fica salvo para a próxima abertura. Os cartões de terminal continuam dependendo do usuário nos dois modos. Essa opção não muda as permissões do Codex, Gemini ou OpenCode.
- **Deixe a sala do seu jeito.** A janela **Ambiente** escolhe o período do dia (noite, entardecer, dia), a cor da parede e o piso, mostra ou esconde o gato, o tapete, as plantas e a cafeteira, e coloca uma imagem sua na janela, desenhada em pixel art.
- **Português ou inglês.** Escolha o idioma em **Ajustes**; os agentes também passam a responder nele.
- **Acompanha o Antigravity.** As conversas do IDE Antigravity aparecem como personagens que se acendem quando estão trabalhando (só acompanhamento), quando há mesa livre.
- **Status ao vivo em cada mesa.** A tela, o balão e a luminária mostram se o agente está pensando, lendo, escrevendo, rodando comando, esperando você, terminou ou deu erro. Com a janela em segundo plano, chegam notificações do sistema.

O Claude roda pelo [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk), o Codex pelo [Codex SDK](https://github.com/openai/codex/tree/main/sdk/typescript) o Gemini pelo [Antigravity CLI](https://antigravity.google/docs/cli/headless/) (`agy`) e os modelos grátis pelo [OpenCode](https://opencode.ai/docs/cli/) (`opencode run`), os dois em modo headless.

## Primeiros passos

O VirtualOF **não é um site**: ele roda no seu computador, porque é daí que os agentes leem e mudam os seus arquivos e usam as suas contas. A janela (ou o navegador) é só a tela dele.

### Jeito 1: instalar o app (Windows)

1. Baixe o `VirtualOF-Setup.exe` em [Releases](https://github.com/YamoToComBronquite/VirtualOF/releases) e instale.
2. Abra o **VirtualOF** pelo menu Iniciar. Fechar a janela desliga o escritório e os agentes.
3. Clique em **Escolher…**, selecione a pasta do projeto e mande uma tarefa.

O instalador já traz tudo o que precisa (inclusive os motores do Claude Code e do Codex), por isso é grande.

O app se atualiza sozinho: ao abrir (e a cada 4 horas) ele confere se há versão nova em Releases, baixa em segundo plano e pergunta se pode reiniciar. Suas configurações continuam.

O app não tem certificado de assinatura, então na primeira instalação o Windows mostra "O Windows protegeu o seu computador". Clique em **Mais informações → Executar assim mesmo**.

### Jeito 2: rodar pelo código

1. Instale o [Node.js](https://nodejs.org) 22 ou mais novo.
2. Baixe o projeto: botão **Code → Download ZIP** no GitHub, ou `git clone https://github.com/YamoToComBronquite/VirtualOF.git`.
3. No Windows, dê dois cliques em `Abrir escritorio.cmd`. Em outros sistemas, rode `npm install` e depois `npm start -- --abrir` dentro da pasta.
4. O navegador abre em http://localhost:4321. Deixe a janela preta aberta: fechar ela desliga o escritório.

Para gerar o instalador você mesmo, rode `npm run dist` (ele sai em `release/`).

Para lançar uma versão nova: aumente a `version` no `package.json` e rode `npm run release` com um token do GitHub em `GH_TOKEN`. Ele publica `VirtualOF-Setup.exe`, `VirtualOF-Setup.exe.blockmap` e `latest.yml` numa Release, e os apps instalados pegam a atualização.

### Contas

Cada pessoa usa as próprias assinaturas, e os agentes gastam os limites de sempre. Ninguém precisa ter todas: a parte **Contas** em Ajustes mostra o que este computador tem, e as mesas sem conta podem ficar com IA grátis.

- **Claude:** uma conta logada no Claude Code neste computador (CLI ou extensão da IDE), ou uma `ANTHROPIC_API_KEY`.
- **Codex:** uma conta do ChatGPT. Se faltar o login, o escritório mostra o comando no cartão **Precisa do terminal**, pronto para rodar no PowerShell embutido.
- **Gemini:** o [Antigravity CLI](https://antigravity.google/docs/getting-started) (`agy`), logado com sua conta do Google (rode `agy` uma vez no PowerShell embutido; o login é separado do IDE). Se faltar, o escritório mostra o comando de instalação.
- **OpenCode (grátis):** o [OpenCode](https://opencode.ai) (`npm install -g opencode-ai`, precisa do Node.js) com os modelos grátis dele, como Big Pickle, DeepSeek Flash e GLM Flash, sem login. A lista de modelos grátis muda de tempos em tempos; o escritório pega a atual com `opencode models opencode`. Rodando sem tela, o OpenCode recusa tudo o que pediria permissão para fazer.
- **Opcional:** o [Antigravity](https://antigravity.google), para ver as conversas do IDE no escritório.

Vários agentes trabalhando ao mesmo tempo gastam esses limites mais rápido.

## Configuração

Tudo fica em `escritorio.config.json`:

| Chave | O que define |
| --- | --- |
| `porta` | Porta do servidor local (padrão `4321`) |
| `papeis` | Instruções de cada função: `coordenador` (supervisor), `designer` (UI/UX), `executor` (fullstack), `tester`, `revisor` |
| `agentes` | A equipe: `id`, `nome`, `tipo` (`claude`, `codex` ou `antigravity`), `papel` (função inicial) e `cor` (cor da camisa) |
| `antigravity.pasta` | Onde o Antigravity guarda as conversas (`~/.gemini/antigravity-ide/conversations`) |
| `antigravity.ativoSegundos` | Há quantos segundos a conversa precisa ter mudado para contar como "trabalhando" |
| `antigravity.maximo` | Quantas conversas do Antigravity mostrar |

O que você muda na página (pasta do projeto, funções, apelidos, modelos, ordem das mesas, troca automática, idioma) fica salvo em `.escritorio.local.json` (no app de desktop, na pasta de dados dele), que não vai para o git.

## Segurança

Os agentes podem ler e alterar arquivos e rodar comandos no seu computador. Por isso:

- O servidor só escuta em `127.0.0.1`, e o WebSocket só aceita conexões da própria página do escritório.
- No modo manual, os pedidos de ferramentas do Claude que chegam ao controle de aprovação do escritório aguardam sua resposta. O modo automático os aprova, inclusive os pendentes; ativá-lo pede confirmação. Pedidos cancelados são negados nos dois modos. Cartões de terminal nunca são aprovados pela troca de modo ou pelos botões de responder a todos.
- O Codex não tem aprovação por ação nesse modo, então roda em sandbox `read-only`, a não ser quando a função dele altera arquivos (designer, fullstack ou tester, ou cobrindo um deles). Aí ele pode editar arquivos do projeto sem post-it; a tela de Ajustes avisa isso.
- O PowerShell embutido tem o mesmo acesso que você. Só a página do escritório consegue usá-lo.
- O Antigravity é só observado: o escritório vê quando os arquivos de conversa mudam e nunca abre nem altera esses arquivos.

## Próximos passos

- Fluxo de projeto novo com seletor de pasta e `git init`
- Um checkpoint no git antes de cada tarefa, com botão **Desfazer tarefa**, e o Codex revisando exatamente esse diff

## Aviso

O VirtualOF é um projeto independente, sem vínculo com Anthropic, OpenAI ou Google. Claude, Codex e Antigravity são marcas dos seus respectivos donos.

## Licença

[MIT](LICENSE)
