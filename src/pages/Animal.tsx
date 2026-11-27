import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { tituloPagina } from '../config/app';
import { db } from '../db/db';
import { CampoAuto } from '../components/Campos';
import { itensCatalogo } from '../modules/mastite/dados';
import { salvar } from '../sync/mutacoes';

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
      <p className="suave">O histórico por teto deste animal chega na etapa (d).</p>
    </main>
  );
}
