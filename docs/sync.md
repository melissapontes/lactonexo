# Sincronização e conflitos do LactoNexo

## Princípios

1. **Tudo é gravado primeiro no aparelho** (IndexedDB). A tela nunca espera a rede.
2. **Cada alteração vira uma operação** na fila (`fila_ops`): UUID próprio (`op_id`), só os campos alterados,
   relógio HLC e a versão do servidor que o aparelho conhecia (`versao_base`). Edições seguidas do mesmo registro,
   ainda não enviadas, viram uma operação só.
3. **O servidor é a fonte da verdade.** Ele aplica as operações e devolve o que mudou desde o cursor do aparelho.

## Quando sincroniza

Ao abrir o app, ao voltar para o app, quando a internet volta, a cada 2 minutos com o app aberto e no botão
"Sincronizar agora". Não depende de sincronização em segundo plano (não funciona no iPhone).

Ordem de um ciclo: envia a fila (lotes de até 200) → baixa as mudanças desde o cursor (páginas de 500) →
baixa inteiras as propriedades recém-atribuídas → envia fotos.

## Garantias

| Situação | O que acontece |
| --- | --- |
| Rede cai durante o envio | As operações voltam para a fila; nova tentativa em 2 s, 4 s, 8 s… até 5 min. "Sincronizar agora" não espera. |
| App fecha durante o envio | Ao abrir, operações "enviando" voltam para "pendente". |
| Mesma operação enviada duas vezes | O servidor reconhece o `op_id` e não aplica de novo. |
| Registro filho chega antes do pai | Servidor responde "adiada"; a operação fica na fila e é reenviada. |
| Servidor recusa (sem permissão, dado inválido) | A operação fica marcada como "não sincronizada", visível em Configurações. Nunca some. |
| Chegam do servidor dados de um registro com edição local ainda não enviada | A edição local é reaplicada por cima. |

## Regra de conflito

**Por campo, vence a edição com o relógio (HLC) mais recente.** Tudo que chega fica gravado em `sync_operacao`
e em `auditoria` (quem, quando, valor anterior, valor novo, se foi aplicado), inclusive o valor que perdeu.

Há **conflito para revisão** quando o mesmo campo foi alterado por **outra pessoa** depois da versão que o aparelho
conhecia, os valores são diferentes, e o campo é clínico:
Tamis, CMT, posição do teto, resultado da cultura, rótulo e resultado do antibiograma, conduta (tipo, produto, dose,
período, data de revisita), identificação do animal, número do tubo e exclusão.

Nesses casos o valor mais recente fica valendo e os dois vets veem "N conflitos para revisar". Na tela de conflitos,
um deles escolhe "Manter" o valor em uso ou "Usar" o outro; a escolha vira uma alteração normal, sincronizada e auditada.

Casos especiais:
- Campos diferentes do mesmo registro: os dois valem, sem conflito.
- O mesmo vet em dois aparelhos: vence o mais recente, sem conflito (fica na auditoria).
- **Exclusão contra edição** de outra pessoa: a edição vence, o registro continua e o conflito é sinalizado.

## Fotos

Comprimidas no aparelho (lado maior 1600 px, JPEG 80%, orientação EXIF aplicada), guardadas no IndexedDB e enviadas
numa fila separada em partes de 256 KB. Antes de enviar, o app pergunta ao servidor quantos bytes ele já tem e
continua dali. O registro da foto sincroniza antes do arquivo.

## Sessão

Token de acesso de 1 hora; token de renovação de 30 dias (configurável em `DIAS_SESSAO`), trocado a cada uso.
Sem internet o app continua funcionando com a sessão guardada. Se ela expirar, a fila fica guardada e é enviada
depois do novo login. Os tokens ficam no IndexedDB, não no localStorage.

## Troca para o Supabase

- As tabelas (`server/sql/001_esquema.sql`) e as funções `sync_push`/`sync_pull` (`002_sync.sql`) rodam no Supabase.
- O app fala com o servidor só por `SyncTransport` (`src/sync/transporte.ts`). Para o Supabase:
  `push` → `supabase.rpc('sync_push', { p_usuario, p_ops })`, `pull` → `supabase.rpc('sync_pull', …)`.
  Nessa troca, `p_usuario` passa a vir de `auth.uid()` dentro das funções (security definer), e o login passa para o Supabase Auth.
- As fotos passam do PostgreSQL (`foto_arquivo`) para o Supabase Storage com upload retomável (TUS).
