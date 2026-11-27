import { ehIOS, estaInstalado } from '../lib/plataforma';
import { chamarApi } from './http';
import { API_URL } from './sessao';

/**
 * Notificações no celular (Web Push com VAPID).
 * iPhone: só iOS 16.4+, com o app instalado na Tela de Início, e a permissão só pode ser pedida após um toque.
 * Sem push, os avisos continuam aparecendo dentro do app (tela Avisos).
 */
export type EstadoPush =
  | 'sem_servidor'
  | 'sem_suporte'
  | 'ios_instalar'
  | 'negado'
  | 'desativado'
  | 'ativo';

export async function estadoPush(): Promise<EstadoPush> {
  if (!API_URL) return 'sem_servidor';
  const temApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!temApi) return ehIOS() && !estaInstalado() ? 'ios_instalar' : 'sem_suporte';
  if (Notification.permission === 'denied') return 'negado';
  const reg = await navigator.serviceWorker.ready;
  const insc = await reg.pushManager.getSubscription();
  return insc && Notification.permission === 'granted' ? 'ativo' : 'desativado';
}

function chaveParaBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const bin = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Chamar SEMPRE a partir de um toque do usuário (exigência do iOS). */
export async function ativarPush(): Promise<EstadoPush> {
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') return permissao === 'denied' ? 'negado' : 'desativado';
  let chave: string;
  try {
    chave = ((await (await chamarApi('/push/chave', { method: 'GET' })).json()) as { chave: string }).chave;
  } catch (e) {
    throw new Error(e instanceof Error && e.message.includes('503') ? 'o servidor ainda não tem as notificações configuradas' : 'sem conexão com o servidor');
  }
  const reg = await navigator.serviceWorker.ready;
  const insc =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) as BufferSource }));
  await chamarApi('/push/inscrever', { method: 'POST', body: JSON.stringify(insc.toJSON()) });
  return 'ativo';
}

export async function desativarPush(): Promise<EstadoPush> {
  const reg = await navigator.serviceWorker.ready;
  const insc = await reg.pushManager.getSubscription();
  if (insc) {
    await chamarApi('/push/cancelar', { method: 'POST', body: JSON.stringify({ endpoint: insc.endpoint }) }).catch(() => undefined);
    await insc.unsubscribe();
  }
  return 'desativado';
}
