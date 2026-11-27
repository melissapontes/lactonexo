import { db, gravarMeta, lerMeta } from '../../db/db';
import type { Cmt, Tamis, Teto } from '../../db/tipos';
import { salvar } from '../../sync/mutacoes';
import { adicionarAnimalNaVisita, criarVisita, definirCultura, examesDoAnimal, garantirCatalogo, itemPorNome, registrarTubo } from './dados';

/**
 * Dados de exemplo: laudo NAPROSA/UFPB, Queimadas-PB, visita de 29/09/2026.
 * Reproduz o laudo exatamente como impresso, inclusive linhas de teto sem rótulo,
 * a linha "Composto" e os nomes do antibiograma ("Streptococcus aureus"). Nada é corrigido.
 */
type Linha = [Teto | null, Tamis, Cmt, string?, ('teto' | 'composto')?, string?];
// [posição, Tamis, CMT, nº do tubo, tipo do tubo, resultado]
const N: Tamis = 'negativo';
const P: Tamis = 'positivo';
const SA = 'Staphylococcus aureus';
const SSPP = 'Staphylococcus spp.';
const SC = 'Sem crescimento';

export const LAUDO_EXEMPLO = {
  propriedade: { nome: 'Logradouro', municipio: 'Queimadas', uf: 'PB', observacoes: 'Dados de exemplo (laudo NAPROSA/UFPB de 29/09/2026).' },
  data: '2026-09-29',
  instituicao: 'Núcleo Aplicado à Produção e Sanidade da Glândula mamária (NAPROSA) - UFPB',
  animais: [
    ['064', [['AE', N, 'N'], ['AD', N, '++++', '2', 'teto', SC], ['PE', P, '++++', '1', 'teto', SA], ['PD', N, 'N']]],
    ['102', [[null, N, 'N'], [null, N, '+', '3', 'composto', SA], [null, N, 'N'], [null, N, 'N']]],
    ['240', [[null, N, 'N'], ['AD', N, 'N', '4', 'teto', SC], [null, N, 'N'], [null, P, '+', '5', 'composto', SC]]],
    ['Diamante', [[null, N, 'N'], [null, N, 'N'], [null, N, 'N', '6', 'composto', SA], [null, N, 'N']]],
    ['Traúna', [['AE', N, 'N'], ['AD', N, 'N'], ['PE', N, 'N'], ['PD', N, 'N']]],
    ['Maravilha 262', [[null, N, 'N'], [null, N, 'N'], [null, N, 'N', '7', 'composto', SC], [null, N, 'N']]],
    ['255', [['AE', N, 'N', '11', 'teto', SA], ['AD', N, '+', '8', 'teto', SSPP], ['PE', N, '+', '10', 'teto', SA], ['PD', N, '+', '9', 'teto', SSPP]]],
    ['267', [['AE', N, 'N'], ['AD', N, 'N'], ['PE', N, 'N'], ['PD', N, 'N']]],
  ] as [string, Linha[]][],
  antibiogramas: [
    { rotulo: 'Staphylococcus aureus.', tubos: ['1'], resultados: [['Tetraciclina', 'Sensível'], ['Penicilina', 'Resistente'], ['Amoxicilina', 'Sensível'], ['Ciprofloxacina', 'Sensível'], ['Ceftriaxona', 'Sensível']] },
    { rotulo: 'Streptococcus aureus', tubos: ['3'], resultados: [['Tetraciclina', 'Sensível'], ['Penicilina', 'Resistente'], ['Amoxicilina', 'Intermediário'], ['Ciprofloxacina', 'Sensível'], ['Ceftriaxona', 'Sensível']] },
    { rotulo: 'Streptococcus spp.', tubos: ['8', '9'], resultados: [['Tetraciclina', 'Sensível'], ['Penicilina', 'Sensível'], ['Amoxicilina', 'Sensível'], ['Ciprofloxacina', 'Sensível'], ['Ceftriaxona', 'Sensível']] },
    { rotulo: 'Streptococcus aureus', tubos: ['10', '11'], resultados: [['Amicacina', 'Sensível'], ['Ceftriaxona', 'Sensível'], ['Penicilina', 'Resistente'], ['Oxacilina', 'Resistente'], ['Ciprofloxacina', 'Sensível']] },
  ] as { rotulo: string; tubos: string[]; resultados: [string, 'Sensível' | 'Intermediário' | 'Resistente'][] }[],
};

export async function exemploJaCarregado() {
  return !!(await lerMeta<string>('seed_laudo_naprosa'));
}

/** Carrega o laudo de exemplo. Não duplica se já tiver sido carregado. Retorna o id da visita. */
export async function carregarExemploLaudo(): Promise<string> {
  const existente = await lerMeta<string>('seed_laudo_naprosa');
  if (existente && (await db.visita.get(existente))) return existente;

  await garantirCatalogo();
  const L = LAUDO_EXEMPLO;
  const propriedade_id = await salvar('propriedade', L.propriedade);
  const visita_id = await criarVisita(propriedade_id, L.data, 'local', L.instituicao);
  const tuboId = new Map<string, string>();

  for (const [identificacao, linhas] of L.animais) {
    const animal_id = await salvar('animal', { propriedade_id, identificacao, categoria: 'Vaca em lactação', ativo: true });
    const va = await adicionarAnimalNaVisita(visita_id, animal_id);
    const exames = await examesDoAnimal(va);
    const compostos: { tubo: string; linha: number; res: string }[] = [];
    for (const [i, [posicao, tamis, cmt, tubo, tipo, res]] of linhas.entries()) {
      const ex = exames[i];
      await salvar('exame_teto', { id: ex.id, posicao, tamis, cmt });
      if (tubo && tipo === 'teto') {
        const r = await registrarTubo(visita_id, tubo, [ex.id], 'teto', { data_coleta: L.data, linha_laudo: i + 1 });
        tuboId.set(tubo, r.id!);
        await definirCultura(r.id!, res === SC ? [] : [await itemPorNome('microrganismo', res!)], res === SC, L.data);
      }
      if (tubo && tipo === 'composto') compostos.push({ tubo, linha: i + 1, res: res! });
    }
    for (const c of compostos) {
      const r = await registrarTubo(visita_id, c.tubo, exames.map((e) => e.id), 'composto', { data_coleta: L.data, linha_laudo: c.linha });
      tuboId.set(c.tubo, r.id!);
      await definirCultura(r.id!, c.res === SC ? [] : [await itemPorNome('microrganismo', c.res)], c.res === SC, L.data);
    }
  }

  for (const ab of L.antibiogramas) {
    const abId = await salvar('antibiograma', { visita_id, rotulo_microrganismo: ab.rotulo, data: L.data });
    for (const t of ab.tubos) await salvar('antibiograma_amostra', { antibiograma_id: abId, amostra_id: tuboId.get(t)! });
    for (const [i, [nome, resultado]] of ab.resultados.entries()) {
      await salvar('antibiograma_resultado', { antibiograma_id: abId, antibiotico_id: await itemPorNome('antibiotico', nome), resultado, ordem: i + 1 });
    }
  }
  await salvar('visita', { id: visita_id, status: 'concluida' });
  await gravarMeta('seed_laudo_naprosa', visita_id);
  return visita_id;
}
