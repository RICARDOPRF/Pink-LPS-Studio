# Pink V19 — Agent Learning / Agent Lightning

## Objetivo

Adicionar à Pink uma camada governada para aprender com a execução real dos agentes, sem permitir que um framework externo altere automaticamente o comportamento de produção.

A V19 conecta:

- V16 — Multi-Agent Orchestrator;
- V17 — Project Brain temporal e provenance;
- V18 — Training Studio / Model Lab;
- V19 — trajetórias, benchmarks, recompensas, planos de otimização e avaliação de candidatos.

## Upstream auditado

Projeto: `microsoft/agent-lightning`

Release pinada:

- versão: `v1.0.1`
- commit: `8435586d147b4cf7bff33e687d7317149e79cbb8`
- licença: MIT

A release estável auditada documenta três componentes principais:

1. Trainer;
2. API Gateway;
3. Rollout Controller.

Também documenta rollouts, eventos, reward, captura de chamadas de modelo, execução local ou Kubernetes e agregação de traces em nível de trajetória ou transição.

A integração da Pink é clean-room. Nenhum código do Agent Lightning foi copiado ou vendorizado.

## Pink Agent Learning Studio

O domínio próprio da LPS contém:

- `AgentHarnessRegistry`;
- `BenchmarkRegistry`;
- `TrajectoryRegistry`;
- `PinkAgentLearningStudio`;
- `AgentLightningAdapter`.

### Agent Harness

Registra uma versão observável de um agente/harness da Pink, com:

- nome e versão;
- projeto opcional;
- referência de entrypoint;
- capacidades;
- evidências.

### Benchmark

Registra o contrato de avaliação:

- dataset aprovado;
- métricas;
- baseline;
- projeto opcional;
- evidências.

### Trajectory

Registra metadados de uma execução real sem guardar automaticamente conteúdo bruto de prompts:

- harness;
- benchmark;
- `traceRef`;
- resultado;
- score;
- reward signals;
- policyRef;
- evidências;
- início/fim.

A V19 bloqueia trajetórias e planos que misturem projetos explicitamente diferentes.

## Learning Plan

Um plano nasce como `planned` e possui risco HIGH.

Ele pode otimizar, de forma declarativa:

- prompt;
- tools;
- workflow;
- model;
- reasoning.

O plano também escolhe agregação:

- `trajectory`;
- `transition`.

Antes de exportar qualquer executor spec é obrigatório um `approvalRef` humano.

## Adapter Agent Lightning

`AgentLightningAdapter` produz somente um spec declarativo.

Toda exportação contém:

- `execute: false`;
- upstream pinado;
- Trainer / API Gateway / Rollout Controller;
- harness;
- benchmark;
- trajetórias;
- objetivo;
- targets de otimização;
- agregação;
- estado de rede não configurado.

Por padrão:

- execução local: bloqueada;
- Kubernetes: bloqueado;
- mutação do harness de produção: bloqueada;
- Gateway: não configurado;
- credencial bearer: não configurada;
- endpoint de modelo: não configurado.

Assim, adicionar Agent Lightning ao runtime não executa RL, não cria pods, não sobe servidor, não injeta credenciais e não modifica agentes publicados.

## Avaliação e promoção

Após uma execução externa futura e isolada, a Pink pode registrar:

- `candidateRef`;
- métricas;
- evidências.

O resultado passa a `evaluated`.

Mesmo depois da avaliação, a V19 não promove automaticamente o candidato.

`approvePromotion()` exige outro `approvalRef` humano.

Essa aprovação apenas registra governança. Ela não faz deploy e não substitui o harness de produção.

## Relação com Project Brain

O Project Brain fornece fatos temporais e provenance.

A V19 pode consumir apenas referências aprovadas de traces, benchmarks e datasets relacionados a um projeto.

Nenhum fato do Project Brain vira reward ou dado de treinamento automaticamente.

## Relação com Training Studio

A V18 cuida de datasets, jobs de treinamento e modelos especialistas.

A V19 cuida de comportamento de agentes em execução:

`Harness → Trajectory → Reward → Benchmark → Optimization Plan → Candidate → Evaluation`

No futuro, um candidato aprovado da V19 poderá gerar um job controlado na V18 ou referenciar um modelo do Model Registry, mantendo as duas responsabilidades separadas.

## Segurança

- sem shell automático;
- sem RL no browser;
- sem Kubernetes automático;
- sem criação automática de API Gateway;
- sem credenciais externas;
- sem mutação automática do agente em produção;
- sem promoção automática;
- isolamento por projeto;
- evidence refs obrigatórias nos registros críticos;
- Agent Lightning pinado por release + SHA;
- NO EVIDENCE → NO CLAIM.

## Estado da V19

Nesta fase, a integração é de arquitetura, governança, contratos e executor specs não executáveis.

Treinamento real com GPU/verl/vLLM permanece fora do runtime web e exigirá infraestrutura isolada, dados aprovados e nova aprovação humana.
