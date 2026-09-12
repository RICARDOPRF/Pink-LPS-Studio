# Pink LPS Studio

Interface da **Pink**, assistente de voz da Lean Performance Solutions para desenvolvimento conversacional de aplicativos.

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

## Estado atual

- interface web responsiva;
- avatar 3D da Pink;
- voz conectada diretamente ao **ElevenLabs Agents**;
- voz configurada no agente: **Roberta**;
- Agent ID público: `agent_0001m2brk3bxes2vwzc26rpzqww4`;
- conversa por voz via WebRTC usando `@elevenlabs/client`;
- estados visuais de ouvindo, pensando e falando sincronizados com a sessão;
- nenhuma API Key privada é armazenada no GitHub ou no navegador;
- área de histórico de conversa e preview de aplicativos.

## Configuração da voz

A voz e o comportamento são administrados diretamente no painel do agente ElevenLabs. O frontend usa apenas o Agent ID público para iniciar a conversa.

Se o agente for alterado para privado no futuro, a autenticação deve passar por backend seguro para emissão de token/signed URL. Nunca coloque uma API Key privada do ElevenLabs no `index.html`, `app.js` ou em qualquer arquivo público.

## Próxima etapa

A camada de edição real não deve colocar token do GitHub no navegador. O caminho recomendado é um backend seguro que receba comandos autorizados, use GitHub no servidor e crie branches/previews de laboratório.

## Segurança

Produção deve ser protegida por confirmação explícita. Exclusões, publicação, alterações destrutivas e operações sensíveis nunca devem ser executadas apenas por inferência da conversa.

## Evolution Core

Pink includes a safe self-improvement layer. Runtime signals generate improvement candidates locally, Gemini can provide independent review, and autonomous development is limited to isolated branches/draft PRs. Production merges remain approval-gated. See `EVOLUTION.md` and `evolution-policy.json`.