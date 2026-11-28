import { useEffect } from 'react';
import { APP, tituloPagina } from '../config/app';

/** Créditos: quem está por trás do conteúdo técnico do app. */
export function Creditos() {
  useEffect(() => {
    document.title = tituloPagina('Créditos');
  }, []);

  return (
    <main className="conteudo">
      <h1>Créditos</h1>
      <section className="cartao creditos" aria-labelledby="t-naprosa">
        <img src="/creditos/naprosa.png" alt="Logo do NAPROSA" width={206} height={194} className="creditos-logo" />
        <h2 id="t-naprosa">NAPROSA</h2>
        <p>Núcleo Aplicado à Produção e Sanidade da Glândula Mamária, UFPB.</p>
        <p className="suave">
          O {APP.nome} segue o modelo de laudo de mastite do NAPROSA: Tamis, CMT por teto, cultura e antibiograma.
        </p>
      </section>
    </main>
  );
}
