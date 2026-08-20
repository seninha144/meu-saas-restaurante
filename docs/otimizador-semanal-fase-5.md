# Fase 5 — SolverAdapter e spike técnico

## Decisão

O problema semanal é predominantemente combinatório e booleano: escolher ou não
cada candidato, com restrições de cobertura, incompatibilidade, descanso e dias
consecutivos. CP-SAT é a tecnologia recomendada para o solver definitivo.

O adapter desta fase usa uma heurística gulosa determinística, sem dependências.
Ela serve para validar o contrato, a conversão para `SolucaoSemanal` e a passagem
obrigatória por `validarSolucao()` e `avaliarSolucao()`. Não prova inviabilidade e
não deve substituir um solver combinatório.

## Tecnologias avaliadas

| Opção | Node/TypeScript | Modelo | Deploy e manutenção | Decisão |
| --- | --- | --- | --- | --- |
| OR-Tools CP-SAT | Sem binding Node oficial; integração mais segura via serviço Python | Excelente para decisões booleanas e scheduling | Binário nativo e bundle/cold start devem ser medidos | Recomendada, atrás do adapter |
| HiGHS/MILP | Há interfaces JavaScript/Wasm e Node mantidas pela comunidade | Viável, mas a formulação de scheduling tende a ser mais trabalhosa | Integração Node mais direta; suporte da interface deve ser avaliado | Alternativa |
| Heurística TypeScript | Nativa e sem dependências | Não garante ótimo nem prova inviabilidade | Deploy simples | Apenas spike/fallback experimental |

Fontes técnicas consultadas:

- https://developers.google.com/optimization/introduction/get_started
- https://ergo-code.github.io/HiGHS/previews/PR1219/interfaces/
- https://vercel.com/docs/functions/runtimes
- https://vercel.com/docs/functions/limitations

## Arquitetura de deployment sugerida

Implementar CP-SAT em um serviço Python/worker separado, com seed fixa, um único
worker quando o determinismo estrito for prioritário, limite de tempo e resposta
serializável pelo contrato `ResultadoSolver`. Uma Function Python na Vercel pode
ser testada como primeiro deployment, mas tamanho do pacote nativo, cold start,
CPU e duração precisam de benchmark antes da escolha definitiva. Um serviço
dedicado evita acoplar o bundle nativo ao dashboard Next.js.

O helper `resolverComFallback()` formaliza o ponto de extensão:

```text
SolverAdapter
  -> solução válida: validar/avaliar e devolver
  -> falha/timeout/nenhuma solução encontrada: chamar fallback fornecido
```

Ele não importa nem chama o gerador legado; portanto nada está ativo em produção.

## Escopo do modelo mínimo

O spike escolhe no máximo um candidato por funcionário/dia e descarta tentativas
que criem violações estruturais. A cada iteração reduz, lexicograficamente, erros
de cobertura, períodos/funções abaixo do mínimo e défice agregado. A solução só
recebe status válido quando `validarSolucao()` confirma todas as hard constraints,
incluindo disponibilidade, sobreposição, descanso, seis dias consecutivos,
abertura, fechamento e mínimos.

## Benchmark sintético local

Ambiente: teste Node local, sete dias `09:00–23:00`, uma zona/função, mínimo 1 por
período e candidatos gerados pela Fase 2.

| Funcionários | Candidatos/variáveis | Tempo observado | Resultado |
| ---: | ---: | ---: | --- |
| 5 | 245 | 373–430 ms | válida |
| 15 | 735 | 985–1.093 ms | válida |
| 30 | 1.470 | 2.504–2.575 ms | válida |

Estes números caracterizam somente a heurística e esta máquina; não são projeção
de desempenho do CP-SAT nem garantia para dados reais.
