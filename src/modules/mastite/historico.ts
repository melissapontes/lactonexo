import { db } from '../../db/db';
import type { Cmt, Conduta, ResultadoAntibiograma, Tamis, Teto, Visita } from '../../db/tipos';

/**
 * Histórico do módulo mastite, montado a partir do banco local.
 * O carregador lê tudo de uma propriedade de uma vez; o resto (painel, regras, gráficos)
 * são funções puras sobre esta estrutura, fáceis de testar.
 */

export interface ResultadoAb {
  antibiotico: string;
  resultado: ResultadoAntibiograma;
}

export interface AntibiogramaHist {
  id: string;
  rotulo: string;
  tubos: string[];
  resultados: ResultadoAb[];
}

export interface TetoHist {
  exame_id: string;
  posicao: Teto | null;
  linha: number;
  tamis: Tamis | null;
  cmt: Cmt | null;
  tubos: string[];
  /** Agentes isolados nos tubos que incluem este teto (inclui composto e pool). */
  agentes: string[];
  semCrescimento: boolean;
}

export interface EntradaHist {
  visita: Pick<Visita, 'id' | 'data' | 'status'>;
  visita_animal_id: string;
  tetos: TetoHist[];
  /** Agentes do animal na visita (todos os tubos), sem repetição. */
  agentes: string[];
  antibiogramas: AntibiogramaHist[];
  condutas: Conduta[];
}

export interface AnimalHist {
  animal_id: string;
  identificacao: string;
  /** Visitas em que o animal foi examinado, da mais antiga para a mais recente. */
  entradas: EntradaHist[];
}

export interface HistoricoPropriedade {
  visitas: Pick<Visita, 'id' | 'data' | 'status'>[];
  animais: AnimalHist[];
  /** Tubos por visita, para o painel (um tubo de pool conta uma vez). */
  tubos: { visita_id: string; amostra_id: string; agentes: string[]; semCrescimento: boolean }[];
  antibiogramas: (AntibiogramaHist & { visita_id: string })[];
}

const vivo = <T extends { excluido_em: string | null }>(r: T | undefined): r is T => !!r && !r.excluido_em;
const porNumero = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

export async function carregarHistorico(propriedade_id: string): Promise<HistoricoPropriedade> {
  const visitas = (await db.visita.where('propriedade_id').equals(propriedade_id).filter(vivo).toArray()).sort(
    (a, b) => a.data.localeCompare(b.data) || a.criado_em.localeCompare(b.criado_em),
  );
  const visitaIds = visitas.map((v) => v.id);
  const animais = (await db.animal.where('propriedade_id').equals(propriedade_id).filter(vivo).toArray()).sort((a, b) =>
    porNumero(a.identificacao, b.identificacao),
  );
  const vas = await db.visita_animal.where('visita_id').anyOf(visitaIds).filter(vivo).toArray();
  const vaIds = vas.map((v) => v.id);
  const exames = await db.exame_teto.where('visita_animal_id').anyOf(vaIds).filter(vivo).toArray();
  const condutas = await db.conduta.where('visita_animal_id').anyOf(vaIds).filter(vivo).toArray();
  const amostras = await db.amostra.where('visita_id').anyOf(visitaIds).filter(vivo).toArray();
  const amostraIds = amostras.map((a) => a.id);
  const origens = await db.amostra_origem.where('amostra_id').anyOf(amostraIds).filter(vivo).toArray();
  const culturas = await db.cultura.where('amostra_id').anyOf(amostraIds).filter(vivo).toArray();
  const abs = await db.antibiograma.where('visita_id').anyOf(visitaIds).filter(vivo).toArray();
  const abIds = abs.map((a) => a.id);
  const abAmostras = await db.antibiograma_amostra.where('antibiograma_id').anyOf(abIds).filter(vivo).toArray();
  const abResultados = await db.antibiograma_resultado.where('antibiograma_id').anyOf(abIds).filter(vivo).toArray();
  const catalogo = new Map((await db.catalogo_item.toArray()).map((i) => [i.id, i.nome]));

  const tuboNum = new Map(amostras.map((a) => [a.id, a.numero_tubo]));
  const agentesTubo = new Map<string, string[]>();
  const semCrescTubo = new Set<string>();
  for (const c of culturas) {
    if (c.sem_crescimento) semCrescTubo.add(c.amostra_id);
    if (c.microrganismo_id) {
      const l = agentesTubo.get(c.amostra_id) ?? [];
      const nome = catalogo.get(c.microrganismo_id) ?? '?';
      if (!l.includes(nome)) l.push(nome);
      agentesTubo.set(c.amostra_id, l);
    }
  }
  const tubosDoExame = new Map<string, string[]>();
  for (const o of origens) tubosDoExame.set(o.exame_teto_id, [...(tubosDoExame.get(o.exame_teto_id) ?? []), o.amostra_id]);

  const antibiogramas = abs.map((ab) => ({
    id: ab.id,
    visita_id: ab.visita_id,
    rotulo: ab.rotulo_microrganismo,
    amostra_ids: abAmostras.filter((l) => l.antibiograma_id === ab.id).map((l) => l.amostra_id),
    tubos: abAmostras
      .filter((l) => l.antibiograma_id === ab.id)
      .map((l) => tuboNum.get(l.amostra_id) ?? '?')
      .sort(porNumero),
    resultados: abResultados
      .filter((r) => r.antibiograma_id === ab.id)
      .sort((a, b) => a.ordem - b.ordem)
      .map((r) => ({ antibiotico: catalogo.get(r.antibiotico_id) ?? '?', resultado: r.resultado })),
  }));

  const visitaPorId = new Map(visitas.map((v) => [v.id, v]));
  const resumoVisita = (v: Visita) => ({ id: v.id, data: v.data, status: v.status });

  const animaisHist: AnimalHist[] = animais.map((a) => {
    const entradas = vas
      .filter((va) => va.animal_id === a.id && visitaPorId.has(va.visita_id))
      .map((va): EntradaHist => {
        const tetos = exames
          .filter((e) => e.visita_animal_id === va.id)
          .sort((x, y) => x.linha - y.linha)
          .map((e) => {
            const ams = tubosDoExame.get(e.id) ?? [];
            return {
              exame_id: e.id,
              posicao: e.posicao,
              linha: e.linha,
              tamis: e.tamis,
              cmt: e.cmt,
              tubos: ams.map((id) => tuboNum.get(id) ?? '?').sort(porNumero),
              agentes: [...new Set(ams.flatMap((id) => agentesTubo.get(id) ?? []))],
              semCrescimento: ams.length > 0 && ams.every((id) => semCrescTubo.has(id) && !(agentesTubo.get(id)?.length)),
            };
          });
        const amostrasAnimal = new Set(tetos.flatMap((t) => tubosDoExame.get(t.exame_id) ?? []));
        return {
          visita: resumoVisita(visitaPorId.get(va.visita_id)!),
          visita_animal_id: va.id,
          tetos,
          agentes: [...new Set(tetos.flatMap((t) => t.agentes))],
          antibiogramas: antibiogramas
            .filter((ab) => ab.amostra_ids.some((id) => amostrasAnimal.has(id)))
            .map(({ id, rotulo, tubos, resultados }) => ({ id, rotulo, tubos, resultados })),
          condutas: condutas.filter((c) => c.visita_animal_id === va.id).sort((x, y) => x.criado_em.localeCompare(y.criado_em)),
        };
      })
      .sort((x, y) => x.visita.data.localeCompare(y.visita.data));
    return { animal_id: a.id, identificacao: a.identificacao, entradas };
  });

  return {
    visitas: visitas.map(resumoVisita),
    animais: animaisHist,
    tubos: amostras.map((am) => ({
      visita_id: am.visita_id,
      amostra_id: am.id,
      agentes: agentesTubo.get(am.id) ?? [],
      semCrescimento: semCrescTubo.has(am.id),
    })),
    antibiogramas: antibiogramas.map(({ id, visita_id, rotulo, tubos, resultados }) => ({ id, visita_id, rotulo, tubos, resultados })),
  };
}
