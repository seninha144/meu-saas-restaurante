# Serviço CP-SAT de modo sombra

Serviço HTTP local e isolado que recebe somente JSON normalizado do domínio,
executa OR-Tools CP-SAT e devolve IDs de candidatos. Não acessa Supabase, não
autentica usuários do SaaS e não persiste dados.

## Executar no Windows

```powershell
python -m venv .venv-cp-sat
.\.venv-cp-sat\Scripts\python.exe -m pip install -r services\cp_sat\requirements.txt
$env:CP_SAT_SERVICE_TOKEN = "token-local-longo"
.\.venv-cp-sat\Scripts\python.exe services\cp_sat\service.py
```

Em outro terminal, configure o Next.js:

```dotenv
ENABLE_CP_SAT_SHADOW=true
CP_SAT_SERVICE_URL=http://127.0.0.1:8765
CP_SAT_SERVICE_TOKEN=token-local-longo
# Apenas quando houver infraestrutura própria e se desejar sombra no deploy:
ENABLE_SHADOW_OPTIMIZER_IN_PRODUCTION=false
```

Sem `ENABLE_CP_SAT_SHADOW=true`, o adapter CP-SAT não é chamado. Sem URL ou com
serviço indisponível, o modo sombra registra `CP-SAT: indisponível` e o fluxo
legado continua normalmente.

## Modelo

- uma variável binária por `TurnoCandidato`;
- cobertura mínima, função, abertura e fechamento como hard constraints;
- incompatibilidades por descanso de 11h e fronteira da semana anterior;
- no máximo seis dias consecutivos, incluindo a fronteira anterior;
- no máximo um turno por funcionário/dia apenas neste adapter inicial;
- otimização lexicográfica em etapas: ideal, excesso, carga proporcional,
  justiça histórica e preferências/variedade;
- seed derivada da semana e um worker para manter determinismo.

O Next.js não confia no resultado: IDs desconhecidos/duplicados são rejeitados e
toda solução é reconstruída e passada por `validarSolucao()` e
`avaliarSolucao()`.

## Deployment futuro

O servidor usa a biblioteca HTTP padrão apenas para desenvolvimento. Antes de
expor externamente, colocá-lo atrás de TLS, autenticação serviço-a-serviço,
allowlist/rede privada, rate limit e limite de payload. O token compartilhado já
é suportado, mas não é suficiente como única proteção de um endpoint público.

Por causa do binário nativo, dependências e cold start do OR-Tools, o serviço não
faz parte do build Next.js/Vercel Hobby. Um worker/container Python separado é o
destino recomendado para produção.
