import { Fab } from '../../components/Fab';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { ResultadoAntibiograma } from '../../db/tipos';
import { Escolha } from '../../components/Campos';
import { TEXTO_SEM_CRESCIMENTO } from '../../modules/mastite/constantes';
import { antibiogramasDaVisita, definirCultura, itensCatalogo, rotuloAmostras } from '../../modules/mastite/dados';
import { excluir, salvar } from '../../sync/mutacoes';
import { CabecalhoVisita } from './CabecalhoVisita';

const SIR: ResultadoAntibiograma[] = ['Sensível', 'Intermediário', 'Resistente'];

/** Resultados do laboratório: cultura por tubo e antibiogramas (inclusive pool), preenchidos depois da visita. */
export function Laboratorio() {
  const { id = '' } = useParams();
  const micros = useLiveQuery(() => itensCatalogo('microrganismo'), []);
  const antibioticos = useLiveQuery(() => itensCatalogo('antibiotico'), []);
  const tubos = useLiveQuery(async () => {
    const amostras = (await db.amostra.where('visita_id').equals(id).filter((a) => !a.excluido_em).toArray()).sort((a, b) =>
      a.numero_tubo.localeCompare(b.numero_tubo, 'pt-BR', { numeric: true }),
    );
    return Promise.all(
      amostras.map(async (a) => {
        const origens = await db.amostra_origem.where('amostra_id').equals(a.id).filter((o) => !o.excluido_em).toArray();
        const exames = (await db.exame_teto.bulkGet(origens.map((o) => o.exame_teto_id))).filter(Boolean);
        const va = exames[0] ? await db.visita_animal.get(exames[0].visita_animal_id) : undefined;
        const animal = va ? await db.animal.get(va.animal_id) : undefined;
        const culturas = await db.cultura.where('amostra_id').equals(a.id).filter((c) => !c.excluido_em).toArray();
        return {
          ...a,
          origem: `${animal?.identificacao ?? '?'} · ${a.tipo === 'composto' ? 'Composto' : exames.map((e) => e!.posicao ?? `teto ${e!.linha}`).join(', ')}`,
          agentes: culturas.filter((c) => c.microrganismo_id).map((c) => c.microrganismo_id!),
          semCrescimento: culturas.some((c) => c.sem_crescimento),
        };
      }),
    );
  }, [id]);
  const abs = useLiveQuery(() => antibiogramasDaVisita(id), [id]);
  const [novoAb, setNovoAb] = useState<string[] | null>(null);
  const [rotuloAb, setRotuloAb] = useState('');
  const [novoMicro, setNovoMicro] = useState('');

  const nomeMicro = (mid: string) => micros?.find((m) => m.id === mid)?.nome ?? '?';

  const alternarAgente = async (t: NonNullable<typeof tubos>[number], mid: string | null) => {
    if (mid === null) return definirCultura(t.id, [], !t.semCrescimento);
    const agentes = t.agentes.includes(mid) ? t.agentes.filter((x) => x !== mid) : [...t.agentes, mid];
    return definirCultura(t.id, agentes, false);
  };

  return (
    <main className="conteudo">
      <CabecalhoVisita visitaId={id} pagina="Laboratório" />

      <section className="cartao" aria-labelledby="t-cultura">
        <h2 id="t-cultura">Cultura por tubo</h2>
        <p className="suave">Toque no resultado de cada tubo. Mais de um agente pode ser marcado. Os nomes aparecem no laudo exatamente como na lista.</p>
        {tubos?.length === 0 && <p className="suave vazio">Nenhum tubo nesta visita.</p>}
        <ul className="lista-cartoes" style={{ gridTemplateColumns: '1fr' }}>
          {tubos?.map((t) => (
            <li key={t.id} className="cartao" data-testid={`tubo-${t.numero_tubo}`}>
              <strong>Tubo {t.numero_tubo}</strong>
              <span className="suave">{t.origem}</span>
              <div className="escolha" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', marginTop: 8 }} role="group" aria-label={`Resultado do tubo ${t.numero_tubo}`}>
                <button type="button" aria-pressed={t.semCrescimento} className={`botao escolha-op ${t.semCrescimento ? 'marcado' : ''}`} onClick={() => void alternarAgente(t, null)}>
                  {TEXTO_SEM_CRESCIMENTO}
                </button>
                {micros?.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={t.agentes.includes(m.id)}
                    className={`botao escolha-op ${t.agentes.includes(m.id) ? 'marcado' : ''}`}
                    style={{ fontStyle: 'italic', fontSize: '1rem' }}
                    onClick={() => void alternarAgente(t, m.id)}
                  >
                    {m.nome}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <form
          className="form-linha"
          style={{ alignItems: 'flex-end', marginTop: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!novoMicro.trim()) return;
            const ordem = (micros?.length ?? 0) + 1;
            await salvar('catalogo_item', { tipo: 'microrganismo', nome: novoMicro.trim(), ordem, ativo: true });
            setNovoMicro('');
          }}
        >
          <label className="campo" style={{ flex: '2 1 200px' }}>
            Agente que não está na lista
            <input value={novoMicro} onChange={(e) => setNovoMicro(e.target.value)} autoComplete="off" />
          </label>
          <button type="submit" className="botao">Adicionar à lista</button>
        </form>
      </section>

      <section className="cartao" aria-labelledby="t-ab">
        <h2 id="t-ab">Antibiogramas</h2>
        {abs?.map((ab) => (
          <article key={ab.id} className="cartao" style={{ marginTop: 12 }} aria-label={`Antibiograma ${ab.rotulo_microrganismo}`}>
            <label className="campo">
              Microrganismo (como sairá no laudo)
              <input
                defaultValue={ab.rotulo_microrganismo}
                onBlur={(e) => e.target.value.trim() && e.target.value !== ab.rotulo_microrganismo && void salvar('antibiograma', { id: ab.id, rotulo_microrganismo: e.target.value })}
              />
            </label>
            <p className="suave" style={{ margin: '6px 0' }}>{rotuloAmostras(ab.tubos)}</p>
            <table className="tabela-resp cartoes">
              <tbody>
                {ab.resultados.map((r) => (
                  <tr key={r.id}>
                    <td data-rotulo="Antibiótico" style={{ fontWeight: 600 }}>{r.antibiotico}</td>
                    <td data-rotulo="">
                      <Escolha<ResultadoAntibiograma>
                        rotulo={`${r.antibiotico}`}
                        opcoes={SIR}
                        valor={r.resultado}
                        rotuloOpcao={(o) => o.slice(0, 1)}
                        aoEscolher={(resultado) => void salvar('antibiograma_resultado', { id: r.id, resultado })}
                        classe="escolha-sir"
                      />
                    </td>
                    <td data-rotulo="">
                      <button type="button" className="botao" aria-label={`Remover ${r.antibiotico}`} onClick={() => void excluir('antibiograma_resultado', r.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <label className="campo" style={{ marginTop: 8 }}>
              Incluir antibiótico
              <select
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  void salvar('antibiograma_resultado', { antibiograma_id: ab.id, antibiotico_id: e.target.value, resultado: 'Sensível', ordem: ab.resultados.length + 1 });
                }}
              >
                <option value="">Escolher…</option>
                {antibioticos?.filter((a) => !ab.resultados.some((r) => r.antibiotico_id === a.id)).map((a) => (
                  <option key={a.id} value={a.id}>{a.nome}</option>
                ))}
              </select>
            </label>
            <p className="suave" style={{ fontSize: '0.85rem' }}>S = Sensível · I = Intermediário · R = Resistente</p>
          </article>
        ))}

        {!abs?.length && novoAb === null && <p className="suave vazio">Nenhum antibiograma ainda.</p>}
        {novoAb === null ? null : (
          <div className="cartao form" style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>Tubo(s) do antibiograma (mais de um = pool)</p>
            <div className="escolha" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}>
              {tubos?.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={novoAb.includes(t.id)}
                  className={`botao escolha-op ${novoAb.includes(t.id) ? 'marcado' : ''}`}
                  onClick={() => {
                    const lista = novoAb.includes(t.id) ? novoAb.filter((x) => x !== t.id) : [...novoAb, t.id];
                    setNovoAb(lista);
                    const primeiro = tubos.find((x) => x.id === lista[0]);
                    if (!rotuloAb && primeiro?.agentes[0]) setRotuloAb(nomeMicro(primeiro.agentes[0]));
                  }}
                >
                  {t.numero_tubo}
                </button>
              ))}
            </div>
            <label>
              Microrganismo (como sairá no laudo)
              <input value={rotuloAb} onChange={(e) => setRotuloAb(e.target.value)} list="lista-micros" autoComplete="off" />
              <datalist id="lista-micros">{micros?.map((m) => <option key={m.id} value={m.nome} />)}</datalist>
            </label>
            <div className="form-linha">
              <button type="button" className="botao" onClick={() => setNovoAb(null)}>Cancelar</button>
              <button
                type="button"
                className="botao botao-primario"
                disabled={!novoAb.length || !rotuloAb.trim()}
                onClick={async () => {
                  const abId = await salvar('antibiograma', { visita_id: id, rotulo_microrganismo: rotuloAb.trim() });
                  for (const amostra_id of novoAb) await salvar('antibiograma_amostra', { antibiograma_id: abId, amostra_id });
                  setNovoAb(null);
                }}
              >
                Criar antibiograma
              </button>
            </div>
          </div>
        )}
      </section>
      {!!tubos?.length && (
        <Fab
          rotulo={novoAb === null ? 'Novo antibiograma' : 'Cancelar novo antibiograma'}
          aberto={novoAb !== null}
          aoTocar={() => {
            if (novoAb !== null) return setNovoAb(null);
            setNovoAb([]);
            setRotuloAb('');
          }}
        />
      )}
    </main>
  );
}
