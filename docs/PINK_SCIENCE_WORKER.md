# Pink Science Worker

Backend persistente do Pink Science Lab.

## Estado implementado
- fila PostgreSQL com claim atômico via `FOR UPDATE SKIP LOCKED`
- Edge Function autenticada `pink-science-worker`
- coleta uma fonte científica registrada
- envia o tópico + trecho da fonte ao Pink Brain
- exige separação entre fatos estabelecidos e hipóteses
- grava evidência, provider/model e resultado
- registra falha sem transformar erro em conhecimento
- RLS nas tabelas científicas

## Execução
A função processa **um job por chamada**. Isso evita funções longas e permite scheduler externo/cron chamar repetidamente.

O bootstrap `science_bootstrap_20260919` contém cinco sessões: relatividade/ondas gravitacionais, quântica/partículas, Gaia/dinâmica galáctica, astrofísica/cosmologia/exoplanetas e física aplicada/espaço.

## Regra
ACTIVE/deployed não significa que os cinco jobs foram estudados. Um job só conta como aprendizado depois de `status=completed` e evidência persistida.
