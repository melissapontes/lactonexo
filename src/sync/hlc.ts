/**
 * Relógio lógico híbrido (HLC). Ordena edições entre aparelhos mesmo com o relógio do celular errado.
 * Formato texto ordenável: "<ms 15 dígitos>-<contador 5 dígitos>-<dispositivo>".
 */
export interface Hlc {
  ms: number;
  contador: number;
  dispositivo: string;
}

export const hlcParaTexto = (h: Hlc) =>
  `${String(h.ms).padStart(15, '0')}-${String(h.contador).padStart(5, '0')}-${h.dispositivo}`;

export function hlcDeTexto(t: string): Hlc {
  const [ms, contador, ...resto] = t.split('-');
  return { ms: Number(ms), contador: Number(contador), dispositivo: resto.join('-') };
}

export const compararHlc = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Próximo carimbo local. */
export function tick(ultimo: Hlc, agora: number): Hlc {
  if (agora > ultimo.ms) return { ms: agora, contador: 0, dispositivo: ultimo.dispositivo };
  return { ms: ultimo.ms, contador: ultimo.contador + 1, dispositivo: ultimo.dispositivo };
}

/** Ajusta o relógio local ao receber um carimbo remoto (ex.: hora do servidor no sync). */
export function receber(local: Hlc, remoto: Hlc, agora: number): Hlc {
  const ms = Math.max(local.ms, remoto.ms, agora);
  let contador = 0;
  if (ms === local.ms && ms === remoto.ms) contador = Math.max(local.contador, remoto.contador) + 1;
  else if (ms === local.ms) contador = local.contador + 1;
  else if (ms === remoto.ms) contador = remoto.contador + 1;
  return { ms, contador, dispositivo: local.dispositivo };
}
