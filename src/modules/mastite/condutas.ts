import type { TipoConduta } from '../../db/tipos';

export const NOME_CONDUTA: Record<TipoConduta, string> = {
  tratamento: 'Tratamento',
  descarte_leite: 'Descarte de leite',
  secagem: 'Secagem',
  revisita: 'Revisita',
  descarte_animal: 'Descarte do animal',
  outro: 'Outro',
};
