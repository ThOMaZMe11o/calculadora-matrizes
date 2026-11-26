"""
Interface web da calculadora de matrizes.

Todo o cálculo é feito pelas funções de calc.py; este arquivo só recebe os
valores digitados na página, chama essas funções e devolve o resultado em JSON.

Uso:
    python app.py          (abre em http://127.0.0.1:8000)
    python app.py 8080     (usa outra porta)
"""
import json
import sys
import threading
import webbrowser
from fractions import Fraction
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import calc

PASTA_WEB = Path(__file__).resolve().parent / "web"
ORDEM_MAXIMA = 10
TAMANHO_MAXIMO_PEDIDO = 100_000


class ErroEntrada(ValueError):
    """Erro causado por um valor digitado pelo usuário."""


# ---------------------------------------------------------------
# Conversão dos dados que chegam da página
# ---------------------------------------------------------------
def ler_valor(txt, onde):
    """Mesmo formato aceito por calc.ler_numero. Campo vazio vale 0."""
    txt = str(txt).strip().replace(",", ".")
    if txt in ("", "-"):
        return Fraction(0)
    try:
        return Fraction(txt)
    except (ValueError, ZeroDivisionError):
        raise ErroEntrada(
            f"Valor inválido em {onde}: “{txt}”. Use inteiro, decimal ou fração (ex.: 2, 1.5, 1/3)."
        ) from None


def ler_matriz(dados, nome, rotulo=None):
    """Converte uma lista de listas de textos em uma matriz de Fraction."""
    if rotulo is None:
        rotulo = lambda i, j: f"{nome}[{i + 1}][{j + 1}]"  # noqa: E731
    if not isinstance(dados, list) or not dados or not all(isinstance(l, list) and l for l in dados):
        raise ErroEntrada(f"A matriz {nome} está vazia.")
    colunas = len(dados[0])
    if any(len(linha) != colunas for linha in dados):
        raise ErroEntrada(f"As linhas da matriz {nome} têm tamanhos diferentes.")
    if len(dados) > ORDEM_MAXIMA or colunas > ORDEM_MAXIMA + 1:
        raise ErroEntrada(f"A matriz {nome} pode ter no máximo {ORDEM_MAXIMA} linhas e colunas.")
    return [[ler_valor(x, rotulo(i, j)) for j, x in enumerate(linha)] for i, linha in enumerate(dados)]


def tabela(m):
    return [[calc.fmt(x) for x in linha] for linha in m]


# ---------------------------------------------------------------
# Sistema linear: mesma lógica de calc.resolver_sistema, mas
# devolvendo os passos como dados em vez de imprimi-los.
# ---------------------------------------------------------------
def analisar_sistema(aug, n):
    red, pivos = calc.escalonar(aug, n)
    posto_a = len(pivos)
    impossivel = any(all(x == 0 for x in linha[:n]) and linha[n] != 0 for linha in red)
    posto_aug = posto_a + (1 if impossivel else 0)

    res = {
        "tipo": "sistema",
        "equacoes": [calc.formatar_equacao(linha[:n], linha[n]) for linha in aug],
        "aumentada": tabela(aug),
        "escalonada": tabela(red),
        "posto_a": posto_a,
        "posto_aug": posto_aug,
        "incognitas": n,
        "solucao": [],
        "verificacao": [],
        "exemplo": None,
    }

    if impossivel:
        res["classificacao"] = "SI"
        res["nome"] = "Sistema Impossível"
        res["explicacao"] = [
            "Surgiu uma linha do tipo 0 = b, com b diferente de zero.",
            "Isso é uma contradição, então o sistema não tem solução.",
        ]
        return res

    if posto_a == n:
        solucao = [None] * n
        for k, c in enumerate(pivos):
            solucao[c] = red[k][n]
        res["classificacao"] = "SPD"
        res["nome"] = "Sistema Possível e Determinado"
        res["explicacao"] = ["Há um pivô para cada incógnita, então existe exatamente uma solução."]
        res["solucao"] = [f"x{c + 1} = {calc.fmt(solucao[c])}" for c in pivos]
        for linha in aug:
            lhs = sum(linha[j] * solucao[j] for j in range(n))
            res["verificacao"].append(
                {"texto": f"{calc.fmt(lhs)} = {calc.fmt(linha[n])}", "ok": lhs == linha[n]}
            )
        return res

    livres = [j for j in range(n) if j not in pivos]
    nomes_livres = {j: f"t{k + 1}" for k, j in enumerate(livres)}
    res["classificacao"] = "SPI"
    res["nome"] = "Sistema Possível e Indeterminado"
    res["explicacao"] = [
        f"Há menos pivôs que incógnitas: {len(livres)} variável(is) não tem pivô.",
        "Ela(s) pode(m) assumir qualquer valor, então há infinitas soluções.",
    ]
    for j in livres:
        res["solucao"].append(f"x{j + 1} = {nomes_livres[j]}")
    for k, c in enumerate(pivos):
        expressao = calc.fmt(red[k][n])
        for j in livres:
            coef = -red[k][j]
            if coef == 0:
                continue
            modulo = abs(coef)
            parte = nomes_livres[j] if modulo == 1 else f"{calc.fmt(modulo)}*{nomes_livres[j]}"
            expressao += f" {'-' if coef < 0 else '+'} {parte}"
        res["solucao"].append(f"x{c + 1} = {expressao}")

    exemplo = {c: red[k][n] for k, c in enumerate(pivos)}
    for j in livres:
        exemplo[j] = Fraction(0)
    res["exemplo"] = ", ".join(f"x{j + 1} = {calc.fmt(exemplo[j])}" for j in range(n))
    return res


# ---------------------------------------------------------------
# Operações (mesmas do menu de calc.py)
# ---------------------------------------------------------------
def calcular(pedido):
    op = pedido.get("op")

    if op == "soma":
        a = ler_matriz(pedido.get("A"), "A")
        b = ler_matriz(pedido.get("B"), "B")
        if len(a) != len(b) or len(a[0]) != len(b[0]):
            raise ErroEntrada("A e B precisam ter a mesma ordem.")
        return {"tipo": "matriz", "titulo": "A + B", "matriz": tabela(calc.somar(a, b))}

    if op == "escalar":
        k = ler_valor(pedido.get("k", ""), "escalar k")
        a = ler_matriz(pedido.get("A"), "A")
        return {
            "tipo": "matriz",
            "titulo": f"{calc.fmt(k)} · A",
            "matriz": tabela(calc.multiplicar_escalar(k, a)),
        }

    if op == "multiplicacao":
        a = ler_matriz(pedido.get("A"), "A")
        b = ler_matriz(pedido.get("B"), "B")
        if len(a[0]) != len(b):
            raise ErroEntrada(f"B precisa ter {len(a[0])} linha(s) para o produto A × B existir.")
        return {"tipo": "matriz", "titulo": "A × B", "matriz": tabela(calc.multiplicar(a, b))}

    if op == "transposta":
        a = ler_matriz(pedido.get("A"), "A")
        return {"tipo": "matriz", "titulo": "Aᵀ", "matriz": tabela(calc.transpor(a))}

    if op == "inversa":
        a = ler_matriz(pedido.get("A"), "A")
        if len(a) != len(a[0]):
            raise ErroEntrada("A inversa só existe para matrizes quadradas.")
        inv = calc.inversa(a)
        if inv is None:
            return {
                "tipo": "aviso",
                "titulo": "A⁻¹",
                "aviso": "Sem inversa",
                "mensagem": "A matriz não possui inversa (determinante igual a zero).",
            }
        return {"tipo": "matriz", "titulo": "A⁻¹", "matriz": tabela(inv)}

    if op == "sistema":
        dados = pedido.get("S")
        n = len(dados[0]) - 1 if isinstance(dados, list) and dados and isinstance(dados[0], list) else 0
        if n < 1:
            raise ErroEntrada("O sistema precisa ter pelo menos uma incógnita.")

        def rotulo(i, j):
            return f"equação {i + 1}, " + ("termo independente" if j == n else f"coeficiente de x{j + 1}")

        aug = ler_matriz(dados, "do sistema", rotulo)
        return analisar_sistema(aug, n)

    raise ErroEntrada("Operação desconhecida.")


# ---------------------------------------------------------------
# Servidor HTTP
# ---------------------------------------------------------------
class Manipulador(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PASTA_WEB), **kwargs)

    def do_POST(self):
        if self.path != "/api/calcular":
            self.send_error(404)
            return
        try:
            tamanho = int(self.headers.get("Content-Length") or 0)
            if tamanho > TAMANHO_MAXIMO_PEDIDO:
                raise ErroEntrada("Pedido grande demais.")
            pedido = json.loads(self.rfile.read(tamanho) or b"{}")
            if not isinstance(pedido, dict):
                raise ErroEntrada("Pedido inválido.")
            corpo, status = {"ok": True, **calcular(pedido)}, 200
        except ErroEntrada as e:
            corpo, status = {"ok": False, "erro": str(e)}, 400
        except (ValueError, json.JSONDecodeError):
            corpo, status = {"ok": False, "erro": "Pedido inválido."}, 400

        dados = json.dumps(corpo, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, formato, *args):
        pass  # não polui o terminal com cada requisição


def main():
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    servidor = ThreadingHTTPServer(("127.0.0.1", porta), Manipulador)
    url = f"http://127.0.0.1:{porta}"
    print(f"Calculadora de matrizes rodando em {url}")
    print("Pressione Ctrl+C para encerrar.")
    threading.Timer(0.5, webbrowser.open, args=[url]).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nAté mais!")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
