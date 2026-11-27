import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/db';
import type { Cmt, Tamis, Teto } from '../../src/db/tipos';
import { adicionarAnimalNaVisita, criarVisita, definirCultura, examesDoAnimal, garantirCatalogo, itemPorNome, registrarTubo } from '../../src/modules/mastite/dados';
import { carregarHistorico } from '../../src/modules/mastite/historico';
import { agentesFrequentes, perfilResistencia, resumoPorVisita } from '../../src/modules/mastite/painel';
import {
  avaliarRegras,
  comEstado,
  dispensarSugestao,
  garantirRegras,
  idRegraPadrao,
  registrarConduta,
  regrasDoModulo,
} from '../../src/modules/mastite/regras';
import { carregarExemploLaudo } from '../../src/modules/mastite/seed-laudo';
import { definirSessao, salvar } from '../../src/sync/mutacoes';
import { bancoNovo } from './ajuda';

type Marca = Partial<Record<Teto, [Tamis, Cmt]>>;

async function examinar(visita: string, animal: string, marcas: Marca) {
  const va = await adicionarAnimalNaVisita(visita, animal);
  for (const e of await examesDoAnimal(va)) {
    const [tamis, cmt] = marcas[e.posicao!] ?? ['negativo', 'N'];
    await salvar('exame_teto', { id: e.id, tamis, cmt });
  }
  return va;
}

async function tubo(visita: string, va: string, teto: Teto, numero: string, agente?: string) {
  const ex = (await examesDoAnimal(va)).find((e) => e.posicao === teto)!;
  const { id } = await registrarTubo(visita, numero, [ex.id], 'teto');
  await definirCultura(id!, agente ? [await itemPorNome('microrganismo', agente)] : [], !agente);
  return id!;
}

describe('histórico, painel e regras', () => {
  let prop: string;
  let mimosa: string;
  let estrela: string;
  let v1: string;
  let v2: string;
  let va2: string;

  beforeEach(async () => {
    await bancoNovo();
    definirSessao('vet-1', 'org-1');
    await garantirCatalogo();
    await garantirRegras();
    prop = await salvar('propriedade', { nome: 'Sítio Histórico' });
    mimosa = await salvar('animal', { propriedade_id: prop, identificacao: 'Mimosa', ativo: true });
    estrela = await salvar('animal', { propriedade_id: prop, identificacao: '102', ativo: true });

    v1 = await criarVisita(prop, '2026-09-01');
    const va1 = await examinar(v1, mimosa, { AE: ['negativo', '++'] });
    await examinar(v1, estrela, { PD: ['negativo', 'T'] });
    await tubo(v1, va1, 'AE', '1', 'Staphylococcus aureus');

    v2 = await criarVisita(prop, '2026-10-01');
    va2 = await examinar(v2, mimosa, { AE: ['positivo', '+++'], AD: ['negativo', '+'] });
    await examinar(v2, estrela, {});
    const t2 = await tubo(v2, va2, 'AE', '5', 'Staphylococcus aureus');
    await tubo(v2, va2, 'AD', '6');
    const ab = await salvar('antibiograma', { visita_id: v2, rotulo_microrganismo: 'Staphylococcus aureus' });
    await salvar('antibiograma_amostra', { antibiograma_id: ab, amostra_id: t2 });
    await salvar('antibiograma_resultado', { antibiograma_id: ab, antibiotico_id: await itemPorNome('antibiotico', 'Penicilina'), resultado: 'Resistente', ordem: 1 });
    await salvar('antibiograma_resultado', { antibiograma_id: ab, antibiotico_id: await itemPorNome('antibiotico', 'Ceftriaxona'), resultado: 'Sensível', ordem: 2 });
  });

  it('monta a linha do tempo do animal em ordem de data, com tubos, agentes e antibiograma', async () => {
    const h = await carregarHistorico(prop);
    const m = h.animais.find((a) => a.identificacao === 'Mimosa')!;
    expect(m.entradas.map((e) => e.visita.data)).toEqual(['2026-09-01', '2026-10-01']);
    const ae = m.entradas.map((e) => e.tetos.find((t) => t.posicao === 'AE')!);
    expect(ae.map((t) => t.cmt)).toEqual(['++', '+++']);
    expect(ae[1]).toMatchObject({ tamis: 'positivo', tubos: ['5'], agentes: ['Staphylococcus aureus'] });
    expect(m.entradas[1].tetos.find((t) => t.posicao === 'AD')).toMatchObject({ tubos: ['6'], semCrescimento: true, agentes: [] });
    expect(m.entradas[1].antibiogramas[0].resultados).toEqual([
      { antibiotico: 'Penicilina', resultado: 'Resistente' },
      { antibiotico: 'Ceftriaxona', resultado: 'Sensível' },
    ]);
    // O antibiograma é só da Mimosa, não aparece no outro animal.
    expect(h.animais.find((a) => a.identificacao === '102')!.entradas[1].antibiogramas).toEqual([]);
  });

  it('painel: prevalência por visita, agentes e perfil de resistência', async () => {
    const h = await carregarHistorico(prop);
    const [r1, r2] = resumoPorVisita(h);
    // Visita 1: 8 tetos, nenhum Tamis +, 1 subclínico (AE ++). Traços não conta.
    expect(r1).toMatchObject({ animais: 2, tetos: 8, clinicaTetos: { n: 0, total: 8 }, subclinicaTetos: { n: 1, total: 8, pct: 12.5 } });
    // Visita 2: AE é clínico (não conta como subclínico); AD + é subclínico.
    expect(r2).toMatchObject({ clinicaTetos: { n: 1, pct: 12.5 }, subclinicaTetos: { n: 1 }, clinicaAnimais: { n: 1, total: 2, pct: 50 }, tubos: 2, tubosPositivos: 1 });
    expect(agentesFrequentes(h)).toEqual({ agentes: [{ agente: 'Staphylococcus aureus', n: 2, pct: (2 / 3) * 100 }], tubosComResultado: 3 });
    expect(agentesFrequentes(h, [v2]).tubosComResultado).toBe(2);
    expect(perfilResistencia(h).map((p) => [p.antibiotico, p.contagem.Resistente, p.pctResistente])).toEqual([
      ['Penicilina', 1, 100],
      ['Ceftriaxona', 0, 0],
    ]);
  });

  it('gera as sugestões das 4 regras padrão, só para o animal certo', async () => {
    const s = avaliarRegras(await regrasDoModulo(), await carregarHistorico(prop), '2026-10-02');
    expect(s.map((x) => [x.tipo, x.identificacao, x.teto ?? null])).toEqual([
      ['cmt_consecutivo', 'Mimosa', 'AE'],
      ['agente_recorrente', 'Mimosa', null],
      ['resistencia', 'Mimosa', null],
      ['revisita', 'Mimosa', null],
    ]);
    expect(s[0].mensagem).toBe('Teto AE com CMT ++ ou mais em 2 visitas seguidas (++, +++).');
    expect(s[1].mensagem).toBe('Staphylococcus aureus isolado em 2 visitas (01/09/2026, 01/10/2026).');
    expect(s[2].mensagem).toContain('Resistente a Penicilina');
    expect(s[3].mensagem).toBe('Revisitar até 08/10/2026: AE Tamis positivo na visita de 01/10/2026.');
    expect(s.every((x) => x.visita_id === v2 && x.visita_animal_id === va2)).toBe(true);
  });

  it('regra desativada ou com parâmetro mais exigente não sugere', async () => {
    await salvar('regra', { id: idRegraPadrao('resistencia'), ativa: false });
    await salvar('regra', { id: idRegraPadrao('cmt_consecutivo'), parametros: { grau_minimo: '+++', visitas: 2 } });
    const tipos = avaliarRegras(await regrasDoModulo(), await carregarHistorico(prop), '2026-10-02').map((x) => x.tipo);
    expect(tipos).not.toContain('resistencia');
    expect(tipos).not.toContain('cmt_consecutivo');
  });

  it('ids das sugestões são determinísticos: outro aparelho calcula os mesmos', async () => {
    const a = avaliarRegras(await regrasDoModulo(), await carregarHistorico(prop), '2026-10-02').map((x) => x.id);
    const b = avaliarRegras(await regrasDoModulo(), await carregarHistorico(prop), '2026-10-05').map((x) => x.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it('conduta registrada a partir da sugestão fecha a sugestão; dispensar também', async () => {
    const s = avaliarRegras(await regrasDoModulo(), await carregarHistorico(prop), '2026-10-02');
    await registrarConduta({ visita_animal_id: va2, tipo: 'tratamento', teto: 'AE', produto: 'Ceftriaxona' }, s[0]);
    await dispensarSugestao(s[1]);
    const e = await comEstado(avaliarRegras(await regrasDoModulo(), await carregarHistorico(prop), '2026-10-02'));
    expect(e.map((x) => x.estado)).toEqual(['conduta_registrada', 'dispensado', 'aberta', 'aberta']);
    const c = (await db.conduta.toArray())[0];
    expect(c).toMatchObject({ alerta_origem_id: s[0].id, produto: 'Ceftriaxona' });
    // A resposta do vet vai para a fila de sincronização.
    expect((await db.fila_ops.toArray()).filter((o) => o.tabela === 'alerta').length).toBe(2);
  });

  it('revisita marcada na conduta vira lembrete quando a data chega', async () => {
    const s = avaliarRegras(await regrasDoModulo(), await carregarHistorico(prop), '2026-10-02');
    await registrarConduta({ visita_animal_id: va2, tipo: 'revisita', data_revisita: '2026-10-10' }, s[3]);
    const antes = avaliarRegras(await regrasDoModulo(), await carregarHistorico(prop), '2026-10-09').filter((x) => x.tipo === 'revisita');
    expect(antes).toEqual([]);
    const no_dia = avaliarRegras(await regrasDoModulo(), await carregarHistorico(prop), '2026-10-11').filter((x) => x.tipo === 'revisita');
    expect(no_dia.map((x) => x.mensagem)).toEqual(['Revisita marcada para 10/10/2026 (atrasada).']);
  });

  it('regras padrão são criadas sem entrar na fila e não duplicam', async () => {
    await garantirRegras();
    expect(await db.regra.count()).toBe(4);
    expect((await db.fila_ops.toArray()).some((o) => o.tabela === 'regra')).toBe(false);
  });

  it('laudo de exemplo (uma visita) gera só sugestões de revisita e resistência', async () => {
    await bancoNovo();
    definirSessao('vet-1', 'org-1');
    await garantirRegras();
    const visita = await carregarExemploLaudo();
    const v = await db.visita.get(visita);
    const s = avaliarRegras(await regrasDoModulo(), await carregarHistorico(v!.propriedade_id), '2026-10-01');
    expect(new Set(s.map((x) => x.tipo))).toEqual(new Set(['revisita', 'resistencia']));
  });
});
