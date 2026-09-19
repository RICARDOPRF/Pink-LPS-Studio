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

- interface orbital ("Command Center") com globo 3D via Three.js/WebGL e fallback CSS quando o WebGL/CDN não está disponível;
- avatar 3D opcional (VRM/GLB) com fallback de retrato quando o modelo/registro Supabase não pode ser carregado;
- voz neural via **Gemini TTS**, voz padrão **Aoede**, com catálogo de 30 vozes selecionáveis (`voice/pink-voice-catalog.js`);
- o pipeline antigo baseado em ElevenLabs Agents (`app.js`) foi descontinuado; `voice/pink-legacy-voice-kill.js` garante que ele não inicia mais em tempo de execução;
- roteador multiagente (`agents/pink-model-router.js`) com ChatGPT como supervisor e Gemini para pesquisa fundamentada; demais provedores (Codex, Claude, Blackbox, NVIDIA) ficam `unavailable` até terem um adapter autenticado;
- estados visuais de ouvindo, pensando, falando e executando sincronizados com a sessão;
- memória local com fallback (`PinkMemoryCloud`) e ponte opcional para Supabase;
- painel de autonomia/evolução com aprovação humana obrigatória para qualquer candidato de autoevolução;
- nenhuma API Key privada é armazenada no GitHub ou no navegador.

## Configuração da voz

A voz é gerada por uma função de borda (`pink-tts`) que fala com o Gemini TTS; o frontend nunca guarda a chave do provedor. `pink-public-config.js` define o provedor (`gemini-tts`) e a voz padrão (`Aoede`); NVIDIA está reservado como fallback futuro.

Nunca coloque uma API Key privada de qualquer provedor de voz/IA no `index.html`, em scripts do frontend ou em qualquer arquivo público.

## Próxima etapa

A camada de edição real não deve colocar token do GitHub no navegador. O caminho recomendado é um backend seguro que receba comandos autorizados, use GitHub no servidor e crie branches/previews de laboratório.

## Segurança

Produção deve ser protegida por confirmação explícita. Exclusões, publicação, alterações destrutivas e operações sensíveis nunca devem ser executadas apenas por inferência da conversa.

## Evolution Core

Pink includes a safe self-improvement layer. Runtime signals generate improvement candidates locally, Gemini can provide independent review, and autonomous development is limited to isolated branches/draft PRs. Production merges remain approval-gated. See `EVOLUTION.md` and `evolution-policy.json`.