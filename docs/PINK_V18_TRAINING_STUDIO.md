# Pink V18 — Training Studio / LPS Model Lab

## Objetivo

Adicionar à Pink uma camada própria para **criar, treinar, avaliar e registrar modelos especialistas da LPS**, sem substituir GPT, Gemini ou NVIDIA.

A arquitetura adota MiniMind como primeiro backend experimental de treinamento, mas mantém o domínio da LPS separado do framework externo.

A V18 agora é empilhada sobre a V17 Project Brain, mantendo no mesmo runtime o contexto temporal por projeto e o laboratório de modelos.

## Upstream verificado

Projeto: `jingyaogong/minimind`

Revisão pinada para esta integração:
`7a9137d2e90294df80ce9178b89e82657e19f5a7`

Licença verificada no repositório oficial: Apache-2.0.

Na revisão auditada, o projeto expõe:
- `trainer/train_tokenizer.py`
- `trainer/train_pretrain.py`
- `trainer/train_full_sft.py`
- `trainer/train_lora.py`
- `trainer/train_dpo.py`
- `trainer/train_ppo.py`
- `trainer/train_grpo.py`
- `trainer/train_distillation.py`
- `trainer/train_agent.py`

O README oficial também declara Dense/MoE, Tool Use, Agentic RL, GRPO/CISPO, distillation, llama.cpp, vLLM, Ollama e API compatível com OpenAI.

## Princípio de integração

**Não vendorizamos nem copiamos código MiniMind para dentro da Pink.**

A Pink mantém:
1. Dataset Registry;
2. Model Registry;
3. Training Job manifests;
4. aprovação humana;
5. provenance/evidence;
6. Adapter MiniMind que gera um executor spec estruturado e **não executa comandos**.

O treinamento real deverá acontecer futuramente em runner isolado, com GPU, armazenamento e credenciais separados do frontend da Pink.

## Dataset governance

Um dataset precisa ter:
- nome e versão;
- finalidade;
- licença/origem;
- referências de provenance;
- sensibilidade.

Datasets marcados como contendo segredos são rejeitados.

Datasets com dados pessoais ou sensibilidade `restricted` não podem usar automaticamente um teacher externo.

A Pink armazena no registry **metadados e referências**, não o conteúdo bruto do dataset.

## Training recipes

A primeira versão conhece:
- tokenizer;
- pretrain;
- SFT;
- LoRA;
- DPO;
- PPO;
- GRPO;
- distillation;
- Agentic RL.

Para Agentic RL, o adapter MiniMind permite somente `grpo` ou `cispo`, de acordo com o capability declarado no upstream auditado.

## Human gate

Todo job nasce como `planned`.

Para exportar um executor spec é obrigatório um `approvalRef` humano. O adapter sempre retorna `execute:false`.

Assim, registrar MiniMind na Pink **não concede shell, GPU ou execução autônoma** ao runtime web.

## Model Registry

Resultados só entram no Model Registry quando existe:
- artifactRef;
- evidência;
- métricas opcionais.

Todo modelo entra como `candidate`.

Promoção para `released` exige `approvalRef` explícito.

## Primeiros modelos-alvo

O laboratório foi desenhado para futuros especialistas como:
- `pink-scheduler` — cronogramas e desvios;
- `pink-restrictions` — classificação e causa de restrições;
- `pink-rdc` — RDC/SM;
- `pink-pipe` — engenharia/tubulação;
- `pink-tool-router` — seleção de ferramentas da Pink.

## Relação com V17

V17 Project Brain fornece contexto temporal, entidades e fontes controladas por projeto com Graphiti como backend opcional.

V18 Training Studio transforma apenas conjuntos explicitamente aprovados desses dados em datasets/versionamentos para treino.

O runtime combinado é `next-0.7.0` e expõe as duas camadas de forma separada:

- `projectBrains` — contexto/memória temporal/provenance;
- `modelLab` — datasets, jobs de treino e modelos candidatos.

RAG e memória continuam separados de treinamento de pesos.

## Segurança

- sem execução de treinamento dentro do browser;
- sem shell automático;
- sem baixar modelo automaticamente;
- sem enviar dataset a teacher externo sem política compatível;
- sem secrets em manifests;
- Graphiti e MiniMind permanecem externos e pinados por SHA;
- release de modelo exige aprovação humana;
- NO EVIDENCE → NO CLAIM.
