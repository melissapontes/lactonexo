import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/db';
import type { Operacao } from '../../src/db/tipos';
import { sincronizar } from '../../src/sync/motor';
import { definirSessao, salvar } from '../../src/sync/mutacoes';
import { configurarTransporte, esperaBackoff, type SyncTransport } from '../../src/sync/transporte';
import { bancoNovo } from './ajuda';

/** Servidor falso idempotente: guarda op_ids já aplicados. */
function servidorFalso() {
  const aplicadas = new Map<string, Operacao>();
  let falharProximo = false;
  const t: SyncTransport & { aplicadas: typeof aplicadas; falhar: () => void } = {
    aplicadas,
    falhar: () => {
      falharProximo = true;
    },
    async push(ops) {
      if (falharProximo) {
        falharProximo = false;
        throw new Error('rede caiu');
      }
      for (const o of ops) if (!aplicadas.has(o.op_id)) aplicadas.set(o.op_id, o);
      return { aceitas: ops.map((o) => o.op_id), rejeitadas: [], hlc_servidor: '0' };
    },
    async pull() {
      return { mudancas: [], cursor: '1', tem_mais: false };
    },
  };
  return t;
}

describe('motor de sync', () => {
  beforeEach(async () => {
    await bancoNovo();
    definirSessao('vet-1', 'org-1');
  });

  it('sem servidor configurado, nada sai da fila', async () => {
    configurarTransporte(null);
    await salvar('propriedade', { nome: 'A' });
    expect(await sincronizar()).toEqual({ tipo: 'sem_servidor' });
    expect(await db.fila_ops.count()).toBe(1);
  });

  it('envia a fila e só remove o que o servidor confirmou', async () => {
    const s = servidorFalso();
    configurarTransporte(s);
    await salvar('propriedade', { nome: 'A' });
    await salvar('propriedade', { nome: 'B' });
    const r = await sincronizar();
    expect(r).toMatchObject({ tipo: 'ok', enviadas: 2 });
    expect(await db.fila_ops.count()).toBe(0);
    expect(s.aplicadas.size).toBe(2);
    expect(await db.meta.get('cursor')).toMatchObject({ valor: '1' });
  });

  it('se a rede cair no envio, a fila continua intacta para a próxima tentativa', async () => {
    const s = servidorFalso();
    configurarTransporte(s);
    await salvar('propriedade', { nome: 'A' });
    s.falhar();
    expect((await sincronizar()).tipo).toBe('erro');
    expect(await db.fila_ops.count()).toBe(1);
    expect((await sincronizar()).tipo).toBe('ok');
    expect(await db.fila_ops.count()).toBe(0);
  });

  it('reenviar a mesma operação não duplica no servidor', async () => {
    const s = servidorFalso();
    configurarTransporte(s);
    await salvar('propriedade', { nome: 'A' });
    const ops = await db.fila_ops.toArray();
    await s.push(ops);
    await s.push(ops);
    expect(s.aplicadas.size).toBe(1);
  });

  it('recusa definitiva fica marcada e não some', async () => {
    configurarTransporte({
      async push(ops) {
        return { aceitas: [], rejeitadas: ops.map((o) => ({ op_id: o.op_id, motivo: 'sem permissão' })), hlc_servidor: '0' };
      },
      async pull() {
        return { mudancas: [], cursor: '1', tem_mais: false };
      },
    });
    await salvar('propriedade', { nome: 'A' });
    await sincronizar();
    const [op] = await db.fila_ops.toArray();
    expect(op).toMatchObject({ status: 'rejeitada', erro: 'sem permissão' });
  });
});

describe('backoff', () => {
  it('dobra a cada tentativa e para em 5 minutos', () => {
    expect(esperaBackoff(0, 0.5)).toBe(2000);
    expect(esperaBackoff(1, 0.5)).toBe(4000);
    expect(esperaBackoff(3, 0.5)).toBe(16000);
    expect(esperaBackoff(20, 0.5)).toBe(300000);
  });
});
