import { useEffect, useState } from 'react';
import { APP } from '../config/app';
import { ativarPush, desativarPush, estadoPush, type EstadoPush } from '../sync/push';

const TEXTO: Record<EstadoPush, string> = {
  sem_servidor: `Notificações no celular precisam do servidor do ${APP.nome}. Enquanto isso, os avisos aparecem na tela Avisos.`,
  sem_suporte: 'Este navegador não recebe notificações. Os avisos continuam na tela Avisos.',
  ios_instalar: `No iPhone, as notificações só funcionam com o ${APP.nome} instalado na Tela de Início (iOS 16.4 ou mais novo). Toque em Compartilhar → Adicionar à Tela de Início e abra o app por lá.`,
  negado: 'As notificações foram bloqueadas. Para liberar: Ajustes do celular → Notificações → LactoNexo (ou nas configurações do site, no computador).',
  desativado: 'Receba lembretes de revisita, resultados de cultura e laudos pendentes, mesmo com o app fechado.',
  ativo: 'Notificações ativas neste aparelho.',
};

export function ConfigNotificacoes() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    void estadoPush().then(setEstado);
  }, []);

  const agir = async (f: () => Promise<EstadoPush>) => {
    setErro('');
    setOcupado(true);
    try {
      setEstado(await f());
    } catch (e) {
      setErro(e instanceof Error ? `Não foi possível: ${e.message}` : 'Não foi possível. Tente com internet.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="cartao" aria-labelledby="t-notif" id="notificacoes">
      <h2 id="t-notif">Notificações</h2>
      <p data-testid="estado-push">{estado ? TEXTO[estado] : 'Verificando…'}</p>
      {estado === 'desativado' && (
        <button type="button" className="botao botao-primario" disabled={ocupado} onClick={() => void agir(ativarPush)}>
          Ativar notificações
        </button>
      )}
      {estado === 'ativo' && (
        <button type="button" className="botao" disabled={ocupado} onClick={() => void agir(desativarPush)}>
          Desativar neste aparelho
        </button>
      )}
      {erro && <p className="aviso aviso-alerta" role="alert">{erro}</p>}
    </section>
  );
}
