# Fase 7 — OR-Tools CP-SAT em modo sombra

## Arquitetura

```text
Next.js
  -> CpSatSolverAdapter (HTTP, timeout, AbortSignal e validação de resposta)
  -> serviço Python local
  -> OR-Tools CP-SAT
  -> IDs de TurnoCandidato
  -> SolucaoSemanal
  -> validarSolucao() + avaliarSolucao()
  -> comparação legado / heurística / CP-SAT
```

O serviço não importa código Supabase, não recebe credenciais do banco e não
persiste nada. O build Next.js não executa Python e não instala OR-Tools.

## Ativação

O padrão é desligado. As variáveis são:

```dotenv
ENABLE_CP_SAT_SHADOW=false
CP_SAT_SERVICE_URL=http://127.0.0.1:8765
CP_SAT_SERVICE_TOKEN=
ENABLE_SHADOW_OPTIMIZER_IN_PRODUCTION=false
```

`ENABLE_SHADOW_OPTIMIZER_IN_PRODUCTION` é uma segunda trava. Ela só deverá ser
ativada quando o serviço separado estiver protegido e dimensionado. O gerador
legado permanece responsável por toda persistência mesmo com as duas flags.

## Modelo

Cada candidato recebe uma variável binária. O modelo elimina ou restringe dias
fechados, indisponibilidade, operação, zona e função incompatíveis; exige mínimo,
funções obrigatórias, abertura e fechamento; impede incompatibilidades de
descanso/sobreposição; e limita sequências a seis dias incluindo a semana
anterior. Fechamentos `00:00` e após meia-noite usam minutos absolutos.

Existe temporariamente `sum(x[funcionário,dia]) <= 1` dentro do adapter Python.
Essa limitação não existe em `TurnoCandidato`, `SolucaoSemanal` ou
`SolverAdapter`, preservando a evolução futura para horários repartidos.

Os objetivos são resolvidos em etapas e o ótimo da etapa anterior é fixado antes
da seguinte: ideal, excesso, carga proporcional, justiça histórica e
preferências/variedade. Se uma etapa consumir o timeout, a melhor solução válida
da última etapa concluída é devolvida como `feasible`, nunca como ótima.

Seed derivada da semana, candidatos ordenados e `num_search_workers = 1` tornam
a solução determinística. Mais workers podem melhorar desempenho no futuro, mas
perdem essa garantia estrita.

## Benchmark local

Windows, Python 3.12, OR-Tools 9.14.6206, sete dias `09:00–23:00`, pico forte no
fim de semana e limites de 2/5/10 segundos:

| Funcionários | Candidatos/variáveis | Constraints | Tempo HTTP | Status | Vencedor triplo |
| ---: | ---: | ---: | ---: | --- | --- |
| 5 | 245 | 599 | 2.070 ms | válida/feasible | CP-SAT |
| 15 | 735 | 3.039 | 5.033 ms | válida/feasible | CP-SAT |
| 30 | 1.470 | 10.449 | 10.085 ms | válida/feasible | CP-SAT |

Os tempos incluem serialização, HTTP local e validação TypeScript. São medições
do cenário sintético e não uma garantia para dados reais ou Vercel Hobby.

Nas três dimensões, legado e heurística foram válidos, mas ficaram oito unidades
abaixo do ideal. O CP-SAT atingiu distância zero e excesso zero, vencendo os três
comparativos no primeiro objetivo flexível. O desvio proporcional de carga foi,
respectivamente, `0,1125 / 0,67 / 0,835` para CP-SAT, contra
`0,545 / 0,848333 / 0,924167` tanto no legado quanto na heurística.

## Limitações e deployment

- A heurística de candidatos limita o espaço que o CP-SAT consegue explorar.
- Justiça e variedade são formulações lineares equivalentes em prioridade, mas a
  comparação final continua sendo a implementação canônica TypeScript.
- Um worker favorece determinismo e reduz paralelismo.
- O import nativo do OR-Tools tem cold start relevante; o processo deve ser
  persistente em produção.
- O servidor HTTP padrão é apenas local/dev. Exposição futura exige TLS,
  autenticação serviço-a-serviço, rede privada/allowlist, rate limit e limites de
  payload, além do token já suportado.
