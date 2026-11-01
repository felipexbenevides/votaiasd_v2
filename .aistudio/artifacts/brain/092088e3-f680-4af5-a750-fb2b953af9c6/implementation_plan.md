# Plano de Implementação — Correção Definitiva do Link Copiado e Sincronização da Votação

Este plano detalha as correções para unificar a URL gerada pelo botão **Copiar Link** com a URL utilizada pelo QR Code (`window.location.origin` / ambiente atual de execução) e assegurar que o estado da pauta ativa e votação aberta seja carregado e sincronizado sem falhas para os participantes.

## 1. Análise da Causa Raiz Identificada
- **URL do Botão Copiar Link:** Em `AdminView.tsx` (`copyLink`), a URL estava hardcoded para `https://votaiasd.ai.studio/?code=${code}`, o que causava falha de acesso quando testado no ambiente de Preview (`ais-dev-7xsr3i4g5afec5cyuc2s5y-785742964480.us-east1.run.app` ou `localhost:3000`) caso o domínio de produção diferisse do ambiente ativo. O QR Code, por outro lado, utilizava `window.location.origin` (ou a URL dinâmica correta).
- **Sincronização do Estado da Votação:** O mecanismo SSE e o endpoint `/api/meetings/:code` já retornam `currentPoll` quando a votação está aberta (`OPEN`). Garantiremos que o estado inicial no `ParticipantView.tsx` exiba imediatamente a pauta ativa sem latência ou retenção de estado obsoleto.

## 2. Passos de Implementação

### Passo 1: Padronização da Geração do Link em `AdminView.tsx`
- Atualizar a função `copyLink` para utilizar `window.location.origin` (ou `joinUrl`), exatamente como o QR Code (`QRCodeModal.tsx`), assegurando que o link copiado corresponda ao domínio e protocolo corretos da sessão ativa.

### Passo 2: Verificação e Reforço da Sincronização do Estado em `ParticipantView.tsx`
- Garantir que `loadMeeting` e os eventos SSE atualizem o `currentPoll` e o status de votação aberta de forma robusta e síncrona.

## 3. Testes de Validação
- Testar a cópia do link no painel administrativo e abertura em nova aba.
- Testar a abertura pelo QR Code.
- Criar pauta, abrir votação, recarregar página e verificar o estado imediato.
