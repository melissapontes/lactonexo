import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type pg from 'pg';
import { entrar, renovar, sair, validarAcesso } from './auth';
import { config } from './config';
import { cancelar, inscrever, pushConfigurado, type Inscricao } from './push';

type Vars = { Variables: { usuarioId: string } };

const PARTE_MAX = 512 * 1024;

/** API fina: autenticação + chamadas às funções SQL de sync. Substituível pelo Supabase (RPC). */
export function criarApp(db: pg.Pool) {
  const app = new Hono<Vars>().basePath('/api');

  app.use('*', secureHeaders());
  app.use('*', cors({ origin: config.origens, allowHeaders: ['Content-Type', 'Authorization', 'X-Offset'], allowMethods: ['GET', 'POST', 'PUT'] }));

  app.get('/saude', (c) => c.json({ ok: true }));

  app.post('/auth/entrar', async (c) => {
    const { email, senha } = await c.req.json<{ email?: string; senha?: string }>();
    if (!email || !senha) return c.json({ erro: 'Informe e-mail e senha.' }, 400);
    const t = await entrar(db, email, senha);
    return t ? c.json(t) : c.json({ erro: 'E-mail ou senha incorretos.' }, 401);
  });

  app.post('/auth/renovar', async (c) => {
    const { renovacao } = await c.req.json<{ renovacao?: string }>();
    const t = renovacao ? await renovar(db, renovacao) : null;
    return t ? c.json(t) : c.json({ erro: 'Sessão expirada. Entre de novo.' }, 401);
  });

  app.post('/auth/sair', async (c) => {
    const { renovacao } = await c.req.json<{ renovacao?: string }>();
    if (renovacao) await sair(db, renovacao);
    return c.json({ ok: true });
  });

  // Daqui para baixo, exige token de acesso.
  app.use('/sync/*', exigirLogin);
  app.use('/fotos/*', exigirLogin);
  app.use('/push/*', exigirLogin);

  /** Chave pública VAPID para o aparelho se inscrever. 503 = push não configurado no servidor. */
  app.get('/push/chave', (c) => (pushConfigurado() ? c.json({ chave: config.vapidPublica }) : c.json({ erro: 'Notificações não configuradas no servidor.' }, 503)));

  app.post('/push/inscrever', async (c) => {
    if (!pushConfigurado()) return c.json({ erro: 'Notificações não configuradas no servidor.' }, 503);
    try {
      await inscrever(db, c.get('usuarioId'), await c.req.json<Inscricao>());
    } catch {
      return c.json({ erro: 'Inscrição inválida.' }, 400);
    }
    return c.json({ ok: true });
  });

  app.post('/push/cancelar', async (c) => {
    const { endpoint } = await c.req.json<{ endpoint?: string }>();
    if (endpoint) await cancelar(db, c.get('usuarioId'), endpoint);
    return c.json({ ok: true });
  });

  app.post('/sync/push', async (c) => {
    const { ops } = await c.req.json<{ ops: unknown[] }>();
    if (!Array.isArray(ops) || ops.length > 500) return c.json({ erro: 'Lote inválido.' }, 400);
    const r = await db.query('select sync_push($1, $2) as r', [c.get('usuarioId'), JSON.stringify(ops)]);
    return c.json(r.rows[0].r);
  });

  app.post('/sync/pull', async (c) => {
    const { cursor, propriedade_id } = await c.req.json<{ cursor?: string | null; propriedade_id?: string }>();
    const r = await db.query('select sync_pull($1, $2, 500, $3) as r', [c.get('usuarioId'), cursor ? Number(cursor) : 0, propriedade_id ?? null]);
    return c.json(r.rows[0].r);
  });

  /** Estado do envio de uma foto: quantos bytes o servidor já tem (para retomar). */
  app.get('/fotos/:id', async (c) => {
    const r = await db.query('select bytes_recebidos, completo from foto_arquivo where foto_id = $1', [c.req.param('id')]);
    return c.json(r.rows[0] ?? { bytes_recebidos: 0, completo: false });
  });

  /** Recebe uma parte do arquivo em X-Offset. Partes repetidas são ignoradas (idempotente). */
  app.put('/fotos/:id', async (c) => {
    const id = c.req.param('id');
    const offset = Number(c.req.header('X-Offset') ?? 0);
    const total = Number(c.req.query('total') ?? 0);
    const tipo = c.req.header('Content-Type') ?? 'image/jpeg';
    const parte = Buffer.from(await c.req.arrayBuffer());
    if (parte.length > PARTE_MAX || !total || total > 15 * 1024 * 1024) return c.json({ erro: 'Parte inválida.' }, 400);
    const acesso = await db.query(
      `select 1 from foto f where f.id = $1 and (
         exists (select 1 from usuario u where u.id = $2 and u.perfil = 'admin')
         or sync_tem_acesso($2, false, f.propriedade_id))`,
      [id, c.get('usuarioId')],
    );
    if (!acesso.rowCount) return c.json({ erro: 'Foto não sincronizada ou sem permissão.' }, 409);
    const r = await db.query(
      `insert into foto_arquivo (foto_id, tipo, bytes_total) values ($1, $2, $3)
       on conflict (foto_id) do update set tipo = excluded.tipo
       returning bytes_recebidos`,
      [id, tipo, total],
    );
    const recebidos = r.rows[0].bytes_recebidos as number;
    if (offset === recebidos) {
      await db.query(
        `update foto_arquivo set dados = dados || $2, bytes_recebidos = bytes_recebidos + $3,
           completo = (bytes_recebidos + $3) >= bytes_total, atualizado_em = now() where foto_id = $1`,
        [id, parte, parte.length],
      );
    } else if (offset > recebidos) {
      return c.json({ erro: 'Parte fora de ordem.', bytes_recebidos: recebidos }, 409);
    }
    const fim = await db.query('select bytes_recebidos, completo from foto_arquivo where foto_id = $1', [id]);
    return c.json(fim.rows[0]);
  });

  app.onError((e, c) => {
    console.error(e);
    return c.json({ erro: 'Erro no servidor.' }, 500);
  });

  return app;
}

async function exigirLogin(c: import('hono').Context<Vars>, next: () => Promise<void>) {
  const h = c.req.header('Authorization') ?? '';
  const id = h.startsWith('Bearer ') ? await validarAcesso(h.slice(7)) : null;
  if (!id) return c.json({ erro: 'Sessão expirada.' }, 401);
  c.set('usuarioId', id);
  await next();
}
