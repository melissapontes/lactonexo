import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { tituloPagina } from '../config/app';
import { db } from '../db/db';
import { formatarData } from '../lib/datas';
import { carregarHistorico } from '../modules/mastite/historico';
import { agentesFrequentes, perfilResistencia, resumoPorVisita, type Proporcao } from '../modules/mastite/painel';
import { formatarPct } from '../modules/mastite/tabelas';
import { Barras, GraficoPrevalencia } from '../components/Graficos';
import { ListaSugestoes, useSugestoes } from '../components/Sugestoes';

const pct = (p: Proporcao) => formatarPct(Math.round(p.pct * 10) / 10);

/** Painel da propriedade: prevalência, agentes, resistência, animais em alerta e comparação entre visitas. */
export function Painel() {
  const { id = '' } = useParams();
  const p = useLiveQuery(() => db.propriedade.get(id), [id]);
  const h = useLiveQuery(() => carregarHistorico(id), [id]);
  const sugestoes = useSugestoes(id);
  const [escopo, setEscopo] = useState<'ultima' | 'todas'>('ultima');

  useEffect(() => {
    if (p) document.title = tituloPagina(`Painel · ${p.nome}`);
  }, [p]);

  if (!h || p === undefined) return <main className="conteudo">Carregando…</main>;
  if (!p) return <main className="conteudo">Propriedade não encontrada.</main>;

  const resumos = resumoPorVisita(h).filter((r) => r.tetos > 0);
  const ultima = resumos.at(-1);
  const visitaIds = escopo === 'ultima' && ultima ? [ultima.visita_id] : undefined;
  const agentes = agentesFrequentes(h, visitaIds);
  const perfil = perfilResistencia(h, visitaIds);
  const abertas = sugestoes?.filter((s) => s.estado === 'aberta') ?? [];
  const animaisAlerta = new Set(abertas.map((s) => s.animal_id)).size;

  return (
    <main className="conteudo">
      <Link to={`/propriedades/${id}`} className="voltar">‹ {p.nome}</Link>
      <h1>Painel</h1>

      {!ultima ? (
        <p className="cartao suave">Ainda não há visitas com exames nesta propriedade.</p>
      ) : (
        <>
          <section className="cartao" aria-labelledby="t-prev">
            <h2 id="t-prev">Última visita ({formatarData(ultima.data)})</h2>
            <div className="numeros" data-testid="prevalencia">
              <div className="numero">
                <strong>{pct(ultima.clinicaTetos)}</strong>
                <span>mastite clínica · {ultima.clinicaTetos.n} de {ultima.clinicaTetos.total} tetos (Tamis +)</span>
              </div>
              <div className="numero">
                <strong>{pct(ultima.subclinicaTetos)}</strong>
                <span>mastite subclínica · {ultima.subclinicaTetos.n} de {ultima.subclinicaTetos.total} tetos (CMT + ou mais)</span>
              </div>
              <div className="numero">
                <strong>{ultima.clinicaAnimais.n + ' / ' + ultima.animais}</strong>
                <span>animais com clínica ({pct(ultima.clinicaAnimais)})</span>
              </div>
              <div className="numero">
                <strong>{ultima.subclinicaAnimais.n + ' / ' + ultima.animais}</strong>
                <span>animais com subclínica ({pct(ultima.subclinicaAnimais)})</span>
              </div>
              <div className="numero">
                <strong>{animaisAlerta}</strong>
                <span>animais com sugestão aberta</span>
              </div>
            </div>
          </section>

          <section className="cartao" aria-labelledby="t-alerta">
            <h2 id="t-alerta">Animais em alerta</h2>
            {sugestoes ? <ListaSugestoes sugestoes={sugestoes} mostrarAnimal /> : <p className="suave">Calculando…</p>}
          </section>

          <div className="abas" role="group" aria-label="Período">
            <button type="button" className="botao" aria-pressed={escopo === 'ultima'} onClick={() => setEscopo('ultima')}>Última visita</button>
            <button type="button" className="botao" aria-pressed={escopo === 'todas'} onClick={() => setEscopo('todas')}>Todas as visitas</button>
          </div>

          <section className="cartao" aria-labelledby="t-agentes">
            <h2 id="t-agentes">Agentes mais frequentes</h2>
            <p className="suave" style={{ marginTop: 4 }}>Por tubo com resultado de cultura ({agentes.tubosComResultado} tubos). Um tubo com dois agentes conta nos dois.</p>
            {agentes.agentes.length ? (
              <Barras itens={agentes.agentes.map((a) => ({ rotulo: a.agente, n: a.n, pct: a.pct, italico: true }))} />
            ) : (
              <p className="suave">Nenhum agente isolado.</p>
            )}
          </section>

          <section className="cartao" aria-labelledby="t-resist">
            <h2 id="t-resist">Perfil de resistência</h2>
            {perfil.length ? (
              <table className="tabela-resp" data-testid="perfil-resistencia">
                <thead>
                  <tr>
                    <th scope="col">Antibiótico</th>
                    <th scope="col" className="num">S</th>
                    <th scope="col" className="num">I</th>
                    <th scope="col" className="num">R</th>
                    <th scope="col" className="num">% R</th>
                  </tr>
                </thead>
                <tbody>
                  {perfil.map((a) => (
                    <tr key={a.antibiotico}>
                      <th scope="row">{a.antibiotico}</th>
                      <td className="num">{a.contagem.Sensível}</td>
                      <td className="num">{a.contagem.Intermediário}</td>
                      <td className="num">{a.contagem.Resistente}</td>
                      <td className="num">{formatarPct(Math.round(a.pctResistente * 10) / 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="suave">Nenhum antibiograma registrado.</p>
            )}
          </section>

          <section className="cartao" aria-labelledby="t-comp">
            <h2 id="t-comp">Comparação entre visitas</h2>
            {resumos.length > 1 && (
              <GraficoPrevalencia
                datas={resumos.map((r) => r.data)}
                series={[
                  { nome: 'Clínica (% tetos)', valores: resumos.map((r) => r.clinicaTetos.pct) },
                  { nome: 'Subclínica (% tetos)', valores: resumos.map((r) => r.subclinicaTetos.pct) },
                ]}
              />
            )}
            <table className="tabela-resp" data-testid="comparacao">
              <thead>
                <tr>
                  <th scope="col">Visita</th>
                  <th scope="col" className="num">Animais</th>
                  <th scope="col" className="num">Tetos</th>
                  <th scope="col" className="num">Clínica</th>
                  <th scope="col" className="num">Subclínica</th>
                  <th scope="col" className="num">Tubos +</th>
                </tr>
              </thead>
              <tbody>
                {[...resumos].reverse().map((r) => (
                  <tr key={r.visita_id}>
                    <th scope="row"><Link to={`/visitas/${r.visita_id}/resumo`}>{formatarData(r.data)}</Link></th>
                    <td className="num">{r.animais}</td>
                    <td className="num">{r.tetos}</td>
                    <td className="num">{pct(r.clinicaTetos)}</td>
                    <td className="num">{pct(r.subclinicaTetos)}</td>
                    <td className="num">{r.tubosPositivos}/{r.tubos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
