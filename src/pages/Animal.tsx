import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { tituloPagina } from '../config/app';
import { db } from '../db/db';
import { CampoAuto } from '../components/Campos';
import { itensCatalogo } from '../modules/mastite/dados';
import { salvar } from '../sync/mutacoes';
import { carregarHistorico, type AnimalHist } from '../modules/mastite/historico';
import { IMPRESSO_CMT, IMPRESSO_TAMIS, TETOS } from '../modules/mastite/constantes';
import { GraficoCmt } from '../components/Graficos';
import { ListaSugestoes, useSugestoes } from '../components/Sugestoes';
import { descreverConduta } from '../components/Condutas';
import { formatarData } from '../lib/datas';

function diasEmLactacao(parto?: string) {
  if (!parto) return null;
  const d = Math.floor((Date.now() - Date.parse(parto + 'T12:00:00')) / 86_400_000);
  return d >= 0 ? d : null;
}

export function Animal() {
  const { id = '' } = useParams();
  const a = useLiveQuery(() => db.animal.get(id), [id]);
  const p = useLiveQuery(() => (a ? db.propriedade.get(a.propriedade_id) : undefined), [a?.propriedade_id]);
  const categorias = useLiveQuery(() => itensCatalogo('categoria'), []);
  const hist = useLiveQuery(async () => (a ? (await carregarHistorico(a.propriedade_id)).animais.find((x) => x.animal_id === id) : undefined), [a?.propriedade_id, id]);
  const sugestoes = useSugestoes(a?.propriedade_id, id);
  const racas = useLiveQuery(async () => [...new Set((await db.animal.toArray()).map((x) => x.raca).filter(Boolean) as string[])], []);

  useEffect(() => {
    if (a) document.title = tituloPagina(a.identificacao);
  }, [a]);

  if (a === undefined) return <main className="conteudo">Carregando…</main>;
  if (!a) return <main className="conteudo">Animal não encontrado.</main>;
  const del = diasEmLactacao(a.data_ultimo_parto);

  return (
    <main className="conteudo">
      <Link to={`/propriedades/${a.propriedade_id}`} className="voltar">‹ {p?.nome ?? 'Propriedade'}</Link>
      <h1>{a.identificacao}</h1>
      <section className="cartao grade-campos" aria-label="Dados do animal">
        <CampoAuto tabela="animal" id={id} campo="identificacao" valor={a.identificacao} rotulo="Identificação" obrigatorio />
        <CampoAuto tabela="animal" id={id} campo="raca" valor={a.raca} rotulo="Raça" lista={racas} />
        <label className="campo">
          Categoria
          <select value={a.categoria ?? ''} onChange={(e) => void salvar('animal', { id, categoria: e.target.value || undefined })}>
            <option value="">—</option>
            {categorias?.map((c) => (
              <option key={c.id}>{c.nome}</option>
            ))}
          </select>
        </label>
        <CampoAuto tabela="animal" id={id} campo="data_ultimo_parto" valor={a.data_ultimo_parto} rotulo="Data do último parto" tipo="date" />
      </section>
      {del != null && <p className="suave">{del} dias em lactação.</p>}
      <section className="cartao" aria-labelledby="t-sugestoes">
        <h2 id="t-sugestoes">Sugestões</h2>
        {sugestoes ? <ListaSugestoes sugestoes={sugestoes} /> : <p className="suave">Calculando…</p>}
      </section>
      {hist && <Historico h={hist} />}
    </main>
  );
}

function Historico({ h }: { h: AnimalHist }) {
  const ent = h.entradas;
  if (!ent.length)
    return (
      <section className="cartao" aria-labelledby="t-historico">
        <h2 id="t-historico">Histórico</h2>
        <p className="suave">Este animal ainda não foi examinado em nenhuma visita.</p>
      </section>
    );
  const agentes = [...new Set(ent.flatMap((e) => e.agentes))];
  const resistencias = [...new Set(ent.flatMap((e) => e.antibiogramas.flatMap((ab) => ab.resultados.filter((r) => r.resultado === 'Resistente').map((r) => r.antibiotico))))];
  const produtos = [...new Set(ent.flatMap((e) => e.condutas.filter((c) => c.produto).map((c) => c.produto!)))];

  return (
    <>
      <section className="cartao" aria-labelledby="t-evolucao">
        <h2 id="t-evolucao">Evolução do CMT por teto</h2>
        <p className="suave" style={{ marginTop: 4 }}>
          {ent.length} {ent.length === 1 ? 'visita' : 'visitas'}. Ponto vermelho maior = Tamis positivo.
        </p>
        <div className="multiplos" data-testid="evolucao-cmt">
          {TETOS.map((t) => (
            <GraficoCmt
              key={t}
              titulo={t}
              pontos={ent.map((e) => {
                const x = e.tetos.find((y) => y.posicao === t);
                return { data: e.visita.data, cmt: x?.cmt ?? null, tamis: x?.tamis ?? null };
              })}
            />
          ))}
        </div>
      </section>

      <section className="cartao" aria-labelledby="t-resumo-animal">
        <h2 id="t-resumo-animal">Resumo do histórico</h2>
        <dl className="pares">
          <div>
            <dt>Agentes isolados</dt>
            <dd>{agentes.length ? agentes.map((x, i) => <span key={x}>{i ? ', ' : ''}<i>{x}</i></span>) : 'Nenhum'}</dd>
          </div>
          <div>
            <dt>Resistente a</dt>
            <dd data-testid="resistencias">{resistencias.length ? resistencias.join(', ') : 'Nenhuma resistência registrada'}</dd>
          </div>
          <div>
            <dt>Produtos usados</dt>
            <dd>{produtos.length ? produtos.join(', ') : 'Nenhum registrado'}</dd>
          </div>
        </dl>
      </section>

      <section className="cartao" aria-labelledby="t-historico">
        <h2 id="t-historico">Linha do tempo</h2>
        <ol className="linha-tempo" aria-label="Visitas do animal">
          {[...ent].reverse().map((e) => (
            <li key={e.visita_animal_id}>
              <h3>
                <Link to={`/visitas/${e.visita.id}/animal/${e.visita_animal_id}`}>{formatarData(e.visita.data)}</Link>
              </h3>
              <table className="tabela-resp">
                <thead>
                  <tr>
                    <th scope="col">Teto</th>
                    <th scope="col">Tamis</th>
                    <th scope="col">CMT</th>
                    <th scope="col">Tubo</th>
                    <th scope="col">Agente</th>
                  </tr>
                </thead>
                <tbody>
                  {e.tetos.map((t) => (
                    <tr key={t.exame_id}>
                      <th scope="row">{t.posicao ?? `Teto ${t.linha}`}</th>
                      <td>{t.tamis ? IMPRESSO_TAMIS[t.tamis] : ''}</td>
                      <td>{t.cmt ? IMPRESSO_CMT[t.cmt] : ''}</td>
                      <td>{t.tubos.join(', ')}</td>
                      <td>{t.agentes.length ? <i>{t.agentes.join(', ')}</i> : t.semCrescimento ? 'Sem crescimento' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {e.antibiogramas.map((ab) => (
                <p key={ab.id} style={{ margin: '8px 0 0' }}>
                  Antibiograma <i>{ab.rotulo}</i>:{' '}
                  {ab.resultados.map((r, i) => (
                    <span key={r.antibiotico}>
                      {i ? ', ' : ''}
                      {r.resultado === 'Resistente' ? <strong>{r.antibiotico} R</strong> : `${r.antibiotico} ${r.resultado[0]}`}
                    </span>
                  ))}
                </p>
              ))}
              {e.condutas.length > 0 && (
                <ul className="lista-simples" aria-label="Condutas">
                  {e.condutas.map((c) => (
                    <li key={c.id}>Conduta: {descreverConduta(c)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
