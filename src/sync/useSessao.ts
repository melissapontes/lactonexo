import { useEffect, useState } from 'react';
import { carregarSessao, ouvirSessao, sessaoAtual, type Sessao } from './sessao';

export function useSessao() {
  const [s, setS] = useState<Sessao | null | undefined>(() => sessaoAtual() ?? undefined);
  useEffect(() => {
    const parar = ouvirSessao(setS);
    void carregarSessao().then(setS);
    return () => {
      parar();
    };
  }, []);
  return s;
}
