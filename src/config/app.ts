/**
 * Único lugar onde o nome e a identidade do app são definidos.
 * Trocar aqui reflete em: manifest PWA, título das páginas, notificações,
 * cabeçalho dos laudos em PDF e ícones (gerados a partir de public/logo.svg).
 */
export const APP = {
  nome: 'LactoNexo',
  nomeCurto: 'LactoNexo',
  descricao: 'Acompanhamento da saúde da glândula mamária em fazendas de leite, offline.',
  /** Cor da barra do sistema e do splash. Manter em sincronia com --cor-marca em tema.css. */
  corTema: '#1f6f78',
  corFundo: '#f6f7f5',
  idioma: 'pt-BR',
  /** Arquivo único do logo provisório. */
  logo: '/logo.svg',
  /** Dias que a sessão continua válida sem internet. */
  diasSessaoOffline: 30,
  /** Dias com alterações pendentes antes de mostrar alerta forte. */
  diasAlertaPendencias: 3,
  /** Intervalo de sincronização automática com o app aberto (ms). */
  intervaloSyncMs: 2 * 60 * 1000,
} as const;

export const tituloPagina = (pagina?: string) => (pagina ? `${pagina} · ${APP.nome}` : APP.nome);
