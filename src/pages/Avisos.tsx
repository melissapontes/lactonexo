import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { tituloPagina } from '../config/app';
import { avisosLocais, marcarVisto } from '../modules/avisos/avisos';
import type { TipoAviso } from '../modules/avisos/regras';

const ICONE: Record<TipoAviso, string> = { revisita: '📅', cultura: '🧪', laudo_pendente: '📄' };

export function useAvisos() {
  return useLiveQuery(() => avisosLocais(), []);
}

/** Avisos dentro do app: funcionam sem internet e sem permissão de notificação (fallback do push). */
export function Avisos() {
  const avisos = useAvisos();
  useEffect(() => {
    document.title = tituloPagina('Avisos');
  }, []);

  return (
    <main className="conteudo">
      <Link to="/" className="voltar">‹ Início</Link>
      <h1>Avisos</h1>
      {!avisos ? (
        <p className="suave">Carregando…</p>
      ) : !avisos.length ? (
        <p className="suave vazio">Nenhum aviso por agora.</p>
      ) : (
        <ul className="lista-cartoes" aria-label="Avisos">
          {avisos.map((a) => (
            <li key={a.id} className="cartao" data-testid={`aviso-${a.tipo}`}>
              <Link to={a.url} className="cartao-link" onClick={() => void marcarVisto(a)}>
                <strong>
                  <span aria-hidden="true">{ICONE[a.tipo]}</span> {a.titulo}
                </strong>
                <span className="suave">{a.texto}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
