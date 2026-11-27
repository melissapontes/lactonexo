import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type pg from 'pg';
import { config } from './config';

const segredo = () => new TextEncoder().encode(config.jwtSegredo);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface UsuarioSessao {
  id: string;
  nome: string;
  email: string;
  perfil: 'admin' | 'veterinario';
  organizacao_id: string;
}

/** Argon2id com os parâmetros recomendados pela OWASP (19 MiB, 2 iterações). */
export const gerarHashSenha = (senha: string) => hash(senha, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

async function emitirTokens(db: pg.Pool | pg.PoolClient, u: UsuarioSessao) {
  const acesso = await new SignJWT({ perfil: u.perfil, org: u.organizacao_id })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(u.id)
    .setIssuedAt()
    .setExpirationTime(`${config.acessoMinutos}m`)
    .sign(segredo());
  const renovacao = randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + config.diasSessao * 86_400_000);
  await db.query('insert into sessao_renovacao (usuario_id, token_hash, expira_em) values ($1, $2, $3)', [u.id, sha256(renovacao), expira]);
  return { acesso, renovacao, renovacao_expira_em: expira.toISOString(), usuario: u };
}

export async function entrar(db: pg.Pool, email: string, senha: string) {
  const r = await db.query(
    'select id, nome, email, perfil, organizacao_id, senha_hash from usuario where lower(email) = lower($1) and ativo and excluido_em is null',
    [email.trim()],
  );
  const u = r.rows[0];
  // Verifica mesmo sem usuário, para não revelar quais e-mails existem pelo tempo de resposta.
  const ok = await verify(u?.senha_hash ?? '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', senha).catch(() => false);
  if (!u || !ok) return null;
  const { senha_hash: _h, ...usuario } = u;
  void _h;
  return emitirTokens(db, usuario);
}

/** Troca o token de renovação por um novo par (rotação: o antigo deixa de valer). */
export async function renovar(db: pg.Pool, renovacao: string) {
  const c = await db.connect();
  try {
    await c.query('begin');
    const r = await c.query(
      `update sessao_renovacao s set revogado_em = now()
       from usuario u
       where s.token_hash = $1 and s.revogado_em is null and s.expira_em > now()
         and u.id = s.usuario_id and u.ativo and u.excluido_em is null
       returning u.id, u.nome, u.email, u.perfil, u.organizacao_id`,
      [sha256(renovacao)],
    );
    if (!r.rows[0]) {
      await c.query('rollback');
      return null;
    }
    const t = await emitirTokens(c, r.rows[0]);
    await c.query('commit');
    return t;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

export async function sair(db: pg.Pool, renovacao: string) {
  await db.query('update sessao_renovacao set revogado_em = now() where token_hash = $1', [sha256(renovacao)]);
}

export async function validarAcesso(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, segredo());
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
