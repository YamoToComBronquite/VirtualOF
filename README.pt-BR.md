# VirtualOF

Um escritório virtual em pixel art para os seus agentes de IA. Você passa tarefas, aprova o que eles querem rodar e acompanha o trabalho, tudo numa página no navegador.

![O escritório à noite, com os agentes nas mesas](docs/screenshot.png)

[Read in English](README.md)

## O que ele faz

- **Um comando geral, a equipe inteira.** Você escreve o que quer uma vez. O coordenador monta os passos na melhor ordem, o escritório passa cada passo para o agente certo, e depois de cada passo o coordenador pode refazer o resto do plano (por exemplo, para corrigir o que o revisor apontou). O plano aparece como uma lista ao vivo.
- **Você escolhe quem faz o quê.** Em **Configurações**, defina o papel de cada agente (coordenador, executor, revisor ou de folga), dê um apelido, escolha o modelo (Claude: Opus, Sonnet ou Haiku; Codex: os modelos da sua configuração; Gemini: o que `agy models` lista para a sua conta do Google) e a ordem das mesas. Dá para abrir direto em http://localhost:4321/#configuracoes. Qualquer um pode coordenar, inclusive o Codex.
- **Consumo à vista.** O painel **Consumo** mostra o limite da assinatura de cada conta (o Claude informa quanto da janela de 5 horas ou semanal você usou e quando renova; o Codex avisa quando bate o limite) e o gasto de cada agente: tarefas, tokens e quanto custaria pela API.
- **Troca automática no limite.** Se uma conta bater o limite no meio de um comando geral, um agente de outra conta assume aquele passo, ou a própria coordenação, e o plano continua.
- **Suas skills e plugins vão junto.** Os agentes Claude carregam as mesmas skills, plugins, servidores MCP e CLAUDE.md do seu Claude Code; o Codex usa a configuração dele em `~/.codex`. Cada mesa mostra o que o agente carregou.
- **Ou fale direto com um agente.** Clique numa mesa, escreva a tarefa e mande. Sem terminal.
- **Claude e Codex juntos.** Dois agentes Claude rodam pelo [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk); o Codex roda pelo [Codex SDK](https://github.com/openai/codex/tree/main/sdk/typescript), só leitura a não ser que seja executor. O Gemini roda pelo [Antigravity CLI](https://antigravity.google/docs/cli/headless/) (`agy`) em modo headless e começa como reserva, pronto para cobrir quando outra conta bater o limite.
- **Permissões viram post-its.** Quando o Claude quer editar um arquivo ou rodar um comando, aparece um post-it com **Aprovar** e **Negar**.
- **Cartão "Abra o terminal".** Se um agente precisar de algo que só você pode fazer (login, instalação, comando interativo), ele para e o escritório mostra o comando exato para copiar. Clique em **Já rodei** e ele continua.
- **Acompanha o Antigravity.** As conversas do Antigravity aparecem como personagens que se acendem quando estão trabalhando. É só acompanhamento: tarefas para o Antigravity continuam pelo próprio Antigravity.
- **Status ao vivo em cada mesa.** A tela, o balão e a luminária mostram se o agente está pensando, lendo, escrevendo, rodando comando, esperando você, terminou ou deu erro. Com a aba em segundo plano, chegam notificações do sistema.

## Requisitos

- Node.js 22 ou mais novo
- Uma conta do Claude logada no Claude Code neste computador (CLI ou extensão da IDE), ou uma `ANTHROPIC_API_KEY`
- Para o revisor Codex: uma conta do ChatGPT. Faça login uma vez com `npx codex login` dentro da pasta do projeto
- Para o agente Gemini: o [Antigravity CLI](https://antigravity.google/docs/getting-started) (`agy`), logado com sua conta do Google (rode `agy` uma vez num terminal; o login é separado do IDE). Se faltar, o escritório mostra o comando de instalação
- Opcional: o [Antigravity](https://antigravity.google), para ver as conversas do IDE no escritório

Os agentes usam as suas próprias assinaturas e gastam os limites de sempre. Vários agentes trabalhando ao mesmo tempo gastam esses limites mais rápido.

## Como começar

```bash
git clone https://github.com/YamoToComBronquite/VirtualOF.git
cd VirtualOF
npm install
npm start -- --abrir
```

O `--abrir` abre o navegador em http://localhost:4321. No Windows, também dá para dar dois cliques em `Abrir escritorio.cmd`.

Depois, cole o caminho do projeto em que os agentes vão trabalhar, clique em **Usar**, escolha uma mesa e mande uma tarefa.

## Configuração

Tudo fica em `escritorio.config.json`:

| Chave | O que define |
| --- | --- |
| `porta` | Porta do servidor local (padrão `4321`) |
| `papeis` | Instruções de cada papel: `coordenador`, `executor`, `revisor` |
| `agentes` | A equipe: `id`, `nome`, `tipo` (`claude` ou `codex`), `papel` (papel inicial) e `cor` (cor da camisa) |
| `antigravity.pasta` | Onde o Antigravity guarda as conversas (`~/.gemini/antigravity-ide/conversations`) |
| `antigravity.ativoSegundos` | Há quantos segundos a conversa precisa ter mudado para contar como "trabalhando" |
| `antigravity.maximo` | Quantas conversas do Antigravity mostrar |

O que você muda na página (pasta do projeto, papéis, ordem das mesas, troca automática) fica salvo em `.escritorio.local.json`, que não vai para o git.

## Segurança

Os agentes podem ler e alterar arquivos e rodar comandos no seu computador. Por isso:

- O servidor só escuta em `127.0.0.1`, e o WebSocket só aceita conexões da própria página do escritório.
- Toda ação do Claude que precisa de permissão passa por um post-it que você aprova.
- O Codex não tem aprovação por ação nesse modo, então roda em sandbox `read-only`, a não ser quando é executor (ou cobre um). Como executor ele pode editar arquivos do projeto sem post-it; a tela de Configurações avisa isso.
- O Antigravity é só observado: o escritório vê quando os arquivos de conversa mudam e nunca abre nem altera esses arquivos.

## Próximos passos

- Fluxo de projeto novo com seletor de pasta e `git init`
- Um checkpoint no git antes de cada tarefa, com botão **Desfazer tarefa**, e o Codex revisando exatamente esse diff
- Versão aplicativo de desktop

## Aviso

O VirtualOF é um projeto independente, sem vínculo com Anthropic, OpenAI ou Google. Claude, Codex e Antigravity são marcas dos seus respectivos donos.

## Licença

[MIT](LICENSE)
