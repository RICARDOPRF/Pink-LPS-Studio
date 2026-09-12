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
