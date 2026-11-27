import { useEffect, useState } from 'react';

/** Mostra "✓ Salvo" por um instante a cada gravação local. */
export function IndicadorSalvo() {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    let t: number | undefined;
    const ao = () => {
      setVisivel(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setVisivel(false), 1400);
    };
    window.addEventListener('lactonexo:salvo', ao);
    return () => {
      window.removeEventListener('lactonexo:salvo', ao);
      window.clearTimeout(t);
    };
  }, []);
  return (
    <span className={`indicador-salvo ${visivel ? 'visivel' : ''}`} aria-live="polite" data-testid="indicador-salvo">
      {visivel ? '✓ Salvo' : ''}
    </span>
  );
}
