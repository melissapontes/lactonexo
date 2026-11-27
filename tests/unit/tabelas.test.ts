import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/db';
import { antibiogramasDaVisita, examesDaVisita, resultadosDaVisita, rotuloAmostras } from '../../src/modules/mastite/dados';
import { carregarExemploLaudo } from '../../src/modules/mastite/seed-laudo';
import { formatarPct, tabela1Tamis, tabela2Cmt, tabela3Microbiologia } from '../../src/modules/mastite/tabelas';
import { definirSessao } from '../../src/sync/mutacoes';
import { bancoNovo } from './ajuda';

const linhas = (t: { linhas: { rotulo: string; n: number; pct: number }[] }) =>
  Object.fromEntries(t.linhas.map((l) => [l.rotulo, [l.n, formatarPct(l.pct)]]));

describe('Tabelas 1 a 3 com o laudo NAPROSA (29/09/2026)', () => {
  let visita: string;
  beforeEach(async () => {
    await bancoNovo();
    definirSessao('vet-1', 'org-1');
    visita = await carregarExemploLaudo();
  });

  it('carrega 8 animais e 32 tetos', async () => {
    const { animais, exames } = await examesDaVisita(visita);
    expect(animais).toBe(8);
    expect(exames).toHaveLength(32);
    expect((await db.animal.toArray()).map((a) => a.identificacao)).toEqual(
      expect.arrayContaining(['064', '102', '240', 'Diamante', 'Traúna', 'Maravilha 262', '255', '267']),
    );
  });

  it('Tabela 1 (Tamis) bate com o laudo: 30 negativos (93,75%) e 2 positivos (6,25%)', async () => {
    const t = tabela1Tamis((await examesDaVisita(visita)).exames);
    expect(t.total).toBe(32);
    expect(linhas(t)).toEqual({ NEGATIVO: [30, '93,75%'], POSITIVO: [2, '6,25%'] });
  });

  it('Tabela 2 (CMT) é calculada pelos dados: 25 negativos, nenhum Traços (o laudo impresso diz 24 e 1)', async () => {
    const t = tabela2Cmt((await examesDaVisita(visita)).exames);
    expect(t.total).toBe(32);
    expect(linhas(t)).toEqual({
      NEGATIVO: [25, '78,125%'],
      Traços: [0, '0%'],
      '+': [5, '15,625%'],
      '++': [0, '0%'],
      '+++': [0, '0%'],
      '++++': [2, '6,25%'],
    });
  });

  it('Tabela 3 é calculada pelos 11 tubos, com os nomes exatamente como em cada tubo', async () => {
    const t = tabela3Microbiologia(await resultadosDaVisita(visita));
    expect(t.total).toBe(11);
    expect(t.somaLinhas).toBe(11);
    expect(t.linhas.map((l) => [l.rotulo, l.n, formatarPct(l.pct)])).toEqual([
      ['Staphylococcus aureus', 5, '45,455%'],
      ['Staphylococcus spp.', 2, '18,182%'],
      ['Sem crescimento', 4, '36,364%'],
    ]);
  });

  it('antibiogramas mantêm o rótulo impresso ("Streptococcus aureus") e os pools', async () => {
    const abs = await antibiogramasDaVisita(visita);
    expect(abs.map((a) => `${a.rotulo_microrganismo} – ${rotuloAmostras(a.tubos)}`)).toEqual([
      'Staphylococcus aureus. – amostra 1',
      'Streptococcus aureus – amostra 3',
      'Streptococcus spp. – amostra 8 e 9 (pool)',
      'Streptococcus aureus – amostra 10 e 11 (pool)',
    ]);
    expect(abs[3].resultados.map((r) => `${r.antibiotico}: ${r.resultado}`)).toContain('Oxacilina: Resistente');
  });

  it('carregar de novo não duplica', async () => {
    expect(await carregarExemploLaudo()).toBe(visita);
    expect(await db.animal.count()).toBe(8);
  });
});

describe('cálculos isolados', () => {
  it('ignora tetos ainda não examinados no total', () => {
    expect(tabela1Tamis([{ tamis: 'negativo' }, { tamis: null }]).total).toBe(1);
  });
  it('tubo com dois agentes conta em cada agente', () => {
    const t = tabela3Microbiologia([{ amostra_id: 'a', agentes: ['X', 'Y'], semCrescimento: false }]);
    expect(t.total).toBe(1);
    expect(t.somaLinhas).toBe(2);
  });
  it('percentual no formato do laudo', () => {
    expect(formatarPct(100)).toBe('100%');
    expect(formatarPct(3.125)).toBe('3,125%');
  });
});

describe('tabela por animal do laudo', () => {
  it('reproduz as linhas do laudo, inclusive "Composto" e tetos sem rótulo', async () => {
    await bancoNovo();
    definirSessao('vet-1', 'org-1');
    const { montarLaudo } = await import('../../src/modules/mastite/laudo');
    const l = await montarLaudo(await carregarExemploLaudo());
    const linha = (i: number) => l.animais[i].linhas.map((r) => [r.tubo, r.teto, r.tamis, r.cmt, r.resultado].join('|'));
    expect(linha(0)).toEqual(['|AE|-|-|', '2|AD|-|++++|Sem crescimento', '1|PE|+|++++|Staphylococcus aureus', '|PD|-|-|']);
    expect(linha(1)).toEqual(['||-|-|', '3|Composto|-|+|Staphylococcus aureus', '||-|-|', '||-|-|']);
    expect(linha(2)).toEqual(['||-|-|', '4|AD|-|-|Sem crescimento', '||-|-|', '5|Composto|+|+|Sem crescimento']);
    expect(linha(6)).toEqual([
      '11|AE|-|-|Staphylococcus aureus',
      '8|AD|-|+|Staphylococcus spp.',
      '10|PE|-|+|Staphylococcus aureus',
      '9|PD|-|+|Staphylococcus spp.',
    ]);
    expect(l.totais).toEqual({ animais: 8, tetos: 32, amostras: 11, animaisComAmostra: 6 });
  });
});
