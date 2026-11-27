// Uso: npm run server:usuario -- --email vet@exemplo.com --nome "Dra. Fulana" --perfil admin|veterinario [--senha ...]
import { randomBytes, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { gerarHashSenha } from './auth';
import { garantirCatalogoServidor } from './catalogo';
import { migrar, pool } from './db';

const { values: a } = parseArgs({
  options: { email: { type: 'string' }, nome: { type: 'string' }, perfil: { type: 'string', default: 'veterinario' }, senha: { type: 'string' }, organizacao: { type: 'string', default: 'LactoNexo' } },
});
if (!a.email || !a.nome || !['admin', 'veterinario'].includes(a.perfil!)) {
  console.error('Uso: --email <email> --nome <nome> --perfil admin|veterinario [--senha <senha>]');
  process.exit(1);
}
await migrar();
let org = (await pool.query('select id from organizacao order by criado_em limit 1')).rows[0]?.id as string | undefined;
if (!org) org = (await pool.query('insert into organizacao (nome) values ($1) returning id', [a.organizacao])).rows[0].id as string;
await garantirCatalogoServidor(pool, org);
const senha = a.senha ?? randomBytes(9).toString('base64url');
await pool.query(
  `insert into usuario (id, organizacao_id, nome, email, perfil, senha_hash, atualizado_por)
   values ($1, $2, $3, $4, $5, $6, 'sistema')
   on conflict (lower(email)) do update set nome = excluded.nome, perfil = excluded.perfil, senha_hash = excluded.senha_hash, versao = nextval('sync_seq')`,
  [randomUUID(), org, a.nome, a.email, a.perfil, await gerarHashSenha(senha)],
);
console.log(`Usuário ${a.email} (${a.perfil}) pronto.${a.senha ? '' : ` Senha provisória: ${senha}`}`);
await pool.end();
