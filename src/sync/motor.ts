import { APP } from '../config/app';
import { db, gravarMeta, lerMeta } from '../db/db';
import type { Operacao, TabelaSync } from '../db/tipos';
import { TABELAS_SYNC } from '../db/tipos';
import { hlcDeTexto } from './hlc';
import { ajustarRelogio } from './mutacoes';
import { enviarFotos } from './fotos-envio';
import { obterTransporte, esperaBackoff, type Mudanca, type SyncTransport } from './transporte';

export type ResultadoSync =
  | { tipo: 'ok'; enviadas: number; recebidas: number }
  | { tipo: 'offline' }
  | { tipo: 'sem_servidor' }
  | { tipo: 'sessao'; mensagem: string }
  | { tipo: 'erro'; mensagem: string };

type Ouvinte = (estado: EstadoMotor) => void;
export interface EstadoMotor {
  sincronizando: boolean;
  ultimoResultado: ResultadoSync | null;
}

let estado: EstadoMotor = { sincronizando: false, ultimoResultado: null };
const ouvintes = new Set<Ouvinte>();
let emAndamento: Promise<ResultadoSync> | null = null;
let timerRetentativa: ReturnType<typeof setTimeout> | undefined;

/** Campos que só existem neste aparelho (estado do envio do arquivo da foto). */
const CAMPOS_LOCAIS: Partial<Record<TabelaSync, string[]>> = { foto: ['envio', 'bytes_enviados'] };

function emitir(parcial: Partial<EstadoMotor>) {
  estado = { ...estado, ...parcial };
  ouvintes.forEach((o) => o(estado));
}

export function ouvirMotor(o: Ouvinte) {
  ouvintes.add(o);
  o(estado);
  return () => ouvintes.delete(o);
}

function agendarRetentativa(ms: number) {
  clearTimeout(timerRetentativa);
  timerRetentativa = setTimeout(() => void sincronizar(), Math.max(ms, 1000));
}

/** Envia a fila em lotes. Uma operação só sai da fila quando o servidor confirma. */
async function enviarFila(t: SyncTransport): Promise<number> {
  let enviadas = 0;
  for (;;) {
    const agora = Date.now();
    const ops = await db.fila_ops
      .where('status')
      .equals('pendente')
      .filter((o) => o.proxima_tentativa_em <= agora)
      .limit(200)
      .toArray();
    if (!ops.length) break;
    const seqs = ops.map((o) => o.seq!);
    // "enviando" impede que uma edição nova seja agrupada numa operação que já está a caminho.
    await db.fila_ops.where('seq').anyOf(seqs).modify({ status: 'enviando' });

    let r;
    try {
      r = await t.push(ops);
    } catch (e) {
      await db.transaction('rw', db.fila_ops, async () => {
        for (const o of ops) {
          await db.fila_ops.update(o.seq!, { status: 'pendente', tentativas: o.tentativas + 1, proxima_tentativa_em: Date.now() + esperaBackoff(o.tentativas) });
        }
      });
      agendarRetentativa(esperaBackoff(ops[0].tentativas));
      throw e;
    }

    const aceitas = new Set(r.aceitas);
    const adiadas = new Set(r.adiadas ?? []);
    const rejeitadas = new Map(r.rejeitadas.map((x) => [x.op_id, x.motivo]));
    await db.transaction('rw', db.fila_ops, async () => {
      for (const o of ops) {
        if (aceitas.has(o.op_id)) {
          await db.fila_ops.delete(o.seq!);
          enviadas++;
        } else if (rejeitadas.has(o.op_id)) {
          await db.fila_ops.update(o.seq!, { status: 'rejeitada', erro: rejeitadas.get(o.op_id) });
        } else {
          const espera = esperaBackoff(o.tentativas);
          await db.fila_ops.update(o.seq!, { status: 'pendente', tentativas: o.tentativas + 1, proxima_tentativa_em: Date.now() + espera, erro: adiadas.has(o.op_id) ? 'Aguardando registro pai' : undefined });
        }
      }
    });
    if (r.hlc_servidor) await ajustarRelogio(hlcDeTexto(r.hlc_servidor));
    if (adiadas.size) agendarRetentativa(esperaBackoff(0));
    if (!aceitas.size) break;
  }
  return enviadas;
}

/**
 * Grava o que veio do servidor. Se ainda houver edição local não enviada do mesmo registro,
 * ela é reaplicada por cima, para nunca perder o que o vet acabou de digitar.
 */
export async function aplicarMudancas(mudancas: Mudanca[]) {
  if (!mudancas.length) return;
  const tabelas = [...new Set(mudancas.map((m) => m.tabela))].filter((t) => (TABELAS_SYNC as readonly string[]).includes(t));
  await db.transaction('rw', [...tabelas.map((t) => db.table(t)), db.fila_ops], async () => {
    for (const m of mudancas) {
      if (!tabelas.includes(m.tabela)) continue;
      const tbl = db.table(m.tabela);
      const locais: Operacao[] = await db.fila_ops
        .where('[tabela+registro_id]')
        .equals([m.tabela, m.registro.id])
        .filter((o) => o.status !== 'rejeitada')
        .sortBy('seq');
      let reg: Record<string, unknown> = { ...m.registro };
      for (const o of locais) reg = { ...reg, ...o.campos, versao: m.registro.versao };
      const manter = CAMPOS_LOCAIS[m.tabela];
      if (manter) {
        const atual = (await tbl.get(m.registro.id)) as Record<string, unknown> | undefined;
        for (const c of manter) if (atual && atual[c] !== undefined) reg[c] = atual[c];
      }
      await tbl.put(reg);
    }
  });
}

async function baixarTudo(t: SyncTransport): Promise<number> {
  let recebidas = 0;
  for (;;) {
    const cursor = (await lerMeta<string>('cursor')) ?? null;
    const p = await t.pull(cursor);
    await aplicarMudancas(p.mudancas);
    await gravarMeta('cursor', p.cursor);
    recebidas += p.mudancas.length;
    if (!p.tem_mais) break;
  }
  return recebidas;
}

/** "Baixar para visita": traz a propriedade inteira (animais, visitas, histórico) para uso offline. */
export async function baixarPropriedade(propriedade_id: string): Promise<number> {
  const t = obterTransporte();
  if (!t) throw new Error('Servidor não configurado.');
  let cursor: string | null = null;
  let total = 0;
  for (;;) {
    const p = await t.pull(cursor, propriedade_id);
    await aplicarMudancas(p.mudancas);
    total += p.mudancas.length;
    cursor = p.cursor;
    if (!p.tem_mais) break;
  }
  await gravarMeta(`baixado:${propriedade_id}`, new Date().toISOString());
  return total;
}

/** Propriedades recém-atribuídas a este vet são baixadas inteiras (o cursor não traz o histórico antigo). */
async function baixarNovasAtribuicoes(usuarioId: string) {
  const minhas = await db.atribuicao.where('usuario_id').equals(usuarioId).filter((a) => !a.excluido_em).toArray();
  for (const a of minhas) {
    if (!(await lerMeta(`baixado:${a.propriedade_id}`))) await baixarPropriedade(a.propriedade_id);
  }
}

/**
 * Um ciclo: envia a fila, baixa as mudanças desde o cursor e envia fotos. Nunca roda dois ao mesmo tempo.
 * forcar: ignora a espera entre tentativas (botão "Sincronizar agora" e volta da conexão).
 */
export function sincronizar(opcoes: { forcar?: boolean } = {}): Promise<ResultadoSync> {
  if (emAndamento) return emAndamento;
  emAndamento = (async (): Promise<ResultadoSync> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return { tipo: 'offline' };
    const t = obterTransporte();
    if (!t) return { tipo: 'sem_servidor' };
    emitir({ sincronizando: true });
    if (opcoes.forcar) await db.fila_ops.where('status').equals('pendente').modify({ proxima_tentativa_em: 0 });
    try {
      const enviadas = await enviarFila(t);
      const recebidas = await baixarTudo(t);
      const usuario = await lerMeta<string>('usuario_id');
      if (usuario) await baixarNovasAtribuicoes(usuario);
      await enviarFotos();
      await gravarMeta('ultima_sync', new Date().toISOString());
      return { tipo: 'ok', enviadas, recebidas };
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e);
      if (e instanceof Error && e.name === 'ErroSessao') return { tipo: 'sessao', mensagem };
      return { tipo: 'erro', mensagem };
    }
  })().then((r) => {
    emitir({ sincronizando: false, ultimoResultado: r });
    emAndamento = null;
    return r;
  });
  return emAndamento;
}

/** Operações que ficaram "enviando" porque o app fechou no meio do envio voltam para a fila. */
export async function recuperarFilaInterrompida() {
  await db.fila_ops.where('status').equals('enviando').modify({ status: 'pendente' });
}

/**
 * Gatilhos de sincronização. Não usa Background Sync (não funciona no iOS):
 * ao abrir, ao voltar ao app, ao voltar a rede e periodicamente com o app aberto.
 */
export function iniciarGatilhos(): () => void {
  const aoVoltar = () => {
    if (document.visibilityState === 'visible') void sincronizar();
  };
  const aoOnline = () => void sincronizar({ forcar: true });
  document.addEventListener('visibilitychange', aoVoltar);
  window.addEventListener('online', aoOnline);
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void sincronizar();
  }, APP.intervaloSyncMs);
  void recuperarFilaInterrompida().then(() => sincronizar());
  return () => {
    document.removeEventListener('visibilitychange', aoVoltar);
    window.removeEventListener('online', aoOnline);
    window.clearInterval(timer);
    clearTimeout(timerRetentativa);
  };
}
