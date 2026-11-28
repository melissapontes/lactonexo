import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { salvar } from '../sync/mutacoes';
import { tituloPagina } from '../config/app';
import { Fab } from '../components/Fab';

export const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

export function Inicio() {
  useEffect(() => {
    document.title = tituloPagina('Propriedades');
  }, []);
  const propriedades = useLiveQuery(() => db.propriedade.filter((p) => !p.excluido_em).sortBy('nome'), []);
  const contagens = useLiveQuery(async () => {
    const m = new Map<string, number>();
    for (const a of await db.animal.filter((x) => !x.excluido_em).toArray()) m.set(a.propriedade_id, (m.get(a.propriedade_id) ?? 0) + 1);
    return m;
  }, []);
  const [abrirForm, setAbrirForm] = useState(false);
  const [salvo, setSalvo] = useState('');

  async function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; // capturar antes do await: o React limpa currentTarget depois
    const f = new FormData(form);
    const nome = String(f.get('nome') ?? '').trim();
    if (!nome) return;
    await salvar('propriedade', {
      nome,
      proprietario_nome: String(f.get('proprietario_nome') ?? '').trim() || undefined,
      proprietario_telefone: String(f.get('proprietario_telefone') ?? '').trim() || undefined,
      municipio: String(f.get('municipio') ?? '').trim() || undefined,
      uf: String(f.get('uf') ?? '') || undefined,
    });
    form.reset();
    setAbrirForm(false);
    setSalvo(`"${nome}" salva no aparelho.`);
  }

  return (
    <main className="conteudo">
      <h1>Propriedades</h1>
      <Fab rotulo={abrirForm ? 'Cancelar nova propriedade' : 'Nova propriedade'} aberto={abrirForm} aoTocar={() => setAbrirForm((v) => !v)} />
      <p className="visualmente-oculto" role="status">{salvo}</p>
      {salvo && !abrirForm && <p className="suave" style={{ margin: 0, color: 'var(--cor-ok)' }}>✓ {salvo}</p>}

      {abrirForm && (
        <form className="cartao form" onSubmit={aoEnviar} aria-label="Nova propriedade">
          <label>
            Nome da propriedade
            <input name="nome" required autoComplete="off" />
          </label>
          <label>
            Proprietário
            <input name="proprietario_nome" autoComplete="off" />
          </label>
          <label>
            Telefone / WhatsApp
            <input name="proprietario_telefone" type="tel" inputMode="tel" autoComplete="off" />
          </label>
          <div className="form-linha">
            <label style={{ flex: '3 1 160px' }}>
              Município
              <input name="municipio" autoComplete="off" />
            </label>
            <label style={{ flex: '1 1 80px' }}>
              UF
              <select name="uf" defaultValue="PB">
                {UFS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" className="botao botao-primario">
            Salvar propriedade
          </button>
        </form>
      )}

      {propriedades && propriedades.length === 0 && !abrirForm && <p className="suave vazio">Nenhuma propriedade por aqui ainda.</p>}

      <ul className="lista-cartoes" aria-label="Propriedades">
        {propriedades?.map((p) => (
          <li key={p.id} className="cartao">
            <Link to={`/propriedades/${p.id}`} className="cartao-link">
              <strong>{p.nome}</strong>
              <span className="suave">
                {[p.proprietario_nome, [p.municipio, p.uf].filter(Boolean).join('-')].filter(Boolean).join(' · ') || '—'}
              </span>
              <span className="suave">{contagens?.get(p.id) ?? 0} animais</span>
            </Link>
          </li>
        ))}
      </ul>

    </main>
  );
}
