/** Armazenamento persistente e cota. Suportado no Safari 15.2+ (persist) e 17+ (persisted confiável). */
export interface InfoArmazenamento {
  persistente: boolean | null;
  usadoBytes: number | null;
  cotaBytes: number | null;
}

export async function pedirPersistencia(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function lerArmazenamento(): Promise<InfoArmazenamento> {
  const info: InfoArmazenamento = { persistente: null, usadoBytes: null, cotaBytes: null };
  try {
    if (navigator.storage?.persisted) info.persistente = await navigator.storage.persisted();
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      info.usadoBytes = e.usage ?? null;
      info.cotaBytes = e.quota ?? null;
    }
  } catch {
    /* sem suporte: mantém nulos */
  }
  return info;
}

export function formatarBytes(b: number | null): string {
  if (b == null) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${u[i]}`;
}
