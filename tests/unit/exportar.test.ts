import { writeFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { gerarCsv, gerarXlsx, nomeAbaValido, nomeArquivo } from '../../src/lib/planilha';
import { telefoneWhatsApp } from '../../src/lib/compartilhar';
import { carregarHistorico } from '../../src/modules/mastite/historico';
import { abasDaPropriedade, abasDaVisita, linhasLaudo } from '../../src/modules/mastite/exportar';
import { montarLaudo } from '../../src/modules/mastite/laudo';
import { gerarPdfLaudo } from '../../src/modules/mastite/pdf';
import { carregarExemploLaudo } from '../../src/modules/mastite/seed-laudo';
import { db } from '../../src/db/db';
import { definirSessao } from '../../src/sync/mutacoes';
import { bancoNovo } from './ajuda';

describe('planilhas', () => {
  it('CSV no padrão do Excel brasileiro: BOM, ponto e vírgula, decimal com vírgula e aspas quando precisa', () => {
    const csv = gerarCsv([
      ['Animal', 'Resultado', '%'],
      ['Maravilha 262', 'Staphylococcus aureus; Streptococcus spp.', 3.125],
      ['064', 'diz "oi"', null],
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Animal;Resultado;%',
      'Maravilha 262;"Staphylococcus aureus; Streptococcus spp.";3,125',
      '064;"diz ""oi""";',
      '',
    ]);
  });

  it('XLSX válido: abas, textos com acento e XML escapado, números como número', () => {
    const zip = unzipSync(gerarXlsx([{ nome: 'Laudo', linhas: [['Animal', 'Nº'], ['Traúna & <cia>', 7]] }, { nome: 'Laudo', linhas: [['x']] }]));
    expect(Object.keys(zip)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/styles.xml']));
    expect(strFromU8(zip['xl/workbook.xml'])).toContain('name="Laudo 2"');
    const s1 = strFromU8(zip['xl/worksheets/sheet1.xml']);
    expect(s1).toContain('<t xml:space="preserve">Traúna &amp; &lt;cia&gt;</t>');
    expect(s1).toContain('<c r="B2"><v>7</v></c>');
    expect(s1).toContain('<c r="A1" t="inlineStr" s="1">');
  });

  it('nomes de aba e de arquivo seguros', () => {
    expect(nomeAbaValido('Tabela [1]: Tamis/CMT com um nome muito comprido demais', new Set())).toBe('Tabela  1   Tamis CMT com um no');
    expect(nomeArquivo(['Laudo', 'Fazenda São João', '2026-09-29'], 'pdf')).toBe('Laudo-Fazenda-Sao-Joao-2026-09-29.pdf');
  });

  it('telefone do produtor vira link de WhatsApp com 55', () => {
    expect(telefoneWhatsApp('(83) 99999-1234')).toBe('5583999991234');
    expect(telefoneWhatsApp('+55 83 3333-1234')).toBe('558333331234');
    expect(telefoneWhatsApp('123')).toBeNull();
  });
});

describe('exportações do laudo de exemplo', () => {
  let visita: string;
  beforeEach(async () => {
    await bancoNovo();
    definirSessao('vet-1', 'org-1');
    visita = await carregarExemploLaudo();
  });

  it('planilha do laudo: 1 linha por linha impressa, com os nomes exatamente como no laudo', async () => {
    const l = await montarLaudo(visita);
    const linhas = linhasLaudo(l);
    expect(linhas[0]).toEqual(['Ordem', 'Animal', 'Tubo', 'Teto', 'Tamis', 'CMT', 'Resultado']);
    expect(linhas).toHaveLength(1 + 32);
    expect(linhas).toContainEqual([2, '102', '3', 'Composto', '-', '+', 'Staphylococcus aureus']);
    const abas = abasDaVisita(l);
    expect(abas.map((a) => a.nome)).toEqual(['Laudo', 'Tabelas 1 a 3', 'Antibiogramas', 'Cabeçalho']);
    expect(abas[2].linhas).toContainEqual(['Streptococcus aureus', 'amostra 10 e 11 (pool)', 'Oxacilina', 'Resistente']);
    expect(abas[1].linhas).toContainEqual(['POSITIVO', 2, 6.25]);
  });

  it('histórico da propriedade: uma linha por teto por visita', async () => {
    const v = await db.visita.get(visita);
    const abas = abasDaPropriedade(await carregarHistorico(v!.propriedade_id), 'Fazenda');
    expect(abas[0].linhas).toHaveLength(1 + 32);
    expect(abas[0].linhas[0]).toEqual(['Propriedade', 'Data', 'Animal', 'Teto', 'Linha', 'Tamis', 'CMT', 'Tubos', 'Agentes', 'Sem crescimento']);
  });

  it('PDF do laudo: tabelas, antibiogramas e nomes sem correção', async () => {
    const l = await montarLaudo(visita);
    const blob = gerarPdfLaudo(l, { comprimir: false, emitidoEm: new Date('2026-10-01T12:00:00') });
    const bytes = await new Promise<Uint8Array>((ok) => {
      const r = new FileReader();
      r.onload = () => ok(new Uint8Array(r.result as ArrayBuffer));
      r.readAsArrayBuffer(blob);
    });
    const texto = new TextDecoder('latin1').decode(bytes);
    expect(texto.startsWith('%PDF-')).toBe(true);
    for (const t of ['Laudo', 'Maravilha 262', 'Sem crescimento', 'Staphylococcus aureus', 'Streptococcus aureus', 'ANTIBIOGRAMA', 'Oxacilina', 'amostra 10 e 11 \\(pool\\)', '93,75%', '78,125%'])
      expect(texto).toContain(t);
    expect(texto).toMatch(/Tabela 3: Resultado microbiol.gico das 11 amostras/);
    if (process.env.SALVAR_PDF) writeFileSync(process.env.SALVAR_PDF, bytes);
  });
});
