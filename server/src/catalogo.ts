import type pg from 'pg';
import { uuidDeTexto } from '../../src/lib/uuid';
import { ANTIBIOTICOS_PADRAO, CATEGORIAS_ANIMAL, MICRORGANISMOS_PADRAO } from '../../src/modules/mastite/constantes';

/** Cria no servidor os itens padrão de catálogo com os MESMOS ids que o app cria offline. */
export async function garantirCatalogoServidor(db: pg.Pool, organizacao_id: string) {
  const listas: [string, string[]][] = [
    ['microrganismo', MICRORGANISMOS_PADRAO],
    ['antibiotico', ANTIBIOTICOS_PADRAO],
    ['categoria', CATEGORIAS_ANIMAL],
  ];
  for (const [tipo, nomes] of listas) {
    for (const [i, nome] of nomes.entries()) {
      await db.query(
        `insert into catalogo_item (id, organizacao_id, tipo, nome, ordem, ativo, atualizado_por)
         values ($1, $2, $3, $4, $5, true, 'sistema') on conflict (id) do nothing`,
        [uuidDeTexto(`catalogo:${tipo}:${nome}`), organizacao_id, tipo, nome, i + 1],
      );
    }
  }
}
