import { db, lerMeta, gravarMeta } from '../db/db';
import type { Operacao, Registro, TabelaSync } from '../db/tipos';
import { uuid } from '../lib/uuid';
import { hlcDeTexto, hlcParaTexto, tick, type Hlc } from './hlc';

const CAMPOS_CONTROLE = new Set(['id', 'versao', 'criado_em']);

let relogio: Hlc | null = null;
let usuarioAtual = 'local';
let organizacaoAtual = 'local';

export function definirSessao(usuarioId: string, organizacaoId: string) {
  usuarioAtual = usuarioId;
  organizacaoAtual = organizacaoId;
}

export async function dispositivoId(): Promise<string> {
  let id = await lerMeta<string>('dispositivo_id');
  if (!id) {
    id = uuid();
    await gravarMeta('dispositivo_id', id);
  }
  return id;
}

async function proximoHlc(): Promise<string> {
  if (!relogio) {
    const salvo = await lerMeta<string>('hlc');
    relogio = salvo ? hlcDeTexto(salvo) : { ms: 0, contador: 0, dispositivo: await dispositivoId() };
  }
  relogio = tick(relogio, Date.now());
  const texto = hlcParaTexto(relogio);
  await gravarMeta('hlc', texto);
  return texto;
}

/** Só para testes. */
export function reiniciarRelogio() {
  relogio = null;
}

/**
 * Grava no banco local e cria a operação na fila, na mesma transação.
 * Se já houver operação pendente (ainda não enviada) para o mesmo registro, os campos são agrupados.
 * Retorna o id do registro.
 */
export async function salvar(
  tabela: TabelaSync,
  campos: Record<string, unknown> & { id?: string },
): Promise<string> {
  const agora = new Date().toISOString();
  const hlc = await proximoHlc();
  const tbl = db.table<Registro, string>(tabela);

  return db.transaction('rw', [tbl, db.fila_ops], async () => {
    const id = campos.id ?? uuid();
    const atual = await tbl.get(id);
    const alterados: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(campos)) {
      if (CAMPOS_CONTROLE.has(k)) continue;
      if (!atual || (atual as unknown as Record<string, unknown>)[k] !== v) alterados[k] = v;
    }
    if (atual && Object.keys(alterados).length === 0) return id;

    const registro = {
      ...(atual ?? {
        id,
        organizacao_id: organizacaoAtual,
        criado_em: agora,
        versao: 0,
        excluido_em: null,
      }),
      ...alterados,
      atualizado_em: agora,
      atualizado_por: usuarioAtual,
    } as Registro;
    await tbl.put(registro);

    const camposOp = atual ? { ...alterados, atualizado_em: agora } : { ...registro };
    delete (camposOp as Record<string, unknown>).versao;

    const pendente = await db.fila_ops
      .where('[tabela+registro_id]')
      .equals([tabela, id])
      .filter((o) => o.status === 'pendente')
      .last();

    if (pendente) {
      await db.fila_ops.update(pendente.seq!, {
        campos: { ...pendente.campos, ...camposOp },
        hlc,
      });
    } else {
      const op: Operacao = {
        op_id: uuid(),
        tabela,
        registro_id: id,
        campos: camposOp,
        hlc,
        versao_base: atual?.versao ?? 0,
        usuario_id: usuarioAtual,
        criada_em: agora,
        status: 'pendente',
        tentativas: 0,
        proxima_tentativa_em: 0,
      };
      await db.fila_ops.add(op);
    }
    return id;
  });
}

/** Exclusão lógica: nada é apagado de fato. */
export async function excluir(tabela: TabelaSync, id: string) {
  return salvar(tabela, { id, excluido_em: new Date().toISOString() });
}

export async function contarPendentes(): Promise<number> {
  return db.fila_ops.where('status').anyOf('pendente', 'enviando').count();
}
