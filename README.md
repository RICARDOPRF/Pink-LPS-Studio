# Pink LPS Studio

Interface inicial da **Pink**, assistente de voz da Lean Performance Solutions para desenvolvimento conversacional de aplicativos.

## Objetivo

Permitir um fluxo no qual o usuário fala normalmente com a Pink e, progressivamente, ela possa:

1. entender uma solicitação por voz;
2. localizar o projeto correto;
3. criar uma branch de laboratório;
4. editar o código com segurança;
5. executar validações;
6. abrir um preview do aplicativo;
7. apresentar por voz o que mudou;
8. publicar somente após aprovação explícita.

## Estado atual — V1

- interface web responsiva;
- avatar da Pink;
- integração preparada para o Vapi Web Widget;
- Assistant ID da Pink configurado;
- chave pública do Vapi **não é versionada**: o usuário informa uma Public API Key uma única vez e ela fica apenas no `localStorage` do navegador;
- área de histórico de comandos e simulação;
- área reservada para preview de aplicativos.

## Configuração da voz

1. No Vapi Dashboard, crie/copiei uma **Public API Key**.
2. Restrinja a chave ao domínio do GitHub Pages e à assistente Pink.
3. Abra o Pink LPS Studio, clique na engrenagem e informe a chave pública.
4. Nunca coloque a Private API Key em `index.html`, `app.js` ou qualquer arquivo público.

Assistant ID atual: `5db8d17f-e467-4275-9531-9ccd2c983ff1`

## Próxima etapa

A camada de edição real não deve colocar token do GitHub no navegador. O caminho recomendado é um backend seguro (por exemplo Cloudflare Worker) que receba comandos autorizados, use GitHub/Composio no servidor e crie branches/previews de laboratório.

## Segurança

Produção deve ser protegida por confirmação explícita. Exclusões, publicação, alterações destrutivas e operações sensíveis nunca devem ser executadas apenas por inferência da conversa.

## Evolution Core

Pink now includes a safe self-improvement layer. Runtime signals generate improvement candidates locally, Gemini provides independent review, and autonomous development is limited to isolated branches/draft PRs. Production merges remain approval-gated. See `EVOLUTION.md` and `evolution-policy.json`.
