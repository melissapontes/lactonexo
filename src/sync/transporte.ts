import type { Operacao, TabelaSync } from '../db/tipos';

/** Resposta do servidor para um lote enviado. */
export interface RespostaPush {
  /** op_ids aplicados ou já recebidos antes (idempotência). */
  aceitas: string[];
  /** Recusas definitivas (permissão, validação): não são reenviadas. */
  rejeitadas: { op_id: string; motivo: string }[];
  /** Hora do servidor como HLC, para ajustar o relógio local. */
  hlc_servidor: string;
}

export interface Mudanca {
  tabela: TabelaSync;
  registro: Record<string, unknown> & { id: string; versao: number };
}

export interface RespostaPull {
  mudancas: Mudanca[];
  cursor: string;
  tem_mais: boolean;
}

/**
 * Interface entre o app e o servidor. Hoje: API própria. Depois: Supabase (RPC sync_push / sync_pull).
 * Trocar de servidor = escrever outra implementação desta interface.
 */
export interface SyncTransport {
  push(ops: Operacao[]): Promise<RespostaPush>;
  pull(cursor: string | null): Promise<RespostaPull>;
}

let transporte: SyncTransport | null = null;

export function configurarTransporte(t: SyncTransport | null) {
  transporte = t;
}

export function obterTransporte() {
  return transporte;
}

/** Espera antes da próxima tentativa: 2 s, 4 s, 8 s... até 5 min, com variação aleatória de ±20%. */
export function esperaBackoff(tentativas: number, aleatorio = Math.random()): number {
  const base = Math.min(2000 * 2 ** tentativas, 5 * 60 * 1000);
  return Math.round(base * (0.8 + 0.4 * aleatorio));
}
