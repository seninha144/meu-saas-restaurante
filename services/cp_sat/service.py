from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import time
import unicodedata
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from ortools.sat.python import cp_model

PERIODOS = ("Abertura", "Almoço", "Tarde", "Fechamento")
DESCANSO_MINIMO = 11 * 60
MAX_BODY_BYTES = 10 * 1024 * 1024


def normalizar_funcao(valor: Any) -> str:
    texto = unicodedata.normalize("NFD", str(valor or "").strip().lower())
    return "".join(char for char in texto if unicodedata.category(char) != "Mn")


def seed_semana(semana: str) -> int:
    return int(hashlib.sha256(semana.encode("utf-8")).hexdigest()[:8], 16) & 0x7FFFFFFF


def duracao_historica(item: dict[str, Any]) -> int:
    try:
        inicio_h, inicio_m = (int(valor) for valor in str(item.get("horaInicio", "")).split(":")[:2])
        fim_h, fim_m = (int(valor) for valor in str(item.get("horaFim", "")).split(":")[:2])
    except (TypeError, ValueError):
        return 0
    inicio = inicio_h * 60 + inicio_m
    fim = fim_h * 60 + fim_m
    if fim <= inicio:
        fim += 24 * 60
    return fim - inicio


def minutos_hora(valor: Any) -> int | None:
    try:
        horas, minutos = (int(item) for item in str(valor).split(":")[:2])
        return horas * 60 + minutos
    except (TypeError, ValueError):
        return None


def resposta_vazia(status: str, inicio: float, variaveis: int, constraints: int, seed: int, mensagem: str):
    return {
        "status": status,
        "candidateIds": [],
        "solveTimeMs": round((time.perf_counter() - inicio) * 1000, 2),
        "variables": variaveis,
        "constraints": constraints,
        "seed": seed,
        "completedStages": [],
        "message": mensagem,
    }


def resolver(payload: dict[str, Any]) -> dict[str, Any]:
    inicio = time.perf_counter()
    semana = str(payload.get("semana", ""))
    seed = seed_semana(semana)
    candidatos = sorted(payload.get("candidatos", []), key=lambda item: str(item.get("id", "")))
    funcionarios = {str(item["id"]): item for item in payload.get("funcionarios", [])}
    dias_abertos = {int(dia) for dia in payload.get("diasAbertos", [])}
    if not semana or not funcionarios or not isinstance(candidatos, list):
        return resposta_vazia("model_invalid", inicio, len(candidatos), 0, seed, "Payload incompleto.")

    model = cp_model.CpModel()
    x = [model.new_bool_var(f"x_{indice}") for indice in range(len(candidatos))]
    constraints = 0

    def adicionar(expressao):
        nonlocal constraints
        model.add(expressao)
        constraints += 1

    por_funcionario_dia: dict[tuple[str, int], list[int]] = defaultdict(list)
    por_dia: dict[int, list[int]] = defaultdict(list)
    por_funcionario: dict[str, list[int]] = defaultdict(list)
    horarios = {int(item.get("diaSemana", -1)): item for item in payload.get("horarios", [])}
    indisponibilidades = [item for item in payload.get("disponibilidades", []) if not item.get("disponivel", True)]
    mapa_disponibilidade = {"Abertura": "Manhã", "Almoço": "Tarde", "Tarde": "Noite", "Fechamento": "Fechamento"}
    for indice, candidato in enumerate(candidatos):
        funcionario_id = str(candidato.get("funcionarioId", ""))
        dia = int(candidato.get("diaSemana", -1))
        funcionario = funcionarios.get(funcionario_id)
        horario = horarios.get(dia)
        periodos_candidato = candidato.get("periodos", [])
        indisponivel = any(
            str(item.get("funcionarioId", "")) == funcionario_id
            and int(item.get("diaSemana", -1)) == dia
            and (
                item.get("periodo") in (None, "Total")
                or any(item.get("periodo") == mapa_disponibilidade.get(periodo) for periodo in periodos_candidato)
            )
            for item in indisponibilidades
        )
        abertura = minutos_hora(horario.get("abertura")) if horario else None
        fechamento = minutos_hora(horario.get("fechamento")) if horario else None
        if abertura is not None and fechamento is not None and fechamento <= abertura:
            fechamento += 24 * 60
        dentro_operacao = (
            abertura is not None
            and fechamento is not None
            and int(candidato.get("inicio", -1)) >= dia * 1440 + abertura
            and int(candidato.get("fim", -1)) <= dia * 1440 + fechamento
        )
        invalido = (
            funcionario is None
            or dia not in dias_abertos
            or horario is None
            or bool(horario.get("fechado", False))
            or int(candidato.get("fim", 0)) <= int(candidato.get("inicio", 0))
            or not dentro_operacao
            or indisponivel
            or (
                payload.get("restaurante", {}).get("usaZonas", True)
                and candidato.get("zonaId") != funcionario.get("zonaId")
            )
            or normalizar_funcao(candidato.get("funcao")) != normalizar_funcao(funcionario.get("funcao"))
        )
        if invalido:
            adicionar(x[indice] == 0)
        por_funcionario_dia[(funcionario_id, dia)].append(indice)
        por_funcionario[funcionario_id].append(indice)
        por_dia[dia].append(indice)

    # Limitação temporária do adapter inicial, não do domínio: um turno por funcionário/dia.
    for indices in por_funcionario_dia.values():
        adicionar(sum(x[indice] for indice in indices) <= 1)

    for dia in sorted(dias_abertos):
        abertura = [x[i] for i in por_dia[dia] if candidatos[i].get("cobreAbertura") is True]
        fechamento = [x[i] for i in por_dia[dia] if candidatos[i].get("cobreFechamento") is True]
        adicionar(sum(abertura) >= 1)
        adicionar(sum(fechamento) >= 1)

    usa_zonas = bool(payload.get("restaurante", {}).get("usaZonas", True))
    zonas = [item.get("id") for item in payload.get("zonas", [])] if usa_zonas else [None]
    capacidades = {item.get("id"): max(1, int(item.get("capacidadeMinima", 1))) for item in payload.get("zonas", [])}
    movimentos = {
        (int(item.get("diaSemana", -1)), str(item.get("periodo", ""))): str(item.get("nivel", "normal"))
        for item in payload.get("movimentos", [])
    }
    necessidades = payload.get("necessidades", [])
    slots: list[dict[str, Any]] = []
    for dia in sorted(dias_abertos):
        for zona in zonas:
            for periodo in PERIODOS:
                candidatas = [
                    item for item in necessidades
                    if int(item.get("diaSemana", -1)) == dia
                    and item.get("periodo") == periodo
                    and (item.get("zonaId") == zona or item.get("zonaId") is None)
                ]
                especificas = [item for item in candidatas if item.get("zonaId") == zona]
                linhas = especificas or [item for item in candidatas if item.get("zonaId") is None]
                if linhas:
                    minimo = sum(max(0, int(item.get("minimo", 0))) for item in linhas)
                    ideal = sum(max(0, int(item.get("ideal", 0))) for item in linhas)
                    maximo = sum(max(0, int(item.get("maximo", 0))) for item in linhas)
                else:
                    capacidade = capacidades.get(zona, 1)
                    nivel = movimentos.get((dia, periodo))
                    multiplicador = {"baixo": 0.7, "normal": 1.0, "alto": 1.35, "muito_alto": 1.7}.get(nivel, 1.0)
                    minimo = 1 if nivel else capacidade
                    ideal = math.ceil(capacidade * multiplicador) if nivel else capacidade
                    maximo = ideal + 1 if nivel else ideal
                indices = [
                    i for i in por_dia[dia]
                    if candidatos[i].get("zonaId") == zona and periodo in candidatos[i].get("periodos", [])
                ]
                cobertura = sum(x[i] for i in indices)
                adicionar(cobertura >= minimo)
                funcoes: dict[str, int] = defaultdict(int)
                for linha in linhas:
                    funcao = normalizar_funcao(linha.get("funcao"))
                    if funcao:
                        funcoes[funcao] += max(0, int(linha.get("minimo", 0)))
                for funcao, minimo_funcao in funcoes.items():
                    indices_funcao = [i for i in indices if normalizar_funcao(candidatos[i].get("funcao")) == funcao]
                    adicionar(sum(x[i] for i in indices_funcao) >= minimo_funcao)
                slots.append({"cobertura": cobertura, "ideal": ideal, "maximo": maximo})

    # Descanso entre quaisquer candidatos de um mesmo funcionário.
    for indices in por_funcionario.values():
        ordenados = sorted(indices, key=lambda i: int(candidatos[i]["inicio"]))
        for posicao, primeiro in enumerate(ordenados):
            fim = int(candidatos[primeiro]["fim"])
            for segundo in ordenados[posicao + 1:]:
                inicio_segundo = int(candidatos[segundo]["inicio"])
                if inicio_segundo >= fim + DESCANSO_MINIMO:
                    break
                if int(candidatos[segundo]["diaSemana"]) != int(candidatos[primeiro]["diaSemana"]):
                    adicionar(x[primeiro] + x[segundo] <= 1)

    ultimos_fins = payload.get("fronteiraAnterior", {}).get("ultimosFins", {})
    for funcionario_id, fim_anterior in ultimos_fins.items():
        for indice in por_funcionario.get(funcionario_id, []):
            if int(candidatos[indice]["inicio"]) - int(fim_anterior) < DESCANSO_MINIMO:
                adicionar(x[indice] == 0)

    y: dict[tuple[str, int], Any] = {}
    limite_diario = max(0, int(payload.get("limiteDiarioAutomaticoMinutos", 9 * 60)))
    for funcionario_id in funcionarios:
        for dia in range(7):
            variavel = model.new_bool_var(f"dia_{funcionario_id}_{dia}")
            y[(funcionario_id, dia)] = variavel
            indices = por_funcionario_dia.get((funcionario_id, dia), [])
            adicionar(sum(
                int(candidatos[i].get("duracaoEfetiva", candidatos[i]["duracao"])) * x[i]
                for i in indices
            ) <= limite_diario)
            adicionar(variavel == sum(x[i] for i in indices))

    dias_anteriores = payload.get("fronteiraAnterior", {}).get("diasTrabalhados", {})
    for funcionario_id in funcionarios:
        anteriores = {int(dia) for dia in dias_anteriores.get(funcionario_id, [])}
        for fim_janela in range(0, 7):
            inicio_janela = fim_janela - 6
            constantes = sum(1 for dia in range(inicio_janela, min(0, fim_janela + 1)) if dia in anteriores)
            atuais = [y[(funcionario_id, dia)] for dia in range(max(0, inicio_janela), fim_janela + 1)]
            adicionar(sum(atuais) + constantes <= 6)

    deficits = []
    excessos = []
    for indice, slot in enumerate(slots):
        deficit = model.new_int_var(0, max(0, slot["ideal"]), f"deficit_{indice}")
        excesso = model.new_int_var(0, len(candidatos), f"excesso_{indice}")
        adicionar(deficit >= slot["ideal"] - slot["cobertura"])
        adicionar(excesso >= slot["cobertura"] - slot["maximo"])
        deficits.append(deficit)
        excessos.append(excesso)

    desvios_carga = []
    utilizacoes_extras = []
    for funcionario_id, funcionario in funcionarios.items():
        alvo = max(1, int(funcionario.get("cargaAlvoMinutos", 1)))
        carga_contratada = max(alvo, int(funcionario.get("cargaContratadaMinutos", alvo)))
        limite_automatico = max(carga_contratada, int(funcionario.get("limiteAutomaticoMinutos", carga_contratada)))
        horas = sum(int(candidatos[i].get("duracaoEfetiva", candidatos[i]["duracao"])) * x[i] for i in por_funcionario.get(funcionario_id, []))
        adicionar(horas <= limite_automatico)
        extra = model.new_int_var(0, max(0, limite_automatico - carga_contratada), f"extra_{funcionario_id}")
        adicionar(extra >= horas - carga_contratada)
        utilizacoes_extras.append(extra)
        desvio = model.new_int_var(0, 7 * 24 * 60, f"carga_{funcionario_id}")
        adicionar(desvio >= horas - alvo)
        adicionar(desvio >= alvo - horas)
        desvios_carga.append(desvio * max(1, 1_000_000 // alvo))

    historico_por_funcionario: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in payload.get("historico", []):
        historico_por_funcionario[str(item.get("funcionarioId", ""))].append(item)
    termos_justica = []
    ids = sorted(funcionarios)
    metricas_projetadas: dict[tuple[str, str], Any] = {}
    for funcionario_id in ids:
        historico = historico_por_funcionario.get(funcionario_id, [])
        alvo = max(1, int(funcionarios[funcionario_id].get("cargaAlvoMinutos", 1)))
        contribuicoes = {
            "abertura": [i for i in por_funcionario[funcionario_id] if candidatos[i].get("cobreAbertura")],
            "fechamento": [i for i in por_funcionario[funcionario_id] if candidatos[i].get("cobreFechamento")],
            "sabado": [i for i in por_funcionario[funcionario_id] if int(candidatos[i]["diaSemana"]) == 5],
            "domingo": [i for i in por_funcionario[funcionario_id] if int(candidatos[i]["diaSemana"]) == 6],
        }
        for periodo_operacional, periodo_historico in {
            "Abertura": "Manhã",
            "Almoço": "Tarde",
            "Tarde": "Noite",
            "Fechamento": "Fechamento",
        }.items():
            contribuicoes[f"periodo:{periodo_historico}"] = [
                i for i in por_funcionario[funcionario_id]
                if periodo_operacional in candidatos[i].get("periodos", [])
            ]
        for nome, indices in contribuicoes.items():
            base = sum(1 for item in historico if (
                (nome == "abertura" and item.get("periodo") == "Manhã")
                or (nome == "fechamento" and item.get("periodo") == "Fechamento")
                or (nome == "sabado" and int(item.get("diaSemana", -1)) == 5)
                or (nome == "domingo" and int(item.get("diaSemana", -1)) == 6)
                or (nome.startswith("periodo:") and item.get("periodo") == nome.split(":", 1)[1])
            ))
            metricas_projetadas[(funcionario_id, nome)] = (base + sum(x[i] for i in indices)) * max(1, 1_000_000 // alvo)
        semanas_fds: dict[str, set[int]] = defaultdict(set)
        for item in historico:
            if int(item.get("diaSemana", -1)) in (5, 6):
                semanas_fds[str(item.get("semanaInicio", ""))].add(int(item["diaSemana"]))
        completos_base = sum(1 for dias in semanas_fds.values() if {5, 6}.issubset(dias))
        completo = model.new_bool_var(f"fds_completo_{funcionario_id}")
        adicionar(completo <= y[(funcionario_id, 5)])
        adicionar(completo <= y[(funcionario_id, 6)])
        adicionar(completo >= y[(funcionario_id, 5)] + y[(funcionario_id, 6)] - 1)
        metricas_projetadas[(funcionario_id, "fdsCompleto")] = (completos_base + completo) * max(1, 1_000_000 // alvo)
        horas_base = sum(duracao_historica(item) for item in historico)
        horas_novas = sum(int(candidatos[i].get("duracaoEfetiva", candidatos[i]["duracao"])) * x[i] for i in por_funcionario[funcionario_id])
        metricas_projetadas[(funcionario_id, "horas")] = (horas_base + horas_novas) * max(1, 1_000_000 // alvo)

    for posicao, primeiro in enumerate(ids):
        for segundo in ids[posicao + 1:]:
            for nome in (
                "abertura", "fechamento", "sabado", "domingo", "fdsCompleto", "horas",
                "periodo:Manhã", "periodo:Tarde", "periodo:Noite", "periodo:Fechamento",
            ):
                diferenca = model.new_int_var(0, 10_000_000, f"justica_{primeiro}_{segundo}_{nome}")
                adicionar(diferenca >= metricas_projetadas[(primeiro, nome)] - metricas_projetadas[(segundo, nome)])
                adicionar(diferenca >= metricas_projetadas[(segundo, nome)] - metricas_projetadas[(primeiro, nome)])
                termos_justica.append(diferenca)

    preferencias = payload.get("disponibilidades", [])
    preferencias_por_dia: dict[tuple[str, int], set[str]] = defaultdict(set)
    for item in preferencias:
        if item.get("disponivel") and item.get("periodo"):
            preferencias_por_dia[(str(item.get("funcionarioId")), int(item.get("diaSemana", -1)))].add(str(item.get("periodo")))
    mapa_periodo = {"Abertura": "Manhã", "Almoço": "Tarde", "Tarde": "Noite", "Fechamento": "Fechamento"}
    termos_preferencia = []
    padroes_anteriores = defaultdict(set)
    for item in payload.get("semanaAnterior", []):
        padroes_anteriores[str(item.get("funcionarioId", ""))].add(
            (int(item.get("diaSemana", -1)), str(item.get("periodo", "")))
        )
    for indice, candidato in enumerate(candidatos):
        declaradas = preferencias_por_dia.get((str(candidato["funcionarioId"]), int(candidato["diaSemana"])), set())
        convertidos = {mapa_periodo.get(periodo, periodo) for periodo in candidato.get("periodos", [])}
        if declaradas and "Total" not in declaradas and declaradas.isdisjoint(convertidos):
            termos_preferencia.append(x[indice])
        repeticoes = sum(
            1 for periodo in convertidos
            if (int(candidato["diaSemana"]), periodo) in padroes_anteriores[str(candidato["funcionarioId"])]
        )
        if repeticoes:
            termos_preferencia.append(repeticoes * x[indice])
    for funcionario_id in ids:
        for periodo in PERIODOS:
            indices_periodo = [
                indice for indice in por_funcionario[funcionario_id]
                if periodo in candidatos[indice].get("periodos", [])
            ]
            repeticao = model.new_int_var(0, 7, f"variedade_{funcionario_id}_{normalizar_funcao(periodo)}")
            adicionar(repeticao >= sum(x[indice] for indice in indices_periodo) - 1)
            termos_preferencia.append(repeticao)

    objetivos = [
        ("coberturaIdeal", sum(deficits)),
        ("excessoMaximo", sum(excessos)),
        ("horasExtras", sum(utilizacoes_extras)),
        ("carga", sum(desvios_carga)),
        ("justica", sum(termos_justica)),
        ("preferencias", sum(termos_preferencia)),
    ]
    limite_segundos = max(0.001, int(payload.get("limiteTempoMs", 10_000)) / 1000)
    completos: list[str] = []
    melhor_ids: list[str] = []
    status_final = "unknown"
    for nome, objetivo in objetivos:
        restante = limite_segundos - (time.perf_counter() - inicio)
        if restante <= 0:
            break
        model.minimize(objetivo)
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = restante
        solver.parameters.num_search_workers = 1
        solver.parameters.random_seed = seed
        status = solver.solve(model)
        if status == cp_model.INFEASIBLE:
            return resposta_vazia("infeasible", inicio, len(x), constraints, seed, "CP-SAT comprovou inviabilidade.")
        if status == cp_model.MODEL_INVALID:
            return resposta_vazia("model_invalid", inicio, len(x), constraints, seed, "Modelo CP-SAT inválido.")
        if status not in (cp_model.FEASIBLE, cp_model.OPTIMAL):
            break
        melhor_ids = [candidatos[i]["id"] for i in range(len(x)) if solver.value(x[i])]
        status_final = "optimal" if status == cp_model.OPTIMAL else "feasible"
        if status != cp_model.OPTIMAL:
            break
        valor_otimo = int(round(solver.objective_value))
        adicionar(objetivo == valor_otimo)
        completos.append(nome)

    if not melhor_ids:
        return resposta_vazia("unknown", inicio, len(x), constraints, seed, "Nenhuma solução encontrada antes do limite.")
    if len(completos) < len(objetivos):
        status_final = "feasible"
    return {
        "status": status_final,
        "candidateIds": melhor_ids,
        "solveTimeMs": round((time.perf_counter() - inicio) * 1000, 2),
        "variables": len(x),
        "constraints": constraints,
        "seed": seed,
        "completedStages": completos,
        "message": "Solução CP-SAT encontrada.",
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "CpSatShadow/1"

    def do_GET(self):
        if self.path != "/health":
            self.send_error(404)
            return
        self._json(200, {"status": "ok"})

    def do_POST(self):
        if self.path != "/solve":
            self.send_error(404)
            return
        token = os.environ.get("CP_SAT_SERVICE_TOKEN")
        authorization = self.headers.get("authorization", "")
        if token and not hmac.compare_digest(authorization, f"Bearer {token}"):
            self._json(401, {"error": "unauthorized"})
            return
        tamanho = int(self.headers.get("content-length", "0"))
        if tamanho <= 0 or tamanho > MAX_BODY_BYTES:
            self._json(413, {"error": "invalid_body_size"})
            return
        try:
            payload = json.loads(self.rfile.read(tamanho))
            self._json(200, resolver(payload))
        except (ValueError, TypeError, KeyError) as erro:
            self._json(400, {"error": "invalid_payload", "message": str(erro)[:200]})
        except Exception as erro:  # serviço isolado: não derruba o SaaS
            self._json(500, {"error": "solver_error", "message": str(erro)[:200]})

    def log_message(self, formato, *args):
        print(f"[CP-SAT] {self.address_string()} {formato % args}")

    def _json(self, status: int, corpo: dict[str, Any]):
        dados = json.dumps(corpo, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)


if __name__ == "__main__":
    host = os.environ.get("CP_SAT_HOST", "127.0.0.1")
    port = int(os.environ.get("CP_SAT_PORT", "8765"))
    print(f"CP-SAT shadow service em http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
