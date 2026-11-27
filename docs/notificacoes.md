# Notificações

Três avisos, com o nome do app (`APP.nome`) como remetente:

| Aviso | Quando | Abre |
|---|---|---|
| Revisita | Conduta "Revisita" com data hoje ou amanhã (ou atrasada até 30 dias), sem visita posterior ao animal | Histórico do animal |
| Resultado de cultura disponível | Cultura lançada por outra pessoa (ex.: laboratório) nos últimos 3 dias | Laboratório da visita |
| Laudo pendente de envio | Visita com todos os tubos com resultado (ou sem tubos), sem "Laudo enviado", 2 dias depois da visita | Resumo da visita |

Os prazos ficam em `src/config/app.ts` (app) e nas variáveis `DIAS_LAUDO_PENDENTE` e `DIAS_ANTECEDENCIA_REVISITA` (servidor).

## Dentro do app (sempre, inclusive offline)
O sino na barra do topo mostra quantos avisos há; a tela **Avisos** lista todos. É o caminho que sempre funciona: sem internet, sem permissão, sem servidor e em qualquer navegador. Calculado do banco local (`src/modules/avisos/regras.ts`).

## No celular (Web Push com VAPID)
- O servidor calcula os mesmos avisos em SQL (`avisos_pendentes` em `server/sql/003_push.sql`) a cada `AVISOS_MINUTOS` (padrão 15) e envia a cada aparelho inscrito do vet atribuído à propriedade. Cada aviso vai **uma vez** por pessoa (`push_enviado`). Aparelho que o navegador descartou (404/410) é removido.
- O vet ativa em **Configurações → Notificações**, com um toque (o iPhone só permite pedir a permissão depois de um toque).
- **iPhone**: só iOS 16.4 ou mais novo, com o app **instalado na Tela de Início** e aberto por lá. No Safari comum o app explica como instalar.
- Sem servidor ou sem chaves VAPID, o app mostra o motivo e os avisos continuam no sino.

### Configurar o servidor
```bash
npm run server:vapid            # gera VAPID_PUBLICA e VAPID_PRIVADA
export VAPID_PUBLICA=... VAPID_PRIVADA=...
export VAPID_CONTATO=mailto:voce@seudominio.com.br
export FUSO=America/Recife      # "hoje" dos avisos
npm run server
```
Guarde a chave privada como segredo. Trocar as chaves invalida as inscrições: os vets precisam ativar de novo.

## E-mail e WhatsApp
- O laudo pendente leva à tela Resumo, que já tem **Enviar laudo**, **Abrir WhatsApp** e **Abrir e-mail**.
- Envio automático de e-mail pelo servidor **não** está incluído: precisa de um provedor de e-mail (SMTP ou serviço). Fica para quando o Supabase for conectado.

## Supabase (depois)
A função SQL `avisos_pendentes` vai sem mudanças; o agendamento vira `pg_cron` chamando uma Edge Function que faz o envio (`web-push`).
