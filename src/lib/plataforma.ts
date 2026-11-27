/** Detecção de plataforma e de instalação na tela de início. */
export function ehIOS(ua = navigator.userAgent, plataforma = navigator.platform, toques = navigator.maxTouchPoints): boolean {
  // iPadOS 13+ se apresenta como Mac; diferencia pelos toques.
  return /iPad|iPhone|iPod/.test(ua) || (plataforma === 'MacIntel' && toques > 1);
}

export function estaInstalado(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
}
