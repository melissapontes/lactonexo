/**
 * Avisos do LactoNexo (funções puras, usadas no app; o servidor calcula os mesmos em SQL para o push).
 * 1. Revisita: conduta "revisita" com data chegando (ou atrasada), sem visita posterior ao animal.
 * 2. Resultado de cultura disponível: cultura lançada por outra pessoa (ex.: laboratório) que o vet ainda não viu.
 * 3. Laudo pendente de envio: visita com resultados completos (ou sem tubos), sem "Laudo enviado", depois de N dias.
 */

export type TipoAviso = 'revisita' | 'cultura' | 'laudo_pendente';

export interface Aviso {
  /** Estável: o mesmo fato gera sempre o mesmo id. */
  id: string;
  tipo: TipoAviso;
  titulo: string;
  texto: string;
  url: string;
  /** Data de referência (AAAA-MM-DD) para ordenar. */
  data: string;
  /** Para "visto" de cultura: marca do último resultado. */
  marca?: string;
}

export interface DadosAvisos {
  hoje: string;
  usuario: string;
  diasLaudoPendente: number;
  diasAntecedenciaRevisita: number;
  propriedades: { id: string; nome: string }[];
  animais: { id: string; identificacao: string; propriedade_id: string }[];
  visitas: { id: string; propriedade_id: string; data: string; status: string }[];
  visitaAnimais: { id: string; visita_id: string; animal_id: string }[];
  condutas: { id: string; visita_animal_id: string; tipo: string; data_revisita?: string }[];
  amostras: { id: string; visita_id: string }[];
  culturas: { id: string; amostra_id: string; atualizado_por: string; criado_em: string }[];
  /** id do aviso de cultura -> marca vista. */
  vistos: Record<string, string>;
}

export function somarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function calcularAvisos(d: DadosAvisos): Aviso[] {
  const prop = new Map(d.propriedades.map((p) => [p.id, p.nome]));
  const animal = new Map(d.animais.map((a) => [a.id, a]));
  const visita = new Map(d.visitas.map((v) => [v.id, v]));
  const va = new Map(d.visitaAnimais.map((x) => [x.id, x]));
  const out: Aviso[] = [];

  // 1. Revisitas
  const limite = somarDias(d.hoje, d.diasAntecedenciaRevisita);
  const desde = somarDias(d.hoje, -30);
  for (const c of d.condutas) {
    if (c.tipo !== 'revisita' || !c.data_revisita || c.data_revisita > limite || c.data_revisita < desde) continue;
    const v = va.get(c.visita_animal_id);
    const vis = v && visita.get(v.visita_id);
    const a = v && animal.get(v.animal_id);
    if (!v || !vis || !a) continue;
    const jaRevisitado = d.visitaAnimais.some((x) => x.animal_id === a.id && x.id !== v.id && (visita.get(x.visita_id)?.data ?? '') > vis.data);
    if (jaRevisitado) continue;
    const quando = c.data_revisita === d.hoje ? 'hoje' : c.data_revisita > d.hoje ? `amanhã (${dm(c.data_revisita)})` : `atrasada desde ${dm(c.data_revisita)}`;
    out.push({
      id: `revisita:${c.id}`,
      tipo: 'revisita',
      titulo: `Revisita ${quando}`,
      texto: `${a.identificacao} · ${prop.get(a.propriedade_id) ?? ''}`,
      url: `/animais/${a.id}`,
      data: c.data_revisita,
    });
  }

  // 2. Cultura disponível (lançada por outra pessoa)
  const visitaDaAmostra = new Map(d.amostras.map((a) => [a.id, a.visita_id]));
  const porVisita = new Map<string, { n: number; marca: string }>();
  for (const c of d.culturas) {
    if (c.atualizado_por === d.usuario || c.atualizado_por === 'sistema') continue;
    const vid = visitaDaAmostra.get(c.amostra_id);
    if (!vid) continue;
    const atual = porVisita.get(vid) ?? { n: 0, marca: '' };
    atual.n++;
    if (c.criado_em > atual.marca) atual.marca = c.criado_em;
    porVisita.set(vid, atual);
  }
  for (const [vid, { n, marca }] of porVisita) {
    const id = `cultura:${vid}`;
    if ((d.vistos[id] ?? '') >= marca) continue;
    const v = visita.get(vid);
    if (!v) continue;
    out.push({
      id,
      tipo: 'cultura',
      titulo: 'Resultado de cultura disponível',
      texto: `${prop.get(v.propriedade_id) ?? ''} · visita de ${dm(v.data)} · ${n} ${n === 1 ? 'resultado' : 'resultados'}`,
      url: `/visitas/${vid}/laboratorio`,
      data: marca.slice(0, 10),
      marca,
    });
  }

  // 3. Laudos pendentes de envio
  const comResultado = new Set(d.culturas.map((c) => c.amostra_id));
  for (const v of d.visitas) {
    if (v.status === 'laudo_enviado' || v.data > somarDias(d.hoje, -d.diasLaudoPendente)) continue;
    if (!d.visitaAnimais.some((x) => x.visita_id === v.id)) continue;
    const tubos = d.amostras.filter((a) => a.visita_id === v.id);
    if (tubos.some((t) => !comResultado.has(t.id))) continue;
    out.push({
      id: `laudo:${v.id}`,
      tipo: 'laudo_pendente',
      titulo: 'Laudo pendente de envio',
      texto: `${prop.get(v.propriedade_id) ?? ''} · visita de ${dm(v.data)}`,
      url: `/visitas/${v.id}/resumo`,
      data: v.data,
    });
  }

  const ordem: Record<TipoAviso, number> = { revisita: 0, cultura: 1, laudo_pendente: 2 };
  return out.sort((a, b) => ordem[a.tipo] - ordem[b.tipo] || a.data.localeCompare(b.data));
}
