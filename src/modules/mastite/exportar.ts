import { formatarData } from '../../lib/datas';
import type { Aba, Celula } from '../../lib/planilha';
import { NOME_CONDUTA } from './condutas';
import type { HistoricoPropriedade } from './historico';
import type { Laudo } from './laudo';
import { rotuloAmostras } from './dados';

/**
 * Planilhas exportadas. Os textos saem exatamente como cadastrados (o sistema nunca corrige nomes).
 * Percentuais vão como número (0 a 100) para o vet poder fazer contas no Excel.
 */

const arred = (n: number) => Math.round(n * 1000) / 1000;

/** Linhas da tabela por animal/teto, como no laudo. */
export function linhasLaudo(l: Laudo): Celula[][] {
  const linhas: Celula[][] = [['Ordem', 'Animal', 'Tubo', 'Teto', 'Tamis', 'CMT', 'Resultado']];
  for (const a of l.animais) for (const r of a.linhas) linhas.push([a.ordem, a.identificacao, r.tubo, r.teto, r.tamis, r.cmt, r.resultado]);
  return linhas;
}

export function abasDaVisita(l: Laudo): Aba[] {
  const cab: Celula[][] = [
    ['Campo', 'Valor'],
    ['Instituição', l.visita.instituicao ?? ''],
    ['Propriedade', l.propriedade?.nome ?? ''],
    ['Município', [l.propriedade?.municipio, l.propriedade?.uf].filter(Boolean).join('-')],
    ['Proprietário', l.propriedade?.proprietario_nome ?? ''],
    ['Data', formatarData(l.visita.data)],
    ['Animais', l.totais.animais],
    ['Tetos', l.totais.tetos],
    ['Amostras', l.totais.amostras],
  ];
  const tabela = (titulo: string, t: { linhas: { rotulo: string; n: number; pct: number }[]; total: number }): Celula[][] => [
    [titulo, '', ''],
    ...t.linhas.map((x) => [x.rotulo, x.n, arred(x.pct)] as Celula[]),
    ['TOTAL', t.total, t.total ? 100 : 0],
    ['', '', ''],
  ];
  const tabelas: Celula[][] = [
    ['Resultado', 'Número', '%'],
    ...tabela('Tabela 1: Tamis (mastite clínica)', l.tabela1),
    ...tabela('Tabela 2: CMT (mastite subclínica)', l.tabela2),
    ...tabela('Tabela 3: Microbiologia (por tubo)', l.tabela3),
  ];
  const ab: Celula[][] = [['Microrganismo', 'Amostras', 'Antibiótico', 'Resultado']];
  for (const a of l.antibiogramas) for (const r of a.resultados) ab.push([a.rotulo_microrganismo, rotuloAmostras(a.tubos), r.antibiotico, r.resultado]);
  return [
    { nome: 'Laudo', linhas: linhasLaudo(l), larguras: [7, 18, 7, 11, 7, 7, 30] },
    { nome: 'Tabelas 1 a 3', linhas: tabelas, larguras: [38, 10, 10] },
    { nome: 'Antibiogramas', linhas: ab, larguras: [26, 26, 18, 14] },
    { nome: 'Cabeçalho', linhas: cab, larguras: [16, 40] },
  ];
}

/** Histórico completo da propriedade: uma linha por teto por visita, mais culturas, antibiogramas e condutas. */
export function abasDaPropriedade(h: HistoricoPropriedade, nomePropriedade: string): Aba[] {
  const exames: Celula[][] = [['Propriedade', 'Data', 'Animal', 'Teto', 'Linha', 'Tamis', 'CMT', 'Tubos', 'Agentes', 'Sem crescimento']];
  const condutas: Celula[][] = [['Data da visita', 'Animal', 'Conduta', 'Teto', 'Produto', 'Dose', 'Período', 'Data da revisita', 'Observação', 'Veio de sugestão']];
  const antibio: Celula[][] = [['Data da visita', 'Animal', 'Microrganismo', 'Amostras', 'Antibiótico', 'Resultado']];
  for (const a of h.animais) {
    for (const e of a.entradas) {
      const data = formatarData(e.visita.data);
      for (const t of e.tetos)
        exames.push([nomePropriedade, data, a.identificacao, t.posicao ?? '', t.linha, t.tamis ?? '', t.cmt ?? '', t.tubos.join(', '), t.agentes.join(' + '), t.semCrescimento ? 'sim' : '']);
      for (const c of e.condutas)
        condutas.push([data, a.identificacao, NOME_CONDUTA[c.tipo] ?? c.tipo, c.teto ?? '', c.produto ?? '', c.dose ?? '', c.periodo ?? '', c.data_revisita ? formatarData(c.data_revisita) : '', c.observacao ?? '', c.alerta_origem_id ? 'sim' : '']);
      for (const ab of e.antibiogramas) for (const r of ab.resultados) antibio.push([data, a.identificacao, ab.rotulo, rotuloAmostras(ab.tubos), r.antibiotico, r.resultado]);
    }
  }
  const datas = new Map(h.visitas.map((v) => [v.id, formatarData(v.data)]));
  const culturas: Celula[][] = [['Data da visita', 'Tubo', 'Agentes', 'Sem crescimento']];
  for (const t of h.tubos) culturas.push([datas.get(t.visita_id) ?? '', t.numero_tubo, t.agentes.join(' + '), t.semCrescimento ? 'sim' : '']);
  return [
    { nome: 'Exames por teto', linhas: exames, larguras: [22, 12, 18, 6, 6, 9, 6, 10, 32, 10] },
    { nome: 'Antibiogramas', linhas: antibio, larguras: [12, 18, 26, 26, 18, 14] },
    { nome: 'Condutas', linhas: condutas, larguras: [12, 18, 18, 6, 22, 12, 12, 12, 30, 10] },
    { nome: 'Culturas', linhas: culturas, larguras: [12, 10, 32, 10] },
  ];
}
