export type MeetingStatus = 'WAITING' | 'VOTING_OPEN' | 'VOTING_CLOSED' | 'MEETING_CLOSED';

export type PollStatus = 'WAITING' | 'OPEN' | 'CLOSED';

export interface Option {
  id: string;
  pollId: string;
  text: string;
  order: number;
  isDemo?: boolean;
}

export interface Poll {
  id: string;
  meetingId: string;
  question: string;
  status: PollStatus;
  createdAt: string;
  openedAt?: string;
  closedAt?: string;
  options: Option[];
  allowMultiple?: boolean;
  maxChoices?: number;
  source?: 'MANUAL' | 'INDICATIONS' | 'ORGANIZING_COMMISSION';
  sourceDepartmentId?: string;
  commissionType?: 'NOMINATIONS' | 'ORGANIZING';
  sourceCriterionId?: string;
  sourceCriterionName?: string;
  associates?: string[];
  parentPollId?: string;
  isAssociatePoll?: boolean;
  associationType?: 'DIRECT' | 'VOTED';
  associationPollId?: string | null;
  votedAssociates?: {
    pollId: string;
    winnerName: string;
    percentage?: number;
    options?: { text: string; votes: number; percentage: number }[];
  }[];
  // Rodadas / Desempate e Eliminação Assistida
  round?: number;
  rootPollId?: string;
  isFinal?: boolean;
  decisionAudit?: PollRoundDecisionAudit;
  confirmedWinnerNames?: string[];
  disputeOptions?: string[];
  disputeMaxChoices?: number;
  disputeAllowMultiple?: boolean;
  isDemo?: boolean;
}

export interface OptionResult {
  optionId: string;
  text: string;
  votes: number;
  percentage: number;
}

export interface PollResult {
  pollId: string;
  question: string;
  status: PollStatus;
  totalVotes: number;
  totalVoters?: number;
  totalSelections?: number;
  allowMultiple?: boolean;
  maxChoices?: number;
  options: OptionResult[];
  winnerOptionId: string | null;
  winnerOptionText: string | null;
  winnerOptionTexts?: string[];
  isTie: boolean;
  tieOptions?: string[];
  associates?: string[];
  source?: 'MANUAL' | 'INDICATIONS' | 'ORGANIZING_COMMISSION';
  sourceDepartmentId?: string;
  commissionType?: 'NOMINATIONS' | 'ORGANIZING';
  sourceCriterionId?: string;
  sourceCriterionName?: string;
  parentPollId?: string;
  isAssociatePoll?: boolean;
  associationType?: 'DIRECT' | 'VOTED';
  associationPollId?: string | null;
  votedAssociates?: {
    pollId: string;
    winnerName: string;
    percentage?: number;
    options?: { text: string; votes: number; percentage: number }[];
  }[];
  createdAt: string;
  openedAt?: string;
  closedAt?: string;
  // Rodadas / Desempate e Eliminação Assistida
  round?: number;
  rootPollId?: string;
  isFinal?: boolean;
  hasExcessEligible?: boolean;
  excessEligibleOptions?: string[];
  roundHistory?: PollResult[];
  suggestedCutoffPercentage?: number;
  candidatesSuggestedForCutoff?: string[];
  remainingOpenSeats?: number;
  rootMaxChoices?: number;
  confirmedWinnerNames?: string[];
  eligibleWinnerNames?: string[];
  disputeOptions?: string[];
  disputeMaxChoices?: number;
  disputeAllowMultiple?: boolean;
  decisionAudit?: PollRoundDecisionAudit;
  isDemo?: boolean;
}

export interface PollRoundDecisionAudit {
  round: number;
  cutoffPercentageSuggested: number;
  cutoffPercentageApplied?: number;
  candidatesSuggestedForCutoff: string[];
  candidatesKeptByAdmin: string[];
  candidatesRemovedByAdmin: string[];
  confirmedWinnersThisRound: string[];
  remainingOpenSeats: number;
  timestamp: string;
}

export interface User {
  id: string;
  firebaseUid?: string;
  username: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: User;
  message?: string;
  error?: string;
  resetToken?: string;
  resetUrl?: string;
}

export interface AtaDepartmentItem {
  departmentId?: string;
  departmentName: string;
  titularName: string;
  associates?: string[];
  isManual?: boolean;
  isExplicitlyConfirmed?: boolean;
}

export interface AtaDocumentData {
  voteCode: string;
  voteNumber: string;
  year: number;
  sequence: number;
  commissionName?: string;
  period: string;
  introText: string;
  departments: AtaDepartmentItem[];
  meetingName: string;
  meetingCode: string;
  generatedAt: string;
  updatedAt?: string;
}

export interface OrganizingAtaDocumentData {
  voteCode: string;
  voteNumber: string;
  year: number;
  sequence: number;
  congregationName?: string;
  meetingDate: string;
  manualMeetingDate?: string;
  presentMembers: string;
  membersCount: string;
  manualMembersCount?: string;
  secretaryName: string;
  manualSecretaryName?: string;
  membersList: string[];
  manualMembersList?: string[];
  removedMemberNames?: string[];
  meetingName: string;
  meetingCode: string;
  generatedAt: string;
  updatedAt?: string;
}

export interface Meeting {
  id: string;
  userId?: string;
  name: string;
  description?: string;
  nominationCommissionName?: string;
  code: string;
  status: MeetingStatus;
  createdAt: string;
  closedAt?: string;
  currentPollId?: string | null;
  ataGenerated?: boolean;
  ataVoteNumber?: string;
  ataYear?: number;
  ataSequence?: number;
  ataPeriod?: string;
  ataGeneratedAt?: string;
  ataContent?: AtaDocumentData;
  ataRemovedDeptKeys?: string[];
  ataDepartmentOrder?: string[];
  organizingAtaGenerated?: boolean;
  organizingAtaVoteNumber?: string;
  organizingAtaYear?: number;
  organizingAtaSequence?: number;
  organizingAtaGeneratedAt?: string;
  organizingAtaContent?: OrganizingAtaDocumentData;
  organizingAtaRemovedMembers?: string[];
  isDemo?: boolean;
}

// Public view of a meeting sent to participants (never reveals other votes or admin secrets)
export interface PublicMeetingState {
  id: string;
  name: string;
  description?: string;
  nominationCommissionName?: string;
  code: string;
  status: MeetingStatus;
  participantCount: number;
  currentPoll: {
    id: string;
    question: string;
    status: PollStatus;
    options: {
      id: string;
      text: string;
    }[];
    allowMultiple?: boolean;
    maxChoices?: number;
  } | null;
}

// Admin view of a meeting including live poll results and history
export interface AdminMeetingState {
  meeting: Meeting;
  participantCount: number;
  participants?: string[];
  currentPoll: Poll | null;
  currentPollResult: PollResult | null;
  history: PollResult[];
  savedPolls?: Poll[];
}

export interface VotePayload {
  pollId: string;
  optionId?: string;
  optionIds?: string[];
  anonymousSessionId: string;
}

export interface VoteResponse {
  success: boolean;
  message: string;
}

// Meeting summary for history listing
export interface HistoryMeetingSummary {
  id: string;
  code: string;
  name: string;
  description?: string;
  nominationCommissionName?: string;
  status: MeetingStatus;
  createdAt: string;
  closedAt?: string;
  totalPolls: number;
  totalVotes: number;
}

export interface HistoryMonthGroup {
  month: number; // 1 to 12
  monthName: string; // e.g. "Setembro"
  year: number;
  meetings: HistoryMeetingSummary[];
}

export interface HistoryYearGroup {
  year: number;
  totalMeetings: number;
  months: HistoryMonthGroup[];
}

// --- Módulo Indicações (Nominations) ---
export type NominationStatus = 'NOT_CONFIGURED' | 'OPEN' | 'CLOSED';

export interface DepartmentCatalogItem {
  id: string;
  name: string;
  defaultMaxPerPerson: number;
}

export interface MeetingDepartmentConfig {
  departmentId: string;
  name: string;
  enabled: boolean;
  maxPerPerson: number;
  isCustom?: boolean;
}

export interface NominationMeetingConfig {
  meetingId: string;
  enabled: boolean;
  status: NominationStatus;
  deadline: string | null; // ISO Date string or null
  publicToken: string; // Token exclusivo e aleatório para futuro link público
  departments: MeetingDepartmentConfig[];
  createdAt: string;
  closedAt?: string;
  updatedAt?: string;
}

export interface NominationRecord {
  id: string;
  meetingId: string;
  departmentId: string;
  nomineeName: string;
  nominatorSessionId: string;
  nominatorName?: string;
  source?: 'PUBLIC' | 'ADMIN';
  createdAt: string;
  updatedAt: string;
}

export interface NominationDepartmentStats {
  departmentId: string;
  departmentName: string;
  enabled: boolean;
  maxPerPerson: number;
  totalNominations: number;
  distinctNomineesCount: number;
}

export interface NominationAdminSummary {
  config: NominationMeetingConfig;
  totalNominations: number;
  distinctNomineesCount: number;
  distinctParticipantsCount: number;
  departmentStats: NominationDepartmentStats[];
  confirmedNominees?: Record<string, string[]>;
}

export interface SelectedNominee {
  id: string;
  meetingId: string;
  departmentId: string;
  nomineeName: string;
  selectedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpectedParticipant {
  id: string;
  meetingId: string;
  name: string;
  createdAt: string;
}

export type ParticipantProgressStatus = 'FILLING' | 'READY_TO_SEND' | 'SENT';

export interface ParticipantTrackingItem {
  id?: string;
  sessionId?: string;
  name: string;
  status: 'PARTICIPATED' | 'PENDING' | 'UNEXPECTED';
  progressStatus?: ParticipantProgressStatus;
  expected: boolean;
  lastActivity?: string;
  submittedDepartmentsCount?: number;
  submittedNominationsCount?: number;
  totalPossibleNominations?: number;
  percentage?: number;
  finalized?: boolean;
}

export interface NominationParticipantsTracking {
  expectedCount: number;
  totalExpected: number;
  participatedCount: number;
  pendingCount: number;
  unexpectedCount: number;
  totalPossibleNominations?: number;
  participated: ParticipantTrackingItem[];
  pending: ParticipantTrackingItem[];
  participants: ParticipantTrackingItem[];
}


export interface PublicNominationDepartment {
  departmentId: string;
  name: string;
  maxPerPerson: number;
}

export interface PublicNominationState {
  valid: boolean;
  status: 'OPEN' | 'CLOSED' | 'DISABLED' | 'EXPIRED' | 'NOT_FOUND';
  meetingName: string;
  nominationCommissionName?: string;
  deadline: string | null;
  departments: PublicNominationDepartment[];
  error?: string;
}

export interface ParticipantNominationsMap {
  [departmentId: string]: string[];
}

export interface ParticipantNominationSessionData {
  sessionId: string;
  nominatorName: string;
  nominations: ParticipantNominationsMap;
  updatedAt?: string;
}

export interface SaveNominationsResponse {
  success: boolean;
  message: string;
  savedCount: number;
  updatedAt: string;
  departmentId?: string;
  savedNames?: string[];
}

// --- MÓDULO EXPERIMENTAL: INDICAÇÕES DA IGREJA (CONSULTIVO) ---

export type ChurchNominationStatus = 'NOT_CONFIGURED' | 'OPEN' | 'CLOSED';

export interface ChurchNominationConfig {
  meetingId: string;
  enabled: boolean;
  status: ChurchNominationStatus;
  deadline: string | null;
  publicToken: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ChurchNominatedPerson {
  departmentId: string;
  departmentName: string;
  personName: string;
  recommenderName?: string;
}

export interface ChurchNominationSubmission {
  id: string;
  meetingId: string;
  publicToken: string;
  participantName: string;
  selectedDepartments: string[]; // Departamentos de auto-identificação
  nominations: ChurchNominatedPerson[]; // Pessoas indicadas livremente
  createdAt: string;
  updatedAt?: string;
}

export interface ChurchDepartmentNomineeStats {
  personName: string;
  normalizedName: string;
  count: number;
  recommenders: string[]; // Nomes dos participantes que recomendaram esta pessoa
}

export interface ChurchDepartmentConsolidation {
  departmentId: string;
  departmentName: string;
  totalMentions: number;
  interestCount: number; // Quantidade de participantes que se identificam com a área
  interestedParticipants: string[]; // Nomes dos participantes que declararam interesse
  nominees: ChurchDepartmentNomineeStats[];
}

export interface ChurchNominationsReport {
  config: ChurchNominationConfig | null;
  totalSubmissions: number;
  uniqueParticipants: number;
  departmentConsolidations: ChurchDepartmentConsolidation[];
  submissions: ChurchNominationSubmission[];
}

export interface PublicChurchNominationData {
  valid: boolean;
  status: 'OPEN' | 'CLOSED' | 'DISABLED' | 'EXPIRED' | 'NOT_FOUND';
  meetingName: string;
  nominationCommissionName?: string;
  deadline: string | null;
  departments: Array<{ id: string; name: string; maxPerPerson?: number }>;
  error?: string;
}

// --- MÓDULO: COMISSÃO ORGANIZADORA ---

export interface OrganizingCommissionCriterion {
  criterionId: string;
  name: string;
  enabled: boolean;
  maxLimit: number;
  isCustom?: boolean;
}

export type OrganizingCommissionStatus = 'NOT_OPENED' | 'OPEN' | 'CLOSED';

export interface OrganizingCommissionConfig {
  meetingId: string;
  publicToken?: string;
  status?: OrganizingCommissionStatus;
  explicitlyOpened?: boolean;
  deadline?: string | null;
  closedAt?: string | null;
  criteria: OrganizingCommissionCriterion[];
  createdAt: string;
  updatedAt?: string;
}

export interface OrganizingNominationRecord {
  id: string;
  meetingId: string;
  criterionId: string;
  nomineeName: string;
  normalizedName: string;
  createdAt: string;
  participantSessionId: string;
  participantName?: string;
}

export interface OrganizingSelectedNominee {
  id: string;
  meetingId: string;
  criterionId: string;
  nomineeName: string;
  normalizedName: string;
  nominationCount: number;
  selectedForPoll: boolean;
  order: number;
}

export interface OrganizingCommissionAdminSummary {
  config: OrganizingCommissionConfig;
  effectiveStatus: 'NOT_OPENED' | 'OPEN' | 'CLOSED' | 'EXPIRED';
  participantsCount: number;
  totalNominationsCount: number;
  nominations: OrganizingNominationRecord[];
  selections: OrganizingSelectedNominee[];
  confirmedNominees?: Record<string, string[]>;
}

export interface PublicOrganizingCommissionState {
  valid: boolean;
  status: 'NOT_OPENED' | 'OPEN' | 'CLOSED' | 'EXPIRED' | 'NOT_FOUND';
  meetingId?: string;
  meetingName: string;
  nominationCommissionName?: string;
  deadline: string | null;
  criteria: OrganizingCommissionCriterion[];
  hasSubmitted?: boolean;
  sessionFinalized?: boolean;
  participantName?: string;
  error?: string;
}


