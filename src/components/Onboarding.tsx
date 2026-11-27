import { useEffect, useState } from 'react';
import { APP } from '../config/app';
import { ehIOS, estaInstalado } from '../lib/plataforma';
import { Logo } from './Logo';
import './Onboarding.css';

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const CHAVE_CONTINUAR = 'lactonexo:continuar-sem-instalar';

function IconeCompartilhar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function IconeAdicionar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

/**
 * No iPhone/iPad sem instalar: tela de instalação guiada.
 * Safari e o app instalado têm bancos separados, e o iOS pode apagar dados de sites não instalados,
 * por isso o uso no navegador só é permitido com aviso explícito.
 */
export function Onboarding({ children }: { children: React.ReactNode }) {
  const ios = ehIOS();
  const [instalado, setInstalado] = useState(estaInstalado);
  const [continuar, setContinuar] = useState(() => {
    try {
      return sessionStorage.getItem(CHAVE_CONTINUAR) === '1';
    } catch {
      return false;
    }
  });
  const [eventoInstalar, setEventoInstalar] = useState<EventoInstalar | null>(null);

  useEffect(() => {
    const mq = window.matchMedia?.('(display-mode: standalone)');
    const mudou = () => setInstalado(estaInstalado());
    mq?.addEventListener?.('change', mudou);
    const antes = (e: Event) => {
      e.preventDefault();
      setEventoInstalar(e as EventoInstalar);
    };
    window.addEventListener('beforeinstallprompt', antes);
    window.addEventListener('appinstalled', mudou);
    return () => {
      mq?.removeEventListener?.('change', mudou);
      window.removeEventListener('beforeinstallprompt', antes);
      window.removeEventListener('appinstalled', mudou);
    };
  }, []);

  if (ios && !instalado && !continuar) {
    return (
      <main className="onb" data-testid="onboarding-ios">
        <div className="onb-topo">
          <Logo tamanho={72} />
          <h1>Instale o {APP.nome} no seu iPhone</h1>
          <p className="suave">Leva 10 segundos e é o que garante que o app funcione sem internet na fazenda.</p>
        </div>
        <ol className="onb-passos">
          <li>
            <span className="onb-num">1</span>
            <span>
              Toque em <strong>Compartilhar</strong> <span className="onb-icone"><IconeCompartilhar /></span> na barra
              do Safari (embaixo no iPhone, em cima no iPad).
            </span>
          </li>
          <li>
            <span className="onb-num">2</span>
            <span>
              Role e toque em <strong>Adicionar à Tela de Início</strong>{' '}
              <span className="onb-icone"><IconeAdicionar /></span>.
            </span>
          </li>
          <li>
            <span className="onb-num">3</span>
            <span>
              Toque em <strong>Adicionar</strong> e abra o {APP.nome} pelo ícone na tela de início.
            </span>
          </li>
        </ol>
        <div className="aviso aviso-alerta" role="note">
          <p>
            <strong>Por que instalar?</strong> No iPhone, o Safari pode apagar dados de sites não instalados depois de
            alguns dias sem uso, e o que você digitar no Safari não aparece no app instalado. Instalado, o {APP.nome}{' '}
            guarda seus dados com segurança até sincronizar.
          </p>
        </div>
        <p className="suave onb-nota">Se usar outro navegador no iPhone (Chrome, Edge), abra este endereço no Safari.</p>
        <button
          type="button"
          className="botao onb-continuar"
          onClick={() => {
            try {
              sessionStorage.setItem(CHAVE_CONTINUAR, '1');
            } catch {
              /* ignora */
            }
            setContinuar(true);
          }}
        >
          Só quero conhecer, sem instalar
        </button>
      </main>
    );
  }

  return (
    <>
      {ios && !instalado && (
        <div className="aviso aviso-erro onb-faixa" role="alert" data-testid="aviso-nao-instalado">
          <p>
            <strong>Modo navegador:</strong> o iPhone pode apagar estes dados. Instale pelo menu Compartilhar → Adicionar
            à Tela de Início antes de registrar visitas.
          </p>
        </div>
      )}
      {!ios && !instalado && eventoInstalar && (
        <div className="aviso aviso-alerta onb-faixa">
          <p>
            Instale o {APP.nome} para usar offline com mais segurança.{' '}
            <button
              type="button"
              className="botao botao-primario"
              onClick={async () => {
                await eventoInstalar.prompt();
                setEventoInstalar(null);
              }}
            >
              Instalar
            </button>
          </p>
        </div>
      )}
      {children}
    </>
  );
}
