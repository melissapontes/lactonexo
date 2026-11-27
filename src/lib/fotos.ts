import { db } from '../db/db';
import type { TabelaSync } from '../db/tipos';
import { salvar } from '../sync/mutacoes';

const LADO_MAX = 1600;
const QUALIDADE = 0.8;

/**
 * Comprime no aparelho: lado maior 1600 px, JPEG 80%, orientação EXIF aplicada.
 * createImageBitmap com imageOrientation existe no Safari 16.4+; antes disso, o <img> já respeita o EXIF (iOS 13.4+).
 */
export async function comprimirFoto(arquivo: Blob): Promise<{ blob: Blob; largura: number; altura: number }> {
  let fonte: ImageBitmap | HTMLImageElement;
  try {
    fonte = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    fonte = await new Promise<HTMLImageElement>((ok, erro) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => erro(new Error('Não foi possível abrir a foto.'));
      img.src = URL.createObjectURL(arquivo);
    });
  }
  const w0 = 'naturalWidth' in fonte ? fonte.naturalWidth : fonte.width;
  const h0 = 'naturalHeight' in fonte ? fonte.naturalHeight : fonte.height;
  const escala = Math.min(1, LADO_MAX / Math.max(w0, h0));
  const largura = Math.round(w0 * escala);
  const altura = Math.round(h0 * escala);
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  canvas.getContext('2d')!.drawImage(fonte, 0, 0, largura, altura);
  if ('close' in fonte) fonte.close();
  else URL.revokeObjectURL(fonte.src);
  const blob = await new Promise<Blob>((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error('Falha ao comprimir.'))), 'image/jpeg', QUALIDADE));
  return { blob, largura, altura };
}

/** Guarda a foto no aparelho e coloca na fila de envio. */
export async function adicionarFoto(dono_tabela: TabelaSync, dono_id: string, arquivo: Blob, legenda?: string) {
  const { blob, largura, altura } = await comprimirFoto(arquivo);
  const id = await salvar('foto', { dono_tabela, dono_id, legenda, largura, altura, bytes: blob.size });
  await db.transaction('rw', db.foto, db.arquivo_foto, async () => {
    await db.arquivo_foto.put({ foto_id: id, blob, tipo: 'image/jpeg' });
    await db.foto.update(id, { envio: 'pendente', bytes_enviados: 0 });
  });
  return id;
}
