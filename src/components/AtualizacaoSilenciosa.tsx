import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { APP } from '../config/app';
import { instalarApp, useInstalar } from '../lib/instalar';
import './AtualizacaoSilenciosa.css';

const CHAVE_CONVITE = 'lactonexo:convite-instalar-mostrado';
const DURACAO_CONVITE = 6000;
/** Nos primeiros segundos ninguém está digitando: dá para recarregar com a versão nova sem atrapalhar. */
const JANELA_ABERTURA = 15000;
const aberto = Date.now();

function conviteJaMostrado(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_CONVITE) === '1';
  } catch {
    return false;
  }
}

/**
 * Atualização sem aviso nenhum: o service worker novo assume sozinho (src/sw.ts) e a página recarrega
 * em momento seguro, ao abrir o app ou quando ele sai da tela. Os dados locais (IndexedDB) não mudam.
 *
 * O único aviso na tela é o convite para instalar: um botão pequeno que some em 6 segundos,
 * uma vez por sessão. Depois, instalar fica no menu ☰ e em Configurações.
 */
export function AtualizacaoSilenciosa() {
  useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // Procura versão nova ao abrir, a cada hora e sempre que o app volta para a tela.
      void reg.update();
      setInterval(() => void reg.update(), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update();
      });
    },
  });

  useEffect(() => {
    const sw = navigator.serviceWorker;
    // Primeira visita: o service worker passa a controlar a página, mas ela já é a versão atual.
    if (!sw?.controller) return;
    let pendente = false;
    const recarregar = () => window.location.reload();
    const aoSair = () => {
      if (pendente && document.visibilityState === 'hidden') recarregar();
    };
    const trocou = () => {
      if (Date.now() - aberto < JANELA_ABERTURA || document.visibilityState === 'hidden') recarregar();
      else pendente = true;
    };
    sw.addEventListener('controllerchange', trocou);
    document.addEventListener('visibilitychange', aoSair);
    return () => {
      sw.removeEventListener('controllerchange', trocou);
      document.removeEventListener('visibilitychange', aoSair);
    };
  }, []);

  const { ios, instalado, podeInstalar } = useInstalar();
  const [convite, setConvite] = useState<'espera' | 'visivel' | 'fim'>(() => (conviteJaMostrado() ? 'fim' : 'espera'));
  const podeConvidar = !ios && !instalado && podeInstalar;

  useEffect(() => {
    if (convite !== 'espera' || !podeConvidar) return;
    setConvite('visivel');
    try {
      sessionStorage.setItem(CHAVE_CONVITE, '1');
    } catch {
      /* ignora */
    }
  }, [convite, podeConvidar]);

  useEffect(() => {
    if (convite !== 'visivel') return;
    const t = setTimeout(() => setConvite('fim'), DURACAO_CONVITE);
    return () => clearTimeout(t);
  }, [convite]);

  if (convite !== 'visivel' || !podeConvidar) return null;
  return (
    <div className="toasts" role="status">
      <div className="toast" data-testid="convite-instalar">
        <span>Use o {APP.nome} como app.</span>
        <button
          type="button"
          className="toast-acao"
          onClick={() => {
            setConvite('fim');
            void instalarApp();
          }}
        >
          Instalar
        </button>
      </div>
    </div>
  );
}
