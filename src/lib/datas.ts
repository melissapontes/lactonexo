/** Datas sempre em dd/mm/aaaa. Datas puras (AAAA-MM-DD) não passam por fuso horário. */
export function formatarData(valor: string | Date | null | undefined): string {
  if (!valor) return '';
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split('-');
    return `${d}/${m}/${a}`;
  }
  const dt = typeof valor === 'string' ? new Date(valor) : valor;
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatarDataHora(valor: string | null | undefined): string {
  if (!valor) return '';
  const dt = new Date(valor);
  return `${formatarData(dt)} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
