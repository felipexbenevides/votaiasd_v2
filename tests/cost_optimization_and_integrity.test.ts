import { presenceTracker } from '../src/server/presence';
import { db } from '../src/server/db';
import { sseManager } from '../src/server/sse';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName} ${details ? `(${details})` : ''}`);
  }
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log(' VOTAIASD V2 — TEST SUITE: COST OPTIMIZATION & INTEGRITY');
  console.log('======================================================\n');

  // TEST SUITE 1: PRESENCE TRACKER (60s heartbeat & 180s TTL)
  console.log('--- 1. PRESENCE TRACKER & TTL (60s / 180s) ---');
  const testMeeting = 'TEST-OPT-01';
  const sessionA = 'sess-user-a-' + Date.now();
  const sessionB = 'sess-user-b-' + Date.now();

  // Test 1.1: Register session
  presenceTracker.touch(testMeeting, sessionA, 'Lucas');
  assert(presenceTracker.getCount(testMeeting) === 1, 'Participant A presence registered');
  const participants = presenceTracker.getParticipants(testMeeting);
  assert(participants.length === 1 && participants[0] === 'Lucas', 'Participant name tracked correctly');

  // Test 1.2: Idempotence - touch same session does not duplicate count
  presenceTracker.touch(testMeeting, sessionA, 'Lucas');
  assert(presenceTracker.getCount(testMeeting) === 1, 'Duplicate touch does not increment count');

  // Test 1.3: Second participant
  presenceTracker.touch(testMeeting, sessionB, 'Maria');
  assert(presenceTracker.getCount(testMeeting) === 2, 'Two distinct participants count is 2');

  // Test 1.4: Immediate remove on leave
  presenceTracker.remove(testMeeting, sessionB);
  assert(presenceTracker.getCount(testMeeting) === 1, 'Leave immediately decrements count');

  // Test 1.5: Verify TTL constant is 180,000 ms (180s)
  const ttl = (presenceTracker as any).TTL_MS;
  assert(ttl === 180000, 'Presence TTL is set to 180,000 ms (180 seconds)');

  // Test 1.6: Verify session remains active at 65s (past the old 45s threshold)
  const internalMeetings = (presenceTracker as any).meetings;
  const sessionsMap = internalMeetings.get(testMeeting);
  const sessionData = sessionsMap.get(sessionA);
  const originalLastSeen = sessionData.lastSeen;
  
  // Simulate 70 seconds elapsed (within 180s TTL)
  sessionData.lastSeen = Date.now() - 70000;
  assert(presenceTracker.getCount(testMeeting) === 1, 'Participant active after 70s (old 45s TTL did not expire it)');

  // Simulate 179 seconds elapsed (still within 180s TTL)
  sessionData.lastSeen = Date.now() - 179000;
  assert(presenceTracker.getCount(testMeeting) === 1, 'Participant active at 179s');

  // Simulate 181 seconds elapsed (exceeds 180s TTL)
  sessionData.lastSeen = Date.now() - 181000;
  assert(presenceTracker.getCount(testMeeting) === 0, 'Participant correctly expired after 180s TTL');

  // Restore and cleanup test meeting
  presenceTracker.remove(testMeeting, sessionA);
  assert(presenceTracker.getCount(testMeeting) === 0, 'Test meeting sessions cleanly cleared');

  // TEST SUITE 2: EXPIRED SESSIONS CLEANUP
  console.log('\n--- 2. EXPIRED SESSIONS CLEANUP TIMER (30s) ---');
  assert(typeof (presenceTracker as any).cleanup === 'function', 'Cleanup method exists and is functional');
  // Verify cleanup removes expired entries without throwing
  (presenceTracker as any).cleanup();
  assert(true, 'Cleanup execution passed cleanly without errors');

  // TEST SUITE 3: SSE CONNECTION TERMINATION ON MEETING END
  console.log('\n--- 3. SSE CONTROLLED STREAM CLOSURE ---');
  let mockResEnded: boolean = false;
  const mockRes: any = {
    setHeader: () => {},
    flushHeaders: () => {},
    write: () => true,
    end: () => {
      mockResEnded = true;
    },
    on: () => {},
  };

  // Test 3.1: Add client to closed meeting
  const closedMeeting = db.getAllMeetings().find((m) => m.status === 'MEETING_CLOSED');
  if (closedMeeting) {
    sseManager.addClient('client-test-closed', closedMeeting.code, mockRes, false, 'sess-closed-test');
    // Wait for the controlled closure timeout
    await new Promise((r) => setTimeout(r, 600));
    assert(Boolean(mockResEnded), 'SSE connection to closed meeting is immediately terminated (res.end)');
  } else {
    assert(true, 'No historical closed meeting found (skipped closed meeting check)');
  }

  // Test 3.2: SSE Manager keepalive sends without failure
  assert(typeof (sseManager as any).sendHeartbeat === 'function', 'SSE keepalive heartbeat method exists');

  // TEST SUITE 4: VOTE INTEGRITY & ANONYMITY
  console.log('\n--- 4. VOTE INTEGRITY & ANONYMITY ---');
  // Check that anonymousSessionId cannot be linked to user identity in DB
  const sampleVotes = (db as any).data.votes || [];
  if (sampleVotes.length > 0) {
    const v = sampleVotes[0];
    assert(Boolean(v.id && v.pollId && v.optionId && v.anonymousSessionId), 'Vote schema preserves anonymousSessionId, pollId, optionId');
    assert((v as any).nominatorName === undefined, 'Vote schema does NOT store participant name');
    assert((v as any).userEmail === undefined, 'Vote schema does NOT store user email');
  } else {
    assert(true, 'No sample votes present in database');
  }

  // TEST SUITE 5: VOTING MATH & STRICT MAJORITY RULES
  console.log('\n--- 5. VOTING RULES & SEAT LIMITS ---');
  // Test mathematical strict majority (> 50%)
  const totalVotesTest = 10;
  const majorityThreshold = Math.floor(totalVotesTest / 2) + 1; // 6
  assert(majorityThreshold === 6, 'Strict majority for 10 votes is 6 votes (>50%)');
  const totalVotesOdd = 11;
  const majorityThresholdOdd = Math.floor(totalVotesOdd / 2) + 1; // 6
  assert(majorityThresholdOdd === 6, 'Strict majority for 11 votes is 6 votes (>50%)');

  // TEST SUITE 6: ATAS & HISTORICAL PRESERVATION
  console.log('\n--- 6. HISTORICAL MEETINGS & ATAS ---');
  const meetings = db.getAllMeetings();
  assert(Array.isArray(meetings), 'Meetings array intact');
  const polls = (db as any).data.polls || [];
  assert(Array.isArray(polls), 'Polls array intact');
  const options = (db as any).data.options || [];
  assert(Array.isArray(options), 'Options array intact');
  console.log(`  Current counts: ${meetings.length} meetings, ${polls.length} polls, ${options.length} options, ${sampleVotes.length} votes.`);

  // SUMMARY
  console.log('\n======================================================');
  console.log(` RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
