import { db } from '../../db/db';
import type { Amostra, Cultura, ExameTeto, TipoCatalogo, Visita } from '../../db/tipos';
import { salvar } from '../../sync/mutacoes';
import { uuidDeTexto } from '../../lib/uuid';
import { ANTIBIOTICOS_PADRAO, CATEGORIAS_ANIMAL, MICRORGANISMOS_PADRAO, TETOS } from './constantes';
import type { ResultadoTubo } from './tabelas';

const ativo = <T extends { excluido_em: string | null }>(r: T) => !r.excluido_em;

export function hojeISO(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Cria as listas iniciais (microrganismos, antibióticos, categorias) se ainda não existirem.
 * São itens embutidos: ids determinísticos (iguais em todo aparelho e no servidor) e sem entrar na fila de sync.
 * Edições do vet nesses itens entram na fila normalmente.
 */
export async function garantirCatalogo() {
  const listas: [TipoCatalogo, string[]][] = [
    ['microrganismo', MICRORGANISMOS_PADRAO],
    ['antibiotico', ANTIBIOTICOS_PADRAO],
    ['categoria', CATEGORIAS_ANIMAL],
  ];
  const agora = new Date().toISOString();
  for (const [tipo, nomes] of listas) {
    if (await db.catalogo_item.where('tipo').equals(tipo).count()) continue;
    await db.catalogo_item.bulkPut(
      nomes.map((nome, i) => ({
        id: uuidDeTexto(`catalogo:${tipo}:${nome}`),
        organizacao_id: 'padrao',
        criado_em: agora,
        atualizado_em: agora,
        atualizado_por: 'sistema',
        versao: 0,
        excluido_em: null,
        tipo,
        nome,
        ordem: i + 1,
        ativo: true,
      })),
    );
  }
}

export async function itensCatalogo(tipo: TipoCatalogo, incluirInativos = false) {
  const itens = await db.catalogo_item.where('tipo').equals(tipo).filter(ativo).toArray();
  return itens.filter((i) => incluirInativos || i.ativo).sort((a, b) => a.ordem - b.ordem);
}

/** Item do catálogo pelo nome exato; cria se não existir (o texto nunca é alterado). */
export async function itemPorNome(tipo: TipoCatalogo, nome: string): Promise<string> {
  const existente = await db.catalogo_item.where('tipo').equals(tipo).filter((i) => ativo(i) && i.nome === nome).first();
  if (existente) return existente.id;
  const ordem = (await db.catalogo_item.where('tipo').equals(tipo).count()) + 1;
  return salvar('catalogo_item', { tipo, nome, ordem, ativo: true });
}

export async function criarVisita(propriedade_id: string, data: string, veterinario_id = 'local', instituicao?: string) {
  return salvar('visita', { propriedade_id, data, veterinario_id, instituicao, status: 'em_campo' } satisfies Partial<Visita>);
}

/** Adiciona o animal à visita com os 4 tetos rotulados (AE, AD, PE, PD) e sem resultados. */
export async function adicionarAnimalNaVisita(visita_id: string, animal_id: string): Promise<string> {
  const atuais = (await db.visita_animal.where('visita_id').equals(visita_id).filter(ativo).toArray());
  const ja = atuais.find((v) => v.animal_id === animal_id);
  if (ja) return ja.id;
  const ordem = atuais.reduce((m, v) => Math.max(m, v.ordem), 0) + 1;
  const va = await salvar('visita_animal', { visita_id, animal_id, ordem });
  for (const [i, posicao] of TETOS.entries()) {
    await salvar('exame_teto', { visita_animal_id: va, posicao, linha: i + 1, tamis: null, cmt: null } satisfies Partial<ExameTeto>);
  }
  return va;
}

export async function examesDoAnimal(visita_animal_id: string) {
  return (await db.exame_teto.where('visita_animal_id').equals(visita_animal_id).filter(ativo).toArray()).sort((a, b) => a.linha - b.linha);
}

export async function amostrasDaVisita(visita_id: string) {
  const lista = await db.amostra.where('visita_id').equals(visita_id).filter(ativo).toArray();
  return lista.sort((a, b) => a.numero_tubo.localeCompare(b.numero_tubo, 'pt-BR', { numeric: true }));
}

/** Cria um tubo ligado a um ou mais tetos. Se o número já existir na visita, retorna o aviso sem gravar. */
export async function registrarTubo(
  visita_id: string,
  numero_tubo: string,
  exame_ids: string[],
  tipo: Amostra['tipo'],
  extra: Partial<Amostra> = {},
): Promise<{ id?: string; duplicado?: boolean }> {
  const numero = numero_tubo.trim();
  const dup = await db.amostra.where('[visita_id+numero_tubo]').equals([visita_id, numero]).filter(ativo).count();
  if (dup) return { duplicado: true };
  const id = await salvar('amostra', { visita_id, numero_tubo: numero, tipo, ...extra });
  for (const exame_teto_id of exame_ids) await salvar('amostra_origem', { amostra_id: id, exame_teto_id });
  return { id };
}

export async function origensDaAmostra(amostra_id: string) {
  return db.amostra_origem.where('amostra_id').equals(amostra_id).filter(ativo).toArray();
}

/** Define o resultado de cultura de um tubo: lista de agentes ou sem crescimento. Substitui o anterior. */
export async function definirCultura(amostra_id: string, agentes: string[], semCrescimento: boolean, data_resultado = hojeISO()) {
  const atuais = await db.cultura.where('amostra_id').equals(amostra_id).filter(ativo).toArray();
  const manter = new Set<string>();
  const desejadas: (string | null)[] = semCrescimento ? [null] : agentes;
  for (const micro of desejadas) {
    const igual = atuais.find((c) => c.microrganismo_id === micro && !manter.has(c.id));
    if (igual) {
      manter.add(igual.id);
      continue;
    }
    const id = await salvar('cultura', { amostra_id, microrganismo_id: micro, sem_crescimento: micro === null, data_resultado } satisfies Partial<Cultura>);
    manter.add(id);
  }
  for (const c of atuais) if (!manter.has(c.id)) await salvar('cultura', { id: c.id, excluido_em: new Date().toISOString() });
}

/** Resultados por tubo prontos para a Tabela 3. */
export async function resultadosDaVisita(visita_id: string): Promise<(ResultadoTubo & { numero_tubo: string })[]> {
  const amostras = await amostrasDaVisita(visita_id);
  const nomes = new Map((await db.catalogo_item.where('tipo').equals('microrganismo').toArray()).map((i) => [i.id, i.nome]));
  const out = [];
  for (const a of amostras) {
    const culturas = await db.cultura.where('amostra_id').equals(a.id).filter(ativo).toArray();
    out.push({
      amostra_id: a.id,
      numero_tubo: a.numero_tubo,
      agentes: culturas.filter((c) => c.microrganismo_id).map((c) => nomes.get(c.microrganismo_id!) ?? '?'),
      semCrescimento: culturas.some((c) => c.sem_crescimento),
    });
  }
  return out;
}

export async function examesDaVisita(visita_id: string) {
  const vas = await db.visita_animal.where('visita_id').equals(visita_id).filter(ativo).toArray();
  const exames: ExameTeto[] = [];
  for (const va of vas) exames.push(...(await examesDoAnimal(va.id)));
  return { animais: vas.length, exames };
}

export async function antibiogramasDaVisita(visita_id: string) {
  const abs = await db.antibiograma.where('visita_id').equals(visita_id).filter(ativo).toArray();
  const nomesAb = new Map((await db.catalogo_item.where('tipo').equals('antibiotico').toArray()).map((i) => [i.id, i.nome]));
  const tubos = new Map((await amostrasDaVisita(visita_id)).map((a) => [a.id, a.numero_tubo]));
  const out = [];
  for (const ab of abs) {
    const ligs = await db.antibiograma_amostra.where('antibiograma_id').equals(ab.id).filter(ativo).toArray();
    const res = (await db.antibiograma_resultado.where('antibiograma_id').equals(ab.id).filter(ativo).toArray()).sort((a, b) => a.ordem - b.ordem);
    out.push({
      ...ab,
      tubos: ligs.map((l) => tubos.get(l.amostra_id) ?? '?').sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
      amostra_ids: ligs.map((l) => l.amostra_id),
      resultados: res.map((r) => ({ ...r, antibiotico: nomesAb.get(r.antibiotico_id) ?? '?' })),
    });
  }
  return out.sort((a, b) => a.tubos[0]?.localeCompare(b.tubos[0] ?? '', 'pt-BR', { numeric: true }) ?? 0);
}

/** "amostra 1", "amostra 8 e 9 (pool)", "amostra 1, 2 e 3 (pool)". */
export function rotuloAmostras(tubos: string[]): string {
  if (tubos.length <= 1) return `amostra ${tubos[0] ?? ''}`.trim();
  return `amostra ${tubos.slice(0, -1).join(', ')} e ${tubos.at(-1)} (pool)`;
}
