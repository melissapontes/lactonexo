import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { gerarHashSenha } from '../../server/src/auth';
import { garantirCatalogoServidor } from '../../server/src/catalogo';
import { migrar } from '../../server/src/db';

/** Recria o banco do E2E com dois vets atribuídos à mesma propriedade e um animal. */
export default async function prepararServidor() {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) return;
  // O banco já existe (a API sobe antes deste preparo); aqui ele é zerado e recriado.
  const db = new pg.Pool({ connectionString: url });
  await db.query('drop schema public cascade; create schema public;');
  await migrar(db);
  const org = (await db.query(`insert into organizacao (nome) values ('E2E') returning id`)).rows[0].id;
  await garantirCatalogoServidor(db, org);
  const hash = await gerarHashSenha('senha-e2e-123');
  const vets: string[] = [];
  for (const [nome, email] of [['Ana Vet', 'ana@e2e.br'], ['Beto Vet', 'beto@e2e.br']]) {
    const id = randomUUID();
    vets.push(id);
    await db.query(`insert into usuario (id, organizacao_id, nome, email, perfil, senha_hash) values ($1,$2,$3,$4,'veterinario',$5)`, [id, org, nome, email, hash]);
  }
  const prop = randomUUID();
  await db.query(`insert into propriedade (id, organizacao_id, propriedade_id, nome, municipio, uf) values ($1,$2,$1,'Fazenda E2E','Queimadas','PB')`, [prop, org]);
  for (const v of vets) {
    await db.query(`insert into atribuicao (id, organizacao_id, propriedade_id, usuario_id) values ($1,$2,$3,$4)`, [randomUUID(), org, prop, v]);
  }
  await db.query(
    `insert into animal (id, organizacao_id, propriedade_id, identificacao, categoria, ativo) values ($1,$2,$3,'064','Vaca em lactação',true)`,
    [randomUUID(), org, prop],
  );
  await db.end();
}
