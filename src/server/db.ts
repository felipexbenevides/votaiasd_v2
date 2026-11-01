import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { firestoreService } from './firestoreService';
import {
  Meeting,
  Poll,
  Option,
  PollResult,
  OptionResult,
  PublicMeetingState,
  AdminMeetingState,
  HistoryMeetingSummary,
  HistoryMonthGroup,
  HistoryYearGroup,
  NominationMeetingConfig,
  NominationRecord,
  NominationAdminSummary,
  NominationDepartmentStats,
  PublicNominationState,
  SelectedNominee,
  ExpectedParticipant,
  NominationParticipantsTracking,
  ParticipantProgressStatus,
  ParticipantTrackingItem,
  AtaDocumentData,
  AtaDepartmentItem,
  OrganizingAtaDocumentData,
  ChurchNominationConfig,
  ChurchNominationSubmission,
  ChurchNominatedPerson,
  ChurchNominationsReport,
  ChurchDepartmentConsolidation,
  ChurchDepartmentNomineeStats,
  PublicChurchNominationData,
  OrganizingCommissionCriterion,
  OrganizingCommissionConfig,
  OrganizingNominationRecord,
  OrganizingSelectedNominee,
  OrganizingCommissionAdminSummary,
  PublicOrganizingCommissionState,
  PollRoundDecisionAudit,
} from '../types';

export function getSuggestedCutoffPercentage(roundNumber: number): number {
  const r = Math.max(1, roundNumber || 1);
  if (r === 1) return 25;
  if (r === 2) return 35;
  return 40;
}
import {
  getDefaultMeetingDepartments,
  canDepartmentHaveAssociates,
  getDepartmentPollDisplayName,
  CENTRAL_DEPARTMENT_CATALOG,
  resolveCanonicalDepartment,
  matchDepartmentAliasToCatalogId,
  formatOrganizingCriterionPollTitle,
} from '../constants/departments';

export interface UserRecord {
  id: string;
  firebaseUid?: string;
  username: string;
  usernameLower: string;
  email: string;
  emailLower: string;
  passwordHash?: string;
  salt?: string;
  createdAt: string;
}

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: string; // ISO string
  used: boolean;
  createdAt: string;
}

export interface UserSessionRecord {
  token: string;
  userId: string;
  createdAt: string;
}

export interface ParticipantSessionRecord {
  sessionId: string;
  meetingId: string;
  nominatorName: string;
  createdAt: string;
  updatedAt: string;
  finalized?: boolean;
}

export interface DatabaseSchema {
  users?: UserRecord[];
  sessions?: UserSessionRecord[];
  passwordResetTokens?: PasswordResetTokenRecord[];
  meetings: Meeting[];
  polls: Poll[];
  options: Option[];
  votes: {
    id: string;
    pollId: string;
    optionId: string;
    anonymousSessionId: string;
    createdAt: string;
  }[];
  nominationConfigs?: NominationMeetingConfig[];
  nominations?: NominationRecord[];
  selectedNominees?: SelectedNominee[];
  expectedParticipants?: ExpectedParticipant[];
  participantSessions?: ParticipantSessionRecord[];
  churchNominationConfigs?: ChurchNominationConfig[];
  churchNominationSubmissions?: ChurchNominationSubmission[];
  organizingCommissionConfigs?: OrganizingCommissionConfig[];
  organizingNominations?: OrganizingNominationRecord[];
  organizingSelectedNominees?: OrganizingSelectedNominee[];
  organizingParticipantSessions?: ParticipantSessionRecord[];
}

export type VoteRecord = NonNullable<DatabaseSchema['votes']>[number];

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'voting_db.json');

// --- Crypto & Token Helper Functions ---
export function generateSecureShortToken(prefixHint?: string): string {
  const slug = (prefixHint || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 16);

  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const randomBytes = crypto.randomBytes(8);
  let rand = '';
  for (let i = 0; i < 8; i++) {
    rand += chars[randomBytes[i] % chars.length];
  }

  return slug ? `${slug}-${rand}` : `nom-${rand}`;
}
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const generatedSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, generatedSalt, 64).toString('hex');
  return { hash, salt: generatedSalt };
}

export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  try {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const hashBuffer = Buffer.from(hash, 'hex');
    const storedHashBuffer = Buffer.from(storedHash, 'hex');
    if (hashBuffer.length !== storedHashBuffer.length) return false;
    return crypto.timingSafeEqual(hashBuffer, storedHashBuffer);
  } catch {
    return false;
  }
}

export const APPROVAL_OPTION_WORDS = new Set([
  'sim', 'nao', 'não', 'aprovar', 'aprovado', 'rejeitar', 'rejeitado', 'abstencao', 'abstenção', 'branco', 'nulo'
]);

export function isApprovalPoll(options: Option[]): boolean {
  if (!options || options.length === 0) return false;
  return options.every((opt) => APPROVAL_OPTION_WORDS.has(opt.text.trim().toLowerCase()));
}

export function extractNomineeFromApprovalQuestion(question: string, deptName?: string): string | null {
  let clean = question.trim();
  clean = clean.replace(/^(aprovação|aprovacao|votação|votacao|indicação|indicacao|nomeação|nomeacao)\s+(de|do|da|dos|das)?\s*/i, '');
  clean = clean.replace(/^(candidato\(a\)?|titular)\s*:\s*/i, '');
  if (clean.includes(':')) {
    const parts = clean.split(':').map((p) => p.trim());
    if (parts.length === 2) {
      if (deptName && parts[0].toLowerCase().includes(deptName.toLowerCase())) return parts[1];
      if (deptName && parts[1].toLowerCase().includes(deptName.toLowerCase())) return parts[0];
      return parts[1] || parts[0];
    }
  }
  if (clean.includes(' - ')) {
    const parts = clean.split(' - ').map((p) => p.trim());
    if (parts.length === 2) {
      if (deptName && parts[0].toLowerCase().includes(deptName.toLowerCase())) return parts[1];
      if (deptName && parts[1].toLowerCase().includes(deptName.toLowerCase())) return parts[0];
      return parts[0];
    }
  }
  if (deptName) {
    const regex = new RegExp(`\\b${deptName}\\b`, 'gi');
    const withoutDept = clean.replace(regex, '').replace(/\bpara\s+(o|a)?\b/gi, '').trim();
    if (withoutDept.length > 2) return withoutDept;
  }
  return clean.length > 0 ? clean : null;
}

export function isAssociateSubPoll(p: Poll): boolean {
  if (p.isAssociatePoll || Boolean(p.parentPollId)) return true;
  if (typeof p.question === 'string') {
    const q = p.question.trim().toUpperCase();
    if (
      q.startsWith('ASSOCIADOS -') ||
      q.startsWith('ASSOCIADOS –') ||
      q.startsWith('ASSOCIADO -') ||
      q.startsWith('ASSOCIADO –')
    ) {
      return true;
    }
  }
  return false;
}

class Database {
  private data: DatabaseSchema = {
    users: [],
    passwordResetTokens: [],
    meetings: [],
    polls: [],
    options: [],
    votes: [],
    nominationConfigs: [],
    nominations: [],
    selectedNominees: [],
    expectedParticipants: [],
    participantSessions: [],
  };

  public initPromise: Promise<void>;

  constructor() {
    this.init();
    this.initPromise = this.initFirestore().catch((err) => {
      console.error('[Database] Failed to initialize Firestore sync:', err);
    });
  }

  private async initFirestore() {
    try {
      const isReady = await firestoreService.init();
      if (!isReady) {
        console.warn('[Database] Firestore not ready, continuing with local JSON database.');
        return;
      }
      const remoteData = await firestoreService.loadAll();
      if (remoteData) {
        // Authoritative load from Firestore: Firestore is the ONLY source of truth
        this.data = {
          users: remoteData.users || [],
          sessions: remoteData.sessions || [],
          passwordResetTokens: remoteData.passwordResetTokens || [],
          meetings: remoteData.meetings || [],
          polls: remoteData.polls || [],
          options: remoteData.options || [],
          votes: remoteData.votes || [],
          nominationConfigs: remoteData.nominationConfigs || [],
          nominations: remoteData.nominations || [],
          selectedNominees: remoteData.selectedNominees || [],
          expectedParticipants: remoteData.expectedParticipants || [],
          participantSessions: remoteData.participantSessions || [],
          churchNominationConfigs: remoteData.churchNominationConfigs || [],
          churchNominationSubmissions: remoteData.churchNominationSubmissions || [],
          organizingCommissionConfigs:
            (remoteData.organizingCommissionConfigs && remoteData.organizingCommissionConfigs.length > 0)
              ? remoteData.organizingCommissionConfigs
              : (this.data.organizingCommissionConfigs || []),
          organizingNominations:
            (remoteData.organizingNominations && remoteData.organizingNominations.length > 0)
              ? remoteData.organizingNominations
              : (this.data.organizingNominations || []),
          organizingSelectedNominees:
            (remoteData.organizingSelectedNominees && remoteData.organizingSelectedNominees.length > 0)
              ? remoteData.organizingSelectedNominees
              : (this.data.organizingSelectedNominees || []),
          organizingParticipantSessions:
            (remoteData.organizingParticipantSessions && remoteData.organizingParticipantSessions.length > 0)
              ? remoteData.organizingParticipantSessions
              : (this.data.organizingParticipantSessions || []),
        };
        console.log(`[Database] Loaded authoritative data from Firestore (${this.data.users.length} users, ${this.data.meetings.length} meetings).`);
        await this.sanitizeAndDeduplicateUsers();
        this.purgeDemoData();
        this.saveLocal();
      }
    } catch (err) {
      console.error('[Database] Failed to initialize Firestore synchronization:', err);
    }
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          users: parsed.users || [],
          sessions: parsed.sessions || [],
          passwordResetTokens: parsed.passwordResetTokens || [],
          meetings: parsed.meetings || [],
          polls: parsed.polls || [],
          options: parsed.options || [],
          votes: parsed.votes || [],
          nominationConfigs: parsed.nominationConfigs || [],
          nominations: parsed.nominations || [],
          selectedNominees: parsed.selectedNominees || [],
          expectedParticipants: parsed.expectedParticipants || [],
          participantSessions: parsed.participantSessions || [],
          churchNominationConfigs: parsed.churchNominationConfigs || [],
          churchNominationSubmissions: parsed.churchNominationSubmissions || [],
          organizingCommissionConfigs: parsed.organizingCommissionConfigs || [],
          organizingNominations: parsed.organizingNominations || [],
          organizingSelectedNominees: parsed.organizingSelectedNominees || [],
          organizingParticipantSessions: parsed.organizingParticipantSessions || [],
        };
        this.purgeDemoData();
      } else {
        this.saveLocal();
      }
    } catch (err) {
      console.error('Failed to initialize database file:', err);
    }
  }

  /**
   * Remove seletivamente apenas os dados sintéticos da demonstração ("TESTE — ELIMINAÇÃO ASSISTIDA V2" / DEMO25)
   * sem jamais alterar ou tocar em nenhuma reunião oficial.
   */
  public purgeDemoData(): void {
    const isDemoMeetingRecord = (m: Meeting) =>
      Boolean(
        m.isDemo === true ||
          m.id === 'demo-meeting-2026' ||
          m.code === 'DEMO25' ||
          m.name === 'TESTE — ELIMINAÇÃO ASSISTIDA V2'
      );

    const demoMeetingIds = new Set(
      (this.data.meetings || []).filter(isDemoMeetingRecord).map((m) => m.id)
    );
    demoMeetingIds.add('demo-meeting-2026');

    const isDemoPollRecord = (p: Poll) =>
      Boolean(
        p.isDemo === true ||
          p.id === 'demo-poll-round-1' ||
          p.rootPollId === 'demo-poll-round-1' ||
          demoMeetingIds.has(p.meetingId)
      );

    const demoPollIds = new Set(
      (this.data.polls || []).filter(isDemoPollRecord).map((p) => p.id)
    );
    demoPollIds.add('demo-poll-round-1');

    const prevMeetingsLen = (this.data.meetings || []).length;
    const prevPollsLen = (this.data.polls || []).length;
    const prevOptionsLen = (this.data.options || []).length;
    const prevVotesLen = (this.data.votes || []).length;

    this.data.meetings = (this.data.meetings || []).filter((m) => !isDemoMeetingRecord(m));
    this.data.polls = (this.data.polls || []).filter((p) => !isDemoPollRecord(p));
    this.data.options = (this.data.options || []).filter(
      (o) => !o.isDemo && !o.id.startsWith('demo-opt-') && !demoPollIds.has(o.pollId)
    );
    this.data.votes = (this.data.votes || []).filter(
      (v) =>
        !v.id.startsWith('demo-vote-') &&
        !(v.anonymousSessionId && v.anonymousSessionId.startsWith('synthetic-voter-session-')) &&
        !demoPollIds.has(v.pollId)
    );

    if (
      this.data.meetings.length !== prevMeetingsLen ||
      this.data.polls.length !== prevPollsLen ||
      this.data.options.length !== prevOptionsLen ||
      this.data.votes.length !== prevVotesLen
    ) {
      this.saveLocal();
    }
  }

  private saveLocal() {
    try {
      const tempPath = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Failed to persist database to disk:', err);
    }
  }

  private save() {
    this.saveLocal();
  }

  // --- User Authentication Methods ---

  public async createUser(username: string, email: string, password: string): Promise<UserRecord> {
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    const usernameLower = trimmedUsername.toLowerCase();
    const emailLower = trimmedEmail.toLowerCase();

    if (this.getUserByUsername(trimmedUsername)) {
      throw new Error('Este nome de usuário já está em uso.');
    }

    if (this.getUserByEmail(trimmedEmail)) {
      throw new Error('Este e-mail já está cadastrado.');
    }

    const { hash, salt } = hashPassword(password);
    const user: UserRecord = {
      id: crypto.randomUUID(),
      username: trimmedUsername,
      usernameLower,
      email: trimmedEmail,
      emailLower,
      passwordHash: hash,
      salt,
      createdAt: new Date().toISOString(),
    };

    // Await durable Firestore write
    await firestoreService.saveEntity('users', user.id, user);

    if (!this.data.users) {
      this.data.users = [];
    }
    this.data.users.push(user);
    this.saveLocal();
    return user;
  }

  public getUserByUsername(username: string): UserRecord | undefined {
    if (!username) return undefined;
    const lower = username.trim().toLowerCase();
    return (this.data.users || []).find(
      (u) =>
        u.usernameLower === lower ||
        (u.username && u.username.trim().toLowerCase() === lower)
    );
  }

  public getUserByEmail(email: string): UserRecord | undefined {
    if (!email) return undefined;
    const lower = email.trim().toLowerCase();
    return (this.data.users || []).find(
      (u) =>
        u.emailLower === lower ||
        (u.email && u.email.trim().toLowerCase() === lower)
    );
  }

  public async findUserByUsername(username: string): Promise<UserRecord | undefined> {
    if (!username) return undefined;
    const lower = username.trim().toLowerCase();

    // Direct authoritative query to Firestore votaiasd-v2/(default)
    const remoteUser = await firestoreService.getUserByUsername(lower);
    if (remoteUser) {
      if (!this.data.users) this.data.users = [];
      const idx = this.data.users.findIndex((u) => u.id === remoteUser.id);
      if (idx >= 0) {
        this.data.users[idx] = remoteUser;
      } else {
        this.data.users.push(remoteUser);
      }
      return remoteUser;
    }
    return undefined;
  }

  public async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    if (!email) return undefined;
    const lower = email.trim().toLowerCase();

    // Direct authoritative query to Firestore votaiasd-v2/(default)
    const remoteUser = await firestoreService.getUserByEmail(lower);
    if (remoteUser) {
      if (!this.data.users) this.data.users = [];
      const idx = this.data.users.findIndex((u) => u.id === remoteUser.id);
      if (idx >= 0) {
        this.data.users[idx] = remoteUser;
      } else {
        this.data.users.push(remoteUser);
      }
      return remoteUser;
    }
    return undefined;
  }

  public async findUserById(id: string): Promise<UserRecord | undefined> {
    if (!id) return undefined;
    const remoteUser = await firestoreService.getUserById(id);
    if (remoteUser) {
      return remoteUser;
    }
    return undefined;
  }

  public async findUserByFirebaseUid(uid: string): Promise<UserRecord | undefined> {
    if (!uid) return undefined;
    const remoteUser = await firestoreService.getUserById(uid);
    if (remoteUser) {
      return remoteUser;
    }
    return undefined;
  }

  public getUserById(id: string): UserRecord | undefined {
    if (!id) return undefined;
    return (this.data.users || []).find((u) => u.id === id || u.firebaseUid === id);
  }

  public getUserByFirebaseUid(uid: string): UserRecord | undefined {
    if (!uid) return undefined;
    return (this.data.users || []).find((u) => u.firebaseUid === uid || u.id === uid);
  }

  public async deleteUserAccount(userId: string): Promise<boolean> {
    const user = this.getUserById(userId);
    if (!user) return false;

    await firestoreService.deleteEntity('users', user.id);
    if (user.firebaseUid && user.firebaseUid !== user.id) {
      await firestoreService.deleteEntity('users', user.firebaseUid);
    }

    this.data.users = (this.data.users || []).filter(
      (u) => u.id !== user.id && u.firebaseUid !== user.id && u.id !== user.firebaseUid
    );

    // Delete user sessions
    this.data.sessions = (this.data.sessions || []).filter((s) => s.userId !== userId && s.userId !== user.id && s.userId !== user.firebaseUid);
    this.saveLocal();
    return true;
  }

  public async createFirebaseUser(username: string, email: string, firebaseUid: string, password?: string): Promise<UserRecord> {
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    const usernameLower = trimmedUsername.toLowerCase();
    const emailLower = trimmedEmail.toLowerCase();

    let passwordHash: string | undefined;
    let salt: string | undefined;
    if (password) {
      const hashed = hashPassword(password);
      passwordHash = hashed.hash;
      salt = hashed.salt;
    }

    const user: UserRecord = {
      id: firebaseUid,
      firebaseUid,
      username: trimmedUsername,
      usernameLower,
      email: trimmedEmail,
      emailLower,
      passwordHash,
      salt,
      createdAt: new Date().toISOString(),
    };

    // Await durable Firestore write
    await firestoreService.saveEntity('users', user.id, user);

    if (!this.data.users) {
      this.data.users = [];
    }
    this.data.users.push(user);
    this.saveLocal();
    return user;
  }

  public async linkUserFirebaseUid(localUserId: string, firebaseUid: string): Promise<UserRecord | undefined> {
    const user = this.getUserById(localUserId) || (await this.findUserById(localUserId));
    if (!user) return undefined;

    const oldId = user.id;

    // PRESERVE passwordHash and salt! Do NOT delete them!
    const updatedUser: UserRecord = {
      ...user,
      id: firebaseUid,
      firebaseUid,
      usernameLower: user.usernameLower || (user.username ? user.username.trim().toLowerCase() : ''),
      emailLower: user.emailLower || (user.email ? user.email.trim().toLowerCase() : ''),
    };

    // If changing document ID from oldId to firebaseUid:
    if (oldId !== firebaseUid) {
      await firestoreService.deleteEntity('users', oldId);
      if (this.data.users) {
        this.data.users = this.data.users.filter((u) => u.id !== oldId);
      }
    }

    await firestoreService.saveEntity('users', updatedUser.id, updatedUser);

    if (!this.data.users) {
      this.data.users = [];
    }
    const existingIdx = this.data.users.findIndex(
      (u) => u.id === updatedUser.id || (u.emailLower && u.emailLower === updatedUser.emailLower)
    );
    if (existingIdx >= 0) {
      this.data.users[existingIdx] = updatedUser;
    } else {
      this.data.users.push(updatedUser);
    }

    // Migrate any meetings owned by oldId to new firebaseUid
    if (oldId !== updatedUser.id && this.data.meetings) {
      for (const m of this.data.meetings) {
        if (m.userId === oldId) {
          m.userId = updatedUser.id;
          await firestoreService.saveEntity('meetings', m.id, m);
        }
      }
    }

    // Migrate sessions owned by oldId
    if (oldId !== updatedUser.id && this.data.sessions) {
      for (const s of this.data.sessions) {
        if (s.userId === oldId) {
          s.userId = updatedUser.id;
          await firestoreService.saveEntity('sessions', s.token, s);
        }
      }
    }

    this.saveLocal();
    return updatedUser;
  }

  public async sanitizeAndDeduplicateUsers(): Promise<void> {
    if (!this.data.users || this.data.users.length === 0) return;

    // Group users by email lower
    const emailGroups = new Map<string, UserRecord[]>();
    for (const u of this.data.users) {
      const emailKey = (u.emailLower || u.email || '').trim().toLowerCase();
      if (!emailKey) continue;
      if (!emailGroups.has(emailKey)) {
        emailGroups.set(emailKey, []);
      }
      emailGroups.get(emailKey)!.push(u);
    }

    for (const [emailKey, group] of emailGroups.entries()) {
      if (group.length <= 1) continue;

      console.log(`[Deduplication] Found ${group.length} user records for email '${emailKey}'. Merging into single user identity...`);

      // Find primary record: prefer one with passwordHash and salt
      let canonical = group.find((u) => u.passwordHash && u.salt) || group[0];

      // Merge properties from all duplicates into canonical
      for (const dupe of group) {
        if (dupe.passwordHash && !canonical.passwordHash) {
          canonical.passwordHash = dupe.passwordHash;
        }
        if (dupe.salt && !canonical.salt) {
          canonical.salt = dupe.salt;
        }
        if (dupe.firebaseUid && !canonical.firebaseUid) {
          canonical.firebaseUid = dupe.firebaseUid;
        }
        if (dupe.username && (!canonical.username || canonical.username.length < dupe.username.length)) {
          canonical.username = dupe.username;
          canonical.usernameLower = dupe.username.toLowerCase();
        }
      }

      // Standardize fields
      canonical.emailLower = emailKey;
      if (!canonical.usernameLower && canonical.username) {
        canonical.usernameLower = canonical.username.trim().toLowerCase();
      }

      // Save canonical record in Firestore
      await firestoreService.saveEntity('users', canonical.id, canonical);

      // Delete non-canonical duplicates from Firestore and migrate references
      for (const dupe of group) {
        if (dupe.id === canonical.id) continue;

        console.log(`[Deduplication] Removing duplicate user record ID '${dupe.id}' for '${emailKey}'...`);
        await firestoreService.deleteEntity('users', dupe.id);

        // Migrate meetings
        if (this.data.meetings) {
          for (const m of this.data.meetings) {
            if (m.userId === dupe.id) {
              m.userId = canonical.id;
              await firestoreService.saveEntity('meetings', m.id, m);
            }
          }
        }

        // Migrate sessions
        if (this.data.sessions) {
          for (const s of this.data.sessions) {
            if (s.userId === dupe.id) {
              s.userId = canonical.id;
              await firestoreService.saveEntity('sessions', s.token, s);
            }
          }
        }
      }

      // Keep only canonical in memory
      this.data.users = this.data.users.filter(
        (u) => u.id === canonical.id || (u.emailLower || u.email || '').trim().toLowerCase() !== emailKey
      );
      this.data.users.push(canonical);
    }

    // Ensure all remaining users have emailLower and usernameLower set
    for (const u of this.data.users) {
      u.emailLower = (u.email || '').trim().toLowerCase();
      u.usernameLower = (u.username || '').trim().toLowerCase();
      if (!u.firebaseUid && u.id) {
        u.firebaseUid = u.id;
      }
    }

    this.saveLocal();
    console.log(`[Deduplication] Sanitization complete. Active unique user count: ${this.data.users.length}.`);
  }

  public async createPasswordResetToken(userId: string): Promise<{ token: string; expiresAt: string }> {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    if (!this.data.passwordResetTokens) {
      this.data.passwordResetTokens = [];
    }

    // Invalidate previous unused tokens for this user
    for (const t of this.data.passwordResetTokens) {
      if (t.userId === userId && !t.used) {
        t.used = true;
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes expiration

    const tokenRecord: PasswordResetTokenRecord = {
      id: crypto.randomUUID(),
      userId,
      token,
      expiresAt,
      used: false,
      createdAt: new Date().toISOString(),
    };

    await firestoreService.saveEntity('passwordResetTokens', tokenRecord.id, tokenRecord);

    this.data.passwordResetTokens.push(tokenRecord);
    this.saveLocal();

    return { token, expiresAt };
  }

  public verifyPasswordResetToken(token: string): { valid: boolean; user?: UserRecord; error?: string } {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token de recuperação não fornecido.' };
    }

    const record = (this.data.passwordResetTokens || []).find((t) => t.token === token);
    if (!record) {
      return { valid: false, error: 'Link de recuperação inválido.' };
    }

    if (record.used) {
      return { valid: false, error: 'Este link de recuperação já foi utilizado.' };
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return { valid: false, error: 'Este link de recuperação expirou. Solicite um novo.' };
    }

    const user = this.getUserById(record.userId);
    if (!user) {
      return { valid: false, error: 'Usuário não encontrado.' };
    }

    return { valid: true, user };
  }

  public async resetUserPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const verification = this.verifyPasswordResetToken(token);
    if (!verification.valid || !verification.user) {
      return { success: false, error: verification.error || 'Token inválido.' };
    }

    const user = verification.user;
    const { hash, salt } = hashPassword(newPassword);
    const updatedUser = { ...user, passwordHash: hash, salt };

    // Mark token as used
    const record = (this.data.passwordResetTokens || []).find((t) => t.token === token);
    if (record) {
      const updatedRecord = { ...record, used: true };
      await firestoreService.saveEntity('passwordResetTokens', updatedRecord.id, updatedRecord);
      record.used = true;
    }

    await firestoreService.saveEntity('users', updatedUser.id, updatedUser);

    user.passwordHash = hash;
    user.salt = salt;
    this.saveLocal();
    return { success: true };
  }

  // --- Session Management Methods ---

  public async createSession(userId: string): Promise<UserSessionRecord> {
    if (!this.data.sessions) {
      this.data.sessions = [];
    }
    const token = crypto.randomBytes(32).toString('hex');
    const session: UserSessionRecord = {
      token,
      userId,
      createdAt: new Date().toISOString(),
    };

    await firestoreService.saveEntity('sessions', session.token, session);

    this.data.sessions.push(session);
    this.saveLocal();
    return session;
  }

  public getSession(token: string): UserSessionRecord | undefined {
    if (!token || typeof token !== 'string') return undefined;
    return (this.data.sessions || []).find((s) => s.token === token);
  }

  public async deleteSession(token: string): Promise<void> {
    if (!token) return;
    await firestoreService.deleteEntity('sessions', token);
    this.data.sessions = (this.data.sessions || []).filter((s) => s.token !== token);
    this.saveLocal();
  }

  // --- Meeting Methods with User Isolation ---

  public async createMeeting(
    name: string,
    description: string | undefined,
    userId: string,
    nominationCommissionName?: string
  ): Promise<Meeting> {
    // Generate clean 6-character uppercase alphanumeric code (e.g. ABC123), excluding confusing chars like 0/O, 1/I
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    let isUnique = false;

    while (!isUnique) {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      if (!this.data.meetings.some((m) => m.code === code)) {
        isUnique = true;
      }
    }

    const meeting: Meeting = {
      id: crypto.randomUUID(),
      userId,
      name: name.trim(),
      description: description?.trim() || '',
      nominationCommissionName: nominationCommissionName?.trim() || undefined,
      code,
      status: 'WAITING',
      createdAt: new Date().toISOString(),
      currentPollId: null,
    };

    // Await durable Firestore write BEFORE updating local state
    await firestoreService.saveEntity('meetings', meeting.id, meeting);

    this.data.meetings.push(meeting);
    this.saveLocal();
    return meeting;
  }

  public async createDemoMeeting(userId: string): Promise<Meeting> {
    const demoCode = 'DEMO25';
    const demoMeetingId = 'demo-meeting-2026';
    const demoPollId = 'demo-poll-round-1';

    // Remove any existing demo meeting with DEMO25 code
    this.data.meetings = this.data.meetings.filter((m) => m.code !== demoCode && m.id !== demoMeetingId);
    this.data.polls = this.data.polls.filter((p) => p.meetingId !== demoMeetingId && p.id !== demoPollId);
    this.data.options = this.data.options.filter((o) => o.pollId !== demoPollId);
    this.data.votes = this.data.votes.filter((v) => v.pollId !== demoPollId);

    const now = new Date().toISOString();
    const demoMeeting: Meeting = {
      id: demoMeetingId,
      userId,
      name: 'TESTE — ELIMINAÇÃO ASSISTIDA V2',
      description: 'Reunião fictícia com dados sintéticos isolados para homologação da eliminação assistida',
      nominationCommissionName: 'Comissão de Demonstração',
      code: demoCode,
      status: 'VOTING_CLOSED',
      createdAt: now,
      closedAt: undefined,
      currentPollId: demoPollId,
      isDemo: true,
    };

    const candidateNames = [
      'Candidato 01', 'Candidato 02', 'Candidato 03', 'Candidato 04',
      'Candidato 05', 'Candidato 06', 'Candidato 07', 'Candidato 08',
      'Candidato 09', 'Candidato 10', 'Candidato 11', 'Candidato 12'
    ];

    const createdOptions: Option[] = candidateNames.map((name, idx) => ({
      id: `demo-opt-${idx + 1}`,
      pollId: demoPollId,
      text: name,
      order: idx + 1,
    }));

    const demoPoll: Poll = {
      id: demoPollId,
      meetingId: demoMeetingId,
      question: 'Eleição de 4 Membros da Comissão',
      status: 'CLOSED',
      createdAt: now,
      openedAt: new Date(Date.now() - 3600000).toISOString(),
      closedAt: new Date(Date.now() - 1800000).toISOString(),
      options: createdOptions,
      allowMultiple: true,
      maxChoices: 4,
      source: 'INDICATIONS',
      sourceDepartmentId: 'demo-dept-1',
      round: 1,
      rootPollId: demoPollId,
      isFinal: false,
      isDemo: true,
    };

    // Synthetic Vote Ranges per Candidate (Totaling 100 unique voters):
    // Cand 01: 80 votes (voters 1..80)
    // Cand 02: 70 votes (voters 1..70)
    // Cand 03: 40 votes (voters 1..40)
    // Cand 04: 35 votes (voters 1..35)
    // Cand 05: 30 votes (voters 1..30)
    // Cand 06: 25 votes (voters 1..25)
    // Cand 07: 20 votes (voters 1..20)
    // Cand 08: 18 votes (voters 1..18)
    // Cand 09: 15 votes (voters 1..15)
    // Cand 10: 12 votes (voters 1..12)
    // Cand 11: 10 votes (voters 81..88 and 99..100)
    // Cand 12: 8 votes (voters 91..96 and 99..100)
    const candidateVoterRanges: Array<(v: number) => boolean> = [
      (v) => v >= 1 && v <= 80,                         // Cand 01: 80
      (v) => v >= 1 && v <= 70,                         // Cand 02: 70
      (v) => v >= 1 && v <= 40,                         // Cand 03: 40
      (v) => v >= 1 && v <= 35,                         // Cand 04: 35
      (v) => v >= 1 && v <= 30,                         // Cand 05: 30
      (v) => v >= 1 && v <= 25,                         // Cand 06: 25
      (v) => v >= 1 && v <= 20,                         // Cand 07: 20
      (v) => v >= 1 && v <= 18,                         // Cand 08: 18
      (v) => v >= 1 && v <= 15,                         // Cand 09: 15
      (v) => (v >= 1 && v <= 10) || (v >= 99 && v <= 100), // Cand 10: 12
      (v) => v >= 81 && v <= 90,                        // Cand 11: 10
      (v) => v >= 91 && v <= 98,                        // Cand 12: 8
    ];

    const demoVotes: VoteRecord[] = [];
    for (let voterIdx = 1; voterIdx <= 100; voterIdx++) {
      const sessionId = `synthetic-voter-session-${voterIdx}`;
      for (let optIdx = 0; optIdx < createdOptions.length; optIdx++) {
        if (candidateVoterRanges[optIdx](voterIdx)) {
          demoVotes.push({
            id: `demo-vote-${voterIdx}-${optIdx + 1}`,
            pollId: demoPollId,
            optionId: createdOptions[optIdx].id,
            anonymousSessionId: sessionId,
            createdAt: now,
          });
        }
      }
    }

    this.data.meetings.push(demoMeeting);
    this.data.polls.push(demoPoll);
    this.data.options.push(...createdOptions);
    this.data.votes.push(...demoVotes);

    this.saveLocal();
    return demoMeeting;
  }

  public getMeetingByCode(code: string): Meeting | undefined {
    if (!code || typeof code !== 'string') return undefined;
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return undefined;
    return this.data.meetings.find(
      (m) => m.code && m.code.trim().toUpperCase() === cleanCode
    );
  }

  public getMeetingById(id: string): Meeting | undefined {
    return this.data.meetings.find((m) => m.id === id);
  }

  public getMeetingByCodeAndUser(code: string, userId: string): Meeting | undefined {
    const meeting = this.getMeetingByCode(code);
    if (!meeting) return undefined;
    // Strictly isolate: meeting must belong to the user
    if (meeting.userId && meeting.userId !== userId) {
      return undefined;
    }
    return meeting;
  }

  public getMeetingByIdAndUser(id: string, userId: string): Meeting | undefined {
    const meeting = this.getMeetingById(id);
    if (!meeting) return undefined;
    if (meeting.userId && meeting.userId !== userId) {
      return undefined;
    }
    return meeting;
  }

  public getMeetingsByUser(userId: string, status?: 'active' | 'closed'): Meeting[] {
    return this.data.meetings
      .filter((m) => {
        if (
          m.isDemo ||
          m.id === 'demo-meeting-2026' ||
          m.code === 'DEMO25' ||
          m.name === 'TESTE — ELIMINAÇÃO ASSISTIDA V2'
        ) {
          return false;
        }
        // Enforce user isolation
        const matchesUser = m.userId === userId;
        if (!matchesUser) return false;

        if (status === 'active') {
          return m.status !== 'MEETING_CLOSED';
        }
        if (status === 'closed') {
          return m.status === 'MEETING_CLOSED';
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getAllMeetings(): Meeting[] {
    return [...this.data.meetings].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public async closeMeeting(meetingId: string): Promise<Meeting | null> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) return null;

    // Also close any currently open poll
    if (meeting.currentPollId) {
      await this.closePoll(meeting.currentPollId);
    }

    const updatedMeeting: Meeting = {
      ...meeting,
      status: 'MEETING_CLOSED',
      closedAt: new Date().toISOString(),
    };

    // Await durable write to Firestore
    await firestoreService.saveEntity('meetings', meeting.id, updatedMeeting);

    meeting.status = 'MEETING_CLOSED';
    meeting.closedAt = updatedMeeting.closedAt;
    this.saveLocal();
    return meeting;
  }

  public async reopenMeeting(meetingId: string): Promise<Meeting | null> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) return null;

    const updatedMeeting: Meeting = {
      ...meeting,
      status: 'WAITING',
      closedAt: undefined,
    };

    await firestoreService.saveEntity('meetings', meeting.id, updatedMeeting);

    meeting.status = 'WAITING';
    meeting.closedAt = undefined;
    this.saveLocal();
    return meeting;
  }

  public async updateMeetingSettings(meetingId: string, updates: Partial<Meeting>): Promise<Meeting | null> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) return null;

    const updatedMeeting: Meeting = {
      ...meeting,
      ...updates,
      id: meeting.id,
    };

    await firestoreService.saveEntity('meetings', meeting.id, updatedMeeting);

    Object.assign(meeting, updates);
    this.saveLocal();
    return meeting;
  }

  public async updateMeeting(
    meetingId: string,
    params: {
      name: string;
      description?: string;
      nominationCommissionName?: string;
      congregationName?: string;
    }
  ): Promise<Meeting | null> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) return null;

    const cleanName = (params.name || '').trim();
    if (!cleanName) {
      throw new Error('O nome da reunião é obrigatório.');
    }

    const cleanDesc = params.description !== undefined ? params.description.trim() || undefined : meeting.description;
    const rawComm = params.congregationName !== undefined ? params.congregationName : params.nominationCommissionName;
    const cleanComm = rawComm !== undefined ? rawComm.trim() || undefined : meeting.nominationCommissionName;

    const updatedMeeting: Meeting = {
      ...meeting,
      name: cleanName,
      description: cleanDesc,
      nominationCommissionName: cleanComm,
    };

    if (updatedMeeting.ataContent) {
      updatedMeeting.ataContent.commissionName = cleanComm;
      updatedMeeting.ataContent.meetingName = cleanName;
      if (updatedMeeting.ataVoteNumber) {
        updatedMeeting.ataContent.voteCode = formatAtaVoteHeader(updatedMeeting.ataVoteNumber, cleanComm);
      }
    }

    if (updatedMeeting.organizingAtaContent) {
      updatedMeeting.organizingAtaContent.congregationName = cleanComm;
      updatedMeeting.organizingAtaContent.meetingName = cleanName;
      if (updatedMeeting.organizingAtaVoteNumber) {
        updatedMeeting.organizingAtaContent.voteCode = formatOrganizingAtaVoteHeader(
          updatedMeeting.organizingAtaVoteNumber,
          cleanComm
        );
      }
    }

    await firestoreService.saveEntity('meetings', meeting.id, updatedMeeting);

    meeting.name = cleanName;
    meeting.description = cleanDesc;
    meeting.nominationCommissionName = cleanComm;
    if (meeting.ataContent) {
      meeting.ataContent.commissionName = cleanComm;
      meeting.ataContent.meetingName = cleanName;
      if (meeting.ataVoteNumber) {
        meeting.ataContent.voteCode = formatAtaVoteHeader(meeting.ataVoteNumber, cleanComm);
      }
    }
    if (meeting.organizingAtaContent) {
      meeting.organizingAtaContent.congregationName = cleanComm;
      meeting.organizingAtaContent.meetingName = cleanName;
      if (meeting.organizingAtaVoteNumber) {
        meeting.organizingAtaContent.voteCode = formatOrganizingAtaVoteHeader(
          meeting.organizingAtaVoteNumber,
          cleanComm
        );
      }
    }

    this.saveLocal();
    return meeting;
  }

  // --- Poll Methods ---

  public async createPoll(
    meetingId: string,
    question: string,
    optionTexts: string[],
    allowMultiple = false,
    maxChoices = 1,
    minOptions = 2,
    source?: 'MANUAL' | 'INDICATIONS',
    sourceDepartmentId?: string,
    openImmediately = false,
    parentPollId?: string,
    isAssociatePoll = false,
    extraMeta?: {
      commissionType?: 'NOMINATIONS' | 'ORGANIZING';
      sourceCriterionId?: string;
      sourceCriterionName?: string;
    }
  ): Promise<Poll | null> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) return null;
    if (meeting.status === 'MEETING_CLOSED') return null;

    const pollId = crypto.randomUUID();
    const createdOptions: Option[] = optionTexts
      .map((text) => text.trim())
      .filter((text) => text.length > 0)
      .map((text, idx) => ({
        id: crypto.randomUUID(),
        pollId,
        text,
        order: idx + 1,
      }));

    if (createdOptions.length < minOptions) {
      throw new Error(`A pauta deve ter pelo menos ${minOptions} opção(ões) de resposta.`);
    }

    const isMultiple = Boolean(allowMultiple);
    let validatedChoices = 1;
    if (isMultiple) {
      const parsed = Math.floor(Number(maxChoices));
      if (isNaN(parsed) || parsed < 1) {
        throw new Error('O limite de escolhas deve ser um número inteiro maior que zero.');
      }
      if (parsed > createdOptions.length && extraMeta?.commissionType !== 'ORGANIZING') {
        throw new Error(`A quantidade de escolhas (${parsed}) não pode ser maior que o número de opções disponíveis (${createdOptions.length}).`);
      }
      validatedChoices = parsed;
    }

    const isAssoc = Boolean(isAssociatePoll || parentPollId);
    if (isAssoc && parentPollId) {
      const parent = this.getPollById(parentPollId);
      if (parent && !canDepartmentHaveAssociates(parent.sourceDepartmentId || parent.question)) {
        throw new Error(
          `O departamento "${parent.question}" não permite o cadastro ou votação de associados (Regra Oficial).`
        );
      }
    }

    const parentPollObj = parentPollId ? this.getPollById(parentPollId) : undefined;
    const resolvedCommissionType: 'NOMINATIONS' | 'ORGANIZING' | undefined =
      extraMeta?.commissionType ||
      parentPollObj?.commissionType ||
      (extraMeta?.sourceCriterionId ||
      (sourceDepartmentId && sourceDepartmentId.trim().toLowerCase().startsWith('org_'))
        ? 'ORGANIZING'
        : sourceDepartmentId
        ? 'NOMINATIONS'
        : undefined);

    const poll: Poll = {
      id: pollId,
      meetingId,
      question: question.trim(),
      status: 'WAITING',
      createdAt: new Date().toISOString(),
      options: createdOptions,
      allowMultiple: isMultiple,
      maxChoices: validatedChoices,
      source: source || 'MANUAL',
      sourceDepartmentId,
      ...(resolvedCommissionType ? { commissionType: resolvedCommissionType } : {}),
      ...(extraMeta?.sourceCriterionId ? { sourceCriterionId: extraMeta.sourceCriterionId } : {}),
      ...(extraMeta?.sourceCriterionName ? { sourceCriterionName: extraMeta.sourceCriterionName } : {}),
      parentPollId: parentPollId || undefined,
      isAssociatePoll: isAssoc,
    };

    // Durable Firestore write for poll and all options
    await firestoreService.saveEntity('polls', poll.id, poll);
    for (const opt of createdOptions) {
      await firestoreService.saveEntity('options', opt.id, opt);
    }

    this.data.polls.push(poll);
    this.data.options.push(...createdOptions);
    this.saveLocal();

    // If openImmediately is requested, open it right away
    if (openImmediately) {
      return await this.openPoll(pollId);
    }

    return poll;
  }

  public async editPoll(
    meetingId: string,
    pollId: string,
    data: {
      question: string;
      options: string[];
      optionItems?: Array<{ id?: string; text: string }>;
      allowMultiple?: boolean;
      maxChoices?: number;
      forceStructuralChange?: boolean;
    }
  ): Promise<{ poll: Poll; requiresConfirmation?: boolean; message?: string }> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }
    const poll = this.getPollById(pollId);
    if (!poll || poll.meetingId !== meetingId) {
      throw new Error('Pauta não encontrada nesta reunião.');
    }
    if (poll.status === 'OPEN') {
      throw new Error(
        'Não é permitido editar uma pauta enquanto a votação estiver aberta. Encerre a votação antes de editar.'
      );
    }

    const cleanQuestion = data.question.trim();
    if (!cleanQuestion) {
      throw new Error('A pergunta da pauta é obrigatória.');
    }

    const rawItems: Array<{ id?: string; text: string }> =
      Array.isArray(data.optionItems) && data.optionItems.length > 0
        ? data.optionItems
            .map((item) => ({
              id: typeof item?.id === 'string' && item.id.trim().length > 0 ? item.id.trim() : undefined,
              text: typeof item?.text === 'string' ? item.text.trim() : '',
            }))
            .filter((item) => item.text.length > 0)
        : (data.options || [])
            .map((t) => ({ id: undefined, text: typeof t === 'string' ? t.trim() : '' }))
            .filter((item) => item.text.length > 0);

    const minOptions = poll.source === 'INDICATIONS' ? 1 : 2;
    if (rawItems.length < minOptions) {
      throw new Error(`A pauta deve ter pelo menos ${minOptions} opção(ões) de resposta.`);
    }

    const isMultiple = Boolean(data.allowMultiple);
    let validatedChoices = 1;
    if (isMultiple) {
      const parsed = Math.floor(Number(data.maxChoices));
      if (isNaN(parsed) || parsed < 1) {
        throw new Error('O limite de escolhas deve ser um número inteiro maior que zero.');
      }
      if (parsed > rawItems.length) {
        throw new Error(
          `A quantidade de escolhas (${parsed}) não pode ser maior que o número de opções disponíveis (${rawItems.length}).`
        );
      }
      validatedChoices = parsed;
    }

    const currentOptions = this.data.options
      .filter((o) => o.pollId === pollId)
      .sort((a, b) => a.order - b.order);

    const currentById = new Map<string, Option>(currentOptions.map((o) => [o.id, o]));
    const usedOldIds = new Set<string>();
    const resolvedBindings: Array<{ oldOpt?: Option; newText: string }> = new Array(rawItems.length);

    // Pass 1: Bind by explicit option ID when valid
    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      if (item.id && currentById.has(item.id) && !usedOldIds.has(item.id)) {
        const matched = currentById.get(item.id)!;
        usedOldIds.add(matched.id);
        resolvedBindings[i] = { oldOpt: matched, newText: item.text };
      }
    }

    // Pass 2: Bind remaining items without explicit ID by exact normalized text match
    for (let i = 0; i < rawItems.length; i++) {
      if (resolvedBindings[i]) continue;
      const item = rawItems[i];
      const norm = item.text.toLowerCase();
      const matched = currentOptions.find(
        (o) => !usedOldIds.has(o.id) && o.text.trim().toLowerCase() === norm
      );
      if (matched) {
        usedOldIds.add(matched.id);
        resolvedBindings[i] = { oldOpt: matched, newText: item.text };
      }
    }

    // Pass 3: If option count is unchanged (e.g. spelling edit without optionItems), bind remaining unmatched 1-to-1
    const remainingOld = currentOptions.filter((o) => !usedOldIds.has(o.id));
    const unboundIndices = rawItems
      .map((_, idx) => idx)
      .filter((idx) => !resolvedBindings[idx]);

    if (rawItems.length === currentOptions.length && remainingOld.length === unboundIndices.length) {
      for (let k = 0; k < unboundIndices.length; k++) {
        const idx = unboundIndices[k];
        const oldOpt = remainingOld[k];
        usedOldIds.add(oldOpt.id);
        resolvedBindings[idx] = { oldOpt, newText: rawItems[idx].text };
      }
    } else {
      for (const idx of unboundIndices) {
        resolvedBindings[idx] = { oldOpt: undefined, newText: rawItems[idx].text };
      }
    }

    const removedOldOptions = currentOptions.filter((o) => !usedOldIds.has(o.id));
    const addedNewOptionsCount = resolvedBindings.filter((b) => !b.oldOpt).length;

    // Check if poll has votes
    const votesForPoll = this.data.votes.filter((v) => v.pollId === pollId);
    const hasVotes = votesForPoll.length > 0;

    // Block removal of existing options when poll already has recorded votes or is closed with votes
    if (removedOldOptions.length > 0 && (hasVotes || poll.status === 'CLOSED')) {
      const removedWithVotes = removedOldOptions.filter((ro) =>
        votesForPoll.some((v) => v.optionId === ro.id)
      );
      if (hasVotes || removedWithVotes.length > 0 || poll.status === 'CLOSED') {
        throw new Error(
          'Não é permitido remover opções de uma pauta encerrada ou com votos registrados para preservar a integridade dos votos e percentuais históricos. Para realizar uma nova votação sem determinados candidatos, utilize a função "Reabrir Votação (Nova Rodada)".'
        );
      }
    }

    // Determine if it's a structural change
    const isStructuralChange =
      removedOldOptions.length > 0 ||
      addedNewOptionsCount > 0 ||
      Boolean(poll.allowMultiple) !== isMultiple ||
      (isMultiple && (poll.maxChoices || 1) !== validatedChoices);

    if (hasVotes && isStructuralChange && !data.forceStructuralChange) {
      return {
        poll,
        requiresConfirmation: true,
        message:
          'Esta pauta já possui votos registrados. Alterar as opções ou a estrutura da votação pode afetar a interpretação dos resultados existentes. Deseja realmente continuar?',
      };
    }

    // Prepare updated poll
    const storedPoll = this.data.polls.find((p) => p.id === pollId)!;
    const updatedPollData: Poll = {
      ...storedPoll,
      question: cleanQuestion,
      allowMultiple: isMultiple,
      maxChoices: validatedChoices,
    };

    let maxOrder = currentOptions.reduce((max, o) => Math.max(max, o.order || 0), 0);
    const finalOptions: Option[] = resolvedBindings.map((binding) => {
      if (binding.oldOpt) {
        return {
          ...binding.oldOpt,
          text: binding.newText,
          order: binding.oldOpt.order,
        };
      }
      maxOrder += 1;
      return {
        id: crypto.randomUUID(),
        pollId,
        text: binding.newText,
        order: maxOrder,
      };
    });

    // Sort by original registration order so poll.options order is preserved
    finalOptions.sort((a, b) => a.order - b.order);

    // Normalize order sequence (1..N) while strictly preserving relative registration order and option IDs
    finalOptions.forEach((opt, idx) => {
      opt.order = idx + 1;
    });

    // Write to Firestore first
    await firestoreService.saveEntity('polls', pollId, updatedPollData);
    for (const removedOpt of removedOldOptions) {
      await firestoreService.deleteEntity('options', removedOpt.id);
    }
    for (const opt of finalOptions) {
      await firestoreService.saveEntity('options', opt.id, opt);
    }

    // Update memory (never deleting or reassigning historical votes)
    storedPoll.question = cleanQuestion;
    storedPoll.allowMultiple = isMultiple;
    storedPoll.maxChoices = validatedChoices;
    this.data.options = this.data.options.filter((o) => o.pollId !== pollId);
    this.data.options.push(...finalOptions);

    if (storedPoll.status === 'CLOSED') {
      try {
        if (meeting.ataGenerated || meeting.ataContent) {
          meeting.ataContent = this.getOrGenerateMeetingAta(meetingId);
        }
        if (
          meeting.organizingAtaGenerated ||
          meeting.organizingAtaContent ||
          storedPoll.commissionType === 'ORGANIZING' ||
          Boolean(storedPoll.sourceDepartmentId && storedPoll.sourceDepartmentId.toLowerCase().startsWith('org_'))
        ) {
          meeting.organizingAtaContent = this.getOrGenerateOrganizingMeetingAta(meetingId);
        }
        await firestoreService.saveEntity('meetings', meeting.id, meeting);
      } catch (err) {
        console.warn('[editPoll] Erro ao sincronizar ATAs após edição de pauta:', err);
      }
    }

    this.saveLocal();
    return { poll: this.getPollById(pollId)! };
  }

  public async deletePoll(meetingId: string, pollId: string): Promise<boolean> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }
    const poll = this.getPollById(pollId);
    if (!poll || poll.meetingId !== meetingId) {
      throw new Error('Pauta não encontrada nesta reunião.');
    }
    if (poll.status === 'OPEN') {
      throw new Error(
        'Não é permitido excluir uma pauta enquanto a votação estiver aberta. Encerre a votação antes de excluir.'
      );
    }

    const wasClosed = poll.status === 'CLOSED';

    // 1. Identify official catalog and department associated with this poll BEFORE removing it
    const commConfig = this.getOrCreateNominationConfig(meetingId);
    const officialCatalog: Array<{ departmentId?: string; id?: string; name: string }> =
      commConfig.departments && commConfig.departments.length > 0
        ? commConfig.departments
        : CENTRAL_DEPARTMENT_CATALOG.map((d) => ({ departmentId: d.id, id: d.id, name: d.name, enabled: true }));

    const pollDeptCanon = resolveCanonicalDepartment(poll.sourceDepartmentId || poll.question, officialCatalog);
    const pollDeptKey = pollDeptCanon.departmentId.toLowerCase();
    const isAssociate = isAssociateSubPoll(poll);

    // 2. Identify what winners or associates were produced by this poll before deleting it
    let pollWinners: string[] = [];
    let pollAssociates: string[] = [];

    if (wasClosed) {
      const calc = this.calculatePollResult(poll.id);
      if (isAssociate) {
        if (Array.isArray(poll.associates) && poll.associates.length > 0) {
          pollAssociates.push(...poll.associates);
        }
        if (calc?.associates && Array.isArray(calc.associates)) {
          pollAssociates.push(...calc.associates);
        }
        if (poll.votedAssociates && Array.isArray(poll.votedAssociates)) {
          pollAssociates.push(...poll.votedAssociates.map((va) => va.winnerName).filter(Boolean));
        }
        if (calc) {
          if (calc.winnerOptionTexts && calc.winnerOptionTexts.length > 0) {
            pollAssociates.push(...calc.winnerOptionTexts.filter((w) => !APPROVAL_OPTION_WORDS.has(w.toLowerCase())));
          } else if (calc.winnerOptionText && !APPROVAL_OPTION_WORDS.has(calc.winnerOptionText.toLowerCase())) {
            pollAssociates.push(calc.winnerOptionText.trim());
          }
        }
      } else {
        // Main titular poll
        if (calc) {
          const isApproval = isApprovalPoll(poll.options);
          if (isApproval) {
            const winningOpt = (calc.winnerOptionText || '').trim().toLowerCase();
            if (winningOpt === 'sim' || winningOpt === 'aprovar' || winningOpt === 'aprovado') {
              const extractedNominee = extractNomineeFromApprovalQuestion(poll.question, pollDeptCanon.departmentName);
              if (extractedNominee && !APPROVAL_OPTION_WORDS.has(extractedNominee.toLowerCase())) {
                pollWinners = [extractedNominee];
              }
            }
          } else {
            if (calc.winnerOptionTexts && calc.winnerOptionTexts.length > 0) {
              pollWinners = calc.winnerOptionTexts.filter((w) => !APPROVAL_OPTION_WORDS.has(w.toLowerCase()));
            } else if (calc.winnerOptionText && (!calc.isTie || calc.winnerOptionText.length > 0)) {
              if (!APPROVAL_OPTION_WORDS.has(calc.winnerOptionText.toLowerCase())) {
                pollWinners = [calc.winnerOptionText];
              }
            }
          }
        }
        // Also check if titular poll had attached associates
        if (poll.associates && Array.isArray(poll.associates)) {
          pollAssociates.push(...poll.associates);
        }
        if (calc?.associates && Array.isArray(calc.associates)) {
          pollAssociates.push(...calc.associates);
        }
        if (poll.votedAssociates && Array.isArray(poll.votedAssociates)) {
          for (const va of poll.votedAssociates) {
            if (va.winnerName) pollAssociates.push(va.winnerName);
          }
        }
      }
    }

    const pollOptions = this.data.options.filter((o) => o.pollId === pollId);
    const pollVotes = this.data.votes.filter((v) => v.pollId === pollId);

    // Delete in Firestore first
    await firestoreService.deleteEntity('polls', pollId);
    for (const opt of pollOptions) {
      await firestoreService.deleteEntity('options', opt.id);
    }
    for (const v of pollVotes) {
      await firestoreService.deleteEntity('votes', v.id);
    }

    // Update memory for polls, options, and votes so any recalculation uses the new state
    this.data.polls = this.data.polls.filter((p) => p.id !== pollId);
    this.data.options = this.data.options.filter((o) => o.pollId !== pollId);
    this.data.votes = this.data.votes.filter((v) => v.pollId !== pollId);

    if (meeting.currentPollId === pollId) {
      const remainingPolls = this.data.polls.filter((p) => p.meetingId === meetingId && p.id !== pollId);
      const openPoll = remainingPolls.find((p) => p.status === 'OPEN');
      meeting.currentPollId = openPoll ? openPoll.id : null;
      meeting.status = openPoll ? ('VOTING_OPEN' as const) : ('WAITING' as const);
    }

    // Synchronize ATA if this poll was closed and could have contributed to meeting.ataContent (ignore Organizing Commission polls)
    const isOrganizingPoll =
      poll.commissionType === 'ORGANIZING' ||
      Boolean(poll.sourceDepartmentId && poll.sourceDepartmentId.toLowerCase().startsWith('org_'));
    if (!isOrganizingPoll && wasClosed && meeting.ataContent && Array.isArray(meeting.ataContent.departments)) {
      const deptIdx = meeting.ataContent.departments.findIndex((d) => {
        const c = resolveCanonicalDepartment(d.departmentId || d.departmentName, officialCatalog);
        return c.departmentId.toLowerCase() === pollDeptKey;
      });

      if (deptIdx !== -1) {
        const deptItem = meeting.ataContent.departments[deptIdx];

        // 1. Remove associates produced by this poll
        if (pollAssociates.length > 0 && deptItem.associates && deptItem.associates.length > 0) {
          const toRemove = new Set(pollAssociates.map((a) => a.trim().toLowerCase()));
          deptItem.associates = deptItem.associates.filter((a) => !toRemove.has(a.trim().toLowerCase()));
          if (deptItem.associates.length === 0) {
            delete deptItem.associates;
          }
        }

        // 2. If it was a titular poll, handle titularName
        if (!isAssociate) {
          const remainingClosedTitularPolls = this.data.polls.filter((p) => {
            if (p.meetingId !== meetingId || p.status !== 'CLOSED') return false;
            if (isAssociateSubPoll(p)) return false;
            const c = resolveCanonicalDepartment(p.sourceDepartmentId || p.question, officialCatalog);
            return c.departmentId.toLowerCase() === pollDeptKey;
          });

          if (remainingClosedTitularPolls.length === 0) {
            deptItem.titularName = '';
          } else {
            // Recalculate titular from remaining closed titular polls for this department
            const sorted = [...remainingClosedTitularPolls].sort((a, b) => (b.round || 1) - (a.round || 1));
            const finalRemaining = sorted.find((p) => p.isFinal === true) || sorted[0];
            const remCalc = this.calculatePollResult(finalRemaining.id);
            let remWinner = '';
            if (remCalc) {
              if (isApprovalPoll(finalRemaining.options)) {
                const winningOpt = (remCalc.winnerOptionText || '').trim().toLowerCase();
                if (winningOpt === 'sim' || winningOpt === 'aprovar' || winningOpt === 'aprovado') {
                  const extracted = extractNomineeFromApprovalQuestion(finalRemaining.question, pollDeptCanon.departmentName);
                  if (extracted && !APPROVAL_OPTION_WORDS.has(extracted.toLowerCase())) {
                    remWinner = extracted;
                  }
                }
              } else {
                if (remCalc.winnerOptionTexts && remCalc.winnerOptionTexts.length > 0) {
                  remWinner = remCalc.winnerOptionTexts.filter((w) => !APPROVAL_OPTION_WORDS.has(w.toLowerCase())).join(', ');
                } else if (remCalc.winnerOptionText && !APPROVAL_OPTION_WORDS.has(remCalc.winnerOptionText.toLowerCase())) {
                  remWinner = remCalc.winnerOptionText.trim();
                }
              }
            }
            deptItem.titularName = remWinner;
          }
        }

        // 3. Check if department item still has any content (titular or associates)
        const hasTitular = Boolean(deptItem.titularName && deptItem.titularName.trim().length > 0);
        const hasAssociates = Boolean(deptItem.associates && deptItem.associates.length > 0);

        if (!hasTitular && !hasAssociates) {
          meeting.ataContent.departments.splice(deptIdx, 1);
          meeting.ataRemovedDeptKeys = Array.from(
            new Set([...(meeting.ataRemovedDeptKeys || []), pollDeptKey])
          );
        } else {
          if (meeting.ataRemovedDeptKeys) {
            meeting.ataRemovedDeptKeys = meeting.ataRemovedDeptKeys.filter(
              (k) => resolveCanonicalDepartment(k, officialCatalog).departmentId.toLowerCase() !== pollDeptKey
            );
          }
        }
      } else {
        const anyOtherClosedPolls = this.data.polls.some((p) => {
          if (p.meetingId !== meetingId || p.status !== 'CLOSED') return false;
          const c = resolveCanonicalDepartment(p.sourceDepartmentId || p.question, officialCatalog);
          return c.departmentId.toLowerCase() === pollDeptKey;
        });
        if (!anyOtherClosedPolls) {
          meeting.ataRemovedDeptKeys = Array.from(
            new Set([...(meeting.ataRemovedDeptKeys || []), pollDeptKey])
          );
        }
      }
    }

    if (
      wasClosed &&
      (isOrganizingPoll || meeting.organizingAtaGenerated || meeting.organizingAtaContent)
    ) {
      try {
        if (pollWinners.length > 0 && meeting.organizingAtaContent) {
          const removedSet = new Set(
            (meeting.organizingAtaRemovedMembers || []).map((n) => n.trim().toLowerCase())
          );
          for (const w of pollWinners) {
            const cleanW = w.trim().toLowerCase();
            if (cleanW) removedSet.add(cleanW);
          }
          meeting.organizingAtaRemovedMembers = Array.from(removedSet);
          if (Array.isArray(meeting.organizingAtaContent.manualMembersList)) {
            const pollWinLower = new Set(pollWinners.map((w) => w.trim().toLowerCase()));
            meeting.organizingAtaContent.manualMembersList =
              meeting.organizingAtaContent.manualMembersList.filter(
                (m) => !pollWinLower.has(m.trim().toLowerCase())
              );
          }
        }
        meeting.organizingAtaContent = this.getOrGenerateOrganizingMeetingAta(meetingId);
      } catch (err) {
        console.warn('[deletePoll] Erro ao sincronizar Ata da Comissão Organizadora:', err);
      }
    }

    // Persist updated meeting state (currentPollId, status, ataContent, ataRemovedDeptKeys, organizingAtaContent) to Firestore
    await firestoreService.saveEntity('meetings', meeting.id, meeting);
    this.saveLocal();
    return true;
  }

  public async updatePollConfig(
    meetingId: string,
    pollId: string,
    params: { allowMultiple: boolean; maxChoices?: number }
  ): Promise<Poll> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }
    const poll = this.getPollById(pollId);
    if (!poll || poll.meetingId !== meetingId) {
      throw new Error('Pauta não encontrada nesta reunião.');
    }
    if (poll.status !== 'WAITING') {
      throw new Error('A configuração de escolhas só pode ser alterada enquanto a pauta estiver aguardando início.');
    }

    const isMultiple = Boolean(params.allowMultiple);
    let validatedChoices = 1;
    if (isMultiple) {
      const parsed = Math.floor(Number(params.maxChoices));
      if (isNaN(parsed) || parsed < 1) {
        throw new Error('O limite de escolhas deve ser um número inteiro maior que zero.');
      }
      if (parsed > poll.options.length) {
        throw new Error(
          `O limite de escolhas (${parsed}) não pode ser maior que o número de opções da pauta (${poll.options.length}).`
        );
      }
      validatedChoices = parsed;
    }

    const storedPoll = this.data.polls.find((p) => p.id === pollId);
    if (!storedPoll) {
      throw new Error('Pauta não encontrada.');
    }

    const updatedPoll = {
      ...storedPoll,
      allowMultiple: isMultiple,
      maxChoices: validatedChoices,
    };

    await firestoreService.saveEntity('polls', pollId, updatedPoll);

    storedPoll.allowMultiple = isMultiple;
    storedPoll.maxChoices = validatedChoices;
    this.saveLocal();

    return this.getPollById(pollId)!;
  }

  public async updatePollAssociates(
    meetingId: string,
    pollId: string,
    associates: string[]
  ): Promise<Poll> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }
    const storedPoll = this.data.polls.find((p) => p.id === pollId && p.meetingId === meetingId);
    if (!storedPoll) {
      throw new Error('Pauta não encontrada nesta reunião.');
    }

    if (!canDepartmentHaveAssociates(storedPoll.sourceDepartmentId || storedPoll.question)) {
      throw new Error(
        `O departamento "${storedPoll.question}" não permite o cadastro ou votação de associados (Regra Oficial).`
      );
    }

    const cleanAssociates = (Array.isArray(associates) ? associates : [])
      .map((a) => (typeof a === 'string' ? a.trim() : ''))
      .filter((a) => a.length > 0);

    const updatedPoll = {
      ...storedPoll,
      associates: cleanAssociates,
      associationType: 'DIRECT' as const,
      associationPollId: null,
      votedAssociates: [],
    };

    await firestoreService.saveEntity('polls', pollId, updatedPoll);

    storedPoll.associates = cleanAssociates;
    storedPoll.associationType = 'DIRECT';
    storedPoll.associationPollId = null;
    storedPoll.votedAssociates = [];
    this.saveLocal();

    // Immediately refresh and integrate newly updated associates into meeting ATA and persist to Firestore
    try {
      const refreshedAta = this.getOrGenerateMeetingAta(meetingId);
      meeting.ataContent = refreshedAta;
      await firestoreService.saveEntity('meetings', meeting.id, meeting);
    } catch (err) {
      console.warn('[updatePollAssociates] Erro ao sincronizar ATA no Firestore:', err);
    }

    return this.getPollById(pollId)!;
  }

  public async createPollFromSelectedNominations(params: {
    meetingId: string;
    departmentId: string;
    nomineeNames: string[];
    question: string;
    allowMultiple?: boolean;
    maxChoices?: number;
  }): Promise<Poll> {
    const meeting = this.getMeetingById(params.meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }
    if (meeting.status === 'MEETING_CLOSED') {
      throw new Error('Não é possível criar pautas em uma reunião encerrada.');
    }

    const config = this.getOrCreateNominationConfig(params.meetingId);
    const dept = config.departments.find((d) => d.departmentId === params.departmentId);
    if (!dept) {
      throw new Error('Departamento não encontrado nesta reunião.');
    }

    const cleanQuestion = (params.question || '').trim();
    if (!cleanQuestion) {
      throw new Error('O título/pergunta da pauta é obrigatório.');
    }

    if (!Array.isArray(params.nomineeNames) || params.nomineeNames.length === 0) {
      throw new Error('Selecione pelo menos uma opção para criar a pauta.');
    }

    // Validate that every requested nomineeName exists in selectedNominees for this meeting and department
    const meetingSelections = (this.data.selectedNominees || []).filter(
      (s) => s.meetingId === params.meetingId && s.departmentId === params.departmentId
    );

    const validSelectionNamesSet = new Set(
      meetingSelections.map((s) => s.nomineeName.trim().toLowerCase())
    );

    const validatedOptionNames: string[] = [];
    const seen = new Set<string>();

    for (const rawName of params.nomineeNames) {
      if (typeof rawName !== 'string') continue;
      const clean = rawName.trim();
      if (!clean) continue;
      const normalized = clean.toLowerCase();
      if (!validSelectionNamesSet.has(normalized)) {
        throw new Error(
          `O nome "${clean}" não está na lista de selecionados do departamento "${dept.name}".`
        );
      }
      if (!seen.has(normalized)) {
        seen.add(normalized);
        validatedOptionNames.push(clean);
      }
    }

    if (validatedOptionNames.length === 0) {
      throw new Error('Nenhuma opção válida selecionada para a pauta.');
    }

    const poll = await this.createPoll(
      params.meetingId,
      cleanQuestion,
      validatedOptionNames,
      Boolean(params.allowMultiple),
      params.allowMultiple ? params.maxChoices ?? 1 : 1,
      1, // minOptions = 1
      'INDICATIONS',
      params.departmentId,
      false,
      undefined,
      false,
      {
        commissionType: 'NOMINATIONS',
      }
    );

    if (!poll) {
      throw new Error('Falha ao criar pauta.');
    }

    // Automatically deselect all nominee names used in this poll
    const usedNamesSet = new Set(validatedOptionNames.map((n) => n.trim().toLowerCase()));
    if (this.data.selectedNominees) {
      const selectionsToRemove = this.data.selectedNominees.filter(
        (s) =>
          s.meetingId === params.meetingId &&
          s.departmentId === params.departmentId &&
          usedNamesSet.has(s.nomineeName.trim().toLowerCase())
      );
      for (const sel of selectionsToRemove) {
        await firestoreService.deleteEntity('selectedNominees', sel.id);
      }
      this.data.selectedNominees = this.data.selectedNominees.filter(
        (s) =>
          !(
            s.meetingId === params.meetingId &&
            s.departmentId === params.departmentId &&
            usedNamesSet.has(s.nomineeName.trim().toLowerCase())
          )
      );
      this.saveLocal();
    }

    return poll;
  }

  public getPollById(pollId: string): Poll | undefined {
    const poll = this.data.polls.find((p) => p.id === pollId);
    if (!poll) return undefined;

    const options = this.data.options
      .filter((o) => o.pollId === pollId)
      .sort((a, b) => a.order - b.order);

    return { ...poll, options };
  }

  public getPollsByMeeting(meetingId: string): Poll[] {
    return this.data.polls
      .filter((p) => p.meetingId === meetingId)
      .map((p) => ({
        ...p,
        options: this.data.options
          .filter((o) => o.pollId === p.id)
          .sort((a, b) => a.order - b.order),
      }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  public async openPoll(pollId: string): Promise<Poll | null> {
    const poll = this.data.polls.find((p) => p.id === pollId);
    if (!poll) return null;

    const meeting = this.getMeetingById(poll.meetingId);
    if (!meeting || meeting.status === 'MEETING_CLOSED') return null;

    // Close any other open poll in this meeting first
    for (const p of this.data.polls) {
      if (p.meetingId === meeting.id && p.id !== pollId && p.status === 'OPEN') {
        const closedCopy = { ...p, status: 'CLOSED' as const, closedAt: new Date().toISOString() };
        await firestoreService.saveEntity('polls', p.id, closedCopy);
        p.status = 'CLOSED';
        p.closedAt = closedCopy.closedAt;
      }
    }

    const openTime = new Date().toISOString();
    const updatedPoll = { ...poll, status: 'OPEN' as const, openedAt: openTime, closedAt: undefined };
    await firestoreService.saveEntity('polls', poll.id, updatedPoll);

    const updatedMeeting = { ...meeting, currentPollId: poll.id, status: 'VOTING_OPEN' as const };
    await firestoreService.saveEntity('meetings', meeting.id, updatedMeeting);

    poll.status = 'OPEN';
    poll.openedAt = openTime;
    poll.closedAt = undefined;

    meeting.currentPollId = poll.id;
    meeting.status = 'VOTING_OPEN';

    this.saveLocal();
    return this.getPollById(pollId)!;
  }

  public async closePoll(pollId: string): Promise<Poll | null> {
    const poll = this.data.polls.find((p) => p.id === pollId);
    if (!poll) return null;

    const closeTime = new Date().toISOString();
    const updatedPoll = { ...poll, status: 'CLOSED' as const, closedAt: closeTime };
    await firestoreService.saveEntity('polls', poll.id, updatedPoll);

    const meeting = this.getMeetingById(poll.meetingId);
    if (meeting && meeting.status !== 'MEETING_CLOSED') {
      const updatedMeeting = {
        ...meeting,
        status: 'VOTING_CLOSED' as const,
        currentPollId: meeting.currentPollId === pollId ? null : meeting.currentPollId,
      };
      await firestoreService.saveEntity('meetings', meeting.id, updatedMeeting);
      meeting.status = 'VOTING_CLOSED';
      if (meeting.currentPollId === pollId) {
        meeting.currentPollId = null;
      }
    }

    // If this is an associate poll, link its result directly into the parent titular poll
    let parentPoll: Poll | undefined;
    if (poll.parentPollId) {
      parentPoll = this.data.polls.find((p) => p.id === poll.parentPollId);
    } else if (poll.question.startsWith('ASSOCIADOS - ')) {
      const baseCargo = poll.question.replace(/^ASSOCIADOS\s*-\s*/i, '').trim().toLowerCase();
      parentPoll = this.data.polls.find(
        (p) =>
          p.meetingId === poll.meetingId &&
          p.id !== poll.id &&
          !p.isAssociatePoll &&
          p.question.trim().toLowerCase().includes(baseCargo)
      );
    }

    if (parentPoll) {
      poll.isAssociatePoll = true;
      poll.parentPollId = parentPoll.id;
      const assocResult = this.calculatePollResult(pollId);
      if (assocResult && (assocResult.winnerOptionText || (assocResult.winnerOptionTexts && assocResult.winnerOptionTexts.length > 0))) {
        const winningNames = (assocResult.winnerOptionTexts && assocResult.winnerOptionTexts.length > 0)
          ? assocResult.winnerOptionTexts
          : (assocResult.winnerOptionText ? [assocResult.winnerOptionText] : []);

        const existingAssocs = Array.isArray(parentPoll.associates) ? parentPoll.associates : [];
        const combinedAssociates = Array.from(
          new Set([...existingAssocs, ...winningNames.map((n) => n.trim()).filter(Boolean)])
        );

        const existingVoted = Array.isArray(parentPoll.votedAssociates) ? parentPoll.votedAssociates : [];
        const newVotedEntries = winningNames.map((name) => {
          const opt = assocResult.options.find((o) => o.text === name);
          return {
            pollId: poll.id,
            winnerName: name,
            percentage: opt ? opt.percentage : 0,
            options: assocResult.options,
          };
        });
        const combinedVoted = [...existingVoted.filter((v) => v.pollId !== poll.id), ...newVotedEntries];

        const updatedParent = {
          ...parentPoll,
          associationType: 'VOTED' as const,
          associationPollId: poll.id,
          associates: combinedAssociates,
          votedAssociates: combinedVoted,
        };
        await firestoreService.saveEntity('polls', parentPoll.id, updatedParent);
        Object.assign(parentPoll, updatedParent);
      }
    }

    poll.status = 'CLOSED';
    poll.closedAt = closeTime;
    poll.isFinal = true;
    await firestoreService.saveEntity('polls', poll.id, poll);

    // Immediately refresh and integrate newly closed poll results into the appropriate commission ATA and persist to Firestore
    try {
      const isOrgPoll = this.isPollBelongingToOrganizingCommission(poll, poll.meetingId);
      if (!isOrgPoll) {
        const refreshedAta = this.getOrGenerateMeetingAta(poll.meetingId);
        if (meeting) {
          meeting.ataContent = refreshedAta;
        }
      } else if (meeting) {
        // Clear any newly elected winners from removed list so they appear
        const calcNow = this.calculatePollResult(poll.id);
        if (calcNow && calcNow.winnerOptionTexts && calcNow.winnerOptionTexts.length > 0 && meeting.organizingAtaRemovedMembers) {
          const newlyWon = new Set(calcNow.winnerOptionTexts.map((w) => w.trim().toLowerCase()));
          meeting.organizingAtaRemovedMembers = meeting.organizingAtaRemovedMembers.filter(
            (r) => !newlyWon.has(r.trim().toLowerCase())
          );
        }
        const refreshedOrgAta = this.getOrGenerateOrganizingMeetingAta(poll.meetingId);
        meeting.organizingAtaContent = refreshedOrgAta;
        // If this meeting also has a previously generated Nomination ATA, refresh it so no Organizing poll leaks into it
        if (meeting.ataGenerated || meeting.ataContent) {
          meeting.ataContent = this.getOrGenerateMeetingAta(poll.meetingId);
        }
      }
      if (meeting) {
        await firestoreService.saveEntity('meetings', meeting.id, meeting);
      }
    } catch (err) {
      console.warn('[closePoll] Erro ao sincronizar ATA no Firestore:', err);
    }

    this.saveLocal();
    return this.getPollById(pollId)!;
  }

  /**
   * Reabertura de Pauta para Nova Rodada (Desempate / Nova Votação):
   * Cria uma nova rodada (round) preservando o histórico da rodada anterior.
   * A rodada anterior passa a ter isFinal: false.
   * A nova rodada é criada em status WAITING com as opções informadas (ou as anteriores se não fornecidas).
   */
  public async reopenPoll(
    meetingId: string,
    previousPollId: string,
    newOptionTexts?: string[],
    decisionAuditInput?: {
      cutoffPercentageApplied?: number;
      candidatesKept?: string[];
      candidatesRemoved?: string[];
      candidatesConfirmed?: string[];
    }
  ): Promise<{ newPoll: Poll; previousPoll: Poll }> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }
    if (meeting.status === 'MEETING_CLOSED') {
      throw new Error('Não é possível reabrir uma pauta de reunião encerrada.');
    }

    const prevPoll = this.getPollById(previousPollId);
    if (!prevPoll || prevPoll.meetingId !== meetingId) {
      throw new Error('Pauta anterior não encontrada nesta reunião.');
    }

    // Determine the root poll ID, seat capacity, and round numbers
    const rootPollId = prevPoll.rootPollId || prevPoll.id;
    const rootPoll = this.getPollById(rootPollId) || prevPoll;
    const isMultiSeatFamily = Boolean(rootPoll.allowMultiple || prevPoll.allowMultiple);
    const initialSeats = isMultiSeatFamily
      ? Math.max(1, rootPoll.maxChoices || prevPoll.maxChoices || 1)
      : 1;
    const previousRound = prevPoll.round || 1;
    const newRoundNumber = previousRound + 1;

    // Gather already confirmed winners strictly from earlier closed rounds (< previousRound), excluding prevPoll
    const allRoundsInFamily = this.data.polls
      .filter((p) => p.meetingId === meetingId && (p.id === rootPollId || p.rootPollId === rootPollId))
      .sort((a, b) => (a.round || 1) - (b.round || 1));

    const earlierClosedRounds = allRoundsInFamily.filter(
      (p) => p.id !== prevPoll.id && p.status === 'CLOSED' && (p.round || 1) < previousRound
    );

    const alreadyConfirmedWinners = new Set<string>();
    for (let i = 0; i < earlierClosedRounds.length; i++) {
      const p = earlierClosedRounds[i];
      if (Array.isArray(p.confirmedWinnerNames)) {
        for (const w of p.confirmedWinnerNames) {
          const clean = w.trim().toLowerCase();
          if (clean) alreadyConfirmedWinners.add(clean);
        }
      } else if (Array.isArray(p.decisionAudit?.confirmedWinnersThisRound)) {
        for (const w of p.decisionAudit!.confirmedWinnersThisRound) {
          const clean = w.trim().toLowerCase();
          if (clean) alreadyConfirmedWinners.add(clean);
        }
      } else {
        const calc = this.calculatePollResult(p.id);
        if (calc && Array.isArray(calc.winnerOptionTexts)) {
          const subsequentRounds = allRoundsInFamily.filter((sr) => (sr.round || 1) > (p.round || 1));
          const subsequentOptionNames = new Set(
            subsequentRounds.flatMap((sr) => (sr.options || []).map((o) => o.text.trim().toLowerCase()))
          );
          for (const w of calc.winnerOptionTexts) {
            const clean = w.trim().toLowerCase();
            if (clean && !subsequentOptionNames.has(clean)) {
              alreadyConfirmedWinners.add(clean);
            }
          }
        }
      }
    }

    // Open seats available BEFORE applying current round confirmations
    const seatsBeforeCurrentRound = Math.max(0, initialSeats - alreadyConfirmedWinners.size);

    // Determine candidate options for the new round
    const hasExplicitOptions = Boolean(newOptionTexts && Array.isArray(newOptionTexts) && newOptionTexts.length > 0);
    let optionsToUse: string[] = [];
    if (hasExplicitOptions) {
      optionsToUse = newOptionTexts!.map((t) => t.trim()).filter((t) => t.length > 0);
    } else {
      optionsToUse = prevPoll.options
        .map((o) => o.text.trim())
        .filter((t) => t.length > 0 && !alreadyConfirmedWinners.has(t.toLowerCase()));
    }

    // Get previous calculation for validation and audit
    const prevCalc = this.calculatePollResult(previousPollId);

    // Validate explicitly passed candidatesConfirmed if provided, separately from earlier rounds
    let confirmedThisRound: string[] = [];
    if (decisionAuditInput?.candidatesConfirmed && Array.isArray(decisionAuditInput.candidatesConfirmed)) {
      const inputConfirmed = decisionAuditInput.candidatesConfirmed.map((c) => c.trim()).filter((c) => c.length > 0);

      // Check duplicates within current round confirmation list
      const lowerConfirmed = inputConfirmed.map((c) => c.toLowerCase());
      if (new Set(lowerConfirmed).size !== lowerConfirmed.length) {
        throw new Error('A lista de candidatos confirmados possui nomes duplicados.');
      }

      // If caller did not pass explicit optionsToUse, automatically exclude confirmedThisRound from optionsToUse
      if (!hasExplicitOptions && inputConfirmed.length > 0) {
        const confLowerSet = new Set(lowerConfirmed);
        optionsToUse = optionsToUse.filter((opt) => !confLowerSet.has(opt.toLowerCase()));
      }

      // Check conflicts with candidatesKept / optionsToUse
      for (const conf of inputConfirmed) {
        if (optionsToUse.some((opt) => opt.toLowerCase() === conf.toLowerCase())) {
          throw new Error(`O candidato "${conf}" não pode ser confirmado e mantido para a próxima rodada simultaneamente.`);
        }
      }

      // Check conflicts with candidatesRemoved
      if (decisionAuditInput?.candidatesRemoved) {
        for (const conf of inputConfirmed) {
          if (decisionAuditInput.candidatesRemoved.some((rem) => rem.trim().toLowerCase() === conf.toLowerCase())) {
            throw new Error(`O candidato "${conf}" não pode ser confirmado e retirado simultaneamente.`);
          }
        }
      }

      // Validate each candidate in current round
      const totalVoters = prevCalc?.totalVoters || 0;
      for (const conf of inputConfirmed) {
        const optMatch = prevPoll.options.find((o) => o.text.trim().toLowerCase() === conf.toLowerCase());
        if (!optMatch) {
          throw new Error(`O candidato "${conf}" não pertence às opções da pauta.`);
        }
        const optResult = prevCalc?.options.find(
          (o) => o.optionId === optMatch.id || o.text.trim().toLowerCase() === conf.toLowerCase()
        );
        const votes = optResult ? optResult.votes : 0;

        // Strict absolute majority (> 50% using 2 * votes > totalVoters)
        if (totalVoters === 0 || 2 * votes <= totalVoters) {
          throw new Error(
            `O candidato "${conf}" não possui maioria absoluta (>50% dos votantes efetivos) para ter confirmação definitiva.`
          );
        }

        // Check ties on cutoff
        if (prevCalc?.isTie) {
          const isTiedAtCutoff =
            (prevCalc.tieOptions && prevCalc.tieOptions.some((t) => t.toLowerCase() === conf.toLowerCase())) ||
            (prevCalc.excessEligibleOptions && prevCalc.excessEligibleOptions.some((e) => e.toLowerCase() === conf.toLowerCase()));
          if (isTiedAtCutoff) {
            throw new Error(
              `O candidato "${conf}" está em situação de empate pendente na linha de corte e não pode ser confirmado diretamente.`
            );
          }
        }
      }

      // Check current round confirmations against seats available BEFORE current round (not reduced by inputConfirmed itself)
      const newConfirmationsCount = inputConfirmed.filter(
        (c) => !alreadyConfirmedWinners.has(c.toLowerCase())
      ).length;
      if (
        inputConfirmed.length > seatsBeforeCurrentRound ||
        alreadyConfirmedWinners.size + newConfirmationsCount > initialSeats
      ) {
        throw new Error(
          `Número de candidatos confirmados (${inputConfirmed.length}) excede as vagas restantes (${seatsBeforeCurrentRound}).`
        );
      }

      confirmedThisRound = inputConfirmed;
    } else {
      // When candidatesConfirmed is not explicitly passed in decisionMeta:
      // Use existing explicit confirmations on prevPoll if present, otherwise none.
      // NEVER infer confirmation by absence from optionsToUse!
      const explicitOnPrev = Array.isArray(prevPoll.confirmedWinnerNames)
        ? prevPoll.confirmedWinnerNames
        : Array.isArray(prevPoll.decisionAudit?.confirmedWinnersThisRound)
        ? prevPoll.decisionAudit!.confirmedWinnersThisRound
        : [];
      confirmedThisRound = explicitOnPrev;
    }

    // Ensure no candidate already confirmed in earlier rounds or in this round returns to the new ballot
    for (const opt of optionsToUse) {
      const lower = opt.toLowerCase();
      if (alreadyConfirmedWinners.has(lower)) {
        throw new Error(
          `O candidato "${opt}" já foi confirmado definitivamente em rodada anterior e não pode retornar à nova cédula.`
        );
      }
      if (confirmedThisRound.some((c) => c.toLowerCase() === lower)) {
        throw new Error(
          `O candidato "${opt}" não pode ser confirmado e mantido para a próxima rodada simultaneamente.`
        );
      }
    }

    // Total unique confirmed candidates across all rounds up to and including prevPoll
    const totalConfirmedSet = new Set<string>([
      ...Array.from(alreadyConfirmedWinners),
      ...confirmedThisRound.map((c) => c.trim().toLowerCase()),
    ]);

    if (totalConfirmedSet.size > initialSeats) {
      throw new Error(
        `O total de candidatos confirmados (${totalConfirmedSet.size}) excede o limite original de vagas (${initialSeats}).`
      );
    }

    // Remaining seats for the new round (never artificially elevated to 1 when all seats are filled)
    const remainingSeats = Math.max(0, initialSeats - totalConfirmedSet.size);

    if (remainingSeats <= 0) {
      throw new Error(
        `Não é possível iniciar a nova rodada: todas as ${initialSeats} vaga(s) desta pauta já foram preenchidas definitivamente.`
      );
    }

    // Seat protection check: cannot keep fewer candidates than open seats
    if (isMultiSeatFamily && optionsToUse.length < remainingSeats) {
      throw new Error(
        `Não é possível iniciar a nova rodada: a quantidade de candidatos restantes (${optionsToUse.length}) é inferior ao número de vagas disponíveis (${remainingSeats}). Mantenha pelo menos ${remainingSeats} candidato(s).`
      );
    }

    const minOptions = prevPoll.source === 'INDICATIONS' ? 1 : 2;
    if (optionsToUse.length < minOptions) {
      throw new Error(`A nova rodada deve possuir pelo menos ${minOptions} opção(ões).`);
    }

    // Determine newMaxChoices and allowMultiple for the new round
    let newMaxChoices = 1;
    if (isMultiSeatFamily) {
      newMaxChoices = Math.min(initialSeats, remainingSeats);
      newMaxChoices = Math.min(newMaxChoices, optionsToUse.length);
      newMaxChoices = Math.max(1, newMaxChoices);
    }
    const newAllowMultiple = Boolean(isMultiSeatFamily && newMaxChoices > 1);

    const auditRecord: PollRoundDecisionAudit = {
      round: previousRound,
      cutoffPercentageSuggested: getSuggestedCutoffPercentage(previousRound),
      cutoffPercentageApplied: decisionAuditInput?.cutoffPercentageApplied,
      candidatesSuggestedForCutoff: prevCalc?.candidatesSuggestedForCutoff || [],
      candidatesKeptByAdmin: decisionAuditInput?.candidatesKept || optionsToUse,
      candidatesRemovedByAdmin: decisionAuditInput?.candidatesRemoved || prevPoll.options
        .map((o) => o.text.trim())
        .filter(
          (t) =>
            !optionsToUse.some((u) => u.toLowerCase() === t.toLowerCase()) &&
            !confirmedThisRound.some((c) => c.toLowerCase() === t.toLowerCase())
        ),
      confirmedWinnersThisRound: confirmedThisRound,
      remainingOpenSeats: remainingSeats,
      timestamp: new Date().toISOString(),
    };

    // Mark previous poll (and any other round in this root family) as not final
    const storedPrev = this.data.polls.find((p) => p.id === previousPollId);
    if (storedPrev) {
      storedPrev.isFinal = false;
      storedPrev.rootPollId = rootPollId;
      if (!storedPrev.round) storedPrev.round = previousRound;
      storedPrev.decisionAudit = auditRecord;
      storedPrev.confirmedWinnerNames = confirmedThisRound;
      await firestoreService.saveEntity('polls', storedPrev.id, storedPrev);
    }

    // Ensure all other existing rounds of this root poll are marked isFinal: false
    for (const p of this.data.polls) {
      if (p.meetingId === meetingId && (p.id === rootPollId || p.rootPollId === rootPollId)) {
        if (p.isFinal) {
          p.isFinal = false;
          await firestoreService.saveEntity('polls', p.id, p);
        }
      }
    }

    const newPollId = crypto.randomUUID();
    const createdOptions: Option[] = optionsToUse.map((text, idx) => ({
      id: crypto.randomUUID(),
      pollId: newPollId,
      text,
      order: idx + 1,
      isDemo: prevPoll.isDemo || meeting.isDemo,
    }));

    const newPoll: Poll = {
      id: newPollId,
      meetingId,
      question: prevPoll.question,
      status: 'WAITING',
      createdAt: new Date().toISOString(),
      options: createdOptions,
      allowMultiple: newAllowMultiple,
      maxChoices: newMaxChoices,
      source: prevPoll.source || rootPoll.source,
      sourceDepartmentId: prevPoll.sourceDepartmentId || rootPoll.sourceDepartmentId,
      commissionType: prevPoll.commissionType || rootPoll.commissionType,
      sourceCriterionId: prevPoll.sourceCriterionId || rootPoll.sourceCriterionId,
      sourceCriterionName: prevPoll.sourceCriterionName || rootPoll.sourceCriterionName,
      associates: prevPoll.associates,
      parentPollId: prevPoll.parentPollId,
      isAssociatePoll: prevPoll.isAssociatePoll,
      round: newRoundNumber,
      rootPollId,
      isFinal: false,
      decisionAudit: auditRecord,
      isDemo: prevPoll.isDemo || meeting.isDemo,
    };

    // Save to Firestore
    await firestoreService.saveEntity('polls', newPoll.id, newPoll);
    for (const opt of createdOptions) {
      await firestoreService.saveEntity('options', opt.id, opt);
    }

    this.data.polls.push(newPoll);
    this.data.options.push(...createdOptions);

    // Refresh ATA of the corresponding commission so provisional state doesn't show old winners
    try {
      const isOrgPoll = this.isPollBelongingToOrganizingCommission(newPoll, meetingId);
      if (!isOrgPoll) {
        const refreshedAta = this.getOrGenerateMeetingAta(meetingId);
        meeting.ataContent = refreshedAta;
      } else {
        const refreshedOrgAta = this.getOrGenerateOrganizingMeetingAta(meetingId);
        meeting.organizingAtaContent = refreshedOrgAta;
      }
      await firestoreService.saveEntity('meetings', meeting.id, meeting);
    } catch (err) {
      console.warn('[reopenPoll] Erro ao sincronizar ATA no Firestore:', err);
    }

    this.saveLocal();

    return {
      newPoll: this.getPollById(newPollId)!,
      previousPoll: this.getPollById(previousPollId)!,
    };
  }

  /**
   * Confirmação Definitiva de Candidato (ALTO-01):
   * Registra a decisão administrativa de confirmação definitiva de um candidato
   * sem excluir fisicamente opções ou votos históricos e preservando os percentuais e o total de votantes.
   *
   * Requisitos estritos:
   * 1. Preservar o ID original da opção.
   * 2. Preservar o texto histórico da opção.
   * 3. Preservar todos os votos registrados.
   * 4. Preservar o número de votantes efetivos e os percentuais históricos.
   * 5. Registrar a confirmação de forma explícita e persistente (poll.confirmedWinnerNames).
   * 6. Impedir confirmação duplicada.
   * 7. Validar a maioria absoluta estrita usando aritmética inteira: 2 * votes > totalVoters.
   * 8. Respeitar o limite original de vagas (initialSeats da pauta raiz).
   * 9. Impedir confirmação definitiva quando houver empate pendente na linha de corte.
   * 10. Impedir que candidatos já confirmados retornem à cédula de nova rodada (validado no reopenPoll).
   */
  public async confirmPollCandidate(
    meetingId: string,
    pollId: string,
    candidateNameOrOptionId: string
  ): Promise<{ success: boolean; poll: Poll; pollResult: PollResult; confirmedWinnerNames: string[] }> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }
    const poll = this.getPollById(pollId);
    if (!poll || poll.meetingId !== meetingId) {
      throw new Error('Pauta não encontrada nesta reunião.');
    }
    if (poll.status !== 'CLOSED') {
      throw new Error('Apenas pautas encerradas podem ter candidatos confirmados definitivamente.');
    }

    const cleanInput = (candidateNameOrOptionId || '').trim();
    if (!cleanInput) {
      throw new Error('Identificação ou nome do candidato não informado.');
    }

    // Localizar a opção pelo ID ou pelo texto
    const matchedOption = poll.options.find(
      (o) => o.id === cleanInput || o.text.trim().toLowerCase() === cleanInput.toLowerCase()
    );
    if (!matchedOption) {
      throw new Error(`Candidato "${cleanInput}" não pertence às opções desta pauta.`);
    }

    const candidateText = matchedOption.text.trim();
    const candidateLower = candidateText.toLowerCase();

    // Calcular resultado oficial da rodada
    const calc = this.calculatePollResult(pollId);
    if (!calc) {
      throw new Error('Não foi possível calcular o resultado da pauta.');
    }

    const totalVoters = calc.totalVoters || 0;
    const optResult = calc.options.find(
      (o) => o.optionId === matchedOption.id || o.text.trim().toLowerCase() === candidateLower
    );
    const votes = optResult ? optResult.votes : 0;

    // 7. Validação de maioria absoluta estrita por aritmética inteira: 2 * votes > totalVoters
    if (totalVoters === 0 || 2 * votes <= totalVoters) {
      throw new Error(
        `O candidato "${candidateText}" não possui maioria absoluta (>50% dos votantes efetivos) para ser confirmado.`
      );
    }

    // 9. Impedir confirmação quando houver empate pendente na linha de corte
    if (calc.isTie) {
      const isTiedAtCutoff =
        (calc.tieOptions && calc.tieOptions.some((t) => t.trim().toLowerCase() === candidateLower)) ||
        (calc.excessEligibleOptions && calc.excessEligibleOptions.some((e) => e.trim().toLowerCase() === candidateLower));
      if (isTiedAtCutoff) {
        throw new Error(
          `O candidato "${candidateText}" está em situação de empate pendente na linha de corte e não pode ser confirmado diretamente.`
        );
      }
    }

    // 8. Respeitar o limite original de vagas e pauta raiz
    const rootPollId = poll.rootPollId || poll.id;
    const rootPoll = this.getPollById(rootPollId) || poll;
    const isMultiSeat = Boolean(rootPoll.allowMultiple || poll.allowMultiple);
    const initialSeats = isMultiSeat
      ? Math.max(1, rootPoll.maxChoices || poll.maxChoices || 1)
      : 1;

    // Obter todos os candidatos confirmados em rodadas anteriores estritamente fechadas desta família
    const allRoundsInFamily = this.data.polls
      .filter((p) => p.meetingId === meetingId && (p.id === rootPollId || p.rootPollId === rootPollId))
      .sort((a, b) => (a.round || 1) - (b.round || 1));

    const earlierClosedRounds = allRoundsInFamily.filter(
      (p) => p.id !== poll.id && p.status === 'CLOSED' && (p.round || 1) < (poll.round || 1)
    );

    const alreadyConfirmedWinners = new Set<string>();
    for (const p of earlierClosedRounds) {
      if (Array.isArray(p.confirmedWinnerNames)) {
        for (const w of p.confirmedWinnerNames) {
          alreadyConfirmedWinners.add(w.trim().toLowerCase());
        }
      } else if (Array.isArray(p.decisionAudit?.confirmedWinnersThisRound)) {
        for (const w of p.decisionAudit!.confirmedWinnersThisRound) {
          alreadyConfirmedWinners.add(w.trim().toLowerCase());
        }
      }
    }

    // 6. Impedir confirmação duplicada
    if (alreadyConfirmedWinners.has(candidateLower)) {
      throw new Error(`O candidato "${candidateText}" já foi confirmado definitivamente em rodada anterior.`);
    }

    const currentConfirmed = Array.isArray(poll.confirmedWinnerNames)
      ? poll.confirmedWinnerNames
      : [];
    if (currentConfirmed.some((w) => w.trim().toLowerCase() === candidateLower)) {
      throw new Error(`O candidato "${candidateText}" já foi confirmado nesta pauta.`);
    }

    // Verificar se o total de confirmados não excede o limite de vagas
    const totalConfirmedIfAdded = alreadyConfirmedWinners.size + currentConfirmed.length + 1;
    if (totalConfirmedIfAdded > initialSeats) {
      throw new Error(
        `Limite de vagas atingido (${initialSeats}). Não é possível confirmar mais candidatos.`
      );
    }

    // 1-5. Preservar opções e votos intactos; registrar confirmação persistente no poll
    const newConfirmedWinnerNames = Array.from(new Set([...currentConfirmed, candidateText]));
    poll.confirmedWinnerNames = newConfirmedWinnerNames;

    if (!poll.decisionAudit) {
      poll.decisionAudit = {
        round: poll.round || 1,
        cutoffPercentageSuggested: 0,
        cutoffPercentageApplied: 0,
        candidatesSuggestedForCutoff: [],
        candidatesKeptByAdmin: [],
        candidatesRemovedByAdmin: [],
        confirmedWinnersThisRound: newConfirmedWinnerNames,
        remainingOpenSeats: Math.max(0, initialSeats - newConfirmedWinnerNames.length),
        timestamp: new Date().toISOString(),
      };
    } else {
      poll.decisionAudit.confirmedWinnersThisRound = newConfirmedWinnerNames;
    }

    const storedPoll = this.data.polls.find((p) => p.id === pollId);
    if (storedPoll) {
      storedPoll.confirmedWinnerNames = newConfirmedWinnerNames;
      storedPoll.decisionAudit = poll.decisionAudit;
    }

    await firestoreService.saveEntity('polls', poll.id, storedPoll || poll);
    this.saveLocal();

    // Sincronizar ATA correspondente
    try {
      const isOrgPoll = this.isPollBelongingToOrganizingCommission(poll, meetingId);
      if (!isOrgPoll) {
        const refreshedAta = this.getOrGenerateMeetingAta(meetingId);
        meeting.ataContent = refreshedAta;
      } else {
        const refreshedOrgAta = this.getOrGenerateOrganizingMeetingAta(meetingId);
        meeting.organizingAtaContent = refreshedOrgAta;
      }
      await firestoreService.saveEntity('meetings', meeting.id, meeting);
    } catch (err) {
      console.warn('[confirmPollCandidate] Erro ao sincronizar ATA:', err);
    }

    const updatedPoll = this.getPollById(poll.id)!;
    const updatedCalc = this.calculatePollResult(poll.id)!;

    return {
      success: true,
      poll: updatedPoll,
      pollResult: updatedCalc,
      confirmedWinnerNames: newConfirmedWinnerNames,
    };
  }

  /**
   * Persistência das Decisões Administrativas da Eliminação Assistida Progressiva (MÉDIO-01):
   * Registra explicitamente no backend e no Firestore:
   * - Candidatos confirmados (candidatesConfirmed)
   * - Candidatos retirados/eliminados da próxima rodada (candidatesRemoved)
   * - Percentual de corte aplicado (cutoffPercentageApplied)
   * Sincroniza a ATA e permite recuperação total no carregamento inicial da página (F5).
   */
  public async saveAssistedDecisions(
    meetingId: string,
    pollId: string,
    decisions: {
      candidatesConfirmed?: string[];
      candidatesRemoved?: string[];
      cutoffPercentageApplied?: number;
    }
  ): Promise<{ success: boolean; poll: Poll; pollResult: PollResult }> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }
    const poll = this.getPollById(pollId);
    if (!poll || poll.meetingId !== meetingId) {
      throw new Error('Pauta não encontrada nesta reunião.');
    }
    if (poll.status !== 'CLOSED') {
      throw new Error('Apenas pautas encerradas podem ter decisões administrativas salvas.');
    }

    const calc = this.calculatePollResult(pollId);
    if (!calc) {
      throw new Error('Não foi possível calcular o resultado da pauta.');
    }

    const rootPollId = poll.rootPollId || poll.id;
    const rootPoll = this.getPollById(rootPollId) || poll;
    const isMultiSeat = Boolean(rootPoll.allowMultiple || poll.allowMultiple);
    const initialSeats = isMultiSeat
      ? Math.max(1, rootPoll.maxChoices || poll.maxChoices || 1)
      : 1;

    const rawConfirmed = Array.isArray(decisions.candidatesConfirmed) ? decisions.candidatesConfirmed : [];
    const cleanConfirmed = Array.from(
      new Set(rawConfirmed.map((c) => (typeof c === 'string' ? c.trim() : '')).filter((c) => c.length > 0))
    );

    const rawRemoved = Array.isArray(decisions.candidatesRemoved) ? decisions.candidatesRemoved : [];
    const cleanRemoved = Array.from(
      new Set(rawRemoved.map((r) => (typeof r === 'string' ? r.trim() : '')).filter((r) => r.length > 0))
    );

    // Validate no overlap between confirmed and removed
    for (const conf of cleanConfirmed) {
      if (cleanRemoved.some((rem) => rem.toLowerCase() === conf.toLowerCase())) {
        throw new Error(`O candidato "${conf}" não pode ser confirmado e retirado simultaneamente.`);
      }
    }

    // Gather already confirmed winners strictly from earlier closed rounds (< poll.round)
    const currentRound = poll.round || 1;
    const allRoundsInFamily = this.data.polls
      .filter((p) => p.meetingId === meetingId && (p.id === rootPollId || p.rootPollId === rootPollId))
      .sort((a, b) => (a.round || 1) - (b.round || 1));

    const earlierClosedRounds = allRoundsInFamily.filter(
      (p) => p.id !== poll.id && p.status === 'CLOSED' && (p.round || 1) < currentRound
    );

    const alreadyConfirmedWinners = new Set<string>();
    for (const p of earlierClosedRounds) {
      if (Array.isArray(p.confirmedWinnerNames)) {
        for (const w of p.confirmedWinnerNames) {
          alreadyConfirmedWinners.add(w.trim().toLowerCase());
        }
      } else if (Array.isArray(p.decisionAudit?.confirmedWinnersThisRound)) {
        for (const w of p.decisionAudit!.confirmedWinnersThisRound) {
          alreadyConfirmedWinners.add(w.trim().toLowerCase());
        }
      }
    }

    if (alreadyConfirmedWinners.size + cleanConfirmed.length > initialSeats) {
      throw new Error(
        `O total de candidatos confirmados (${alreadyConfirmedWinners.size + cleanConfirmed.length}) excede o limite original de vagas (${initialSeats}).`
      );
    }

    const totalVoters = calc.totalVoters || 0;
    for (const conf of cleanConfirmed) {
      const optMatch = poll.options.find((o) => o.text.trim().toLowerCase() === conf.toLowerCase());
      if (!optMatch) {
        throw new Error(`O candidato "${conf}" não pertence às opções desta pauta.`);
      }

      if (alreadyConfirmedWinners.has(conf.toLowerCase())) {
        throw new Error(`O candidato "${conf}" já foi confirmado em rodada anterior.`);
      }

      const optResult = calc.options.find(
        (o) => o.optionId === optMatch.id || o.text.trim().toLowerCase() === conf.toLowerCase()
      );
      const votes = optResult ? optResult.votes : 0;

      // Strict absolute majority (> 50% using 2 * votes > totalVoters)
      if (totalVoters === 0 || 2 * votes <= totalVoters) {
        throw new Error(
          `O candidato "${conf}" não possui maioria absoluta (>50% dos votantes efetivos) para ser confirmado.`
        );
      }

      // Check tie at cutoff
      if (calc.isTie) {
        const isTiedAtCutoff =
          (calc.tieOptions && calc.tieOptions.some((t) => t.trim().toLowerCase() === conf.toLowerCase())) ||
          (calc.excessEligibleOptions && calc.excessEligibleOptions.some((e) => e.trim().toLowerCase() === conf.toLowerCase()));
        if (isTiedAtCutoff) {
          throw new Error(
            `O candidato "${conf}" está em situação de empate pendente na linha de corte e não pode ser confirmado diretamente.`
          );
        }
      }
    }

    for (const rem of cleanRemoved) {
      const optMatch = poll.options.find((o) => o.text.trim().toLowerCase() === rem.toLowerCase());
      if (!optMatch) {
        throw new Error(`O candidato "${rem}" não pertence às opções desta pauta.`);
      }
    }

    const candidatesKept = poll.options
      .map((o) => o.text.trim())
      .filter(
        (t) =>
          !cleanConfirmed.some((c) => c.toLowerCase() === t.toLowerCase()) &&
          !cleanRemoved.some((r) => r.toLowerCase() === t.toLowerCase())
      );

    const remainingSeats = Math.max(0, initialSeats - (alreadyConfirmedWinners.size + cleanConfirmed.length));

    const cutoffApplied =
      decisions.cutoffPercentageApplied !== undefined
        ? decisions.cutoffPercentageApplied
        : (poll.decisionAudit?.cutoffPercentageApplied ?? getSuggestedCutoffPercentage(currentRound));

    const auditRecord: PollRoundDecisionAudit = {
      round: currentRound,
      cutoffPercentageSuggested: getSuggestedCutoffPercentage(currentRound),
      cutoffPercentageApplied: cutoffApplied,
      candidatesSuggestedForCutoff: calc.candidatesSuggestedForCutoff || [],
      candidatesKeptByAdmin: candidatesKept,
      candidatesRemovedByAdmin: cleanRemoved,
      confirmedWinnersThisRound: cleanConfirmed,
      remainingOpenSeats: remainingSeats,
      timestamp: new Date().toISOString(),
    };

    poll.confirmedWinnerNames = cleanConfirmed;
    poll.decisionAudit = auditRecord;

    const storedPoll = this.data.polls.find((p) => p.id === pollId);
    if (storedPoll) {
      storedPoll.confirmedWinnerNames = cleanConfirmed;
      storedPoll.decisionAudit = auditRecord;
    }

    await firestoreService.saveEntity('polls', poll.id, storedPoll || poll);
    this.saveLocal();

    try {
      const isOrgPoll = this.isPollBelongingToOrganizingCommission(poll, meetingId);
      if (!isOrgPoll) {
        const refreshedAta = this.getOrGenerateMeetingAta(meetingId);
        meeting.ataContent = refreshedAta;
      } else {
        const refreshedOrgAta = this.getOrGenerateOrganizingMeetingAta(meetingId);
        meeting.organizingAtaContent = refreshedOrgAta;
      }
      await firestoreService.saveEntity('meetings', meeting.id, meeting);
    } catch (err) {
      console.warn('[saveAssistedDecisions] Erro ao sincronizar ATA:', err);
    }

    const updatedPoll = this.getPollById(poll.id)!;
    const updatedCalc = this.calculatePollResult(poll.id)!;

    return {
      success: true,
      poll: updatedPoll,
      pollResult: updatedCalc,
    };
  }

  // --- Voting Methods ---

  public hasUserVoted(pollId: string, anonymousSessionId: string): boolean {
    if (!anonymousSessionId) return false;
    return this.data.votes.some(
      (v) => v.pollId === pollId && v.anonymousSessionId === anonymousSessionId
    );
  }

  public async registerVote(
    pollId: string,
    optionIds: string | string[],
    anonymousSessionId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!anonymousSessionId || typeof anonymousSessionId !== 'string') {
      return { success: false, error: 'Sessão anônima inválida.' };
    }

    const poll = this.getPollById(pollId);
    if (!poll) {
      return { success: false, error: 'Pauta não encontrada.' };
    }

    if (poll.status !== 'OPEN') {
      return { success: false, error: 'Esta votação já foi encerrada ou não está aberta.' };
    }

    const meeting = this.getMeetingById(poll.meetingId);
    if (!meeting || meeting.status === 'MEETING_CLOSED') {
      return { success: false, error: 'Esta reunião foi encerrada.' };
    }

    // Backend duplicate vote check
    if (this.hasUserVoted(pollId, anonymousSessionId)) {
      return { success: false, error: 'Você já votou nesta pauta.' };
    }

    // Strict duplicate check if array was submitted
    if (Array.isArray(optionIds)) {
      const rawFiltered = optionIds.map((id) => String(id).trim()).filter(Boolean);
      if (rawFiltered.length !== new Set(rawFiltered).size) {
        return { success: false, error: 'Opções de voto duplicadas não são permitidas.' };
      }
    }

    // Normalize submitted option ids
    const selectedOptionIds = Array.isArray(optionIds)
      ? optionIds.map((id) => String(id).trim()).filter(Boolean)
      : (typeof optionIds === 'string' && optionIds.trim().length > 0 ? [optionIds.trim()] : []);

    if (selectedOptionIds.length === 0) {
      return { success: false, error: 'Nenhuma opção de voto selecionada.' };
    }

    // Validate that all options exist in the poll
    const pollOptionsMap = new Map(poll.options.map((o) => [o.id, o]));
    for (const optId of selectedOptionIds) {
      if (!pollOptionsMap.has(optId)) {
        return { success: false, error: 'Opção de voto inválida.' };
      }
    }

    // Validate choice limits
    const isMultiple = Boolean(poll.allowMultiple);
    const maxLimit = isMultiple ? (poll.maxChoices || 1) : 1;

    if (isMultiple) {
      if (selectedOptionIds.length > maxLimit) {
        return {
          success: false,
          error: `Você pode selecionar no máximo ${maxLimit} opções (você enviou ${selectedOptionIds.length}).`,
        };
      }
    } else {
      if (selectedOptionIds.length !== 1) {
        return {
          success: false,
          error: 'Esta votação permite a seleção de apenas 1 opção.',
        };
      }
    }

    // Record each choice anonymously
    // Invariant: no name, email, uid, IP attached
    const voteTime = new Date().toISOString();
    const newVotes: VoteRecord[] = [];
    for (const optId of selectedOptionIds) {
      const voteRecord: VoteRecord = {
        id: crypto.randomUUID(),
        pollId,
        optionId: optId,
        anonymousSessionId,
        createdAt: voteTime,
      };
      newVotes.push(voteRecord);
    }

    // Await durable Firestore writes BEFORE updating memory or confirming
    for (const vr of newVotes) {
      await firestoreService.saveEntity('votes', vr.id, vr);
    }

    // Only upon successful persistence in Firestore:
    this.data.votes.push(...newVotes);
    this.saveLocal();
    return { success: true };
  }

  // --- Results Calculation ---

  public calculatePollResult(pollId: string): PollResult | null {
    const poll = this.getPollById(pollId);
    if (!poll) return null;

    const pollVotes = this.data.votes.filter((v) => v.pollId === pollId);
    const uniqueVoters = new Set(pollVotes.map((v) => v.anonymousSessionId)).size;
    const totalVoters = uniqueVoters;
    const totalSelections = pollVotes.length;
    const totalVotes = totalSelections;

    const optionCounts: { [optionId: string]: number } = {};
    for (const opt of poll.options) {
      optionCounts[opt.id] = 0;
    }
    for (const vote of pollVotes) {
      if (optionCounts[vote.optionId] !== undefined) {
        optionCounts[vote.optionId]++;
      }
    }

    const optionResults: OptionResult[] = poll.options.map((opt) => {
      const votes = optionCounts[opt.id] || 0;
      // In both single and multiple choice, calculate percentage based on voters who chose that option
      const rawPercentage = totalVoters > 0 ? (votes / totalVoters) * 100 : 0;
      const percentage = Number.isInteger(rawPercentage)
        ? rawPercentage
        : Math.round(rawPercentage * 10) / 10;
      return {
        optionId: opt.id,
        text: opt.text,
        votes,
        percentage,
      };
    });

    let winnerOptionId: string | null = null;
    let winnerOptionText: string | null = null;
    let isTie = false;
    let hasExcessEligible = false;
    const tieOptions: string[] = [];
    const excessEligibleOptions: string[] = [];
    const winnerOptionTexts: string[] = [];

    if (totalVotes > 0) {
      const votedOptions = optionResults
        .filter((o) => o.votes > 0)
        .sort((a, b) => b.votes - a.votes);

      if (votedOptions.length > 0) {
        if (poll.allowMultiple && (poll.maxChoices || 1) > 1) {
          const limit = Math.max(1, poll.maxChoices || 1);
          // Strict absolute majority: strictly > 50% using exact integer arithmetic (2 * votes > totalVoters)
          const approvedCandidates = votedOptions.filter((o) => totalVoters > 0 && 2 * o.votes > totalVoters);

          if (approvedCandidates.length === 0) {
            // Nenhum candidato atingiu estritamente mais de 50% dos votos
            isTie = false;
          } else if (approvedCandidates.length <= limit) {
            // Todos os candidatos aprovados (> 50%) cabem dentro das vagas disponíveis
            winnerOptionTexts.push(...approvedCandidates.map((o) => o.text));
            winnerOptionText = winnerOptionTexts.join(', ');
            winnerOptionId = approvedCandidates[0].optionId;
            isTie = false;
          } else {
            // Mais candidatos aprovados (> 50%) do que vagas disponíveis!
            // Identificar a linha de corte na última vaga disponível (índice limit - 1)
            const cutoffVotes = approvedCandidates[limit - 1].votes;
            const nextVotes = approvedCandidates[limit].votes;

            if (cutoffVotes === nextVotes) {
              // Empate na linha de corte: candidatos com votos estritamente maiores que cutoffVotes
              // têm eleição assegurada e são imediatamente confirmados.
              // Apenas os candidatos empatados com exatamente cutoffVotes disputam as vagas restantes.
              const clearWinners = approvedCandidates.filter((o) => o.votes > cutoffVotes);
              const tiedAtCutoff = approvedCandidates.filter((o) => o.votes === cutoffVotes);

              isTie = true;
              hasExcessEligible = true;
              excessEligibleOptions.push(...tiedAtCutoff.map((o) => o.text));
              tieOptions.push(...tiedAtCutoff.map((o) => o.text));

              if (clearWinners.length > 0) {
                winnerOptionTexts.push(...clearWinners.map((o) => o.text));
                winnerOptionText = winnerOptionTexts.join(', ');
                winnerOptionId = clearWinners[0].optionId;
              }
            } else {
              // Os top `limit` candidatos aprovados estão estritamente à frente da linha de corte
              const winners = approvedCandidates.slice(0, limit);
              winnerOptionTexts.push(...winners.map((o) => o.text));
              winnerOptionText = winnerOptionTexts.join(', ');
              winnerOptionId = winners[0].optionId;
              isTie = false;
            }
          }
        } else {
          // Single choice (1 vaga): exige maioria absoluta estrita (2 * votes > totalVoters)
          const maxVotes = votedOptions[0].votes;
          const topOptions = votedOptions.filter((o) => o.votes === maxVotes);
          if (topOptions.length > 1) {
            isTie = true;
            tieOptions.push(...topOptions.map((o) => o.text));
          } else if (topOptions.length === 1 && totalVoters > 0 && 2 * maxVotes > totalVoters) {
            winnerOptionId = topOptions[0].optionId;
            winnerOptionText = topOptions[0].text;
            winnerOptionTexts.push(topOptions[0].text);
            isTie = false;
          } else {
            isTie = false;
          }
        }
      }
    }

    // Determine isFinal:
    // If poll.isFinal is explicitly false, it is not final.
    // If poll is CLOSED and has no subsequent round, it is default isFinal.
    const rootPollId = poll.rootPollId || poll.id;
    const allRoundsInMeeting = this.data.polls.filter(
      (p) => p.meetingId === poll.meetingId && (p.id === rootPollId || p.rootPollId === rootPollId)
    );
    const roundNumber = poll.round || 1;
    const maxRoundNumber = Math.max(...allRoundsInMeeting.map((p) => p.round || 1));
    const isLatestRound = roundNumber === maxRoundNumber;
    const isFinalComputed = poll.isFinal !== undefined ? poll.isFinal : isLatestRound;

    // Advisory cutoff calculation
    const suggestedCutoffPercentage = getSuggestedCutoffPercentage(roundNumber);
    const candidatesSuggestedForCutoff: string[] = [];
    if (totalVoters > 0) {
      for (const opt of optionResults) {
        // Regra de segurança: Candidatos com maioria absoluta (> 50%) NÃO podem ser sugeridos para corte
        const hasStrictMajority = 2 * opt.votes > totalVoters;
        const belowCutoff = (opt.votes * 100) < (totalVoters * suggestedCutoffPercentage);
        if (!hasStrictMajority && belowCutoff) {
          candidatesSuggestedForCutoff.push(opt.text);
        }
      }
    }

    // Remaining open seats calculation
    const rootPoll = this.getPollById(rootPollId) || poll;
    const isMultiSeatFamily = Boolean(rootPoll.allowMultiple || poll.allowMultiple);
    const initialSeats = isMultiSeatFamily ? Math.max(1, rootPoll.maxChoices || poll.maxChoices || 1) : 1;
    let remainingOpenSeats: number;

    if (!isMultiSeatFamily && initialSeats <= 1) {
      const hasConfirmed = Array.isArray(poll.confirmedWinnerNames)
        ? poll.confirmedWinnerNames.length > 0
        : winnerOptionTexts.length > 0;
      remainingOpenSeats = hasConfirmed ? 0 : 1;
    } else {
      const earlierConfirmed = new Set<string>();
      for (const p of allRoundsInMeeting) {
        if (p.id !== poll.id && p.status === 'CLOSED' && (p.round || 1) < roundNumber) {
          if (Array.isArray(p.confirmedWinnerNames)) {
            p.confirmedWinnerNames.forEach((w) => earlierConfirmed.add(w.trim().toLowerCase()));
          } else if (Array.isArray(p.decisionAudit?.confirmedWinnersThisRound)) {
            p.decisionAudit!.confirmedWinnersThisRound.forEach((w) => earlierConfirmed.add(w.trim().toLowerCase()));
          } else {
            const pVotes = this.data.votes.filter((v) => v.pollId === p.id);
            const pTotalVoters = new Set(pVotes.map((v) => v.anonymousSessionId)).size;
            const pCounts: Record<string, number> = {};
            p.options.forEach((o) => (pCounts[o.id] = 0));
            pVotes.forEach((v) => { if (pCounts[v.optionId] !== undefined) pCounts[v.optionId]++; });
            const pApproved = p.options
              .map((o) => ({ text: o.text, votes: pCounts[o.id] || 0 }))
              .filter((o) => pTotalVoters > 0 && 2 * o.votes > pTotalVoters)
              .sort((a, b) => b.votes - a.votes);
            const pLimit = Math.max(1, p.maxChoices || 1);
            if (pApproved.length <= pLimit) {
              pApproved.forEach((o) => earlierConfirmed.add(o.text.trim().toLowerCase()));
            } else {
              const cVotes = pApproved[pLimit - 1].votes;
              const nVotes = pApproved[pLimit].votes;
              if (cVotes === nVotes) {
                pApproved.filter((o) => o.votes > cVotes).forEach((o) => earlierConfirmed.add(o.text.trim().toLowerCase()));
              } else {
                pApproved.slice(0, pLimit).forEach((o) => earlierConfirmed.add(o.text.trim().toLowerCase()));
              }
            }
          }
        }
      }

      const currentRoundConfirmedList = Array.isArray(poll.confirmedWinnerNames)
        ? poll.confirmedWinnerNames
        : winnerOptionTexts;
      const currentRoundConfirmed = new Set(currentRoundConfirmedList.map((w) => w.trim().toLowerCase()));
      const totalConfirmedNames = new Set([...earlierConfirmed, ...currentRoundConfirmed]);
      remainingOpenSeats = Math.max(0, initialSeats - totalConfirmedNames.size);
    }

    // Gather round history for this poll family if multiple rounds exist
    let roundHistory: PollResult[] | undefined = undefined;
    if (allRoundsInMeeting.length > 1) {
      roundHistory = allRoundsInMeeting
        .filter((p) => p.id !== poll.id && p.status === 'CLOSED')
        .sort((a, b) => (a.round || 1) - (b.round || 1))
        .map((p) => {
          const pollVotesH = this.data.votes.filter((v) => v.pollId === p.id);
          const totalVotersH = new Set(pollVotesH.map((v) => v.anonymousSessionId)).size;
          const optionCountsH: Record<string, number> = {};
          p.options.forEach((o) => (optionCountsH[o.id] = 0));
          pollVotesH.forEach((v) => {
            if (optionCountsH[v.optionId] !== undefined) optionCountsH[v.optionId]++;
          });
          const optsH: OptionResult[] = p.options.map((opt) => {
            const vCount = optionCountsH[opt.id] || 0;
            const rawP = totalVotersH > 0 ? (vCount / totalVotersH) * 100 : 0;
            return {
              optionId: opt.id,
              text: opt.text,
              votes: vCount,
              percentage: Number.isInteger(rawP) ? rawP : Math.round(rawP * 10) / 10,
            };
          });
          return {
            pollId: p.id,
            question: p.question,
            status: p.status,
            totalVotes: pollVotesH.length,
            totalVoters: totalVotersH,
            totalSelections: pollVotesH.length,
            allowMultiple: p.allowMultiple || false,
            maxChoices: p.maxChoices || 1,
            options: optsH,
            winnerOptionId: null,
            winnerOptionText: null,
            isTie: false,
            createdAt: p.createdAt,
            openedAt: p.openedAt,
            closedAt: p.closedAt,
            round: p.round || 1,
            rootPollId,
            isFinal: false,
          };
        });
    }

    const resolvedConfirmedWinnerNames = Array.isArray(poll.confirmedWinnerNames)
      ? poll.confirmedWinnerNames
      : winnerOptionTexts.length > 0
      ? winnerOptionTexts
      : undefined;

    return {
      pollId: poll.id,
      question: poll.question,
      status: poll.status,
      totalVotes,
      totalVoters,
      totalSelections,
      allowMultiple: poll.allowMultiple || false,
      maxChoices: poll.maxChoices || 1,
      options: optionResults,
      winnerOptionId,
      winnerOptionText,
      winnerOptionTexts: winnerOptionTexts.length > 0 ? winnerOptionTexts : undefined,
      isTie,
      tieOptions: tieOptions.length > 0 ? tieOptions : undefined,
      hasExcessEligible,
      excessEligibleOptions: excessEligibleOptions.length > 0 ? excessEligibleOptions : undefined,
      associates: poll.associates || [],
      source: poll.source,
      sourceDepartmentId: poll.sourceDepartmentId,
      commissionType: poll.commissionType,
      sourceCriterionId: poll.sourceCriterionId,
      sourceCriterionName: poll.sourceCriterionName,
      associationType: poll.associationType || (poll.associates && poll.associates.length > 0 ? 'DIRECT' : undefined),
      associationPollId: poll.associationPollId || null,
      votedAssociates: poll.votedAssociates || [],
      parentPollId: poll.parentPollId,
      isAssociatePoll: poll.isAssociatePoll,
      createdAt: poll.createdAt,
      openedAt: poll.openedAt,
      closedAt: poll.closedAt,
      round: roundNumber,
      rootPollId,
      rootMaxChoices: initialSeats,
      isFinal: isFinalComputed,
      roundHistory,
      suggestedCutoffPercentage,
      candidatesSuggestedForCutoff: candidatesSuggestedForCutoff.length > 0 ? candidatesSuggestedForCutoff : undefined,
      remainingOpenSeats,
      confirmedWinnerNames: resolvedConfirmedWinnerNames,
      decisionAudit: poll.decisionAudit,
    };
  }

  // --- Formatted Views ---

  public getPublicMeetingState(code: string, participantCount: number): PublicMeetingState | null {
    const meeting = this.getMeetingByCode(code);
    if (!meeting) return null;

    let currentPollData: PublicMeetingState['currentPoll'] = null;
    if (meeting.currentPollId) {
      const poll = this.getPollById(meeting.currentPollId);
      if (poll && poll.status === 'OPEN') {
        currentPollData = {
          id: poll.id,
          question: poll.question,
          status: poll.status,
          options: poll.options.map((o) => ({ id: o.id, text: o.text })),
          allowMultiple: poll.allowMultiple || false,
          maxChoices: poll.maxChoices || 1,
        };
      }
    }

    return {
      id: meeting.id,
      name: meeting.name,
      description: meeting.description,
      nominationCommissionName: meeting.nominationCommissionName,
      code: meeting.code,
      status: meeting.status,
      participantCount,
      currentPoll: currentPollData,
    };
  }

  public getAdminMeetingState(
    code: string,
    participantCount: number,
    participants?: string[]
  ): AdminMeetingState | null {
    const meeting = this.getMeetingByCode(code);
    if (!meeting) return null;

    const allPolls = this.getPollsByMeeting(meeting.id);
    let currentPoll: Poll | null = null;
    let currentPollResult: PollResult | null = null;

    // PAUTA ATUAL must ONLY contain the poll currently OPEN
    const openPoll = allPolls.find((p) => p.status === 'OPEN');
    if (openPoll) {
      currentPoll = openPoll;
      currentPollResult = this.calculatePollResult(currentPoll.id);
    }

    // Helper to determine if a poll is an associate sub-poll
    const isAssociatePoll = (p: Poll): boolean => {
      if (p.isAssociatePoll || Boolean(p.parentPollId)) return true;
      if (p.question.startsWith('ASSOCIADOS - ')) {
        const baseCargo = p.question.replace(/^ASSOCIADOS\s*-\s*/i, '').trim().toLowerCase();
        const hasParent = allPolls.some(
          (other) =>
            other.id !== p.id &&
            other.meetingId === p.meetingId &&
            other.question.trim().toLowerCase().includes(baseCargo)
        );
        if (hasParent) return true;
      }
      return false;
    };

    // Ensure any closed associate polls are linked to their parent poll
    const closedAssociatePolls = allPolls.filter((p) => p.status === 'CLOSED' && isAssociatePoll(p));
    for (const assocPoll of closedAssociatePolls) {
      let parent = assocPoll.parentPollId
        ? allPolls.find((p) => p.id === assocPoll.parentPollId)
        : null;
      if (!parent && assocPoll.question.startsWith('ASSOCIADOS - ')) {
        const baseCargo = assocPoll.question.replace(/^ASSOCIADOS\s*-\s*/i, '').trim().toLowerCase();
        parent = allPolls.find(
          (other) =>
            other.id !== assocPoll.id &&
            other.meetingId === assocPoll.meetingId &&
            other.question.trim().toLowerCase().includes(baseCargo)
        ) || null;
      }
      if (parent) {
        assocPoll.isAssociatePoll = true;
        assocPoll.parentPollId = parent.id;
        if (!parent.votedAssociates || parent.votedAssociates.length === 0) {
          const assocRes = this.calculatePollResult(assocPoll.id);
          if (assocRes && assocRes.winnerOptionText) {
            const winningOpt = assocRes.options.find((o) => o.text === assocRes.winnerOptionText);
            const pct = winningOpt ? winningOpt.percentage : 0;
            parent.associationType = 'VOTED';
            parent.associationPollId = assocPoll.id;
            parent.associates = [assocRes.winnerOptionText];
            parent.votedAssociates = [
              {
                pollId: assocPoll.id,
                winnerName: assocRes.winnerOptionText,
                percentage: pct,
                options: assocRes.options,
              },
            ];
          }
        }
      }
    }

    // Closed polls history: only return main polls, NEVER a separate card for an associate sub-poll.
    // Group multiple rounds under their rootPollId so the history card shows the latest round (with previous round history attached).
    const closedMainPolls = allPolls.filter((p) => p.status === 'CLOSED' && !isAssociatePoll(p));
    const processedRootIds = new Set<string>();
    const history: PollResult[] = [];

    // Sort by latest closedAt / createdAt descending
    const sortedClosed = [...closedMainPolls].sort(
      (a, b) => new Date(b.closedAt || b.createdAt).getTime() - new Date(a.closedAt || a.createdAt).getTime()
    );

    for (const p of sortedClosed) {
      const rootId = p.rootPollId || p.id;
      if (processedRootIds.has(rootId)) continue;
      processedRootIds.add(rootId);

      // Find the round marked as isFinal, or the highest round number among closed rounds of this family
      const family = sortedClosed.filter((fp) => (fp.rootPollId || fp.id) === rootId);
      const chosenPoll = family.find((fp) => fp.isFinal) || family[0];
      const res = this.calculatePollResult(chosenPoll.id);
      if (res) {
        history.push(res);
      }
    }

    // Saved draft polls (all polls in WAITING status)
    const savedPolls: Poll[] = allPolls.filter((p) => p.status === 'WAITING');

    return {
      meeting,
      participantCount,
      participants: participants || [],
      currentPoll,
      currentPollResult,
      history,
      savedPolls,
    };
  }

  // --- History & Organized Retention ---

  public getClosedMeetingsHistory(userId?: string): HistoryYearGroup[] {
    const closedMeetings = this.data.meetings
      .filter((m) => {
        if (
          m.isDemo ||
          m.id === 'demo-meeting-2026' ||
          m.code === 'DEMO25' ||
          m.name === 'TESTE — ELIMINAÇÃO ASSISTIDA V2'
        ) {
          return false;
        }
        if (m.status !== 'MEETING_CLOSED') return false;
        if (userId && m.userId !== userId) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const MONTH_NAMES = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const yearMap = new Map<number, Map<number, HistoryMeetingSummary[]>>();

    for (const m of closedMeetings) {
      const d = new Date(m.createdAt);
      const year = d.getFullYear();
      const month = d.getMonth() + 1; // 1 to 12

      if (!yearMap.has(year)) {
        yearMap.set(year, new Map());
      }
      const monthMap = yearMap.get(year)!;
      if (!monthMap.has(month)) {
        monthMap.set(month, []);
      }

      const meetingPolls = this.data.polls.filter((p) => p.meetingId === m.id);
      const pollIds = new Set(meetingPolls.map((p) => p.id));
      const meetingVotesCount = this.data.votes.filter((v) => pollIds.has(v.pollId)).length;

      monthMap.get(month)!.push({
        id: m.id,
        code: m.code,
        name: m.name,
        description: m.description,
        nominationCommissionName: m.nominationCommissionName,
        status: m.status,
        createdAt: m.createdAt,
        closedAt: m.closedAt,
        totalPolls: meetingPolls.length,
        totalVotes: meetingVotesCount,
      });
    }

    // Sort years descending (most recent to oldest)
    const sortedYears = Array.from(yearMap.keys()).sort((a, b) => b - a);

    const result: HistoryYearGroup[] = [];

    for (const year of sortedYears) {
      const monthMap = yearMap.get(year)!;
      // Sort months descending (most recent to oldest: 12 down to 1)
      const sortedMonths = Array.from(monthMap.keys()).sort((a, b) => b - a);

      const months: HistoryMonthGroup[] = [];
      let yearTotalMeetings = 0;

      for (const month of sortedMonths) {
        const meetings = monthMap.get(month)!;
        // Sort meetings within month descending (most recent first)
        meetings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        yearTotalMeetings += meetings.length;
        months.push({
          month,
          monthName: MONTH_NAMES[month - 1],
          year,
          meetings,
        });
      }

      if (months.length > 0) {
        result.push({
          year,
          totalMeetings: yearTotalMeetings,
          months,
        });
      }
    }

    return result;
  }

  // --- Deletion Operations (Protected: Closed Meetings Only & User Isolated) ---

  public async deleteClosedMeeting(meetingId: string, userId?: string): Promise<{ success: boolean; error?: string }> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      return { success: false, error: 'Reunião não encontrada.' };
    }

    if (userId && meeting.userId && meeting.userId !== userId) {
      return { success: false, error: 'Acesso não autorizado para excluir esta reunião.' };
    }

    if (meeting.status !== 'MEETING_CLOSED') {
      return {
        success: false,
        error: 'Reuniões ativas não podem ser excluídas. Apenas reuniões encerradas podem ser excluídas.',
      };
    }

    const meetingPolls = this.data.polls.filter((p) => p.meetingId === meeting.id);
    const pollIds = new Set(meetingPolls.map((p) => p.id));
    const votesToDelete = this.data.votes.filter((v) => pollIds.has(v.pollId)).map((v) => v.id);
    const optionsToDelete = this.data.options.filter((o) => pollIds.has(o.pollId)).map((o) => o.id);
    const pollsToDelete = Array.from(pollIds);
    const nominationsToDelete = (this.data.nominations || []).filter((n) => n.meetingId === meeting.id).map((n) => n.id);
    const selectedNomineesToDelete = (this.data.selectedNominees || []).filter((s) => s.meetingId === meeting.id).map((s) => s.id);
    const expectedParticipantsToDelete = (this.data.expectedParticipants || []).filter((p) => p.meetingId === meeting.id).map((p) => p.id);
    const participantSessionsToDelete = (this.data.participantSessions || []).filter((ps) => ps.meetingId === meeting.id).map((ps) => ps.sessionId);

    // Durable Firestore batch deletes before memory update
    if (votesToDelete.length) await firestoreService.batchDelete('votes', votesToDelete);
    if (optionsToDelete.length) await firestoreService.batchDelete('options', optionsToDelete);
    if (pollsToDelete.length) await firestoreService.batchDelete('polls', pollsToDelete);
    if (nominationsToDelete.length) await firestoreService.batchDelete('nominations', nominationsToDelete);
    if (selectedNomineesToDelete.length) await firestoreService.batchDelete('selectedNominees', selectedNomineesToDelete);
    if (expectedParticipantsToDelete.length) await firestoreService.batchDelete('expectedParticipants', expectedParticipantsToDelete);
    if (participantSessionsToDelete.length) await firestoreService.batchDelete('participantSessions', participantSessionsToDelete);
    await firestoreService.deleteEntity('nominationConfigs', meeting.id);
    await firestoreService.deleteEntity('meetings', meeting.id);

    this.data.votes = this.data.votes.filter((v) => !pollIds.has(v.pollId));
    this.data.options = this.data.options.filter((o) => !pollIds.has(o.pollId));
    this.data.polls = this.data.polls.filter((p) => p.meetingId !== meeting.id);
    this.data.meetings = this.data.meetings.filter((m) => m.id !== meeting.id);

    // Clean up meeting-specific nomination configs and records
    if (this.data.nominationConfigs) {
      this.data.nominationConfigs = this.data.nominationConfigs.filter((c) => c.meetingId !== meeting.id);
    }
    if (this.data.nominations) {
      this.data.nominations = this.data.nominations.filter((n) => n.meetingId !== meeting.id);
    }
    if (this.data.selectedNominees) {
      this.data.selectedNominees = this.data.selectedNominees.filter((s) => s.meetingId !== meeting.id);
    }
    if (this.data.expectedParticipants) {
      this.data.expectedParticipants = this.data.expectedParticipants.filter((p) => p.meetingId !== meeting.id);
    }
    if (this.data.participantSessions) {
      this.data.participantSessions = this.data.participantSessions.filter((ps) => ps.meetingId !== meeting.id);
    }

    this.saveLocal();
    return { success: true };
  }

  public async deleteClosedMeetingsByMonth(year: number, month: number, userId?: string): Promise<{ success: boolean; count: number }> {
    // Strictly filter closed meetings belonging to this user
    const toDelete = this.data.meetings.filter((m) => {
      if (m.status !== 'MEETING_CLOSED') return false;
      if (userId && m.userId && m.userId !== userId) return false;
      const d = new Date(m.createdAt);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });

    if (toDelete.length === 0) {
      return { success: true, count: 0 };
    }

    const meetingIds = new Set(toDelete.map((m) => m.id));
    const meetingPolls = this.data.polls.filter((p) => meetingIds.has(p.meetingId));
    const pollIds = new Set(meetingPolls.map((p) => p.id));
    const votesToDelete = this.data.votes.filter((v) => pollIds.has(v.pollId)).map((v) => v.id);
    const optionsToDelete = this.data.options.filter((o) => pollIds.has(o.pollId)).map((o) => o.id);
    const pollsToDelete = Array.from(pollIds);
    const nominationsToDelete = (this.data.nominations || []).filter((n) => meetingIds.has(n.meetingId)).map((n) => n.id);
    const selectedNomineesToDelete = (this.data.selectedNominees || []).filter((s) => meetingIds.has(s.meetingId)).map((s) => s.id);
    const expectedParticipantsToDelete = (this.data.expectedParticipants || []).filter((p) => meetingIds.has(p.meetingId)).map((p) => p.id);
    const participantSessionsToDelete = (this.data.participantSessions || []).filter((ps) => meetingIds.has(ps.meetingId)).map((ps) => ps.sessionId);

    if (votesToDelete.length) await firestoreService.batchDelete('votes', votesToDelete);
    if (optionsToDelete.length) await firestoreService.batchDelete('options', optionsToDelete);
    if (pollsToDelete.length) await firestoreService.batchDelete('polls', pollsToDelete);
    if (nominationsToDelete.length) await firestoreService.batchDelete('nominations', nominationsToDelete);
    if (selectedNomineesToDelete.length) await firestoreService.batchDelete('selectedNominees', selectedNomineesToDelete);
    if (expectedParticipantsToDelete.length) await firestoreService.batchDelete('expectedParticipants', expectedParticipantsToDelete);
    if (participantSessionsToDelete.length) await firestoreService.batchDelete('participantSessions', participantSessionsToDelete);
    for (const mId of meetingIds) {
      await firestoreService.deleteEntity('nominationConfigs', mId);
      await firestoreService.deleteEntity('meetings', mId);
    }

    this.data.votes = this.data.votes.filter((v) => !pollIds.has(v.pollId));
    this.data.options = this.data.options.filter((o) => !pollIds.has(o.pollId));
    this.data.polls = this.data.polls.filter((p) => !meetingIds.has(p.meetingId));
    this.data.meetings = this.data.meetings.filter((m) => !meetingIds.has(m.id));

    if (this.data.nominationConfigs) {
      this.data.nominationConfigs = this.data.nominationConfigs.filter((c) => !meetingIds.has(c.meetingId));
    }
    if (this.data.nominations) {
      this.data.nominations = this.data.nominations.filter((n) => !meetingIds.has(n.meetingId));
    }
    if (this.data.selectedNominees) {
      this.data.selectedNominees = this.data.selectedNominees.filter((s) => !meetingIds.has(s.meetingId));
    }
    if (this.data.expectedParticipants) {
      this.data.expectedParticipants = this.data.expectedParticipants.filter((p) => !meetingIds.has(p.meetingId));
    }
    if (this.data.participantSessions) {
      this.data.participantSessions = this.data.participantSessions.filter((ps) => !meetingIds.has(ps.meetingId));
    }

    this.saveLocal();
    return { success: true, count: toDelete.length };
  }

  public async deleteClosedMeetingsByYear(year: number, userId?: string): Promise<{ success: boolean; count: number }> {
    // Strictly filter closed meetings belonging to this user
    const toDelete = this.data.meetings.filter((m) => {
      if (m.status !== 'MEETING_CLOSED') return false;
      if (userId && m.userId && m.userId !== userId) return false;
      const d = new Date(m.createdAt);
      return d.getFullYear() === year;
    });

    if (toDelete.length === 0) {
      return { success: true, count: 0 };
    }

    const meetingIds = new Set(toDelete.map((m) => m.id));
    const meetingPolls = this.data.polls.filter((p) => meetingIds.has(p.meetingId));
    const pollIds = new Set(meetingPolls.map((p) => p.id));
    const votesToDelete = this.data.votes.filter((v) => pollIds.has(v.pollId)).map((v) => v.id);
    const optionsToDelete = this.data.options.filter((o) => pollIds.has(o.pollId)).map((o) => o.id);
    const pollsToDelete = Array.from(pollIds);
    const nominationsToDelete = (this.data.nominations || []).filter((n) => meetingIds.has(n.meetingId)).map((n) => n.id);
    const selectedNomineesToDelete = (this.data.selectedNominees || []).filter((s) => meetingIds.has(s.meetingId)).map((s) => s.id);
    const expectedParticipantsToDelete = (this.data.expectedParticipants || []).filter((p) => meetingIds.has(p.meetingId)).map((p) => p.id);
    const participantSessionsToDelete = (this.data.participantSessions || []).filter((ps) => meetingIds.has(ps.meetingId)).map((ps) => ps.sessionId);

    if (votesToDelete.length) await firestoreService.batchDelete('votes', votesToDelete);
    if (optionsToDelete.length) await firestoreService.batchDelete('options', optionsToDelete);
    if (pollsToDelete.length) await firestoreService.batchDelete('polls', pollsToDelete);
    if (nominationsToDelete.length) await firestoreService.batchDelete('nominations', nominationsToDelete);
    if (selectedNomineesToDelete.length) await firestoreService.batchDelete('selectedNominees', selectedNomineesToDelete);
    if (expectedParticipantsToDelete.length) await firestoreService.batchDelete('expectedParticipants', expectedParticipantsToDelete);
    if (participantSessionsToDelete.length) await firestoreService.batchDelete('participantSessions', participantSessionsToDelete);
    for (const mId of meetingIds) {
      await firestoreService.deleteEntity('nominationConfigs', mId);
      await firestoreService.deleteEntity('meetings', mId);
    }

    this.data.votes = this.data.votes.filter((v) => !pollIds.has(v.pollId));
    this.data.options = this.data.options.filter((o) => !pollIds.has(o.pollId));
    this.data.polls = this.data.polls.filter((p) => !meetingIds.has(p.meetingId));
    this.data.meetings = this.data.meetings.filter((m) => !meetingIds.has(m.id));

    if (this.data.nominationConfigs) {
      this.data.nominationConfigs = this.data.nominationConfigs.filter((c) => !meetingIds.has(c.meetingId));
    }
    if (this.data.nominations) {
      this.data.nominations = this.data.nominations.filter((n) => !meetingIds.has(n.meetingId));
    }
    if (this.data.selectedNominees) {
      this.data.selectedNominees = this.data.selectedNominees.filter((s) => !meetingIds.has(s.meetingId));
    }
    if (this.data.expectedParticipants) {
      this.data.expectedParticipants = this.data.expectedParticipants.filter((p) => !meetingIds.has(p.meetingId));
    }
    if (this.data.participantSessions) {
      this.data.participantSessions = this.data.participantSessions.filter((ps) => !meetingIds.has(ps.meetingId));
    }

    this.saveLocal();
    return { success: true, count: toDelete.length };
  }

  // --- Módulo Indicações (Nominations) Methods ---

  public getNominationConfig(meetingId: string): NominationMeetingConfig | null {
    if (!this.data.nominationConfigs) {
      this.data.nominationConfigs = [];
    }
    const found = this.data.nominationConfigs.find((c) => c.meetingId === meetingId);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  public getOrCreateNominationConfig(meetingId: string): NominationMeetingConfig {
    if (!this.data.nominationConfigs) {
      this.data.nominationConfigs = [];
    }
    let config = this.data.nominationConfigs.find((c) => c.meetingId === meetingId);
    if (!config) {
      const meeting = this.getMeetingById(meetingId);
      if (!meeting) {
        throw new Error('Reunião não encontrada.');
      }
      // Secure random token for the meeting's public nomination link (PARTE 20)
      const publicToken = generateSecureShortToken(meeting.name);
      config = {
        meetingId,
        enabled: false,
        status: 'NOT_CONFIGURED',
        deadline: null,
        publicToken,
        departments: getDefaultMeetingDepartments(),
        createdAt: new Date().toISOString(),
      };
      this.data.nominationConfigs.push(config);
      this.save();
    } else {
      // Ensure all 35 official catalog departments are present in existing meeting configs
      const defaultDepts = getDefaultMeetingDepartments();
      const existingMap = new Map(config.departments.map((d) => [d.departmentId, d]));
      let hasMissing = false;
      const mergedDepts = defaultDepts.map((defaultDept) => {
        const existing = existingMap.get(defaultDept.departmentId);
        if (existing) {
          return existing;
        }
        hasMissing = true;
        return defaultDept;
      });

      // Preserve custom departments created specifically for this meeting
      const customDepts = config.departments.filter(
        (d) => d.isCustom || !defaultDepts.some((def) => def.departmentId === d.departmentId)
      );

      const combinedDepts = [...mergedDepts, ...customDepts];

      if (hasMissing || config.departments.length !== combinedDepts.length) {
        config.departments = combinedDepts;
        this.save();
      }
    }
    return JSON.parse(JSON.stringify(config));
  }

  public async saveNominationConfig(
    meetingId: string,
    updates: {
      enabled?: boolean;
      status?: 'NOT_CONFIGURED' | 'OPEN' | 'CLOSED';
      deadline?: string | null;
      departments?: Array<{
        departmentId: string;
        name: string;
        enabled: boolean;
        maxPerPerson: number;
        isCustom?: boolean;
      }>;
    }
  ): Promise<NominationMeetingConfig> {
    if (!this.data.nominationConfigs) {
      this.data.nominationConfigs = [];
    }
    const current = this.getOrCreateNominationConfig(meetingId);
    const idx = this.data.nominationConfigs.findIndex((c) => c.meetingId === meetingId);

    const updated: NominationMeetingConfig = {
      ...current,
      enabled: updates.enabled !== undefined ? Boolean(updates.enabled) : current.enabled,
      status: updates.status || current.status,
      deadline: updates.deadline !== undefined ? updates.deadline : current.deadline,
      departments: updates.departments
        ? updates.departments.map((d) => ({
            departmentId: d.departmentId,
            name: d.name,
            enabled: Boolean(d.enabled),
            maxPerPerson: Math.max(0, Math.floor(Number(d.maxPerPerson) || 0)),
            isCustom: Boolean(d.isCustom),
          }))
        : current.departments,
      updatedAt: new Date().toISOString(),
    };

    // Validations before generating or opening nominations
    if (updated.status === 'OPEN') {
      if (!updated.enabled) {
        throw new Error(
          'Não é possível abrir as indicações: o módulo de indicações está desativado nesta reunião. Ative o módulo primeiro.'
        );
      }

      if (updated.deadline) {
        const deadlineTime = new Date(updated.deadline).getTime();
        if (isNaN(deadlineTime) || deadlineTime <= Date.now()) {
          throw new Error(
            'Não é possível abrir as indicações: o prazo informado já expirou. Selecione uma data e hora no futuro.'
          );
        }
      }

      const activeDepts = updated.departments.filter((d) => d.enabled);
      if (activeDepts.length === 0) {
        throw new Error(
          'Não é possível abrir as indicações: habilite pelo menos um departamento para esta reunião.'
        );
      }

      const pendingDepts = activeDepts.filter(
        (d) => !d.maxPerPerson || d.maxPerPerson <= 0
      );
      if (pendingDepts.length > 0) {
        const names =
          pendingDepts.slice(0, 3).map((d) => d.name).join(', ') +
          (pendingDepts.length > 3 ? ` e mais ${pendingDepts.length - 3}` : '');
        throw new Error(
          `Não é possível abrir as indicações: existem ${pendingDepts.length} departamento(s) ativo(s) com limite pendente de configuração (${names}). Defina o limite de cada departamento ativo antes de abrir.`
        );
      }
    }

    if (updated.status === 'CLOSED' && !current.closedAt) {
      updated.closedAt = new Date().toISOString();
    } else if (updated.status !== 'CLOSED') {
      updated.closedAt = undefined;
    }

    await firestoreService.saveEntity('nominationConfigs', meetingId, updated);

    if (idx >= 0) {
      this.data.nominationConfigs[idx] = updated;
    } else {
      this.data.nominationConfigs.push(updated);
    }

    this.saveLocal();
    return JSON.parse(JSON.stringify(updated));
  }

  public getNominationConfigByToken(token: string): {
    config: NominationMeetingConfig;
    meeting: Meeting;
  } | null {
    if (!token || typeof token !== 'string') return null;
    const cleanToken = token.trim();
    if (!this.data.nominationConfigs) return null;
    const config = this.data.nominationConfigs.find((c) => c.publicToken === cleanToken);
    if (!config) return null;
    const meeting = this.getMeetingById(config.meetingId);
    if (!meeting) return null;
    return {
      config: JSON.parse(JSON.stringify(config)),
      meeting: JSON.parse(JSON.stringify(meeting)),
    };
  }

  public getPublicNominationState(token: string): PublicNominationState {
    const found = this.getNominationConfigByToken(token);
    if (!found) {
      return {
        valid: false,
        status: 'NOT_FOUND',
        meetingName: '',
        deadline: null,
        departments: [],
        error: 'Link de indicações não encontrado.',
      };
    }

    const { config, meeting } = found;
    const nominationCommissionName = meeting.nominationCommissionName || meeting.ataContent?.commissionName;

    if (!config.enabled) {
      return {
        valid: false,
        status: 'DISABLED',
        meetingName: meeting.name,
        nominationCommissionName,
        deadline: config.deadline,
        departments: [],
        error: 'O módulo de indicações está desativado para esta reunião.',
      };
    }

    if (config.status !== 'OPEN') {
      return {
        valid: false,
        status: 'CLOSED',
        meetingName: meeting.name,
        nominationCommissionName,
        deadline: config.deadline,
        departments: [],
        error: 'As indicações não estão abertas no momento.',
      };
    }

    if (config.deadline && new Date(config.deadline).getTime() <= Date.now()) {
      return {
        valid: false,
        status: 'EXPIRED',
        meetingName: meeting.name,
        nominationCommissionName,
        deadline: config.deadline,
        departments: [],
        error: 'O prazo para envio de indicações já expirou.',
      };
    }

    const activeDepartments = config.departments
      .filter((d) => d.enabled)
      .map((d) => ({
        departmentId: d.departmentId,
        name: d.name,
        maxPerPerson: d.maxPerPerson,
      }));

    return {
      valid: true,
      status: 'OPEN',
      meetingName: meeting.name,
      nominationCommissionName,
      deadline: config.deadline,
      departments: activeDepartments,
    };
  }

  public getConfirmedNominationsNomineesMap(meetingId: string): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    try {
      const ata = this.getOrGenerateMeetingAta(meetingId);
      if (ata && Array.isArray(ata.departments)) {
        for (const dept of ata.departments) {
          if (!dept.departmentId) continue;
          const deptIdKey = dept.departmentId.trim().toLowerCase();
          let set = map.get(deptIdKey);
          if (!set) {
            set = new Set<string>();
            map.set(deptIdKey, set);
          }
          if (dept.departmentName) {
            const nameKey = dept.departmentName.trim().toLowerCase();
            if (!map.has(nameKey)) {
              map.set(nameKey, set);
            }
          }
          if (dept.titularName && typeof dept.titularName === 'string') {
            const clean = dept.titularName.trim().replace(/\s+/g, ' ');
            if (clean) set.add(clean.toLowerCase());
          }
          if (Array.isArray(dept.associates)) {
            for (const a of dept.associates) {
              if (a && typeof a === 'string') {
                const clean = a.trim().replace(/\s+/g, ' ');
                if (clean) set.add(clean.toLowerCase());
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[getConfirmedNominationsNomineesMap] Error:', err);
    }
    return map;
  }

  public getNominationAdminSummary(meetingId: string): NominationAdminSummary | null {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) return null;

    const config = this.getOrCreateNominationConfig(meetingId);
    const nominations = (this.data.nominations || []).filter((n) => n.meetingId === meetingId);

    const totalNominations = nominations.length;
    const distinctNominees = new Set(
      nominations.map((n) => n.nomineeName.trim().toLowerCase())
    );

    // Filter public nominations exclusively for distinct participants count
    const publicNominations = nominations.filter(
      (n) =>
        n.source !== 'ADMIN' &&
        !n.nominatorSessionId?.startsWith('admin_manual_')
    );

    const distinctParticipants = new Set(
      publicNominations.map((n) => n.nominatorSessionId).filter(Boolean)
    );

    const departmentStats: NominationDepartmentStats[] = config.departments.map((dept) => {
      const deptNominations = nominations.filter((n) => n.departmentId === dept.departmentId);
      const distinctDeptNominees = new Set(
        deptNominations.map((n) => n.nomineeName.trim().toLowerCase())
      );
      return {
        departmentId: dept.departmentId,
        departmentName: dept.name,
        enabled: dept.enabled,
        maxPerPerson: dept.maxPerPerson,
        totalNominations: deptNominations.length,
        distinctNomineesCount: distinctDeptNominees.size,
      };
    });

    const confirmedMap = this.getConfirmedNominationsNomineesMap(meetingId);
    const confirmedNomineesObj: Record<string, string[]> = {};
    for (const [deptKey, set] of confirmedMap.entries()) {
      confirmedNomineesObj[deptKey] = Array.from(set);
    }

    return {
      config,
      totalNominations,
      distinctNomineesCount: distinctNominees.size,
      distinctParticipantsCount: distinctParticipants.size,
      departmentStats,
      confirmedNominees: confirmedNomineesObj,
    };
  }

  public async addManualNomination(params: {
    meetingId: string;
    departmentId: string;
    nomineeName: string;
  }): Promise<NominationRecord> {
    const meeting = this.getMeetingById(params.meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    const config = this.getOrCreateNominationConfig(params.meetingId);
    const dept = config.departments.find((d) => d.departmentId === params.departmentId);
    if (!dept) {
      throw new Error('Departamento não encontrado nesta reunião.');
    }
    if (!dept.enabled) {
      throw new Error('Este departamento está desabilitado nesta reunião.');
    }

    const cleanName = (params.nomineeName || '').trim();
    if (!cleanName) {
      throw new Error('Informe o nome da pessoa indicada.');
    }
    if (cleanName.length > 100) {
      throw new Error('O nome excede o limite de 100 caracteres.');
    }

    const now = new Date().toISOString();
    const newRecord: NominationRecord = {
      id: 'nomrec_' + crypto.randomBytes(16).toString('hex'),
      meetingId: params.meetingId,
      departmentId: params.departmentId,
      nomineeName: cleanName,
      nominatorSessionId: 'admin_manual_' + crypto.randomBytes(8).toString('hex'),
      nominatorName: 'Administrador',
      source: 'ADMIN',
      createdAt: now,
      updatedAt: now,
    };

    // Await durable Firestore write before mutating memory
    await firestoreService.saveEntity('nominations', newRecord.id, newRecord);

    if (!this.data.nominations) {
      this.data.nominations = [];
    }

    this.data.nominations.push(newRecord);
    this.saveLocal();

    return JSON.parse(JSON.stringify(newRecord));
  }

  public async updateNominationRecord(params: {
    meetingId: string;
    nominationId: string;
    nomineeName: string;
  }): Promise<NominationRecord> {
    if (!this.data.nominations) {
      this.data.nominations = [];
    }

    const record = this.data.nominations.find(
      (n) => n.id === params.nominationId && n.meetingId === params.meetingId
    );

    if (!record) {
      throw new Error('Indicação não encontrada nesta reunião.');
    }

    const cleanName = (params.nomineeName || '').trim();
    if (!cleanName) {
      throw new Error('O nome da indicação não pode ficar vazio.');
    }
    if (cleanName.length > 100) {
      throw new Error('O nome excede o limite de 100 caracteres.');
    }

    const updatedRecord = {
      ...record,
      nomineeName: cleanName,
      updatedAt: new Date().toISOString(),
    };

    await firestoreService.saveEntity('nominations', record.id, updatedRecord);

    record.nomineeName = cleanName;
    record.updatedAt = updatedRecord.updatedAt;

    this.saveLocal();
    return JSON.parse(JSON.stringify(record));
  }

  public async deleteNominationRecord(meetingId: string, nominationId: string): Promise<boolean> {
    if (!this.data.nominations) {
      this.data.nominations = [];
    }

    const idx = this.data.nominations.findIndex(
      (n) => n.id === nominationId && n.meetingId === meetingId
    );

    if (idx === -1) {
      throw new Error('Indicação não encontrada nesta reunião.');
    }

    await firestoreService.deleteEntity('nominations', nominationId);

    this.data.nominations.splice(idx, 1);
    this.saveLocal();
    return true;
  }

  public getNominationsByMeeting(meetingId: string, departmentId?: string): NominationRecord[] {
    return (this.data.nominations || [])
      .filter((n) => {
        if (n.meetingId !== meetingId) return false;
        if (departmentId && n.departmentId !== departmentId) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async createOrGetParticipantSession(params: {
    publicToken: string;
    nominatorName: string;
    existingSessionId?: string;
  }): Promise<{ sessionId: string; nominatorName: string }> {
    const found = this.getNominationConfigByToken(params.publicToken);
    if (!found) {
      throw new Error('Link de indicações não encontrado.');
    }
    const { config, meeting } = found;
    if (!config.enabled) {
      throw new Error('O módulo de indicações está desativado para esta reunião.');
    }
    if (config.status !== 'OPEN') {
      throw new Error('As indicações não estão abertas no momento.');
    }
    if (config.deadline && new Date(config.deadline).getTime() <= Date.now()) {
      const err = new Error('Este período de indicações foi encerrado.');
      (err as any).status = 'EXPIRED';
      throw err;
    }

    const cleanName = (params.nominatorName || '').trim();
    if (!cleanName) {
      throw new Error('Informe seu nome para continuar.');
    }
    if (cleanName.length > 100) {
      throw new Error('Nome excede o limite de 100 caracteres.');
    }

    let sessionId = params.existingSessionId?.trim();
    if (!sessionId || !sessionId.startsWith('nomsess_')) {
      sessionId = 'nomsess_' + crypto.randomBytes(16).toString('hex');
    }

    // Register / update session in this.data.participantSessions (PARTE 8)
    if (!this.data.participantSessions) {
      this.data.participantSessions = [];
    }
    const now = new Date().toISOString();
    let sessRec = this.data.participantSessions.find(
      (s) => s.meetingId === meeting.id && s.sessionId === sessionId
    );
    if (!sessRec) {
      sessRec = {
        sessionId,
        meetingId: meeting.id,
        nominatorName: cleanName,
        createdAt: now,
        updatedAt: now,
        finalized: false,
      };
      await firestoreService.saveEntity('participantSessions', sessRec.sessionId, sessRec);
      this.data.participantSessions.push(sessRec);
      this.saveLocal();
    } else {
      if (cleanName && sessRec.nominatorName !== cleanName) {
        sessRec.nominatorName = cleanName;
        sessRec.updatedAt = now;
        await firestoreService.saveEntity('participantSessions', sessRec.sessionId, sessRec);
        this.saveLocal();
      }
    }

    return { sessionId, nominatorName: cleanName };
  }

  public async finalizeParticipantSession(params: {
    publicToken: string;
    sessionId: string;
    nominatorName?: string;
  }): Promise<{ success: boolean; sessionId: string; nominatorName: string; finalized: boolean; updatedAt: string }> {
    const found = this.getNominationConfigByToken(params.publicToken);
    if (!found) {
      throw new Error('Link de indicações não encontrado.');
    }
    const { meeting } = found;
    const cleanSessionId = (params.sessionId || '').trim();
    if (!cleanSessionId) {
      throw new Error('Sessão inválida.');
    }

    if (!this.data.participantSessions) {
      this.data.participantSessions = [];
    }
    const now = new Date().toISOString();
    let sessRec = this.data.participantSessions.find(
      (s) => s.meetingId === meeting.id && s.sessionId === cleanSessionId
    );
    const cleanName = (params.nominatorName || '').trim();
    if (!sessRec) {
      sessRec = {
        sessionId: cleanSessionId,
        meetingId: meeting.id,
        nominatorName: cleanName || 'Participante',
        createdAt: now,
        updatedAt: now,
        finalized: true,
      };
      await firestoreService.saveEntity('participantSessions', sessRec.sessionId, sessRec);
      this.data.participantSessions.push(sessRec);
    } else {
      sessRec.finalized = true;
      sessRec.updatedAt = now;
      if (cleanName) {
        sessRec.nominatorName = cleanName;
      }
      await firestoreService.saveEntity('participantSessions', sessRec.sessionId, sessRec);
    }
    this.saveLocal();

    return {
      success: true,
      sessionId: sessRec.sessionId,
      nominatorName: sessRec.nominatorName,
      finalized: true,
      updatedAt: sessRec.updatedAt,
    };
  }

  public getParticipantNominations(publicToken: string, sessionId: string): {
    sessionId: string;
    nominatorName: string;
    nominations: Record<string, string[]>;
    updatedAt?: string;
  } {
    const found = this.getNominationConfigByToken(publicToken);
    if (!found) {
      throw new Error('Link de indicações não encontrado.');
    }
    const { meeting } = found;

    const sessionNominations = (this.data.nominations || []).filter(
      (n) => n.meetingId === meeting.id && n.nominatorSessionId === sessionId
    );

    const nominationsMap: Record<string, string[]> = {};
    let nominatorName = '';
    let latestUpdatedAt = '';

    for (const record of sessionNominations) {
      if (!nominationsMap[record.departmentId]) {
        nominationsMap[record.departmentId] = [];
      }
      nominationsMap[record.departmentId].push(record.nomineeName);
      if (record.nominatorName && !nominatorName) {
        nominatorName = record.nominatorName;
      }
      if (!latestUpdatedAt || record.updatedAt > latestUpdatedAt) {
        latestUpdatedAt = record.updatedAt;
      }
    }

    return {
      sessionId,
      nominatorName,
      nominations: nominationsMap,
      updatedAt: latestUpdatedAt || undefined,
    };
  }

  public async saveParticipantNominations(params: {
    publicToken: string;
    sessionId: string;
    nominatorName: string;
    departmentId?: string;
    nomineeNames?: string[];
    nominations?: Record<string, string[]>;
    finalized?: boolean;
  }): Promise<{ savedCount: number; updatedAt: string; departmentId?: string; savedNames?: string[] }> {
    const found = this.getNominationConfigByToken(params.publicToken);
    if (!found) {
      throw new Error('Link de indicações não encontrado.');
    }
    const { config, meeting } = found;

    if (!config.enabled) {
      throw new Error('O módulo de indicações está desativado para esta reunião.');
    }
    if (config.status !== 'OPEN') {
      throw new Error('As indicações estão encerradas no momento.');
    }
    if (config.deadline && new Date(config.deadline).getTime() <= Date.now()) {
      const err = new Error('Este período de indicações foi encerrado.');
      (err as any).status = 'EXPIRED';
      throw err;
    }

    const cleanSessionId = (params.sessionId || '').trim();
    if (!cleanSessionId || cleanSessionId.length < 10) {
      throw new Error('Sessão de participante inválida.');
    }

    const cleanNominatorName = (params.nominatorName || '').trim();
    if (!cleanNominatorName) {
      throw new Error('Informe seu nome para registrar suas indicações.');
    }
    if (cleanNominatorName.length > 100) {
      throw new Error('Nome excede o limite de 100 caracteres.');
    }

    const deptConfigMap = new Map(config.departments.map((d) => [d.departmentId, d]));
    const now = new Date().toISOString();

    // Register / update session in this.data.participantSessions
    if (!this.data.participantSessions) {
      this.data.participantSessions = [];
    }
    let sessRec = this.data.participantSessions.find(
      (s) => s.meetingId === meeting.id && s.sessionId === cleanSessionId
    );
    if (!sessRec) {
      sessRec = {
        sessionId: cleanSessionId,
        meetingId: meeting.id,
        nominatorName: cleanNominatorName,
        createdAt: now,
        updatedAt: now,
        finalized: Boolean(params.finalized),
      };
      this.data.participantSessions.push(sessRec);
    } else {
      sessRec.updatedAt = now;
      if (cleanNominatorName) {
        sessRec.nominatorName = cleanNominatorName;
      }
      if (params.finalized !== undefined) {
        sessRec.finalized = Boolean(params.finalized);
      }
    }

    if (!this.data.nominations) {
      this.data.nominations = [];
    }

    // CASE 1: Single Department Saving (Independent per-department flow)
    if (params.departmentId) {
      const targetDeptId = params.departmentId.trim();
      const deptConfig = deptConfigMap.get(targetDeptId);
      if (!deptConfig || !deptConfig.enabled) {
        throw new Error(`Departamento "${targetDeptId}" não está habilitado para esta reunião.`);
      }

      const rawList = Array.isArray(params.nomineeNames) ? params.nomineeNames : [];
      const seen = new Set<string>();
      const validNames: string[] = [];

      for (const item of rawList) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        if (!trimmed) continue;
        const normalized = trimmed.toLowerCase();
        if (seen.has(normalized)) {
          throw new Error(`O nome "${trimmed}" foi informado em duplicidade neste departamento.`);
        }
        seen.add(normalized);
        validNames.push(trimmed);
      }

      if (validNames.length > deptConfig.maxPerPerson) {
        throw new Error(
          `O departamento "${deptConfig.name}" permite no máximo ${deptConfig.maxPerPerson} indicação(ões) por pessoa. Você enviou ${validNames.length}.`
        );
      }

      const newDeptRecords: NominationRecord[] = validNames.map((name) => ({
        id: 'nomrec_' + crypto.randomBytes(16).toString('hex'),
        meetingId: meeting.id,
        departmentId: targetDeptId,
        nomineeName: name,
        nominatorSessionId: cleanSessionId,
        nominatorName: cleanNominatorName,
        createdAt: now,
        updatedAt: now,
      }));

      const oldRecords = this.data.nominations.filter(
        (n) =>
          n.meetingId === meeting.id &&
          n.nominatorSessionId === cleanSessionId &&
          n.departmentId === targetDeptId
      );
      const oldIds = oldRecords.map((r) => r.id);

      // Await durable Firestore writes before updating in-memory state
      await firestoreService.saveEntity('participantSessions', sessRec.sessionId, sessRec);
      if (oldIds.length) {
        await firestoreService.batchDelete('nominations', oldIds);
      }
      if (newDeptRecords.length) {
        await firestoreService.batchSave(
          'nominations',
          newDeptRecords.map((r) => ({ id: r.id, data: r }))
        );
      }

      // Replace previous records ONLY for this specific department and session in this meeting
      this.data.nominations = this.data.nominations.filter(
        (n) =>
          !(
            n.meetingId === meeting.id &&
            n.nominatorSessionId === cleanSessionId &&
            n.departmentId === targetDeptId
          )
      );

      this.data.nominations.push(...newDeptRecords);
      this.saveLocal();

      return {
        savedCount: newDeptRecords.length,
        updatedAt: now,
        departmentId: targetDeptId,
        savedNames: validNames,
      };
    }

    // CASE 2: Bulk Multi-department Map (Backward compatibility)
    if (!params.nominations || typeof params.nominations !== 'object') {
      throw new Error('Estrutura de indicações inválida.');
    }

    const newRecords: NominationRecord[] = [];

    for (const [deptId, rawList] of Object.entries(params.nominations)) {
      if (!Array.isArray(rawList)) continue;
      const deptConfig = deptConfigMap.get(deptId);
      if (!deptConfig || !deptConfig.enabled) {
        if (rawList.length > 0) {
          throw new Error(`Departamento "${deptId}" não está habilitado para esta reunião.`);
        }
        continue;
      }

      const seen = new Set<string>();
      const validNames: string[] = [];

      for (const item of rawList) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        if (!trimmed) continue;
        const normalized = trimmed.toLowerCase();
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        validNames.push(trimmed);
      }

      if (validNames.length > deptConfig.maxPerPerson) {
        throw new Error(
          `O departamento "${deptConfig.name}" permite no máximo ${deptConfig.maxPerPerson} indicação(ões) por pessoa. Você enviou ${validNames.length}.`
        );
      }

      for (const name of validNames) {
        newRecords.push({
          id: 'nomrec_' + crypto.randomBytes(16).toString('hex'),
          meetingId: meeting.id,
          departmentId: deptId,
          nomineeName: name,
          nominatorSessionId: cleanSessionId,
          nominatorName: cleanNominatorName,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const oldRecords = this.data.nominations.filter(
      (n) => n.meetingId === meeting.id && n.nominatorSessionId === cleanSessionId
    );
    const oldIds = oldRecords.map((r) => r.id);

    // Await durable Firestore writes
    await firestoreService.saveEntity('participantSessions', sessRec.sessionId, sessRec);
    if (oldIds.length) {
      await firestoreService.batchDelete('nominations', oldIds);
    }
    if (newRecords.length) {
      await firestoreService.batchSave(
        'nominations',
        newRecords.map((r) => ({ id: r.id, data: r }))
      );
    }

    // Replace previous records for this session in this meeting
    this.data.nominations = this.data.nominations.filter(
      (n) => !(n.meetingId === meeting.id && n.nominatorSessionId === cleanSessionId)
    );

    this.data.nominations.push(...newRecords);
    this.saveLocal();

    return {
      savedCount: newRecords.length,
      updatedAt: now,
    };
  }

  public getSelectedNomineesByMeeting(meetingId: string): SelectedNominee[] {
    if (!this.data.selectedNominees) {
      this.data.selectedNominees = [];
    }
    return this.data.selectedNominees
      .filter((s) => s.meetingId === meetingId)
      .map((s) => JSON.parse(JSON.stringify(s)));
  }

  public async addSelectedNominee(params: {
    meetingId: string;
    departmentId: string;
    nomineeName: string;
    selectedBy: string;
  }): Promise<SelectedNominee> {
    const meeting = this.getMeetingById(params.meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    const config = this.getOrCreateNominationConfig(params.meetingId);
    const dept = config.departments.find((d) => d.departmentId === params.departmentId);
    if (!dept) {
      throw new Error('Departamento não encontrado nesta reunião.');
    }
    if (!dept.enabled) {
      throw new Error('Não é possível selecionar nomes em um departamento desabilitado.');
    }

    const cleanName = (params.nomineeName || '').trim();
    if (!cleanName) {
      throw new Error('Nome do candidato não pode ser vazio.');
    }
    if (cleanName.length > 100) {
      throw new Error('Nome excede o limite de 100 caracteres.');
    }

    if (!this.data.selectedNominees) {
      this.data.selectedNominees = [];
    }

    const normalizedNew = cleanName.toLowerCase();
    const existing = this.data.selectedNominees.find(
      (s) =>
        s.meetingId === params.meetingId &&
        s.departmentId === params.departmentId &&
        s.nomineeName.trim().toLowerCase() === normalizedNew
    );

    if (existing) {
      return JSON.parse(JSON.stringify(existing));
    }

    const now = new Date().toISOString();
    const newRecord: SelectedNominee = {
      id: 'selnom_' + crypto.randomBytes(16).toString('hex'),
      meetingId: params.meetingId,
      departmentId: params.departmentId,
      nomineeName: cleanName,
      selectedBy: params.selectedBy,
      createdAt: now,
      updatedAt: now,
    };

    // Await durable Firestore write before updating memory
    await firestoreService.saveEntity('selectedNominees', newRecord.id, newRecord);

    this.data.selectedNominees.push(newRecord);
    this.saveLocal();

    return JSON.parse(JSON.stringify(newRecord));
  }

  public async removeSelectedNominee(meetingId: string, selectionId: string): Promise<boolean> {
    if (!this.data.selectedNominees) {
      this.data.selectedNominees = [];
    }

    const idx = this.data.selectedNominees.findIndex(
      (s) => s.id === selectionId && s.meetingId === meetingId
    );

    if (idx === -1) {
      throw new Error('Seleção não encontrada nesta reunião.');
    }

    await firestoreService.deleteEntity('selectedNominees', selectionId);

    this.data.selectedNominees.splice(idx, 1);
    this.saveLocal();
    return true;
  }

  public async removeSelectedNomineeByName(params: {
    meetingId: string;
    departmentId: string;
    nomineeName: string;
  }): Promise<boolean> {
    if (!this.data.selectedNominees) {
      this.data.selectedNominees = [];
    }

    const normalized = params.nomineeName.trim().toLowerCase();
    const idx = this.data.selectedNominees.findIndex(
      (s) =>
        s.meetingId === params.meetingId &&
        s.departmentId === params.departmentId &&
        s.nomineeName.trim().toLowerCase() === normalized
    );

    if (idx !== -1) {
      const target = this.data.selectedNominees[idx];
      await firestoreService.deleteEntity('selectedNominees', target.id);
      this.data.selectedNominees.splice(idx, 1);
      this.saveLocal();
    }

    return true;
  }

  public async batchSelectDepartmentNominees(params: {
    meetingId: string;
    departmentId: string;
    nomineeNames: string[];
    selectedBy: string;
  }): Promise<SelectedNominee[]> {
    const meeting = this.getMeetingById(params.meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    const config = this.getOrCreateNominationConfig(params.meetingId);
    const dept = config.departments.find((d) => d.departmentId === params.departmentId);
    if (!dept) {
      throw new Error('Departamento não encontrado nesta reunião.');
    }
    if (!dept.enabled) {
      throw new Error('Não é possível selecionar nomes em um departamento desabilitado.');
    }

    if (!this.data.selectedNominees) {
      this.data.selectedNominees = [];
    }

    const now = new Date().toISOString();
    const toAdd: SelectedNominee[] = [];

    for (const name of params.nomineeNames) {
      const cleanName = (name || '').trim();
      if (!cleanName || cleanName.length > 100) continue;

      const normalized = cleanName.toLowerCase();
      const existing = this.data.selectedNominees.find(
        (s) =>
          s.meetingId === params.meetingId &&
          s.departmentId === params.departmentId &&
          s.nomineeName.trim().toLowerCase() === normalized
      );

      if (!existing && !toAdd.some((t) => t.nomineeName.toLowerCase() === normalized)) {
        toAdd.push({
          id: 'selnom_' + crypto.randomBytes(16).toString('hex'),
          meetingId: params.meetingId,
          departmentId: params.departmentId,
          nomineeName: cleanName,
          selectedBy: params.selectedBy,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (toAdd.length > 0) {
      await firestoreService.batchSave(
        'selectedNominees',
        toAdd.map((item) => ({ id: item.id, data: item }))
      );
      this.data.selectedNominees.push(...toAdd);
      this.saveLocal();
    }

    return this.getSelectedNomineesByMeeting(params.meetingId);
  }

  public async batchDeselectDepartmentNominees(params: {
    meetingId: string;
    departmentId: string;
  }): Promise<SelectedNominee[]> {
    if (!this.data.selectedNominees) {
      this.data.selectedNominees = [];
    }

    const toDelete = this.data.selectedNominees.filter(
      (s) => s.meetingId === params.meetingId && s.departmentId === params.departmentId
    );
    const toDeleteIds = toDelete.map((s) => s.id);

    if (toDeleteIds.length > 0) {
      await firestoreService.batchDelete('selectedNominees', toDeleteIds);
      this.data.selectedNominees = this.data.selectedNominees.filter(
        (s) => !(s.meetingId === params.meetingId && s.departmentId === params.departmentId)
      );
      this.saveLocal();
    }

    return this.getSelectedNomineesByMeeting(params.meetingId);
  }

  // --- Custom Department Management (PARTE 10-15) ---

  public async addCustomDepartment(
    meetingId: string,
    name: string,
    maxPerPerson: number
  ): Promise<NominationMeetingConfig> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }
    const cleanName = (name || '').trim();
    if (!cleanName) {
      throw new Error('O nome do departamento é obrigatório.');
    }
    if (cleanName.length > 100) {
      throw new Error('O nome do departamento não pode exceder 100 caracteres.');
    }

    const limit = Math.max(1, Math.floor(Number(maxPerPerson) || 1));
    const config = this.getOrCreateNominationConfig(meetingId);

    const nameLower = cleanName.toLowerCase();
    const existing = config.departments.find((d) => d.name.trim().toLowerCase() === nameLower);
    if (existing) {
      throw new Error(`Já existe um departamento chamado "${existing.name}" nesta reunião.`);
    }

    const deptId = 'dept_custom_' + crypto.randomBytes(8).toString('hex');
    const newDept = {
      departmentId: deptId,
      name: cleanName,
      enabled: true,
      maxPerPerson: limit,
      isCustom: true,
    };

    config.departments.push(newDept);
    config.updatedAt = new Date().toISOString();

    await firestoreService.saveEntity('nominationConfigs', meetingId, config);

    const idx = (this.data.nominationConfigs || []).findIndex((c) => c.meetingId === meetingId);
    if (idx !== -1 && this.data.nominationConfigs) {
      this.data.nominationConfigs[idx] = config;
    }
    this.saveLocal();
    return JSON.parse(JSON.stringify(config));
  }

  public async updateDepartment(
    meetingId: string,
    departmentId: string,
    updates: {
      name?: string;
      maxPerPerson?: number;
      enabled?: boolean;
    }
  ): Promise<NominationMeetingConfig> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    const config = this.getOrCreateNominationConfig(meetingId);
    const dept = config.departments.find((d) => d.departmentId === departmentId);
    if (!dept) {
      throw new Error('Departamento não encontrado nesta reunião.');
    }

    if (updates.name !== undefined) {
      const cleanName = updates.name.trim();
      if (!cleanName) {
        throw new Error('O nome do departamento não pode ser vazio.');
      }
      if (cleanName.length > 100) {
        throw new Error('O nome do departamento não pode exceder 100 caracteres.');
      }
      const nameLower = cleanName.toLowerCase();
      const collision = config.departments.find(
        (d) => d.departmentId !== departmentId && d.name.trim().toLowerCase() === nameLower
      );
      if (collision) {
        throw new Error(`Já existe outro departamento chamado "${collision.name}" nesta reunião.`);
      }
      dept.name = cleanName;
    }

    if (updates.maxPerPerson !== undefined) {
      const limit = Math.max(0, Math.floor(Number(updates.maxPerPerson) || 0));
      dept.maxPerPerson = limit;
    }

    if (updates.enabled !== undefined) {
      dept.enabled = Boolean(updates.enabled);
    }

    config.updatedAt = new Date().toISOString();

    await firestoreService.saveEntity('nominationConfigs', meetingId, config);

    const idx = (this.data.nominationConfigs || []).findIndex((c) => c.meetingId === meetingId);
    if (idx !== -1 && this.data.nominationConfigs) {
      this.data.nominationConfigs[idx] = config;
    }
    this.saveLocal();
    return JSON.parse(JSON.stringify(config));
  }

  public async deleteOrDisableDepartment(
    meetingId: string,
    departmentId: string,
    forceDisableOnly?: boolean
  ): Promise<{
    success: boolean;
    action: 'DELETED' | 'DISABLED';
    message: string;
    config: NominationMeetingConfig;
    hasData: boolean;
  }> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    const config = this.getOrCreateNominationConfig(meetingId);
    const deptIndex = config.departments.findIndex((d) => d.departmentId === departmentId);
    if (deptIndex === -1) {
      throw new Error('Departamento não encontrado nesta reunião.');
    }

    const dept = config.departments[deptIndex];

    const hasNominations = (this.data.nominations || []).some(
      (n) => n.meetingId === meetingId && n.departmentId === departmentId
    );
    const hasSelections = (this.data.selectedNominees || []).some(
      (s) => s.meetingId === meetingId && s.departmentId === departmentId
    );
    const hasData = hasNominations || hasSelections;

    if (hasData || forceDisableOnly) {
      // Safely disable department without deleting historical data
      dept.enabled = false;
      config.updatedAt = new Date().toISOString();

      await firestoreService.saveEntity('nominationConfigs', meetingId, config);

      const idx = (this.data.nominationConfigs || []).findIndex((c) => c.meetingId === meetingId);
      if (idx !== -1 && this.data.nominationConfigs) {
        this.data.nominationConfigs[idx] = config;
      }
      this.saveLocal();
      return {
        success: true,
        action: 'DISABLED',
        message: 'O departamento possui dados vinculados e foi desativado para preservar o histórico.',
        config: JSON.parse(JSON.stringify(config)),
        hasData: true,
      };
    }

    // Has NO nominations and NO selections -> safe to delete completely from this meeting
    config.departments.splice(deptIndex, 1);
    config.updatedAt = new Date().toISOString();

    await firestoreService.saveEntity('nominationConfigs', meetingId, config);

    const idx = (this.data.nominationConfigs || []).findIndex((c) => c.meetingId === meetingId);
    if (idx !== -1 && this.data.nominationConfigs) {
      this.data.nominationConfigs[idx] = config;
    }
    this.saveLocal();

    return {
      success: true,
      action: 'DELETED',
      message: 'Departamento excluído com sucesso desta reunião.',
      config: JSON.parse(JSON.stringify(config)),
      hasData: false,
    };
  }

  // --- Expected Participants & Tracking (PARTE 20-28) ---

  public getExpectedParticipants(meetingId: string): ExpectedParticipant[] {
    return (this.data.expectedParticipants || [])
      .filter((p) => p.meetingId === meetingId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  public async addExpectedParticipants(meetingId: string, names: string[]): Promise<ExpectedParticipant[]> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    if (!this.data.expectedParticipants) {
      this.data.expectedParticipants = [];
    }

    const currentList = this.data.expectedParticipants.filter((p) => p.meetingId === meetingId);
    const currentNormalized = new Set(
      currentList.map((p) =>
        p.name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      )
    );

    const now = new Date().toISOString();
    const created: ExpectedParticipant[] = [];

    for (const raw of names) {
      if (typeof raw !== 'string') continue;
      const clean = raw.trim();
      if (!clean || clean.length > 100) continue;
      const norm = clean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (currentNormalized.has(norm)) continue;
      currentNormalized.add(norm);

      const record: ExpectedParticipant = {
        id: 'exppart_' + crypto.randomBytes(12).toString('hex'),
        meetingId,
        name: clean,
        createdAt: now,
      };

      created.push(record);
    }

    if (created.length > 0) {
      await firestoreService.batchSave(
        'expectedParticipants',
        created.map((c) => ({ id: c.id, data: c }))
      );
      this.data.expectedParticipants.push(...created);
      this.saveLocal();
    }

    return this.getExpectedParticipants(meetingId);
  }

  public async removeExpectedParticipant(meetingId: string, participantId: string): Promise<boolean> {
    if (!this.data.expectedParticipants) {
      this.data.expectedParticipants = [];
    }

    const idx = this.data.expectedParticipants.findIndex(
      (p) => p.id === participantId && p.meetingId === meetingId
    );
    if (idx === -1) {
      return false;
    }

    await firestoreService.deleteEntity('expectedParticipants', participantId);

    this.data.expectedParticipants.splice(idx, 1);
    this.saveLocal();
    return true;
  }

  public async clearExpectedParticipants(meetingId: string): Promise<boolean> {
    if (!this.data.expectedParticipants) {
      this.data.expectedParticipants = [];
      return true;
    }

    const toDelete = this.data.expectedParticipants.filter(
      (p) => p.meetingId === meetingId
    );
    const toDeleteIds = toDelete.map((p) => p.id);

    if (toDeleteIds.length > 0) {
      await firestoreService.batchDelete('expectedParticipants', toDeleteIds);
      this.data.expectedParticipants = this.data.expectedParticipants.filter(
        (p) => p.meetingId !== meetingId
      );
      this.saveLocal();
    }

    return true;
  }

  public getParticipantsTracking(meetingId: string): NominationParticipantsTracking {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    const config = this.getOrCreateNominationConfig(meetingId);
    const totalPossibleNominations = (config.departments || [])
      .filter((d) => d.enabled)
      .reduce((sum, d) => sum + (d.maxPerPerson || 1), 0);

    const expected = this.getExpectedParticipants(meetingId);
    // Consider EXCLUSIVELY public participant nominations (ignore ADMIN / manual nominations)
    const nominations = (this.data.nominations || []).filter(
      (n) =>
        n.meetingId === meetingId &&
        n.source !== 'ADMIN' &&
        !n.nominatorSessionId?.startsWith('admin_manual_')
    );

    // Group actual nominations by participant session
    const sessionsMap = new Map<
      string,
      {
        sessionId: string;
        name: string;
        lastActivity: string;
        count: number;
        departments: Set<string>;
        finalized?: boolean;
      }
    >();

    for (const nom of nominations) {
      const sId = nom.nominatorSessionId || nom.id;
      const existing = sessionsMap.get(sId);
      const activity = nom.updatedAt || nom.createdAt;
      const rawName = (nom.nominatorName || '').trim() || 'Participante';

      if (!existing) {
        sessionsMap.set(sId, {
          sessionId: sId,
          name: rawName,
          lastActivity: activity,
          count: 1,
          departments: new Set([nom.departmentId]),
          finalized: false,
        });
      } else {
        existing.count++;
        existing.departments.add(nom.departmentId);
        if (activity > existing.lastActivity) {
          existing.lastActivity = activity;
        }
        if (rawName && existing.name === 'Participante') {
          existing.name = rawName;
        }
      }
    }

    // Merge sessions that started even if 0 nominations yet (PARTE 8)
    const storedSessions = (this.data.participantSessions || []).filter(
      (s) => s.meetingId === meetingId
    );
    for (const s of storedSessions) {
      const existing = sessionsMap.get(s.sessionId);
      if (!existing) {
        sessionsMap.set(s.sessionId, {
          sessionId: s.sessionId,
          name: s.nominatorName || 'Participante',
          lastActivity: s.updatedAt || s.createdAt,
          count: 0,
          departments: new Set<string>(),
          finalized: Boolean(s.finalized),
        });
      } else {
        if (s.finalized) existing.finalized = true;
        if (s.nominatorName && existing.name === 'Participante') {
          existing.name = s.nominatorName;
        }
      }
    }

    const computeSessionProgress = (sess: { count: number; finalized?: boolean }) => {
      const submittedCount = sess.count;
      const percentage =
        totalPossibleNominations > 0
          ? Math.min(100, Math.round((submittedCount / totalPossibleNominations) * 100))
          : 0;

      let progressStatus: ParticipantProgressStatus = 'FILLING';
      if (sess.finalized) {
        progressStatus = 'SENT';
      } else if (submittedCount >= totalPossibleNominations && totalPossibleNominations > 0) {
        progressStatus = 'READY_TO_SEND';
      } else {
        progressStatus = 'FILLING';
      }

      return {
        submittedNominationsCount: submittedCount,
        totalPossibleNominations,
        percentage,
        progressStatus,
        finalized: Boolean(sess.finalized),
      };
    };

    const normalize = (str: string) =>
      str.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const matchedSessions = new Set<string>();
    const participatedList: NominationParticipantsTracking['participated'] = [];
    const pendingList: NominationParticipantsTracking['pending'] = [];
    const trackingList: NominationParticipantsTracking['participants'] = [];

    // 1. Process expected participants
    for (const exp of expected) {
      const expNorm = normalize(exp.name);
      let matchedSession: {
        sessionId: string;
        name: string;
        lastActivity: string;
        count: number;
        departments: Set<string>;
        finalized?: boolean;
      } | null = null;

      for (const sess of sessionsMap.values()) {
        if (!matchedSessions.has(sess.sessionId) && normalize(sess.name) === expNorm) {
          matchedSession = sess;
          matchedSessions.add(sess.sessionId);
          break;
        }
      }

      if (matchedSession) {
        const progress = computeSessionProgress(matchedSession);
        const item: ParticipantTrackingItem = {
          id: exp.id,
          sessionId: matchedSession.sessionId,
          name: exp.name,
          status: 'PARTICIPATED' as const,
          expected: true,
          lastActivity: matchedSession.lastActivity,
          submittedDepartmentsCount: matchedSession.departments.size,
          ...progress,
        };
        trackingList.push(item);
        participatedList.push(item);
      } else {
        const item: ParticipantTrackingItem = {
          id: exp.id,
          name: exp.name,
          status: 'PENDING' as const,
          expected: true,
          progressStatus: 'FILLING',
          percentage: 0,
          submittedNominationsCount: 0,
          totalPossibleNominations,
          finalized: false,
        };
        trackingList.push(item);
        pendingList.push(item);
      }
    }

    let unexpectedCount = 0;
    // 2. Process sessions that submitted/started but were NOT in the expected list
    for (const sess of sessionsMap.values()) {
      if (!matchedSessions.has(sess.sessionId)) {
        const progress = computeSessionProgress(sess);
        if (expected.length > 0) {
          unexpectedCount++;
          const item: ParticipantTrackingItem = {
            sessionId: sess.sessionId,
            name: sess.name,
            status: 'UNEXPECTED' as const,
            expected: false,
            lastActivity: sess.lastActivity,
            submittedDepartmentsCount: sess.departments.size,
            ...progress,
          };
          trackingList.push(item);
          participatedList.push(item);
        } else {
          // If no expected participants list was created, everyone who participated is a regular participant
          const item: ParticipantTrackingItem = {
            sessionId: sess.sessionId,
            name: sess.name,
            status: 'PARTICIPATED' as const,
            expected: false,
            lastActivity: sess.lastActivity,
            submittedDepartmentsCount: sess.departments.size,
            ...progress,
          };
          trackingList.push(item);
          participatedList.push(item);
        }
      }
    }

    const expectedCount = expected.length;
    // Count sessions with at least 1 nomination or finalized
    const participatedCount = Array.from(sessionsMap.values()).filter(
      (s) => s.count > 0 || s.finalized
    ).length;
    const pendingCount = pendingList.length;

    return {
      expectedCount,
      totalExpected: expectedCount,
      participatedCount,
      pendingCount,
      unexpectedCount,
      totalPossibleNominations,
      participated: participatedList,
      pending: pendingList,
      participants: trackingList,
    };
  }

  // --- ATA DA COMISSÃO DE NOMEAÇÕES ---

  /**
   * Determina com precisão se uma pauta pertence à Comissão Organizadora (e portanto NUNCA deve
   * alimentar a Ata da Comissão de Nomeações).
   */
  public isPollBelongingToOrganizingCommission(p: Poll, meetingId?: string): boolean {
    const targetMeetingId = meetingId || p.meetingId;
    const deptIdLower = (p.sourceDepartmentId || '').trim().toLowerCase();

    // 1. Explicit link to Comissão de Nomeações always stays in Comissão de Nomeações
    if (p.commissionType === 'NOMINATIONS') return false;
    if (deptIdLower && !deptIdLower.startsWith('org_')) return false;

    // 2. Explicit link to Comissão Organizadora
    if (p.commissionType === 'ORGANIZING') return true;
    if (p.sourceCriterionId) return true;
    if (deptIdLower.startsWith('org_')) return true;

    const qNorm = (p.question || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (qNorm.startsWith('comissao organizadora') || qNorm.includes('comissao organizadora')) {
      return true;
    }

    if (
      /quantidade\s+de\s+membros|numero\s+de\s+membros|proposta\s+d[ae]\s+(quantidade|membros?)|quantos\s+membros|quantidade\s+para\s+a\s+comissao|secretari[oa](\(a\))?\s+da\s+comissao\s+de\s+nomeac(oes|ao)/.test(
        qNorm
      )
    ) {
      return true;
    }

    if (
      p.options &&
      p.options.length > 0 &&
      p.options.every((opt) => /^\d{1,3}(\s+(membros?|integrantes?|pessoas?))?$/i.test(opt.text.trim()))
    ) {
      return true;
    }

    // 3. If it's a manual poll without sourceDepartmentId, check if it's an Organizing Commission
    // auxiliary poll (such as "Ordem" / choosing the Secretary among Organizing Commission nominees)
    if (!deptIdLower && targetMeetingId) {
      const commConfig = this.getOrCreateNominationConfig(targetMeetingId);
      const officialCatalog: Array<{ departmentId?: string; id?: string; name: string }> =
        commConfig.departments && commConfig.departments.length > 0
          ? commConfig.departments
          : CENTRAL_DEPARTMENT_CATALOG.map((d) => ({
              departmentId: d.id,
              id: d.id,
              name: d.name,
              enabled: true,
            }));

      const canon = resolveCanonicalDepartment(p.question, officialCatalog);
      // If the question does NOT match any official or custom department of Comissão de Nomeações (orderIndex >= 90000)
      if (canon.orderIndex >= 90000) {
        const orgNoms = (this.data.organizingNominations || []).filter(
          (n) => n.meetingId === targetMeetingId
        );
        const explicitOrgPolls = (this.data.polls || []).filter(
          (op) =>
            op.meetingId === targetMeetingId &&
            op.id !== p.id &&
            (op.commissionType === 'ORGANIZING' ||
              Boolean(op.sourceCriterionId) ||
              Boolean(op.sourceDepartmentId && op.sourceDepartmentId.toLowerCase().startsWith('org_')))
        );

        if (orgNoms.length > 0 || explicitOrgPolls.length > 0) {
          const orgCandidateNames = new Set<string>();
          for (const n of orgNoms) {
            const norm = (n.normalizedName || n.nomineeName || '')
              .trim()
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '');
            if (norm) orgCandidateNames.add(norm);
          }
          for (const op of explicitOrgPolls) {
            for (const o of op.options || []) {
              const norm = (o.text || '')
                .trim()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
              if (norm) orgCandidateNames.add(norm);
            }
          }

          const pollOpts = (p.options || [])
            .map((o) =>
              (o.text || '')
                .trim()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
            )
            .filter((t) => t.length > 0 && !APPROVAL_OPTION_WORDS.has(t));

          if (
            pollOpts.length > 0 &&
            pollOpts.every((optNorm) =>
              Array.from(orgCandidateNames).some(
                (orgName) =>
                  orgName === optNorm ||
                  orgName.startsWith(optNorm + ' ') ||
                  optNorm.startsWith(orgName + ' ')
              )
            )
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  public getOrGenerateMeetingAta(meetingId: string): AtaDocumentData {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    const meetingYear = new Date(meeting.createdAt).getFullYear() || new Date().getFullYear();

    // 1. Establish persistent ATA sequence and vote number
    if (!meeting.ataSequence || !meeting.ataVoteNumber || meeting.ataYear !== meetingYear) {
      const userMeetings = meeting.userId
        ? this.data.meetings.filter((m) => m.userId === meeting.userId)
        : this.data.meetings;

      const existingSeqs = userMeetings
        .filter((m) => m.ataYear === meetingYear && typeof m.ataSequence === 'number')
        .map((m) => m.ataSequence as number);

      const nextSeq = existingSeqs.length > 0 ? Math.max(...existingSeqs) + 1 : 1;
      const seqStr = String(nextSeq).padStart(3, '0');

      meeting.ataGenerated = true;
      meeting.ataVoteNumber = `${meetingYear}-${seqStr}`;
      meeting.ataYear = meetingYear;
      meeting.ataSequence = nextSeq;
      meeting.ataPeriod = String(meetingYear + 1);
      meeting.ataGeneratedAt = meeting.ataGeneratedAt || new Date().toISOString();
      this.save();
    }

    const voteNumber = meeting.ataVoteNumber!;
    const period = meeting.ataPeriod || String(meetingYear + 1);
    const commissionName = meeting.nominationCommissionName || meeting.ataContent?.commissionName;
    const voteCode = formatAtaVoteHeader(voteNumber, commissionName);
    const introText = `VOTADO aprovar e registrar o relatório da Comissão de Nomeações para o período ${period}, conforme detalhado abaixo:`;

    // 2. Identify all polls (excluding Organizing Commission polls) and helper to distinguish associate polls
    const rawMeetingPolls = this.getPollsByMeeting(meetingId);
    const excludedOrgPolls = rawMeetingPolls.filter((p) =>
      this.isPollBelongingToOrganizingCommission(p, meetingId)
    );
    const allPolls = rawMeetingPolls.filter(
      (p) => !this.isPollBelongingToOrganizingCommission(p, meetingId)
    );

    const isAssociateSubPoll = (p: Poll): boolean => {
      if (p.isAssociatePoll || Boolean(p.parentPollId)) return true;
      if (typeof p.question === 'string') {
        const q = p.question.trim().toUpperCase();
        if (
          q.startsWith('ASSOCIADOS -') ||
          q.startsWith('ASSOCIADOS –') ||
          q.startsWith('ASSOCIADO -') ||
          q.startsWith('ASSOCIADO –')
        ) {
          return true;
        }
      }
      return false;
    };

    const closedPolls = allPolls.filter((p) => p.status === 'CLOSED');
    const closedAllMainPolls = closedPolls.filter((p) => !isAssociateSubPoll(p));

    // Group main closed polls into families by rootPollId or id
    const rootFamilies = new Map<string, Poll[]>();
    for (const p of closedAllMainPolls) {
      const rootId = p.rootPollId || p.id;
      if (!rootFamilies.has(rootId)) {
        rootFamilies.set(rootId, []);
      }
      rootFamilies.get(rootId)!.push(p);
    }

    const closedAssociatePolls = closedPolls.filter((p) => isAssociateSubPoll(p));

    // Helpers for safe unequivocal department aliases and approval polls
    const APPROVAL_OPTION_WORDS = new Set([
      'sim', 'nao', 'não', 'aprovar', 'aprovado', 'rejeitar', 'rejeitado', 'abstencao', 'abstenção', 'branco', 'nulo'
    ]);

    const isApprovalPoll = (options: Option[]): boolean => {
      if (!options || options.length === 0) return false;
      return options.every((opt) => APPROVAL_OPTION_WORDS.has(opt.text.trim().toLowerCase()));
    };

    const extractNomineeFromApprovalQuestion = (question: string, deptName?: string): string | null => {
      let clean = question.trim();
      clean = clean.replace(/^(aprovação|aprovacao|votação|votacao|indicação|indicacao|nomeação|nomeacao)\s+(de|do|da|dos|das)?\s*/i, '');
      clean = clean.replace(/^(candidato\(a\)?|titular)\s*:\s*/i, '');
      if (clean.includes(':')) {
        const parts = clean.split(':').map((p) => p.trim());
        if (parts.length === 2) {
          if (deptName && parts[0].toLowerCase().includes(deptName.toLowerCase())) return parts[1];
          if (deptName && parts[1].toLowerCase().includes(deptName.toLowerCase())) return parts[0];
          return parts[1] || parts[0];
        }
      }
      if (clean.includes(' - ')) {
        const parts = clean.split(' - ').map((p) => p.trim());
        if (parts.length === 2) {
          if (deptName && parts[0].toLowerCase().includes(deptName.toLowerCase())) return parts[1];
          if (deptName && parts[1].toLowerCase().includes(deptName.toLowerCase())) return parts[0];
          return parts[0];
        }
      }
      if (deptName) {
        const regex = new RegExp(`\\b${deptName}\\b`, 'gi');
        const withoutDept = clean.replace(regex, '').replace(/\bpara\s+(o|a)?\b/gi, '').trim();
        if (withoutDept.length > 2) return withoutDept;
      }
      return clean.length > 0 ? clean : null;
    };

    const matchDepartmentAliasToCatalogId = (text: string): string | null => {
      const q = text.trim().toLowerCase();
      const qNorm = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (q.startsWith('org_') || qNorm.includes('comissao organizadora')) return null;
      if (q === 'tesouraria' || q.includes('tesourari') || q === 'tesoureiro' || q.includes('tesoureir')) return 'tesoureiro';
      if (q === 'secretaria' || q.includes('secretari') || q === 'secretário' || q === 'secretario' || q.includes('secretár')) return 'secretario';
      if (q.includes('ancião') || q.includes('anciao') || q.includes('ancionato')) return 'ancionato';
      if (q.includes('chefe dos diáconos') || q.includes('chefe dos diaconos') || q.includes('chefe de diáconos') || q.includes('chefe de diaconos')) return 'chefe_diaconos';
      if (q.includes('chefe das diaconisas') || q.includes('chefe de diaconisas')) return 'chefe_diaconisas';
      if (q.includes('diaconisa') && !q.includes('chefe')) return 'diaconisa';
      if (q.includes('diacon') && !q.includes('diaconis') && !q.includes('chefe')) return 'diacono';
      if (q.includes('escola sabatina')) return 'escola_sabatina';
      if (q.includes('pessoal') || q.includes('ministerio pessoal') || q.includes('ministério pessoal')) return 'ministerio_pessoal';
      if (q.includes('pequeno grupo') || q.includes('pequenos grupos') || q.includes('coordenador de pg') || q.includes('coordenador(a) de pg')) return 'coordenador_pg';
      if (q.includes('interessado')) return 'coordenador_interessados';
      if (q.includes('mordomia')) return 'ministerio_mordomia_crista';
      if (q.includes('publicações') || q.includes('publicacoes')) return 'ministerio_publicacoes';
      if (q.includes('visitação') || q.includes('visitacao')) return 'ministerio_visitacao';
      if (q.includes('conservação') || q.includes('conservacao')) return 'ministerio_conservacao';
      if (q.includes('espírito de profecia') || q.includes('espirito de profecia')) return 'coordenador_espirito_profecia';
      if (q.includes('oração') || q.includes('oracao')) return 'ministerio_oracao';
      if (q.includes('criança') || q.includes('crianca')) return 'ministerio_crianca';
      if (q.includes('adolescente')) return 'ministerio_adolescente';
      if (q.includes('jovem') || q.includes('jovens') || q.includes('ja')) return 'ministerio_jovem_adventista';
      if (q.includes('universitário') || q.includes('universitario')) return 'ministerio_universitarios';
      if (q.includes('desbravador')) return 'clube_desbravadores';
      if (q.includes('aventureiro')) return 'clube_aventureiros';
      if (q.includes('família') || q.includes('familia')) return 'ministerio_familia';
      if (q.includes('asa') || q.includes('ação solidária') || q.includes('acao solidaria')) return 'asa';
      if (q.includes('mulher') || q.includes('mulheres')) return 'ministerio_mulher';
      if (q.includes('homem') || q.includes('homens')) return 'ministerio_homens';
      if (q.includes('map') || q.includes('possibilidades')) return 'map';
      if (q.includes('recepção') || q.includes('recepcao')) return 'ministerio_recepcao';
      if (q.includes('saúde') || q.includes('saude')) return 'ministerio_saude';
      if (q.includes('comunicação') || q.includes('comunicacao')) return 'comunicacao';
      if (q.includes('sonoplasta') && !q.includes('sonoplastia')) return 'sonoplastas';
      if (q.includes('sonoplastia')) return 'sonoplastia';
      if (q.includes('música') || q.includes('musica')) return 'ministerio_musica';
      if (q.includes('liberdade religiosa') || q.includes('assuntos públicos') || q.includes('assuntos publicos')) return 'assuntos_publicos_liberdade_religiosa';
      return null;
    };

    // Official meeting catalog: single source of truth for official department ordering
    const commConfig = this.getOrCreateNominationConfig(meetingId);
    const officialCatalog: Array<{ departmentId?: string; id?: string; name: string }> =
      commConfig.departments && commConfig.departments.length > 0
        ? commConfig.departments
        : CENTRAL_DEPARTMENT_CATALOG.map((d) => ({ departmentId: d.id, id: d.id, name: d.name, enabled: true }));

    // 3. Extract and canonically group departments strictly by official canonical department ID
    interface CanonicalGroup {
      departmentId: string;
      departmentName: string;
      orderIndex: number;
      winners: string[];
      associates: string[];
      isExplicitlyConfirmed?: boolean;
    }

    const canonicalGroupsMap = new Map<string, CanonicalGroup>();

    const getOrCreateGroup = (canon: { departmentId: string; departmentName: string; orderIndex: number }): CanonicalGroup => {
      let group = canonicalGroupsMap.get(canon.departmentId);
      if (!group) {
        group = {
          departmentId: canon.departmentId,
          departmentName: canon.departmentName,
          orderIndex: canon.orderIndex,
          winners: [],
          associates: [],
          isExplicitlyConfirmed: false,
        };
        canonicalGroupsMap.set(canon.departmentId, group);
      }
      return group;
    };

    // Process all closed main poll families
    for (const [rootId, family] of rootFamilies.entries()) {
      // Sort family rounds chronologically: round 1, round 2...
      const chronRounds = [...family].sort((a, b) => (a.round || 1) - (b.round || 1));
      const latestClosedRound = chronRounds[chronRounds.length - 1];

      const canon = resolveCanonicalDepartment(
        latestClosedRound.sourceDepartmentId || latestClosedRound.question || chronRounds[0].sourceDepartmentId || chronRounds[0].question,
        officialCatalog
      );
      const group = getOrCreateGroup(canon);

      // Seat limit for this poll family
      const rootPollObj = allPolls.find((p) => p.id === rootId) || chronRounds[0];
      const initialSeats = Math.max(1, rootPollObj.maxChoices || 1);

      // Collect confirmed winners adhering strictly to ALTO-02
      const familyConfirmedNames: string[] = [];
      const familySeenLower = new Set<string>();
      let familyHasExplicitConfirmation = false;

      const addFamilyWinner = (name: string) => {
        const clean = (name || '').trim();
        if (!clean) return;
        const lower = clean.toLowerCase();
        if (APPROVAL_OPTION_WORDS.has(lower)) return;
        if (!familySeenLower.has(lower) && familyConfirmedNames.length < initialSeats) {
          familySeenLower.add(lower);
          familyConfirmedNames.push(clean);
        }
      };

      // Check if there is an active/waiting round in this family currently voting
      const inProgressRound = allPolls.find(
        (p) => (p.id === rootId || p.rootPollId === rootId) && (p.status === 'OPEN' || p.status === 'WAITING')
      );

      // 1. Earlier closed rounds (or all closed rounds if an in-progress round exists):
      // Only include candidates who have EXPLICIT administrative confirmation (confirmedWinnerNames or decisionAudit).
      // Never infer confirmation by absence from subsequent round ballots!
      const earlierRounds = inProgressRound
        ? chronRounds
        : chronRounds.slice(0, chronRounds.length - 1);

      for (const prevR of earlierRounds) {
        const explicitConfirmed = Array.isArray(prevR.confirmedWinnerNames) && prevR.confirmedWinnerNames.length > 0
          ? prevR.confirmedWinnerNames
          : Array.isArray(prevR.decisionAudit?.confirmedWinnersThisRound) && prevR.decisionAudit!.confirmedWinnersThisRound.length > 0
          ? prevR.decisionAudit!.confirmedWinnersThisRound
          : [];
        if (explicitConfirmed.length > 0) {
          familyHasExplicitConfirmation = true;
          for (const w of explicitConfirmed) {
            addFamilyWinner(w);
          }
        }
      }

      // 2. If NO round is in progress, process the latest closed round:
      if (!inProgressRound && chronRounds.length > 0) {
        const latestRound = chronRounds[chronRounds.length - 1];
        const isApproval = isApprovalPoll(latestRound.options);

        if (isApproval) {
          const calc = this.calculatePollResult(latestRound.id);
          if (calc && !calc.isTie) {
            const winningOpt = (calc.winnerOptionText || '').trim().toLowerCase();
            if (winningOpt === 'sim' || winningOpt === 'aprovar' || winningOpt === 'aprovado') {
              const extractedNominee = extractNomineeFromApprovalQuestion(latestRound.question, canon.departmentName);
              if (extractedNominee) {
                familyHasExplicitConfirmation = true;
                addFamilyWinner(extractedNominee);
              }
            }
          }
        } else {
          // If latest round already has explicit confirmations recorded, use them:
          const explicitConfirmed = Array.isArray(latestRound.confirmedWinnerNames) && latestRound.confirmedWinnerNames.length > 0
            ? latestRound.confirmedWinnerNames
            : Array.isArray(latestRound.decisionAudit?.confirmedWinnersThisRound) && latestRound.decisionAudit!.confirmedWinnersThisRound.length > 0
            ? latestRound.decisionAudit!.confirmedWinnersThisRound
            : null;

          if (explicitConfirmed && explicitConfirmed.length > 0) {
            familyHasExplicitConfirmation = true;
            for (const w of explicitConfirmed) {
              addFamilyWinner(w);
            }
          } else {
            // Latest round closed without a subsequent reopen:
            // Validated mathematical winners with strict absolute majority and without pending cutoff tie
            const calc = this.calculatePollResult(latestRound.id);
            if (calc) {
              if (Array.isArray(calc.winnerOptionTexts) && calc.winnerOptionTexts.length > 0) {
                for (const w of calc.winnerOptionTexts) {
                  addFamilyWinner(w);
                }
              } else if (!calc.isTie && calc.winnerOptionText) {
                addFamilyWinner(calc.winnerOptionText);
              }
            }
          }
        }
      }

      if (familyConfirmedNames.length > 0) {
        group.winners.push(...familyConfirmedNames);
      }
      if (familyHasExplicitConfirmation) {
        group.isExplicitlyConfirmed = true;
      }

      // Gather associates across all rounds of this family
      const allowsAssociates = canDepartmentHaveAssociates(canon.departmentId || canon.departmentName);
      if (allowsAssociates) {
        for (const r of chronRounds) {
          const rCalc = this.calculatePollResult(r.id);
          if (r.associates && Array.isArray(r.associates)) {
            group.associates.push(...r.associates);
          } else if (rCalc?.associates && Array.isArray(rCalc.associates)) {
            group.associates.push(...rCalc.associates);
          }
          if (r.votedAssociates && Array.isArray(r.votedAssociates)) {
            for (const va of r.votedAssociates) {
              if (va.winnerName) group.associates.push(va.winnerName);
            }
          }
        }
      }
    }

    // Process all closed associate sub-polls into families by rootPollId or id
    const associateFamilies = new Map<string, Poll[]>();
    for (const ap of closedAssociatePolls) {
      const rootId = ap.rootPollId || ap.id;
      if (!associateFamilies.has(rootId)) {
        associateFamilies.set(rootId, []);
      }
      associateFamilies.get(rootId)!.push(ap);
    }

    for (const [rootId, apFamily] of associateFamilies.entries()) {
      const inProgressAp = allPolls.find(
        (p) => (p.id === rootId || p.rootPollId === rootId) && (p.status === 'OPEN' || p.status === 'WAITING')
      );
      if (inProgressAp) continue;

      const chronApRounds = [...apFamily].sort((a, b) => (a.round || 1) - (b.round || 1));
      const latestAp = chronApRounds[chronApRounds.length - 1];
      const parentPoll = allPolls.find((p) => p.id === latestAp.parentPollId);

      let deptSearchText = parentPoll?.sourceDepartmentId || parentPoll?.question || latestAp.question;
      if (typeof deptSearchText === 'string') {
        deptSearchText = deptSearchText.replace(/^(associados|associado)\s*[-–:]\s*/i, '').trim();
      }
      const canon = resolveCanonicalDepartment(deptSearchText, officialCatalog);
      const allowsAssociates = canDepartmentHaveAssociates(canon.departmentId || canon.departmentName);
      if (!allowsAssociates) continue;

      const group = getOrCreateGroup(canon);

      if (chronApRounds.length === 1) {
        const apCalc = this.calculatePollResult(latestAp.id);
        if (apCalc) {
          if (apCalc.winnerOptionTexts && apCalc.winnerOptionTexts.length > 0) {
            group.associates.push(...apCalc.winnerOptionTexts.filter((w) => !APPROVAL_OPTION_WORDS.has(w.toLowerCase())));
          } else if (apCalc.winnerOptionText && !APPROVAL_OPTION_WORDS.has(apCalc.winnerOptionText.toLowerCase())) {
            group.associates.push(apCalc.winnerOptionText.trim());
          }
        }
      } else {
        const collectedAssocWinners = new Set<string>();
        for (let i = 0; i < chronApRounds.length - 1; i++) {
          const prevApCalc = this.calculatePollResult(chronApRounds[i].id);
          if (prevApCalc && prevApCalc.isTie && prevApCalc.winnerOptionTexts && prevApCalc.winnerOptionTexts.length > 0) {
            for (const w of prevApCalc.winnerOptionTexts) {
              if (!APPROVAL_OPTION_WORDS.has(w.toLowerCase())) {
                collectedAssocWinners.add(w.trim());
              }
            }
          }
        }
        const latestApCalc = this.calculatePollResult(latestAp.id);
        if (latestApCalc) {
          if (latestApCalc.winnerOptionTexts && latestApCalc.winnerOptionTexts.length > 0) {
            for (const w of latestApCalc.winnerOptionTexts) {
              if (!APPROVAL_OPTION_WORDS.has(w.toLowerCase())) {
                collectedAssocWinners.add(w.trim());
              }
            }
          } else if (latestApCalc.winnerOptionText && !APPROVAL_OPTION_WORDS.has(latestApCalc.winnerOptionText.toLowerCase())) {
            collectedAssocWinners.add(latestApCalc.winnerOptionText.trim());
          }
        }
        if (collectedAssocWinners.size > 0) {
          group.associates.push(...Array.from(collectedAssocWinners));
        }
      }
    }

    // Build extracted departments from canonical groups
    const extractedDepartments: AtaDepartmentItem[] = [];

    for (const group of canonicalGroupsMap.values()) {
      const uniqueWinners = Array.from(
        new Set(group.winners.map((w) => w.trim()).filter((w) => w.length > 0))
      );
      const titularName = uniqueWinners.length > 0 ? uniqueWinners.join(', ') : '';
      const allowsAssociates = canDepartmentHaveAssociates(group.departmentId || group.departmentName);
      let cleanAssociates: string[] | undefined = undefined;

      if (allowsAssociates && group.associates.length > 0) {
        const seenNames = new Set<string>();
        const uniqueList: string[] = [];
        for (const name of group.associates) {
          if (!name || typeof name !== 'string') continue;
          const clean = name.trim();
          const lower = clean.toLowerCase();
          if (clean.length > 0 && !seenNames.has(lower) && !APPROVAL_OPTION_WORDS.has(lower)) {
            seenNames.add(lower);
            uniqueList.push(clean);
          }
        }
        if (uniqueList.length > 0) {
          cleanAssociates = uniqueList;
        }
      }

      if (!titularName && (!cleanAssociates || cleanAssociates.length === 0)) {
        continue;
      }

      extractedDepartments.push({
        departmentId: group.departmentId,
        departmentName: group.departmentName,
        titularName,
        associates: cleanAssociates,
        isExplicitlyConfirmed: group.isExplicitlyConfirmed,
      });
    }

    // 4. Merge extracted departments with any existing manual edits in meeting.ataContent
    // CANONICAL MERGE: We key existing edits by canonical department ID so name variations (e.g. "Secretária" / "Secretário(a)") NEVER duplicate!
    let finalDepartments: AtaDepartmentItem[] = extractedDepartments;
    const removedKeys = new Set((meeting.ataRemovedDeptKeys || []).map((k) => {
      const c = resolveCanonicalDepartment(k, officialCatalog);
      return c.departmentId.toLowerCase();
    }));

    const excludedOrgPollKeys = new Set(
      excludedOrgPolls.map((ep) =>
        resolveCanonicalDepartment(ep.sourceDepartmentId || ep.question, officialCatalog).departmentId.toLowerCase()
      )
    );

    if (meeting.ataContent && Array.isArray(meeting.ataContent.departments)) {
      const existingDepts = meeting.ataContent.departments.filter(
        (d) => (d.departmentName && d.departmentName.trim().length > 0) || (d.titularName && d.titularName.trim().length > 0)
      );

      // Map of existing departments canonicalized by departmentId
      const existingCanonicalMap = new Map<string, AtaDepartmentItem>();
      for (const ed of existingDepts) {
        const edCanon = resolveCanonicalDepartment(ed.departmentId || ed.departmentName, officialCatalog);
        const canonKey = edCanon.departmentId.toLowerCase();
        // Exclude any item that came from an Organizing Commission poll and is not an official catalog department
        if (excludedOrgPollKeys.has(canonKey) && edCanon.orderIndex >= 90000) {
          continue;
        }
        const existingItem = existingCanonicalMap.get(canonKey);
        if (existingItem) {
          const combinedAssoc = Array.from(new Set([...(existingItem.associates || []), ...(ed.associates || [])]));
          existingCanonicalMap.set(canonKey, {
            departmentId: edCanon.departmentId,
            departmentName: edCanon.departmentName,
            titularName: existingItem.titularName || ed.titularName,
            associates: combinedAssoc.length > 0 ? combinedAssoc : undefined,
            isManual: Boolean(existingItem.isManual || ed.isManual),
          });
        } else {
          existingCanonicalMap.set(canonKey, {
            departmentId: edCanon.departmentId,
            departmentName: edCanon.departmentName,
            titularName: ed.titularName,
            associates: ed.associates,
            isManual: ed.isManual,
          });
        }
      }

      // Collect all departments that have in-progress (OPEN or WAITING) rounds or active polls in this meeting
      const deptKeysWithInProgressRounds = new Set<string>();
      const deptKeysWithPollsInMeeting = new Set<string>();
      for (const p of allPolls) {
        const c = resolveCanonicalDepartment(p.sourceDepartmentId || p.question, officialCatalog);
        const k = c.departmentId.toLowerCase();
        deptKeysWithPollsInMeeting.add(k);
        if (p.status === 'OPEN' || p.status === 'WAITING') {
          deptKeysWithInProgressRounds.add(k);
        }
      }

      const mergedMap = new Map<string, AtaDepartmentItem>();

      // 1. Process extracted departments (from actual voting results)
      for (const ext of extractedDepartments) {
        const extCanon = resolveCanonicalDepartment(ext.departmentId || ext.departmentName, officialCatalog);
        const canonKey = extCanon.departmentId.toLowerCase();
        const matched = existingCanonicalMap.get(canonKey);

        if (matched) {
          const combinedAssociates = Array.from(
            new Set([...(matched.associates || []), ...(ext.associates || [])])
          );
          let finalTitular = '';

          if (matched.isManual && matched.titularName && matched.titularName.trim().length > 0) {
            // If the department was manually edited by admin in the ATA:
            // ONLY an explicit confirmation (ext.isExplicitlyConfirmed === true) can overwrite it!
            if (ext.isExplicitlyConfirmed && ext.titularName && ext.titularName.trim().length > 0) {
              finalTitular = ext.titularName.trim();
            } else {
              finalTitular = matched.titularName.trim();
            }
          } else {
            // Not manually edited by admin: use extracted voting result if present
            if (ext.titularName && ext.titularName.trim().length > 0) {
              finalTitular = ext.titularName.trim();
            }
          }

          mergedMap.set(canonKey, {
            departmentId: extCanon.departmentId,
            departmentName: extCanon.departmentName,
            titularName: finalTitular,
            associates: combinedAssociates.length > 0 ? combinedAssociates : undefined,
            isManual: matched.isManual && finalTitular === matched.titularName,
          });
        } else {
          if (ext.titularName && ext.titularName.trim().length > 0) {
            mergedMap.set(canonKey, {
              ...ext,
              departmentId: extCanon.departmentId,
              departmentName: extCanon.departmentName,
            });
            if (meeting.ataRemovedDeptKeys) {
              meeting.ataRemovedDeptKeys = meeting.ataRemovedDeptKeys.filter(
                (k) => resolveCanonicalDepartment(k, officialCatalog).departmentId.toLowerCase() !== canonKey
              );
            }
          } else if (!removedKeys.has(canonKey)) {
            mergedMap.set(canonKey, {
              ...ext,
              departmentId: extCanon.departmentId,
              departmentName: extCanon.departmentName,
            });
          }
        }
      }

      // 2. Include any manual editorial additions from existingDepts not present in extracted
      for (const [canonKey, ed] of existingCanonicalMap.entries()) {
        if (!mergedMap.has(canonKey) && (ed.departmentName.trim() || ed.titularName.trim()) && !removedKeys.has(canonKey)) {
          // If this department is managed by polls in this meeting, only keep if it was an authentic manual edit
          if (deptKeysWithPollsInMeeting.has(canonKey) && !ed.isManual) {
            continue;
          }
          mergedMap.set(canonKey, ed);
        }
      }

      finalDepartments = Array.from(mergedMap.values());
    }

    // Filter out any empty block remnants (must have titular or associates)
    finalDepartments = finalDepartments.filter(
      (d) => (d.titularName && d.titularName.trim().length > 0) || (d.associates && d.associates.length > 0)
    );

    // 5. CRITICAL: Sort finalDepartments by custom meeting.ataDepartmentOrder if present, or fallback to official catalog order
    const customOrder = meeting.ataDepartmentOrder;
    const hasCustomOrder = Array.isArray(customOrder) && customOrder.length > 0;
    const customOrderKeys = hasCustomOrder
      ? customOrder.map((k) => resolveCanonicalDepartment(k, officialCatalog).departmentId.toLowerCase())
      : [];

    finalDepartments.sort((a, b) => {
      const canonA = resolveCanonicalDepartment(a.departmentId || a.departmentName, officialCatalog);
      const canonB = resolveCanonicalDepartment(b.departmentId || b.departmentName, officialCatalog);
      const keyA = canonA.departmentId.toLowerCase();
      const keyB = canonB.departmentId.toLowerCase();

      if (hasCustomOrder) {
        const idxA = customOrderKeys.indexOf(keyA);
        const idxB = customOrderKeys.indexOf(keyB);

        if (idxA !== -1 && idxB !== -1) {
          if (idxA !== idxB) return idxA - idxB;
        } else if (idxA !== -1) {
          return -1;
        } else if (idxB !== -1) {
          return 1;
        }
      }

      if (canonA.orderIndex !== canonB.orderIndex) {
        return canonA.orderIndex - canonB.orderIndex;
      }
      return canonA.departmentName.localeCompare(b.departmentName, 'pt-BR');
    });

    const doc: AtaDocumentData = {
      voteCode: meeting.ataContent?.voteCode || voteCode,
      voteNumber,
      year: meeting.ataYear!,
      sequence: meeting.ataSequence!,
      commissionName: meeting.nominationCommissionName || meeting.ataContent?.commissionName,
      period: meeting.ataPeriod || meeting.ataContent?.period || period,
      introText: meeting.ataContent?.introText || introText,
      departments: finalDepartments,
      meetingName: meeting.name,
      meetingCode: meeting.code,
      generatedAt: meeting.ataGeneratedAt || new Date().toISOString(),
      updatedAt: meeting.ataContent?.updatedAt,
    };

    meeting.ataContent = doc;
    this.saveLocal();
    return doc;
  }

  public async saveMeetingAta(meetingId: string, ataData: Partial<AtaDocumentData>): Promise<AtaDocumentData> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    const currentDoc = this.getOrGenerateMeetingAta(meetingId);

    if (ataData.commissionName !== undefined) {
      meeting.nominationCommissionName = ataData.commissionName.trim() || undefined;
    }
    if ((ataData as any).nominationCommissionName !== undefined) {
      meeting.nominationCommissionName = ((ataData as any).nominationCommissionName || '').trim() || undefined;
    }
    if (ataData.period) {
      meeting.ataPeriod = ataData.period.trim();
    }

    const commName = meeting.nominationCommissionName || ataData.commissionName || currentDoc.commissionName;
    const finalVoteCode = ataData.voteCode && ataData.voteCode.trim().length > 0
      ? ataData.voteCode.trim()
      : formatAtaVoteHeader(currentDoc.voteNumber, commName);

    // Clean departments, omitting empty blocks, canonicalizing and deduplicating
    let cleanDepts: AtaDepartmentItem[] = currentDoc.departments;
    if (Array.isArray(ataData.departments)) {
      const commConfig = this.getOrCreateNominationConfig(meetingId);
      const officialCatalog: Array<{ departmentId?: string; id?: string; name: string }> =
        commConfig.departments && commConfig.departments.length > 0
          ? commConfig.departments
          : CENTRAL_DEPARTMENT_CATALOG.map((d) => ({ departmentId: d.id, id: d.id, name: d.name, enabled: true }));

      const savedMap = new Map<string, AtaDepartmentItem>();

      for (const d of ataData.departments) {
        if (!d.departmentName?.trim() && !d.titularName?.trim()) continue;
        const canon = resolveCanonicalDepartment(d.departmentId || d.departmentName, officialCatalog);
        const canonKey = canon.departmentId.toLowerCase();

        const cleanAssociates = Array.isArray(d.associates) && d.associates.length > 0
          ? d.associates.map((a) => a.trim()).filter((a) => a.length > 0)
          : undefined;

        const existing = savedMap.get(canonKey);
        if (existing) {
          const combinedAssoc = Array.from(new Set([...(existing.associates || []), ...(cleanAssociates || [])]));
          savedMap.set(canonKey, {
            departmentId: canon.departmentId,
            departmentName: canon.departmentName,
            titularName: d.titularName?.trim() || existing.titularName,
            associates: combinedAssoc.length > 0 ? combinedAssoc : undefined,
            isManual: true,
          });
        } else {
          savedMap.set(canonKey, {
            departmentId: canon.departmentId,
            departmentName: canon.departmentName,
            titularName: d.titularName?.trim() || '',
            associates: cleanAssociates,
            isManual: true,
          });
        }
      }

      cleanDepts = Array.from(savedMap.values());

      // Sort cleanDepts by custom meeting.ataDepartmentOrder if present, or fallback to official catalog order
      const customOrder = meeting.ataDepartmentOrder;
      const hasCustomOrder = Array.isArray(customOrder) && customOrder.length > 0;
      const customOrderKeys = hasCustomOrder
        ? customOrder.map((k) => resolveCanonicalDepartment(k, officialCatalog).departmentId.toLowerCase())
        : [];

      cleanDepts.sort((a, b) => {
        const canonA = resolveCanonicalDepartment(a.departmentId || a.departmentName, officialCatalog);
        const canonB = resolveCanonicalDepartment(b.departmentId || b.departmentName, officialCatalog);
        const keyA = canonA.departmentId.toLowerCase();
        const keyB = canonB.departmentId.toLowerCase();

        if (hasCustomOrder) {
          const idxA = customOrderKeys.indexOf(keyA);
          const idxB = customOrderKeys.indexOf(keyB);

          if (idxA !== -1 && idxB !== -1) {
            if (idxA !== idxB) return idxA - idxB;
          } else if (idxA !== -1) {
            return -1;
          } else if (idxB !== -1) {
            return 1;
          }
        }

        if (canonA.orderIndex !== canonB.orderIndex) {
          return canonA.orderIndex - canonB.orderIndex;
        }
        return canonA.departmentName.localeCompare(b.departmentName, 'pt-BR');
      });

      // Update meeting.ataRemovedDeptKeys for removed departments
      const keptKeys = new Set(cleanDepts.map((d) => resolveCanonicalDepartment(d.departmentId || d.departmentName, officialCatalog).departmentId.toLowerCase()));
      const extractedDepts = currentDoc.departments.map((d) => resolveCanonicalDepartment(d.departmentId || d.departmentName, officialCatalog).departmentId.toLowerCase());
      const newlyRemoved = extractedDepts.filter((k) => !keptKeys.has(k));
      meeting.ataRemovedDeptKeys = Array.from(new Set([...(meeting.ataRemovedDeptKeys || []), ...newlyRemoved]));
    }

    const updatedDoc: AtaDocumentData = {
      ...currentDoc,
      ...ataData,
      voteCode: finalVoteCode,
      voteNumber: currentDoc.voteNumber,
      year: currentDoc.year,
      sequence: currentDoc.sequence,
      commissionName: commName,
      period: (ataData.period || currentDoc.period).trim(),
      introText: (ataData.introText || currentDoc.introText).trim(),
      departments: cleanDepts,
      meetingName: meeting.name,
      meetingCode: meeting.code,
      updatedAt: new Date().toISOString(),
    };

    meeting.ataContent = updatedDoc;
    await firestoreService.saveEntity('meetings', meeting.id, meeting);
    this.saveLocal();
    return updatedDoc;
  }

  public async setMeetingAtaDepartmentOrder(meetingId: string, departmentOrder: string[] | null): Promise<Meeting> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    if (departmentOrder === null || departmentOrder === undefined || departmentOrder.length === 0) {
      delete meeting.ataDepartmentOrder;
    } else {
      meeting.ataDepartmentOrder = departmentOrder;
    }

    // If meeting has generated ATA, re-sort departments in meeting.ataContent
    if (meeting.ataContent && Array.isArray(meeting.ataContent.departments)) {
      const commConfig = this.getOrCreateNominationConfig(meetingId);
      const officialCatalog: Array<{ departmentId?: string; id?: string; name: string }> =
        commConfig.departments && commConfig.departments.length > 0
          ? commConfig.departments
          : CENTRAL_DEPARTMENT_CATALOG.map((d) => ({ departmentId: d.id, id: d.id, name: d.name, enabled: true }));

      const customOrder = meeting.ataDepartmentOrder;
      const hasCustomOrder = Array.isArray(customOrder) && customOrder.length > 0;
      const customOrderKeys = hasCustomOrder
        ? customOrder.map((k) => resolveCanonicalDepartment(k, officialCatalog).departmentId.toLowerCase())
        : [];

      meeting.ataContent.departments.sort((a, b) => {
        const canonA = resolveCanonicalDepartment(a.departmentId || a.departmentName, officialCatalog);
        const canonB = resolveCanonicalDepartment(b.departmentId || b.departmentName, officialCatalog);
        const keyA = canonA.departmentId.toLowerCase();
        const keyB = canonB.departmentId.toLowerCase();

        if (hasCustomOrder) {
          const idxA = customOrderKeys.indexOf(keyA);
          const idxB = customOrderKeys.indexOf(keyB);

          if (idxA !== -1 && idxB !== -1) {
            if (idxA !== idxB) return idxA - idxB;
          } else if (idxA !== -1) {
            return -1;
          } else if (idxB !== -1) {
            return 1;
          }
        }

        if (canonA.orderIndex !== canonB.orderIndex) {
          return canonA.orderIndex - canonB.orderIndex;
        }
        return canonA.departmentName.localeCompare(b.departmentName, 'pt-BR');
      });
    }

    await firestoreService.saveEntity('meetings', meeting.id, meeting);
    this.saveLocal();
    return meeting;
  }

  // ========================================================
  // --- MÓDULO EXPERIMENTAL: INDICAÇÕES DA IGREJA (CONSULTIVO) ---
  // ========================================================

  public getChurchNominationConfig(meetingId: string): ChurchNominationConfig | null {
    if (!this.data.churchNominationConfigs) {
      this.data.churchNominationConfigs = [];
    }
    const found = this.data.churchNominationConfigs.find((c) => c.meetingId === meetingId);
    return found ? { ...found } : null;
  }

  public async getOrCreateChurchNominationConfig(meetingId: string): Promise<ChurchNominationConfig> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }
    if (!this.data.churchNominationConfigs) {
      this.data.churchNominationConfigs = [];
    }
    let config = this.data.churchNominationConfigs.find((c) => c.meetingId === meetingId);
    if (!config) {
      const publicToken = crypto.randomBytes(12).toString('hex');
      config = {
        meetingId,
        enabled: false,
        status: 'NOT_CONFIGURED',
        deadline: null,
        publicToken,
        createdAt: new Date().toISOString(),
      };
      this.data.churchNominationConfigs.push(config);
      await firestoreService.saveEntity('churchNominationConfigs', meetingId, config);
      this.saveLocal();
    }
    return { ...config };
  }

  public async saveChurchNominationConfig(
    meetingId: string,
    updates: {
      enabled?: boolean;
      status?: 'NOT_CONFIGURED' | 'OPEN' | 'CLOSED';
      deadline?: string | null;
    }
  ): Promise<ChurchNominationConfig> {
    const config = await this.getOrCreateChurchNominationConfig(meetingId);
    const updated: ChurchNominationConfig = {
      ...config,
      enabled: updates.enabled !== undefined ? Boolean(updates.enabled) : config.enabled,
      status: updates.status || config.status,
      deadline: updates.deadline !== undefined ? updates.deadline : config.deadline,
      updatedAt: new Date().toISOString(),
    };

    const idx = this.data.churchNominationConfigs!.findIndex((c) => c.meetingId === meetingId);
    if (idx >= 0) {
      this.data.churchNominationConfigs![idx] = updated;
    } else {
      this.data.churchNominationConfigs!.push(updated);
    }

    await firestoreService.saveEntity('churchNominationConfigs', meetingId, updated);
    this.saveLocal();
    return updated;
  }

  public async generateNewChurchNominationToken(meetingId: string): Promise<ChurchNominationConfig> {
    const config = await this.getOrCreateChurchNominationConfig(meetingId);
    const newToken = crypto.randomBytes(12).toString('hex');
    const updated: ChurchNominationConfig = {
      ...config,
      publicToken: newToken,
      updatedAt: new Date().toISOString(),
    };
    const idx = this.data.churchNominationConfigs!.findIndex((c) => c.meetingId === meetingId);
    if (idx >= 0) {
      this.data.churchNominationConfigs![idx] = updated;
    }
    await firestoreService.saveEntity('churchNominationConfigs', meetingId, updated);
    this.saveLocal();
    return updated;
  }

  public getChurchNominationConfigByToken(token: string): { config: ChurchNominationConfig; meeting: Meeting } | null {
    if (!token || !this.data.churchNominationConfigs) return null;
    const cleanToken = token.trim();
    const config = this.data.churchNominationConfigs.find((c) => c.publicToken === cleanToken);
    if (!config) return null;
    const meeting = this.getMeetingById(config.meetingId);
    if (!meeting) return null;
    return { config: { ...config }, meeting: { ...meeting } };
  }

  public getPublicChurchNominationState(token: string): PublicChurchNominationData {
    const context = this.getChurchNominationConfigByToken(token);
    if (!context) {
      return {
        valid: false,
        status: 'NOT_FOUND',
        meetingName: '',
        deadline: null,
        departments: [],
        error: 'Link de indicações da igreja não encontrado ou inválido.',
      };
    }

    const { config, meeting } = context;
    const isExpired = Boolean(config.deadline && new Date(config.deadline).getTime() <= Date.now());
    let status: 'OPEN' | 'CLOSED' | 'DISABLED' | 'EXPIRED' = 'OPEN';
    if (!config.enabled || config.status === 'NOT_CONFIGURED') {
      status = 'DISABLED';
    } else if (config.status === 'CLOSED') {
      status = 'CLOSED';
    } else if (isExpired) {
      status = 'EXPIRED';
    }

    const commConfig = this.getOrCreateNominationConfig(meeting.id);
    const departments = (commConfig.departments || [])
      .filter((dept) => dept.enabled)
      .map((dept) => ({
        id: dept.departmentId,
        name: getDepartmentPollDisplayName(dept.name),
        maxPerPerson: typeof dept.maxPerPerson === 'number' ? dept.maxPerPerson : 1,
      }));

    return {
      valid: status === 'OPEN',
      status,
      meetingName: meeting.name,
      nominationCommissionName: meeting.nominationCommissionName || meeting.ataContent?.commissionName,
      deadline: config.deadline,
      departments,
    };
  }

  public async submitChurchNomination(
    token: string,
    data: {
      participantName: string;
      selectedDepartments: string[];
      nominations: ChurchNominatedPerson[];
    }
  ): Promise<ChurchNominationSubmission> {
    const context = this.getChurchNominationConfigByToken(token);
    if (!context) {
      throw new Error('Link de Indicações da Igreja não encontrado ou inválido.');
    }
    const { config, meeting } = context;

    if (!config.enabled || config.status !== 'OPEN') {
      throw new Error('As Indicações da Igreja não estão abertas no momento.');
    }
    if (config.deadline && new Date(config.deadline).getTime() <= Date.now()) {
      throw new Error('O prazo para envio de indicações já expirou.');
    }
    if (!data.participantName || typeof data.participantName !== 'string' || data.participantName.trim().length === 0) {
      throw new Error('O seu nome é obrigatório.');
    }

    if (!this.data.churchNominationSubmissions) {
      this.data.churchNominationSubmissions = [];
    }

    const cleanName = data.participantName.trim();
    const cleanSelectedDepts = Array.isArray(data.selectedDepartments)
      ? Array.from(new Set(data.selectedDepartments.map((d) => String(d).trim()).filter(Boolean)))
      : [];

    const cleanNominations: ChurchNominatedPerson[] = [];
    if (Array.isArray(data.nominations)) {
      for (const item of data.nominations) {
        if (!item || !item.personName || typeof item.personName !== 'string') continue;
        const pName = item.personName.trim();
        if (pName.length > 0) {
          cleanNominations.push({
            departmentId: item.departmentId ? String(item.departmentId).trim() : '',
            departmentName: item.departmentName ? String(item.departmentName).trim() : '',
            personName: pName,
            recommenderName: cleanName,
          });
        }
      }
    }

    const submissionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const submission: ChurchNominationSubmission = {
      id: submissionId,
      meetingId: meeting.id,
      publicToken: config.publicToken,
      participantName: cleanName,
      selectedDepartments: cleanSelectedDepts,
      nominations: cleanNominations,
      createdAt: now,
      updatedAt: now,
    };

    this.data.churchNominationSubmissions.push(submission);
    await firestoreService.saveEntity('churchNominationSubmissions', submission.id, submission);
    this.saveLocal();
    return submission;
  }

  public getChurchNominationsReport(meetingId: string): ChurchNominationsReport {
    const config = this.getChurchNominationConfig(meetingId);
    if (!this.data.churchNominationSubmissions) {
      this.data.churchNominationSubmissions = [];
    }

    const submissions = this.data.churchNominationSubmissions.filter((s) => s.meetingId === meetingId);
    const uniqueParticipants = new Set(submissions.map((s) => s.participantName.trim().toLowerCase())).size;

    // Normalization helper for name grouping
    const normalizeName = (name: string): string => {
      return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
    };

    // Build consolidation for departments configured in the meeting
    const commConfig = this.getOrCreateNominationConfig(meetingId);
    const targetDepartments = commConfig.departments && commConfig.departments.length > 0
      ? commConfig.departments
      : CENTRAL_DEPARTMENT_CATALOG.map((d) => ({ departmentId: d.id, name: d.name, enabled: true }));

    const departmentConsolidations: ChurchDepartmentConsolidation[] = targetDepartments.map((dept) => {
      const deptId = dept.departmentId;
      const deptName = getDepartmentPollDisplayName(dept.name);

      // 1. Identify interested participants
      const interestedParticipants: string[] = [];
      for (const sub of submissions) {
        const matchesInterest = sub.selectedDepartments.some(
          (sel) => sel.toLowerCase() === deptId.toLowerCase() || sel.toLowerCase() === deptName.toLowerCase()
        );
        if (matchesInterest) {
          if (!interestedParticipants.includes(sub.participantName)) {
            interestedParticipants.push(sub.participantName);
          }
        }
      }

      // 2. Aggregate nominations for this department with recommenders
      const statsMap = new Map<string, { personName: string; count: number; recommenders: string[] }>();
      let totalMentions = 0;

      for (const sub of submissions) {
        for (const nom of sub.nominations) {
          const matchDept =
            (nom.departmentId && nom.departmentId.toLowerCase() === deptId.toLowerCase()) ||
            (nom.departmentName && nom.departmentName.toLowerCase() === deptName.toLowerCase());

          if (matchDept) {
            totalMentions++;
            const norm = normalizeName(nom.personName);
            const recommender = nom.recommenderName || sub.participantName;
            const existing = statsMap.get(norm);
            if (existing) {
              existing.count++;
              if (recommender && !existing.recommenders.includes(recommender)) {
                existing.recommenders.push(recommender);
              }
            } else {
              statsMap.set(norm, {
                personName: nom.personName.trim(),
                count: 1,
                recommenders: recommender ? [recommender] : [],
              });
            }
          }
        }
      }

      // Convert map to sorted list: highest count first
      const nominees: ChurchDepartmentNomineeStats[] = Array.from(statsMap.entries())
        .map(([normalizedName, data]) => ({
          personName: data.personName,
          normalizedName,
          count: data.count,
          recommenders: data.recommenders,
        }))
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.personName.localeCompare(b.personName);
        });

      return {
        departmentId: deptId,
        departmentName: deptName,
        totalMentions,
        interestCount: interestedParticipants.length,
        interestedParticipants,
        nominees,
      };
    });

    return {
      config,
      totalSubmissions: submissions.length,
      uniqueParticipants,
      departmentConsolidations,
      submissions,
    };
  }

  // --- MÓDULO: COMISSÃO ORGANIZADORA (ISOLADO DA COMISSÃO DE NOMEAÇÕES) ---

  private generateDeterministicOrganizingToken(meeting: Meeting): string {
    const hash = crypto
      .createHash('sha256')
      .update(`votaiasd_organizing_${meeting.id}_${meeting.code}`)
      .digest('hex')
      .slice(0, 14);
    return `org-${hash}`;
  }

  public getDefaultOrganizingCommissionCriteria(): OrganizingCommissionCriterion[] {
    return [
      {
        criterionId: 'homens',
        name: 'HOMENS',
        enabled: true,
        maxLimit: 1,
        isCustom: false,
      },
      {
        criterionId: 'mulheres',
        name: 'MULHERES',
        enabled: true,
        maxLimit: 1,
        isCustom: false,
      },
      {
        criterionId: 'jovens',
        name: 'JOVENS',
        enabled: true,
        maxLimit: 1,
        isCustom: false,
      },
    ];
  }

  public getOrganizingEffectiveStatus(
    config: OrganizingCommissionConfig
  ): 'NOT_OPENED' | 'OPEN' | 'CLOSED' | 'EXPIRED' {
    if (!config.status || config.status === 'NOT_OPENED') {
      return 'NOT_OPENED';
    }
    if (config.status === 'CLOSED') {
      return 'CLOSED';
    }
    if (config.deadline && new Date(config.deadline).getTime() <= Date.now()) {
      return 'EXPIRED';
    }
    return 'OPEN';
  }

  public getOrCreateOrganizingCommissionConfig(meetingId: string): OrganizingCommissionConfig {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    if (!this.data.organizingCommissionConfigs) {
      this.data.organizingCommissionConfigs = [];
    }

    let config = this.data.organizingCommissionConfigs.find((c) => c.meetingId === meetingId);
    const defaultCriteria = this.getDefaultOrganizingCommissionCriteria();
    const deterministicToken = this.generateDeterministicOrganizingToken(meeting);

    if (!config) {
      config = {
        meetingId,
        publicToken: deterministicToken,
        status: 'NOT_OPENED',
        explicitlyOpened: false,
        deadline: null,
        closedAt: null,
        criteria: defaultCriteria,
        createdAt: new Date().toISOString(),
      };
      this.data.organizingCommissionConfigs.push(config);
      this.saveLocal();
    } else {
      let dirty = false;
      if (!config.publicToken) {
        config.publicToken = deterministicToken;
        dirty = true;
      }

      const hasExistingNominations = (this.data.organizingNominations || []).some(
        (n) => n.meetingId === meetingId
      );
      const hasExistingSessions = (this.data.organizingParticipantSessions || []).some(
        (s) => s.meetingId === meetingId
      );
      const hasActivity = hasExistingNominations || hasExistingSessions;

      if (!config.status) {
        config.status = hasActivity ? 'OPEN' : 'NOT_OPENED';
        config.explicitlyOpened = hasActivity;
        dirty = true;
      } else if (
        config.status === 'OPEN' &&
        config.explicitlyOpened === undefined &&
        !config.closedAt
      ) {
        // Backward compatibility: if an existing config had status 'OPEN' auto-created without explicit opening
        // and has no nominations/sessions, treat it as 'NOT_OPENED'; if it already has nominations/sessions, preserve 'OPEN'.
        if (hasActivity) {
          config.explicitlyOpened = true;
        } else {
          config.status = 'NOT_OPENED';
          config.explicitlyOpened = false;
        }
        dirty = true;
      }

      if (config.deadline === undefined) {
        config.deadline = null;
        dirty = true;
      }

      // Ensure the 3 default criteria (HOMENS, MULHERES, JOVENS) are always present
      const existingMap = new Map((config.criteria || []).map((c) => [c.criterionId, c]));
      const mergedDefaults = defaultCriteria.map((def) => {
        const existing = existingMap.get(def.criterionId);
        if (existing) return existing;
        dirty = true;
        return def;
      });

      const customCriteria = (config.criteria || []).filter(
        (c) => c.isCustom || !defaultCriteria.some((def) => def.criterionId === c.criterionId)
      );

      const combined = [...mergedDefaults, ...customCriteria];
      if (dirty || (config.criteria || []).length !== combined.length) {
        config.criteria = combined;
        this.saveLocal();
      }
    }

    return JSON.parse(JSON.stringify(config));
  }

  public getOrganizingCommissionConfigByToken(token: string): {
    config: OrganizingCommissionConfig;
    meeting: Meeting;
  } | null {
    if (!token || typeof token !== 'string') return null;
    const cleanToken = token.trim();
    if (!cleanToken) return null;

    if (!this.data.organizingCommissionConfigs) {
      this.data.organizingCommissionConfigs = [];
    }

    const config = this.data.organizingCommissionConfigs.find((c) => c.publicToken === cleanToken);
    if (config) {
      const meeting = this.getMeetingById(config.meetingId);
      if (!meeting) return null;
      return {
        config: this.getOrCreateOrganizingCommissionConfig(meeting.id),
        meeting: JSON.parse(JSON.stringify(meeting)),
      };
    }

    // Check deterministic token across active/existing meetings
    for (const meeting of this.data.meetings) {
      if (this.generateDeterministicOrganizingToken(meeting) === cleanToken) {
        const createdConfig = this.getOrCreateOrganizingCommissionConfig(meeting.id);
        return {
          config: createdConfig,
          meeting: JSON.parse(JSON.stringify(meeting)),
        };
      }
    }

    return null;
  }

  public async saveOrganizingCommissionConfig(
    meetingId: string,
    updates: {
      criteria?: OrganizingCommissionCriterion[];
      deadline?: string | null;
      status?: 'NOT_OPENED' | 'OPEN' | 'CLOSED';
      explicitlyOpened?: boolean;
    }
  ): Promise<OrganizingCommissionConfig> {
    const current = this.getOrCreateOrganizingCommissionConfig(meetingId);

    const normalizeCriterionKey = (rawName: string) =>
      (rawName || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

    let sanitizedCriteria = current.criteria;

    if (updates.criteria !== undefined) {
      if (!Array.isArray(updates.criteria) || updates.criteria.length === 0) {
        throw new Error('Informe ao menos os critérios padrão da Comissão Organizadora.');
      }

      const seenNames = new Set<string>();
      sanitizedCriteria = [];

      for (const item of updates.criteria) {
        const cleanName = (item.name || '').trim().replace(/\s+/g, ' ');
        if (!cleanName) {
          throw new Error('O nome do critério não pode ficar em branco.');
        }

        const normKey = normalizeCriterionKey(cleanName);
        if (seenNames.has(normKey)) {
          throw new Error(`Já existe um critério com o nome "${cleanName}" nesta reunião.`);
        }
        seenNames.add(normKey);

        const rawLimit = Number(item.maxLimit);
        if (isNaN(rawLimit) || rawLimit < 0 || rawLimit > 500) {
          throw new Error(`Limite inválido para o critério "${cleanName}". Informe um número entre 0 e 500.`);
        }

        sanitizedCriteria.push({
          criterionId: (item.criterionId || '').trim() || `crit_${crypto.randomUUID().slice(0, 8)}`,
          name: cleanName,
          enabled: item.enabled !== undefined ? Boolean(item.enabled) : true,
          maxLimit: Math.floor(rawLimit),
          isCustom: Boolean(item.isCustom),
        });
      }

      // Ensure the 3 default criteria (homens, mulheres, jovens) remain present
      const defaultCriteria = this.getDefaultOrganizingCommissionCriteria();
      for (const def of defaultCriteria) {
        const exists = sanitizedCriteria.some(
          (c) =>
            c.criterionId === def.criterionId ||
            normalizeCriterionKey(c.name) === normalizeCriterionKey(def.name)
        );
        if (!exists) {
          sanitizedCriteria.unshift(def);
        }
      }
    }

    const nextStatus = updates.status !== undefined ? updates.status : (current.status || 'NOT_OPENED');
    const nextDeadline = updates.deadline !== undefined ? updates.deadline : (current.deadline ?? null);
    const nextExplicitlyOpened =
      updates.explicitlyOpened !== undefined
        ? updates.explicitlyOpened
        : nextStatus === 'OPEN'
        ? true
        : Boolean(current.explicitlyOpened);

    let nextClosedAt = current.closedAt ?? null;
    if (nextStatus === 'CLOSED' && current.status !== 'CLOSED') {
      nextClosedAt = new Date().toISOString();
    } else if (nextStatus === 'OPEN' || nextStatus === 'NOT_OPENED') {
      nextClosedAt = null;
    }

    const updated: OrganizingCommissionConfig = {
      ...current,
      status: nextStatus,
      explicitlyOpened: nextExplicitlyOpened,
      deadline: nextDeadline,
      closedAt: nextClosedAt,
      criteria: sanitizedCriteria,
      updatedAt: new Date().toISOString(),
    };

    if (!this.data.organizingCommissionConfigs) {
      this.data.organizingCommissionConfigs = [];
    }
    const idx = this.data.organizingCommissionConfigs.findIndex((c) => c.meetingId === meetingId);
    if (idx >= 0) {
      this.data.organizingCommissionConfigs[idx] = updated;
    } else {
      this.data.organizingCommissionConfigs.push(updated);
    }

    await firestoreService.saveEntity('organizingCommissionConfigs', meetingId, updated);
    this.saveLocal();
    return JSON.parse(JSON.stringify(updated));
  }

  public async setOrganizingCommissionStatus(
    meetingId: string,
    action: 'OPEN' | 'CLOSE' | 'REOPEN',
    newDeadline?: string | null
  ): Promise<OrganizingCommissionConfig> {
    const current = this.getOrCreateOrganizingCommissionConfig(meetingId);

    if (action === 'CLOSE') {
      return await this.saveOrganizingCommissionConfig(meetingId, {
        status: 'CLOSED',
      });
    }

    // action === 'OPEN' or 'REOPEN'
    let resolvedDeadline = newDeadline !== undefined ? newDeadline : current.deadline;
    if (resolvedDeadline && new Date(resolvedDeadline).getTime() <= Date.now()) {
      // If opening/reopening while previous deadline was in the past and no new future deadline was provided, clear expired deadline so it can open cleanly
      resolvedDeadline = null;
    }

    return await this.saveOrganizingCommissionConfig(meetingId, {
      status: 'OPEN',
      explicitlyOpened: true,
      deadline: resolvedDeadline,
    });
  }

  public getConfirmedOrganizingNomineesMap(meetingId: string): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    const config = this.getOrCreateOrganizingCommissionConfig(meetingId);

    const APPROVAL_OPTION_WORDS = new Set([
      'sim', 'nao', 'não', 'aprovar', 'aprovado', 'rejeitar', 'rejeitado', 'abstencao', 'abstenção', 'branco', 'nulo'
    ]);

    const isOrganizingPoll = (p: Poll): boolean => {
      const deptIdLower = (p.sourceDepartmentId || '').trim().toLowerCase();
      if (p.commissionType === 'NOMINATIONS') return false;
      if (deptIdLower && !deptIdLower.startsWith('org_')) return false;
      return this.isPollBelongingToOrganizingCommission(p, meetingId);
    };

    const polls = this.getPollsByMeeting(meetingId).filter(
      (p) => !isAssociateSubPoll(p) && isOrganizingPoll(p)
    );

    const familiesMap = new Map<string, Poll[]>();
    for (const p of polls) {
      const rootId = p.rootPollId || p.id;
      if (!familiesMap.has(rootId)) familiesMap.set(rootId, []);
      familiesMap.get(rootId)!.push(p);
    }

    for (const family of familiesMap.values()) {
      const chronRounds = [...family].sort((a, b) => (a.round || 1) - (b.round || 1));
      const rootPollObj = family[0];
      let criterionId = rootPollObj.sourceCriterionId || '';
      if (!criterionId && rootPollObj.sourceDepartmentId?.startsWith('org_')) {
        criterionId = rootPollObj.sourceDepartmentId.replace(/^org_/i, '');
      }
      if (!criterionId && rootPollObj.sourceCriterionName && config.criteria) {
        const critObj = config.criteria.find(
          (c) => c.name.trim().toLowerCase() === rootPollObj.sourceCriterionName!.trim().toLowerCase()
        );
        if (critObj) criterionId = critObj.criterionId;
      }
      if (!criterionId) continue;

      if (!map.has(criterionId)) map.set(criterionId, new Set<string>());
      const critSet = map.get(criterionId)!;

      for (const roundPoll of chronRounds) {
        if (roundPoll.status !== 'CLOSED') continue;

        let winners: string[] = [];
        if (Array.isArray(roundPoll.confirmedWinnerNames) && roundPoll.confirmedWinnerNames.length > 0) {
          winners = roundPoll.confirmedWinnerNames;
        } else if (
          Array.isArray(roundPoll.decisionAudit?.confirmedWinnersThisRound) &&
          roundPoll.decisionAudit!.confirmedWinnersThisRound.length > 0
        ) {
          winners = roundPoll.decisionAudit!.confirmedWinnersThisRound;
        } else {
          const calc = this.calculatePollResult(roundPoll.id);
          if (calc && !calc.isTie) {
            if (calc.winnerOptionTexts && calc.winnerOptionTexts.length > 0) {
              winners = calc.winnerOptionTexts;
            } else if (calc.winnerOptionText) {
              winners = [calc.winnerOptionText];
            }
          }
        }

        for (const w of winners) {
          const clean = (w || '').trim();
          if (!clean) continue;
          const lower = clean.toLowerCase();
          if (APPROVAL_OPTION_WORDS.has(lower)) continue;
          critSet.add(lower);
        }
      }
    }

    return map;
  }

  public getOrganizingCommissionAdminSummary(meetingId: string): OrganizingCommissionAdminSummary {
    const config = this.getOrCreateOrganizingCommissionConfig(meetingId);
    const effectiveStatus = this.getOrganizingEffectiveStatus(config);

    if (!this.data.organizingNominations) {
      this.data.organizingNominations = [];
    }
    if (!this.data.organizingSelectedNominees) {
      this.data.organizingSelectedNominees = [];
    }

    const sessionMap = new Map<string, string>();
    for (const sess of this.data.organizingParticipantSessions || []) {
      if (sess.meetingId === meetingId && sess.sessionId && sess.nominatorName) {
        const cleanSessName = sess.nominatorName.trim();
        if (cleanSessName && cleanSessName.toLowerCase() !== 'participante') {
          sessionMap.set(sess.sessionId, cleanSessName);
        }
      }
    }

    const nominations = this.data.organizingNominations
      .filter((n) => n.meetingId === meetingId)
      .map((n) => {
        const directName = (n.participantName || '').trim();
        const resolvedName =
          directName && directName.toLowerCase() !== 'participante'
            ? directName
            : sessionMap.get(n.participantSessionId);
        return {
          ...n,
          ...(resolvedName ? { participantName: resolvedName } : {}),
        };
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Public participants count (exclude manual admin entries)
    const publicSessionIds = new Set(
      nominations
        .filter((n) => n.participantSessionId && !n.participantSessionId.startsWith('admin_manual_'))
        .map((n) => n.participantSessionId)
    );

    const confirmedMap = this.getConfirmedOrganizingNomineesMap(meetingId);
    const confirmedNomineesObj: Record<string, string[]> = {};
    for (const [critId, set] of confirmedMap.entries()) {
      confirmedNomineesObj[critId] = Array.from(set);
    }

    // Purge any confirmed nominee from organizingSelectedNominees so they do NOT persist as active selections
    if (this.data.organizingSelectedNominees) {
      const selectionsToPurge = this.data.organizingSelectedNominees.filter((s) => {
        if (s.meetingId !== meetingId) return false;
        const set = confirmedMap.get(s.criterionId);
        return Boolean(set && set.has((s.normalizedName || s.nomineeName).trim().toLowerCase()));
      });

      if (selectionsToPurge.length > 0) {
        const purgeIds = selectionsToPurge.map((s) => s.id);
        firestoreService.batchDelete('organizingSelectedNominees', purgeIds).catch(() => {});
        this.data.organizingSelectedNominees = this.data.organizingSelectedNominees.filter(
          (s) => !purgeIds.includes(s.id)
        );
        this.saveLocal();
      }
    }

    // Sync selection counts with current nominations excluding confirmed nominees
    const selections = this.data.organizingSelectedNominees
      .filter((s) => {
        if (s.meetingId !== meetingId) return false;
        const set = confirmedMap.get(s.criterionId);
        return !Boolean(set && set.has((s.normalizedName || s.nomineeName).trim().toLowerCase()));
      })
      .sort((a, b) => a.order - b.order);

    return {
      config,
      effectiveStatus,
      participantsCount: publicSessionIds.size,
      totalNominationsCount: nominations.length,
      nominations: JSON.parse(JSON.stringify(nominations)),
      selections: JSON.parse(JSON.stringify(selections)),
      confirmedNominees: confirmedNomineesObj,
    };
  }

  public getPublicOrganizingCommissionState(
    token: string,
    sessionId?: string
  ): PublicOrganizingCommissionState {
    const found = this.getOrganizingCommissionConfigByToken(token);
    if (!found) {
      return {
        valid: false,
        status: 'NOT_FOUND',
        meetingName: '',
        deadline: null,
        criteria: [],
        error: 'Link de indicações da Comissão Organizadora não encontrado.',
      };
    }

    const { config, meeting } = found;
    const nominationCommissionName =
      meeting.nominationCommissionName || meeting.ataContent?.commissionName;
    const effectiveStatus = this.getOrganizingEffectiveStatus(config);

    if (effectiveStatus === 'NOT_OPENED') {
      return {
        valid: false,
        status: 'NOT_OPENED',
        meetingId: meeting.id,
        meetingName: meeting.name,
        nominationCommissionName,
        deadline: config.deadline ?? null,
        criteria: [],
        error: 'As indicações para a Comissão Organizadora ainda não foram abertas pelo administrador.',
      };
    }

    if (effectiveStatus === 'CLOSED') {
      return {
        valid: false,
        status: 'CLOSED',
        meetingId: meeting.id,
        meetingName: meeting.name,
        nominationCommissionName,
        deadline: config.deadline ?? null,
        criteria: [],
        error: 'As indicações para a Comissão Organizadora estão encerradas no momento.',
      };
    }

    if (effectiveStatus === 'EXPIRED') {
      return {
        valid: false,
        status: 'EXPIRED',
        meetingId: meeting.id,
        meetingName: meeting.name,
        nominationCommissionName,
        deadline: config.deadline ?? null,
        criteria: [],
        error: 'O prazo para envio de indicações da Comissão Organizadora já expirou.',
      };
    }

    const activeCriteria = (config.criteria || []).filter(
      (c) => c.enabled && c.maxLimit > 0
    );

    const cleanSessionId = sessionId ? sessionId.trim() : '';
    const sessRec = cleanSessionId
      ? (this.data.organizingParticipantSessions || []).find(
          (s) => s.meetingId === meeting.id && s.sessionId === cleanSessionId
        )
      : undefined;

    const existingRecords = cleanSessionId
      ? (this.data.organizingNominations || []).filter(
          (n) => n.meetingId === meeting.id && n.participantSessionId === cleanSessionId
        )
      : [];

    const hasSubmitted = Boolean(
      cleanSessionId && (sessRec?.finalized || existingRecords.length > 0)
    );
    const sessionFinalized = hasSubmitted;

    const resolvedParticipantName =
      (sessRec?.nominatorName && sessRec.nominatorName !== 'Participante'
        ? sessRec.nominatorName
        : '') ||
      existingRecords.find((r) => r.participantName && r.participantName !== 'Participante')
        ?.participantName ||
      undefined;

    return {
      valid: true,
      status: 'OPEN',
      meetingId: meeting.id,
      meetingName: meeting.name,
      nominationCommissionName,
      deadline: config.deadline ?? null,
      criteria: activeCriteria,
      hasSubmitted,
      sessionFinalized,
      ...(resolvedParticipantName ? { participantName: resolvedParticipantName } : {}),
    };
  }

  public async createOrGetOrganizingParticipantSession(params: {
    publicToken: string;
    nominatorName?: string;
    existingSessionId?: string;
  }): Promise<{ sessionId: string; nominatorName: string; finalized?: boolean }> {
    const found = this.getOrganizingCommissionConfigByToken(params.publicToken);
    if (!found) {
      throw new Error('Link de indicações da Comissão Organizadora não encontrado.');
    }
    const { config, meeting } = found;
    const effectiveStatus = this.getOrganizingEffectiveStatus(config);
    if (effectiveStatus === 'NOT_OPENED') {
      const err = new Error('As indicações para a Comissão Organizadora ainda não foram abertas.');
      (err as any).status = 'NOT_OPENED';
      throw err;
    }
    if (effectiveStatus === 'CLOSED') {
      const err = new Error('As indicações estão encerradas no momento.');
      (err as any).status = 'CLOSED';
      throw err;
    }
    if (effectiveStatus === 'EXPIRED') {
      const err = new Error('O prazo para envio de indicações já expirou.');
      (err as any).status = 'EXPIRED';
      throw err;
    }

    let sessionId = params.existingSessionId?.trim();
    if (!sessionId || !sessionId.startsWith('orgsess_')) {
      sessionId = 'orgsess_' + crypto.randomBytes(16).toString('hex');
    }

    if (!this.data.organizingParticipantSessions) {
      this.data.organizingParticipantSessions = [];
    }

    const now = new Date().toISOString();
    let sessRec = this.data.organizingParticipantSessions.find(
      (s) => s.meetingId === meeting.id && s.sessionId === sessionId
    );
    const alreadyHasNominations = (this.data.organizingNominations || []).some(
      (n) => n.meetingId === meeting.id && n.participantSessionId === sessionId
    );

    if ((sessRec && sessRec.finalized) || alreadyHasNominations) {
      const err = new Error('Suas indicações já foram enviadas e não podem ser alteradas.');
      (err as any).status = 'ALREADY_SUBMITTED';
      throw err;
    }

    const cleanName = (params.nominatorName || '').trim().replace(/\s+/g, ' ');
    const lockedExistingName =
      sessRec?.nominatorName && sessRec.nominatorName !== 'Participante'
        ? sessRec.nominatorName.trim()
        : '';
    const effectiveName = lockedExistingName || cleanName;

    if (!effectiveName) {
      throw new Error('Informe seu nome para iniciar suas indicações.');
    }
    if (effectiveName.length > 100) {
      throw new Error('Nome excede o limite de 100 caracteres.');
    }

    if (!sessRec) {
      sessRec = {
        sessionId,
        meetingId: meeting.id,
        nominatorName: effectiveName,
        createdAt: now,
        updatedAt: now,
        finalized: false,
      };
      await firestoreService.saveEntity('organizingParticipantSessions', sessRec.sessionId, sessRec);
      this.data.organizingParticipantSessions.push(sessRec);
      this.saveLocal();
    } else if (!lockedExistingName && effectiveName) {
      sessRec.nominatorName = effectiveName;
      sessRec.updatedAt = now;
      await firestoreService.saveEntity('organizingParticipantSessions', sessRec.sessionId, sessRec);
      this.saveLocal();
    }

    return { sessionId, nominatorName: sessRec.nominatorName, finalized: Boolean(sessRec.finalized) };
  }

  public getParticipantOrganizingNominations(
    publicToken: string,
    sessionId: string
  ): {
    sessionId: string;
    nominatorName: string;
    nominations: Record<string, string[]>;
    finalized: boolean;
    updatedAt?: string;
  } {
    const found = this.getOrganizingCommissionConfigByToken(publicToken);
    if (!found) {
      throw new Error('Link de indicações da Comissão Organizadora não encontrado.');
    }
    const { meeting } = found;

    const sessionRecords = (this.data.organizingNominations || []).filter(
      (n) => n.meetingId === meeting.id && n.participantSessionId === sessionId
    );

    const nominationsMap: Record<string, string[]> = {};
    let latestUpdatedAt = '';
    let recordParticipantName = '';

    for (const rec of sessionRecords) {
      if (!nominationsMap[rec.criterionId]) {
        nominationsMap[rec.criterionId] = [];
      }
      nominationsMap[rec.criterionId].push(rec.nomineeName);
      if (rec.participantName && !recordParticipantName) {
        recordParticipantName = rec.participantName;
      }
      if (!latestUpdatedAt || rec.createdAt > latestUpdatedAt) {
        latestUpdatedAt = rec.createdAt;
      }
    }

    const sessRec = (this.data.organizingParticipantSessions || []).find(
      (s) => s.meetingId === meeting.id && s.sessionId === sessionId
    );

    const resolvedName =
      recordParticipantName ||
      (sessRec?.nominatorName && sessRec.nominatorName !== 'Participante'
        ? sessRec.nominatorName
        : '');

    return {
      sessionId,
      nominatorName: resolvedName,
      nominations: nominationsMap,
      finalized: Boolean(sessRec?.finalized || sessionRecords.length > 0),
      updatedAt: latestUpdatedAt || undefined,
    };
  }

  public async saveParticipantOrganizingNominations(params: {
    publicToken: string;
    sessionId: string;
    participantName?: string;
    nominatorName?: string;
    criterionId?: string;
    nomineeNames?: string[];
    nominations?: Record<string, string[]>;
    finalized?: boolean;
  }): Promise<{
    savedCount: number;
    updatedAt: string;
    criterionId?: string;
    savedNames?: string[];
  }> {
    const found = this.getOrganizingCommissionConfigByToken(params.publicToken);
    if (!found) {
      throw new Error('Link de indicações da Comissão Organizadora não encontrado.');
    }
    const { config, meeting } = found;

    const effectiveStatus = this.getOrganizingEffectiveStatus(config);
    if (effectiveStatus === 'NOT_OPENED') {
      const err = new Error('As indicações para a Comissão Organizadora ainda não foram abertas.');
      (err as any).status = 'NOT_OPENED';
      throw err;
    }
    if (effectiveStatus === 'CLOSED') {
      const err = new Error('As indicações estão encerradas no momento.');
      (err as any).status = 'CLOSED';
      throw err;
    }
    if (effectiveStatus === 'EXPIRED') {
      const err = new Error('Este período de indicações foi encerrado.');
      (err as any).status = 'EXPIRED';
      throw err;
    }

    const cleanSessionId = (params.sessionId || '').trim();
    if (!cleanSessionId || cleanSessionId.length < 6) {
      throw new Error('Sessão de participante inválida.');
    }

    if (!this.data.organizingParticipantSessions) {
      this.data.organizingParticipantSessions = [];
    }
    let sessRec = this.data.organizingParticipantSessions.find(
      (s) => s.meetingId === meeting.id && s.sessionId === cleanSessionId
    );

    const alreadyHasNominations = (this.data.organizingNominations || []).some(
      (n) => n.meetingId === meeting.id && n.participantSessionId === cleanSessionId
    );
    if ((sessRec && sessRec.finalized) || alreadyHasNominations) {
      const err = new Error('Suas indicações já foram enviadas e não podem ser alteradas.');
      (err as any).status = 'ALREADY_SUBMITTED';
      throw err;
    }

    const providedName = (params.participantName || params.nominatorName || '').trim().replace(/\s+/g, ' ');
    const sessionStoredName =
      sessRec?.nominatorName && sessRec.nominatorName !== 'Participante'
        ? sessRec.nominatorName.trim()
        : '';
    // Preserve locked session name if already established; otherwise use providedName
    const cleanNominatorName = sessionStoredName || providedName;

    if (!cleanNominatorName) {
      throw new Error('Informe seu nome para enviar suas indicações.');
    }
    if (cleanNominatorName.length > 100) {
      throw new Error('Nome excede o limite de 100 caracteres.');
    }

    const criterionMap = new Map(
      (config.criteria || []).map((c) => [c.criterionId, c])
    );
    const now = new Date().toISOString();

    if (!sessRec) {
      sessRec = {
        sessionId: cleanSessionId,
        meetingId: meeting.id,
        nominatorName: cleanNominatorName,
        createdAt: now,
        updatedAt: now,
        finalized: true,
      };
      this.data.organizingParticipantSessions.push(sessRec);
    } else {
      sessRec.updatedAt = now;
      sessRec.nominatorName = cleanNominatorName;
      sessRec.finalized = true;
    }

    if (!this.data.organizingNominations) {
      this.data.organizingNominations = [];
    }

    const normalizeNominee = (str: string) =>
      (str || '').trim().replace(/\s+/g, ' ').toLowerCase();

    // Ensure config itself is persisted in Firestore so public token lookup works across restarts
    await firestoreService.saveEntity('organizingCommissionConfigs', meeting.id, config);

    // CASE 1: Single Criterion Save
    if (params.criterionId) {
      const targetCriterionId = params.criterionId.trim();
      const critConfig = criterionMap.get(targetCriterionId);
      if (!critConfig || !critConfig.enabled || critConfig.maxLimit <= 0) {
        throw new Error(`O critério "${targetCriterionId}" não está ativo para esta reunião.`);
      }

      const rawList = Array.isArray(params.nomineeNames) ? params.nomineeNames : [];
      const seen = new Set<string>();
      const validNames: string[] = [];

      for (const item of rawList) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim().replace(/\s+/g, ' ');
        if (!trimmed) continue;
        const normalized = normalizeNominee(trimmed);
        if (seen.has(normalized)) {
          throw new Error(`O nome "${trimmed}" foi informado em duplicidade neste critério.`);
        }
        seen.add(normalized);
        validNames.push(trimmed);
      }

      if (validNames.length > critConfig.maxLimit) {
        throw new Error(
          `O critério "${critConfig.name}" permite no máximo ${critConfig.maxLimit} indicação(ões) por participante. Você enviou ${validNames.length}.`
        );
      }

      const newRecords: OrganizingNominationRecord[] = validNames.map((name) => ({
        id: 'orgnom_' + crypto.randomBytes(16).toString('hex'),
        meetingId: meeting.id,
        criterionId: targetCriterionId,
        nomineeName: name,
        normalizedName: normalizeNominee(name),
        createdAt: now,
        participantSessionId: cleanSessionId,
        participantName: cleanNominatorName,
      }));

      const oldRecords = this.data.organizingNominations.filter(
        (n) =>
          n.meetingId === meeting.id &&
          n.participantSessionId === cleanSessionId &&
          n.criterionId === targetCriterionId
      );
      const oldIds = oldRecords.map((r) => r.id);

      await firestoreService.saveEntity('organizingParticipantSessions', sessRec.sessionId, sessRec);
      if (oldIds.length) {
        await firestoreService.batchDelete('organizingNominations', oldIds);
      }
      if (newRecords.length) {
        await firestoreService.batchSave(
          'organizingNominations',
          newRecords.map((r) => ({ id: r.id, data: r }))
        );
      }

      this.data.organizingNominations = this.data.organizingNominations.filter(
        (n) =>
          !(
            n.meetingId === meeting.id &&
            n.participantSessionId === cleanSessionId &&
            n.criterionId === targetCriterionId
          )
      );
      this.data.organizingNominations.push(...newRecords);
      this.saveLocal();

      return {
        savedCount: newRecords.length,
        updatedAt: now,
        criterionId: targetCriterionId,
        savedNames: validNames,
      };
    }

    // CASE 2: Bulk Multi-criterion Save
    if (!params.nominations || typeof params.nominations !== 'object') {
      throw new Error('Estrutura de indicações inválida.');
    }

    const newRecords: OrganizingNominationRecord[] = [];
    for (const [critId, rawList] of Object.entries(params.nominations)) {
      if (!Array.isArray(rawList)) continue;
      const critConfig = criterionMap.get(critId);
      if (!critConfig || !critConfig.enabled || critConfig.maxLimit <= 0) {
        if (rawList.some((s) => typeof s === 'string' && s.trim().length > 0)) {
          throw new Error(`O critério "${critId}" não está ativo para esta reunião.`);
        }
        continue;
      }

      const seen = new Set<string>();
      const validNames: string[] = [];

      for (const item of rawList) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim().replace(/\s+/g, ' ');
        if (!trimmed) continue;
        const normalized = normalizeNominee(trimmed);
        if (seen.has(normalized)) {
          throw new Error(`O nome "${trimmed}" foi informado em duplicidade no critério "${critConfig.name}".`);
        }
        seen.add(normalized);
        validNames.push(trimmed);
      }

      if (validNames.length > critConfig.maxLimit) {
        throw new Error(
          `O critério "${critConfig.name}" permite no máximo ${critConfig.maxLimit} indicação(ões) por participante. Você enviou ${validNames.length}.`
        );
      }

      for (const name of validNames) {
        newRecords.push({
          id: 'orgnom_' + crypto.randomBytes(16).toString('hex'),
          meetingId: meeting.id,
          criterionId: critId,
          nomineeName: name,
          normalizedName: normalizeNominee(name),
          createdAt: now,
          participantSessionId: cleanSessionId,
          participantName: cleanNominatorName,
        });
      }
    }

    const oldRecords = this.data.organizingNominations.filter(
      (n) => n.meetingId === meeting.id && n.participantSessionId === cleanSessionId
    );
    const oldIds = oldRecords.map((r) => r.id);

    await firestoreService.saveEntity('organizingParticipantSessions', sessRec.sessionId, sessRec);
    if (oldIds.length) {
      await firestoreService.batchDelete('organizingNominations', oldIds);
    }
    if (newRecords.length) {
      await firestoreService.batchSave(
        'organizingNominations',
        newRecords.map((r) => ({ id: r.id, data: r }))
      );
    }

    this.data.organizingNominations = this.data.organizingNominations.filter(
      (n) => !(n.meetingId === meeting.id && n.participantSessionId === cleanSessionId)
    );
    this.data.organizingNominations.push(...newRecords);
    this.saveLocal();

    return {
      savedCount: newRecords.length,
      updatedAt: now,
    };
  }

  public async finalizeOrganizingParticipantSession(params: {
    publicToken: string;
    sessionId: string;
    nominatorName?: string;
  }): Promise<{
    success: boolean;
    sessionId: string;
    nominatorName: string;
    finalized: boolean;
    updatedAt: string;
  }> {
    const found = this.getOrganizingCommissionConfigByToken(params.publicToken);
    if (!found) {
      throw new Error('Link de indicações da Comissão Organizadora não encontrado.');
    }
    const { meeting } = found;
    const cleanSessionId = (params.sessionId || '').trim();
    if (!cleanSessionId) {
      throw new Error('Sessão inválida.');
    }

    if (!this.data.organizingParticipantSessions) {
      this.data.organizingParticipantSessions = [];
    }
    const now = new Date().toISOString();
    let sessRec = this.data.organizingParticipantSessions.find(
      (s) => s.meetingId === meeting.id && s.sessionId === cleanSessionId
    );
    const cleanName = (params.nominatorName || '').trim().replace(/\s+/g, ' ');
    if (!sessRec) {
      sessRec = {
        sessionId: cleanSessionId,
        meetingId: meeting.id,
        nominatorName: cleanName || 'Participante',
        createdAt: now,
        updatedAt: now,
        finalized: true,
      };
      await firestoreService.saveEntity('organizingParticipantSessions', sessRec.sessionId, sessRec);
      this.data.organizingParticipantSessions.push(sessRec);
    } else {
      sessRec.finalized = true;
      sessRec.updatedAt = now;
      if (cleanName) {
        sessRec.nominatorName = cleanName;
      }
      await firestoreService.saveEntity('organizingParticipantSessions', sessRec.sessionId, sessRec);
    }
    this.saveLocal();

    return {
      success: true,
      sessionId: sessRec.sessionId,
      nominatorName: sessRec.nominatorName,
      finalized: true,
      updatedAt: sessRec.updatedAt,
    };
  }

  public async addManualOrganizingNominee(params: {
    meetingId: string;
    criterionId: string;
    nomineeName: string;
  }): Promise<OrganizingNominationRecord> {
    const meeting = this.getMeetingById(params.meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    const config = this.getOrCreateOrganizingCommissionConfig(params.meetingId);
    const crit = config.criteria.find((c) => c.criterionId === params.criterionId);
    if (!crit) {
      throw new Error('Critério não encontrado nesta reunião.');
    }

    const cleanName = (params.nomineeName || '').trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      throw new Error('Informe o nome da pessoa indicada.');
    }
    if (cleanName.length > 100) {
      throw new Error('O nome excede o limite de 100 caracteres.');
    }

    const now = new Date().toISOString();
    const newRecord: OrganizingNominationRecord = {
      id: 'orgnom_' + crypto.randomBytes(16).toString('hex'),
      meetingId: params.meetingId,
      criterionId: params.criterionId,
      nomineeName: cleanName,
      normalizedName: cleanName.toLowerCase(),
      createdAt: now,
      participantSessionId: 'admin_manual_' + crypto.randomBytes(8).toString('hex'),
      participantName: 'Administrador',
    };

    await firestoreService.saveEntity('organizingNominations', newRecord.id, newRecord);

    if (!this.data.organizingNominations) {
      this.data.organizingNominations = [];
    }
    this.data.organizingNominations.push(newRecord);
    this.saveLocal();

    return JSON.parse(JSON.stringify(newRecord));
  }

  public async updateOrganizingNominationOccurrence(params: {
    meetingId: string;
    nominationId: string;
    nomineeName: string;
  }): Promise<OrganizingNominationRecord> {
    if (!this.data.organizingNominations) {
      this.data.organizingNominations = [];
    }

    const record = this.data.organizingNominations.find(
      (n) => n.id === params.nominationId && n.meetingId === params.meetingId
    );
    if (!record) {
      throw new Error('Indicação não encontrada nesta reunião.');
    }

    const cleanName = (params.nomineeName || '').trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      throw new Error('O nome da indicação não pode ficar vazio.');
    }
    if (cleanName.length > 100) {
      throw new Error('O nome excede o limite de 100 caracteres.');
    }

    const oldNormalized = (record.normalizedName || record.nomineeName).trim().toLowerCase();
    const targetCriterionId = record.criterionId;
    const newNormalized = cleanName.toLowerCase();

    // Update all occurrences of this consolidated name in the same criterion so consolidated rows stay consistent
    const matchingRecords = this.data.organizingNominations.filter(
      (n) =>
        n.meetingId === params.meetingId &&
        n.criterionId === targetCriterionId &&
        (n.normalizedName || n.nomineeName).trim().toLowerCase() === oldNormalized
    );

    const updatedBatch: { id: string; data: OrganizingNominationRecord }[] = [];
    for (const item of matchingRecords) {
      item.nomineeName = cleanName;
      item.normalizedName = newNormalized;
      updatedBatch.push({ id: item.id, data: { ...item } });
    }

    if (updatedBatch.length > 0) {
      await firestoreService.batchSave('organizingNominations', updatedBatch);
    }

    // Also update any selected nominee in this criterion that had the old normalized name
    if (this.data.organizingSelectedNominees) {
      const matchingSelections = this.data.organizingSelectedNominees.filter(
        (s) =>
          s.meetingId === params.meetingId &&
          s.criterionId === targetCriterionId &&
          (s.normalizedName || s.nomineeName).trim().toLowerCase() === oldNormalized
      );
      for (const sel of matchingSelections) {
        sel.nomineeName = cleanName;
        sel.normalizedName = newNormalized;
        await firestoreService.saveEntity('organizingSelectedNominees', sel.id, sel);
      }
    }

    this.saveLocal();
    return JSON.parse(JSON.stringify(record));
  }

  public async deleteOrganizingNominationOccurrence(
    meetingId: string,
    nominationId: string
  ): Promise<boolean> {
    if (!this.data.organizingNominations) {
      this.data.organizingNominations = [];
    }

    const target = this.data.organizingNominations.find(
      (n) => n.id === nominationId && n.meetingId === meetingId
    );
    if (!target) {
      throw new Error('Indicação não encontrada nesta reunião.');
    }

    const targetCriterionId = target.criterionId;
    const targetNormalized = (target.normalizedName || target.nomineeName).trim().toLowerCase();

    // Delete all occurrences of this consolidated name in the same criterion
    const toDelete = this.data.organizingNominations.filter(
      (n) =>
        n.meetingId === meetingId &&
        n.criterionId === targetCriterionId &&
        (n.normalizedName || n.nomineeName).trim().toLowerCase() === targetNormalized
    );
    const toDeleteIds = toDelete.map((r) => r.id);

    if (toDeleteIds.length > 0) {
      await firestoreService.batchDelete('organizingNominations', toDeleteIds);
    }

    this.data.organizingNominations = this.data.organizingNominations.filter(
      (n) => !toDeleteIds.includes(n.id)
    );

    // Also remove from selected nominees if it was selected
    if (this.data.organizingSelectedNominees) {
      const selToDelete = this.data.organizingSelectedNominees.filter(
        (s) =>
          s.meetingId === meetingId &&
          s.criterionId === targetCriterionId &&
          (s.normalizedName || s.nomineeName).trim().toLowerCase() === targetNormalized
      );
      if (selToDelete.length > 0) {
        await firestoreService.batchDelete(
          'organizingSelectedNominees',
          selToDelete.map((s) => s.id)
        );
        this.data.organizingSelectedNominees = this.data.organizingSelectedNominees.filter(
          (s) => !selToDelete.some((d) => d.id === s.id)
        );
      }
    }

    this.saveLocal();
    return true;
  }

  public async toggleOrganizingNomineeSelection(params: {
    meetingId: string;
    criterionId: string;
    nomineeName: string;
    selected?: boolean;
  }): Promise<OrganizingSelectedNominee[]> {
    const meeting = this.getMeetingById(params.meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    const config = this.getOrCreateOrganizingCommissionConfig(params.meetingId);
    const crit = config.criteria.find((c) => c.criterionId === params.criterionId);
    if (!crit) {
      throw new Error('Critério não encontrado nesta reunião.');
    }

    const cleanName = (params.nomineeName || '').trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      throw new Error('Nome do indicado não pode ser vazio.');
    }

    if (!this.data.organizingSelectedNominees) {
      this.data.organizingSelectedNominees = [];
    }

    const normalized = cleanName.toLowerCase();

    const existingIdx = this.data.organizingSelectedNominees.findIndex(
      (s) =>
        s.meetingId === params.meetingId &&
        s.criterionId === params.criterionId &&
        s.normalizedName === normalized
    );

    const shouldSelect = params.selected !== undefined ? Boolean(params.selected) : existingIdx === -1;

    if (!shouldSelect) {
      if (existingIdx !== -1) {
        const target = this.data.organizingSelectedNominees[existingIdx];
        await firestoreService.deleteEntity('organizingSelectedNominees', target.id);
        this.data.organizingSelectedNominees.splice(existingIdx, 1);
        this.saveLocal();
      }
    } else if (existingIdx === -1) {
      const nomCount = (this.data.organizingNominations || []).filter(
        (n) =>
          n.meetingId === params.meetingId &&
          n.criterionId === params.criterionId &&
          n.normalizedName === normalized
      ).length;

      const currentCriterionSelections = this.data.organizingSelectedNominees.filter(
        (s) => s.meetingId === params.meetingId && s.criterionId === params.criterionId
      );

      const newSelection: OrganizingSelectedNominee = {
        id: 'orgsel_' + crypto.randomBytes(16).toString('hex'),
        meetingId: params.meetingId,
        criterionId: params.criterionId,
        nomineeName: cleanName,
        normalizedName: normalized,
        nominationCount: Math.max(1, nomCount),
        selectedForPoll: true,
        order: currentCriterionSelections.length + 1,
      };

      await firestoreService.saveEntity('organizingSelectedNominees', newSelection.id, newSelection);
      this.data.organizingSelectedNominees.push(newSelection);
      this.saveLocal();
    }

    return this.data.organizingSelectedNominees
      .filter((s) => s.meetingId === params.meetingId)
      .map((s) => JSON.parse(JSON.stringify(s)));
  }

  public async selectAllOrganizingCriterionNominees(params: {
    meetingId: string;
    criterionId: string;
    nomineeNames?: string[];
    selectAll: boolean;
  }): Promise<OrganizingSelectedNominee[]> {
    const meeting = this.getMeetingById(params.meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    const config = this.getOrCreateOrganizingCommissionConfig(params.meetingId);
    const crit = config.criteria.find((c) => c.criterionId === params.criterionId);
    if (!crit) {
      throw new Error('Critério não encontrado nesta reunião.');
    }

    if (!this.data.organizingSelectedNominees) {
      this.data.organizingSelectedNominees = [];
    }

    if (!params.selectAll) {
      const toRemove = this.data.organizingSelectedNominees.filter(
        (s) => s.meetingId === params.meetingId && s.criterionId === params.criterionId
      );
      const toRemoveIds = toRemove.map((s) => s.id);
      if (toRemoveIds.length > 0) {
        await firestoreService.batchDelete('organizingSelectedNominees', toRemoveIds);
        this.data.organizingSelectedNominees = this.data.organizingSelectedNominees.filter(
          (s) => !(s.meetingId === params.meetingId && s.criterionId === params.criterionId)
        );
        this.saveLocal();
      }
      return this.data.organizingSelectedNominees
        .filter((s) => s.meetingId === params.meetingId)
        .map((s) => JSON.parse(JSON.stringify(s)));
    }

    // Gather all unique nominee names in this criterion (from nominations + optional passed list)
    const criterionNoms = (this.data.organizingNominations || []).filter(
      (n) => n.meetingId === params.meetingId && n.criterionId === params.criterionId
    );

    const uniqueNamesMap = new Map<string, { displayName: string; count: number }>();
    for (const nom of criterionNoms) {
      const norm = (nom.normalizedName || nom.nomineeName).trim().toLowerCase();
      const existing = uniqueNamesMap.get(norm);
      if (existing) {
        existing.count++;
      } else {
        uniqueNamesMap.set(norm, { displayName: nom.nomineeName.trim(), count: 1 });
      }
    }

    if (Array.isArray(params.nomineeNames)) {
      for (const rawName of params.nomineeNames) {
        const clean = (rawName || '').trim().replace(/\s+/g, ' ');
        if (!clean) continue;
        const norm = clean.toLowerCase();
        if (!uniqueNamesMap.has(norm)) {
          uniqueNamesMap.set(norm, { displayName: clean, count: 1 });
        }
      }
    }

    const toAdd: OrganizingSelectedNominee[] = [];
    let orderIdx =
      this.data.organizingSelectedNominees.filter(
        (s) => s.meetingId === params.meetingId && s.criterionId === params.criterionId
      ).length + 1;

    for (const [norm, info] of uniqueNamesMap.entries()) {
      const alreadySelected = this.data.organizingSelectedNominees.some(
        (s) =>
          s.meetingId === params.meetingId &&
          s.criterionId === params.criterionId &&
          s.normalizedName === norm
      );
      if (!alreadySelected) {
        toAdd.push({
          id: 'orgsel_' + crypto.randomBytes(16).toString('hex'),
          meetingId: params.meetingId,
          criterionId: params.criterionId,
          nomineeName: info.displayName,
          normalizedName: norm,
          nominationCount: info.count,
          selectedForPoll: true,
          order: orderIdx++,
        });
      }
    }

    if (toAdd.length > 0) {
      await firestoreService.batchSave(
        'organizingSelectedNominees',
        toAdd.map((item) => ({ id: item.id, data: item }))
      );
      this.data.organizingSelectedNominees.push(...toAdd);
      this.saveLocal();
    }

    return this.data.organizingSelectedNominees
      .filter((s) => s.meetingId === params.meetingId)
      .map((s) => JSON.parse(JSON.stringify(s)));
  }

  public async createPollFromOrganizingSelections(params: {
    meetingId: string;
    criterionId: string;
    nomineeNames: string[];
    question?: string;
    allowMultiple?: boolean;
    maxChoices?: number;
  }): Promise<Poll> {
    const meeting = this.getMeetingById(params.meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }
    if (meeting.status === 'MEETING_CLOSED') {
      throw new Error('Não é possível criar pautas em uma reunião encerrada.');
    }

    const config = this.getOrCreateOrganizingCommissionConfig(params.meetingId);
    const crit = config.criteria.find((c) => c.criterionId === params.criterionId);
    if (!crit) {
      throw new Error('Critério não encontrado nesta reunião.');
    }

    const defaultTitle = formatOrganizingCriterionPollTitle(crit.name);
    const cleanQuestion = (params.question || '').trim() || defaultTitle;

    if (!Array.isArray(params.nomineeNames) || params.nomineeNames.length === 0) {
      throw new Error('Selecione pelo menos um nome para criar a pauta.');
    }

    const meetingSelections = (this.data.organizingSelectedNominees || []).filter(
      (s) => s.meetingId === params.meetingId && s.criterionId === params.criterionId
    );
    const criterionNominations = (this.data.organizingNominations || []).filter(
      (n) => n.meetingId === params.meetingId && n.criterionId === params.criterionId
    );
    const validCriterionNamesSet = new Set([
      ...meetingSelections.map((s) => s.normalizedName || s.nomineeName.trim().toLowerCase()),
      ...criterionNominations.map((n) => (n.normalizedName || n.nomineeName).trim().toLowerCase()),
    ]);

    const validatedOptionNames: string[] = [];
    const seen = new Set<string>();

    for (const rawName of params.nomineeNames) {
      if (typeof rawName !== 'string') continue;
      const clean = rawName.trim().replace(/\s+/g, ' ');
      if (!clean) continue;
      const normalized = clean.toLowerCase();
      if (validCriterionNamesSet.size > 0 && !validCriterionNamesSet.has(normalized)) {
        throw new Error(
          `O nome "${clean}" não está na lista de indicações do critério "${crit.name}".`
        );
      }
      if (!seen.has(normalized)) {
        seen.add(normalized);
        validatedOptionNames.push(clean);
      }
    }

    if (validatedOptionNames.length === 0) {
      throw new Error('Nenhuma opção válida selecionada para a pauta.');
    }

    const poll = await this.createPoll(
      params.meetingId,
      cleanQuestion,
      validatedOptionNames,
      Boolean(params.allowMultiple),
      params.allowMultiple ? params.maxChoices ?? 1 : 1,
      1, // minOptions = 1
      'INDICATIONS',
      `org_${crit.criterionId}`,
      false,
      undefined,
      false,
      {
        commissionType: 'ORGANIZING',
        sourceCriterionId: crit.criterionId,
        sourceCriterionName: crit.name,
      }
    );

    if (!poll) {
      throw new Error('Falha ao criar pauta da Comissão Organizadora.');
    }

    // Automatically deselect used names in this criterion after creating the poll
    const usedNamesSet = new Set(validatedOptionNames.map((n) => n.trim().toLowerCase()));
    if (this.data.organizingSelectedNominees) {
      const selectionsToRemove = this.data.organizingSelectedNominees.filter(
        (s) =>
          s.meetingId === params.meetingId &&
          s.criterionId === params.criterionId &&
          usedNamesSet.has((s.normalizedName || s.nomineeName).trim().toLowerCase())
      );
      if (selectionsToRemove.length > 0) {
        await firestoreService.batchDelete(
          'organizingSelectedNominees',
          selectionsToRemove.map((s) => s.id)
        );
        this.data.organizingSelectedNominees = this.data.organizingSelectedNominees.filter(
          (s) =>
            !(
              s.meetingId === params.meetingId &&
              s.criterionId === params.criterionId &&
              usedNamesSet.has((s.normalizedName || s.nomineeName).trim().toLowerCase())
            )
        );
        this.saveLocal();
      }
    }

    return poll;
  }

  // =========================================================
  // ATA EXCLUSIVA DA COMISSÃO ORGANIZADORA (ISOLADA DA ATA DA COMISSÃO DE NOMEAÇÕES)
  // =========================================================

  public getOrGenerateOrganizingMeetingAta(meetingId: string): OrganizingAtaDocumentData {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    const meetingYear = new Date(meeting.createdAt).getFullYear() || new Date().getFullYear();

    // 1. Establish persistent sequence and vote number for the Organizing Commission ATA
    if (
      !meeting.organizingAtaSequence ||
      !meeting.organizingAtaVoteNumber ||
      meeting.organizingAtaYear !== meetingYear
    ) {
      const userMeetings = meeting.userId
        ? this.data.meetings.filter((m) => m.userId === meeting.userId)
        : this.data.meetings;

      const existingOrgSeqs = userMeetings
        .filter((m) => m.organizingAtaYear === meetingYear && typeof m.organizingAtaSequence === 'number')
        .map((m) => m.organizingAtaSequence as number);

      const nextSeq = existingOrgSeqs.length > 0 ? Math.max(...existingOrgSeqs) + 1 : 1;
      const seqStr = String(nextSeq).padStart(3, '0');

      meeting.organizingAtaGenerated = true;
      meeting.organizingAtaVoteNumber = `${meetingYear}-${seqStr}`;
      meeting.organizingAtaYear = meetingYear;
      meeting.organizingAtaSequence = nextSeq;
      meeting.organizingAtaGeneratedAt = meeting.organizingAtaGeneratedAt || new Date().toISOString();
      this.save();
    }

    const voteNumber = meeting.organizingAtaVoteNumber!;
    const existingContent = meeting.organizingAtaContent;
    const congregationName =
      meeting.nominationCommissionName || existingContent?.congregationName || undefined;
    const defaultVoteCode = formatOrganizingAtaVoteHeader(voteNumber, congregationName);

    // Date of the ATA: defaults to current date in America/Sao_Paulo (DD/MM/AAAA) at the time of conducting/generating the ATA,
    // or preserves manualMeetingDate if the administrator manually edited and saved the date.
    let defaultMeetingDate = '';
    try {
      defaultMeetingDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    } catch {
      defaultMeetingDate = new Date().toLocaleDateString('pt-BR');
    }
    const effectiveMeetingDate =
      existingContent?.manualMeetingDate && existingContent.manualMeetingDate.trim().length > 0
        ? existingContent.manualMeetingDate.trim()
        : defaultMeetingDate;

    const normalizeStr = (s: string) =>
      (s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const allMeetingPolls = this.getPollsByMeeting(meetingId);
    const meetingNameNorm = normalizeStr(meeting.name || '');
    const isOrganizingNamedMeeting = meetingNameNorm.includes('comissao organizadora');

    // Helper: distinguish Quantity of Members poll vs Secretary of Nominating Commission poll vs Member polls
    const isQuantityPoll = (p: Poll): boolean => {
      const deptIdLower = (p.sourceDepartmentId || '').trim().toLowerCase();
      if (p.commissionType === 'NOMINATIONS') return false;
      if (deptIdLower && !deptIdLower.startsWith('org_')) return false;

      const qNorm = normalizeStr(p.question || '');
      const critNorm = normalizeStr(p.sourceCriterionName || p.sourceCriterionId || '');
      const combined = `${qNorm} ${critNorm}`;
      if (
        /quantidade\s+de\s+membros|numero\s+de\s+membros|proposta\s+d[ae]\s+(quantidade|membros?)|quantos\s+membros|quantidade\s+para\s+a\s+comissao/.test(
          combined
        )
      ) {
        return true;
      }
      if (
        p.options &&
        p.options.length > 0 &&
        p.options.every((opt) => /^\d{1,3}(\s+(membros?|integrantes?|pessoas?))?$/i.test(opt.text.trim()))
      ) {
        return true;
      }
      return false;
    };

    const isSecretaryPoll = (p: Poll): boolean => {
      const deptIdLower = (p.sourceDepartmentId || '').trim().toLowerCase();
      if (p.commissionType === 'NOMINATIONS') return false;
      if (deptIdLower && !deptIdLower.startsWith('org_')) return false;

      const qNorm = normalizeStr(p.question || '');
      const critNorm = normalizeStr(p.sourceCriterionName || p.sourceCriterionId || '');
      const combined = `${qNorm} ${critNorm}`;
      if (
        /secretari[oa](\(a\))?\s+da\s+comissao\s+de\s+nomeac(oes|ao)/.test(combined) ||
        ((p.commissionType === 'ORGANIZING' ||
          Boolean(p.sourceCriterionId) ||
          deptIdLower.startsWith('org_') ||
          isOrganizingNamedMeeting) &&
          /\bsecretari[oa](\(a\))?\b/.test(combined))
      ) {
        return true;
      }
      // Also recognize manual single-winner Organizing Commission auxiliary polls (e.g. "Ordem")
      if (
        !deptIdLower &&
        !p.sourceCriterionId &&
        p.source === 'MANUAL' &&
        (p.maxChoices || 1) === 1 &&
        /\b(ordem|coordenador)\b/.test(qNorm) &&
        this.isPollBelongingToOrganizingCommission(p, meetingId)
      ) {
        return true;
      }
      return false;
    };

    // Helper: identify polls that belong to the Organizing Commission context
    const isOrganizingPoll = (p: Poll): boolean => {
      const deptIdLower = (p.sourceDepartmentId || '').trim().toLowerCase();
      if (p.commissionType === 'NOMINATIONS') return false;
      if (deptIdLower && !deptIdLower.startsWith('org_')) return false;

      if (this.isPollBelongingToOrganizingCommission(p, meetingId)) return true;
      if (isQuantityPoll(p)) return true;
      if (isSecretaryPoll(p)) return true;

      if (isOrganizingNamedMeeting && !deptIdLower) {
        return true;
      }

      return false;
    };

    const orgPolls = allMeetingPolls.filter((p) => !isAssociateSubPoll(p) && isOrganizingPoll(p));

    // Group ALL rounds (closed, open, waiting) by rootPollId so we can inspect tiebreak/reopen state accurately
    const familiesMap = new Map<string, Poll[]>();
    for (const p of orgPolls) {
      const rootId = p.rootPollId || p.id;
      if (!familiesMap.has(rootId)) {
        familiesMap.set(rootId, []);
      }
      familiesMap.get(rootId)!.push(p);
    }

    /**
     * Extract confirmed winners from a poll family respecting Section 6 rules:
     * - Polls in WAITING or OPEN do not emit unconfirmed results.
     * - If a single-choice poll closed in a tie, it emits nothing until tiebreak closes.
     * - If a multi-choice poll closed with partial tie at the cutoff, the clearWinners (strictly above cutoff,
     *   already placed in calc.winnerOptionTexts by calculatePollResult) ARE emitted immediately even while the
     *   tiebreak round for the tied options is WAITING or OPEN.
     * - If a poll was reopened to re-vote candidates (where a candidate is included in a subsequent round or
     *   where the previous round was not a partial tiebreak), the candidate's result waits for the new round to close.
     */
    const extractConfirmedWinnersFromFamily = (family: Poll[]): string[] => {
      const chronRounds = [...family].sort((a, b) => (a.round || 1) - (b.round || 1));
      const confirmed: string[] = [];
      const seenLower = new Set<string>();

      const rootPollObj = family[0];
      const initialSeats = Math.max(1, rootPollObj.maxChoices || 1);

      const addConfirmed = (name: string) => {
        const clean = (name || '').trim();
        if (!clean) return;
        const lower = clean.toLowerCase();
        if (APPROVAL_OPTION_WORDS.has(lower)) return;
        if (!seenLower.has(lower) && confirmed.length < initialSeats) {
          seenLower.add(lower);
          confirmed.push(clean);
        }
      };

      const hasInProgress = family.some((p) => p.status === 'OPEN' || p.status === 'WAITING');

      for (let i = 0; i < chronRounds.length; i++) {
        const roundPoll = chronRounds[i];
        if (roundPoll.status !== 'CLOSED') {
          // Open or waiting round: never emit unconfirmed options
          continue;
        }

        const calc = this.calculatePollResult(roundPoll.id);
        if (!calc) continue;

        const subsequentRounds = chronRounds.slice(i + 1);

        if (subsequentRounds.length > 0 || hasInProgress) {
          // Earlier closed round (or family has an in-progress round):
          // ONLY emit candidates who were EXPLICITLY confirmed by administrative decision
          // (poll.confirmedWinnerNames or poll.decisionAudit.confirmedWinnersThisRound).
          // NEVER infer confirmation by absence from subsequent round options!
          const explicitConfirmed = Array.isArray(roundPoll.confirmedWinnerNames) && roundPoll.confirmedWinnerNames.length > 0
            ? roundPoll.confirmedWinnerNames
            : Array.isArray(roundPoll.decisionAudit?.confirmedWinnersThisRound) && roundPoll.decisionAudit!.confirmedWinnersThisRound.length > 0
            ? roundPoll.decisionAudit!.confirmedWinnersThisRound
            : [];
          for (const w of explicitConfirmed) {
            addConfirmed(w);
          }
        } else {
          // Latest round in this family, and it is CLOSED with no round in progress
          if (isApprovalPoll(roundPoll.options)) {
            if (!calc.isTie) {
              const winningOpt = (calc.winnerOptionText || '').trim().toLowerCase();
              if (winningOpt === 'sim' || winningOpt === 'aprovar' || winningOpt === 'aprovado') {
                const extracted = extractNomineeFromApprovalQuestion(
                  roundPoll.question,
                  roundPoll.sourceCriterionName
                );
                if (extracted) addConfirmed(extracted);
              }
            }
          } else {
            // Check if latest round has explicit confirmations:
            const explicitConfirmed = Array.isArray(roundPoll.confirmedWinnerNames) && roundPoll.confirmedWinnerNames.length > 0
              ? roundPoll.confirmedWinnerNames
              : Array.isArray(roundPoll.decisionAudit?.confirmedWinnersThisRound) && roundPoll.decisionAudit!.confirmedWinnersThisRound.length > 0
              ? roundPoll.decisionAudit!.confirmedWinnersThisRound
              : null;

            if (explicitConfirmed) {
              for (const w of explicitConfirmed) {
                addConfirmed(w);
              }
            } else {
              // Validated mathematical winners:
              // - all winners when calc.isTie === false
              // - clearWinners strictly above cutoff when calc.isTie === true and !calc.hasExcessEligible
              // - empty [] when single-choice tie or excess eligible
              if (Array.isArray(calc.winnerOptionTexts) && calc.winnerOptionTexts.length > 0) {
                for (const w of calc.winnerOptionTexts) {
                  addConfirmed(w);
                }
              } else if (!calc.isTie && calc.winnerOptionText) {
                addConfirmed(calc.winnerOptionText);
              }
            }
          }
        }
      }

      return confirmed;
    };

    let votedMembersCount = '';
    let votedSecretaryName = '';
    const votedMembersList: string[] = [];
    const seenVotedMembers = new Set<string>();

    // Sort families chronologically by the creation date of their root poll
    const sortedFamilies = Array.from(familiesMap.values()).sort((fa, fb) => {
      const aTime = new Date(fa[0]?.createdAt || 0).getTime();
      const bTime = new Date(fb[0]?.createdAt || 0).getTime();
      return aTime - bTime;
    });

    for (const family of sortedFamilies) {
      const rootPoll = family[0];
      const latestPoll = family[family.length - 1];

      if (isQuantityPoll(latestPoll) || isQuantityPoll(rootPoll)) {
        const winners = extractConfirmedWinnersFromFamily(family);
        if (winners.length > 0) {
          const rawWinner = winners[winners.length - 1];
          const numMatch = rawWinner.match(/\d+/) || latestPoll.question.match(/\b(\d{1,3})\b/);
          if (numMatch) {
            const parsedNum = parseInt(numMatch[0], 10);
            if (!isNaN(parsedNum) && parsedNum > 0) {
              votedMembersCount = parsedNum < 10 ? String(parsedNum).padStart(2, '0') : String(parsedNum);
            }
          } else {
            votedMembersCount = rawWinner.trim();
          }
        }
      } else if (isSecretaryPoll(latestPoll) || isSecretaryPoll(rootPoll)) {
        const winners = extractConfirmedWinnersFromFamily(family);
        if (winners.length > 0) {
          votedSecretaryName = winners.join(', ');
        }
      } else {
        const winners = extractConfirmedWinnersFromFamily(family);
        for (const w of winners) {
          const lower = w.trim().toLowerCase();
          if (lower && !seenVotedMembers.has(lower)) {
            seenVotedMembers.add(lower);
            votedMembersList.push(w.trim());
          }
        }
      }
    }

    // Merge voted results with any manual edits preserved in meeting.organizingAtaContent
    const finalMembersCount =
      votedMembersCount ||
      (existingContent?.manualMembersCount !== undefined
        ? existingContent.manualMembersCount.trim()
        : existingContent?.membersCount?.trim() || '');

    const finalSecretaryName =
      votedSecretaryName ||
      (existingContent?.manualSecretaryName !== undefined
        ? existingContent.manualSecretaryName.trim()
        : existingContent?.secretaryName?.trim() || '');

    // Merge membersList: start with votedMembersList (filtering any explicitly removed by admin), then append manual additions
    const removedMembersSet = new Set(
      (meeting.organizingAtaRemovedMembers || existingContent?.removedMemberNames || []).map((n) =>
        n.trim().toLowerCase()
      )
    );

    const finalMembersList: string[] = [];
    const seenFinalMembers = new Set<string>();

    for (const vm of votedMembersList) {
      const clean = vm.trim();
      const lower = clean.toLowerCase();
      if (clean && !removedMembersSet.has(lower) && !seenFinalMembers.has(lower)) {
        seenFinalMembers.add(lower);
        finalMembersList.push(clean);
      }
    }

    const manualSavedList = (existingContent?.manualMembersList && existingContent.manualMembersList.length > 0)
      ? existingContent.manualMembersList
      : (existingContent?.membersList || []);
    for (const mm of manualSavedList) {
      const clean = (mm || '').trim();
      const lower = clean.toLowerCase();
      if (clean && !removedMembersSet.has(lower) && !seenFinalMembers.has(lower)) {
        seenFinalMembers.add(lower);
        finalMembersList.push(clean);
      }
    }

    // Upgrade any previously auto-generated voteCode that had parentheses around the congregation name
    const resolvedVoteCode = normalizeOrganizingAtaVoteHeader(
      existingContent?.voteCode,
      defaultVoteCode
    );

    const doc: OrganizingAtaDocumentData = {
      voteCode: resolvedVoteCode,
      voteNumber,
      year: meeting.organizingAtaYear!,
      sequence: meeting.organizingAtaSequence!,
      congregationName,
      meetingDate: effectiveMeetingDate,
      manualMeetingDate: existingContent?.manualMeetingDate,
      presentMembers: existingContent?.presentMembers || '',
      membersCount: finalMembersCount,
      manualMembersCount: existingContent?.manualMembersCount,
      secretaryName: finalSecretaryName,
      manualSecretaryName: existingContent?.manualSecretaryName,
      membersList: finalMembersList,
      manualMembersList: existingContent?.manualMembersList,
      removedMemberNames: Array.from(removedMembersSet),
      meetingName: meeting.name,
      meetingCode: meeting.code,
      generatedAt: meeting.organizingAtaGeneratedAt || new Date().toISOString(),
      updatedAt: existingContent?.updatedAt,
    };

    meeting.organizingAtaContent = doc;
    this.saveLocal();
    return doc;
  }

  public async saveOrganizingMeetingAta(
    meetingId: string,
    ataData: Partial<OrganizingAtaDocumentData>
  ): Promise<OrganizingAtaDocumentData> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Reunião não encontrada.');
    }

    const currentDoc = this.getOrGenerateOrganizingMeetingAta(meetingId);

    if (ataData.congregationName !== undefined) {
      meeting.nominationCommissionName = ataData.congregationName.trim() || undefined;
      if (meeting.ataContent) {
        meeting.ataContent.commissionName = meeting.nominationCommissionName;
        if (meeting.ataVoteNumber) {
          meeting.ataContent.voteCode = formatAtaVoteHeader(
            meeting.ataVoteNumber,
            meeting.nominationCommissionName
          );
        }
      }
    }

    const congName =
      meeting.nominationCommissionName !== undefined
        ? meeting.nominationCommissionName
        : currentDoc.congregationName;

    const defaultVoteHeader = formatOrganizingAtaVoteHeader(currentDoc.voteNumber, congName);
    const finalVoteCode =
      ataData.voteCode && ataData.voteCode.trim().length > 0
        ? normalizeOrganizingAtaVoteHeader(ataData.voteCode.trim(), defaultVoteHeader)
        : defaultVoteHeader;

    const manualMeetingDate =
      ataData.meetingDate !== undefined
        ? ataData.meetingDate.trim() || undefined
        : currentDoc.manualMeetingDate;

    const presentMembers =
      ataData.presentMembers !== undefined
        ? ataData.presentMembers.trim()
        : currentDoc.presentMembers;

    let formattedMembersCount =
      ataData.membersCount !== undefined
        ? ataData.membersCount.trim()
        : currentDoc.membersCount;
    if (formattedMembersCount && /^\d+$/.test(formattedMembersCount)) {
      const n = parseInt(formattedMembersCount, 10);
      if (!isNaN(n) && n > 0 && n < 10) {
        formattedMembersCount = String(n).padStart(2, '0');
      }
    }

    const manualMembersCount =
      ataData.membersCount !== undefined
        ? formattedMembersCount || undefined
        : currentDoc.manualMembersCount;

    const finalSecretaryName =
      ataData.secretaryName !== undefined
        ? ataData.secretaryName.trim()
        : currentDoc.secretaryName;
    const manualSecretaryName =
      ataData.secretaryName !== undefined
        ? finalSecretaryName || undefined
        : currentDoc.manualSecretaryName;

    let cleanMembersList = currentDoc.membersList;
    const inputMembers = Array.isArray(ataData.membersList)
      ? ataData.membersList
      : Array.isArray(ataData.manualMembersList)
      ? ataData.manualMembersList
      : null;
    if (inputMembers) {
      const seen = new Set<string>();
      const deduped: string[] = [];
      for (const item of inputMembers) {
        if (typeof item !== 'string') continue;
        const clean = item.trim();
        const lower = clean.toLowerCase();
        if (clean && !seen.has(lower)) {
          seen.add(lower);
          deduped.push(clean);
        }
      }
      cleanMembersList = deduped;

      // Track any previously present members that the admin explicitly removed
      const keptLower = new Set(cleanMembersList.map((m) => m.toLowerCase()));
      const newlyRemoved = currentDoc.membersList
        .map((m) => m.trim().toLowerCase())
        .filter((m) => m && !keptLower.has(m));

      const existingRemoved = new Set(
        (meeting.organizingAtaRemovedMembers || []).map((m) => m.trim().toLowerCase())
      );
      for (const r of newlyRemoved) {
        existingRemoved.add(r);
      }
      for (const k of keptLower) {
        existingRemoved.delete(k);
      }
      meeting.organizingAtaRemovedMembers = Array.from(existingRemoved);
    }

    const updatedDoc: OrganizingAtaDocumentData = {
      ...currentDoc,
      voteCode: finalVoteCode,
      voteNumber: currentDoc.voteNumber,
      year: currentDoc.year,
      sequence: currentDoc.sequence,
      congregationName: congName,
      meetingDate: manualMeetingDate || currentDoc.meetingDate,
      manualMeetingDate,
      presentMembers,
      membersCount: formattedMembersCount,
      manualMembersCount,
      secretaryName: finalSecretaryName,
      manualSecretaryName,
      membersList: cleanMembersList,
      manualMembersList: cleanMembersList,
      removedMemberNames: meeting.organizingAtaRemovedMembers || [],
      meetingName: meeting.name,
      meetingCode: meeting.code,
      generatedAt: currentDoc.generatedAt,
      updatedAt: new Date().toISOString(),
    };

    meeting.organizingAtaContent = updatedDoc;
    await firestoreService.saveEntity('meetings', meeting.id, meeting);
    this.saveLocal();
    return updatedDoc;
  }
}

export function formatAtaVoteHeader(voteNumber: string, commissionName?: string): string {
  if (!commissionName || !commissionName.trim()) {
    return `${voteNumber} COMISSÃO DE NOMEAÇÕES – APROVAR`;
  }
  const cleanName = commissionName.trim().toUpperCase();
  if (cleanName.startsWith('COMISSÃO DE NOMEAÇÕES') || cleanName.startsWith('COMISSAO DE NOMEACOES')) {
    return `${voteNumber} ${cleanName} – APROVAR`;
  }
  return `${voteNumber} COMISSÃO DE NOMEAÇÕES ${cleanName} – APROVAR`;
}

export function formatOrganizingAtaVoteHeader(voteNumber: string, congregationName?: string): string {
  if (!congregationName || !congregationName.trim()) {
    return `${voteNumber} COMISSÃO ORGANIZADORA — APROVAR`;
  }
  let cleanCong = congregationName.trim().toUpperCase();
  cleanCong = cleanCong
    .replace(/^COMISS[ÃA]O\s+ORGANIZADORA\s*[-–—:]?\s*/i, '')
    .replace(/^COMISS[ÃA]O\s+DE\s+NOMEA[ÇC][ÕO]ES\s*[-–—:]?\s*/i, '')
    .replace(/^\(+|\)+$/g, '')
    .trim();
  if (!cleanCong) {
    return `${voteNumber} COMISSÃO ORGANIZADORA — APROVAR`;
  }
  return `${voteNumber} COMISSÃO ORGANIZADORA — ${cleanCong} — APROVAR`;
}

export function normalizeOrganizingAtaVoteHeader(
  rawVoteCode: string | undefined,
  defaultVoteCode: string
): string {
  if (!rawVoteCode || !rawVoteCode.trim()) {
    return defaultVoteCode;
  }
  const trimmed = rawVoteCode.trim();
  const parenMatch = trimmed.match(
    /^(\d{4}-\d{3})\s+COMISS[ÃA]O\s+ORGANIZADORA\s*\(([^)]+)\)\s*[–—-]\s*APROVAR$/i
  );
  if (parenMatch) {
    const vNum = parenMatch[1];
    const cong = parenMatch[2].trim().toUpperCase();
    return cong
      ? `${vNum} COMISSÃO ORGANIZADORA — ${cong} — APROVAR`
      : `${vNum} COMISSÃO ORGANIZADORA — APROVAR`;
  }
  const noCongMatch = trimmed.match(
    /^(\d{4}-\d{3})\s+COMISS[ÃA]O\s+ORGANIZADORA\s*[–-]\s*APROVAR$/i
  );
  if (noCongMatch) {
    return `${noCongMatch[1]} COMISSÃO ORGANIZADORA — APROVAR`;
  }
  return trimmed;
}

export const db = new Database();
