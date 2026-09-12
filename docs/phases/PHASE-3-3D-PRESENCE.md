# Fase 3 — Pink 3D Presence

Ordem aprovada: executar a Fase 3 primeiro; depois retornar à Fase 0 e seguir a sequência.

## 3.1 — WebGL Presence Core — IMPLEMENTADO NESTA BRANCH
- Three.js/WebGL real ao redor da Pink atual.
- Campo neural com partículas, conexões, anéis e nós orbitais.
- Reação nativa aos estados `idle`, `listening`, `thinking`, `speaking`, `executing` e `error`.
- Movimento sutil por ponteiro/câmera.
- Perfil reduzido em celular/dispositivo de menor capacidade.
- `prefers-reduced-motion` respeitado.
- Fallback CSS quando WebGL/CDN não estiver disponível.
- Zero alteração de voz, memória, autenticação ou roteadores LPS.

## 3.2 — Avatar 3D rigado
- Substituir gradualmente o retrato por modelo original/licenciado VRM/GLB da Pink.
- Rig de cabeça, olhos, boca, pescoço, ombros e mãos.
- Piscar, respiração, microexpressões e olhar.

## 3.3 — Lip sync e emoções
- Sincronizar blendshapes com áudio da Roberta/ElevenLabs.
- Expressões por estado e intenção, sem inferir atributos sensíveis do usuário.

## 3.4 — Spatial UI
- Apps e previews aparecem como painéis/hologramas sob comando.
- Tela inicial continua centrada na Pink.

## 3.5 — Performance e aceite
Critérios para concluir a Fase 3:
- voz ElevenLabs permanece funcional;
- Pink Core/memória permanece funcional;
- NVIDIA e routers permanecem funcionais;
- WebGL não bloqueia a página quando falha;
- responsivo em iPhone/Android/desktop;
- animação reage a todos os estados;
- avatar 3D rigado aprovado visualmente;
- testes de performance e acessibilidade concluídos.


## Revisão 3.1.1 — base funcional sincronizada

Base main verificada: `775ec9045a3a976517d47d9b582297298f41e6a4`.
O app.js v11 e os módulos Core/NVIDIA/roteadores/memória são preservados sem alterações.

- Renderização limitada a 30 FPS em mobile e 60 FPS nos demais dispositivos.
- Movimento reduzido renderiza sob demanda e desativa a animação do fallback CSS.
- Pausa em aba oculta, inclusive durante inicialização, sem duplicar loops.
- Estados reviewing, presenting e success adicionados.
- Perda de contexto WebGL ativa fallback; destroy remove listeners, canvas, fallback e libera geometrias/materiais compartilhados uma vez.
- Removido rótulo técnico WebGL sobre a personagem.

Validação executada: sintaxe Node e `node tests/presence-lifecycle.cjs`, com renderizador simulado.
Esse teste verifica ciclo de vida e agendamento, não a renderização real de Three.js.

Pendente: preview visual em navegador, GPU/mobile reais e chamadas ElevenLabs/fallback ao vivo.
O cenário ainda usa o retrato existente; não há GLB/VRM definitivo, rig ou lip sync facial real neste incremento.
Fases 3.2–3.5 e aceite completo da Fase 3 permanecem pendentes. Não publicado.
