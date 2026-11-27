import { useEffect, useState } from 'react';
import { APP, tituloPagina } from '../config/app';
import { Logo } from '../components/Logo';
import { entrar } from '../sync/sessao';
import { useOnline } from '../sync/useEstadoSync';

export function Entrar() {
  useEffect(() => {
    document.title = tituloPagina('Entrar');
  }, []);
  const online = useOnline();
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  return (
    <main className="conteudo" style={{ maxWidth: 440, justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Logo tamanho={64} />
        <h1>{APP.nome}</h1>
      </div>
      <form
        className="cartao form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setEnviando(true);
          setErro('');
          try {
            const r = await entrar(String(f.get('email')), String(f.get('senha')));
            if (r) setErro(r);
          } catch {
            setErro('Sem conexão com o servidor. Tente quando tiver sinal.');
          } finally {
            setEnviando(false);
          }
        }}
      >
        <label>
          E-mail
          <input name="email" type="email" inputMode="email" autoComplete="username" required />
        </label>
        <label>
          Senha
          <input name="senha" type="password" autoComplete="current-password" required />
        </label>
        {erro && <p className="aviso aviso-erro" role="alert">{erro}</p>}
        {!online && <p className="aviso aviso-alerta">Você está sem internet. O primeiro acesso precisa de sinal; depois o app funciona offline por {APP.diasSessaoOffline} dias.</p>}
        <button type="submit" className="botao botao-primario" disabled={enviando || !online}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
