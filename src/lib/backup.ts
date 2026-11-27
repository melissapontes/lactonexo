import { APP } from '../config/app';
import { db, VERSAO_SCHEMA } from '../db/db';
import { TABELAS_SYNC } from '../db/tipos';

export interface ArquivoBackup {
  app: string;
  formato: 1;
  versao_schema: number;
  exportado_em: string;
  tabelas: Record<string, unknown[]>;
  fila_ops: unknown[];
  fotos: { foto_id: string; tipo: string; base64: string }[];
}

async function blobParaBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

function base64ParaBlob(b64: string, tipo: string): Blob {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: tipo });
}

/** Gera o backup completo do aparelho, incluindo alterações ainda não sincronizadas e fotos. */
export async function gerarBackup(): Promise<ArquivoBackup> {
  const tabelas: Record<string, unknown[]> = {};
  for (const t of TABELAS_SYNC) tabelas[t] = await db.table(t).toArray();
  const fotos = [];
  for (const f of await db.arquivo_foto.toArray()) {
    fotos.push({ foto_id: f.foto_id, tipo: f.tipo, base64: await blobParaBase64(f.blob) });
  }
  return {
    app: APP.nome,
    formato: 1,
    versao_schema: VERSAO_SCHEMA,
    exportado_em: new Date().toISOString(),
    tabelas,
    fila_ops: await db.fila_ops.toArray(),
    fotos,
  };
}

export function nomeArquivoBackup(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${APP.nome.toLowerCase()}-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/**
 * Restaura um backup sem apagar nada: registros mais novos (por atualizado_em) vencem,
 * operações da fila entram se o op_id ainda não existir (o servidor ignora duplicadas).
 */
export async function restaurarBackup(b: ArquivoBackup): Promise<{ registros: number; ops: number }> {
  if (b.app !== APP.nome || b.formato !== 1) throw new Error('Arquivo não é um backup do ' + APP.nome + '.');
  if (b.versao_schema > VERSAO_SCHEMA) throw new Error('Backup feito por uma versão mais nova do app. Atualize o app antes.');
  let registros = 0;
  let ops = 0;
  const tabelas = TABELAS_SYNC.map((t) => db.table(t));
  await db.transaction('rw', [...tabelas, db.fila_ops, db.arquivo_foto], async () => {
    for (const t of TABELAS_SYNC) {
      for (const r of (b.tabelas[t] ?? []) as { id: string; atualizado_em: string }[]) {
        const atual = (await db.table(t).get(r.id)) as { atualizado_em: string } | undefined;
        if (!atual || atual.atualizado_em < r.atualizado_em) {
          await db.table(t).put(r);
          registros++;
        }
      }
    }
    for (const o of b.fila_ops as { op_id: string; seq?: number }[]) {
      if (!(await db.fila_ops.where('op_id').equals(o.op_id).count())) {
        const { seq: _seq, ...resto } = o;
        void _seq;
        await db.fila_ops.add(resto as never);
        ops++;
      }
    }
    for (const f of b.fotos) {
      if (!(await db.arquivo_foto.get(f.foto_id))) {
        await db.arquivo_foto.put({ foto_id: f.foto_id, tipo: f.tipo, blob: base64ParaBlob(f.base64, f.tipo) });
      }
    }
  });
  return { registros, ops };
}

/** Entrega o arquivo: menu de compartilhar (iPhone/Android) quando houver, senão download. */
export async function entregarArquivo(conteudo: Blob, nome: string) {
  const arquivo = new File([conteudo], nome, { type: conteudo.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: nome });
      return;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(conteudo);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
