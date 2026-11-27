import type { Cmt, Tamis, Teto } from '../../db/tipos';

export const TETOS: Teto[] = ['AE', 'AD', 'PE', 'PD'];

export const NOME_TETO: Record<Teto, string> = {
  AE: 'Anterior esquerdo',
  AD: 'Anterior direito',
  PE: 'Posterior esquerdo',
  PD: 'Posterior direito',
};

export const GRAUS_CMT: Cmt[] = ['N', 'T', '+', '++', '+++', '++++'];

/** Rótulos como na Tabela 2 do laudo. */
export const ROTULO_CMT_TABELA: Record<Cmt, string> = {
  N: 'NEGATIVO',
  T: 'Traços',
  '+': '+',
  '++': '++',
  '+++': '+++',
  '++++': '++++',
};

export const ROTULO_TAMIS: Record<Tamis, string> = { negativo: 'NEGATIVO', positivo: 'POSITIVO' };

/** Como cada valor aparece na tabela por animal do laudo ("-" para negativo). */
export const IMPRESSO_CMT: Record<Cmt, string> = { N: '-', T: 'T', '+': '+', '++': '++', '+++': '+++', '++++': '++++' };
export const IMPRESSO_TAMIS: Record<Tamis, string> = { negativo: '-', positivo: '+' };

export const TEXTO_SEM_CRESCIMENTO = 'Sem crescimento';

/** Listas iniciais, exatamente como no laudo de referência. Editáveis em Configurações. */
export const MICRORGANISMOS_PADRAO = [
  'Staphylococcus aureus',
  'Staphylococcus spp.',
  'Streptococcus spp.',
  'Streptococcus aureus',
];

export const ANTIBIOTICOS_PADRAO = [
  'Tetraciclina',
  'Penicilina',
  'Amoxicilina',
  'Ciprofloxacina',
  'Ceftriaxona',
  'Amicacina',
  'Oxacilina',
];

export const CATEGORIAS_ANIMAL = ['Vaca em lactação', 'Vaca seca', 'Novilha', 'Bezerra'];
