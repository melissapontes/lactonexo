import { Link } from 'react-router-dom';
import { APP } from '../config/app';
import { formatarDataHora } from '../lib/datas';
import { sincronizar } from '../sync/motor';
import { useEstadoSync } from '../sync/useEstadoSync';
import { Logo } from './Logo';
import { IconeSino } from './IconeSino';
import { IndicadorSalvo } from './IndicadorSalvo';
import { useAvisos } from '../pages/Avisos';
import './BarraStatus.css';

const DIA = 24 * 60 * 60 * 1000;

/** Sempre visível no topo: Online/Offline, pendências, última sincronização e "Sincronizar agora". */
export function BarraStatus() {
  const s = useEstadoSync();
  const avisos = useAvisos();
  const pendenciaVelha = s.maisAntiga && Date.now() - new Date(s.maisAntiga).getTime() > APP.diasAlertaPendencias * DIA;

  let mensagem = '';
  const r = s.ultimoResultado;
  if (r?.tipo === 'sem_servidor') mensagem = 'Servidor ainda não configurado. Os dados ficam guardados neste aparelho.';
  else if (r?.tipo === 'sessao') mensagem = r.mensagem;
  else if (r?.tipo === 'erro') mensagem = `Não foi possível sincronizar: ${r.mensagem}. Tentaremos de novo.`;

  return (
    <header className="barra" data-testid="barra-status">
      <div className="barra-linha">
        <Link to="/" className="barra-marca" aria-label={`${APP.nome}, início`}>
          <Logo tamanho={28} />
          <span>{APP.nome}</span>
        </Link>
        <IndicadorSalvo />
        <Link to="/avisos" className={`barra-avisos ${avisos?.length ? 'tem' : ''}`} data-testid="avisos" aria-label={avisos?.length ? `${avisos.length} avisos` : 'Avisos'}>
          <IconeSino />
          {avisos?.length ? <span className="contador">{avisos.length}</span> : null}
        </Link>
        <span className={`barra-rede ${s.online ? 'on' : 'off'}`} role="status" data-testid="estado-rede">
          <span className="ponto" aria-hidden="true" />
          {s.online ? 'Online' : 'Offline'}
        </span>
      </div>
      <div className="barra-linha barra-detalhe">
        <span data-testid="pendentes" className={pendenciaVelha ? 'pendencia-velha' : ''}>
          {s.pendentes === 0
            ? 'Tudo salvo'
            : `${s.pendentes} ${s.pendentes === 1 ? 'alteração pendente' : 'alterações pendentes'}`}
          {s.rejeitadas > 0 && <Link to="/configuracoes#nao-sincronizadas"> · {s.rejeitadas} não sincronizada(s)</Link>}
        </span>
        {s.conflitos > 0 && (
          <Link to="/conflitos" className="selo selo-alerta" data-testid="conflitos">
            {s.conflitos} {s.conflitos === 1 ? 'conflito' : 'conflitos'} para revisar
          </Link>
        )}
        <span className="suave" data-testid="ultima-sync">
          Última sincronização: {s.ultimaSync ? formatarDataHora(s.ultimaSync) : 'nunca'}
        </span>
        <button
          type="button"
          className="botao botao-sync"
          onClick={() => void sincronizar({ forcar: true })}
          disabled={!s.online || s.sincronizando}
          aria-busy={s.sincronizando}
        >
          {s.sincronizando ? 'Sincronizando…' : 'Sincronizar agora'}
        </button>
      </div>
      {pendenciaVelha && (
        <p className="barra-aviso" role="alert">
          Há alterações guardadas só neste aparelho há mais de {APP.diasAlertaPendencias} dias. Sincronize assim que
          tiver sinal ou faça um <Link to="/configuracoes#backup">backup</Link>.
        </p>
      )}
      {mensagem && !pendenciaVelha && <p className="barra-msg suave">{mensagem}</p>}
    </header>
  );
}
