# Pink LPS Studio

Interface inicial da **Pink**, assistente de voz da Lean Performance Solutions para desenvolvimento conversacional de aplicativos.

## Direção do produto

Pink é uma IA operacional orientada por voz: conversa, entende contexto, coordena outros modelos, abre e apresenta sistemas, prepara melhorias de software e só publica produção após aprovação explícita.

## Roadmap oficial de evolução

A evolução agora é organizada por fases no GitHub. Consulte [`docs/EVOLUTION_ROADMAP.md`](docs/EVOLUTION_ROADMAP.md).

Foco atual: **Core Intelligence + 3D Presence**, preservando segurança, proveniência e clean-room para referências externas.

## Fluxo-alvo

1. entender uma solicitação por voz;
2. localizar o projeto correto;
3. criar uma branch de laboratório/evolução;
4. editar o código com segurança;
5. executar validações e testes;
6. abrir um preview;
7. apresentar por voz o que mudou;
8. publicar somente após aprovação explícita.

## Componentes já em evolução

- Evolution Core seguro;
- GPT coordenador + Gemini Reviewer;
- Awareness;
- Planner / Recovery;
- Approval Engine;
- Context Memory;
- Health / Self-Test;
- Preflight;
- Run Ledger;
- Recall Gate;
- Voice Watchdog / Echo Guard;
- campo neural 3D original da Pink.

## Referências externas

Arquivos/repositórios enviados como inspiração passam primeiro pelo protocolo [`docs/REFERENCE_INTAKE.md`](docs/REFERENCE_INTAKE.md). Projetos não comerciais, proprietários ou com licença incerta são usados apenas como referência arquitetural e recebem implementação clean-room.

## Segurança

- Private API keys nunca devem ser colocadas no navegador ou versionadas.
- Produção é protegida por confirmação explícita.
- Exclusões, publicação, cobrança, credenciais e alterações destrutivas não podem ser executadas autonomamente.
- Código gerado por IA não deve rodar diretamente na máquina do usuário; use sandbox/container e trilha de auditoria.

## Voz

A Pink usa Vapi para conversa em tempo real e ElevenLabs/Roberta como voz configurada. No iPhone, permissões de áudio/microfone devem respeitar o gesto explícito exigido pelo navegador.

## Branch de evolução atual

`evolution/jarvis-core-import-01`

Mudanças permanecem em draft/preview até revisão e decisão explícita de merge para `main`.
