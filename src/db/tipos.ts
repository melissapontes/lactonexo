/** Campos comuns a todo registro sincronizado. */
export interface Registro {
  id: string;
  organizacao_id: string;
  criado_em: string;
  atualizado_em: string;
  atualizado_por: string;
  /** Versão do servidor (0 = nunca sincronizado). */
  versao: number;
  excluido_em: string | null;
}

export type Perfil = 'admin' | 'veterinario';

export interface Usuario extends Registro {
  nome: string;
  email: string;
  perfil: Perfil;
  crmv?: string;
  ativo: boolean;
}

export interface Propriedade extends Registro {
  nome: string;
  proprietario_nome?: string;
  proprietario_telefone?: string;
  proprietario_email?: string;
  municipio?: string;
  uf?: string;
  observacoes?: string;
}

export interface Atribuicao extends Registro {
  usuario_id: string;
  propriedade_id: string;
}

export interface Animal extends Registro {
  propriedade_id: string;
  /** Texto livre, nunca reformatado: "064", "Maravilha 262". */
  identificacao: string;
  raca?: string;
  categoria?: string;
  data_ultimo_parto?: string;
  ativo: boolean;
}

export type StatusVisita = 'em_campo' | 'aguardando_laboratorio' | 'concluida' | 'laudo_enviado';

export interface Visita extends Registro {
  propriedade_id: string;
  data: string; // AAAA-MM-DD
  veterinario_id: string;
  instituicao?: string;
  status: StatusVisita;
}

export interface VisitaAnimal extends Registro {
  visita_id: string;
  animal_id: string;
  ordem: number;
}

export type TipoConduta = 'tratamento' | 'descarte_leite' | 'secagem' | 'revisita' | 'descarte_animal' | 'outro';

export interface Conduta extends Registro {
  visita_animal_id: string;
  teto?: Teto;
  tipo: TipoConduta;
  produto?: string;
  dose?: string;
  periodo?: string;
  data_revisita?: string;
  alerta_origem_id?: string;
  observacao?: string;
}

export interface Foto extends Registro {
  dono_tabela: string;
  dono_id: string;
  legenda?: string;
  largura: number;
  altura: number;
  bytes: number;
  /** Estado do arquivo; o registro sincroniza pela fila normal. */
  envio: 'pendente' | 'enviando' | 'enviada';
  bytes_enviados: number;
}

export type TipoCatalogo = 'microrganismo' | 'antibiotico' | 'raca' | 'categoria';

export interface CatalogoItem extends Registro {
  tipo: TipoCatalogo;
  /** Exatamente como digitado. O sistema nunca corrige. */
  nome: string;
  ordem: number;
  ativo: boolean;
}

export interface Regra extends Registro {
  modulo: string;
  tipo: string;
  parametros: Record<string, unknown>;
  ativa: boolean;
}

export interface Alerta extends Registro {
  regra_id: string;
  animal_id: string;
  teto?: Teto;
  visita_id?: string;
  mensagem: string;
  status: 'aberto' | 'visto' | 'conduta_registrada' | 'dispensado';
}

export interface Conflito extends Registro {
  tabela: string;
  registro_id: string;
  campo: string;
  valor_vencedor: unknown;
  valor_perdedor: unknown;
  autor_vencedor: string;
  autor_perdedor: string;
  status: 'pendente' | 'revisado';
}

/* ---------- Módulo mastite ---------- */

export type Teto = 'AE' | 'AD' | 'PE' | 'PD';
export type Tamis = 'negativo' | 'positivo';
export type Cmt = 'N' | 'T' | '+' | '++' | '+++' | '++++';

export interface ExameTeto extends Registro {
  visita_animal_id: string;
  /** null = linha sem rótulo, como aparece no laudo. */
  posicao: Teto | null;
  /** Linha 1 a 4 dentro do animal, para reproduzir o laudo. */
  linha: number;
  tamis: Tamis | null;
  cmt: Cmt | null;
}

export interface Amostra extends Registro {
  visita_id: string;
  numero_tubo: string;
  tipo: 'teto' | 'composto';
  data_coleta?: string;
  /** Linha do laudo (1 a 4) onde o tubo aparece impresso. Opcional; usado para reproduzir laudos existentes. */
  linha_laudo?: number;
}

export interface AmostraOrigem extends Registro {
  amostra_id: string;
  exame_teto_id: string;
}

export interface Cultura extends Registro {
  amostra_id: string;
  data_resultado?: string;
  /** null = sem crescimento. */
  microrganismo_id: string | null;
  sem_crescimento: boolean;
  observacao?: string;
}

export interface Antibiograma extends Registro {
  visita_id: string;
  /** Rótulo como impresso no laudo (pode diferir da cultura, ex.: "Streptococcus aureus"). */
  rotulo_microrganismo: string;
  data?: string;
}

export interface AntibiogramaAmostra extends Registro {
  antibiograma_id: string;
  amostra_id: string;
}

export type ResultadoAntibiograma = 'Sensível' | 'Intermediário' | 'Resistente';

export interface AntibiogramaResultado extends Registro {
  antibiograma_id: string;
  antibiotico_id: string;
  resultado: ResultadoAntibiograma;
  ordem: number;
}

/* ---------- Controle local (não sincroniza como registro) ---------- */

export interface Operacao {
  seq?: number;
  op_id: string;
  tabela: TabelaSync;
  registro_id: string;
  /** Só os campos alterados. */
  campos: Record<string, unknown>;
  hlc: string;
  /** Versão do servidor que o aparelho conhecia ao editar. */
  versao_base: number;
  usuario_id: string;
  criada_em: string;
  status: 'pendente' | 'enviando' | 'rejeitada';
  tentativas: number;
  proxima_tentativa_em: number;
  erro?: string;
}

export interface ArquivoFoto {
  foto_id: string;
  blob: Blob;
  tipo: string;
}

export interface Meta {
  chave: string;
  valor: unknown;
}

export const TABELAS_SYNC = [
  'usuario',
  'propriedade',
  'atribuicao',
  'animal',
  'visita',
  'visita_animal',
  'conduta',
  'foto',
  'catalogo_item',
  'regra',
  'alerta',
  'conflito',
  'exame_teto',
  'amostra',
  'amostra_origem',
  'cultura',
  'antibiograma',
  'antibiograma_amostra',
  'antibiograma_resultado',
] as const;

export type TabelaSync = (typeof TABELAS_SYNC)[number];
