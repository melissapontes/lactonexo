/**
 * Sino dos avisos no mesmo desenho do logo: formas cheias e arredondadas na cor da marca,
 * com o "nó" de três pontos da gota no corpo do sino.
 */
export function IconeSino({ tamanho = 26 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="icone-sino">
      <path
        d="M16 3.5c-.9 0-1.6.7-1.6 1.6v.6C10.6 6.5 8 9.8 8 13.8v5.1l-2.1 3.1c-.5.8 0 1.8 1 1.8h18.2c1 0 1.5-1 1-1.8L24 18.9v-5.1c0-4-2.6-7.3-6.4-8.1v-.6c0-.9-.7-1.6-1.6-1.6z"
        fill="var(--cor-marca)"
      />
      <path d="M12.6 25.6a3.4 3.4 0 0 0 6.8 0z" fill="var(--cor-marca)" />
      <circle cx="16" cy="17" r="2.3" fill="var(--cor-superficie, #fff)" />
      <circle cx="12.6" cy="13.6" r="1" fill="var(--cor-superficie, #fff)" />
      <circle cx="19.4" cy="13.6" r="1" fill="var(--cor-superficie, #fff)" />
      <path d="M13.3 14.3l1.6 1.6M18.7 14.3l-1.6 1.6" stroke="var(--cor-superficie, #fff)" strokeWidth=".8" strokeLinecap="round" />
    </svg>
  );
}
