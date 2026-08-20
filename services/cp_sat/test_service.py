import unittest

from service import resolver


def candidato(identificador, funcionario, dia, inicio, fim, funcao="Cozinha", abertura=True, fechamento=True):
    return {
        "id": identificador,
        "funcionarioId": funcionario,
        "diaSemana": dia,
        "zonaId": "cozinha",
        "funcao": funcao,
        "inicio": dia * 1440 + inicio,
        "fim": dia * 1440 + fim,
        "duracao": fim - inicio,
        "periodos": ["Abertura", "Almoço", "Tarde", "Fechamento"],
        "cobreAbertura": abertura,
        "cobreFechamento": fechamento,
    }


def payload_base():
    return {
        "semana": "2026-08-24",
        "limiteTempoMs": 2000,
        "limiteDiarioAutomaticoMinutos": 540,
        "diasAbertos": [0],
        "horarios": [{"diaSemana": 0, "fechado": False, "abertura": "09:00", "fechamento": "17:00"}],
        "restaurante": {
            "usaZonas": True,
            "permiteHorarioRepartido": True,
            "permiteHorasExtras": False,
            "limiteHorasExtrasSemanais": 0,
        },
        "zonas": [{"id": "cozinha", "capacidadeMinima": 1}],
        "movimentos": [],
        "funcionarios": [{
            "id": "maria",
            "funcao": "Cozinha",
            "zonaId": "cozinha",
            "cargaAlvoMinutos": 480,
            "limiteAutomaticoMinutos": 480,
            "horasExtrasPermitidasMinutos": 0,
            "aceitaHorasExtras": False,
            "aceitaHorarioRepartido": True,
        }],
        "candidatos": [candidato("c0", "maria", 0, 540, 1020)],
        "necessidades": [{
            "diaSemana": 0,
            "periodo": periodo,
            "zonaId": "cozinha",
            "funcao": "Cozinha",
            "minimo": 1,
            "ideal": 1,
            "maximo": 1,
        } for periodo in ("Abertura", "Almoço", "Tarde", "Fechamento")],
        "disponibilidades": [],
        "historico": [],
        "semanaAnterior": [],
        "fronteiraAnterior": {"ultimosFins": {}, "diasTrabalhados": {}},
    }


class CpSatServiceTest(unittest.TestCase):
    def test_solucao_simples_valida(self):
        resultado = resolver(payload_base())
        self.assertIn(resultado["status"], ("optimal", "feasible"))
        self.assertEqual(resultado["candidateIds"], ["c0"])

    def test_minimo_e_funcao_sao_hard_constraints(self):
        minimo = payload_base()
        minimo["necessidades"][0]["minimo"] = 2
        self.assertEqual(resolver(minimo)["status"], "infeasible")

        funcao = payload_base()
        funcao["necessidades"][0]["funcao"] = "Sala"
        self.assertEqual(resolver(funcao)["status"], "infeasible")

    def test_abertura_e_fechamento_sao_obrigatorios(self):
        payload = payload_base()
        payload["candidatos"][0]["cobreAbertura"] = False
        self.assertEqual(resolver(payload)["status"], "infeasible")
        payload = payload_base()
        payload["candidatos"][0]["cobreFechamento"] = False
        self.assertEqual(resolver(payload)["status"], "infeasible")

    def test_descanso_de_onze_horas(self):
        payload = payload_base()
        payload["diasAbertos"] = [0, 1]
        payload["horarios"] = [
            {"diaSemana": 0, "fechado": False, "abertura": "15:00", "fechamento": "23:00"},
            {"diaSemana": 1, "fechado": False, "abertura": "09:00", "fechamento": "17:00"},
        ]
        payload["candidatos"] = [
            candidato("d0", "maria", 0, 900, 1380),
            candidato("d1", "maria", 1, 540, 1020),
        ]
        payload["necessidades"] = [
            {**item, "diaSemana": dia}
            for dia in (0, 1)
            for item in payload["necessidades"]
        ]
        self.assertEqual(resolver(payload)["status"], "infeasible")

    def test_maximo_seis_dias(self):
        payload = payload_base()
        payload["diasAbertos"] = list(range(7))
        payload["horarios"] = [
            {"diaSemana": dia, "fechado": False, "abertura": "09:00", "fechamento": "17:00"}
            for dia in range(7)
        ]
        payload["candidatos"] = [
            candidato(f"d{dia}", "maria", dia, 540, 1020) for dia in range(7)
        ]
        payload["necessidades"] = [
            {**item, "diaSemana": dia}
            for dia in range(7)
            for item in payload["necessidades"]
        ]
        self.assertEqual(resolver(payload)["status"], "infeasible")

    def test_fechamento_meia_noite_e_apos_meia_noite(self):
        for fim in (1440, 1500):
            payload = payload_base()
            payload["horarios"] = [{
                "diaSemana": 0,
                "fechado": False,
                "abertura": "18:00",
                "fechamento": "00:00" if fim == 1440 else "01:00",
            }]
            payload["candidatos"] = [candidato("noite", "maria", 0, 1080, fim)]
            resultado = resolver(payload)
            self.assertIn(resultado["status"], ("optimal", "feasible"))

    def test_fronteira_da_semana_anterior(self):
        payload = payload_base()
        payload["fronteiraAnterior"] = {
            "ultimosFins": {"maria": 60},
            "diasTrabalhados": {"maria": [-6, -5, -4, -3, -2, -1]},
        }
        self.assertEqual(resolver(payload)["status"], "infeasible")

    def test_limite_semanal_e_hard_constraint_em_minutos(self):
        payload = payload_base()
        payload["funcionarios"][0]["cargaAlvoMinutos"] = 420
        payload["funcionarios"][0]["limiteAutomaticoMinutos"] = 479
        self.assertEqual(resolver(payload)["status"], "infeasible")

        payload["funcionarios"][0]["limiteAutomaticoMinutos"] = 480
        self.assertIn(resolver(payload)["status"], ("optimal", "feasible"))

    def test_uma_ou_duas_horas_extras_so_quando_refletidas_no_limite(self):
        payload = payload_base()
        payload["funcionarios"][0].update({
            "cargaAlvoMinutos": 360,
            "aceitaHorasExtras": True,
            "horasExtrasPermitidasMinutos": 120,
            "limiteAutomaticoMinutos": 480,
        })
        self.assertIn(resolver(payload)["status"], ("optimal", "feasible"))

        payload["funcionarios"][0]["horasExtrasPermitidasMinutos"] = 60
        payload["funcionarios"][0]["limiteAutomaticoMinutos"] = 420
        self.assertEqual(resolver(payload)["status"], "infeasible")

    def test_part_time_vinte_mais_duas_nao_aceita_excesso(self):
        payload = payload_base()
        payload["diasAbertos"] = [0, 1, 2]
        payload["horarios"] = [
            {"diaSemana": dia, "fechado": False, "abertura": "09:00", "fechamento": "17:00"}
            for dia in range(3)
        ]
        payload["candidatos"] = [
            candidato("d0", "maria", 0, 540, 1020),
            candidato("d1", "maria", 1, 540, 1020),
            candidato("d2", "maria", 2, 540, 900),
        ]
        payload["necessidades"] = [
            {**item, "diaSemana": dia}
            for dia in range(3)
            for item in payload["necessidades"]
        ]
        payload["funcionarios"][0].update({
            "cargaAlvoMinutos": 1200,
            "aceitaHorasExtras": True,
            "horasExtrasPermitidasMinutos": 120,
            "limiteAutomaticoMinutos": 1320,
        })
        payload["candidatos"][2]["duracaoEfetiva"] = 361
        self.assertEqual(resolver(payload)["status"], "infeasible")

        payload["candidatos"][2]["duracaoEfetiva"] = 360
        self.assertIn(resolver(payload)["status"], ("optimal", "feasible"))

    def test_limite_diario_em_minutos(self):
        payload = payload_base()
        payload["funcionarios"][0]["limiteAutomaticoMinutos"] = 2000
        payload["candidatos"][0]["duracaoEfetiva"] = 541
        self.assertEqual(resolver(payload)["status"], "infeasible")
        payload["candidatos"][0]["duracaoEfetiva"] = 540
        self.assertIn(resolver(payload)["status"], ("optimal", "feasible"))

    def test_turno_quinze_ate_meia_noite_preserva_nove_horas(self):
        payload = payload_base()
        payload["horarios"][0].update({"abertura": "15:00", "fechamento": "00:00"})
        payload["candidatos"] = [candidato("meia-noite", "maria", 0, 900, 1440)]
        payload["funcionarios"][0]["cargaAlvoMinutos"] = 540
        payload["funcionarios"][0]["limiteAutomaticoMinutos"] = 540
        resultado = resolver(payload)
        self.assertIn(resultado["status"], ("optimal", "feasible"))


if __name__ == "__main__":
    unittest.main()
