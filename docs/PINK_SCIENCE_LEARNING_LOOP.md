# Pink Science Learning Loop

O loop transforma a biblioteca científica em um processo verificável de estudo.

Fluxo: **fonte oficial -> ingestão -> classificação de evidência -> sessão de estudo -> avaliação -> memória de domínio -> modo professora**.

## Limite importante
O runtime não finge execução em background. `study()` declara `background:false`. Para estudar por horas de verdade, um scheduler/worker persistente deve chamar as sessões e registrar cada execução.

## Calculadoras iniciais
- equivalência massa-energia
- gravitação de Newton
- fator de Lorentz
- raio de Schwarzschild
- velocidade orbital circular newtoniana

Cada cálculo informa o modelo/equação; resultados numéricos não são apresentados como validação experimental.

## Próxima integração
Persistir ledger/mastery no Supabase, executar workers agendados, indexar conteúdo permitido e conectar o contexto recuperado ao Pink Brain antes da resposta da professora.
