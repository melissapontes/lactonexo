import { useRegisterSW } from 'virtual:pwa-register/react';
import { APP } from '../config/app';

/**
 * Avisa quando há nova versão. Só troca quando o vet tocar em "Atualizar":
 * o banco local (IndexedDB) não é tocado pela troca do service worker.
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

  if (!precisaAtualizar && !prontoOffline) return null;
  return (
    <div className="aviso aviso-alerta" role="status" style={{ margin: '8px 16px 0' }} data-testid="aviso-versao">
      {precisaAtualizar ? (
        <p style={{ margin: 0, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Nova versão do {APP.nome} disponível. Seus dados continuam guardados.</span>
          <button type="button" className="botao botao-primario" onClick={() => void updateServiceWorker(true)}>
            Atualizar
          </button>
          <button type="button" className="botao" onClick={() => setPrecisaAtualizar(false)}>
            Depois
          </button>
        </p>
      ) : (
        <p style={{ margin: 0, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{APP.nome} pronto para uso sem internet.</span>
          <button type="button" className="botao" onClick={() => setProntoOffline(false)}>
            OK
          </button>
        </p>
      )}
    </div>
  );
}
