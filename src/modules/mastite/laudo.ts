import { db } from '../../db/db';
import type { Amostra, ExameTeto } from '../../db/tipos';
import { IMPRESSO_CMT, IMPRESSO_TAMIS, TEXTO_SEM_CRESCIMENTO } from './constantes';
import { amostrasDaVisita, antibiogramasDaVisita, examesDoAnimal, resultadosDaVisita } from './dados';
import { tabela1Tamis, tabela2Cmt, tabela3Microbiologia } from './tabelas';

export interface LinhaLaudo {
  teto: string;
  tubo: string;
  tamis: string;
  cmt: string;
  resultado: string;
}

export interface AnimalLaudo {
  ordem: number;
  identificacao: string;
  linhas: LinhaLaudo[];
}

/** Monta os dados do laudo da visita no formato do modelo NAPROSA (usado na tela Resumo e, na etapa e, no PDF). */
export async function montarLaudo(visita_id: string) {
  const visita = await db.visita.get(visita_id);
  if (!visita) throw new Error('Visita não encontrada');
  const propriedade = await db.propriedade.get(visita.propriedade_id);
  const amostras = await amostrasDaVisita(visita_id);
  const resultados = await resultadosDaVisita(visita_id);
  const textoTubo = new Map(
    resultados.map((r) => [r.amostra_id, r.agentes.length ? r.agentes.join(' + ') : r.semCrescimento ? TEXTO_SEM_CRESCIMENTO : '']),
  );
  const origens = await db.amostra_origem.filter((o) => !o.excluido_em).toArray();

  const vas = (await db.visita_animal.where('visita_id').equals(visita_id).filter((x) => !x.excluido_em).toArray()).sort((a, b) => a.ordem - b.ordem);
  const animais: AnimalLaudo[] = [];
  const todosExames: ExameTeto[] = [];
  for (const va of vas) {
    const animal = await db.animal.get(va.animal_id);
    const exames = await examesDoAnimal(va.id);
    todosExames.push(...exames);
    const ids = new Set(exames.map((e) => e.id));
    const doAnimal = amostras.filter((a) => origens.some((o) => o.amostra_id === a.id && ids.has(o.exame_teto_id)));
    const usados = new Set<string>();
    const tuboDaLinha = (e: ExameTeto): Amostra | undefined => {
      const porLinha = doAnimal.find((a) => a.linha_laudo === e.linha && !usados.has(a.id));
      if (porLinha) return porLinha;
      return doAnimal.find(
        (a) => a.tipo === 'teto' && a.linha_laudo == null && !usados.has(a.id) && origens.some((o) => o.amostra_id === a.id && o.exame_teto_id === e.id),
      );
    };
    const linhas: LinhaLaudo[] = exames.map((e) => {
      const t = tuboDaLinha(e);
      if (t) usados.add(t.id);
      return {
        teto: t?.tipo === 'composto' ? 'Composto' : (e.posicao ?? ''),
        tubo: t?.numero_tubo ?? '',
        tamis: e.tamis ? IMPRESSO_TAMIS[e.tamis] : '',
        cmt: e.cmt ? IMPRESSO_CMT[e.cmt] : '',
        resultado: t ? (textoTubo.get(t.id) ?? '') : '',
      };
    });
    // Compostos sem linha definida (coletados no app) entram numa linha própria do animal.
    for (const c of doAnimal.filter((a) => a.tipo === 'composto' && !usados.has(a.id))) {
      linhas.push({ teto: 'Composto', tubo: c.numero_tubo, tamis: '', cmt: '', resultado: textoTubo.get(c.id) ?? '' });
    }
    animais.push({ ordem: va.ordem, identificacao: animal?.identificacao ?? '?', linhas });
  }

  const animaisComAmostra = new Set(
    amostras.flatMap((a) =>
      origens.filter((o) => o.amostra_id === a.id).map((o) => todosExames.find((e) => e.id === o.exame_teto_id)?.visita_animal_id),
    ),
  );
  animaisComAmostra.delete(undefined);

  return {
    visita,
    propriedade,
    animais,
    tabela1: tabela1Tamis(todosExames),
    tabela2: tabela2Cmt(todosExames),
    tabela3: tabela3Microbiologia(resultados),
    totais: { animais: vas.length, tetos: todosExames.length, amostras: amostras.length, animaisComAmostra: animaisComAmostra.size },
    antibiogramas: await antibiogramasDaVisita(visita_id),
  };
}

export type Laudo = Awaited<ReturnType<typeof montarLaudo>>;
