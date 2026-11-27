import { APP } from '../config/app';
import { db, gravarMeta, lerMeta } from '../db/db';
import { obterTransporte } from './transporte';

export type ResultadoSync =
  | { tipo: 'ok'; enviadas: number; recebidas: number }
  | { tipo: 'offline' }
  | { tipo: 'sem_servidor' }
  | { tipo: 'erro'; mensagem: string };

type Ouvinte = (estado: EstadoMotor) => void;
export interface EstadoMotor {
  sincronizando: boolean;
  ultimoResultado: ResultadoSync | null;
}

let estado: EstadoMotor = { sincronizando: false, ultimoResultado: null };
const ouvintes = new Set<Ouvinte>();
let emAndamento: Promise<ResultadoSync> | null = null;

function emitir(parcial: Partial<EstadoMotor>) {
  estado = { ...estado, ...parcial };
  ouvintes.forEach((o) => o(estado));
}

export function ouvirMotor(o: Ouvinte) {
  ouvintes.add(o);
  o(estado);
  return () => ouvintes.delete(o);
}

/**
 * Um ciclo de sincronização: envia a fila, depois baixa mudanças desde o cursor.
 * A lógica completa de push/pull e conflitos entra na etapa (c); aqui ficam os gatilhos e o estado.
 */
export function sincronizar(): Promise<ResultadoSync> {
  if (emAndamento) return emAndamento;
  emAndamento = (async (): Promise<ResultadoSync> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return { tipo: 'offline' };
    const t = obterTransporte();
    if (!t) return { tipo: 'sem_servidor' };
    emitir({ sincronizando: true });
    try {
      const ops = await db.fila_ops.where('status').equals('pendente').limit(200).toArray();
      let enviadas = 0;
      if (ops.length) {
        const r = await t.push(ops);
        const aceitas = new Set(r.aceitas);
        await db.transaction('rw', db.fila_ops, async () => {
          for (const op of ops) {
            if (aceitas.has(op.op_id)) {
              await db.fila_ops.delete(op.seq!);
              enviadas++;
            }
          }
          for (const rej of r.rejeitadas) {
            await db.fila_ops.where('op_id').equals(rej.op_id).modify({ status: 'rejeitada', erro: rej.motivo });
          }
        });
      }
      const cursor = (await lerMeta<string>('cursor')) ?? null;
      const p = await t.pull(cursor);
      await db.transaction('rw', [...p.mudancas.map((m) => db.table(m.tabela)), db.meta], async () => {
        for (const m of p.mudancas) await db.table(m.tabela).put(m.registro);
        await gravarMeta('cursor', p.cursor);
      });
      await gravarMeta('ultima_sync', new Date().toISOString());
      return { tipo: 'ok', enviadas, recebidas: p.mudancas.length };
    } catch (e) {
      return { tipo: 'erro', mensagem: e instanceof Error ? e.message : String(e) };
    }
  })().then((r) => {
    emitir({ sincronizando: false, ultimoResultado: r });
    emAndamento = null;
    return r;
  });
  return emAndamento;
}

/**
 * Gatilhos de sincronização. Não usa Background Sync (não funciona no iOS):
 * ao abrir, ao voltar ao app, ao voltar a rede e periodicamente com o app aberto.
 */
export function iniciarGatilhos(): () => void {
  const aoVoltar = () => {
    if (document.visibilityState === 'visible') void sincronizar();
  };
  const aoOnline = () => void sincronizar();
  document.addEventListener('visibilitychange', aoVoltar);
  window.addEventListener('online', aoOnline);
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void sincronizar();
  }, APP.intervaloSyncMs);
  void sincronizar();
  return () => {
    document.removeEventListener('visibilitychange', aoVoltar);
    window.removeEventListener('online', aoOnline);
    window.clearInterval(timer);
  };
}
