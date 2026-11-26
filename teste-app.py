import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import app


class TestCalcular(unittest.TestCase):
    def test_soma(self):
        r = app.calcular({"op": "soma", "A": [["1", "2"], ["3", "4"]], "B": [["5", "6"], ["7", "8"]]})
        self.assertEqual(r["matriz"], [["6", "8"], ["10", "12"]])

    def test_campo_vazio_vale_zero(self):
        r = app.calcular({"op": "soma", "A": [["", "1/2"]], "B": [["1", "1/2"]]})
        self.assertEqual(r["matriz"], [["1", "1"]])

    def test_soma_ordens_diferentes(self):
        with self.assertRaises(app.ErroEntrada):
            app.calcular({"op": "soma", "A": [["1"]], "B": [["1", "2"]]})

    def test_escalar_com_virgula(self):
        r = app.calcular({"op": "escalar", "k": "0,5", "A": [["2", "4"]]})
        self.assertEqual(r["matriz"], [["1", "2"]])
        self.assertEqual(r["titulo"], "1/2 · A")

    def test_multiplicacao(self):
        r = app.calcular({"op": "multiplicacao", "A": [["1", "2"], ["3", "4"]], "B": [["5"], ["6"]]})
        self.assertEqual(r["matriz"], [["17"], ["39"]])

    def test_multiplicacao_incompativel(self):
        with self.assertRaises(app.ErroEntrada):
            app.calcular({"op": "multiplicacao", "A": [["1", "2"]], "B": [["1", "2"]]})

    def test_transposta(self):
        r = app.calcular({"op": "transposta", "A": [["1", "2", "3"]]})
        self.assertEqual(r["matriz"], [["1"], ["2"], ["3"]])

    def test_inversa(self):
        r = app.calcular({"op": "inversa", "A": [["2", "0"], ["0", "4"]]})
        self.assertEqual(r["matriz"], [["1/2", "0"], ["0", "1/4"]])

    def test_inversa_singular(self):
        r = app.calcular({"op": "inversa", "A": [["1", "2"], ["2", "4"]]})
        self.assertEqual(r["tipo"], "aviso")

    def test_valor_invalido(self):
        with self.assertRaises(app.ErroEntrada) as ctx:
            app.calcular({"op": "transposta", "A": [["1/0"]]})
        self.assertIn("A[1][1]", str(ctx.exception))

    def test_sistema_spd(self):
        r = app.calcular({"op": "sistema", "S": [["1", "1", "3"], ["1", "-1", "-1"]]})
        self.assertEqual(r["classificacao"], "SPD")
        self.assertEqual(r["solucao"], ["x1 = 1", "x2 = 2"])
        self.assertTrue(all(v["ok"] for v in r["verificacao"]))

    def test_sistema_spi(self):
        r = app.calcular({"op": "sistema", "S": [["1", "1", "2"], ["2", "2", "4"]]})
        self.assertEqual(r["classificacao"], "SPI")
        self.assertEqual(r["solucao"], ["x2 = t1", "x1 = 2 - t1"])
        self.assertEqual(r["exemplo"], "x1 = 2, x2 = 0")

    def test_sistema_si(self):
        r = app.calcular({"op": "sistema", "S": [["1", "1", "2"], ["1", "1", "3"]]})
        self.assertEqual(r["classificacao"], "SI")
        self.assertEqual(r["posto_a"], 1)
        self.assertEqual(r["posto_aug"], 2)


class TestServidor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.servidor = ThreadingHTTPServer(("127.0.0.1", 0), app.Manipulador)
        cls.url = f"http://127.0.0.1:{cls.servidor.server_address[1]}"
        threading.Thread(target=cls.servidor.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.servidor.shutdown()
        cls.servidor.server_close()

    def post(self, corpo):
        req = urllib.request.Request(
            self.url + "/api/calcular",
            data=json.dumps(corpo).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_pagina(self):
        with urllib.request.urlopen(self.url + "/") as resp:
            self.assertIn("Calculadora de Matrizes", resp.read().decode())

    def test_api_ok(self):
        status, dados = self.post({"op": "transposta", "A": [["1", "2"]]})
        self.assertEqual(status, 200)
        self.assertTrue(dados["ok"])
        self.assertEqual(dados["matriz"], [["1"], ["2"]])

    def test_api_erro(self):
        status, dados = self.post({"op": "transposta", "A": [["abc"]]})
        self.assertEqual(status, 400)
        self.assertFalse(dados["ok"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
