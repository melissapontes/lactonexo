import type { Cmt, ResultadoAntibiograma } from '../../db/tipos';
import { GRAUS_CMT } from './constantes';
import type { HistoricoPropriedade, TetoHist } from './historico';

/**
 * Definições do painel (documentadas em docs/painel-e-regras.md):
 * - Clínica: teto com Tamis positivo. Denominador: tetos com Tamis registrado.
 * - Subclínica: teto com CMT em "+" ou mais e sem Tamis positivo. Denominador: tetos com CMT registrado.
 *   Traços (T) não conta como subclínica.
 * - Por animal: animal com pelo menos um teto clínico (ou subclínico) entre os animais examinados.
 */
export const LIMIAR_SUBCLINICA: Cmt = '+';

export const grauCmt = (c: Cmt | null) => (c ? GRAUS_CMT.indexOf(c) : -1);
export const cmtAoMenos = (c: Cmt | null, minimo: Cmt) => c != null && grauCmt(c) >= grauCmt(minimo);

export const ehClinica = (t: Pick<TetoHist, 'tamis'>) => t.tamis === 'positivo';
export const ehSubclinica = (t: Pick<TetoHist, 'tamis' | 'cmt'>) => !ehClinica(t) && cmtAoMenos(t.cmt, LIMIAR_SUBCLINICA);

export interface Proporcao {
  n: number;
  total: number;
  /** 0 a 100. */
  pct: number;
}

const prop = (n: number, total: number): Proporcao => ({ n, total, pct: total ? (n / total) * 100 : 0 });

export interface ResumoVisita {
  visita_id: string;
  data: string;
  animais: number;
  tetos: number;
  clinicaTetos: Proporcao;
  subclinicaTetos: Proporcao;
  clinicaAnimais: Proporcao;
  subclinicaAnimais: Proporcao;
  tubos: number;
  tubosPositivos: number;
}

/** Uma linha por visita, da mais antiga para a mais recente (para comparar visitas). */
export function resumoPorVisita(h: HistoricoPropriedade): ResumoVisita[] {
  return h.visitas.map((v) => {
    const entradas = h.animais.flatMap((a) => a.entradas.filter((e) => e.visita.id === v.id));
    const tetos = entradas.flatMap((e) => e.tetos);
    const comTamis = tetos.filter((t) => t.tamis);
    const comCmt = tetos.filter((t) => t.cmt);
    const examinados = entradas.filter((e) => e.tetos.some((t) => t.tamis || t.cmt));
    const tubos = h.tubos.filter((t) => t.visita_id === v.id);
    return {
      visita_id: v.id,
      data: v.data,
      animais: examinados.length,
      tetos: tetos.filter((t) => t.tamis || t.cmt).length,
      clinicaTetos: prop(comTamis.filter(ehClinica).length, comTamis.length),
      subclinicaTetos: prop(comCmt.filter(ehSubclinica).length, comCmt.length),
      clinicaAnimais: prop(examinados.filter((e) => e.tetos.some(ehClinica)).length, examinados.length),
      subclinicaAnimais: prop(examinados.filter((e) => e.tetos.some(ehSubclinica)).length, examinados.length),
      tubos: tubos.length,
      tubosPositivos: tubos.filter((t) => t.agentes.length).length,
    };
  });
}

export interface FrequenciaAgente {
  agente: string;
  /** Tubos em que o agente foi isolado. */
  n: number;
  /** Sobre os tubos com resultado de cultura. */
  pct: number;
}

/** Agentes mais frequentes, por tubo com resultado. Opcionalmente só de algumas visitas. */
export function agentesFrequentes(h: HistoricoPropriedade, visitaIds?: string[]): { agentes: FrequenciaAgente[]; tubosComResultado: number } {
  const filtro = visitaIds ? new Set(visitaIds) : null;
  const tubos = h.tubos.filter((t) => (!filtro || filtro.has(t.visita_id)) && (t.agentes.length || t.semCrescimento));
  const cont = new Map<string, number>();
  for (const t of tubos) for (const a of new Set(t.agentes)) cont.set(a, (cont.get(a) ?? 0) + 1);
  const agentes = [...cont.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([agente, n]) => ({ agente, n, pct: tubos.length ? (n / tubos.length) * 100 : 0 }));
  return { agentes, tubosComResultado: tubos.length };
}

export interface PerfilAntibiotico {
  antibiotico: string;
  testes: number;
  contagem: Record<ResultadoAntibiograma, number>;
  /** % resistente sobre os testes. */
  pctResistente: number;
}

/** Perfil de resistência: por antibiótico, quantos antibiogramas deram S, I ou R. */
export function perfilResistencia(h: HistoricoPropriedade, visitaIds?: string[]): PerfilAntibiotico[] {
  const filtro = visitaIds ? new Set(visitaIds) : null;
  const mapa = new Map<string, PerfilAntibiotico>();
  for (const ab of h.antibiogramas) {
    if (filtro && !filtro.has(ab.visita_id)) continue;
    for (const r of ab.resultados) {
      const p = mapa.get(r.antibiotico) ?? { antibiotico: r.antibiotico, testes: 0, contagem: { Sensível: 0, Intermediário: 0, Resistente: 0 }, pctResistente: 0 };
      p.testes++;
      p.contagem[r.resultado]++;
      mapa.set(r.antibiotico, p);
    }
  }
  return [...mapa.values()]
    .map((p) => ({ ...p, pctResistente: p.testes ? (p.contagem.Resistente / p.testes) * 100 : 0 }))
    .sort((a, b) => b.pctResistente - a.pctResistente || a.antibiotico.localeCompare(b.antibiotico, 'pt-BR'));
}
