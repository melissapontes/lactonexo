import type { Cmt } from '../../db/tipos';
import { uuidDeTexto } from '../../lib/uuid';

/** Regras padrão do módulo mastite. Arquivo sem banco, usado também pelo servidor. */
export type TipoRegra = 'cmt_consecutivo' | 'agente_recorrente' | 'resistencia' | 'revisita';

export interface ParametrosRegra {
  cmt_consecutivo: { grau_minimo: Cmt; visitas: number };
  agente_recorrente: { vezes: number; ultimas_visitas: number };
  resistencia: { incluir_intermediario: boolean };
  revisita: { grau_minimo: Cmt; dias: number };
}

export const REGRAS_PADRAO: { tipo: TipoRegra; nome: string; parametros: ParametrosRegra[TipoRegra] }[] = [
  { tipo: 'cmt_consecutivo', nome: 'CMT alto em visitas seguidas', parametros: { grau_minimo: '++', visitas: 2 } },
  { tipo: 'agente_recorrente', nome: 'Mesmo agente isolado de novo', parametros: { vezes: 2, ultimas_visitas: 3 } },
  { tipo: 'resistencia', nome: 'Resistência no antibiograma', parametros: { incluir_intermediario: false } },
  { tipo: 'revisita', nome: 'Animais para revisita', parametros: { grau_minimo: '+++', dias: 7 } },
];

export const idRegraPadrao = (tipo: TipoRegra) => uuidDeTexto(`regra:mastite:${tipo}`);

