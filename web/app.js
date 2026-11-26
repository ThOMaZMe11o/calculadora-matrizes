'use strict';

/*
 * Interface da calculadora de matrizes.
 * A página só coleta os valores; quem calcula é o calc.py (via app.py).
 *
 * Cada operação é uma sequência de "etapas", na mesma ordem em que o calc.py
 * pede os dados no terminal:
 *   escalar -> o número k
 *   dims    -> a ordem de uma matriz (linhas × colunas)
 *   mat     -> os elementos de uma matriz
 */

const ORDEM_MAXIMA = 10;
const MAX_CARACTERES = 18;

const OPERACOES = {
  soma: {
    nome: 'Soma',
    etapas: [{ tipo: 'dims', m: 'A' }, { tipo: 'mat', m: 'A' }, { tipo: 'mat', m: 'B' }],
  },
  escalar: {
    nome: 'Multiplicação escalar',
    etapas: [{ tipo: 'escalar' }, { tipo: 'dims', m: 'A' }, { tipo: 'mat', m: 'A' }],
  },
  multiplicacao: {
    nome: 'Multiplicação',
    etapas: [
      { tipo: 'dims', m: 'A' },
      { tipo: 'mat', m: 'A' },
      { tipo: 'dims', m: 'B' },
      { tipo: 'mat', m: 'B' },
    ],
  },
  transposta: {
    nome: 'Transposta',
    etapas: [{ tipo: 'dims', m: 'A' }, { tipo: 'mat', m: 'A' }],
  },
  inversa: {
    nome: 'Inversa',
    etapas: [{ tipo: 'dims', m: 'A' }, { tipo: 'mat', m: 'A' }],
  },
  sistema: {
    nome: 'Sistema linear',
    etapas: [{ tipo: 'dims', m: 'S' }, { tipo: 'mat', m: 'S' }],
  },
};

const estado = {
  op: 'soma',
  etapa: 0,
  campo: 'r', // 'k' | 'r' | 'c' | [linha, coluna]
  novo: true, // o próximo dígito substitui o valor (como numa calculadora)
  k: '',
  dims: { A: { r: '2', c: '2' }, B: { r: '2', c: '2' }, S: { r: '2', c: '2' } },
  cel: { A: [], B: [], S: [] },
  resultado: null,
  erro: '',
  ocupado: false,
};

const display = document.getElementById('display');
const teclaLimpar = document.getElementById('tecla-limpar');

// ---------------------------------------------------------------
// Ordem das matrizes
// ---------------------------------------------------------------
function inteiro(txt) {
  const n = parseInt(txt, 10);
  return Number.isNaN(n) ? 1 : Math.min(Math.max(n, 1), ORDEM_MAXIMA);
}

function ordem(m) {
  const d = estado.dims;
  if (m === 'S') return { r: inteiro(d.S.r), c: inteiro(d.S.c) + 1 };
  if (m === 'A') {
    const r = inteiro(d.A.r);
    return { r, c: estado.op === 'inversa' ? r : inteiro(d.A.c) };
  }
  // B
  if (estado.op === 'soma') return ordem('A'); // mesma ordem de A
  return { r: ordem('A').c, c: inteiro(d.B.c) }; // multiplicação: linhas de B = colunas de A
}

function camposDims(m) {
  if (m === 'B') return ['c'];
  if (m === 'A' && estado.op === 'inversa') return ['r'];
  return ['r', 'c'];
}

function etapas() {
  return OPERACOES[estado.op].etapas;
}

function campos(et) {
  if (et.tipo === 'escalar') return ['k'];
  if (et.tipo === 'dims') return camposDims(et.m);
  const { r, c } = ordem(et.m);
  const lista = [];
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) lista.push([i, j]);
  return lista;
}

function mesmoCampo(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------
// Leitura e escrita de valores
// ---------------------------------------------------------------
function lerCampo(et, campo) {
  if (et.tipo === 'escalar') return estado.k;
  if (et.tipo === 'dims') return estado.dims[et.m][campo];
  const [i, j] = campo;
  return (estado.cel[et.m][i] && estado.cel[et.m][i][j]) || '';
}

function escreverCampo(et, campo, valor) {
  if (et.tipo === 'escalar') estado.k = valor;
  else if (et.tipo === 'dims') estado.dims[et.m][campo] = valor;
  else {
    const [i, j] = campo;
    const linhas = estado.cel[et.m];
    while (linhas.length <= i) linhas.push([]);
    linhas[i][j] = valor;
  }
}

function etapaAtual() {
  return etapas()[estado.etapa];
}

function valorAtual() {
  return lerCampo(etapaAtual(), estado.campo);
}

function matrizTexto(m) {
  const { r, c } = ordem(m);
  return Array.from({ length: r }, (_, i) =>
    Array.from({ length: c }, (_, j) => lerCampo({ tipo: 'mat', m }, [i, j]))
  );
}

// mesmo formato aceito pelo calc.py: inteiro, decimal ou fração
const NUMERO_VALIDO = /^-?(\d+\/\d+|\d+(,\d*)?|,\d+)$/;

function valido(txt) {
  if (txt === '' || txt === '-') return true;
  if (!NUMERO_VALIDO.test(txt)) return false;
  return !/\/0+$/.test(txt);
}

function paraNumero(txt) {
  if (txt === '' || txt === '-') return 0;
  const t = txt.replace(',', '.');
  if (t.includes('/')) {
    const [a, b] = t.split('/');
    return Number(a) / Number(b);
  }
  return Number(t);
}

// ---------------------------------------------------------------
// Navegação entre campos e etapas
// ---------------------------------------------------------------
/** Ao sair de um campo de ordem, deixa o valor entre 1 e ORDEM_MAXIMA. */
function sairDoCampo() {
  const et = etapaAtual();
  if (!et || et.tipo !== 'dims') return;
  const bruto = estado.dims[et.m][estado.campo];
  const n = parseInt(bruto, 10);
  const ajustado = String(inteiro(bruto));
  if (bruto !== '' && (Number.isNaN(n) || n < 1 || n > ORDEM_MAXIMA)) {
    estado.erro = `A ordem precisa estar entre 1 e ${ORDEM_MAXIMA}.`;
  }
  estado.dims[et.m][estado.campo] = ajustado;
}

function focar(etapa, campo) {
  estado.etapa = etapa;
  estado.campo = campo;
  estado.novo = true;
}

function irPara(etapa, campo) {
  sairDoCampo();
  focar(etapa, campo === undefined ? campos(etapas()[etapa])[0] : campo);
}

function proximo() {
  sairDoCampo();
  const lista = campos(etapaAtual());
  const idx = lista.findIndex((c) => mesmoCampo(c, estado.campo));
  if (idx < lista.length - 1) return focar(estado.etapa, lista[idx + 1]);
  proximaEtapa(false);
}

function anterior() {
  sairDoCampo();
  const lista = campos(etapaAtual());
  const idx = lista.findIndex((c) => mesmoCampo(c, estado.campo));
  if (idx > 0) return focar(estado.etapa, lista[idx - 1]);
  if (estado.etapa > 0) {
    const anteriorLista = campos(etapas()[estado.etapa - 1]);
    focar(estado.etapa - 1, anteriorLista[anteriorLista.length - 1]);
  }
}

function proximaEtapa(calcularNoFim = true) {
  sairDoCampo();
  if (estado.etapa < etapas().length - 1) {
    const prox = estado.etapa + 1;
    return focar(prox, campos(etapas()[prox])[0]);
  }
  if (calcularNoFim) calcular();
}

function moverVertical(delta) {
  const et = etapaAtual();
  if (et.tipo !== 'mat') return;
  const [i, j] = estado.campo;
  const ni = i + delta;
  if (ni >= 0 && ni < ordem(et.m).r) focar(estado.etapa, [ni, j]);
}

// ---------------------------------------------------------------
// Digitação
// ---------------------------------------------------------------
function digitar(ch) {
  const et = etapaAtual();
  let v = estado.novo ? '' : valorAtual();

  if (et.tipo === 'dims') {
    if (!/\d/.test(ch)) return;
    v = (v + ch).replace(/^0+(?=\d)/, '').slice(0, 2);
  } else if (/\d/.test(ch)) {
    if (v.length >= MAX_CARACTERES) return;
    if (v === '0') v = '';
    else if (v === '-0') v = '-';
    else if (/\/0$/.test(v) && ch === '0') return;
    v += ch;
  } else if (ch === ',') {
    if (v.includes(',') || v.includes('/')) return;
    v += v === '' || v === '-' ? '0,' : ',';
  } else if (ch === '/') {
    if (v.includes('/') || v.includes(',') || !/\d$/.test(v)) return;
    v += '/';
  }

  escreverCampo(et, estado.campo, v);
  estado.novo = false;
}

function trocarSinal() {
  const et = etapaAtual();
  if (et.tipo === 'dims') return;
  const v = valorAtual();
  escreverCampo(et, estado.campo, v.startsWith('-') ? v.slice(1) : '-' + v);
  estado.novo = false;
}

function apagar() {
  const et = etapaAtual();
  escreverCampo(et, estado.campo, valorAtual().slice(0, -1));
  estado.novo = false;
}

/** "C" limpa só o campo atual; "AC" limpa todos os valores da operação. */
function limpar(tudo = false) {
  if (!tudo && valorAtual() !== '' && etapaAtual().tipo !== 'dims') {
    escreverCampo(etapaAtual(), estado.campo, '');
    estado.novo = true;
    return;
  }
  estado.k = '';
  for (const et of etapas()) if (et.tipo === 'mat') estado.cel[et.m] = [];
  irPara(0);
}

function escolherOperacao(op) {
  sairDoCampo();
  estado.op = op;
  estado.resultado = null;
  estado.erro = '';
  focar(0, campos(etapas()[0])[0]);
}

// ---------------------------------------------------------------
// Cálculo (feito pelo calc.py no servidor)
// ---------------------------------------------------------------
async function calcular() {
  if (estado.ocupado) return;
  sairDoCampo();

  const pedido = { op: estado.op };
  for (const et of etapas()) {
    if (et.tipo === 'mat') pedido[et.m] = matrizTexto(et.m);
    if (et.tipo === 'escalar') pedido.k = estado.k;
  }

  estado.ocupado = true;
  estado.erro = '';
  render();
  try {
    const resp = await fetch('/api/calcular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido),
    });
    const dados = await resp.json();
    if (dados.ok) estado.resultado = dados;
    else estado.erro = dados.erro;
  } catch {
    estado.erro = 'Não foi possível falar com o servidor. Rode "python app.py" e abra o endereço mostrado.';
  } finally {
    estado.ocupado = false;
    render();
  }
}

// ---------------------------------------------------------------
// Desenho do display
// ---------------------------------------------------------------
function esc(txt) {
  return String(txt).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** x1 -> x₁ (em HTML), mantendo o resto do texto escapado. */
function comIndices(txt) {
  return esc(txt).replace(/([xt])(\d+)/g, '$1<sub>$2</sub>');
}

/** "-3/4" vira uma fração empilhada. */
function numeroHtml(txt) {
  const m = /^(-?)(\d+)\/(\d+)$/.exec(txt);
  if (!m) return esc(txt);
  return `${m[1] ? '−' : ''}<span class="frac"><span>${m[2]}</span><span>${m[3]}</span></span>`;
}

function tamanhoGrande(txt) {
  const n = txt.length;
  if (n <= 6) return 84;
  if (n <= 8) return 68;
  if (n <= 10) return 56;
  if (n <= 13) return 44;
  return 36;
}

function tamanhoCelula(colunas) {
  if (colunas <= 3) return 24;
  if (colunas <= 4) return 20;
  if (colunas <= 6) return 17;
  return 14;
}

function nomeMatriz(m) {
  return m === 'S' ? 'Sistema' : m;
}

function htmlTrilha() {
  const chips = etapas().map((et, i) => {
    const classe = estado.resultado ? 'feito' : i === estado.etapa ? 'ativo' : i < estado.etapa ? 'feito' : '';
    let rotulo;
    if (et.tipo === 'escalar') rotulo = 'k';
    else if (et.tipo === 'dims') rotulo = `Ordem ${et.m === 'S' ? '' : et.m}`.trim();
    else {
      const { r, c } = ordem(et.m);
      rotulo = et.m === 'S' ? 'Equações' : `${et.m} ${r}×${c}`;
    }
    return `<button class="chip ${classe}" data-etapa="${i}">${esc(rotulo)}</button>`;
  });
  chips.push(`<button class="chip ${estado.resultado ? 'ativo' : ''}" data-calcular>=</button>`);
  return `<div class="trilha">${chips.join('')}</div>`;
}

function htmlLinhaGrande(valor, maximo = 84) {
  const vazio = valor === '';
  const texto = vazio ? '0' : valor;
  return `<div class="grande" style="font-size:${Math.min(tamanhoGrande(texto), maximo)}px">${
    vazio ? `<span class="placeholder">${esc(texto)}</span>` : esc(texto)
  }<span class="cursor"></span></div>`;
}

function htmlEscalar() {
  return `
    <div class="titulo">Multiplicação escalar · k · A</div>
    <div class="rotulo-campo">Escalar k</div>
    ${htmlLinhaGrande(estado.k)}`;
}

function htmlDims(et) {
  const d = estado.dims[et.m];
  const editaveis = camposDims(et.m);
  const unidades = et.m === 'S' ? ['equações', 'incógnitas'] : ['linhas', 'colunas'];

  const valores = { r: d.r, c: d.c };
  let dica = 'Digite a ordem e toque em ↵ para preencher a matriz.';
  let titulo = `Ordem da matriz ${et.m}`;
  if (et.m === 'S') {
    titulo = 'Tamanho do sistema linear';
    dica = 'Quantas equações e quantas incógnitas (x₁, x₂, …)?';
  } else if (et.m === 'A' && estado.op === 'inversa') {
    titulo = 'Ordem da matriz quadrada A (n × n)';
    valores.c = d.r;
  } else if (et.m === 'B') {
    valores.r = String(ordem('A').c);
    dica = `B precisa ter ${ordem('A').c} linha(s) para o produto A × B existir.`;
  }

  const botao = (campo, und) => {
    const ativo = mesmoCampo(estado.campo, campo);
    const travado = !editaveis.includes(campo);
    const v = valores[campo];
    const num = ativo && v === '' ? '<span class="cursor"></span>' : esc(v) + (ativo ? '<span class="cursor"></span>' : '');
    return `<button class="dim ${ativo ? 'ativo' : ''} ${travado ? 'travado' : ''}" ${
      travado ? 'disabled' : `data-campo='${JSON.stringify(campo)}'`
    }><span class="num">${num}</span><span class="und">${und}</span></button>`;
  };

  return `
    <div class="titulo">${esc(titulo)}</div>
    <div class="dims">${botao('r', unidades[0])}<span class="x">×</span>${botao('c', unidades[1])}</div>
    <div class="dica">${esc(dica)}</div>`;
}

function htmlGrade(linhas, { editavel = false, sistema = false } = {}) {
  const r = linhas.length;
  const c = linhas[0].length;
  const fonte = tamanhoCelula(c);
  let html = '';

  if (sistema) {
    for (let j = 0; j < c; j++) {
      const ultima = j === c - 1;
      html += `<div class="cab ${ultima ? 'termo' : ''}">${ultima ? 'b' : `x<sub>${j + 1}</sub>`}</div>`;
    }
  }

  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      const v = linhas[i][j];
      const classes = ['cel'];
      if (sistema && j === c - 1) classes.push('termo');
      if (editavel) {
        if (v === '') classes.push('vazia');
        else if (!valido(v)) classes.push('invalida');
        if (mesmoCampo(estado.campo, [i, j])) classes.push('ativa');
        html += `<button class="${classes.join(' ')}" data-campo='${JSON.stringify([i, j])}'>${
          v === '' ? '0' : esc(v)
        }</button>`;
      } else {
        classes.push('res');
        html += `<div class="${classes.join(' ')}">${numeroHtml(v)}</div>`;
      }
    }
  }

  return `<div class="matriz-rolagem"><div class="matriz" style="grid-template-columns:repeat(${c}, auto);font-size:${fonte}px">${html}</div></div>`;
}

/** Prévia das equações enquanto o sistema é digitado (como a confirmação do calc.py). */
function equacaoPrevia(linha) {
  const n = linha.length - 1;
  const partes = [];
  for (let j = 0; j < n; j++) {
    const v = linha[j];
    if (paraNumero(v) === 0 || !valido(v)) continue;
    const negativo = v.startsWith('-');
    const modulo = negativo ? v.slice(1) : v;
    const coef = paraNumero(modulo) === 1 ? '' : modulo;
    const sinal = partes.length === 0 ? (negativo ? '-' : '') : negativo ? '- ' : '+ ';
    partes.push(`${sinal}${coef}x${j + 1}`);
  }
  const termo = linha[n] === '' || linha[n] === '-' ? '0' : linha[n];
  return `${partes.length ? partes.join(' ') : '0'} = ${termo}`;
}

function htmlMatriz(et) {
  const { r, c } = ordem(et.m);
  const linhas = matrizTexto(et.m);
  const [i, j] = estado.campo;
  const sistema = et.m === 'S';

  let titulo = `Matriz ${et.m} · ${r}×${c}`;
  let rotulo = `${et.m}[${i + 1}][${j + 1}]`;
  let extra = '';
  if (sistema) {
    titulo = 'Coeficientes | termos independentes';
    rotulo = `Equação ${i + 1} · ${j === c - 1 ? 'termo independente' : `x<sub>${j + 1}</sub>`}`;
    extra = `<div class="passo">${linhas
      .map((l, k) => `<div class="linha fraca">(${k + 1})&nbsp; ${comIndices(equacaoPrevia(l))}</div>`)
      .join('')}</div>`;
  } else if (estado.op === 'soma' && et.m === 'B') {
    titulo += ' (mesma ordem de A)';
  }

  return `
    ${extra}
    <div class="titulo">${esc(titulo)}</div>
    ${htmlGrade(linhas, { editavel: true, sistema })}
    <div class="rotulo-campo">${sistema ? rotulo : esc(rotulo)}</div>
    ${htmlLinhaGrande(lerCampo(et, estado.campo), 64)}`;
}

function htmlResultadoSistema(res) {
  const n = res.incognitas;
  const passos = [];

  passos.push(`<div class="passo"><h3>Sistema digitado</h3>${res.equacoes
    .map((e, k) => `<div class="linha">(${k + 1})&nbsp; ${comIndices(e)}</div>`)
    .join('')}</div>`);
  passos.push(`<div class="passo"><h3>Passo 1 · Matriz aumentada [A | b]</h3>${htmlGrade(res.aumentada, { sistema: true })}</div>`);
  passos.push(`<div class="passo"><h3>Passo 2 · Escalonamento (Gauss-Jordan)</h3>
    <div class="linha fraca">Zeramos os demais elementos de cada coluna de pivô.</div>
    ${htmlGrade(res.escalonada, { sistema: true })}</div>`);
  passos.push(`<div class="passo"><h3>Passo 3 · Postos</h3>
    <div class="linha">posto(A) = ${res.posto_a}</div>
    <div class="linha">posto([A|b]) = ${res.posto_aug}</div>
    <div class="linha">incógnitas = ${n}</div></div>`);
  passos.push(`<div class="passo"><h3>Passo 4 · Classificação</h3>${res.explicacao
    .map((t) => `<div class="linha fraca">${esc(t)}</div>`)
    .join('')}</div>`);

  if (res.verificacao.length) {
    passos.push(`<div class="passo"><h3>Verificação nas equações originais</h3>${res.verificacao
      .map(
        (v, k) =>
          `<div class="linha">(${k + 1})&nbsp; ${esc(v.texto)}<span class="selo ${v.ok ? '' : 'falha'}">${
            v.ok ? 'OK' : 'ERRO'
          }</span></div>`
      )
      .join('')}</div>`);
  }

  if (res.solucao.length) {
    const spi = res.classificacao === 'SPI';
    let html = `<div class="passo"><h3>${spi ? 'Solução geral' : 'Solução'}</h3>${
      spi ? '<div class="linha fraca">t<sub>1</sub>, t<sub>2</sub>, … podem ser qualquer número real</div>' : ''
    }${res.solucao
      .map((s) => `<div class="linha">${comIndices(s)}</div>`)
      .join('')}`;
    if (res.exemplo) {
      html += `<div class="linha fraca">Exemplo (t = 0): ${comIndices(res.exemplo)}</div>`;
    }
    passos.push(html + '</div>');
  }

  return `
    ${passos.join('')}
    <div class="classificacao">${esc(res.nome)}</div>
    <div class="grande" style="font-size:84px">${esc(res.classificacao)}</div>`;
}

function htmlResultado() {
  const res = estado.resultado;
  if (res.tipo === 'sistema') return htmlResultadoSistema(res);
  if (res.tipo === 'aviso') {
    return `
      <div class="titulo">${esc(res.titulo)} =</div>
      <div class="dica">${esc(res.mensagem)}</div>
      <div class="grande" style="font-size:52px">${esc(res.aviso)}</div>`;
  }
  const r = res.matriz.length;
  const c = res.matriz[0].length;
  return `
    <div class="titulo">${esc(res.titulo)} =</div>
    ${htmlGrade(res.matriz)}
    <div class="dica">${r}×${c}</div>`;
}

function htmlEdicao() {
  const et = etapaAtual();
  if (et.tipo === 'escalar') return htmlEscalar();
  if (et.tipo === 'dims') return htmlDims(et);
  return htmlMatriz(et);
}

function render() {
  document.querySelectorAll('[data-op]').forEach((b) => b.classList.toggle('ativo', b.dataset.op === estado.op));

  const mostraC = !estado.resultado && etapaAtual().tipo !== 'dims' && valorAtual() !== '';
  teclaLimpar.textContent = mostraC ? 'C' : 'AC';
  teclaLimpar.setAttribute('aria-label', mostraC ? 'Limpar campo' : 'Limpar tudo');
  document.querySelector('[data-tecla="="]').classList.toggle('ocupada', estado.ocupado);

  const corpo = estado.resultado ? htmlResultado() : htmlEdicao();
  const erro = estado.erro ? `<div class="erro">${esc(estado.erro)}</div>` : '';
  display.innerHTML = `<div class="conteudo">${htmlTrilha()}${corpo}${erro}</div>`;

  // como no iPhone, o que importa fica embaixo; a célula ativa sempre fica visível
  display.scrollTop = display.scrollHeight;
  const ativa = display.querySelector('.cel.ativa');
  if (ativa) ativa.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ---------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------
function executar(tecla) {
  if (tecla === '=') return calcular();
  if (tecla === 'limpar') {
    const tudo = estado.resultado !== null; // depois de um resultado, AC zera tudo
    estado.resultado = null;
    estado.erro = '';
    limpar(tudo);
    return render();
  }

  // qualquer outra tecla depois do resultado volta para a edição
  estado.resultado = null;
  estado.erro = '';

  if (/^[\d,/]$/.test(tecla)) digitar(tecla);
  else if (tecla === 'sinal') trocarSinal();
  else if (tecla === 'apagar') apagar();
  else if (tecla === 'proximo') proximo();
  else if (tecla === 'anterior') anterior();
  else if (tecla === 'etapa') proximaEtapa(true);
  else if (tecla === 'cima') moverVertical(-1);
  else if (tecla === 'baixo') moverVertical(1);
  render();
}

document.querySelectorAll('[data-tecla]').forEach((b) =>
  b.addEventListener('click', () => executar(b.dataset.tecla))
);

document.querySelectorAll('[data-op]').forEach((b) =>
  b.addEventListener('click', () => {
    escolherOperacao(b.dataset.op);
    render();
  })
);

display.addEventListener('click', (e) => {
  const alvo = e.target.closest('[data-campo], [data-etapa], [data-calcular]');
  if (!alvo) return;
  if (alvo.hasAttribute('data-calcular')) return calcular();
  estado.resultado = null;
  estado.erro = '';
  if (alvo.dataset.etapa !== undefined) irPara(Number(alvo.dataset.etapa));
  else irPara(estado.etapa, JSON.parse(alvo.dataset.campo));
  render();
});

const ATALHOS = {
  Enter: '=',
  '=': '=',
  Backspace: 'apagar',
  Delete: 'limpar',
  Escape: 'limpar',
  '.': ',',
  ',': ',',
  '/': '/',
  '-': 'sinal',
  ArrowRight: 'proximo',
  ArrowLeft: 'anterior',
  ArrowUp: 'cima',
  ArrowDown: 'baixo',
};

function piscarTecla(tecla) {
  const botao = document.querySelector(`[data-tecla="${tecla}"]`);
  if (!botao) return;
  botao.classList.add('pressionada');
  setTimeout(() => botao.classList.remove('pressionada'), 110);
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  let tecla = null;
  if (/^\d$/.test(e.key)) tecla = e.key;
  else if (e.key === 'Tab') tecla = e.shiftKey ? 'anterior' : 'proximo';
  else tecla = ATALHOS[e.key] || null;
  if (!tecla) return;
  e.preventDefault();
  piscarTecla(tecla);
  executar(tecla);
});

render();
