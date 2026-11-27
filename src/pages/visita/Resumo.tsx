import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { APP } from '../../config/app';
import { formatarData } from '../../lib/datas';
import { rotuloAmostras } from '../../modules/mastite/dados';
import { montarLaudo } from '../../modules/mastite/laudo';
import { formatarPct, type Tabela } from '../../modules/mastite/tabelas';
import { CabecalhoVisita } from './CabecalhoVisita';
import { ExportarLaudo } from './ExportarLaudo';
import './Resumo.css';

function TabelaResumo({ titulo, tabela, italico = false, id }: { titulo: string; tabela: Tabela; italico?: boolean; id: string }) {
  return (
    <section className="cartao" aria-labelledby={id}>
      <h3 id={id} className="titulo-tabela">{titulo}</h3>
      <table className="tabela-resp" data-testid={id}>
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col" className="num">Número</th>
            <th scope="col" className="num">%</th>
          </tr>
        </thead>
        <tbody>
          {tabela.linhas.map((l) => (
            <tr key={l.rotulo}>
              <th scope="row" style={{ fontStyle: italico && l.rotulo !== 'Sem crescimento' ? 'italic' : undefined, fontWeight: 500 }}>{l.rotulo}</th>
              <td className="num">{l.n}</td>
              <td className="num">{formatarPct(l.pct)}</td>
            </tr>
          ))}
          <tr className="total">
            <th scope="row">TOTAL</th>
            <td className="num">{tabela.total}</td>
            <td className="num">{tabela.total ? '100%' : '0%'}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/** Resumo da visita no formato do laudo: tabela por animal/teto, Tabelas 1 a 3 e antibiogramas. */
export function Resumo() {
  const { id = '' } = useParams();
  const l = useLiveQuery(() => montarLaudo(id), [id]);
  if (!l) return <main className="conteudo">Carregando…</main>;
  const { totais: t } = l;

  return (
    <main className="conteudo">
      <CabecalhoVisita visitaId={id} pagina="Resumo" />

      <section className="cartao cabecalho-laudo" aria-label="Cabeçalho do laudo">
        <p className="marca">{APP.nome}</p>
        {l.visita.instituicao && <p>{l.visita.instituicao}</p>}
        <dl>
          <div><dt>Propriedade:</dt><dd>{l.propriedade?.nome || '-'}</dd></div>
          <div><dt>Município:</dt><dd>{[l.propriedade?.municipio, l.propriedade?.uf].filter(Boolean).join('-') || '-'}</dd></div>
          <div><dt>Proprietário:</dt><dd>{l.propriedade?.proprietario_nome || ''}</dd></div>
          <div><dt>Data:</dt><dd>{formatarData(l.visita.data)}</dd></div>
        </dl>
      </section>

      <ExportarLaudo laudo={l} />

      <p className="suave" data-testid="totais">
        {t.animais} animais · {t.tetos} tetos · {t.amostras} amostras de {t.animaisComAmostra} animais
      </p>

      <section aria-labelledby="t-laudo">
        <h2 id="t-laudo">Laudo</h2>
        <div className="laudo-animais">
          {l.animais.map((a) => (
            <article key={a.ordem} className="cartao laudo-animal" aria-label={`Animal ${a.identificacao}`}>
              <h3>
                <span className="suave">{a.ordem}</span> {a.identificacao}
              </h3>
              <table className="tabela-laudo">
                <thead>
                  <tr>
                    <th scope="col">TUBO</th>
                    <th scope="col">Teto</th>
                    <th scope="col">Tamis</th>
                    <th scope="col">CMT</th>
                    <th scope="col">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {a.linhas.map((r, i) => (
                    <tr key={i}>
                      <td>{r.tubo}</td>
                      <td>{r.teto}</td>
                      <td>{r.tamis}</td>
                      <td>{r.cmt}</td>
                      <td className="resultado">{r.resultado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>
        <p className="nota">Nota 1: N- Negativo · T- Traços · 1- + · 2- ++ · 3- +++</p>
      </section>

      <div className="tabelas-resumo">
        <TabelaResumo
          id="tabela-1"
          titulo={`Tabela 1: Resultado do teste de caneca (Tamis) para diagnóstico de Mastite Clínica, realizados em ${l.tabela1.total} tetos de ${t.animais} animais em lactação`}
          tabela={l.tabela1}
        />
        <TabelaResumo
          id="tabela-2"
          titulo={`Tabela 2: Resultado do Califórnia Mastites Teste (CMT) para diagnóstico de Mastite Subclínica, realizado em ${l.tabela2.total} Tetos de ${t.animais} animais em lactação.`}
          tabela={l.tabela2}
        />
        <TabelaResumo
          id="tabela-3"
          titulo={`Tabela 3: Resultado microbiológico das ${l.tabela3.total} amostras de leite coletadas de ${t.animaisComAmostra} animais`}
          tabela={l.tabela3}
          italico
        />
      </div>
      {l.tabela3.somaLinhas > l.tabela3.total && (
        <p className="suave">Na Tabela 3, tubos com mais de um agente contam em cada agente.</p>
      )}

      {l.antibiogramas.length > 0 && (
        <section aria-labelledby="t-antibiograma">
          <h2 id="t-antibiograma">ANTIBIOGRAMA</h2>
          <div className="laudo-animais">
            {l.antibiogramas.map((ab) => (
              <article key={ab.id} className="cartao">
                <h3 className="titulo-tabela">
                  <em>{ab.rotulo_microrganismo}</em> – {rotuloAmostras(ab.tubos)}
                </h3>
                <table className="tabela-resp">
                  <tbody>
                    {ab.resultados.map((r) => (
                      <tr key={r.id}>
                        <th scope="row" style={{ fontWeight: 500 }}>{r.antibiotico}</th>
                        <td className={r.resultado === 'Resistente' ? 'resistente' : ''}>{r.resultado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
