import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { APP } from '../config/app';
import { instalarApp, useInstalar } from '../lib/instalar';
import './MenuPrincipal.css';

/** Menu ☰ do topo: atalhos para as telas e "Instalar o app" (sempre disponível, mesmo depois do aviso sumir). */
export function MenuPrincipal() {
  const [aberto, setAberto] = useState(false);
  const { instalado, podeInstalar } = useInstalar();
  const navegar = useNavigate();
  const local = useLocation();
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao trocar de tela, ao tocar fora ou com Esc.
  useEffect(() => setAberto(false), [local.pathname, local.hash]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  return (
    <div className="menu" ref={caixa}>
      <button
        type="button"
        className="menu-botao"
        aria-label="Menu"
        aria-expanded={aberto}
        aria-controls="menu-lista"
        data-testid="menu"
        onClick={() => setAberto((a) => !a)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {aberto && (
        <nav id="menu-lista" className="menu-lista" aria-label="Menu principal">
          <Link to="/">Propriedades</Link>
          <Link to="/avisos">Avisos</Link>
          {!instalado && (
            <button
              type="button"
              onClick={async () => {
                setAberto(false);
                if (podeInstalar) await instalarApp();
                else navegar('/configuracoes#instalar');
              }}
            >
              Instalar o app
            </button>
          )}
          <Link to="/configuracoes">Configurações</Link>
          <Link to="/configuracoes#backup">Backup</Link>
          <Link to="/creditos">Créditos</Link>
          <span className="menu-rodape">{APP.nome}</span>
        </nav>
      )}
    </div>
  );
}
