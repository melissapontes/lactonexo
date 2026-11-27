import { db } from '../../db/db';
import type { Alerta, Conduta, Regra, ResultadoAntibiograma, Teto } from '../../db/tipos';
import { REGRAS_PADRAO, idRegraPadrao, type ParametrosRegra, type TipoRegra } from './regras-padrao';
import { uuidDeTexto } from '../../lib/uuid';
import { formatarData } from '../../lib/datas';
import { salvar } from '../../sync/mutacoes';
import { cmtAoMenos, ehClinica } from './painel';
import type { AnimalHist, HistoricoPropriedade } from './historico';

/**
 * Apoio à decisão: as regras só SUGEREM. Nada é decidido sozinho.
 *
 * As sugestões são calculadas na hora a partir dos dados (não são gravadas). Assim, dois aparelhos
 * offline chegam às mesmas sugestões e nada duplica. Só a resposta do vet é gravada (e sincronizada):
 * um registro `alerta` com id determinístico (o mesmo da sugestão) e status `dispensado` ou
 * `conduta_registrada`, e a conduta com `alerta_origem_id`.
 */

export { REGRAS_PADRAO, idRegraPadrao } from './regras-padrao';
export type { ParametrosRegra, TipoRegra } from './regras-padrao';

/** Cria as regras padrão (ids determinísticos, sem entrar na fila), como o catálogo. */
export async function garantirRegras() {
  const agora = new Date().toISOString();
  for (const r of REGRAS_PADRAO) {
    const id = idRegraPadrao(r.tipo);
    if (await db.regra.get(id)) continue;
    await db.regra.put({
      id,
      organizacao_id: 'padrao',
      criado_em: agora,
      atualizado_em: agora,
      atualizado_por: 'sistema',
      versao: 0,
      excluido_em: null,
      modulo: 'mastite',
      tipo: r.tipo,
      parametros: r.parametros as unknown as Record<string, unknown>,
      ativa: true,
    });
  }
}

export async function regrasDoModulo(): Promise<Regra[]> {
  const todas = await db.regra.where('modulo').equals('mastite').filter((r) => !r.excluido_em).toArray();
  const ordem = REGRAS_PADRAO.map((r) => r.tipo as string);
  return todas.sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo));
}

export const nomeRegra = (tipo: string) => REGRAS_PADRAO.find((r) => r.tipo === tipo)?.nome ?? tipo;

/** Parâmetros da regra, completando com o padrão o que faltar. */
export function parametrosDe<T extends TipoRegra>(r: Pick<Regra, 'tipo' | 'parametros'>): ParametrosRegra[T] {
  const padrao = REGRAS_PADRAO.find((x) => x.tipo === r.tipo)?.parametros ?? {};
  return { ...padrao, ...(r.parametros ?? {}) } as ParametrosRegra[T];
}

export interface Sugestao {
  /** Id determinístico: o mesmo em todo aparelho para o mesmo fato. */
  id: string;
  regra_id: string;
  tipo: TipoRegra;
  animal_id: string;
  identificacao: string;
  teto?: Teto;
  /** Visita que disparou a sugestão (a mais recente do animal envolvida). */
  visita_id: string;
  visita_animal_id: string;
  mensagem: string;
  /** Conduta sugerida para pré-preencher o formulário. */
  conduta_sugerida: Conduta['tipo'];
}

export const idSugestao = (tipo: string, animal_id: string, visita_id: string, detalhe = '') =>
  uuidDeTexto(`sugestao:${tipo}:${animal_id}:${visita_id}:${detalhe}`);

const somaDias = (iso: string, dias: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

function avaliarAnimal(regra: Regra, a: AnimalHist, hoje: string): Sugestao[] {
  const ent = a.entradas;
  if (!ent.length) return [];
  const ultima = ent.at(-1)!;
  const base = { regra_id: regra.id, tipo: regra.tipo as TipoRegra, animal_id: a.animal_id, identificacao: a.identificacao };
  const out: Sugestao[] = [];

  switch (regra.tipo as TipoRegra) {
    case 'cmt_consecutivo': {
      const p = parametrosDe<'cmt_consecutivo'>(regra);
      const n = Math.max(2, Math.floor(p.visitas));
      if (ent.length < n) break;
      const janela = ent.slice(-n);
      const posicoes = new Set(ultima.tetos.map((t) => t.posicao).filter(Boolean) as Teto[]);
      for (const teto of posicoes) {
        const valores = janela.map((e) => e.tetos.find((t) => t.posicao === teto)?.cmt ?? null);
        if (valores.every((c) => cmtAoMenos(c, p.grau_minimo))) {
          out.push({
            ...base,
            id: idSugestao(regra.tipo, a.animal_id, ultima.visita.id, teto),
            teto,
            visita_id: ultima.visita.id,
            visita_animal_id: ultima.visita_animal_id,
            mensagem: `Teto ${teto} com CMT ${p.grau_minimo} ou mais em ${n} visitas seguidas (${valores.join(', ')}).`,
            conduta_sugerida: 'tratamento',
          });
        }
      }
      break;
    }
    case 'agente_recorrente': {
      const p = parametrosDe<'agente_recorrente'>(regra);
      const janela = ent.slice(-Math.max(2, Math.floor(p.ultimas_visitas)));
      if (!ultima.agentes.length) break;
      for (const agente of ultima.agentes) {
        const visitas = janela.filter((e) => e.agentes.includes(agente));
        if (visitas.length >= Math.max(2, Math.floor(p.vezes))) {
          out.push({
            ...base,
            id: idSugestao(regra.tipo, a.animal_id, ultima.visita.id, agente),
            visita_id: ultima.visita.id,
            visita_animal_id: ultima.visita_animal_id,
            mensagem: `${agente} isolado em ${visitas.length} visitas (${visitas.map((e) => formatarData(e.visita.data)).join(', ')}).`,
            conduta_sugerida: 'tratamento',
          });
        }
      }
      break;
    }
    case 'resistencia': {
      const p = parametrosDe<'resistencia'>(regra);
      const alvo: ResultadoAntibiograma[] = p.incluir_intermediario ? ['Resistente', 'Intermediário'] : ['Resistente'];
      const porAntibiotico = new Map<string, Set<string>>();
      for (const ab of ultima.antibiogramas)
        for (const r of ab.resultados)
          if (alvo.includes(r.resultado)) porAntibiotico.set(r.antibiotico, new Set([...(porAntibiotico.get(r.antibiotico) ?? []), `${r.resultado}`]));
      for (const [antibiotico, res] of porAntibiotico) {
        out.push({
          ...base,
          id: idSugestao(regra.tipo, a.animal_id, ultima.visita.id, antibiotico),
          visita_id: ultima.visita.id,
          visita_animal_id: ultima.visita_animal_id,
          mensagem: `${[...res].join(' / ')} a ${antibiotico} no antibiograma de ${formatarData(ultima.visita.data)}. Considere evitar no tratamento.`,
          conduta_sugerida: 'tratamento',
        });
      }
      break;
    }
    case 'revisita': {
      const p = parametrosDe<'revisita'>(regra);
      const alterados = ultima.tetos.filter((t) => ehClinica(t) || cmtAoMenos(t.cmt, p.grau_minimo));
      const marcada = ultima.condutas.find((c) => c.tipo === 'revisita' && c.data_revisita);
      if (marcada) {
        if (marcada.data_revisita! <= hoje)
          out.push({
            ...base,
            id: idSugestao(regra.tipo, a.animal_id, ultima.visita.id, `marcada:${marcada.id}`),
            visita_id: ultima.visita.id,
            visita_animal_id: ultima.visita_animal_id,
            mensagem: `Revisita marcada para ${formatarData(marcada.data_revisita!)}${marcada.data_revisita! < hoje ? ' (atrasada)' : ' (hoje)'}.`,
            conduta_sugerida: 'revisita',
          });
      } else if (alterados.length) {
        const quando = somaDias(ultima.visita.data, Math.max(1, Math.floor(p.dias)));
        out.push({
          ...base,
          id: idSugestao(regra.tipo, a.animal_id, ultima.visita.id),
          visita_id: ultima.visita.id,
          visita_animal_id: ultima.visita_animal_id,
          mensagem: `Revisitar até ${formatarData(quando)}: ${alterados
            .map((t) => `${t.posicao ?? `teto ${t.linha}`} ${ehClinica(t) ? 'Tamis positivo' : `CMT ${t.cmt}`}`)
            .join(', ')} na visita de ${formatarData(ultima.visita.data)}.`,
          conduta_sugerida: 'revisita',
        });
      }
      break;
    }
  }
  return out;
}

/** Avalia as regras ativas sobre o histórico. Função pura. */
export function avaliarRegras(regras: Regra[], h: Pick<HistoricoPropriedade, 'animais'>, hoje: string): Sugestao[] {
  return regras.filter((r) => r.ativa && !r.excluido_em).flatMap((r) => h.animais.flatMap((a) => avaliarAnimal(r, a, hoje)));
}

export type EstadoSugestao = 'aberta' | Exclude<Alerta['status'], 'aberto' | 'visto'>;

/** Junta as sugestões com a resposta já registrada pelo vet. */
export async function comEstado(sugestoes: Sugestao[]): Promise<(Sugestao & { estado: EstadoSugestao })[]> {
  const respostas = await db.alerta.bulkGet(sugestoes.map((s) => s.id));
  return sugestoes.map((s, i) => {
    const r = respostas[i];
    const estado: EstadoSugestao = r && !r.excluido_em && (r.status === 'dispensado' || r.status === 'conduta_registrada') ? r.status : 'aberta';
    return { ...s, estado };
  });
}

function camposAlerta(s: Sugestao, status: Alerta['status']): Partial<Alerta> {
  return { id: s.id, regra_id: s.regra_id, animal_id: s.animal_id, teto: s.teto, visita_id: s.visita_id, mensagem: s.mensagem, status };
}

export async function dispensarSugestao(s: Sugestao) {
  await salvar('alerta', camposAlerta(s, 'dispensado'));
}

export async function reabrirSugestao(s: Sugestao) {
  await salvar('alerta', { id: s.id, status: 'aberto' });
}

/** Registra a conduta do vet. Se veio de uma sugestão, marca a sugestão como respondida. */
export async function registrarConduta(c: Partial<Conduta> & Pick<Conduta, 'visita_animal_id' | 'tipo'>, origem?: Sugestao) {
  const id = await salvar('conduta', { ...c, alerta_origem_id: origem?.id });
  if (origem) await salvar('alerta', camposAlerta(origem, 'conduta_registrada'));
  return id;
}
