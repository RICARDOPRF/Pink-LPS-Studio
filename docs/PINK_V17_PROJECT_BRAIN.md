# Pink V17 — Project Brain / Temporal Context Engine

## Objetivo

Dar à Pink um cérebro separado por projeto, com entidades, fatos temporais, episódios de evidência e histórico de mudanças.

A V17 evita transformar o Project Brain em apenas um RAG de documentos. O objetivo é permitir perguntas como:

- O que é verdade agora?
- O que era verdade numa data anterior?
- Quando uma condição mudou?
- Qual RDO, documento, decisão ou evidência originou esse fato?
- Qual atividade depende de qual material, restrição, contrato ou marco?

## Arquitetura própria da LPS

A Pink mantém um núcleo independente do backend externo:

- `ProjectBrainRegistry` — separa projetos e adapters;
- `ProjectBrain` — entidades, episódios e fatos;
- entidades com tipos industriais;
- fatos com `validFrom` / `validTo`;
- supersessão sem apagar histórico;
- provenance obrigatória por episódio;
- lookup da evidência que sustenta cada fato;
- isolamento explícito por `projectId`.

## Graphiti

Graphiti entra como backend opcional de grafo temporal.

Upstream auditado:

- repositório: `getzep/graphiti`
- revisão pinada: `de8eb5b896c05ed1b5b329d4cb52015446d65e21`
- licença: Apache-2.0

Na revisão auditada, o projeto documenta grafos temporais, episodes/provenance, `group_id`, `add_episode`, busca de fatos e filtros temporais `valid_at` / `invalid_at`.

A integração é clean-room e por interface. Nenhum código Graphiti é copiado ou vendorizado na Pink.

## Adapter Graphiti

`GraphitiProjectBrainAdapter` gera specs não executáveis para:

- `add_episode`
- `search_memory_facts`

Cada projeto recebe um `group_id` próprio, como `lps-beccs-demo`.

Toda spec retorna:

- `execute: false`
- `executionPolicy: external-isolated-service`
- repositório e SHA upstream pinados.

Assim, adicionar Graphiti ao runtime não cria automaticamente banco Neo4j/FalkorDB, credenciais, conexões externas ou execução de LLM.

## Modelo temporal

Quando um novo fato substitui o estado anterior do mesmo `subject + predicate`, o fato antigo é marcado como `superseded` e recebe `validTo`.

Exemplo:

1. 01/09 — Blower → `delivery_status = pending`
2. 10/09 — Blower → `delivery_status = delivered`

Consulta em 05/09 retorna `pending`.
Consulta em 12/09 retorna `delivered`.
O primeiro fato não é apagado.

## Provenance / NO EVIDENCE → NO CLAIM

A V17 não permite criar episódio sem `evidenceRefs`.

Um fato deve apontar para um episódio pertencente ao mesmo projeto. A Pink consegue retornar:

`fact → episode → evidenceRefs`

Isso prepara o Project Brain para RDO, SM, cronograma, contratos, materiais, documentos e dados dos sistemas LPS com rastreabilidade.

## Tipos iniciais de entidade

- project
- person
- organization
- discipline
- activity
- milestone
- material
- document
- constraint
- contract
- asset
- decision

A ontologia poderá crescer depois sem acoplar o núcleo ao Graphiti.

## Segurança e isolamento

- nenhum dado de projeto é misturado por padrão;
- export cross-project é bloqueado;
- metadados com campos sensíveis são redigidos;
- conteúdo com padrão de segredo é rejeitado nas fronteiras críticas;
- Graphiti permanece externo e sem execução automática;
- nenhum credential/billing/storage externo é configurado nesta fase;
- nenhuma publicação automática em produção;
- nenhuma alteração de dados reais de obras.

## Relação com V18 Training Studio

V17 organiza contexto operacional e provenance.

V18 poderá consumir apenas datasets explicitamente aprovados e derivados dessa camada, preservando separação entre:

- contexto/memória/RAG;
- datasets de treinamento;
- pesos dos modelos LPS.

## Próximos passos

1. adapters de ingestão para Painel de Bordo, CVM, cronograma e documentos;
2. ontologia industrial LPS;
3. serviço Graphiti isolado em infraestrutura própria;
4. recuperação híbrida Project Brain + Memory;
5. política multi-tenant e RLS antes de dados reais de clientes.
