import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { APP } from '../config/app';
import { fecharFaixaInstalar, instalarApp, useInstalar } from '../lib/instalar';
import './AvisoAtualizacao.css';

function Fechar({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return (
    <button type="button" className="toast-fechar" aria-label={rotulo} title="Fechar" onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/**
 * Avisos pequenos no canto de baixo: nova versão, app pronto para uso offline e convite para instalar.
 * A nova versão só é aplicada quando o vet tocar em "Atualizar": o banco local (IndexedDB) não é tocado
 * pela troca do service worker. O convite de instalar some de vez no X; dá para instalar depois em Configurações.
 */
export function AvisoAtualizacao() {
  const {
    needRefresh: [precisaAtualizar, setPrecisaAtualizar],
    offlineReady: [prontoOffline, setProntoOffline],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Procura atualização a cada hora com o app aberto.
      if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000);
    },
  });
  const { ios, instalado, podeInstalar, faixaFechada } = useInstalar();
  const convidarInstalar = !ios && !instalado && podeInstalar && !faixaFechada;

  // "Pronto para uso sem internet" é só informativo: some sozinho.
  useEffect(() => {
    if (!prontoOffline) return;
    const t = setTimeout(() => setProntoOffline(false), 5000);
    return () => clearTimeout(t);
  }, [prontoOffline, setProntoOffline]);

  if (!precisaAtualizar && !prontoOffline && !convidarInstalar) return null;
  return (
    <div className="toasts" role="status">
      {precisaAtualizar ? (
        <div className="toast" data-testid="aviso-versao">
          <span>Nova versão disponível.</span>
          <button type="button" className="toast-acao" onClick={() => void updateServiceWorker(true)}>
            Atualizar
          </button>
          <Fechar rotulo="Fechar aviso de nova versão" onClick={() => setPrecisaAtualizar(false)} />
        </div>
      ) : prontoOffline ? (
        <div className="toast" data-testid="aviso-versao">
          <span>Pronto para usar sem internet.</span>
          <Fechar rotulo="Fechar aviso" onClick={() => setProntoOffline(false)} />
        </div>
      ) : null}
      {convidarInstalar && (
        <div className="toast" data-testid="faixa-instalar">
          <span>Instale o {APP.nome} neste aparelho.</span>
          <button type="button" className="toast-acao" onClick={() => void instalarApp()}>
            Instalar
          </button>
          <Fechar rotulo="Fechar convite de instalar" onClick={fecharFaixaInstalar} />
        </div>
      )}
    </div>
  );
}
