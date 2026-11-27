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
  /** Web Push (VAPID). Gere com: npm run server:vapid. Sem chaves, o push fica desligado (avisos só no app). */
  vapidPublica: process.env.VAPID_PUBLICA ?? '',
  vapidPrivada: process.env.VAPID_PRIVADA ?? '',
  /** Contato do responsável pelo envio (exigido pelo protocolo): mailto: ou https:. */
  vapidContato: process.env.VAPID_CONTATO ?? 'mailto:suporte@exemplo.com.br',
  /** Fuso para "hoje" dos avisos. */
  fuso: process.env.FUSO ?? 'America/Recife',
  /** Intervalo entre rodadas de avisos (minutos). 0 desliga. */
  avisosMinutos: Number(process.env.AVISOS_MINUTOS ?? 15),
  diasLaudoPendente: Number(process.env.DIAS_LAUDO_PENDENTE ?? 2),
  diasAntecedenciaRevisita: Number(process.env.DIAS_ANTECEDENCIA_REVISITA ?? 1),
};

if (process.env.NODE_ENV === 'production' && config.jwtSegredo.startsWith('dev-')) {
  throw new Error('Defina JWT_SEGREDO em produção.');
}
