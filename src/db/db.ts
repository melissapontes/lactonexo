import Dexie, { type Table } from 'dexie';
import type * as T from './tipos';

/**
 * Banco local do LactoNexo (IndexedDB via Dexie).
 * Toda tela lê e grava aqui primeiro; a rede só é usada pelo motor de sync.
 *
 * MIGRAÇÕES: nunca altere uma versão já publicada. Para mudar o esquema,
 * adicione `this.version(N + 1).stores({...}).upgrade(tx => ...)` abaixo da última.
 */
export class BancoLactoNexo extends Dexie {
  usuario!: Table<T.Usuario, string>;
  propriedade!: Table<T.Propriedade, string>;
  atribuicao!: Table<T.Atribuicao, string>;
  animal!: Table<T.Animal, string>;
  visita!: Table<T.Visita, string>;
  visita_animal!: Table<T.VisitaAnimal, string>;
  conduta!: Table<T.Conduta, string>;
  foto!: Table<T.Foto, string>;
  catalogo_item!: Table<T.CatalogoItem, string>;
  regra!: Table<T.Regra, string>;
  alerta!: Table<T.Alerta, string>;
  conflito!: Table<T.Conflito, string>;
  exame_teto!: Table<T.ExameTeto, string>;
  amostra!: Table<T.Amostra, string>;
  amostra_origem!: Table<T.AmostraOrigem, string>;
  cultura!: Table<T.Cultura, string>;
  antibiograma!: Table<T.Antibiograma, string>;
  antibiograma_amostra!: Table<T.AntibiogramaAmostra, string>;
  antibiograma_resultado!: Table<T.AntibiogramaResultado, string>;

  fila_ops!: Table<T.Operacao, number>;
  arquivo_foto!: Table<T.ArquivoFoto, string>;
  meta!: Table<T.Meta, string>;

  constructor(nome = 'lactonexo') {
    super(nome);

    // v1 — esquema inicial (núcleo + módulo mastite + controle de sync).
    this.version(1).stores({
      usuario: 'id, email, atualizado_em',
      propriedade: 'id, nome, atualizado_em',
      atribuicao: 'id, usuario_id, propriedade_id',
      animal: 'id, propriedade_id, [propriedade_id+identificacao], atualizado_em',
      visita: 'id, propriedade_id, data, [propriedade_id+data], status',
      visita_animal: 'id, visita_id, animal_id, [visita_id+ordem]',
      conduta: 'id, visita_animal_id, tipo, data_revisita',
      foto: 'id, [dono_tabela+dono_id], envio',
      catalogo_item: 'id, tipo, [tipo+ordem]',
      regra: 'id, modulo, ativa',
      alerta: 'id, animal_id, status, visita_id',
      conflito: 'id, [tabela+registro_id], status',
      exame_teto: 'id, visita_animal_id, [visita_animal_id+linha]',
      amostra: 'id, visita_id, [visita_id+numero_tubo]',
      amostra_origem: 'id, amostra_id, exame_teto_id',
      cultura: 'id, amostra_id, microrganismo_id',
      antibiograma: 'id, visita_id',
      antibiograma_amostra: 'id, antibiograma_id, amostra_id',
      antibiograma_resultado: 'id, antibiograma_id, antibiotico_id',
      fila_ops: '++seq, &op_id, status, [tabela+registro_id], proxima_tentativa_em',
      arquivo_foto: 'foto_id',
      meta: 'chave',
    });
  }
}

export const VERSAO_SCHEMA = 1;

export let db = new BancoLactoNexo();

/** Só para testes: troca o banco por um isolado. */
export function usarBanco(novo: BancoLactoNexo) {
  db = novo;
}

export async function lerMeta<V>(chave: string): Promise<V | undefined> {
  return (await db.meta.get(chave))?.valor as V | undefined;
}

export async function gravarMeta(chave: string, valor: unknown) {
  await db.meta.put({ chave, valor });
}
