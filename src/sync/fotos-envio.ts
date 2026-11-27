import { db } from '../db/db';
import { chamarApi } from './http';
import { API_URL, sessaoAtual } from './sessao';

const PARTE = 256 * 1024;

/**
 * Fila de fotos, separada da fila de dados. Envia em partes de 256 KB e retoma de onde parou:
 * antes de começar, pergunta ao servidor quantos bytes ele já tem.
 */
export async function enviarFotos() {
  if (!API_URL || !sessaoAtual()) return;
  const pendentes = await db.foto.filter((f) => !f.excluido_em && f.envio !== 'enviada').toArray();
  for (const f of pendentes) {
    // O registro da foto precisa chegar antes do arquivo.
    if (await db.fila_ops.where('[tabela+registro_id]').equals(['foto', f.id]).count()) continue;
    const arq = await db.arquivo_foto.get(f.id);
    if (!arq) continue;
    try {
      await enviarUma(f.id, arq.blob, arq.tipo);
    } catch (e) {
      // Uma foto com problema não trava as outras; tenta de novo no próximo ciclo.
      await db.foto.update(f.id, { envio: 'pendente' });
      if (!navigator.onLine) throw e;
    }
  }
}

async function enviarUma(id: string, blob: Blob, tipo: string) {
  const f = { id };
  const arq = { blob, tipo };
  {
    const total = arq.blob.size;
    let offset = ((await (await chamarApi(`/fotos/${f.id}`)).json()) as { bytes_recebidos: number }).bytes_recebidos;
    await db.foto.update(f.id, { envio: 'enviando', bytes_enviados: offset });
    while (offset < total) {
      const parte = arq.blob.slice(offset, offset + PARTE);
      const r = await chamarApi(`/fotos/${f.id}?total=${total}`, {
        method: 'PUT',
        body: parte,
        headers: { 'Content-Type': arq.tipo, 'X-Offset': String(offset) },
      });
      offset = ((await r.json()) as { bytes_recebidos: number }).bytes_recebidos;
      await db.foto.update(f.id, { bytes_enviados: offset });
    }
    await db.foto.update(f.id, { envio: 'enviada', bytes_enviados: total });
  }
}
