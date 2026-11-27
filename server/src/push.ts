import type pg from 'pg';
import webpush from 'web-push';
import { APP } from '../../src/config/app';
import { config } from './config';

/**
 * Envio dos avisos por Web Push. Remetente: o nome do app (APP.nome) no título.
 * Cada aviso vai uma vez por usuário (tabela push_enviado). Inscrições mortas (404/410) são removidas.
 */

export interface Inscricao {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface Mensagem {
  titulo: string;
  corpo: string;
  url: string;
  tag: string;
}

export type Enviar = (insc: Inscricao, m: Mensagem) => Promise<void>;

export const pushConfigurado = () => !!(config.vapidPublica && config.vapidPrivada);

export const enviarWebPush: Enviar = async (insc, m) => {
  await webpush.sendNotification(insc, JSON.stringify(m), {
    vapidDetails: { subject: config.vapidContato, publicKey: config.vapidPublica, privateKey: config.vapidPrivada },
    TTL: 24 * 60 * 60,
    urgency: 'normal',
  });
};

export async function inscrever(db: pg.Pool, usuarioId: string, i: Inscricao) {
  if (!i?.endpoint?.startsWith('https://') || !i.keys?.p256dh || !i.keys?.auth) throw new Error('Inscrição inválida');
  await db.query(
    `insert into push_inscricao (endpoint, usuario_id, p256dh, auth) values ($1, $2, $3, $4)
     on conflict (endpoint) do update set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth, falhas = 0`,
    [i.endpoint, usuarioId, i.keys.p256dh, i.keys.auth],
  );
}

export async function cancelar(db: pg.Pool, usuarioId: string, endpoint: string) {
  await db.query('delete from push_inscricao where endpoint = $1 and usuario_id = $2', [endpoint, usuarioId]);
}

export function hojeNoFuso(agora = new Date(), fuso = config.fuso): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

/** Uma rodada: calcula os avisos pendentes e envia. Retorna quantas notificações saíram. */
export async function enviarAvisos(db: pg.Pool, enviar: Enviar = enviarWebPush, hoje = hojeNoFuso()): Promise<number> {
  const avisos = (
    await db.query<{ usuario_id: string; chave: string; titulo: string; corpo: string; url: string }>(
      'select * from avisos_pendentes($1::date, $2, $3)',
      [hoje, config.diasLaudoPendente, config.diasAntecedenciaRevisita],
    )
  ).rows;
  let enviadas = 0;
  for (const a of avisos) {
    const inscs = (await db.query('select endpoint, p256dh, auth from push_inscricao where usuario_id = $1', [a.usuario_id])).rows;
    // Sem aparelho inscrito: não marca como enviado (vai quando o vet ativar). O aviso já aparece no app.
    if (!inscs.length) continue;
    let algum = false;
    for (const i of inscs) {
      try {
        await enviar(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          { titulo: `${APP.nome}: ${a.titulo}`, corpo: a.corpo, url: a.url, tag: a.chave },
        );
        algum = true;
        enviadas++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.query('delete from push_inscricao where endpoint = $1', [i.endpoint]);
        else await db.query('update push_inscricao set falhas = falhas + 1 where endpoint = $1', [i.endpoint]);
      }
    }
    if (algum) await db.query('insert into push_enviado (usuario_id, chave) values ($1, $2) on conflict do nothing', [a.usuario_id, a.chave]);
  }
  return enviadas;
}

/** Roda os avisos periodicamente (servidor Node). No Supabase, vira um cron (pg_cron + Edge Function). */
export function agendarAvisos(db: pg.Pool) {
  if (!pushConfigurado() || config.avisosMinutos <= 0) return () => undefined;
  let rodando = false;
  const rodada = async () => {
    if (rodando) return;
    rodando = true;
    try {
      const n = await enviarAvisos(db);
      if (n) console.log(`Avisos: ${n} notificação(ões) enviada(s).`);
    } catch (e) {
      console.error('Avisos: falha na rodada', e);
    } finally {
      rodando = false;
    }
  };
  const t = setInterval(rodada, config.avisosMinutos * 60_000);
  void rodada();
  return () => clearInterval(t);
}
