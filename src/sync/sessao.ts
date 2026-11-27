import { APP } from '../config/app';
import { db, gravarMeta, lerMeta } from '../db/db';
import type { Perfil } from '../db/tipos';
import { definirSessao } from './mutacoes';

/** Endereço da API. Sem ele, o app funciona só no aparelho (modo local, sem login). */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export interface Sessao {
  acesso: string;
  renovacao: string;
  renovacao_expira_em: string;
  usuario: { id: string; nome: string; email: string; perfil: Perfil; organizacao_id: string };
}

type Ouvinte = (s: Sessao | null) => void;
const ouvintes = new Set<Ouvinte>();
let atual: Sessao | null = null;

export function ouvirSessao(o: Ouvinte) {
  ouvintes.add(o);
  return () => ouvintes.delete(o);
}

function publicar(s: Sessao | null) {
  atual = s;
  if (s) definirSessao(s.usuario.id, s.usuario.organizacao_id);
  ouvintes.forEach((o) => o(s));
}

/** Sessão guardada no IndexedDB (não em localStorage). Vale offline até a renovação expirar. */
export async function carregarSessao(): Promise<Sessao | null> {
  const s = (await lerMeta<Sessao>('sessao')) ?? null;
  const valida = s && Date.parse(s.renovacao_expira_em) > Date.now() ? s : null;
  publicar(valida);
  return valida;
}

export const sessaoAtual = () => atual;

async function guardar(s: Sessao) {
  await gravarMeta('sessao', s);
  publicar(s);
}

async function postar<T>(caminho: string, corpo: unknown): Promise<{ ok: boolean; status: number; dados: T }> {
  const r = await fetch(`${API_URL}/api${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  return { ok: r.ok, status: r.status, dados: (await r.json().catch(() => ({}))) as T };
}

export async function entrar(email: string, senha: string): Promise<string | null> {
  const r = await postar<Sessao & { erro?: string }>('/auth/entrar', { email, senha });
  if (!r.ok) return r.dados.erro ?? 'Não foi possível entrar.';
  // Dados locais de outro usuário não podem ser misturados: só reaproveita o banco se for o mesmo usuário ou se estiver vazio de pendências.
  const anterior = await lerMeta<string>('usuario_id');
  if (anterior && anterior !== r.dados.usuario.id) {
    const pend = await db.fila_ops.count();
    if (pend) return `Este aparelho tem ${pend} alterações de outro usuário ainda não sincronizadas. Entre com aquele usuário e sincronize antes.`;
    await limparDadosLocais();
  }
  await gravarMeta('usuario_id', r.dados.usuario.id);
  await guardar(r.dados);
  return null;
}

/** Troca o token de renovação. Retorna false se a sessão expirou de vez (precisa entrar de novo). */
export async function renovarSessao(): Promise<boolean> {
  if (!atual) return false;
  const r = await postar<Sessao>('/auth/renovar', { renovacao: atual.renovacao });
  if (r.ok) {
    await guardar(r.dados);
    return true;
  }
  if (r.status === 401) {
    await gravarMeta('sessao', null);
    publicar(null);
  }
  return false;
}

export async function sair() {
  if (atual) await postar('/auth/sair', { renovacao: atual.renovacao }).catch(() => undefined);
  await gravarMeta('sessao', null);
  publicar(null);
}

async function limparDadosLocais() {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) if (t.name !== 'meta') await t.clear();
    await db.meta.where('chave').anyOf('cursor', 'ultima_sync', 'seed_laudo_naprosa').delete();
  });
}

export const nomeApp = APP.nome;
