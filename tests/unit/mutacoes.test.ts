import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/db';
import { contarPendentes, definirSessao, excluir, salvar } from '../../src/sync/mutacoes';
import { bancoNovo } from './ajuda';

describe('fila de operações (outbox)', () => {
  beforeEach(async () => {
    await bancoNovo();
    definirSessao('vet-1', 'org-1');
  });

  it('grava o registro local e cria uma operação com UUID, HLC e versão base', async () => {
    const id = await salvar('propriedade', { nome: 'Logradouro', municipio: 'Queimadas', uf: 'PB' });
    const p = await db.propriedade.get(id);
    expect(p).toMatchObject({ nome: 'Logradouro', versao: 0, organizacao_id: 'org-1', atualizado_por: 'vet-1', excluido_em: null });
    const ops = await db.fila_ops.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0].op_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ops[0]).toMatchObject({ tabela: 'propriedade', registro_id: id, versao_base: 0, status: 'pendente' });
    expect(ops[0].campos).toMatchObject({ nome: 'Logradouro', id });
  });

  it('agrupa edições seguidas do mesmo registro numa operação só (CMT trocado 3 vezes)', async () => {
    const id = await salvar('exame_teto', { visita_animal_id: 'va', posicao: 'AE', linha: 1, tamis: null, cmt: null });
    await salvar('exame_teto', { id, cmt: '+' });
    await salvar('exame_teto', { id, cmt: '++' });
    await salvar('exame_teto', { id, cmt: '+++' });
    const ops = await db.fila_ops.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0].campos.cmt).toBe('+++');
    expect(await contarPendentes()).toBe(1);
  });

  it('não agrupa com operação que já está sendo enviada', async () => {
    const id = await salvar('animal', { propriedade_id: 'p', identificacao: '064', ativo: true });
    await db.fila_ops.toCollection().modify({ status: 'enviando' });
    await salvar('animal', { id, raca: 'Girolando' });
    const ops = await db.fila_ops.orderBy('seq').toArray();
    expect(ops).toHaveLength(2);
    expect(ops[1].campos).toMatchObject({ raca: 'Girolando' });
    expect(ops[1].campos).not.toHaveProperty('identificacao');
  });

  it('salvar o mesmo valor não gera operação', async () => {
    const id = await salvar('animal', { propriedade_id: 'p', identificacao: 'Diamante', ativo: true });
    await db.fila_ops.clear();
    await salvar('animal', { id, identificacao: 'Diamante' });
    expect(await db.fila_ops.count()).toBe(0);
  });

  it('mantém a identificação do animal exatamente como digitada', async () => {
    const id = await salvar('animal', { propriedade_id: 'p', identificacao: '064', ativo: true });
    expect((await db.animal.get(id))?.identificacao).toBe('064');
  });

  it('exclusão é lógica: o registro continua no banco com excluido_em', async () => {
    const id = await salvar('animal', { propriedade_id: 'p', identificacao: '102', ativo: true });
    await excluir('animal', id);
    const a = await db.animal.get(id);
    expect(a?.excluido_em).toBeTruthy();
  });

  it('HLCs das operações são crescentes', async () => {
    await salvar('animal', { propriedade_id: 'p', identificacao: '1', ativo: true });
    await salvar('animal', { propriedade_id: 'p', identificacao: '2', ativo: true });
    const [a, b] = await db.fila_ops.orderBy('seq').toArray();
    expect(a.hlc < b.hlc).toBe(true);
  });
});
