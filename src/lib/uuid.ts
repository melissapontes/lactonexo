/** UUID v4 gerado no aparelho. crypto.randomUUID existe no Safari 15.4+; fallback para versões antigas. */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * UUID determinístico a partir de um texto (mesmo texto = mesmo id em qualquer aparelho).
 * Usado para itens padrão de catálogo, que o servidor também cria com os mesmos ids.
 */
export function uuidDeTexto(texto: string): string {
  const partes: string[] = [];
  for (let semente = 0; semente < 4; semente++) {
    let h = 0x811c9dc5 ^ semente;
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    partes.push(h.toString(16).padStart(8, '0'));
  }
  const hx = partes.join('');
  const v = ((parseInt(hx[16], 16) & 0x3) | 0x8).toString(16);
  return `${hx.slice(0, 8)}-${hx.slice(8, 12)}-5${hx.slice(13, 16)}-${v}${hx.slice(17, 20)}-${hx.slice(20, 32)}`;
}
