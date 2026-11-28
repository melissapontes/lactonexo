import { Fab } from '../../components/Fab';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { StatusVisita } from '../../db/tipos';
import { CampoAuto } from '../../components/Campos';
import { adicionarAnimalNaVisita } from '../../modules/mastite/dados';
import { IMPRESSO_CMT } from '../../modules/mastite/constantes';
import { salvar } from '../../sync/mutacoes';
import { STATUS_VISITA } from '../Propriedade';
import { CabecalhoVisita } from './CabecalhoVisita';

/** Lista de animais da visita e inclusão de animais. */
export function Visita() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const v = useLiveQuery(() => db.visita.get(id), [id]);
  const linhas = useLiveQuery(async () => {
    const vas = (await db.visita_animal.where('visita_id').equals(id).filter((x) => !x.excluido_em).toArray()).sort((a, b) => a.ordem - b.ordem);
    return Promise.all(
      vas.map(async (va) => ({
        va,
        animal: await db.animal.get(va.animal_id),
        exames: (await db.exame_teto.where('visita_animal_id').equals(va.id).filter((e) => !e.excluido_em).toArray()).sort((a, b) => a.linha - b.linha),
      })),
    );
  }, [id]);
  const disponiveis = useLiveQuery(async () => {
    if (!v) return [];
    const na = new Set(linhas?.map((l) => l.va.animal_id));
    return (await db.animal.where('propriedade_id').equals(v.propriedade_id).filter((a) => !a.excluido_em && a.ativo && !na.has(a.id)).toArray()).sort((a, b) =>
      a.identificacao.localeCompare(b.identificacao, 'pt-BR', { numeric: true }),
    );
  }, [v, linhas]);
  const [adicionar, setAdicionar] = useState(false);
  const [dados, setDados] = useState(false);

  if (!v) return <main className="conteudo">Carregando…</main>;

  async function incluir(animal_id: string) {
    const va = await adicionarAnimalNaVisita(id, animal_id);
    navegar(`/visitas/${id}/animal/${va}`);
  }

  return (
    <main className="conteudo">
      <CabecalhoVisita visitaId={id} pagina="Animais" />

      <div className="topo-pagina">
        <label className="campo" style={{ flex: '1 1 200px' }}>
          Situação
          <select value={v.status} onChange={(e) => void salvar('visita', { id, status: e.target.value as StatusVisita })}>
            {Object.entries(STATUS_VISITA).map(([k, r]) => (
              <option key={k} value={k}>{r}</option>
            ))}
          </select>
        </label>
        <button type="button" className="botao" onClick={() => setDados((x) => !x)} aria-expanded={dados}>
          {dados ? 'Fechar dados' : 'Data e instituição'}
        </button>
      </div>
      {dados && (
        <section className="cartao grade-campos">
          <CampoAuto tabela="visita" id={id} campo="data" valor={v.data} rotulo="Data da visita" tipo="date" obrigatorio />
          <CampoAuto tabela="visita" id={id} campo="instituicao" valor={v.instituicao} rotulo="Instituição / laboratório" />
        </section>
      )}

      <ul className="lista-cartoes" aria-label="Animais da visita">
        {linhas?.map(({ va, animal, exames }) => {
          const feitos = exames.filter((e) => e.cmt && e.tamis).length;
          const alerta = exames.some((e) => e.tamis === 'positivo' || (e.cmt && ['++', '+++', '++++'].includes(e.cmt)));
          return (
            <li key={va.id} className="cartao">
              <Link to={`/visitas/${id}/animal/${va.id}`} className="cartao-link">
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{va.ordem}. {animal?.identificacao}</strong>
                  <span className={`selo ${alerta ? 'selo-alerta' : ''}`}>{feitos}/{exames.length} tetos</span>
                </span>
                <span className="suave">
                  CMT: {exames.map((e) => `${e.posicao ?? '·'} ${e.cmt ? IMPRESSO_CMT[e.cmt] : '?'}`).join('  ')}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <Fab rotulo={adicionar ? 'Fechar adicionar animal' : 'Adicionar animal à visita'} aberto={adicionar} aoTocar={() => setAdicionar((x) => !x)} />
      {adicionar && (
      <section className="cartao" aria-label="Adicionar animal à visita" id="adicionar-animal">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {disponiveis && disponiveis.length > 0 && (
              <div className="escolha" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
                {disponiveis.map((a) => (
                  <button key={a.id} type="button" className="botao escolha-op" onClick={() => void incluir(a.id)}>
                    {a.identificacao}
                  </button>
                ))}
              </div>
            )}
            <form
              className="form-linha"
              style={{ alignItems: 'flex-end' }}
              onSubmit={async (e) => {
                e.preventDefault();
                const campo = (e.currentTarget.elements.namedItem('novo') as HTMLInputElement);
                const identificacao = campo.value.trim();
                if (!identificacao) return;
                const existente = await db.animal.where('[propriedade_id+identificacao]').equals([v.propriedade_id, identificacao]).filter((a) => !a.excluido_em).first();
                const animal_id = existente?.id ?? (await salvar('animal', { propriedade_id: v.propriedade_id, identificacao, categoria: 'Vaca em lactação', ativo: true }));
                await incluir(animal_id);
              }}
            >
              <label className="campo" style={{ flex: '2 1 160px' }}>
                Animal novo (identificação)
                <input name="novo" autoComplete="off" />
              </label>
              <button type="submit" className="botao">Cadastrar e incluir</button>
            </form>
          </div>
      </section>
      )}
    </main>
  );
}
