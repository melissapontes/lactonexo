import { useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { tituloPagina } from '../../config/app';
import { db } from '../../db/db';
import { formatarData } from '../../lib/datas';

/** Cabeçalho comum às telas de uma visita, com as abas Animais / Laboratório / Resumo. */
export function CabecalhoVisita({ visitaId, pagina }: { visitaId: string; pagina: string }) {
  const v = useLiveQuery(() => db.visita.get(visitaId), [visitaId]);
  const p = useLiveQuery(() => (v ? db.propriedade.get(v.propriedade_id) : undefined), [v?.propriedade_id]);
  useEffect(() => {
    if (v && p) document.title = tituloPagina(`${pagina} · ${p.nome} ${formatarData(v.data)}`);
  }, [v, p, pagina]);
  if (!v) return null;
  return (
    <>
      <Link to={`/propriedades/${v.propriedade_id}`} className="voltar">‹ {p?.nome ?? 'Propriedade'}</Link>
      <div>
        <h1>Visita de {formatarData(v.data)}</h1>
        <p className="suave" style={{ margin: '4px 0 0' }}>{p?.nome}</p>
      </div>
      <nav className="abas" aria-label="Partes da visita">
        <NavLink end to={`/visitas/${visitaId}`} className="botao">Animais</NavLink>
        <NavLink to={`/visitas/${visitaId}/laboratorio`} className="botao">Laboratório</NavLink>
        <NavLink to={`/visitas/${visitaId}/resumo`} className="botao">Resumo</NavLink>
      </nav>
    </>
  );
}
