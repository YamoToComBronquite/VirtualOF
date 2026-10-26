# VirtualOF

Um escritório virtual em pixel art para os seus agentes de IA. Você passa tarefas, aprova o que eles querem rodar e acompanha o trabalho, tudo numa página no navegador.

![O escritório à noite, com os agentes nas mesas](docs/screenshot.png)

[Read in English](README.md)

## O que ele faz

- **Comanda os agentes pelo escritório.** Clique numa mesa, escreva a tarefa e mande. Sem terminal.
- **Claude e Codex juntos.** Dois agentes Claude (coordenador e executor) rodam pelo [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk); um revisor Codex roda pelo [Codex SDK](https://github.com/openai/codex/tree/main/sdk/typescript) em modo só leitura.
- **Permissões viram post-its.** Quando o Claude quer editar um arquivo ou rodar um comando, aparece um post-it com **Aprovar** e **Negar**.
- **Cartão "Abra o terminal".** Se um agente precisar de algo que só você pode fazer (login, instalação, comando interativo), ele para e o escritório mostra o comando exato para copiar. Clique em **Já rodei** e ele continua.
- **Acompanha o Antigravity.** As conversas do Antigravity aparecem como personagens que se acendem quando estão trabalhando. É só acompanhamento: tarefas para o Antigravity continuam pelo próprio Antigravity.
- **Status ao vivo em cada mesa.** A tela, o balão e a luminária mostram se o agente está pensando, lendo, escrevendo, rodando comando, esperando você, terminou ou deu erro. Com a aba em segundo plano, chegam notificações do sistema.

## Requisitos

- Node.js 22 ou mais novo
- Uma conta do Claude logada no Claude Code neste computador (CLI ou extensão da IDE), ou uma `ANTHROPIC_API_KEY`
- Para o revisor Codex: uma conta do ChatGPT. Faça login uma vez com `npx codex login` dentro da pasta do projeto
- Opcional: o [Antigravity](https://antigravity.google), para ver os agentes dele no escritório

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
| `agentes` | A equipe: `id`, `nome`, `tipo` (`claude` ou `codex`), `papel`, `cor` (cor da camisa), `instrucoes` (instruções do papel) e, no Codex, `sandbox` (`read-only` por padrão) |
| `antigravity.pasta` | Onde o Antigravity guarda as conversas (`~/.gemini/antigravity-ide/conversations`) |
| `antigravity.ativoSegundos` | Há quantos segundos a conversa precisa ter mudado para contar como "trabalhando" |
| `antigravity.maximo` | Quantas conversas do Antigravity mostrar |

A pasta do projeto que você escolhe na página fica salva em `.escritorio.local.json`, que não vai para o git.

## Segurança

Os agentes podem ler e alterar arquivos e rodar comandos no seu computador. Por isso:

- O servidor só escuta em `127.0.0.1`, e o WebSocket só aceita conexões da própria página do escritório.
- Toda ação do Claude que precisa de permissão passa por um post-it que você aprova.
- O Codex não tem aprovação por ação nesse modo, então roda em sandbox `read-only` por padrão. Só mude o `sandbox` se confiar nele para escrever.
- O Antigravity é só observado: o escritório vê quando os arquivos de conversa mudam e nunca abre nem altera esses arquivos.

## Próximos passos

- Fluxo de projeto novo com seletor de pasta e `git init`
- Um checkpoint no git antes de cada tarefa, com botão **Desfazer tarefa**, e o Codex revisando exatamente esse diff
- O coordenador distribuindo tarefas para os outros agentes sozinho
- Versão aplicativo de desktop

## Aviso

O VirtualOF é um projeto independente, sem vínculo com Anthropic, OpenAI ou Google. Claude, Codex e Antigravity são marcas dos seus respectivos donos.

## Licença

[MIT](LICENSE)
