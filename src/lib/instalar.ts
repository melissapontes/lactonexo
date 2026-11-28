import { useSyncExternalStore } from 'react';
import { ehIOS, estaInstalado } from './plataforma';

/**
 * Estado da instalação do app, compartilhado entre o aviso rápido, o menu ☰ e a tela de Configurações.
 * O navegador dispara `beforeinstallprompt` uma vez só, cedo, então o evento é guardado aqui
 * desde o carregamento do módulo; assim o botão "Instalar" continua funcionando depois que o
 * aviso rápido some.
 */

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export interface EstadoInstalar {
  ios: boolean;
  instalado: boolean;
  /** O navegador ofereceu a instalação (Chrome, Edge, Android). */
  podeInstalar: boolean;
}

let evento: EventoInstalar | null = null;
let estado: EstadoInstalar = {
  ios: typeof navigator !== 'undefined' && ehIOS(),
  instalado: typeof window !== 'undefined' && estaInstalado(),
  podeInstalar: false,
};
const ouvintes = new Set<() => void>();

function atualizar(parcial: Partial<EstadoInstalar>) {
  estado = { ...estado, ...parcial };
  ouvintes.forEach((f) => f());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    evento = e as EventoInstalar;
    atualizar({ podeInstalar: true });
  });
  window.addEventListener('appinstalled', () => {
    evento = null;
    atualizar({ instalado: true, podeInstalar: false });
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => atualizar({ instalado: estaInstalado() }));
}

/** Abre o pedido de instalação do navegador. Devolve true se a pessoa aceitou. */
export async function instalarApp(): Promise<boolean> {
  if (!evento) return false;
  const e = evento;
  await e.prompt();
  const { outcome } = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
  // O mesmo evento não pode ser usado duas vezes; o navegador manda outro se ainda der para instalar.
  evento = null;
  atualizar({ podeInstalar: false, instalado: outcome === 'accepted' || estado.instalado });
  return outcome === 'accepted';
}

export function useInstalar(): EstadoInstalar {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => estado,
  );
}
