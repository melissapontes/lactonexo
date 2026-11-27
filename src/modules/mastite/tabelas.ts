import type { Cmt, Tamis } from '../../db/tipos';
import { GRAUS_CMT, ROTULO_CMT_TABELA, ROTULO_TAMIS, TEXTO_SEM_CRESCIMENTO } from './constantes';

export interface LinhaTabela {
  rotulo: string;
  n: number;
  /** Percentual de 0 a 100 (sem arredondar). */
  pct: number;
}

export interface Tabela {
  linhas: LinhaTabela[];
  total: number;
}

function montar(contagens: [string, number][], total: number): Tabela {
  return {
    linhas: contagens.map(([rotulo, n]) => ({ rotulo, n, pct: total ? (n / total) * 100 : 0 })),
    total,
  };
}

/** Tabela 1: Tamis por teto examinado (tetos sem resultado não entram no total). */
export function tabela1Tamis(exames: { tamis: Tamis | null }[]): Tabela {
  const validos = exames.filter((e) => e.tamis);
  const neg = validos.filter((e) => e.tamis === 'negativo').length;
  return montar(
    [
      [ROTULO_TAMIS.negativo, neg],
      [ROTULO_TAMIS.positivo, validos.length - neg],
    ],
    validos.length,
  );
}

/** Tabela 2: CMT por grau, por teto examinado. */
export function tabela2Cmt(exames: { cmt: Cmt | null }[]): Tabela {
  const validos = exames.filter((e) => e.cmt) as { cmt: Cmt }[];
  return montar(
    GRAUS_CMT.map((g) => [ROTULO_CMT_TABELA[g], validos.filter((e) => e.cmt === g).length]),
    validos.length,
  );
}

export interface ResultadoTubo {
  amostra_id: string;
  /** Nomes dos agentes isolados, exatamente como cadastrados. Vazio + semCrescimento = sem crescimento. */
  agentes: string[];
  semCrescimento: boolean;
}

/**
 * Tabela 3: resultado microbiológico por agente. Denominador = número de tubos com resultado.
 * Um tubo com dois agentes conta em cada agente; nesse caso a soma das linhas passa do total de tubos.
 * Ordem: agentes por frequência (desc), depois nome; "Sem crescimento" por último.
 */
export function tabela3Microbiologia(resultados: ResultadoTubo[]): Tabela & { somaLinhas: number } {
  const comResultado = resultados.filter((r) => r.semCrescimento || r.agentes.length);
  const cont = new Map<string, number>();
  let sem = 0;
  for (const r of comResultado) {
    if (r.semCrescimento && !r.agentes.length) {
      sem++;
      continue;
    }
    for (const a of new Set(r.agentes)) cont.set(a, (cont.get(a) ?? 0) + 1);
  }
  const ordenados = [...cont.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
  const linhas: [string, number][] = [...ordenados, ...(sem ? ([[TEXTO_SEM_CRESCIMENTO, sem]] as [string, number][]) : [])];
  const t = montar(linhas, comResultado.length);
  return { ...t, somaLinhas: linhas.reduce((s, [, n]) => s + n, 0) };
}

/** Percentual no formato do laudo: "93,75%", "3,125%", "0%". Até 3 casas, sem zeros à direita. */
export function formatarPct(pct: number): string {
  return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}%`;
}
