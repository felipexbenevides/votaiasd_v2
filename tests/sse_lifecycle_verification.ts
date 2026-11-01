import { MeetingEventSource, ConnectionStatus } from '../src/services/realtime';
import { sseManager } from '../src/server/sse';
import { db } from '../src/server/db';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

class MockEventSource {
  public static instances: MockEventSource[] = [];
  public url: string;
  public onopen: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public closed = false;
  public closeCallCount = 0;
  private listeners = new Map<string, ((e: MessageEvent) => void)[]>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  public addEventListener(type: string, cb: (e: MessageEvent) => void) {
    const arr = this.listeners.get(type) || [];
    arr.push(cb);
    this.listeners.set(type, arr);
  }

  public emit(type: string, payload: unknown) {
    const arr = this.listeners.get(type) || [];
    const evt = { data: JSON.stringify(payload) } as MessageEvent;
    for (const cb of arr) {
      cb(evt);
    }
  }

  public close() {
    this.closed = true;
    this.closeCallCount++;
  }
}

async function runSseLifecycleTests() {
  console.log('\n================================================================');
  console.log(' VOTAIASD V2 — SUITE D: 7 TESTES OBJETIVOS DO CICLO SSE');
  console.log('================================================================\n');

  (globalThis as any).EventSource = MockEventSource;

  // ---------------------------------------------------------------------------
  // 1. init_public com MEETING_CLOSED: callback executado e conexão fechada
  // ---------------------------------------------------------------------------
  console.log('--- 1. init_public com MEETING_CLOSED ---');
  MockEventSource.instances = [];
  let publicInitPayload: any = null;
  const publicStatuses: ConnectionStatus[] = [];

  const client1 = new MeetingEventSource('CLOSED01', {
    onStatusChange: (s) => publicStatuses.push(s),
    onPublicInit: (state) => {
      publicInitPayload = state;
    },
  });

  const es1 = MockEventSource.instances[0];
  es1.onopen?.();
  es1.emit('init_public', {
    id: 'm-closed-1',
    name: 'Assembleia Encerrada',
    code: 'CLOSED01',
    status: 'MEETING_CLOSED',
    participantCount: 0,
    currentPoll: null,
  });
  // Simulate server closing TCP stream immediately after
  es1.onerror?.();

  await new Promise((r) => setTimeout(r, 2200));

  assert(publicInitPayload?.status === 'MEETING_CLOSED', '1.1 Callback onPublicInit executado com MEETING_CLOSED');
  assert(es1.closed === true, '1.2 EventSource fechado após init_public com MEETING_CLOSED');
  assert((client1 as any).isManuallyClosed === true, '1.3 Flag isManuallyClosed === true');
  assert((client1 as any).eventSource === null, '1.4 Referência interna eventSource limpa (null)');
  assert((client1 as any).reconnectTimeout === null, '1.5 Nenhum timer residual de reconexão após 2.2s');
  assert(MockEventSource.instances.length === 1, '1.6 Nenhuma nova instância EventSource criada após onerror');
  assert(
    publicStatuses[publicStatuses.length - 1] === 'disconnected' && !publicStatuses.includes('reconnecting'),
    '1.7 Status final é disconnected sem entrar em reconnecting'
  );

  // ---------------------------------------------------------------------------
  // 2. init_admin com MEETING_CLOSED: callback executado e conexão fechada
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. init_admin com MEETING_CLOSED ---');
  MockEventSource.instances = [];
  let adminInitPayload: any = null;
  const adminStatuses: ConnectionStatus[] = [];

  const client2 = new MeetingEventSource(
    'CLOSED02',
    {
      onStatusChange: (s) => adminStatuses.push(s),
      onAdminInit: (state) => {
        adminInitPayload = state;
      },
    },
    'admin-token-xyz'
  );

  const es2 = MockEventSource.instances[0];
  es2.onopen?.();
  es2.emit('init_admin', {
    meeting: {
      id: 'm-closed-2',
      name: 'Comissão Encerrada',
      code: 'CLOSED02',
      status: 'MEETING_CLOSED',
      createdAt: new Date().toISOString(),
    },
    participantCount: 0,
    participants: [],
    currentPoll: null,
    currentPollResult: null,
    history: [],
  });
  es2.onerror?.();

  await new Promise((r) => setTimeout(r, 2200));

  assert(
    adminInitPayload?.meeting?.status === 'MEETING_CLOSED',
    '2.1 Callback onAdminInit executado com meeting.status === MEETING_CLOSED'
  );
  assert(es2.closed === true, '2.2 EventSource fechado após init_admin com MEETING_CLOSED');
  assert((client2 as any).isManuallyClosed === true, '2.3 Flag isManuallyClosed === true');
  assert((client2 as any).eventSource === null, '2.4 Referência interna eventSource limpa (null)');
  assert((client2 as any).reconnectTimeout === null, '2.5 Nenhum timer residual de reconexão após 2.2s');
  assert(MockEventSource.instances.length === 1, '2.6 Nenhuma reconexão disparada após 2.2s');

  // ---------------------------------------------------------------------------
  // 3. Evento meeting_ended: conexão fechada e sem reconexão
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Evento meeting_ended ---');
  MockEventSource.instances = [];
  let meetingEndedPayload: any = null;
  const endedStatuses: ConnectionStatus[] = [];

  const client3 = new MeetingEventSource('ACTIVE03', {
    onStatusChange: (s) => endedStatuses.push(s),
    onPublicInit: () => {},
    onMeetingEnded: (data) => {
      meetingEndedPayload = data;
    },
  });

  const es3 = MockEventSource.instances[0];
  es3.onopen?.();
  es3.emit('init_public', {
    id: 'm-active-3',
    name: 'Reunião em Andamento',
    code: 'ACTIVE03',
    status: 'VOTING_OPEN',
    participantCount: 5,
    currentPoll: null,
  });
  assert(es3.closed === false, '3.1 Conexão permanece aberta após init_public ativo');

  es3.emit('meeting_ended', {
    id: 'm-active-3',
    name: 'Reunião em Andamento',
    code: 'ACTIVE03',
    status: 'MEETING_CLOSED',
    participantCount: 5,
    currentPoll: null,
  });
  es3.onerror?.();

  await new Promise((r) => setTimeout(r, 2200));

  assert(meetingEndedPayload?.status === 'MEETING_CLOSED', '3.2 Callback onMeetingEnded recebeu o estado final');
  assert(es3.closed === true, '3.3 EventSource fechado imediatamente ao receber meeting_ended');
  assert((client3 as any).isManuallyClosed === true, '3.4 Flag isManuallyClosed === true');
  assert((client3 as any).reconnectTimeout === null, '3.5 Nenhum timer de reconexão pendente');
  assert(MockEventSource.instances.length === 1, '3.6 Zero tentativas de reconexão após meeting_ended');

  // ---------------------------------------------------------------------------
  // 4. Reunião ativa: conexão mantida
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Reunião ativa: conexão mantida ---');
  MockEventSource.instances = [];
  let activePublicState: any = null;
  let activeAdminState: any = null;

  const client4Pub = new MeetingEventSource('OPEN04', {
    onPublicInit: (s) => {
      activePublicState = s;
    },
  });
  const client4Adm = new MeetingEventSource(
    'OPEN04',
    {
      onAdminInit: (s) => {
        activeAdminState = s;
      },
    },
    'adm-token'
  );

  const es4Pub = MockEventSource.instances[0];
  const es4Adm = MockEventSource.instances[1];
  es4Pub.onopen?.();
  es4Adm.onopen?.();

  es4Pub.emit('init_public', {
    id: 'm-open-4',
    name: 'Reunião Ativa',
    code: 'OPEN04',
    status: 'WAITING',
    participantCount: 3,
    currentPoll: null,
  });
  es4Adm.emit('init_admin', {
    meeting: {
      id: 'm-open-4',
      name: 'Reunião Ativa',
      code: 'OPEN04',
      status: 'WAITING',
      createdAt: new Date().toISOString(),
    },
    participantCount: 3,
    participants: ['Ana', 'Bruno', 'Carlos'],
    currentPoll: null,
    currentPollResult: null,
    history: [],
  });

  assert(activePublicState?.status === 'WAITING', '4.1 Público recebeu estado WAITING');
  assert(activeAdminState?.meeting?.status === 'WAITING', '4.2 Admin recebeu estado WAITING');
  assert(es4Pub.closed === false && !(client4Pub as any).isManuallyClosed, '4.3 Conexão pública mantida aberta');
  assert(es4Adm.closed === false && !(client4Adm as any).isManuallyClosed, '4.4 Conexão admin mantida aberta');

  // ---------------------------------------------------------------------------
  // 5. Transição VOTING_CLOSED para nova pauta: conexão mantida
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Transição VOTING_CLOSED para nova pauta: conexão mantida ---');
  let pollChangedCount = 0;
  let latestPollState: any = null;
  MockEventSource.instances = [];

  const client5 = new MeetingEventSource('TRANS05', {
    onPollChanged: (d) => {
      pollChangedCount++;
      latestPollState = d;
    },
  });
  const es5 = MockEventSource.instances[0];
  es5.onopen?.();

  // Pauta 1 aberta (VOTING_OPEN)
  es5.emit('poll_changed', {
    id: 'm-5',
    name: 'Reunião Transição',
    code: 'TRANS05',
    status: 'VOTING_OPEN',
    participantCount: 4,
    currentPoll: { id: 'p1', question: 'Pauta 1', status: 'OPEN', options: [] },
  });
  assert(es5.closed === false, '5.1 Conexão mantida ao abrir Pauta 1 (VOTING_OPEN)');

  // Pauta 1 encerrada (VOTING_CLOSED)
  es5.emit('poll_changed', {
    id: 'm-5',
    name: 'Reunião Transição',
    code: 'TRANS05',
    status: 'VOTING_CLOSED',
    participantCount: 4,
    currentPoll: null,
  });
  assert(es5.closed === false, '5.2 Conexão mantida ao encerrar Pauta 1 (VOTING_CLOSED)');

  // Nova Pauta 2 criada (WAITING) e aberta (VOTING_OPEN)
  es5.emit('poll_changed', {
    id: 'm-5',
    name: 'Reunião Transição',
    code: 'TRANS05',
    status: 'WAITING',
    participantCount: 4,
    currentPoll: null,
  });
  es5.emit('poll_changed', {
    id: 'm-5',
    name: 'Reunião Transição',
    code: 'TRANS05',
    status: 'VOTING_OPEN',
    participantCount: 4,
    currentPoll: { id: 'p2', question: 'Pauta 2', status: 'OPEN', options: [] },
  });

  assert(pollChangedCount === 4, '5.3 Todas as 4 transições de pauta entregues na mesma conexão');
  assert(latestPollState?.currentPoll?.id === 'p2', '5.4 Nova pauta (p2) recebida corretamente');
  assert(es5.closed === false && MockEventSource.instances.length === 1, '5.5 Mesma instância EventSource mantida aberta sem reconexão');

  client4Pub.close();
  client4Adm.close();
  client5.close();

  // ---------------------------------------------------------------------------
  // 6. Fechamento pelo cliente: remoção correta da lista this.clients no servidor
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Fechamento pelo cliente no servidor (this.clients) ---');
  const activeMeetingInDb = db.getAllMeetings().find((m) => m.status !== 'MEETING_CLOSED');
  const testActiveCode = activeMeetingInDb ? activeMeetingInDb.code : 'TESTACTIVE';

  const closeHandlers: Record<string, () => void> = {};
  let serverResEnded = false;
  const mockServerRes: any = {
    setHeader: () => {},
    flushHeaders: () => {},
    write: () => true,
    end: () => {
      serverResEnded = true;
    },
    on: (evt: string, handler: () => void) => {
      closeHandlers[evt] = handler;
    },
  };

  const clientId6 = 'test-client-6-' + Date.now();
  const initialCount = (sseManager as any).clients.length;
  sseManager.addClient(clientId6, testActiveCode, mockServerRes, false, 'sess-test-6', 'Teste');

  const afterAddCount = (sseManager as any).clients.length;
  assert(afterAddCount === initialCount + 1, '6.1 Cliente ativo adicionado a sseManager.clients');

  // Simulate client closing the connection (triggers res 'close' event)
  closeHandlers['close']?.();
  const afterCloseCount = (sseManager as any).clients.length;
  const stillExists = (sseManager as any).clients.some((c: any) => c.id === clientId6);
  assert(afterCloseCount === initialCount && !stillExists, '6.2 Cliente removido imediatamente de sseManager.clients ao disparar res.on("close")');

  // Clean up test session from presenceTracker
  sseManager.getParticipantCount(testActiveCode);
  const { presenceTracker } = await import('../src/server/presence');
  presenceTracker.remove(testActiveCode, 'sess-test-6');

  // ---------------------------------------------------------------------------
  // 7. Ausência de conexões duplicadas ou timers residuais após encerramento
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. Ausência de conexões duplicadas ou timers residuais ---');
  MockEventSource.instances = [];
  const client7 = new MeetingEventSource('DUP07', {});
  const es7 = MockEventSource.instances[0];

  // Trigger an error to schedule a reconnectTimeout (2000ms)
  es7.onerror?.();
  assert((client7 as any).reconnectTimeout !== null, '7.1 reconnectTimeout agendado após perda temporária de rede');

  // Now close before the 2000ms timer fires
  client7.close();
  client7.close(); // Idempotent second close call
  assert((client7 as any).reconnectTimeout === null, '7.2 reconnectTimeout limpo imediatamente no close()');
  assert((client7 as any).isManuallyClosed === true, '7.3 isManuallyClosed permanece true em chamadas repetidas');

  // Wait 2.2s to verify the cancelled timer never fires connect()
  await new Promise((r) => setTimeout(r, 2200));
  assert(MockEventSource.instances.length === 1, '7.4 Nenhuma conexão duplicada criada após expiração do tempo de retry');

  // Also test server-side notifyMeetingEnded removes all clients for that code and calls res.end()
  const syntheticCode = 'SYNTH_END_' + Date.now();
  let endedA = false;
  let endedB = false;
  (sseManager as any).clients.push(
    {
      id: 'synth-a',
      meetingCode: syntheticCode,
      res: { write: () => true, end: () => { endedA = true; } },
      isAdmin: false,
    },
    {
      id: 'synth-b',
      meetingCode: syntheticCode,
      res: { write: () => true, end: () => { endedB = true; } },
      isAdmin: true,
    }
  );
  sseManager.notifyMeetingEnded(syntheticCode);
  await new Promise((r) => setTimeout(r, 1100));
  const remainingSynthetic = (sseManager as any).clients.filter((c: any) => c.meetingCode === syntheticCode);
  assert(endedA && endedB, '7.5 Servidor chamou res.end() em todos os clientes da reunião encerrada');
  assert(remainingSynthetic.length === 0, '7.6 Zero clientes residuais em sseManager.clients após notifyMeetingEnded');

  console.log('\n================================================================');
  console.log(` RESULTADO FINAL SUITE D: ${passed} APROVADOS, ${failed} FALHAS`);
  console.log('================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runSseLifecycleTests().catch((err) => {
  console.error('Erro inesperado na suite SSE:', err);
  process.exit(1);
});
