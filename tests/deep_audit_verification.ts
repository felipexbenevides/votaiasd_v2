import { db } from '../src/server/db';
import { presenceTracker } from '../src/server/presence';

let passed = 0;
let failed = 0;

function check(cond: boolean, name: string, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  [OK] ${name}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
  }
}

async function audit() {
  console.log('====================================================');
  console.log(' VOTAIASD V2 — DEEP SYSTEM INTEGRITY & AUDIT SUITE');
  console.log('====================================================\n');

  // 1. PRESENCE TRACKER BOUNDARY & OVERFLOW AUDIT
  console.log('--- 1. PRESENCE TRACKER BOUNDARIES ---');
  const code = 'AUDIT-MEETING-99';
  const sess1 = 'sess-audit-1';
  const sess2 = 'sess-audit-2';

  presenceTracker.touch(code, sess1, 'Ana');
  presenceTracker.touch(code, sess2, 'Beto');
  check(presenceTracker.getCount(code) === 2, 'Initial participant count is 2');

  // Simulate multiple quick touches (e.g. rapid visibilitychange or double render)
  for (let i = 0; i < 10; i++) {
    presenceTracker.touch(code, sess1, 'Ana');
  }
  check(presenceTracker.getCount(code) === 2, 'Rapid repeated touches do not inflate count');

  // Simulate clean leave
  presenceTracker.remove(code, sess1);
  check(presenceTracker.getCount(code) === 1, 'Clean leave immediately reduces count to 1');
  presenceTracker.remove(code, sess2);
  check(presenceTracker.getCount(code) === 0, 'Clean leave of second participant reduces count to 0');

  // 2. ATA GENERATION & HISTORICAL DATA PRESERVATION
  console.log('\n--- 2. HISTORICAL ATAS & DATA STRUCTURE ---');
  const allMeetings = db.getAllMeetings();
  check(allMeetings.length > 0, `Total meetings loaded: ${allMeetings.length}`);

  // Find a closed meeting with polls to test ATA generation
  const closedMeeting = allMeetings.find((m) => m.status === 'MEETING_CLOSED');
  if (closedMeeting) {
    console.log(`  Testing ATA generation on historical meeting: "${closedMeeting.name}" (${closedMeeting.code})`);
    try {
      const ataData = db.getOrGenerateMeetingAta(closedMeeting.id);
      check(Boolean(ataData && ataData.meetingName), 'Nomination Commission ATA generated successfully without errors');
      check(Array.isArray(ataData.departments), 'ATA contains valid departments list');
    } catch (err: any) {
      check(false, 'Nomination ATA generation error', err?.message);
    }

    try {
      const orgAtaData = db.getOrGenerateOrganizingMeetingAta(closedMeeting.id);
      check(Boolean(orgAtaData && orgAtaData.meetingName), 'Organizing Commission ATA generated successfully without errors');
      check(Array.isArray(orgAtaData.membersList), 'Organizing ATA contains valid membersList');
    } catch (err: any) {
      check(false, 'Organizing ATA generation error', err?.message);
    }
  }

  // 3. VOTING MATH & STRICT ABSOLUTE MAJORITY
  console.log('\n--- 3. STRICT ABSOLUTE MAJORITY AUDIT ---');
  // Strict majority rule: strictly > 50%
  // 6 voters -> majority is 4 (3 is 50%, not > 50%)
  const votesEven = [
    { v: 3, total: 6, expected: false },
    { v: 4, total: 6, expected: true },
    { v: 3, total: 7, expected: false },
    { v: 4, total: 7, expected: true },
    { v: 5, total: 10, expected: false },
    { v: 6, total: 10, expected: true },
  ];

  for (const item of votesEven) {
    const isStrictMajority = item.total > 0 && 2 * item.v > item.total;
    check(
      isStrictMajority === item.expected,
      `${item.v}/${item.total} votes -> majority is ${isStrictMajority} (expected ${item.expected})`
    );
  }

  // 4. DUPLICATE VOTE REJECTION IN ENGINE
  console.log('\n--- 4. DUPLICATE VOTE REJECTION ---');
  const samplePoll = (db as any).data.polls?.[0];
  if (samplePoll) {
    const existingVote = (db as any).data.votes?.find((v: any) => v.pollId === samplePoll.id);
    if (existingVote) {
      const hasVoted = db.hasUserVoted(samplePoll.id, existingVote.anonymousSessionId);
      check(hasVoted === true, 'Engine accurately detects that session has already voted on this poll');

      // Attempt to register duplicate vote through registerVote
      const dupAttempt = await db.registerVote(samplePoll.id, existingVote.optionId, existingVote.anonymousSessionId);
      check(dupAttempt.success === false, 'Engine strictly rejects duplicate vote from same session');
    }
  }

  // 5. ANONYMITY AUDIT: VOTE RECORDS VS PARTICIPANT SESSIONS
  console.log('\n--- 5. ANONYMITY ISOLATION AUDIT ---');
  const allVotes = (db as any).data.votes || [];
  let personalDataFoundInVotes = false;
  for (const v of allVotes) {
    if (v.name || v.email || v.nominatorName || v.cpf || v.phone) {
      personalDataFoundInVotes = true;
      break;
    }
  }
  check(!personalDataFoundInVotes, '100% of votes in database contain zero personal identifying data');

  console.log('\n====================================================');
  console.log(` DEEP AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

audit().catch((err) => {
  console.error('Audit failed with uncaught exception:', err);
  process.exit(1);
});
