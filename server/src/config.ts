/** Configuração do servidor por variáveis de ambiente. */
export const config = {
  porta: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/lactonexo',
  /** Segredo do JWT de acesso. Obrigatório em produção. */
  jwtSegredo: process.env.JWT_SEGREDO ?? 'dev-somente-local-troque-em-producao',
  /** Duração do token de acesso. */
  acessoMinutos: Number(process.env.ACESSO_MINUTOS ?? 60),
  /** Dias que a sessão vale sem renovar (sessão offline). */
  diasSessao: Number(process.env.DIAS_SESSAO ?? 30),
  /** Origens permitidas (CORS), separadas por vírgula. */
  origens: (process.env.ORIGENS ?? 'http://localhost:5173,http://localhost:4173').split(','),
};

if (process.env.NODE_ENV === 'production' && config.jwtSegredo.startsWith('dev-')) {
  throw new Error('Defina JWT_SEGREDO em produção.');
}
