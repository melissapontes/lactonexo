import { APP } from '../../config/app';
import { db, gravarMeta, lerMeta } from '../../db/db';
import { usuarioDaSessao } from '../../sync/mutacoes';
import { hojeISO } from '../mastite/dados';
import { calcularAvisos, type Aviso } from './regras';

const vivo = <T extends { excluido_em: string | null }>(r: T) => !r.excluido_em;

/** Avisos a partir do banco local: funciona sem internet e sem permissão de notificação. */
export async function avisosLocais(hoje = hojeISO()): Promise<Aviso[]> {
  const [propriedades, animais, visitas, visitaAnimais, condutas, amostras, culturas] = await Promise.all([
    db.propriedade.filter(vivo).toArray(),
    db.animal.filter(vivo).toArray(),
    db.visita.filter(vivo).toArray(),
    db.visita_animal.filter(vivo).toArray(),
    db.conduta.filter(vivo).toArray(),
    db.amostra.filter(vivo).toArray(),
    db.cultura.filter(vivo).toArray(),
  ]);
  return calcularAvisos({
    hoje,
    usuario: usuarioDaSessao(),
    diasLaudoPendente: APP.diasLaudoPendente,
    diasAntecedenciaRevisita: APP.diasAntecedenciaRevisita,
    propriedades,
    animais,
    visitas,
    visitaAnimais,
    condutas,
    amostras,
    culturas,
    vistos: (await lerMeta<Record<string, string>>('avisos_vistos')) ?? {},
  });
}

/** Marca o aviso de cultura como visto (até o último resultado). Os outros avisos somem quando o fato muda. */
export async function marcarVisto(a: Aviso) {
  if (!a.marca) return;
  const vistos = (await lerMeta<Record<string, string>>('avisos_vistos')) ?? {};
  vistos[a.id] = a.marca;
  await gravarMeta('avisos_vistos', vistos);
}
