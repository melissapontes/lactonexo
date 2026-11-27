import { describe, expect, it } from 'vitest';
import { calcularAvisos, somarDias, type DadosAvisos } from '../../src/modules/avisos/regras';

const reg = { excluido_em: null };
function base(): DadosAvisos {
  return {
    hoje: '2026-10-10',
    usuario: 'vet-ana',
    diasLaudoPendente: 2,
    diasAntecedenciaRevisita: 1,
    propriedades: [{ id: 'p1', nome: 'Sítio Boa Vista' }],
    animais: [
      { id: 'a1', identificacao: 'Mimosa', propriedade_id: 'p1' },
      { id: 'a2', identificacao: '102', propriedade_id: 'p1' },
    ],
    visitas: [{ id: 'v1', propriedade_id: 'p1', data: '2026-10-01', status: 'aguardando_laboratorio' }],
    visitaAnimais: [
      { id: 'va1', visita_id: 'v1', animal_id: 'a1' },
      { id: 'va2', visita_id: 'v1', animal_id: 'a2' },
    ],
    condutas: [],
    amostras: [{ id: 't1', visita_id: 'v1' }],
    culturas: [],
    vistos: {},
    ...reg,
  } as DadosAvisos;
}

describe('avisos', () => {
  it('soma dias sem problema de fuso', () => {
    expect(somarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('revisita: amanhã, hoje e atrasada; some quando o animal é revisitado', () => {
    const d = base();
    d.condutas = [
      { id: 'c1', visita_animal_id: 'va1', tipo: 'revisita', data_revisita: '2026-10-11' },
      { id: 'c2', visita_animal_id: 'va2', tipo: 'revisita', data_revisita: '2026-10-08' },
      { id: 'c3', visita_animal_id: 'va2', tipo: 'revisita', data_revisita: '2026-10-20' },
      { id: 'c4', visita_animal_id: 'va2', tipo: 'tratamento' },
    ];
    expect(calcularAvisos(d).filter((a) => a.tipo === 'revisita').map((a) => [a.titulo, a.texto])).toEqual([
      ['Revisita atrasada desde 08/10/2026', '102 · Sítio Boa Vista'],
      ['Revisita amanhã (11/10/2026)', 'Mimosa · Sítio Boa Vista'],
    ]);
    d.visitas.push({ id: 'v2', propriedade_id: 'p1', data: '2026-10-09', status: 'em_campo' });
    d.visitaAnimais.push({ id: 'va3', visita_id: 'v2', animal_id: 'a2' });
    expect(calcularAvisos(d).filter((a) => a.tipo === 'revisita').map((a) => a.texto)).toEqual(['Mimosa · Sítio Boa Vista']);
  });

  it('cultura lançada por outra pessoa avisa até ser vista; a própria não avisa', () => {
    const d = base();
    d.culturas = [{ id: 'k1', amostra_id: 't1', atualizado_por: 'vet-ana', criado_em: '2026-10-05T10:00:00Z' }];
    expect(calcularAvisos(d).some((a) => a.tipo === 'cultura')).toBe(false);
    d.culturas = [{ id: 'k1', amostra_id: 't1', atualizado_por: 'laboratorio', criado_em: '2026-10-05T10:00:00Z' }];
    const [c] = calcularAvisos(d).filter((a) => a.tipo === 'cultura');
    expect(c).toMatchObject({ titulo: 'Resultado de cultura disponível', texto: 'Sítio Boa Vista · visita de 01/10/2026 · 1 resultado', url: '/visitas/v1/laboratorio' });
    d.vistos = { [c.id]: c.marca! };
    expect(calcularAvisos(d).some((a) => a.tipo === 'cultura')).toBe(false);
    // Novo resultado depois de visto: avisa de novo.
    d.culturas.push({ id: 'k2', amostra_id: 't1', atualizado_por: 'laboratorio', criado_em: '2026-10-06T10:00:00Z' });
    expect(calcularAvisos(d).filter((a) => a.tipo === 'cultura')).toHaveLength(1);
  });

  it('laudo pendente: só com resultados completos, depois de N dias e se ainda não enviado', () => {
    const d = base();
    expect(calcularAvisos(d).some((a) => a.tipo === 'laudo_pendente')).toBe(false); // tubo sem resultado
    d.culturas = [{ id: 'k1', amostra_id: 't1', atualizado_por: 'vet-ana', criado_em: '2026-10-05T10:00:00Z' }];
    expect(calcularAvisos(d).find((a) => a.tipo === 'laudo_pendente')).toMatchObject({ texto: 'Sítio Boa Vista · visita de 01/10/2026', url: '/visitas/v1/resumo' });
    d.hoje = '2026-10-02';
    expect(calcularAvisos(d).some((a) => a.tipo === 'laudo_pendente')).toBe(false); // ainda dentro do prazo
    d.hoje = '2026-10-10';
    d.visitas[0].status = 'laudo_enviado';
    expect(calcularAvisos(d).some((a) => a.tipo === 'laudo_pendente')).toBe(false);
  });
});
