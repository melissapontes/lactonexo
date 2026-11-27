/**
 * Entrega de arquivos gerados no aparelho.
 * No iPhone/Android, a folha de compartilhamento do sistema leva o PDF direto ao WhatsApp, Mail etc.
 * Sem suporte (ex.: computador), o arquivo é baixado e o app oferece links para WhatsApp e e-mail.
 */
export type ResultadoEntrega = 'compartilhado' | 'baixado' | 'cancelado';

export function podeCompartilharArquivo(arquivo: File): boolean {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  return typeof nav.share === 'function' && !!nav.canShare?.({ files: [arquivo] });
}

export function baixar(conteudo: Blob, nome: string) {
  const url = URL.createObjectURL(conteudo);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function compartilharOuBaixar(conteudo: Blob, nome: string, texto?: string): Promise<ResultadoEntrega> {
  const arquivo = new File([conteudo], nome, { type: conteudo.type });
  if (podeCompartilharArquivo(arquivo)) {
    try {
      await navigator.share({ files: [arquivo], title: nome, text: texto });
      return 'compartilhado';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelado';
    }
  }
  baixar(conteudo, nome);
  return 'baixado';
}

/** Telefone brasileiro para o link do WhatsApp (só dígitos, com 55). Retorna null se não parecer telefone. */
export function telefoneWhatsApp(tel?: string): string | null {
  const d = (tel ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return '55' + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

export function linkWhatsApp(texto: string, tel?: string): string {
  const n = telefoneWhatsApp(tel);
  return `https://wa.me/${n ?? ''}?text=${encodeURIComponent(texto)}`;
}

export function linkEmail(assunto: string, corpo: string, para?: string): string {
  return `mailto:${encodeURIComponent(para ?? '')}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}
