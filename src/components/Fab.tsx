import { useEffect, useRef, useState } from 'react';
import './Fab.css';

export interface AcaoFab {
  rotulo: string;
  aoTocar: () => void;
}

/**
 * Botão de adicionar do app: redondo, flutuante, no canto de baixo à direita.
 * Com uma ação, o toque faz a ação. Com várias, abre uma lista curta acima do botão.
 * `aberto` mostra um × (por exemplo, enquanto o formulário que ele abriu está na tela).
 */
export function Fab({ rotulo, aoTocar, acoes, aberto = false }: { rotulo: string; aoTocar?: () => void; acoes?: AcaoFab[]; aberto?: boolean }) {
  const [lista, setLista] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lista) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setLista(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setLista(false);
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [lista]);

  const xis = aberto || lista;
  return (
    <div className="fab-caixa" ref={caixa}>
      {lista && acoes && (
        <div className="fab-lista" role="menu" aria-label={rotulo}>
          {acoes.map((a) => (
            <button
              key={a.rotulo}
              type="button"
              role="menuitem"
              className="fab-item"
              onClick={() => {
                setLista(false);
                a.aoTocar();
              }}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className={`fab ${xis ? 'fab-xis' : ''}`}
        aria-label={rotulo}
        title={rotulo}
        aria-expanded={acoes ? lista : aberto}
        data-testid="fab"
        onClick={() => (acoes ? setLista((v) => !v) : aoTocar?.())}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
