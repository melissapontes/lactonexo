import { jsPDF } from 'jspdf';
import { autoTable, type CellHookData, type UserOptions } from 'jspdf-autotable';
import { APP } from '../../config/app';
import { formatarData } from '../../lib/datas';
import { TEXTO_SEM_CRESCIMENTO } from './constantes';
import { rotuloAmostras } from './dados';
import type { Laudo } from './laudo';
import { formatarPct, type Tabela } from './tabelas';

/**
 * PDF do laudo, gerado no aparelho (funciona sem internet), no formato do modelo:
 * cabeçalho com a marca, tabela por animal/teto, nota do CMT, Tabelas 1 a 3 e antibiogramas.
 * Os nomes saem exatamente como cadastrados (inclusive "Streptococcus aureus").
 */

export interface OpcoesPdf {
  /** Logo já rasterizado (data URL PNG). Sem logo, sai só o nome do app. */
  logoPng?: string;
  /** Data de emissão (para testes). */
  emitidoEm?: Date;
  /** false só em testes, para ler o texto do PDF. */
  comprimir?: boolean;
}

const CINZA = [230, 230, 230] as const;
const AZUL_NOTA = [220, 230, 240] as const;
const MARGEM = 14;
const LARGURA = 210;
const ALTURA = 297;
const UTIL = LARGURA - 2 * MARGEM;

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };
const fimTabela = (doc: Doc) => doc.lastAutoTable?.finalY ?? MARGEM;

const BASE: Partial<UserOptions> = {
  theme: 'grid',
  margin: { left: MARGEM, right: MARGEM, top: MARGEM + 4, bottom: 16 },
  styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.4, lineColor: [60, 60, 60], lineWidth: 0.2, textColor: [20, 20, 20], valign: 'middle' },
  headStyles: { fillColor: [255, 255, 255], textColor: [20, 20, 20], fontStyle: 'normal', halign: 'center' },
};

function cabecalho(doc: Doc, l: Laudo, opcoes: OpcoesPdf) {
  const caixaL = opcoes.logoPng ? UTIL - 34 : UTIL;
  doc.setFillColor(...CINZA);
  doc.roundedRect(MARGEM, 10, caixaL, 30, 4, 4, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  const x1 = MARGEM + 4;
  const x2 = MARGEM + caixaL * 0.58;
  let y = 17;
  if (l.visita.instituicao) {
    doc.text(doc.splitTextToSize(l.visita.instituicao, caixaL - 8)[0], x1, y);
    y += 8;
  } else y += 3;
  doc.text(`Propriedade: ${l.propriedade?.nome || '-'}`, x1, y, { maxWidth: x2 - x1 - 2 });
  doc.text(`Município: ${[l.propriedade?.municipio, l.propriedade?.uf].filter(Boolean).join('-') || '-'}`, x2, y);
  y += 8;
  doc.text(`Proprietário: ${l.propriedade?.proprietario_nome ?? ''}`, x1, y, { maxWidth: x2 - x1 - 2 });
  doc.text(`Data: ${formatarData(l.visita.data)}`, x2, y);

  if (opcoes.logoPng) {
    doc.addImage(opcoes.logoPng, 'PNG', LARGURA - MARGEM - 24, 9, 24, 24);
    doc.setFontSize(8);
    doc.text(APP.nome, LARGURA - MARGEM - 12, 37, { align: 'center' });
  }
}

function rodape(doc: Doc, emitido: Date) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(`Laudo emitido pelo ${APP.nome} em ${formatarData(emitido)}`, MARGEM, ALTURA - 8);
    doc.text(`Página ${i} de ${total}`, LARGURA - MARGEM, ALTURA - 8, { align: 'right' });
    if (i > 1) {
      doc.setFontSize(9);
      doc.text(APP.nome, LARGURA - MARGEM, 10, { align: 'right' });
    }
  }
}

function tabelaAnimais(doc: Doc, l: Laudo, y: number) {
  const corpo = l.animais.flatMap((a) =>
    a.linhas.map((r, i) => {
      const linha: (string | { content: string; rowSpan: number; styles?: object })[] = [];
      if (i === 0) {
        linha.push({ content: String(a.ordem), rowSpan: a.linhas.length, styles: { halign: 'center' } });
        linha.push({ content: a.identificacao, rowSpan: a.linhas.length, styles: { halign: 'center' } });
      }
      linha.push(r.tubo, r.teto, r.tamis, r.cmt, r.resultado);
      return linha;
    }),
  );
  autoTable(doc, {
    ...BASE,
    startY: y,
    head: [['', 'ANIMAL', 'TUBO', 'Teto', 'Tamis', 'CMT', 'Resultado']],
    body: corpo,
    rowPageBreak: 'avoid',
    columnStyles: {
      0: { cellWidth: 9 },
      1: { cellWidth: 34 },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 14, halign: 'center' },
      5: { cellWidth: 16, halign: 'center' },
      6: { halign: 'center' },
    },
    didParseCell: (d: CellHookData) => {
      if (d.section === 'head' && d.column.index === 6) d.cell.styles.fontStyle = 'bold';
      if (d.section === 'body' && d.column.index === 6 && d.cell.text.join('')) {
        d.cell.styles.fontStyle = d.cell.text.join('') === TEXTO_SEM_CRESCIMENTO ? 'bold' : 'bolditalic';
      }
    },
  });
  return fimTabela(doc);
}

function nota(doc: Doc, y: number) {
  const linhas = ['Nota 1:', 'N- Negativo', 'T- Traços', '1-  +', '2- ++', '3- +++'];
  const altura = linhas.length * 4 + 4;
  if (y + altura > ALTURA - 20) {
    doc.addPage();
    y = MARGEM + 4;
  }
  doc.setFillColor(...AZUL_NOTA);
  doc.rect(MARGEM, y, UTIL * 0.8, altura, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 30, 30);
  linhas.forEach((t, i) => doc.text(t, MARGEM + 3, y + 5 + i * 4));
  return y + altura;
}

function tabelaResumo(doc: Doc, titulo: string, t: Tabela, y: number, italico: boolean) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(20, 20, 20);
  const linhasTitulo = doc.splitTextToSize(titulo, UTIL - 30);
  const precisa = linhasTitulo.length * 5 + (t.linhas.length + 2) * 7 + 6;
  if (y + precisa > ALTURA - 20) {
    doc.addPage();
    y = MARGEM + 6;
  }
  doc.text(linhasTitulo, LARGURA / 2, y, { align: 'center' });
  y += linhasTitulo.length * 5;
  autoTable(doc, {
    ...BASE,
    theme: 'plain',
    startY: y,
    margin: { left: LARGURA / 2 - 55, right: LARGURA / 2 - 55 },
    head: [['', 'Número', '%']],
    body: [...t.linhas.map((x) => [x.rotulo, String(x.n), formatarPct(x.pct)]), ['TOTAL', String(t.total), t.total ? '100%' : '0%']],
    styles: { ...BASE.styles, fontSize: 9.5, lineWidth: 0 },
    headStyles: { fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' }, 1: { halign: 'center' }, 2: { halign: 'right' } },
    didParseCell: (d: CellHookData) => {
      const txt = d.cell.text.join('');
      if (italico && d.section === 'body' && d.column.index === 0 && txt !== 'TOTAL' && txt !== TEXTO_SEM_CRESCIMENTO) d.cell.styles.fontStyle = 'italic';
      if (d.section === 'body' && d.row.index === t.linhas.length) d.cell.styles.fontStyle = 'bold';
    },
    didDrawCell: (d: CellHookData) => {
      // Linhas horizontais como no modelo: acima e abaixo do cabeçalho e acima do total.
      if ((d.section === 'head' || (d.section === 'body' && d.row.index === t.linhas.length)) && d.column.index === 0) {
        doc.setDrawColor(40, 40, 40);
        doc.setLineWidth(0.3);
        doc.line(LARGURA / 2 - 55, d.cell.y, LARGURA / 2 + 55, d.cell.y);
        if (d.section === 'head') doc.line(LARGURA / 2 - 55, d.cell.y + d.cell.height, LARGURA / 2 + 55, d.cell.y + d.cell.height);
        if (d.section === 'body') doc.line(LARGURA / 2 - 55, d.cell.y + d.cell.height, LARGURA / 2 + 55, d.cell.y + d.cell.height);
      }
    },
  });
  return fimTabela(doc) + 10;
}

function antibiogramas(doc: Doc, l: Laudo, y: number) {
  if (!l.antibiogramas.length) return y;
  if (y + 40 > ALTURA - 20) {
    doc.addPage();
    y = MARGEM + 6;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text('ANTIBIOGRAMA', LARGURA / 2, y, { align: 'center' });
  const w = doc.getTextWidth('ANTIBIOGRAMA');
  doc.setLineWidth(0.3);
  doc.line(LARGURA / 2 - w / 2, y + 1, LARGURA / 2 + w / 2, y + 1);
  y += 5;
  const esquerda = LARGURA / 2 - 55;
  for (const ab of l.antibiogramas) {
    const sufixo = ` – ${rotuloAmostras(ab.tubos)}`;
    autoTable(doc, {
      ...BASE,
      startY: y,
      margin: { ...(BASE.margin as object), left: esquerda, right: esquerda },
      rowPageBreak: 'avoid',
      head: [[{ content: `${ab.rotulo_microrganismo}${sufixo}`, colSpan: 2 }]],
      body: ab.resultados.map((r) => [r.antibiotico, r.resultado]),
      columnStyles: { 0: { cellWidth: 55 } },
      didParseCell: (d: CellHookData) => {
        if (d.section === 'head') d.cell.styles.textColor = [255, 255, 255]; // desenhado à mão abaixo (itálico + normal)
      },
      didDrawCell: (d: CellHookData) => {
        if (d.section !== 'head') return;
        const cy = d.cell.y + d.cell.height / 2 + 1.2;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bolditalic');
        const w1 = doc.getTextWidth(ab.rotulo_microrganismo);
        doc.setFont('helvetica', 'normal');
        const w2 = doc.getTextWidth(sufixo);
        const x0 = d.cell.x + (d.cell.width - w1 - w2) / 2;
        doc.setTextColor(20, 20, 20);
        doc.setFont('helvetica', 'bolditalic');
        doc.text(ab.rotulo_microrganismo, x0, cy);
        doc.setFont('helvetica', 'normal');
        doc.text(sufixo, x0 + w1, cy);
      },
    });
    y = fimTabela(doc) + 4;
  }
  return y;
}

/** Gera o PDF do laudo. Função sem acesso a banco: recebe o laudo já montado. */
export function gerarPdfLaudo(l: Laudo, opcoes: OpcoesPdf = {}): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: opcoes.comprimir ?? true }) as Doc;
  doc.setProperties({
    title: `Laudo ${l.propriedade?.nome ?? ''} ${formatarData(l.visita.data)}`.trim(),
    subject: 'Laudo de mastite',
    creator: APP.nome,
    author: APP.nome,
  });
  cabecalho(doc, l, opcoes);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(20);
  doc.setTextColor(20, 20, 20);
  doc.text('Laudo', LARGURA / 2, 52, { align: 'center' });

  let y = tabelaAnimais(doc, l, 57);
  y = nota(doc, y + 6) + 10;
  const t = l.totais;
  y = tabelaResumo(doc, `Tabela 1: Resultado do teste de caneca (Tamis) para diagnóstico de Mastite Clínica, realizados em ${l.tabela1.total} tetos de ${t.animais} animais em lactação`, l.tabela1, y, false);
  y = tabelaResumo(doc, `Tabela 2: Resultado do Califórnia Mastites Teste (CMT) para diagnóstico de Mastite Subclínica, realizado em ${l.tabela2.total} Tetos de ${t.animais} animais em lactação.`, l.tabela2, y, false);
  y = tabelaResumo(doc, `Tabela 3: Resultado microbiológico das ${l.tabela3.total} amostras de leite coletadas de ${t.animaisComAmostra} animais`, l.tabela3, y, true);
  if (l.tabela3.somaLinhas > l.tabela3.total) {
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text('Na Tabela 3, tubos com mais de um agente contam em cada agente.', LARGURA / 2, y - 6, { align: 'center' });
  }
  antibiogramas(doc, l, y);
  rodape(doc, opcoes.emitidoEm ?? new Date());
  return doc.output('blob');
}

/** Rasteriza o logo SVG (arquivo único do app) para PNG, para entrar no PDF. Só no navegador. */
export async function logoComoPng(tamanho = 256): Promise<string | undefined> {
  try {
    const img = new Image();
    img.src = APP.logo;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = tamanho;
    const ctx = c.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, tamanho, tamanho);
    return c.toDataURL('image/png');
  } catch {
    return undefined;
  }
}
