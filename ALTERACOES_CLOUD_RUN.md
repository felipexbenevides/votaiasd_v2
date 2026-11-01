# Ajustes de custo / SSE aplicados

Arquivos alterados:

- `src/services/realtime.ts`
  - Fecha a conexão SSE quando a aba/tela fica oculta.
  - Reabre somente quando a página volta a ficar visível.
  - Impede reconexão enquanto o app está em segundo plano.
  - Troca reconexão fixa de 2s por backoff: 1s, 2s, 5s, 10s e 30s.
  - Remove o listener `visibilitychange` no encerramento definitivo.

- `src/server/sse.ts`
  - Define duração máxima de 20 minutos por conexão SSE.
  - Limpa o timer quando o cliente desconecta.
  - Heartbeat SSE só existe enquanto houver pelo menos um cliente conectado.
  - Heartbeat passou de 15s para 30s.
  - Ao encerrar a reunião, fecha as conexões e limpa seus timers.

A presença já estava otimizada no projeto:

- heartbeat do participante a cada 60s;
- não envia heartbeat com a página oculta;
- TTL de presença de 180s.

## Cloud Run — aplicar manualmente após o deploy

No serviço do Cloud Run:

- Billing: Request-based billing
- CPU: 1 vCPU
- Memória: 512 MiB
- Minimum instances: 0
- Maximum instances: 1 (adequado enquanto o sistema precisa manter estado de presença/SSE em memória; reavaliar se precisar de alta disponibilidade ou múltiplas instâncias)

Também configure o request timeout do Cloud Run para ser maior que o timeout SSE da aplicação, por exemplo 25 minutos, para que a aplicação encerre primeiro a conexão de 20 minutos.

## Persistência JSON / Firestore

Não foi alterada nesta versão. O projeto ainda grava `data/voting_db.json` localmente em várias operações, apesar de o Firestore já ser tratado no código como fonte autoritativa. Essa otimização deve ser feita separadamente e testada com cuidado para não afetar recuperação, votação ou auditoria.
