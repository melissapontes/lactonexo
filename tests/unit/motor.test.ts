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
    const [op] = await db.fila_ops.toArray();
    expect(op).toMatchObject({ status: 'pendente', tentativas: 1 });
    expect(op.proxima_tentativa_em).toBeGreaterThan(Date.now());
    // Ciclo automático respeita a espera; "Sincronizar agora" não espera.
    expect(await sincronizar()).toMatchObject({ tipo: 'ok', enviadas: 0 });
    expect(await db.fila_ops.count()).toBe(1);
    expect(await sincronizar({ forcar: true })).toMatchObject({ tipo: 'ok', enviadas: 1 });
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

describe('motor de sync com o servidor', () => {
  beforeEach(async () => {
    await bancoNovo();
    definirSessao('vet-1', 'org-1');
  });

  it('registro adiado (pai ainda não chegou) continua na fila', async () => {
    configurarTransporte({
      async push(ops) {
        return { aceitas: [], rejeitadas: [], adiadas: ops.map((o) => o.op_id), hlc_servidor: '' };
      },
      async pull() {
        return { mudancas: [], cursor: '1', tem_mais: false };
      },
    });
    await salvar('exame_teto', { visita_animal_id: 'x', linha: 1, posicao: 'AE', tamis: null, cmt: null });
    await sincronizar();
    expect(await db.fila_ops.toArray()).toEqual([expect.objectContaining({ status: 'pendente', erro: 'Aguardando registro pai', tentativas: 1 })]);
  });

  it('o que vem do servidor não apaga a edição local ainda não enviada', async () => {
    const id = await salvar('exame_teto', { visita_animal_id: 'va', linha: 1, posicao: 'AE', tamis: 'negativo', cmt: '++' });
    configurarTransporte({
      async push() {
        throw new Error('sem sinal no envio');
      },
      async pull() {
        return { mudancas: [], cursor: '1', tem_mais: false };
      },
    });
    await sincronizar();
    const { aplicarMudancas } = await import('../../src/sync/motor');
    await aplicarMudancas([{ tabela: 'exame_teto', registro: { id, versao: 9, visita_animal_id: 'va', linha: 1, posicao: 'AE', tamis: 'positivo', cmt: 'N' } }]);
    expect(await db.exame_teto.get(id)).toMatchObject({ cmt: '++', tamis: 'negativo', versao: 9 });
  });

  it('baixa em páginas até acabar e grava o cursor', async () => {
    let chamada = 0;
    configurarTransporte({
      async push() {
        return { aceitas: [], rejeitadas: [], hlc_servidor: '' };
      },
      async pull(cursor) {
        chamada++;
        return {
          mudancas: [{ tabela: 'propriedade', registro: { id: `p${chamada}`, versao: chamada, nome: `P${chamada}` } }],
          cursor: String(chamada),
          tem_mais: cursor === null,
        };
      },
    });
    expect(await sincronizar()).toMatchObject({ tipo: 'ok', recebidas: 2 });
    expect(await db.propriedade.count()).toBe(2);
    expect(await db.meta.get('cursor')).toMatchObject({ valor: '2' });
  });

  it('ajusta o relógio pela hora do servidor', async () => {
    configurarTransporte({
      async push(ops) {
        return { aceitas: ops.map((o) => o.op_id), rejeitadas: [], hlc_servidor: '999999999999999-00000-servidor' };
      },
      async pull() {
        return { mudancas: [], cursor: '1', tem_mais: false };
      },
    });
    await salvar('propriedade', { nome: 'A' });
    await sincronizar();
    await salvar('propriedade', { nome: 'B' });
    const [op] = await db.fila_ops.toArray();
    expect(op.hlc > '999999999999999').toBe(true);
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
