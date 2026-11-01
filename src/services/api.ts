import {
  PublicMeetingState,
  AdminMeetingState,
  Meeting,
  Poll,
  VoteResponse,
  HistoryYearGroup,
  User,
  AuthResponse,
  NominationMeetingConfig,
  NominationRecord,
  NominationAdminSummary,
  DepartmentCatalogItem,
  MeetingDepartmentConfig,
  PublicNominationState,
  ParticipantNominationSessionData,
  SaveNominationsResponse,
  SelectedNominee,
  ExpectedParticipant,
  NominationParticipantsTracking,
  AtaDocumentData,
  OrganizingAtaDocumentData,
  ChurchNominationConfig,
  ChurchNominationsReport,
  PublicChurchNominationData,
  ChurchNominatedPerson,
  OrganizingCommissionCriterion,
  OrganizingCommissionConfig,
  OrganizingNominationRecord,
  OrganizingSelectedNominee,
  OrganizingCommissionAdminSummary,
  PublicOrganizingCommissionState,
} from '../types';

import { auth, signOut } from './firebase';

// Retrieve or generate persistent anonymous session UUID for this device/browser
export function getAnonymousSessionId(): string {
  const STORAGE_KEY = 'anon_voting_session_id';
  let sessionId = localStorage.getItem(STORAGE_KEY);
  if (!sessionId) {
    sessionId = 'anon_' + crypto.randomUUID().replace(/-/g, '');
    localStorage.setItem(STORAGE_KEY, sessionId);
  }
  return sessionId;
}

// Helper to get stored auth token
export function getAdminToken(): string | null {
  return localStorage.getItem('anon_voting_admin_token');
}

export function setAdminToken(token: string): void {
  localStorage.setItem('anon_voting_admin_token', token);
}

export function removeAdminToken(): void {
  localStorage.removeItem('anon_voting_admin_token');
  localStorage.removeItem('anon_voting_user_info');
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem('anon_voting_user_info');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredUser(user: User): void {
  localStorage.setItem('anon_voting_user_info', JSON.stringify(user));
}

// --- Participant API Calls ---

export async function fetchPublicMeeting(code: string): Promise<PublicMeetingState> {
  const res = await fetch(`/api/meetings/${encodeURIComponent(code.trim())}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Reunião não encontrada.');
  }
  return res.json();
}

export async function checkHasUserVoted(
  code: string,
  pollId: string,
  sessionId: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/meetings/${encodeURIComponent(code)}/polls/${encodeURIComponent(
        pollId
      )}/has-voted?sessionId=${encodeURIComponent(sessionId)}`
    );
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.hasVoted);
  } catch {
    return false;
  }
}

export async function submitVote(
  code: string,
  pollId: string,
  optionIdOrIds: string | string[],
  anonymousSessionId: string
): Promise<VoteResponse> {
  const payload = Array.isArray(optionIdOrIds)
    ? { pollId, optionIds: optionIdOrIds, anonymousSessionId }
    : { pollId, optionId: optionIdOrIds, anonymousSessionId };

  const res = await fetch(`/api/meetings/${encodeURIComponent(code)}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Não foi possível registrar o seu voto.');
  }

  return data;
}

// --- User Authentication API Calls ---

export async function userRegister(
  username: string,
  email: string,
  password: string,
  confirmPassword: string
): Promise<AuthResponse> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password, confirmPassword }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao realizar cadastro.');
  }

  if (data.token) {
    setAdminToken(data.token);
  }
  if (data.user) {
    setStoredUser(data.user);
  }

  return data;
}

export async function userLogin(
  username: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Usuário ou senha incorretos.');
  }

  if (data.token) {
    setAdminToken(data.token);
  }
  if (data.user) {
    setStoredUser(data.user);
  }

  return data;
}

export async function loginWithGoogle(
  idToken: string,
  displayName?: string,
  photoURL?: string
): Promise<AuthResponse> {
  const res = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, displayName, photoURL }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao autenticar com conta Google.');
  }

  if (data.token) {
    setAdminToken(data.token);
  }
  if (data.user) {
    setStoredUser(data.user);
  }

  return data;
}

export async function checkUserAuth(): Promise<{ authenticated: boolean; user?: User }> {
  const token = getAdminToken();
  if (!token) return { authenticated: false };

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      removeAdminToken();
      return { authenticated: false };
    }
    const data = await res.json();
    if (data.authenticated && data.user) {
      setStoredUser(data.user);
      return { authenticated: true, user: data.user };
    }
    return { authenticated: false };
  } catch {
    return { authenticated: false };
  }
}

export async function userLogout(): Promise<void> {
  const token = getAdminToken();
  if (token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignore network errors on logout
    }
  }
  try {
    await signOut(auth);
  } catch {
    // Ignore Firebase signout error if already signed out
  }
  removeAdminToken();
}

export async function requestPasswordReset(email: string): Promise<AuthResponse> {
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao solicitar recuperação de senha.');
  }

  return data;
}

export async function verifyResetToken(token: string): Promise<{ valid: boolean; email?: string; username?: string; error?: string }> {
  try {
    const res = await fetch(`/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { valid: false, error: data.error || 'Link inválido ou expirado.' };
    }
    return data;
  } catch {
    return { valid: false, error: 'Erro de conexão ao verificar link.' };
  }
}

export async function confirmPasswordReset(
  token: string,
  newPassword: string,
  confirmPassword: string
): Promise<AuthResponse> {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword, confirmPassword }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao redefinir senha.');
  }

  return data;
}

// Backward compatibility aliases
export async function adminLogin(password: string): Promise<{ success: boolean; token: string }> {
  return userLogin(password, password) as any;
}

export async function checkAdminAuth(): Promise<boolean> {
  const res = await checkUserAuth();
  return res.authenticated;
}

export async function adminLogout(): Promise<void> {
  return userLogout();
}

export async function fetchAdminMeetings(status?: 'active' | 'closed'): Promise<Meeting[]> {
  const token = getAdminToken();
  const url = status ? `/api/admin/meetings?status=${status}` : '/api/admin/meetings';
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Falha ao carregar reuniões.');
  }
  const data = await res.json();
  return data.meetings;
}

export async function demoSeedAssistedEliminationApi(): Promise<{ success: boolean; code: string; meeting: Meeting }> {
  const token = getAdminToken();
  const res = await fetch('/api/admin/demo-seed-assisted-elimination', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao inicializar reunião de demonstração.');
  }
  return data;
}

export async function fetchMeetingsHistory(): Promise<HistoryYearGroup[]> {
  const token = getAdminToken();
  const res = await fetch('/api/admin/meetings/history', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Falha ao carregar histórico de reuniões.');
  }
  const data = await res.json();
  return data.history || [];
}

export async function deleteClosedMeeting(code: string): Promise<void> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao excluir reunião.');
  }
}

export async function deleteHistoryMonth(year: number, month: number): Promise<{ count: number }> {
  const token = getAdminToken();
  const res = await fetch('/api/admin/meetings/history/month', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ year, month }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao excluir reuniões do mês.');
  }
  return data;
}

export async function deleteHistoryYear(year: number): Promise<{ count: number }> {
  const token = getAdminToken();
  const res = await fetch('/api/admin/meetings/history/year', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ year }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao excluir reuniões do ano.');
  }
  return data;
}

export async function createAdminMeeting(
  name: string,
  description?: string,
  nominationCommissionName?: string
): Promise<Meeting> {
  const token = getAdminToken();
  const res = await fetch('/api/admin/meetings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, description, nominationCommissionName }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao criar reunião.');
  }
  return data.meeting;
}

export async function updateAdminMeeting(
  code: string,
  updates: {
    name: string;
    description?: string;
    nominationCommissionName?: string;
    congregationName?: string;
  }
): Promise<Meeting> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao atualizar dados da reunião.');
  }
  return data.meeting;
}

export async function fetchAdminMeeting(code: string): Promise<AdminMeetingState> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao carregar detalhes da reunião.');
  }
  return data;
}

export async function createPoll(
  code: string,
  question: string,
  options: string[],
  allowMultiple = false,
  maxChoices = 1,
  openImmediately = false,
  parentPollId?: string,
  isAssociatePoll = false
): Promise<Poll> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/polls`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      question,
      options,
      allowMultiple,
      maxChoices,
      openImmediately,
      parentPollId,
      isAssociatePoll: isAssociatePoll || Boolean(parentPollId),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao cadastrar pauta.');
  }
  return data.poll;
}

export async function editPollApi(
  code: string,
  pollId: string,
  data: {
    question: string;
    options: string[];
    optionItems?: Array<{ id?: string; text: string }>;
    allowMultiple?: boolean;
    maxChoices?: number;
    forceStructuralChange?: boolean;
  }
): Promise<{ success?: boolean; poll?: Poll; requiresConfirmation?: boolean; message?: string }> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/polls/${encodeURIComponent(pollId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || 'Erro ao editar pauta.');
  }
  return json;
}

export async function confirmPollCandidateApi(
  code: string,
  pollId: string,
  candidateName: string,
  optionId?: string
): Promise<{ success: boolean; poll: Poll; pollResult: any; confirmedWinnerNames?: string[] }> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/polls/${encodeURIComponent(
      pollId
    )}/confirm-candidate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ candidateName, optionId }),
    }
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || 'Erro ao confirmar candidato.');
  }
  return json;
}

export async function saveAssistedDecisionsApi(
  code: string,
  pollId: string,
  decisions: {
    candidatesConfirmed?: string[];
    candidatesRemoved?: string[];
    cutoffPercentageApplied?: number;
  }
): Promise<{ success: boolean; poll: Poll; pollResult: any }> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/polls/${encodeURIComponent(
      pollId
    )}/save-assisted-decisions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(decisions),
    }
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || 'Erro ao salvar decisões administrativas.');
  }
  return json;
}

export async function deletePollApi(code: string, pollId: string): Promise<void> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/polls/${encodeURIComponent(pollId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Erro ao excluir pauta.');
  }
}

export async function openPoll(code: string, pollId: string): Promise<void> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/polls/${encodeURIComponent(
      pollId
    )}/open`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Erro ao abrir votação.');
  }
}

export async function closePoll(code: string, pollId: string): Promise<void> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/polls/${encodeURIComponent(
      pollId
    )}/close`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Erro ao encerrar votação.');
  }
}

export async function reopenPollApi(
  code: string,
  pollId: string,
  options?: string[],
  decisionAuditInput?: {
    cutoffPercentageApplied?: number;
    candidatesConfirmed?: string[];
    candidatesKept?: string[];
    candidatesRemoved?: string[];
  }
): Promise<{ success: boolean; newPoll: Poll; previousPoll: Poll }> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/polls/${encodeURIComponent(
      pollId
    )}/reopen`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        options,
        cutoffPercentageApplied: decisionAuditInput?.cutoffPercentageApplied,
        candidatesConfirmed: decisionAuditInput?.candidatesConfirmed,
        candidatesKept: decisionAuditInput?.candidatesKept,
        candidatesRemoved: decisionAuditInput?.candidatesRemoved,
      }),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao reabrir votação.');
  }
  return data;
}

export async function closeMeeting(code: string): Promise<void> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/close`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Erro ao encerrar reunião.');
  }
}

export async function updatePollAssociatesApi(
  code: string,
  pollId: string,
  associates: string[]
): Promise<{ success: boolean; associates: string[]; poll: Poll }> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/polls/${encodeURIComponent(pollId)}/associates`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ associates }),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao salvar associados.');
  }
  return data;
}

// --- ATA DA COMISSÃO DE NOMEAÇÕES API ---

export async function fetchMeetingAta(code: string): Promise<AtaDocumentData> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/ata`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao carregar Ata da Comissão de Nomeações.');
  }
  return data.ata;
}

export async function saveMeetingAtaApi(
  code: string,
  ataData: Partial<AtaDocumentData>
): Promise<AtaDocumentData> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/ata`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(ataData),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao salvar alterações da Ata.');
  }
  return data.ata;
}

export async function saveMeetingAtaDepartmentOrderApi(
  code: string,
  departmentOrder: string[] | null
): Promise<{ success: boolean; ataDepartmentOrder?: string[]; meeting: Meeting }> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/ata-order`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ departmentOrder }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao salvar ordem dos departamentos da Ata.');
  }
  return data;
}

export async function resetMeetingAtaDepartmentOrderApi(
  code: string
): Promise<{ success: boolean; message: string; meeting: Meeting }> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/ata-order`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao restaurar ordem oficial dos departamentos.');
  }
  return data;
}

export function getMeetingAtaHtmlUrl(code: string): string {
  const token = getAdminToken() || '';
  return `/api/admin/meetings/${encodeURIComponent(code)}/ata/html?token=${encodeURIComponent(token)}`;
}

// --- ATA EXCLUSIVA DA COMISSÃO ORGANIZADORA API ---

export async function fetchOrganizingMeetingAta(code: string): Promise<OrganizingAtaDocumentData> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/organizing-commission/ata`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao carregar Ata da Comissão Organizadora.');
  }
  return data.ata;
}

export async function saveOrganizingMeetingAtaApi(
  code: string,
  ataData: Partial<OrganizingAtaDocumentData>
): Promise<OrganizingAtaDocumentData> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/organizing-commission/ata`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(ataData),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao salvar alterações da Ata da Comissão Organizadora.');
  }
  return data.ata;
}

export function getOrganizingMeetingAtaHtmlUrl(code: string): string {
  const token = getAdminToken() || '';
  return `/api/admin/meetings/${encodeURIComponent(code)}/organizing-commission/ata/html?token=${encodeURIComponent(token)}`;
}

// Retrieve stored participant first name for a specific meeting
export function getStoredParticipantName(meetingCode: string): string | null {
  if (!meetingCode) return null;
  return localStorage.getItem(`anon_part_name_${meetingCode.trim().toUpperCase()}`);
}

// Store participant first name for a specific meeting (extracts only first name)
export function setStoredParticipantName(meetingCode: string, name: string): string {
  if (!meetingCode) return '';
  const cleanFirstName = (name || '').trim().split(/\s+/)[0] || '';
  if (cleanFirstName) {
    localStorage.setItem(`anon_part_name_${meetingCode.trim().toUpperCase()}`, cleanFirstName);
  }
  return cleanFirstName;
}

// Send anonymous presence heartbeat every ~15 seconds with first name
export async function sendPresenceHeartbeat(
  code: string,
  sessionId: string,
  participantName?: string
): Promise<number> {
  try {
    const res = await fetch(`/api/meetings/${encodeURIComponent(code)}/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, participantName }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data.participantCount || 0);
  } catch {
    return 0;
  }
}

// Fetch list of active participant first names (admin only)
export async function fetchMeetingParticipants(
  code: string
): Promise<{ count: number; participants: string[] }> {
  try {
    const token = getAdminToken();
    const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/participants`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      return { count: 0, participants: [] };
    }
    const data = await res.json();
    return {
      count: data.count || 0,
      participants: data.participants || [],
    };
  } catch {
    return { count: 0, participants: [] };
  }
}

// Explicit leave meeting notification
export async function sendLeaveMeeting(code: string, sessionId: string): Promise<void> {
  try {
    await fetch(`/api/meetings/${encodeURIComponent(code)}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
  } catch {
    // Ignore network error on leave
  }
}

// Get export URLs including admin token query param
export function getMeetingExportUrl(code: string): string {
  const token = getAdminToken() || '';
  return `/api/admin/meetings/${encodeURIComponent(code)}/export?token=${encodeURIComponent(token)}`;
}

export function getMeetingReportUrl(code: string): string {
  const token = getAdminToken() || '';
  return `/api/admin/meetings/${encodeURIComponent(code)}/report?token=${encodeURIComponent(token)}`;
}

// Trigger browser download for real CSV file
export async function downloadMeetingCSV(code: string, meetingName?: string): Promise<void> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao gerar exportação CSV.');
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (meetingName || code).replace(/[^a-zA-Z0-9_-]/g, '_');
  a.download = `VOTAIASD_Reuniao_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// --- Módulo Indicações (Nominations) Admin API Calls ---

export async function fetchDepartmentCatalog(): Promise<DepartmentCatalogItem[]> {
  const token = getAdminToken();
  const res = await fetch('/api/admin/departments/catalog', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao carregar catálogo de departamentos.');
  }
  const data = await res.json();
  return data.catalog || [];
}

export async function fetchNominationConfig(code: string): Promise<NominationMeetingConfig> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/nominations/config`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao carregar configurações de indicações.');
  }
  const data = await res.json();
  return data.config;
}

export async function updateNominationConfig(
  code: string,
  updates: Partial<NominationMeetingConfig>
): Promise<NominationMeetingConfig> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/nominations/config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao salvar configurações de indicações.');
  }
  const data = await res.json();
  return data.config;
}

export async function fetchNominationSummary(code: string): Promise<NominationAdminSummary> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/nominations/summary`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao carregar resumo de indicações.');
  }
  const data = await res.json();
  return data.summary;
}

export async function generateNominationLink(
  code: string,
  payload: { deadline?: string | null; departments?: MeetingDepartmentConfig[] }
): Promise<{ success: boolean; config: NominationMeetingConfig; publicToken: string; linkPath: string }> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/nominations/generate-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao gerar link de indicações.');
  }
  return await res.json();
}

export async function fetchPublicNominationState(token: string): Promise<PublicNominationState> {
  const res = await fetch(`/api/public/nominations/${encodeURIComponent(token)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.status) {
    throw new Error(data.error || 'Falha ao consultar link de indicações.');
  }
  return data as PublicNominationState;
}

export async function startParticipantNominationSession(
  token: string,
  nominatorName: string,
  existingSessionId?: string
): Promise<{ success: boolean; sessionId: string; nominatorName: string }> {
  const res = await fetch(`/api/public/nominations/${encodeURIComponent(token)}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nominatorName, existingSessionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao iniciar sessão de indicações.');
  }
  return await res.json();
}

export async function fetchParticipantNominations(
  token: string,
  sessionId: string
): Promise<ParticipantNominationSessionData> {
  const res = await fetch(
    `/api/public/nominations/${encodeURIComponent(token)}/session/${encodeURIComponent(sessionId)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao recuperar indicações da sessão.');
  }
  return await res.json();
}

export async function saveParticipantNominations(
  token: string,
  payload: {
    sessionId: string;
    nominatorName: string;
    departmentId?: string;
    nomineeNames?: string[];
    nominations?: Record<string, string[]>;
    finalized?: boolean;
  }
): Promise<SaveNominationsResponse> {
  const res = await fetch(`/api/public/nominations/${encodeURIComponent(token)}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errorObj = new Error(err.error || 'Falha ao salvar indicações.');
    if (err.status) {
      (errorObj as any).status = err.status;
    }
    throw errorObj;
  }
  return await res.json();
}

export async function finalizeParticipantNominations(
  token: string,
  payload: {
    sessionId: string;
    nominatorName: string;
  }
): Promise<{ success: boolean; finalized: boolean; nominatorName: string }> {
  const res = await fetch(`/api/public/nominations/${encodeURIComponent(token)}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errorObj = new Error(err.error || 'Falha ao finalizar indicações.');
    if (err.status) {
      (errorObj as any).status = err.status;
    }
    throw errorObj;
  }
  return await res.json();
}

export async function fetchAdminNominations(
  code: string
): Promise<{ nominations: NominationRecord[]; summary: NominationAdminSummary }> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/nominations`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao carregar lista de indicações.');
  }
  return await res.json();
}

export async function addAdminManualNomination(
  code: string,
  payload: { departmentId: string; nomineeName: string }
): Promise<NominationRecord> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/nominations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao adicionar indicação.');
  }
  const data = await res.json();
  return data.nomination;
}

export async function updateAdminNomination(
  code: string,
  nominationId: string,
  nomineeName: string
): Promise<NominationRecord> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/nominations/${encodeURIComponent(nominationId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ nomineeName }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao atualizar indicação.');
  }
  const data = await res.json();
  return data.nomination;
}

export async function deleteAdminNomination(code: string, nominationId: string): Promise<void> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/nominations/${encodeURIComponent(nominationId)}`,
    {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao excluir indicação.');
  }
}

export async function fetchAdminSelections(code: string): Promise<SelectedNominee[]> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/nominations/selections`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao carregar seleções de candidatos.');
  }
  const data = await res.json();
  return data.selections || [];
}

export async function addAdminSelection(
  code: string,
  payload: { departmentId: string; nomineeName: string }
): Promise<SelectedNominee> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/nominations/selections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao registrar seleção.');
  }
  const data = await res.json();
  return data.selection;
}

export async function removeAdminSelection(code: string, selectionId: string): Promise<void> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/nominations/selections/${encodeURIComponent(selectionId)}`,
    {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao remover seleção.');
  }
}

export async function removeAdminSelectionByName(
  code: string,
  payload: { departmentId: string; nomineeName: string }
): Promise<void> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/nominations/selections`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao remover seleção.');
  }
}

export async function batchUpdateAdminSelections(
  code: string,
  payload: {
    departmentId: string;
    action: 'select_all' | 'deselect_all';
    nomineeNames?: string[];
  }
): Promise<SelectedNominee[]> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/nominations/selections/batch`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao atualizar seleções em lote.');
  }
  const data = await res.json();
  return data.selections || [];
}

export async function createPollFromNominations(
  code: string,
  payload: {
    departmentId: string;
    nomineeNames: string[];
    question: string;
    allowMultiple?: boolean;
    maxChoices?: number;
  }
): Promise<{ success: boolean; poll: Poll; message: string }> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/nominations/create-pauta`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao criar pauta a partir das indicações.');
  }
  return await res.json();
}

export async function updatePollConfig(
  code: string,
  pollId: string,
  payload: { allowMultiple: boolean; maxChoices: number }
): Promise<Poll> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/polls/${encodeURIComponent(pollId)}/config`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao atualizar configuração da pauta.');
  }
  const data = await res.json();
  return data.poll;
}

// --- Custom Departments API (PARTE 10-15) ---

export async function addCustomDepartment(
  code: string,
  payload: { name: string; maxPerPerson: number }
): Promise<NominationMeetingConfig> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/nominations/departments`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao adicionar departamento.');
  }
  const data = await res.json();
  return data.config;
}

export async function updateDepartment(
  code: string,
  departmentId: string,
  payload: { name?: string; maxPerPerson?: number; enabled?: boolean }
): Promise<NominationMeetingConfig> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/nominations/departments/${encodeURIComponent(
      departmentId
    )}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao atualizar departamento.');
  }
  const data = await res.json();
  return data.config;
}

export async function deleteOrDisableDepartment(
  code: string,
  departmentId: string,
  forceDisableOnly?: boolean
): Promise<{
  success: boolean;
  action: 'DELETED' | 'DISABLED';
  message: string;
  config: NominationMeetingConfig;
  hasData?: boolean;
}> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/nominations/departments/${encodeURIComponent(
      departmentId
    )}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ forceDisableOnly: Boolean(forceDisableOnly) }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao excluir/desativar departamento.');
  }
  return await res.json();
}

// --- Expected Participants & Tracking API (PARTE 20-28) ---

export async function fetchParticipantsTracking(
  code: string
): Promise<NominationParticipantsTracking> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/nominations/participants/tracking`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao carregar acompanhamento de participantes.');
  }
  const data = await res.json();
  return data.tracking;
}

export async function fetchExpectedParticipants(
  code: string
): Promise<ExpectedParticipant[]> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/nominations/participants/expected`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao carregar lista de participantes esperados.');
  }
  const data = await res.json();
  return data.expected;
}

export async function addExpectedParticipants(
  code: string,
  names: string[]
): Promise<ExpectedParticipant[]> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/nominations/participants/expected`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ names }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao adicionar participantes esperados.');
  }
  const data = await res.json();
  return data.expected;
}

export async function removeExpectedParticipant(
  code: string,
  participantId: string
): Promise<void> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(
      code
    )}/nominations/participants/expected/${encodeURIComponent(participantId)}`,
    {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao remover participante esperado.');
  }
}

export async function clearExpectedParticipants(code: string): Promise<void> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/nominations/participants/expected`,
    {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao limpar participantes esperados.');
  }
}

// ========================================================
// --- MÓDULO EXPERIMENTAL: INDICAÇÕES DA IGREJA (CONSULTIVO) ---
// ========================================================

export async function fetchChurchNominationsReport(
  code: string
): Promise<{ config: ChurchNominationConfig; report: ChurchNominationsReport }> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/church-nominations`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao obter relatório das indicações da igreja.');
  }
  return res.json();
}

export async function saveChurchNominationConfig(
  code: string,
  updates: {
    enabled?: boolean;
    status?: 'NOT_CONFIGURED' | 'OPEN' | 'CLOSED';
    deadline?: string | null;
  }
): Promise<ChurchNominationConfig> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/church-nominations/config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao salvar configurações das indicações da igreja.');
  }
  const data = await res.json();
  return data.config;
}

export async function openChurchNominations(
  code: string,
  deadline?: string | null
): Promise<{ config: ChurchNominationConfig; publicToken: string; linkPath: string }> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/church-nominations/open`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ deadline }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao abrir indicações da igreja.');
  }
  return res.json();
}

export async function closeChurchNominations(code: string): Promise<ChurchNominationConfig> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/church-nominations/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao encerrar indicações da igreja.');
  }
  const data = await res.json();
  return data.config;
}

export async function generateNewChurchNominationToken(
  code: string
): Promise<{ config: ChurchNominationConfig; publicToken: string; linkPath: string }> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/church-nominations/new-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao gerar novo link.');
  }
  return res.json();
}

export async function fetchPublicChurchNominationState(
  token: string
): Promise<PublicChurchNominationData> {
  const res = await fetch(`/api/public/church-nominations/${encodeURIComponent(token)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Link de indicações não encontrado ou expirado.');
  }
  return res.json();
}

export async function submitChurchNomination(
  token: string,
  payload: {
    participantName: string;
    selectedDepartments: string[];
    nominations: ChurchNominatedPerson[];
  }
): Promise<{ success: boolean; message: string; submissionId: string }> {
  const res = await fetch(`/api/public/church-nominations/${encodeURIComponent(token)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao enviar indicações.');
  }
  return res.json();
}

// =========================================================
// MÓDULO: COMISSÃO ORGANIZADORA
// =========================================================

export async function fetchOrganizingCommissionConfig(
  code: string
): Promise<{
  success: boolean;
  config: OrganizingCommissionConfig;
  summary: OrganizingCommissionAdminSummary;
}> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/organizing-commission`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao carregar configurações da Comissão Organizadora.');
  }
  return res.json();
}

export async function saveOrganizingCommissionConfig(
  code: string,
  criteriaOrPayload:
    | OrganizingCommissionCriterion[]
    | {
        criteria?: OrganizingCommissionCriterion[];
        deadline?: string | null;
        status?: 'NOT_OPENED' | 'OPEN' | 'CLOSED';
      }
): Promise<{
  success: boolean;
  config: OrganizingCommissionConfig;
  summary: OrganizingCommissionAdminSummary;
  message: string;
}> {
  const token = getAdminToken();
  const bodyPayload = Array.isArray(criteriaOrPayload)
    ? { criteria: criteriaOrPayload }
    : criteriaOrPayload;
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/organizing-commission/config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(bodyPayload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao salvar configurações da Comissão Organizadora.');
  }
  return res.json();
}

export async function updateOrganizingCommissionStatus(
  code: string,
  action: 'OPEN' | 'CLOSE' | 'REOPEN',
  deadline?: string | null
): Promise<{
  success: boolean;
  config: OrganizingCommissionConfig;
  summary: OrganizingCommissionAdminSummary;
  message: string;
}> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/organizing-commission/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, deadline }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao atualizar status das indicações da Comissão Organizadora.');
  }
  return res.json();
}

export async function addAdminManualOrganizingNomination(
  code: string,
  payload: { criterionId: string; nomineeName: string }
): Promise<{
  success: boolean;
  nomination: OrganizingNominationRecord;
  summary: OrganizingCommissionAdminSummary;
}> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/organizing-commission/nominations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao adicionar nome indicado.');
  }
  return res.json();
}

export async function updateAdminOrganizingNomination(
  code: string,
  nominationId: string,
  nomineeName: string
): Promise<{
  success: boolean;
  nomination: OrganizingNominationRecord;
  summary: OrganizingCommissionAdminSummary;
}> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/organizing-commission/nominations/${encodeURIComponent(nominationId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ nomineeName }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao editar ocorrência da indicação.');
  }
  return res.json();
}

export async function deleteAdminOrganizingNomination(
  code: string,
  nominationId: string
): Promise<{
  success: boolean;
  summary: OrganizingCommissionAdminSummary;
}> {
  const token = getAdminToken();
  const res = await fetch(
    `/api/admin/meetings/${encodeURIComponent(code)}/organizing-commission/nominations/${encodeURIComponent(nominationId)}`,
    {
      method: 'DELETE',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao excluir ocorrência da indicação.');
  }
  return res.json();
}

export async function toggleAdminOrganizingSelection(
  code: string,
  payload: { criterionId: string; nomineeName: string; selected?: boolean }
): Promise<{
  success: boolean;
  selections: OrganizingSelectedNominee[];
  summary: OrganizingCommissionAdminSummary;
}> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/organizing-commission/selections/toggle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao atualizar seleção do indicado.');
  }
  return res.json();
}

export async function batchUpdateAdminOrganizingSelections(
  code: string,
  payload: {
    criterionId: string;
    action: 'select_all' | 'deselect_all';
    nomineeNames?: string[];
  }
): Promise<{
  success: boolean;
  selections: OrganizingSelectedNominee[];
  summary: OrganizingCommissionAdminSummary;
}> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/organizing-commission/selections/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao atualizar seleções em lote.');
  }
  return res.json();
}

export async function createPollFromOrganizingNominations(
  code: string,
  payload: {
    criterionId: string;
    nomineeNames: string[];
    question: string;
    allowMultiple?: boolean;
    maxChoices?: number;
  }
): Promise<{
  success: boolean;
  poll: Poll;
  summary: OrganizingCommissionAdminSummary;
  message: string;
}> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/meetings/${encodeURIComponent(code)}/organizing-commission/create-pauta`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao criar pauta da Comissão Organizadora.');
  }
  return res.json();
}

// --- PUBLIC ORGANIZING COMMISSION API ---

export async function fetchPublicOrganizingCommissionState(
  token: string,
  sessionId?: string
): Promise<PublicOrganizingCommissionState> {
  const url = sessionId
    ? `/api/public/organizing-commission/${encodeURIComponent(token)}?sessionId=${encodeURIComponent(sessionId)}`
    : `/api/public/organizing-commission/${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.status) {
    throw new Error(data.error || 'Falha ao consultar link da Comissão Organizadora.');
  }
  return data as PublicOrganizingCommissionState;
}

export async function startOrganizingParticipantSession(
  token: string,
  nominatorName?: string,
  existingSessionId?: string
): Promise<{ success: boolean; sessionId: string; nominatorName: string; finalized?: boolean }> {
  const res = await fetch(`/api/public/organizing-commission/${encodeURIComponent(token)}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nominatorName, existingSessionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errorObj = new Error(err.error || 'Falha ao iniciar sessão de indicações.');
    if (err.status) {
      (errorObj as any).status = err.status;
    }
    throw errorObj;
  }
  return res.json();
}

export async function fetchParticipantOrganizingNominations(
  token: string,
  sessionId: string
): Promise<{
  sessionId: string;
  nominatorName: string;
  nominations: Record<string, string[]>;
  finalized?: boolean;
  updatedAt?: string;
}> {
  const res = await fetch(
    `/api/public/organizing-commission/${encodeURIComponent(token)}/session/${encodeURIComponent(sessionId)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao carregar indicações da sessão.');
  }
  return res.json();
}

export async function saveParticipantOrganizingNominations(
  token: string,
  payload: {
    sessionId: string;
    participantName?: string;
    nominatorName?: string;
    criterionId?: string;
    nomineeNames?: string[];
    nominations?: Record<string, string[]>;
    finalized?: boolean;
  }
): Promise<{
  success: boolean;
  savedCount: number;
  updatedAt: string;
  criterionId?: string;
  savedNames?: string[];
}> {
  const res = await fetch(`/api/public/organizing-commission/${encodeURIComponent(token)}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errorObj = new Error(err.error || 'Falha ao salvar indicações.');
    if (err.status) {
      (errorObj as any).status = err.status;
    }
    throw errorObj;
  }
  return res.json();
}

export async function finalizeParticipantOrganizingNominations(
  token: string,
  payload: {
    sessionId: string;
    nominatorName?: string;
  }
): Promise<{
  success: boolean;
  sessionId: string;
  nominatorName: string;
  finalized: boolean;
  updatedAt: string;
}> {
  const res = await fetch(`/api/public/organizing-commission/${encodeURIComponent(token)}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errorObj = new Error(err.error || 'Falha ao finalizar indicações.');
    if (err.status) {
      (errorObj as any).status = err.status;
    }
    throw errorObj;
  }
  return res.json();
}
