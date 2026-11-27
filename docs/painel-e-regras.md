# Histórico, painel e apoio à decisão (módulo mastite)

## Histórico por animal e por teto
Tela do animal (`/animais/:id`):
- **Evolução do CMT por teto**: um gráfico pequeno para cada teto (AE, AD, PE, PD), uma visita por ponto. Ponto vermelho maior = Tamis positivo. Tocar no ponto mostra o valor.
- **Resumo**: agentes isolados, antibióticos com resultado Resistente e produtos usados nas condutas.
- **Linha do tempo**: por visita, Tamis, CMT, tubo e agente de cada teto, antibiogramas ligados aos tubos do animal (inclusive pool) e condutas.

Os dados vêm de `src/modules/mastite/historico.ts` (`carregarHistorico`), que lê tudo da propriedade no banco local. O cálculo funciona sem internet.

## Painel da propriedade
Rota `/propriedades/:id/painel` (`src/modules/mastite/painel.ts`):

| Indicador | Definição |
|---|---|
| Mastite clínica (tetos) | Tetos com Tamis positivo ÷ tetos com Tamis registrado |
| Mastite subclínica (tetos) | Tetos com CMT `+` ou mais **e** sem Tamis positivo ÷ tetos com CMT registrado. Traços (T) não conta. |
| Por animal | Animais com pelo menos um teto clínico (ou subclínico) ÷ animais examinados |
| Agentes mais frequentes | Tubos em que o agente foi isolado ÷ tubos com resultado de cultura. Um tubo com dois agentes conta nos dois. |
| Perfil de resistência | Por antibiótico: quantos resultados S, I e R, e % R |
| Comparação entre visitas | Uma linha por visita com exames, mais um gráfico de clínica e subclínica quando há 2 visitas ou mais |

O limiar de subclínica fica em `LIMIAR_SUBCLINICA` (`painel.ts`).

## Regras de apoio à decisão
Sempre **sugestões**. O app nunca decide sozinho. Configuráveis em Configurações (com servidor, só o administrador altera; o servidor recusa o resto).

| Regra | Parâmetros padrão | Sugere quando |
|---|---|---|
| CMT alto em visitas seguidas | CMT ≥ `++`, 2 visitas | o mesmo teto ficou no limiar ou acima nas últimas N visitas do animal |
| Mesmo agente isolado de novo | 2 vezes nas últimas 3 visitas | um agente da última visita já apareceu antes no animal |
| Resistência no antibiograma | só Resistente | o antibiograma da última visita do animal tem R (opcional: I) |
| Animais para revisita | CMT ≥ `+++` ou Tamis +, 7 dias | a última visita teve teto alterado e não há revisita marcada; ou a revisita marcada na conduta chegou |

### Como as sugestões sincronizam
- As sugestões **não são gravadas**: são calculadas na hora a partir dos dados. Dois aparelhos offline chegam às mesmas sugestões, sem duplicar.
- Cada sugestão tem um **id determinístico** (regra + animal + visita + detalhe).
- Só a **resposta do vet** é gravada e sincronizada: um registro `alerta` com o mesmo id e status `dispensado` ou `conduta_registrada`, e a `conduta` com `alerta_origem_id`. Se dois vets respondem a mesma sugestão offline, vale a regra de sempre (por campo, a última edição vence).
- As regras padrão têm ids fixos (`regra:mastite:<tipo>`), criados no app sem entrar na fila e no servidor junto com o catálogo (`garantirCatalogoServidor`).

## Conduta
O vet registra a conduta na tela do animal na visita, ou direto da sugestão: tratamento, descarte de leite, secagem, revisita (com data), descarte do animal ou outro, com teto, produto, dose, período e observação.
