import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gerarHashSenha } from '../src/auth';
import { criarApp } from '../src/app';
import { migrar } from '../src/db';
import { garantirCatalogoServidor } from '../src/catalogo';
import { idRegraPadrao } from '../../src/modules/mastite/regras-padrao';

/**
 * Testes do servidor contra um PostgreSQL real.
 * DATABASE_URL_TESTE aponta para um servidor; o banco "lactonexo_teste" é recriado a cada execução.
 */
const base = process.env.DATABASE_URL_TESTE;
const d = base ? describe : describe.skip;

let db: pg.Pool;
let org: string;
let vetA: string;
let vetB: string;
let vetC: string; // sem acesso
let admin: string;
let prop: string;

let hlcN = 0;
const hlc = (ms: number, disp = 'a') => `${String(ms).padStart(15, '0')}-${String(hlcN++ % 99999).padStart(5, '0')}-${disp}`;
const op = (tabela: string, registro_id: string, campos: Record<string, unknown>, h: string, versao_base = 0) => ({
  op_id: randomUUID(), tabela, registro_id, campos: { id: registro_id, ...campos }, hlc: h, versao_base,
});
const push = async (u: string, ops: unknown[]) => (await db.query('select sync_push($1, $2) r', [u, JSON.stringify(ops)])).rows[0].r;
const pull = async (u: string, cursor = 0, p: string | null = null) => (await db.query('select sync_pull($1, $2, 500, $3) r', [u, cursor, p])).rows[0].r;
const versao = async (t: string, id: string) => Number((await db.query(`select versao from ${t} where id = $1`, [id])).rows[0].versao);

d('sync no servidor', () => {
  beforeAll(async () => {
    const adminDb = new pg.Pool({ connectionString: base });
    await adminDb.query('drop database if exists lactonexo_teste with (force)');
    await adminDb.query('create database lactonexo_teste');
    await adminDb.end();
    const url = new URL(base!);
    url.pathname = '/lactonexo_teste';
    db = new pg.Pool({ connectionString: url.toString() });
    await migrar(db);
    org = (await db.query(`insert into organizacao (nome) values ('Teste') returning id`)).rows[0].id;
    const criar = async (nome: string, perfil: string) => {
      const id = randomUUID();
      await db.query(
        `insert into usuario (id, organizacao_id, nome, email, perfil, senha_hash) values ($1,$2,$3,$4,$5,$6)`,
        [id, org, nome, `${nome}@teste.br`, perfil, await gerarHashSenha('senha-forte-123')],
      );
      return id;
    };
    vetA = await criar('ana', 'veterinario');
    vetB = await criar('beto', 'veterinario');
    vetC = await criar('caio', 'veterinario');
    admin = await criar('admin', 'admin');
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    prop = randomUUID();
    await push(admin, [op('propriedade', prop, { nome: 'Logradouro' }, hlc(1, 'adm'))]);
    for (const u of [vetA, vetB]) await push(admin, [op('atribuicao', randomUUID(), { usuario_id: u, propriedade_id: prop }, hlc(1, 'adm'))]);
  });

  async function exameNovo() {
    const visita = randomUUID(), animal = randomUUID(), va = randomUUID(), ex = randomUUID();
    const r = await push(vetA, [
      op('animal', animal, { propriedade_id: prop, identificacao: '064', ativo: true }, hlc(10)),
      op('visita', visita, { propriedade_id: prop, data: '2026-09-29', status: 'em_campo' }, hlc(10)),
      op('visita_animal', va, { visita_id: visita, animal_id: animal, ordem: 1 }, hlc(10)),
      op('exame_teto', ex, { visita_animal_id: va, posicao: 'AE', linha: 1, tamis: null, cmt: null }, hlc(10)),
    ]);
    expect(r.rejeitadas).toEqual([]);
    return { visita, animal, va, ex, versao: await versao('exame_teto', ex) };
  }

  it('aplica um lote e é idempotente ao reenviar', async () => {
    const animal = randomUUID();
    const o = op('animal', animal, { propriedade_id: prop, identificacao: 'Maravilha 262', ativo: true }, hlc(5));
    const r1 = await push(vetA, [o]);
    const r2 = await push(vetA, [o]);
    expect(r1.aceitas).toEqual([o.op_id]);
    expect(r2.aceitas).toEqual([o.op_id]);
    const linhas = await db.query('select identificacao, propriedade_id, atualizado_por from animal where id = $1', [animal]);
    expect(linhas.rows).toEqual([{ identificacao: 'Maravilha 262', propriedade_id: prop, atualizado_por: vetA }]);
    expect((await db.query('select count(*)::int n from sync_operacao where op_id = $1', [o.op_id])).rows[0].n).toBe(1);
  });

  it('filhas herdam a propriedade e filho antes do pai é adiado', async () => {
    const { ex } = await exameNovo();
    expect((await db.query('select propriedade_id from exame_teto where id = $1', [ex])).rows[0].propriedade_id).toBe(prop);
    const orfa = op('exame_teto', randomUUID(), { visita_animal_id: randomUUID(), linha: 1 }, hlc(11));
    const r = await push(vetA, [orfa]);
    expect(r.adiadas).toEqual([orfa.op_id]);
  });

  it('vet sem atribuição é recusado e não enxerga a propriedade', async () => {
    const o = op('animal', randomUUID(), { propriedade_id: prop, identificacao: 'X', ativo: true }, hlc(12));
    const r = await push(vetC, [o]);
    expect(r.rejeitadas[0]).toMatchObject({ op_id: o.op_id, motivo: 'Sem permissão nesta propriedade' });
    const p = await pull(vetC);
    expect(p.mudancas.filter((m: { tabela: string }) => m.tabela === 'propriedade')).toEqual([]);
  });

  it('pull traz só o que o vet pode ver, sem hash de senha, e avança o cursor', async () => {
    await exameNovo();
    const p = await pull(vetA);
    const tabelas = new Set(p.mudancas.map((m: { tabela: string }) => m.tabela));
    expect(tabelas).toContain('exame_teto');
    expect(JSON.stringify(p)).not.toContain('senha_hash');
    const p2 = await pull(vetA, Number(p.cursor));
    expect(p2.mudancas).toEqual([]);
  });

  it('dois vets offline no mesmo campo clínico: vence o mais recente e o outro vira conflito', async () => {
    const { ex, versao: base0 } = await exameNovo();
    // Ambos baixaram a versão base0 e editaram o CMT sem sinal.
    await push(vetA, [op('exame_teto', ex, { cmt: '++' }, hlc(100, 'ana'), base0)]);
    await push(vetB, [op('exame_teto', ex, { cmt: '+++' }, hlc(200, 'beto'), base0)]);
    expect((await db.query('select cmt from exame_teto where id = $1', [ex])).rows[0].cmt).toBe('+++');
    const c = (await db.query('select * from conflito where registro_id = $1', [ex])).rows;
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ campo: 'cmt', valor_vencedor: '+++', valor_perdedor: '++', autor_vencedor: vetB, autor_perdedor: vetA, status: 'pendente', propriedade_id: prop });
    const aud = (await db.query(`select valor_novo, aplicado from auditoria where registro_id = $1 and campo = 'cmt' order by id`, [ex])).rows;
    expect(aud.map((a) => [a.valor_novo, a.aplicado])).toEqual([[null, true], ['++', true], ['+++', true]]);
    // Os dois vets recebem o conflito no pull.
    for (const u of [vetA, vetB]) {
      expect((await pull(u)).mudancas.some((m: { tabela: string }) => m.tabela === 'conflito')).toBe(true);
    }
  });

  it('edição mais antiga que chega depois não sobrescreve, mas fica registrada como conflito', async () => {
    const { ex, versao: base0 } = await exameNovo();
    await push(vetB, [op('exame_teto', ex, { tamis: 'positivo' }, hlc(300, 'beto'), base0)]);
    await push(vetA, [op('exame_teto', ex, { tamis: 'negativo' }, hlc(250, 'ana'), base0)]);
    expect((await db.query('select tamis from exame_teto where id = $1', [ex])).rows[0].tamis).toBe('positivo');
    const c = (await db.query('select valor_vencedor, valor_perdedor from conflito where registro_id = $1', [ex])).rows;
    expect(c).toEqual([{ valor_vencedor: 'positivo', valor_perdedor: 'negativo' }]);
  });

  it('campos diferentes do mesmo registro: os dois valem, sem conflito', async () => {
    const { ex, versao: base0 } = await exameNovo();
    await push(vetA, [op('exame_teto', ex, { tamis: 'negativo' }, hlc(400, 'ana'), base0)]);
    await push(vetB, [op('exame_teto', ex, { cmt: 'T' }, hlc(401, 'beto'), base0)]);
    expect((await db.query('select tamis, cmt from exame_teto where id = $1', [ex])).rows[0]).toEqual({ tamis: 'negativo', cmt: 'T' });
    expect((await db.query('select count(*)::int n from conflito where registro_id = $1', [ex])).rows[0].n).toBe(0);
  });

  it('o mesmo vet em dois aparelhos não gera conflito', async () => {
    const { ex, versao: base0 } = await exameNovo();
    await push(vetA, [op('exame_teto', ex, { cmt: '+' }, hlc(500, 'cel'), base0)]);
    await push(vetA, [op('exame_teto', ex, { cmt: '++' }, hlc(501, 'tablet'), base0)]);
    expect((await db.query('select count(*)::int n from conflito where registro_id = $1', [ex])).rows[0].n).toBe(0);
  });

  it('exclusão contra edição concorrente de outra pessoa: a edição vence', async () => {
    const { animal } = await exameNovo();
    const b = await versao('animal', animal);
    await push(vetB, [op('animal', animal, { raca: 'Girolando' }, hlc(600, 'beto'), b)]);
    await push(vetA, [op('animal', animal, { excluido_em: '2026-11-27T10:00:00Z' }, hlc(601, 'ana'), b)]);
    const a = (await db.query('select raca, excluido_em from animal where id = $1', [animal])).rows[0];
    expect(a).toEqual({ raca: 'Girolando', excluido_em: null });
    expect((await db.query(`select campo from conflito where registro_id = $1`, [animal])).rows).toEqual([{ campo: 'excluido_em' }]);
  });

  it('vet que cria uma propriedade ganha acesso a ela', async () => {
    const nova = randomUUID();
    const r = await push(vetC, [op('propriedade', nova, { nome: 'Sítio do Caio' }, hlc(700, 'caio'))]);
    expect(r.rejeitadas).toEqual([]);
    const p = await pull(vetC);
    expect(p.mudancas.some((m: { tabela: string; registro: { id: string } }) => m.tabela === 'propriedade' && m.registro.id === nova)).toBe(true);
  });

  it('vet não altera usuários nem atribuições', async () => {
    const r = await push(vetA, [op('atribuicao', randomUUID(), { usuario_id: vetA, propriedade_id: randomUUID() }, hlc(800))]);
    expect(r.rejeitadas).toHaveLength(1);
  });

  it('"Baixar para visita" traz a propriedade inteira, mesmo com cursor antigo', async () => {
    await exameNovo();
    const p = await pull(vetA, 0, prop);
    const tabelas = new Set(p.mudancas.map((m: { tabela: string }) => m.tabela));
    expect([...tabelas]).toEqual(expect.arrayContaining(['propriedade', 'animal', 'visita', 'visita_animal', 'exame_teto']));
    expect(tabelas.has('usuario')).toBe(false);
  });

  it('regras padrão têm os mesmos ids do app; só admin altera; vet grava a resposta à sugestão', async () => {
    await garantirCatalogoServidor(db, org);
    const idRegra = idRegraPadrao('cmt_consecutivo');
    expect((await db.query('select tipo, parametros from regra where id = $1', [idRegra])).rows[0]).toEqual({
      tipo: 'cmt_consecutivo',
      parametros: { grau_minimo: '++', visitas: 2 },
    });
    const negado = await push(vetA, [op('regra', idRegra, { ativa: false }, hlc(50), 1)]);
    expect(negado.rejeitadas).toHaveLength(1);
    const ok = await push(admin, [op('regra', idRegra, { parametros: { grau_minimo: '+++', visitas: 3 } }, hlc(51, 'adm'), 1)]);
    expect(ok.rejeitadas).toEqual([]);

    const { animal, visita } = await exameNovo();
    const alerta = randomUUID();
    const campos = { regra_id: idRegra, animal_id: animal, visita_id: visita, mensagem: 'Teto AE', status: 'dispensado' };
    // Os dois vets respondem a mesma sugestão offline (mesmo id): não duplica.
    expect((await push(vetA, [op('alerta', alerta, campos, hlc(60))])).rejeitadas).toEqual([]);
    expect((await push(vetB, [op('alerta', alerta, { ...campos, status: 'conduta_registrada' }, hlc(61, 'b'))])).rejeitadas).toEqual([]);
    const linhas = (await db.query('select status from alerta where id = $1', [alerta])).rows;
    expect(linhas).toEqual([{ status: 'conduta_registrada' }]);
  });

  describe('API HTTP', () => {
    type Tokens = { acesso: string; renovacao: string; usuario: { id: string; perfil: string } };
    const app = () => criarApp(db);
    const json = (b: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

    it('login, push com token, renovação com rotação e recusa sem token', async () => {
      const ruim = await app().request('/api/auth/entrar', json({ email: 'ana@teste.br', senha: 'errada' }));
      expect(ruim.status).toBe(401);
      const r = await app().request('/api/auth/entrar', json({ email: 'ANA@teste.br', senha: 'senha-forte-123' }));
      expect(r.status).toBe(200);
      const t = (await r.json()) as Tokens;
      expect(t.usuario).toMatchObject({ id: vetA, perfil: 'veterinario' });

      expect((await app().request('/api/sync/pull', json({ cursor: null }))).status).toBe(401);
      const ok = await app().request('/api/sync/pull', { ...json({ cursor: null }), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t.acesso}` } });
      expect(ok.status).toBe(200);

      const n = await app().request('/api/auth/renovar', json({ renovacao: t.renovacao }));
      expect(n.status).toBe(200);
      const repetida = await app().request('/api/auth/renovar', json({ renovacao: t.renovacao }));
      expect(repetida.status).toBe(401);
    });

    it('foto em partes: retoma de onde parou e parte repetida não duplica', async () => {
      const { ex } = await exameNovo();
      const foto = randomUUID();
      await push(vetA, [op('foto', foto, { dono_tabela: 'exame_teto', dono_id: ex, bytes: 10 }, hlc(900))]);
      const t = (await (await app().request('/api/auth/entrar', json({ email: 'ana@teste.br', senha: 'senha-forte-123' }))).json()) as Tokens;
      const h = (offset: number) => ({ Authorization: `Bearer ${t.acesso}`, 'Content-Type': 'image/jpeg', 'X-Offset': String(offset) });
      const parte = (offset: number, bytes: number[]) =>
        app().request(`/api/fotos/${foto}?total=10`, { method: 'PUT', headers: h(offset), body: new Uint8Array(bytes) });
      expect(await (await parte(0, [1, 2, 3, 4])).json()).toEqual({ bytes_recebidos: 4, completo: false });
      // A conexão caiu e o app reenviou a mesma parte: ignorada.
      expect(await (await parte(0, [1, 2, 3, 4])).json()).toEqual({ bytes_recebidos: 4, completo: false });
      const estado = (await (await app().request(`/api/fotos/${foto}`, { headers: h(0) })).json()) as { bytes_recebidos: number };
      expect(estado.bytes_recebidos).toBe(4);
      expect(await (await parte(4, [5, 6, 7, 8, 9, 10])).json()).toEqual({ bytes_recebidos: 10, completo: true });
      const dados = (await db.query('select dados from foto_arquivo where foto_id = $1', [foto])).rows[0].dados as Buffer;
      expect([...dados]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      // Outro vet sem acesso não envia.
      expect((await app().request(`/api/fotos/${randomUUID()}?total=10`, { method: 'PUT', headers: h(0), body: new Uint8Array([1]) })).status).toBe(409);
    });
  });
});
