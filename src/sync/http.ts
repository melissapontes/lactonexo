import type { Operacao } from '../db/tipos';
import { API_URL, renovarSessao, sessaoAtual } from './sessao';
import type { RespostaPull, RespostaPush, SyncTransport } from './transporte';

export class ErroSessao extends Error {}

/** Chamada autenticada; renova o token uma vez se ele tiver expirado. */
export async function chamarApi(caminho: string, init: RequestInit = {}, tentouRenovar = false): Promise<Response> {
  const s = sessaoAtual();
  if (!s) throw new ErroSessao('Sem sessão');
  const r = await fetch(`${API_URL}/api${caminho}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}), Authorization: `Bearer ${s.acesso}` },
  });
  if (r.status === 401 && !tentouRenovar) {
    if (await renovarSessao()) return chamarApi(caminho, init, true);
    throw new ErroSessao('Sessão expirada. Entre de novo para sincronizar.');
  }
  if (!r.ok) throw new Error(`Servidor respondeu ${r.status}`);
  return r;
}

/** Transporte HTTP para a API própria. No Supabase, a mesma interface chama rpc('sync_push'/'sync_pull'). */
export const transporteHttp: SyncTransport = {
  async push(ops: Operacao[]): Promise<RespostaPush> {
    const corpo = ops.map(({ op_id, tabela, registro_id, campos, hlc, versao_base }) => ({ op_id, tabela, registro_id, campos, hlc, versao_base }));
    return (await chamarApi('/sync/push', { method: 'POST', body: JSON.stringify({ ops: corpo }) })).json();
  },
  async pull(cursor: string | null, propriedade_id?: string): Promise<RespostaPull> {
    return (await chamarApi('/sync/pull', { method: 'POST', body: JSON.stringify({ cursor, propriedade_id }) })).json();
  },
};
