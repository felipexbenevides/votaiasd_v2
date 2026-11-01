import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  QrCode,
  Copy,
  Check,
  Maximize2,
  Lock,
  Play,
  Square,
  Users,
  AlertTriangle,
  Printer,
  Trash2,
  Clock,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  XCircle,
  X,
  Archive,
  Calendar,
  Sliders,
  Vote,
  Edit2,
  UserPlus,
  UserMinus,
  RotateCcw,
  RotateCw,
  FileText,
  Menu,
  Church,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Eye,
  LayoutDashboard,
  Home,
  Layers,
  Download,
  Sparkles,
  Info,
} from 'lucide-react';
import { ChurchLogo } from './ChurchLogo';
import {
  Meeting,
  AdminMeetingState,
  Poll,
  PollResult,
  OptionResult,
  HistoryYearGroup,
  User,
} from '../types';
import { formatMeetingTitle, extractBaseMeetingName } from '../utils/meetingTitle';
import {
  checkUserAuth,
  userLogout,
  getStoredUser,
  fetchAdminMeetings,
  createAdminMeeting,
  updateAdminMeeting,
  fetchAdminMeeting,
  createPoll,
  editPollApi,
  deletePollApi,
  openPoll,
  closePoll,
  closeMeeting,
  getMeetingReportUrl,
  fetchMeetingsHistory,
  deleteClosedMeeting,
  deleteHistoryMonth,
  deleteHistoryYear,
  updatePollConfig,
  updatePollAssociatesApi,
  fetchMeetingParticipants,
  reopenPollApi,
  saveAssistedDecisionsApi,
  confirmPollCandidateApi,
} from '../services/api';
import { MeetingEventSource } from '../services/realtime';
import { QRCodeModal } from './QRCodeModal';
import { MeetingHistoryView } from './MeetingHistoryView';
import { HistoryMeetingDetailModal } from './HistoryMeetingDetailModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { AuthView } from './AuthView';
import { AdminNominationsView } from './AdminNominationsView';
import { AdminOrganizingCommissionView } from './AdminOrganizingCommissionView';
import { AdminChurchNominationsTab } from './AdminChurchNominationsTab';
import { AdminParticipantsModal } from './AdminParticipantsModal';
import { ProjectionResultModal } from './ProjectionResultModal';
import { AssociadosModal } from './AssociadosModal';
import { AtaModal } from './AtaModal';
import { OrganizingAtaModal } from './OrganizingAtaModal';
import { CompactChoiceLimitSelector } from './CompactChoiceLimitSelector';
import { InstallAppModal } from './InstallAppModal';
import { canDepartmentHaveAssociates } from '../constants/departments';

const PREDEFINED_MEETING_TYPES = [
  'COMISSÃO DIRETIVA',
  'COMISSÃO DE NOMEAÇÕES',
  'REUNIÃO ADMINISTRATIVA',
] as const;

/**
 * Identifica quais candidatos têm eleição matematicamente assegurada (situação definitiva)
 * de acordo com o limite de vagas, classificação e critérios de desempate.
 * Regra: Exige estritamente mais de 50% dos votantes e posição estritamente à frente da linha de corte.
 */
export function getEligibleDefinitiveCandidates(pollResult: PollResult | null): string[] {
  if (!pollResult || !pollResult.options) return [];
  const totalVoters = pollResult.totalVoters ?? pollResult.totalVotes ?? 0;
  if (totalVoters <= 0) return [];

  const voted = [...pollResult.options]
    .filter((o) => o.votes > 0)
    .sort((a, b) => b.votes - a.votes);

  if (voted.length === 0) return [];

  if (pollResult.allowMultiple && (pollResult.maxChoices || 1) > 1) {
    const limit = Math.max(1, pollResult.maxChoices || 1);
    // Maioria absoluta estrita: 2 * votes > totalVoters
    const approved = voted.filter((o) => 2 * o.votes > totalVoters);
    if (approved.length === 0) return [];
    if (approved.length <= limit) {
      return approved.map((o) => o.text);
    }
    const cutoffVotes = approved[limit - 1].votes;
    const nextVotes = approved[limit].votes;
    if (cutoffVotes === nextVotes) {
      return approved.filter((o) => o.votes > cutoffVotes).map((o) => o.text);
    } else {
      return approved.slice(0, limit).map((o) => o.text);
    }
  } else {
    // Escolha única (1 vaga)
    const topVotes = voted[0].votes;
    const topOptions = voted.filter((o) => o.votes === topVotes);
    if (topOptions.length === 1 && 2 * topVotes > totalVoters) {
      return [topOptions[0].text];
    }
    return [];
  }
}

export interface ReopenModalCandidateOption {
  text: string;
  percentage: number;
  isEligibleDefinitive: boolean;
  isTiePending: boolean;
  selected: boolean;
}

interface AdminViewProps {
  initialMeetingCode?: string;
  onSelectMeeting?: (code: string) => void;
  currentUser?: User | null;
  onUserChange?: (user: User | null) => void;
  onLogout?: () => void;
  onSwitchToParticipant?: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  initialMeetingCode = '',
  onSelectMeeting,
  currentUser: propUser,
  onUserChange,
  onLogout,
  onSwitchToParticipant,
}) => {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(propUser || getStoredUser());
  const [resetTokenFromUrl, setResetTokenFromUrl] = useState<string>('');

  // Sidebar state (drawer for mobile, collapsible for desktop)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('admin_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('admin_sidebar_collapsed', String(next));
      }
      return next;
    });
  };

  const [activeNavModule, setActiveNavModule] = useState<
    | 'home'
    | 'active_meetings'
    | 'history'
    | 'polls'
    | 'organizing_commission_config'
    | 'organizing_received_nominations'
    | 'organizing_ata'
    | 'received_nominations'
    | 'commission_config'
    | 'church_recommendations'
    | 'ata'
  >(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'home' || tab === 'inicio') return 'home';
      if (tab === 'comissao-organizadora' || tab === 'config-organizadora') return 'organizing_commission_config';
      if (tab === 'indicacoes-organizadora' || tab === 'recebidas-organizadora') return 'organizing_received_nominations';
      if (tab === 'ata-organizadora') return 'organizing_ata';
      if (tab === 'indicacoes-recebidas' || tab === 'recebidas') return 'received_nominations';
      if (tab === 'config-comissao' || tab === 'comissao' || tab === 'indicacoes') return 'commission_config';
      if (tab === 'igreja' || tab === 'recomendacoes') return 'church_recommendations';
      if (tab === 'ata') return 'ata';
      if (tab === 'historico') return 'history';
      if (tab === 'reunioes') return 'active_meetings';
      if (tab === 'pautas') return 'polls';
    }
    return 'home';
  });

  // Synchronize state when propUser changes externally
  useEffect(() => {
    if (propUser === null && isAuthenticated) {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setMeetings([]);
      setMeetingState(null);
    } else if (propUser && isAuthenticated === false) {
      setIsAuthenticated(true);
      setCurrentUser(propUser);
      loadMeetingsList();
      loadHistory();
    }
  }, [propUser]);

  // Meetings management
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [activeCode, setActiveCode] = useState<string>(initialMeetingCode.toUpperCase());
  const [meetingState, setMeetingState] = useState<AdminMeetingState | null>(null);
  const [isLoadingMeeting, setIsLoadingMeeting] = useState(false);

  // Modals & UI Controls
  const [isCreateMeetingOpen, setIsCreateMeetingOpen] = useState(false);
  const [isMeetingTypeDropdownOpen, setIsMeetingTypeDropdownOpen] = useState(false);
  const meetingTypeDropdownRef = React.useRef<HTMLDivElement>(null);
  const [newMeetingName, setNewMeetingName] = useState('');
  const [newMeetingDesc, setNewMeetingDesc] = useState('');
  const [newNominationCommissionName, setNewNominationCommissionName] = useState('');
  const [isCreatingMeeting, setIsCreatingMeeting] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  useEffect(() => {
    if (!isCreateMeetingOpen) {
      setIsMeetingTypeDropdownOpen(false);
    }
  }, [isCreateMeetingOpen]);

  useEffect(() => {
    if (!isMeetingTypeDropdownOpen) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (meetingTypeDropdownRef.current && !meetingTypeDropdownRef.current.contains(target)) {
        setIsMeetingTypeDropdownOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMeetingTypeDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMeetingTypeDropdownOpen]);

  // Edit Meeting modal state
  const [isEditMeetingOpen, setIsEditMeetingOpen] = useState(false);
  const [editMeetingName, setEditMeetingName] = useState('');
  const [editMeetingDesc, setEditMeetingDesc] = useState('');
  const [editNominationCommissionName, setEditNominationCommissionName] = useState('');
  const [isUpdatingMeeting, setIsUpdatingMeeting] = useState(false);
  const [editMeetingError, setEditMeetingError] = useState<string | null>(null);

  // Poll creation form
  const [isCreatingPoll, setIsCreatingPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [pollMaxChoices, setPollMaxChoices] = useState(1);
  const [isSubmittingPoll, setIsSubmittingPoll] = useState(false);
  const [pollFormError, setPollFormError] = useState<string | null>(null);

  // Confirm modals
  const [confirmClosePollOpen, setConfirmClosePollOpen] = useState(false);
  const [confirmCloseMeetingOpen, setConfirmCloseMeetingOpen] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // QR Modal
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrFullscreen, setQrFullscreen] = useState(false);

  // Online participants modal
  const [isParticipantsModalOpen, setIsParticipantsModalOpen] = useState(false);
  const [isRefreshingParticipants, setIsRefreshingParticipants] = useState(false);
  const [isRefreshingMeeting, setIsRefreshingMeeting] = useState(false);

  // Projection result modal
  const [isProjectionModalOpen, setIsProjectionModalOpen] = useState(false);
  const [projectionPoll, setProjectionPoll] = useState<Poll | null>(null);
  const [projectionPollResult, setProjectionPollResult] = useState<PollResult | null>(null);

  // Associados modal state
  const [isAssociadosModalOpen, setIsAssociadosModalOpen] = useState(false);
  const [associadosPoll, setAssociadosPoll] = useState<PollResult | null>(null);
  const [isSubmittingAssociados, setIsSubmittingAssociados] = useState(false);

  // Ata modal state
  const [isAtaModalOpen, setIsAtaModalOpen] = useState(false);

  // PWA install state
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(() => {
    if (typeof window !== 'undefined' && (window as any).__deferredInstallPrompt) {
      return (window as any).__deferredInstallPrompt;
    }
    return null;
  });
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState<boolean>(false);

  useEffect(() => {
    // Detect standalone mode (already installed app)
    const isStandalone =
      (typeof window !== 'undefined' &&
        (window.matchMedia('(display-mode: standalone)').matches ||
          (window.navigator as unknown as { standalone?: boolean }).standalone === true)) ||
      false;
    setIsAppInstalled(isStandalone);

    const syncPromptFromGlobal = () => {
      if (typeof window !== 'undefined' && (window as any).__deferredInstallPrompt) {
        setDeferredInstallPrompt((window as any).__deferredInstallPrompt);
      }
    };
    syncPromptFromGlobal();

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      (window as any).__deferredInstallPrompt = e;
      setDeferredInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      (window as any).__deferredInstallPrompt = null;
      setDeferredInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('pwa-prompt-available', syncPromptFromGlobal);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-app-installed', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('pwa-prompt-available', syncPromptFromGlobal);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-app-installed', handleAppInstalled);
    };
  }, []);

  const handleTriggerNativeInstall = async () => {
    const promptEvent =
      deferredInstallPrompt ||
      (typeof window !== 'undefined' ? (window as any).__deferredInstallPrompt : null);

    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice && choice.outcome === 'accepted') {
          setIsAppInstalled(true);
        }
        setDeferredInstallPrompt(null);
        if (typeof window !== 'undefined') {
          (window as any).__deferredInstallPrompt = null;
        }
        setIsInstallModalOpen(false);
      } catch (err) {
        console.warn('Falha ao acionar prompt nativo de instalação:', err);
      }
    }
  };

  const handleInstallAppClick = () => {
    setIsInstallModalOpen(true);
  };

  // Copy feedback
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Section Navigation: 'active' | 'history' (nominations are now contextual to each meeting)
  const [adminSection, setAdminSection] = useState<'active' | 'history'>('active');
  const [meetingSubSection, setMeetingSubSection] = useState<'polls' | 'nominations'>('polls');
  const [nominationSubTab, setNominationSubTab] = useState<'nominations_list' | 'config_link' | 'church_indications'>('config_link');

  // Config Poll Choices modal for WAITING polls
  const [isConfiguringPoll, setIsConfiguringPoll] = useState(false);
  const [configPollAllowMultiple, setConfigPollAllowMultiple] = useState(false);
  const [configPollMaxChoices, setConfigPollMaxChoices] = useState(1);
  const [isSubmittingConfigPoll, setIsSubmittingConfigPoll] = useState(false);
  const [configPollError, setConfigPollError] = useState<string | null>(null);

  // Edit Poll Modal State (for closed or draft polls)
  const [isEditPollOpen, setIsEditPollOpen] = useState(false);
  const [editingPollId, setEditingPollId] = useState<string | null>(null);
  const [editPollQuestion, setEditPollQuestion] = useState('');
  const [editPollOptions, setEditPollOptions] = useState<string[]>(['', '']);
  const [editPollOptionIds, setEditPollOptionIds] = useState<(string | undefined)[]>([undefined, undefined]);
  const [editPollAllowMultiple, setEditPollAllowMultiple] = useState(false);
  const [editPollMaxChoices, setEditPollMaxChoices] = useState(1);
  const [editPollError, setEditPollError] = useState<string | null>(null);
  const [isSubmittingEditPoll, setIsSubmittingEditPoll] = useState(false);

  // Structural confirmation modal for edit poll with votes
  const [structuralConfirmModal, setStructuralConfirmModal] = useState<{
    isOpen: boolean;
    message: string;
  } | null>(null);

  // Delete Poll Modal State (for closed or draft polls)
  const [deletePollModal, setDeletePollModal] = useState<{
    isOpen: boolean;
    pollId: string | null;
    question: string;
    isDeleting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    pollId: null,
    question: '',
    isDeleting: false,
    error: null,
  });

  // Reopen / Tiebreak Poll Modal State
  const [reopenPollModal, setReopenPollModal] = useState<{
    isOpen: boolean;
    poll: Poll | PollResult | null;
    isTie: boolean;
    options: ReopenModalCandidateOption[];
    customOptions: string[];
    isSubmitting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    poll: null,
    isTie: false,
    options: [],
    customOptions: [],
    isSubmitting: false,
    error: null,
  });
  const [expandedRoundHistory, setExpandedRoundHistory] = useState<Record<string, boolean>>({});

  // Assisted Elimination State for Current Closed Poll
  const [assistedCutoffPercentage, setAssistedCutoffPercentage] = useState<number>(25);
  const [assistedConfirmedCandidates, setAssistedConfirmedCandidates] = useState<string[]>([]);
  const [assistedEliminatedCandidates, setAssistedEliminatedCandidates] = useState<string[]>([]);
  const [isSubmittingAssistedCut, setIsSubmittingAssistedCut] = useState(false);
  const [assistedCutError, setAssistedCutError] = useState<string | null>(null);

  const activePollId = meetingState?.currentPoll?.id;
  const activePollStatus = meetingState?.currentPoll?.status;

  useEffect(() => {
    if (meetingState?.currentPollResult && activePollStatus === 'CLOSED') {
      const res = meetingState.currentPollResult;
      const round = res.round || meetingState.currentPoll?.round || 1;
      const defaultCutoff = res.suggestedCutoffPercentage || (round === 1 ? 25 : round === 2 ? 35 : 40);

      const audit = meetingState.currentPoll?.decisionAudit;

      if (audit?.cutoffPercentageApplied !== undefined) {
        setAssistedCutoffPercentage(audit.cutoffPercentageApplied);
      } else {
        setAssistedCutoffPercentage(defaultCutoff);
      }

      const confirmed = Array.isArray(meetingState.currentPoll?.confirmedWinnerNames) && meetingState.currentPoll.confirmedWinnerNames.length > 0
        ? meetingState.currentPoll.confirmedWinnerNames
        : Array.isArray(audit?.confirmedWinnersThisRound)
        ? audit!.confirmedWinnersThisRound
        : [];
      setAssistedConfirmedCandidates(confirmed);

      const eliminated = Array.isArray(audit?.candidatesRemovedByAdmin)
        ? audit!.candidatesRemovedByAdmin
        : [];
      setAssistedEliminatedCandidates(eliminated);

      setAssistedCutError(null);
    }
  }, [activePollId, activePollStatus, meetingState?.currentPoll?.decisionAudit, meetingState?.currentPoll?.confirmedWinnerNames]);

  const handleSaveAssistedDecisions = async () => {
    if (!meetingState?.currentPoll || !activeCode) return;
    const pollId = meetingState.currentPoll.id;
    setIsSubmittingAssistedCut(true);
    setAssistedCutError(null);
    try {
      await saveAssistedDecisionsApi(activeCode, pollId, {
        candidatesConfirmed: assistedConfirmedCandidates,
        candidatesRemoved: assistedEliminatedCandidates,
        cutoffPercentageApplied: assistedCutoffPercentage,
      });
      await loadActiveMeeting(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar decisões administrativas.';
      setAssistedCutError(msg);
    } finally {
      setIsSubmittingAssistedCut(false);
    }
  };

  const toggleConfirmCandidate = (candidateName: string) => {
    setAssistedConfirmedCandidates((prev) => {
      if (prev.includes(candidateName)) {
        return prev.filter((name) => name !== candidateName);
      } else {
        setAssistedEliminatedCandidates((elim) => elim.filter((e) => e !== candidateName));
        return [...prev, candidateName];
      }
    });
    setAssistedCutError(null);
  };

  const toggleEliminateCandidate = (candidateName: string) => {
    setAssistedEliminatedCandidates((prev) => {
      if (prev.includes(candidateName)) {
        return prev.filter((name) => name !== candidateName);
      } else {
        if (assistedConfirmedCandidates.includes(candidateName)) {
          return prev;
        }
        return [...prev, candidateName];
      }
    });
    setAssistedCutError(null);
  };

  const handleConfirmAllEligible = () => {
    if (!meetingState?.currentPollResult) return;
    const eligible = getEligibleDefinitiveCandidates(meetingState.currentPollResult);
    setAssistedConfirmedCandidates((prev) => Array.from(new Set([...prev, ...eligible])));
    setAssistedEliminatedCandidates((prev) => prev.filter((name) => !eligible.includes(name)));
    setAssistedCutError(null);
  };

  const handleMarkBelowCutoff = () => {
    if (!meetingState?.currentPollResult) return;
    const belowCutoff = meetingState.currentPollResult.options
      .filter((opt) => opt.percentage < assistedCutoffPercentage)
      .map((opt) => opt.text)
      .filter((text) => !assistedConfirmedCandidates.includes(text));

    setAssistedEliminatedCandidates((prev) => Array.from(new Set([...prev, ...belowCutoff])));
    setAssistedCutError(null);
  };

  const handleClearAssistedSelections = () => {
    setAssistedEliminatedCandidates([]);
    setAssistedCutError(null);
  };

  const handleConfirmAssistedCutAndReopen = async () => {
    if (!meetingState?.currentPoll || !activeCode) return;
    const currentPoll = meetingState.currentPoll;
    const pollId = currentPoll.id;

    const rootPollId = currentPoll.rootPollId || currentPoll.id;
    const round = currentPoll.round || 1;

    const earlierConfirmedSet = new Set<string>();
    if (meetingState.history) {
      const earlierClosedRounds = meetingState.history.filter((h: any) => {
        const hRootId = h.rootPollId || h.pollId;
        const hRound = h.round || 1;
        return hRootId === rootPollId && h.pollId !== pollId && hRound < round;
      });
      for (const h of earlierClosedRounds) {
        if (Array.isArray(h.decisionAudit?.confirmedWinnersThisRound)) {
          h.decisionAudit.confirmedWinnersThisRound.forEach((w: string) =>
            earlierConfirmedSet.add(w.trim().toLowerCase())
          );
        } else if (Array.isArray(h.confirmedWinnerNames)) {
          h.confirmedWinnerNames.forEach((w: string) =>
            earlierConfirmedSet.add(w.trim().toLowerCase())
          );
        } else if (Array.isArray(h.winnerOptionTexts) && h.winnerOptionTexts.length > 0) {
          h.winnerOptionTexts.forEach((w: string) =>
            earlierConfirmedSet.add(w.trim().toLowerCase())
          );
        }
      }
    }
    const earlierConfirmedCount = earlierConfirmedSet.size;

    const allCandidateTexts = currentPoll.options.map((o) => o.text.trim());
    const initialSeats = meetingState.currentPollResult?.rootMaxChoices || (currentPoll.allowMultiple ? Math.max(1, currentPoll.maxChoices || 1) : 1);
    const isMultiSeat = Boolean(currentPoll.allowMultiple || initialSeats > 1);
    const totalConfirmedCount = earlierConfirmedCount + assistedConfirmedCandidates.length;
    const remainingOpenSeats = isMultiSeat
      ? Math.max(0, initialSeats - totalConfirmedCount)
      : (totalConfirmedCount > 0 ? 0 : 1);

    const candidatesKept = allCandidateTexts.filter(
      (text) =>
        !assistedConfirmedCandidates.some((c) => c.toLowerCase() === text.toLowerCase()) &&
        !assistedEliminatedCandidates.some((e) => e.toLowerCase() === text.toLowerCase())
    );

    const minRequired = currentPoll.source === 'INDICATIONS' ? 1 : 2;

    if (isMultiSeat && candidatesKept.length < remainingOpenSeats) {
      setAssistedCutError(
        `Não é possível iniciar a nova rodada: a quantidade de candidatos restantes (${candidatesKept.length}) é inferior ao número de vagas disponíveis (${remainingOpenSeats}). Mantenha pelo menos ${remainingOpenSeats} candidato(s).`
      );
      return;
    }

    if (candidatesKept.length < minRequired) {
      setAssistedCutError(
        `A nova rodada deve possuir pelo menos ${minRequired} candidato(s) na disputa.`
      );
      return;
    }

    setIsSubmittingAssistedCut(true);
    setAssistedCutError(null);

    try {
      await reopenPollApi(activeCode, pollId, candidatesKept, {
        cutoffPercentageApplied: assistedCutoffPercentage,
        candidatesKept,
        candidatesRemoved: assistedEliminatedCandidates,
        candidatesConfirmed: assistedConfirmedCandidates,
      });

      setAssistedConfirmedCandidates([]);
      setAssistedEliminatedCandidates([]);
      await loadActiveMeeting(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao iniciar nova rodada com corte assistido.';
      setAssistedCutError(msg);
    } finally {
      setIsSubmittingAssistedCut(false);
    }
  };

  // Computed values for current closed poll assisted elimination
  const closedPollAssistedStats = useMemo(() => {
    if (!meetingState?.currentPoll || meetingState.currentPoll.status !== 'CLOSED' || !meetingState.currentPollResult) {
      return null;
    }
    const poll = meetingState.currentPoll;
    const res = meetingState.currentPollResult;
    const rootPollId = poll.rootPollId || poll.id;
    const round = poll.round || 1;
    const nextRound = round + 1;

    const earlierConfirmedSet = new Set<string>();
    if (meetingState.history) {
      const earlierClosedRounds = meetingState.history.filter((h: any) => {
        const hRootId = h.rootPollId || h.pollId;
        const hRound = h.round || 1;
        return hRootId === rootPollId && h.pollId !== poll.id && hRound < round;
      });
      for (const h of earlierClosedRounds) {
        if (Array.isArray(h.decisionAudit?.confirmedWinnersThisRound)) {
          h.decisionAudit.confirmedWinnersThisRound.forEach((w: string) =>
            earlierConfirmedSet.add(w.trim().toLowerCase())
          );
        } else if (Array.isArray(h.confirmedWinnerNames)) {
          h.confirmedWinnerNames.forEach((w: string) =>
            earlierConfirmedSet.add(w.trim().toLowerCase())
          );
        } else if (Array.isArray(h.winnerOptionTexts) && h.winnerOptionTexts.length > 0) {
          h.winnerOptionTexts.forEach((w: string) =>
            earlierConfirmedSet.add(w.trim().toLowerCase())
          );
        }
      }
    }
    const earlierConfirmedCount = earlierConfirmedSet.size;

    const initialSeats = res.rootMaxChoices || (poll.allowMultiple ? Math.max(1, poll.maxChoices || 1) : 1);
    const isMultiSeat = Boolean(poll.allowMultiple || initialSeats > 1);
    const confirmedCount = assistedConfirmedCandidates.length;
    const totalConfirmedCount = earlierConfirmedCount + confirmedCount;
    const remainingOpenSeats = isMultiSeat
      ? Math.max(0, initialSeats - totalConfirmedCount)
      : (totalConfirmedCount > 0 ? 0 : 1);

    const eligibleCandidates = getEligibleDefinitiveCandidates(res);
    const keptCandidates = res.options.filter(
      (opt) =>
        !assistedConfirmedCandidates.includes(opt.text) &&
        !assistedEliminatedCandidates.includes(opt.text)
    );
    const hasSeatDeficit = isMultiSeat && remainingOpenSeats > 0 && keptCandidates.length < remainingOpenSeats;
    const minRequired = poll.source === 'INDICATIONS' ? 1 : 2;
    const hasUnderMinRequired = remainingOpenSeats > 0 && keptCandidates.length < minRequired;
    const isAllSeatsFilled = remainingOpenSeats === 0;

    return {
      poll,
      res,
      round,
      nextRound,
      initialSeats,
      confirmedCount,
      totalConfirmedCount,
      remainingOpenSeats,
      eligibleCandidates,
      keptCandidates,
      hasSeatDeficit,
      minRequired,
      hasUnderMinRequired,
      isAllSeatsFilled,
    };
  }, [
    meetingState?.currentPoll,
    meetingState?.currentPollResult,
    meetingState?.history,
    assistedConfirmedCandidates,
    assistedEliminatedCandidates,
  ]);

  // History State
  const [historyData, setHistoryData] = useState<HistoryYearGroup[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Detail Modal for Closed Meeting in History
  const [selectedHistoryMeetingCode, setSelectedHistoryMeetingCode] = useState<string | null>(null);

  // Deletion Modal
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: 'meeting' | 'month' | 'year';
    meetingCode?: string;
    meetingName?: string;
    year?: number;
    month?: number;
    monthName?: string;
    count?: number;
    isDeleting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    type: 'meeting',
    isDeleting: false,
    error: null,
  });

  // Check auth on mount and URL tokens
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('oobCode') || params.get('reset_token') || params.get('token');
    if (resetToken) {
      setResetTokenFromUrl(resetToken);
    }

    const tabParam = params.get('tab');
    if (tabParam === 'indicacoes') {
      setMeetingSubSection('nominations');
    }

    checkUserAuth().then((res) => {
      setIsAuthenticated(res.authenticated);
      if (res.authenticated && res.user) {
        setCurrentUser(res.user);
        onUserChange?.(res.user);
        loadMeetingsList();
        loadHistory();
      } else {
        setCurrentUser(null);
        onUserChange?.(null);
      }
    });
  }, []);

  const handleAuthSuccess = async (user: User) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    onUserChange?.(user);
    await loadMeetingsList();
    await loadHistory();
  };

  const handleLogout = async () => {
    await userLogout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    onUserChange?.(null);
    onLogout?.();
    setMeetings([]);
    setMeetingState(null);
  };

  const loadMeetingsList = async () => {
    try {
      const list = (await fetchAdminMeetings()).filter(
        (m) =>
          !m.isDemo &&
          m.code !== 'DEMO25' &&
          m.id !== 'demo-meeting-2026' &&
          m.name !== 'TESTE — ELIMINAÇÃO ASSISTIDA V2'
      );
      setMeetings(list);
      const activeList = list.filter((m) => m.status !== 'MEETING_CLOSED');
      if (activeList.length > 0) {
        if (!activeCode || !activeList.some((m) => m.code === activeCode)) {
          setActiveCode(activeList[0].code);
        }
      } else {
        setActiveCode('');
        setMeetingState(null);
      }
    } catch (err) {
      console.error('Error loading meetings list:', err);
    }
  };

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const data = await fetchMeetingsHistory();
      setHistoryData(data);
    } catch (err) {
      console.error('Error loading history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Deletion handlers
  const handleOpenDeleteMeeting = (code: string, name: string) => {
    setDeleteModal({
      isOpen: true,
      type: 'meeting',
      meetingCode: code,
      meetingName: name,
      isDeleting: false,
      error: null,
    });
  };

  const handleOpenDeleteMonth = (
    year: number,
    month: number,
    monthName: string,
    count: number
  ) => {
    setDeleteModal({
      isOpen: true,
      type: 'month',
      year,
      month,
      monthName,
      count,
      isDeleting: false,
      error: null,
    });
  };

  const handleOpenDeleteYear = (year: number, count: number) => {
    setDeleteModal({
      isOpen: true,
      type: 'year',
      year,
      count,
      isDeleting: false,
      error: null,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.type) return;
    setDeleteModal((prev) => ({ ...prev, isDeleting: true, error: null }));

    try {
      if (deleteModal.type === 'meeting' && deleteModal.meetingCode) {
        await deleteClosedMeeting(deleteModal.meetingCode);
        if (selectedHistoryMeetingCode === deleteModal.meetingCode) {
          setSelectedHistoryMeetingCode(null);
        }
      } else if (deleteModal.type === 'month' && deleteModal.year && deleteModal.month) {
        await deleteHistoryMonth(deleteModal.year, deleteModal.month);
        setSelectedHistoryMeetingCode(null);
      } else if (deleteModal.type === 'year' && deleteModal.year) {
        await deleteHistoryYear(deleteModal.year);
        setSelectedHistoryMeetingCode(null);
      }

      setDeleteModal((prev) => ({ ...prev, isOpen: false, isDeleting: false, error: null }));
      await loadHistory();
      await loadMeetingsList();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao realizar exclusão.';
      setDeleteModal((prev) => ({ ...prev, isDeleting: false, error: msg }));
    }
  };

  const handleCancelDelete = () => {
    if (deleteModal.isDeleting) return;
    setDeleteModal({
      isOpen: false,
      type: 'meeting',
      isDeleting: false,
      error: null,
    });
  };

  // Load meeting state
  const loadActiveMeeting = useCallback(async (code: string) => {
    if (!code) return;
    setIsLoadingMeeting(true);
    try {
      const data = await fetchAdminMeeting(code);
      setMeetingState(data);
      onSelectMeeting?.(code);
    } catch (err) {
      console.error('Error loading meeting details:', err);
    } finally {
      setIsLoadingMeeting(false);
    }
  }, [onSelectMeeting]);

  useEffect(() => {
    if (isAuthenticated && activeCode) {
      loadActiveMeeting(activeCode);
    }
  }, [isAuthenticated, activeCode, loadActiveMeeting]);

  // Connect Real-Time SSE for Admin
  useEffect(() => {
    if (!isAuthenticated || !activeCode) return;

    const token = localStorage.getItem('anon_voting_admin_token');
    const sse = new MeetingEventSource(
      activeCode,
      {
        onAdminInit: (state) => {
          setMeetingState(state);
        },
        onPresenceUpdate: (data) => {
          setMeetingState((prev) =>
            prev
              ? {
                  ...prev,
                  participantCount: data.participantCount,
                  participants: data.participants ?? prev.participants,
                }
              : null
          );
        },
        onPollChanged: (data) => {
          setMeetingState(data as AdminMeetingState);
        },
        onVoteUpdate: (data) => {
          const pollResult = data as PollResult;
          setMeetingState((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              currentPollResult: pollResult,
            };
          });
        },
        onMeetingEnded: (data) => {
          setMeetingState(data as AdminMeetingState);
        },
      },
      token
    );

    return () => {
      sse.close();
    };
  }, [isAuthenticated, activeCode]);

  // Refresh online participants list
  const handleRefreshParticipants = async () => {
    if (!meetingState?.meeting.code) return;
    setIsRefreshingParticipants(true);
    try {
      const res = await fetchMeetingParticipants(meetingState.meeting.code);
      setMeetingState((prev) =>
        prev
          ? {
              ...prev,
              participantCount: res.count,
              participants: res.participants,
            }
          : null
      );
    } catch {
      // Ignore network errors on refresh
    } finally {
      setIsRefreshingParticipants(false);
    }
  };

  // Refresh current meeting data without reloading the browser page (Requirement 3)
  const handleRefreshMeeting = async () => {
    if (!activeCode) return;
    setIsRefreshingMeeting(true);
    try {
      await Promise.all([
        loadActiveMeeting(activeCode),
        loadMeetingsList(),
        loadHistory(),
        handleRefreshParticipants(),
      ]);
    } catch (err) {
      console.error('Erro ao atualizar reunião:', err);
    } finally {
      setIsRefreshingMeeting(false);
    }
  };

  // Open Associados modal
  const handleOpenAssociadosModal = (pollResult: PollResult) => {
    setAssociadosPoll(pollResult);
    setIsAssociadosModalOpen(true);
  };

  // Submit Associados poll
  const handleSubmitAssociados = async (
    question: string,
    options: string[],
    allowMultiple: boolean,
    maxChoices: number,
    shouldOpen: boolean
  ) => {
    if (!activeCode) return;
    setIsSubmittingAssociados(true);
    try {
      await createPoll(
        activeCode,
        question,
        options,
        allowMultiple,
        maxChoices,
        shouldOpen,
        associadosPoll?.pollId,
        true
      );
      await loadActiveMeeting(activeCode);
    } finally {
      setIsSubmittingAssociados(false);
    }
  };

  // Direct save of associates without voting
  const handleSaveDirectAssociates = async (pollId: string, associates: string[]) => {
    if (!activeCode) return;
    setIsSubmittingAssociados(true);
    try {
      await updatePollAssociatesApi(activeCode, pollId, associates);
      await loadActiveMeeting(activeCode);
    } finally {
      setIsSubmittingAssociados(false);
    }
  };

  // Handle Create Meeting
  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMeetingName.trim()) return;

    setIsCreatingMeeting(true);
    try {
      const created = await createAdminMeeting(
        newMeetingName.trim(),
        newMeetingDesc.trim() || undefined,
        newNominationCommissionName.trim() || undefined
      );
      await loadMeetingsList();
      setActiveCode(created.code);
      setAdminSection('active');
      setIsCreateMeetingOpen(false);
      setIsMeetingTypeDropdownOpen(false);
      setNewMeetingName('');
      setNewMeetingDesc('');
      setNewNominationCommissionName('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao criar reunião.');
    } finally {
      setIsCreatingMeeting(false);
    }
  };

  // Handle Open and Submit Edit Meeting
  const handleOpenEditMeeting = () => {
    if (!meetingState?.meeting) return;
    const { baseName, congregation } = extractBaseMeetingName(
      meetingState.meeting.name,
      meetingState.meeting.nominationCommissionName
    );
    setEditMeetingName(baseName || '');
    setEditMeetingDesc(meetingState.meeting.description || '');
    setEditNominationCommissionName(congregation || '');
    setEditMeetingError(null);
    setIsEditMeetingOpen(true);
  };

  const handleUpdateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingState?.meeting || !editMeetingName.trim()) return;

    setIsUpdatingMeeting(true);
    setEditMeetingError(null);
    try {
      const updated = await updateAdminMeeting(meetingState.meeting.code, {
        name: editMeetingName.trim(),
        description: editMeetingDesc.trim() || undefined,
        nominationCommissionName: editNominationCommissionName.trim() || undefined,
      });

      // Update current meetingState immediately
      setMeetingState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          meeting: {
            ...prev.meeting,
            name: updated.name,
            description: updated.description,
            nominationCommissionName: updated.nominationCommissionName,
          },
        };
      });

      // Update meetings list
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === updated.id
            ? {
                ...m,
                name: updated.name,
                description: updated.description,
                nominationCommissionName: updated.nominationCommissionName,
              }
            : m
        )
      );

      setIsEditMeetingOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar reunião.';
      setEditMeetingError(msg);
    } finally {
      setIsUpdatingMeeting(false);
    }
  };

  // Add Option to poll form
  const handleAddOption = () => {
    setPollOptions([...pollOptions, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (pollOptions.length <= 2) {
      alert('A pauta deve ter pelo menos 2 opções.');
      return;
    }
    const updated = [...pollOptions];
    updated.splice(index, 1);
    setPollOptions(updated);
  };

  const handleOptionChange = (index: number, value: string) => {
    const updated = [...pollOptions];
    updated[index] = value;
    setPollOptions(updated);
  };

  // Apply Preset
  const applyPreset = (preset: string[]) => {
    setPollOptions(preset);
  };

  // Start New Poll with blank options and single-choice defaults
  const startNewPoll = () => {
    setIsCreatingPoll(true);
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollAllowMultiple(false);
    setPollMaxChoices(1);
    setPollFormError(null);
  };

  // Create and Optionally Open Poll (SALVAR ou ABRIR VOTAÇÃO IMEDIATAMENTE)
  const handleSavePoll = async (shouldOpen = false) => {
    if (!activeCode) return;
    if (!pollQuestion.trim()) {
      setPollFormError('Digite a pergunta da pauta.');
      return;
    }

    const cleanOptions = pollOptions.map((o) => o.trim()).filter((o) => o.length > 0);
    if (cleanOptions.length < 2) {
      setPollFormError('Adicione pelo menos 2 opções válidas.');
      return;
    }

    if (pollAllowMultiple) {
      if (isNaN(pollMaxChoices) || pollMaxChoices < 1) {
        setPollFormError('O limite de escolhas deve ser um número inteiro maior que zero.');
        return;
      }
      if (pollMaxChoices > cleanOptions.length) {
        setPollFormError(
          `O limite de escolhas (${pollMaxChoices}) não pode ser maior que o número de opções da pauta (${cleanOptions.length}).`
        );
        return;
      }
    }

    setIsSubmittingPoll(true);
    setPollFormError(null);

    try {
      await createPoll(
        activeCode,
        pollQuestion,
        cleanOptions,
        pollAllowMultiple,
        pollAllowMultiple ? pollMaxChoices : 1,
        shouldOpen
      );
      setIsCreatingPoll(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      setPollAllowMultiple(false);
      setPollMaxChoices(1);
      await loadActiveMeeting(activeCode);
    } catch (err: unknown) {
      setPollFormError(err instanceof Error ? err.message : 'Erro ao salvar pauta.');
    } finally {
      setIsSubmittingPoll(false);
    }
  };

  // Computed lookup map for option percentage results when editing a poll
  const editingPollResultsMap = useMemo(() => {
    if (!editingPollId) return new Map<string, number>();
    const map = new Map<string, number>();

    if (meetingState?.currentPollResult && (meetingState.currentPollResult.pollId === editingPollId || meetingState.currentPoll?.id === editingPollId)) {
      meetingState.currentPollResult.options?.forEach((opt) => {
        map.set(opt.text.trim().toLowerCase(), opt.percentage);
        if (opt.optionId) map.set(opt.optionId, opt.percentage);
      });
    }

    if (meetingState?.history) {
      const hist = meetingState.history.find((h) => h.pollId === editingPollId);
      if (hist && hist.options) {
        hist.options.forEach((opt) => {
          map.set(opt.text.trim().toLowerCase(), opt.percentage);
          if (opt.optionId) map.set(opt.optionId, opt.percentage);
        });
      }
    }
    return map;
  }, [editingPollId, meetingState?.currentPollResult, meetingState?.currentPoll, meetingState?.history]);

  // Handlers for Editing Polls (Closed or Saved Drafts)
  const handleOpenEditClosedPoll = (poll: Poll | PollResult) => {
    const pId = 'pollId' in poll ? poll.pollId : poll.id;
    setEditingPollId(pId);
    setEditPollQuestion(poll.question);

    const rawOptions = poll.options || [];
    const optionsWithMetrics = rawOptions.map((o: any, origIdx: number) => {
      const text = (typeof o === 'string' ? o : o.text || '').trim();
      let optId: string | undefined = typeof o === 'object' ? (o.optionId || o.id) : undefined;

      let percentage: number | undefined = undefined;
      let votes: number | undefined = undefined;

      if (typeof o === 'object') {
        if (typeof o.percentage === 'number') percentage = o.percentage;
        if (typeof o.votes === 'number') votes = o.votes;
      }

      if (
        (percentage === undefined || !optId) &&
        meetingState?.currentPollResult &&
        (meetingState.currentPollResult.pollId === pId || meetingState.currentPoll?.id === pId)
      ) {
        const found = meetingState.currentPollResult.options?.find(
          (opt) => (optId && opt.optionId === optId) || opt.text.trim().toLowerCase() === text.toLowerCase()
        );
        if (found) {
          if (percentage === undefined) percentage = found.percentage;
          if (votes === undefined) votes = found.votes;
          if (!optId && found.optionId) optId = found.optionId;
        }
      }

      if ((percentage === undefined || !optId) && meetingState?.history) {
        const hist = meetingState.history.find((h) => h.pollId === pId);
        if (hist && hist.options) {
          const found = hist.options.find(
            (opt) => (optId && opt.optionId === optId) || opt.text.trim().toLowerCase() === text.toLowerCase()
          );
          if (found) {
            if (percentage === undefined) percentage = found.percentage;
            if (votes === undefined) votes = found.votes;
            if (!optId && found.optionId) optId = found.optionId;
          }
        }
      }

      return {
        id: optId,
        text,
        percentage,
        votes,
        origIdx,
      };
    });

    const hasResults = optionsWithMetrics.some((item) => typeof item.percentage === 'number');

    if (hasResults) {
      optionsWithMetrics.sort((a, b) => {
        const pctA = typeof a.percentage === 'number' ? a.percentage : -1;
        const pctB = typeof b.percentage === 'number' ? b.percentage : -1;
        if (pctB !== pctA) {
          return pctB - pctA;
        }
        const votesA = typeof a.votes === 'number' ? a.votes : -1;
        const votesB = typeof b.votes === 'number' ? b.votes : -1;
        if (votesB !== votesA) {
          return votesB - votesA;
        }
        return a.origIdx - b.origIdx;
      });
    }

    const optionTexts = optionsWithMetrics.map((item) => item.text);
    const optionIds = optionsWithMetrics.map((item) => item.id);
    if (optionTexts.length >= 2) {
      setEditPollOptions(optionTexts);
      setEditPollOptionIds(optionIds);
    } else {
      setEditPollOptions([...optionTexts, '']);
      setEditPollOptionIds([...optionIds, undefined]);
    }
    setEditPollAllowMultiple(Boolean(poll.allowMultiple));
    setEditPollMaxChoices(poll.maxChoices || 1);
    setEditPollError(null);
    setStructuralConfirmModal(null);
    setIsEditPollOpen(true);
  };

  const handleEditAddOption = () => {
    setEditPollOptions((prev) => [...prev, '']);
    setEditPollOptionIds((prev) => [...prev, undefined]);
  };

  const handleEditRemoveOption = (index: number) => {
    if (editPollOptions.length <= 2) return;
    setEditPollOptions((prev) => prev.filter((_, i) => i !== index));
    setEditPollOptionIds((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEditOptionChange = (index: number, value: string) => {
    setEditPollOptions((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleSaveEditPoll = async (force = false) => {
    if (!activeCode || !editingPollId) return;
    if (!editPollQuestion.trim()) {
      setEditPollError('Digite a pergunta da pauta.');
      return;
    }
    const cleanOptionItems = editPollOptions
      .map((o, idx) => ({
        id: editPollOptionIds[idx],
        text: o.trim(),
      }))
      .filter((item) => item.text.length > 0);
    const cleanOptions = cleanOptionItems.map((item) => item.text);
    if (cleanOptions.length < 2) {
      setEditPollError('Adicione pelo menos 2 opções válidas.');
      return;
    }
    if (editPollAllowMultiple) {
      if (isNaN(editPollMaxChoices) || editPollMaxChoices < 1) {
        setEditPollError('O limite de escolhas deve ser um número inteiro maior que zero.');
        return;
      }
      if (editPollMaxChoices > cleanOptions.length) {
        setEditPollError(
          `O limite de escolhas (${editPollMaxChoices}) não pode ser maior que o número de opções da pauta (${cleanOptions.length}).`
        );
        return;
      }
    }

    setIsSubmittingEditPoll(true);
    setEditPollError(null);

    try {
      const res = await editPollApi(activeCode, editingPollId, {
        question: editPollQuestion,
        options: cleanOptions,
        optionItems: cleanOptionItems,
        allowMultiple: editPollAllowMultiple,
        maxChoices: editPollAllowMultiple ? editPollMaxChoices : 1,
        forceStructuralChange: force,
      });

      if (res.requiresConfirmation) {
        setStructuralConfirmModal({
          isOpen: true,
          message:
            res.message ||
            'Esta pauta já possui votos registrados. Alterar as opções ou a estrutura da votação pode afetar a interpretação dos resultados existentes. Deseja realmente continuar?',
        });
        setIsSubmittingEditPoll(false);
        return;
      }

      setIsEditPollOpen(false);
      setStructuralConfirmModal(null);
      await loadActiveMeeting(activeCode);
    } catch (err: unknown) {
      setEditPollError(err instanceof Error ? err.message : 'Erro ao salvar alterações da pauta.');
    } finally {
      setIsSubmittingEditPoll(false);
    }
  };

  // Handlers for Deleting Polls (Closed or Saved Drafts)
  const handleOpenDeleteClosedPoll = (poll: Poll | PollResult) => {
    const pId = 'pollId' in poll ? poll.pollId : poll.id;
    setDeletePollModal({
      isOpen: true,
      pollId: pId,
      question: poll.question,
      isDeleting: false,
      error: null,
    });
  };

  const handleConfirmDeletePoll = async () => {
    if (!activeCode || !deletePollModal.pollId) return;
    setDeletePollModal((prev) => ({ ...prev, isDeleting: true, error: null }));
    try {
      await deletePollApi(activeCode, deletePollModal.pollId);
      setDeletePollModal({
        isOpen: false,
        pollId: null,
        question: '',
        isDeleting: false,
        error: null,
      });
      await loadActiveMeeting(activeCode);
    } catch (err: unknown) {
      setDeletePollModal((prev) => ({
        ...prev,
        isDeleting: false,
        error: err instanceof Error ? err.message : 'Erro ao excluir pauta.',
      }));
    }
  };

  // Reopen Poll Handlers
  const handleOpenReopenModal = (pollOrResult: Poll | PollResult) => {
    const isTie = 'isTie' in pollOrResult ? Boolean(pollOrResult.isTie) : false;
    const tieOptions =
      'tieOptions' in pollOrResult && Array.isArray(pollOrResult.tieOptions)
        ? pollOrResult.tieOptions.map((t: string) => t.trim().toLowerCase())
        : [];
    const excessOptions =
      'excessEligibleOptions' in pollOrResult && Array.isArray(pollOrResult.excessEligibleOptions)
        ? pollOrResult.excessEligibleOptions.map((t: string) => t.trim().toLowerCase())
        : [];
    const pendingTieList = new Set([...tieOptions, ...excessOptions]);
    const highlightList = tieOptions.length > 0 ? tieOptions : excessOptions;

    const eligibleSet = new Set(
      ('totalVoters' in pollOrResult || 'totalVotes' in pollOrResult
        ? getEligibleDefinitiveCandidates(pollOrResult as PollResult)
        : []
      ).map((name) => name.trim().toLowerCase())
    );

    const rawOptions = pollOrResult.options || [];
    const initialOptions: ReopenModalCandidateOption[] = rawOptions.map((opt: any) => {
      const text = (typeof opt === 'string' ? opt : opt.text || '').trim();
      const lowerText = text.toLowerCase();
      const percentage = typeof opt === 'object' && typeof opt.percentage === 'number' ? opt.percentage : 0;
      const isTiePending = pendingTieList.has(lowerText);
      const isEligibleDefinitive =
        eligibleSet.size > 0
          ? eligibleSet.has(lowerText)
          : percentage > 50 && !isTiePending;

      let isSelected = true;
      if (highlightList.length > 0) {
        isSelected = highlightList.includes(text) || highlightList.includes(lowerText);
      } else {
        isSelected = percentage >= 25 || isTiePending;
      }

      return {
        text,
        percentage,
        isEligibleDefinitive,
        isTiePending,
        selected: isSelected,
      };
    });

    setReopenPollModal({
      isOpen: true,
      poll: pollOrResult,
      isTie: isTie || pendingTieList.size > 0,
      options: initialOptions,
      customOptions: [],
      isSubmitting: false,
      error: null,
    });
  };

  const handleConfirmReopenPoll = async () => {
    if (!reopenPollModal.poll || !activeCode) return;
    const pollId = 'pollId' in reopenPollModal.poll ? reopenPollModal.poll.pollId : reopenPollModal.poll.id;

    // Selected options for the new round
    const keptTexts = [
      ...reopenPollModal.options.filter((o) => o.selected).map((o) => o.text.trim()),
      ...reopenPollModal.customOptions.map((t) => t.trim()).filter(Boolean),
    ].filter(Boolean);

    // Unselected options:
    // If an unselected option had > 50% votes and no pending tie -> candidatesConfirmed
    // Otherwise -> candidatesRemoved
    const confirmedTexts: string[] = [];
    const removedTexts: string[] = [];

    reopenPollModal.options.forEach((o) => {
      if (!o.selected) {
        if (o.isEligibleDefinitive) {
          confirmedTexts.push(o.text.trim());
        } else {
          removedTexts.push(o.text.trim());
        }
      }
    });

    const minRequired = reopenPollModal.poll.source === 'INDICATIONS' ? 1 : 2;

    const rootPollId = reopenPollModal.poll.rootPollId || pollId;
    const initialSeats = (reopenPollModal.poll as any).rootMaxChoices || (reopenPollModal.poll.allowMultiple ? Math.max(1, reopenPollModal.poll.maxChoices || 1) : 1);
    const isMultiSeat = Boolean((reopenPollModal.poll as any).allowMultiple || initialSeats > 1);

    const earlierConfirmedSet = new Set<string>();
    if (meetingState?.history) {
      const currentRound = reopenPollModal.poll.round || 1;
      const earlierRounds = meetingState.history.filter((h: any) => {
        const hRootId = h.rootPollId || h.pollId;
        const hRound = h.round || 1;
        return hRootId === rootPollId && h.pollId !== pollId && hRound < currentRound;
      });
      for (const h of earlierRounds) {
        if (Array.isArray(h.decisionAudit?.confirmedWinnersThisRound)) {
          h.decisionAudit.confirmedWinnersThisRound.forEach((w: string) =>
            earlierConfirmedSet.add(w.trim().toLowerCase())
          );
        } else if (Array.isArray(h.confirmedWinnerNames)) {
          h.confirmedWinnerNames.forEach((w: string) =>
            earlierConfirmedSet.add(w.trim().toLowerCase())
          );
        } else if (Array.isArray(h.winnerOptionTexts) && h.winnerOptionTexts.length > 0) {
          h.winnerOptionTexts.forEach((w: string) =>
            earlierConfirmedSet.add(w.trim().toLowerCase())
          );
        }
      }
    }
    const earlierConfirmedCount = earlierConfirmedSet.size;

    const remainingOpenSeats = isMultiSeat
      ? Math.max(0, initialSeats - earlierConfirmedCount - confirmedTexts.length)
      : (earlierConfirmedCount + confirmedTexts.length > 0 ? 0 : 1);

    if (isMultiSeat && remainingOpenSeats > 0 && keptTexts.length < remainingOpenSeats) {
      setReopenPollModal((prev) => ({
        ...prev,
        error: `Proteção de vagas: restarão ${remainingOpenSeats} vaga(s) disponível(is), mas apenas ${keptTexts.length} candidato(s) foram selecionados para a nova rodada. Selecione ao menos ${remainingOpenSeats} candidato(s) para continuar na disputa.`,
      }));
      return;
    }

    if (keptTexts.length < minRequired) {
      setReopenPollModal((prev) => ({
        ...prev,
        error: `Selecione ou adicione pelo menos ${minRequired} opção(ões) para a nova rodada.`,
      }));
      return;
    }

    setReopenPollModal((prev) => ({ ...prev, isSubmitting: true, error: null }));
    try {
      await reopenPollApi(activeCode, pollId, keptTexts, {
        candidatesConfirmed: confirmedTexts,
        candidatesKept: keptTexts,
        candidatesRemoved: removedTexts,
        cutoffPercentageApplied: 25,
      });
      setReopenPollModal({
        isOpen: false,
        poll: null,
        isTie: false,
        options: [],
        customOptions: [],
        isSubmitting: false,
        error: null,
      });
      await loadActiveMeeting(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao reabrir votação.';
      setReopenPollModal((prev) => ({ ...prev, isSubmitting: false, error: msg }));
    }
  };

  // Handler to open saved draft poll
  const handleOpenSavedPoll = async (pollId: string) => {
    if (!activeCode) return;
    setIsProcessingAction(true);
    try {
      await openPoll(activeCode, pollId);
      await loadActiveMeeting(activeCode);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao abrir votação.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Config Poll Choices modal for WAITING poll
  const handleOpenConfigPollModal = () => {
    if (!meetingState?.currentPoll) return;
    setConfigPollAllowMultiple(Boolean(meetingState.currentPoll.allowMultiple));
    setConfigPollMaxChoices(meetingState.currentPoll.maxChoices || 1);
    setConfigPollError(null);
    setIsConfiguringPoll(true);
  };

  const handleSaveConfigPoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCode || !meetingState?.currentPoll) return;
    const optionsCount = meetingState.currentPoll.options.length;
    if (configPollAllowMultiple) {
      if (isNaN(configPollMaxChoices) || configPollMaxChoices < 1) {
        setConfigPollError('O limite de escolhas deve ser um número inteiro maior que zero.');
        return;
      }
      if (configPollMaxChoices > optionsCount) {
        setConfigPollError(
          `O limite de escolhas (${configPollMaxChoices}) não pode ser maior que o número de opções da pauta (${optionsCount}).`
        );
        return;
      }
    }
    setIsSubmittingConfigPoll(true);
    setConfigPollError(null);
    try {
      await updatePollConfig(activeCode, meetingState.currentPoll.id, {
        allowMultiple: configPollAllowMultiple,
        maxChoices: configPollAllowMultiple ? configPollMaxChoices : 1,
      });
      setIsConfiguringPoll(false);
      await loadActiveMeeting(activeCode);
    } catch (err: unknown) {
      setConfigPollError(err instanceof Error ? err.message : 'Erro ao salvar configuração.');
    } finally {
      setIsSubmittingConfigPoll(false);
    }
  };

  // Open Poll
  const handleOpenCurrentPoll = async () => {
    if (!activeCode || !meetingState?.currentPoll) return;
    setIsProcessingAction(true);
    try {
      await openPoll(activeCode, meetingState.currentPoll.id);
      await loadActiveMeeting(activeCode);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao abrir votação.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Close Poll
  const handleCloseCurrentPoll = async () => {
    if (!activeCode || !meetingState?.currentPoll) return;
    setIsProcessingAction(true);
    try {
      await closePoll(activeCode, meetingState.currentPoll.id);
      setConfirmClosePollOpen(false);
      await loadActiveMeeting(activeCode);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao encerrar votação.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Close Meeting
  const handleCloseMeeting = async () => {
    if (!activeCode) return;
    setIsProcessingAction(true);
    try {
      await closeMeeting(activeCode);
      setConfirmCloseMeetingOpen(false);
      await loadMeetingsList();
      await loadHistory();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao encerrar reunião.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Report modal handler
  const handleOpenPrintReport = () => {
    setIsReportModalOpen(true);
  };

  // Copy helpers
  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?code=${activeCode}`
    : `/?code=${activeCode}`;

  const copyCode = () => {
    navigator.clipboard.writeText(activeCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyLink = () => {
    const rawName = meetingState?.meeting.name || '';
    const rawCongregation = meetingState?.meeting.nominationCommissionName || '';
    const { baseName, congregation } = extractBaseMeetingName(rawName, rawCongregation);

    const meetingDisplayName = baseName || rawName;
    const congregationDisplayName = congregation || rawCongregation;

    const lines = [
      '*LINK DE VOTAÇÃO*',
      meetingDisplayName,
      congregationDisplayName,
      joinUrl,
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Identifica a última pauta efetivamente encerrada da reunião ativa para destaque visual
  const lastClosedPollId = useMemo(() => {
    if (!meetingState?.history || meetingState.history.length === 0) return null;

    // Apenas pautas com votação efetivamente encerrada (nunca abertas)
    const closedPolls = meetingState.history.filter(
      (p) => p.status === 'POLL_CLOSED' || Boolean(p.closedAt)
    );
    if (closedPolls.length === 0) return null;

    // Ordenação estritamente temporal decrescente pelo momento de encerramento
    const sorted = [...closedPolls].sort((a, b) => {
      const timeA = new Date(a.closedAt || a.openedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.closedAt || b.openedAt || b.createdAt || 0).getTime();
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return (b.pollId || '').localeCompare(a.pollId || '');
    });

    return sorted[0].pollId;
  }, [meetingState?.history]);

  // 1. Loading Initial Auth
  if (isAuthenticated === null) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6 bg-[#F9FAFB]">
        <RefreshCw className="w-6 h-6 animate-spin text-[#9CA3AF]" />
      </div>
    );
  }

  // 2. Authentication Screen
  if (!isAuthenticated) {
    return (
      <AuthView
        onAuthSuccess={handleAuthSuccess}
        initialResetToken={resetTokenFromUrl}
        initialMode={resetTokenFromUrl ? 'reset' : 'login'}
      />
    );
  }

  const activeMeetings = meetings.filter(
    (m) =>
      m.status !== 'MEETING_CLOSED' &&
      !m.isDemo &&
      m.code !== 'DEMO25' &&
      m.id !== 'demo-meeting-2026' &&
      m.name !== 'TESTE — ELIMINAÇÃO ASSISTIDA V2'
  );
  const totalClosedMeetings = historyData.reduce((acc, y) => acc + y.totalMeetings, 0);

  // 3. Admin Main Workspace with Modern Sidebar + Main Area
  return (
    <div id="admin-layout" className="min-h-screen bg-[#F9FAFB] flex w-full relative">
      {/* Mobile Drawer Backdrop */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-xs transition-opacity"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* ========================================================
          SIDEBAR (Desktop Collapsible + Mobile Drawer)
         ======================================================== */}
      <aside
        id="admin-sidebar"
        className={`fixed md:sticky top-0 left-0 h-screen bg-white border-r border-[#E5E7EB] flex flex-col z-50 md:z-20 transition-all duration-200 ease-in-out shrink-0 ${
          isMobileSidebarOpen
            ? 'translate-x-0 w-64'
            : `-translate-x-full md:translate-x-0 ${isSidebarCollapsed ? 'w-16 lg:w-20' : 'w-64 lg:w-72'}`
        }`}
      >
        {/* Top Header of Sidebar */}
        <div
          className={`border-b border-[#E5E7EB] flex items-center justify-between ${
            isSidebarCollapsed ? 'p-3 flex-col gap-2' : 'p-4'
          }`}
        >
          {isSidebarCollapsed ? (
            <div className="flex flex-col items-center gap-2 w-full">
              <ChurchLogo className="w-7 h-7 text-[#111827] shrink-0" />
              <button
                type="button"
                onClick={toggleSidebarCollapse}
                className="hidden md:flex p-1.5 text-[#6B7280] hover:text-[#111827] rounded-lg hover:bg-[#F3F4F6] cursor-pointer transition-colors"
                title="Expandir menu lateral"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <ChurchLogo className="w-7 h-7 sm:w-8 sm:h-8 text-[#111827] shrink-0" />
                <div className="inline-flex flex-col items-center justify-center text-center">
                  <span className="font-bold text-base tracking-tight text-[#111827] leading-none text-center">
                    VOTAIASD
                  </span>
                  <span className="text-[7.5px] sm:text-[8px] text-[#9CA3AF] font-medium tracking-tight leading-none mt-1 text-center whitespace-nowrap">
                    by Pr Paulo Roberto
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={toggleSidebarCollapse}
                  className="hidden md:flex p-1.5 text-[#6B7280] hover:text-[#111827] rounded-lg hover:bg-[#F3F4F6] cursor-pointer transition-colors"
                  title="Recolher menu lateral"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="md:hidden p-1.5 text-[#6B7280] hover:text-[#111827] rounded-lg hover:bg-[#F3F4F6] cursor-pointer"
                  title="Fechar menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Scrollable Navigation Body */}
        <div className={`flex-1 overflow-y-auto ${isSidebarCollapsed ? 'p-2 space-y-4' : 'p-4 space-y-5'}`}>
          {/* Active Meeting Context Widget in Sidebar */}
          {!isSidebarCollapsed ? (
            <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  REUNIÃO ATIVA
                </span>
                {activeMeetings.length > 0 && activeCode && (
                  <button
                    type="button"
                    onClick={handleRefreshMeeting}
                    disabled={isRefreshingMeeting}
                    className="p-1 text-[#6B7280] hover:text-[#111827] rounded-md hover:bg-[#E5E7EB] transition-colors cursor-pointer"
                    title="Atualizar reunião"
                  >
                    <RotateCw className={`w-3 h-3 ${isRefreshingMeeting ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>

              {activeMeetings.length > 0 ? (
                <div className="space-y-2">
                  <div className="relative">
                    <select
                      id="sidebar-meeting-select"
                      value={activeCode}
                      onChange={(e) => setActiveCode(e.target.value)}
                      className="w-full appearance-none font-bold text-xs bg-white border border-[#D1D5DB] rounded-xl px-3 py-2 pr-7 text-[#111827] focus:outline-hidden focus:ring-2 focus:ring-[#111827] cursor-pointer shadow-2xs truncate"
                    >
                      {activeMeetings.map((m) => (
                        <option key={m.id} value={m.code}>
                          {formatMeetingTitle(m.name, m.nominationCommissionName)} ({m.code})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-[#6B7280] absolute right-2.5 top-2.5 pointer-events-none" />
                  </div>

                  {meetingState && (
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            meetingState.meeting.status === 'VOTING_OPEN'
                              ? 'bg-green-500 animate-pulse'
                              : meetingState.meeting.status === 'VOTING_CLOSED'
                              ? 'bg-amber-500'
                              : 'bg-gray-400'
                          }`}
                        />
                        <span className="text-[10px] font-bold uppercase text-[#4B5563]">
                          {meetingState.meeting.status === 'VOTING_OPEN'
                            ? 'Votação Aberta'
                            : meetingState.meeting.status === 'VOTING_CLOSED'
                            ? 'Votação Encerrada'
                            : 'Aguardando'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={copyCode}
                        className="text-[10px] font-mono font-bold text-[#111827] bg-white border border-[#E5E7EB] px-2 py-0.5 rounded-md hover:bg-[#F3F4F6] flex items-center gap-1 cursor-pointer"
                        title="Copiar código da reunião"
                      >
                        {copiedCode ? <Check className="w-2.5 h-2.5 text-green-600" /> : <Copy className="w-2.5 h-2.5 text-[#6B7280]" />}
                        <span>{activeCode}</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[#9CA3AF]">Nenhuma reunião ativa</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center py-1">
              <button
                type="button"
                onClick={() => {
                  setActiveNavModule('active_meetings');
                  setIsMobileSidebarOpen(false);
                }}
                className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                  activeNavModule === 'active_meetings' ? 'bg-[#111827] text-white shadow-xs' : 'text-[#4B5563] hover:bg-[#F3F4F6]'
                }`}
                title={activeCode ? `Reunião Ativa: ${activeCode}` : 'Reuniões Ativas'}
              >
                <Layers className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Navigation Menu Groups */}
          <nav className="space-y-4">
            {/* INÍCIO */}
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setActiveNavModule('home');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeNavModule === 'home'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
                }`}
                title="Início"
              >
                <Home className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && <span className="flex-1">Início</span>}
              </button>
            </div>

            {/* Group 1: REUNIÕES */}
            <div className="space-y-1">
              {!isSidebarCollapsed && (
                <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] block">
                  REUNIÕES
                </span>
              )}

              <button
                type="button"
                onClick={() => {
                  setActiveNavModule('active_meetings');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeNavModule === 'active_meetings'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
                }`}
                title="Reuniões Ativas"
              >
                <Layers className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && <span className="flex-1">Reuniões Ativas</span>}
                {!isSidebarCollapsed && activeMeetings.length > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      activeNavModule === 'active_meetings' ? 'bg-white/20 text-white' : 'bg-[#F3F4F6] text-[#374151]'
                    }`}
                  >
                    {activeMeetings.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveNavModule('history');
                  loadHistory();
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeNavModule === 'history'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
                }`}
                title="Histórico de Reuniões"
              >
                <Archive className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && <span className="flex-1">Histórico de Reuniões</span>}
                {!isSidebarCollapsed && totalClosedMeetings > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      activeNavModule === 'history' ? 'bg-white/20 text-white' : 'bg-[#F3F4F6] text-[#374151]'
                    }`}
                  >
                    {totalClosedMeetings}
                  </span>
                )}
              </button>
            </div>

            {/* Divider */}
            <div className="border-t border-[#F3F4F6] my-1" />

            {/* Group 2: PAUTA & VOTAÇÃO */}
            <div className="space-y-1">
              {!isSidebarCollapsed && (
                <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] block">
                  PAUTA & VOTAÇÃO
                </span>
              )}

              <button
                type="button"
                onClick={() => {
                  setActiveNavModule('polls');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeNavModule === 'polls'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
                }`}
                title="Pauta & Votação"
              >
                <Vote className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && <span className="flex-1">Pauta & Votação</span>}
              </button>
            </div>

            {/* Group 3: COMISSÃO ORGANIZADORA */}
            <div className="space-y-1">
              {!isSidebarCollapsed && (
                <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] block">
                  COMISSÃO ORGANIZADORA
                </span>
              )}

              <button
                type="button"
                onClick={() => {
                  setActiveNavModule('organizing_commission_config');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeNavModule === 'organizing_commission_config'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
                }`}
                title="Configurações da Comissão Organizadora"
              >
                <Sliders className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && (
                  <span className="flex-1">Configurações da Comissão Organizadora</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveNavModule('organizing_received_nominations');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeNavModule === 'organizing_received_nominations'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
                }`}
                title="Indicações Recebidas"
              >
                <Users className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && <span className="flex-1">Indicações Recebidas</span>}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveNavModule('organizing_ata');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeNavModule === 'organizing_ata'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
                }`}
                title="Ata da Comissão Organizadora"
              >
                <FileText className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && <span className="flex-1">Ata da Comissão Organizadora</span>}
              </button>
            </div>

            {/* Group 4: COMISSÃO DE NOMEAÇÕES */}
            <div className="space-y-1">
              {!isSidebarCollapsed && (
                <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] block">
                  COMISSÃO DE NOMEAÇÕES
                </span>
              )}

              {/* 1. Configurações da Comissão de Nomeações */}
              <button
                type="button"
                onClick={() => {
                  setActiveNavModule('commission_config');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeNavModule === 'commission_config'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
                }`}
                title="Configurações da Comissão de Nomeações"
              >
                <Sliders className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && (
                  <span className="flex-1">Configurações da Comissão de Nomeações</span>
                )}
              </button>

              {/* 2. Indicações Recebidas */}
              <button
                type="button"
                onClick={() => {
                  setActiveNavModule('received_nominations');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeNavModule === 'received_nominations'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
                }`}
                title="Indicações Recebidas"
              >
                <Users className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && <span className="flex-1">Indicações Recebidas</span>}
              </button>

              {/* 4. Recomendações da Igreja */}
              <button
                type="button"
                onClick={() => {
                  setActiveNavModule('church_recommendations');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeNavModule === 'church_recommendations'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
                }`}
                title="Recomendações da Igreja"
              >
                <Church className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && <span className="flex-1">Recomendações da Igreja</span>}
              </button>

              {/* 5. Ata da Comissão de Nomeações */}
              <button
                type="button"
                onClick={() => {
                  setActiveNavModule('ata');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeNavModule === 'ata'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
                }`}
                title="Ata da Comissão de Nomeações"
              >
                <FileText className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && <span className="flex-1">Ata da Comissão de Nomeações</span>}
              </button>
            </div>

            {/* Group 5: ADMINISTRAÇÃO */}
            <div className="space-y-1">
              {!isSidebarCollapsed && (
                <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] block">
                  ADMINISTRAÇÃO
                </span>
              )}

              <button
                type="button"
                onClick={() => {
                  handleOpenPrintReport();
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } rounded-xl text-xs font-medium text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6] transition-all text-left cursor-pointer`}
                title="Relatório & Impressão"
              >
                <Printer className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && <span>Relatório & Impressão</span>}
              </button>

              <button
                id="btn-sidebar-install-app"
                type="button"
                onClick={() => {
                  handleInstallAppClick();
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } rounded-xl text-xs font-medium text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6] transition-all text-left cursor-pointer`}
                title="Instalar aplicativo"
              >
                <Download className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && <span>Instalar aplicativo</span>}
              </button>
            </div>
          </nav>
        </div>

        {/* Footer of Sidebar */}
        <div className={`border-t border-[#E5E7EB] bg-[#F9FAFB] ${isSidebarCollapsed ? 'p-2' : 'p-3.5'}`}>
          {currentUser && (
            <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
              <div className="flex items-center gap-2 min-w-0" title={currentUser.username}>
                <div className="w-7 h-7 rounded-lg bg-[#111827] text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {currentUser.username.charAt(0).toUpperCase()}
                </div>
                {!isSidebarCollapsed && (
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-[#111827] truncate">
                      {currentUser.username}
                    </span>
                    <span className="text-[10px] text-[#6B7280]">Administrador</span>
                  </div>
                )}
              </div>

              {!isSidebarCollapsed && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-1.5 text-[#6B7280] hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Sair da conta"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {isSidebarCollapsed && currentUser && (
            <div className="flex justify-center mt-1">
              <button
                type="button"
                onClick={handleLogout}
                className="p-2 text-[#6B7280] hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                title="Sair da conta"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ========================================================
          MAIN WORKSPACE
         ======================================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-14 bg-white border-b border-[#E5E7EB] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-10 shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger button on mobile */}
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-1.5 text-[#6B7280] hover:text-[#111827] rounded-lg hover:bg-[#F3F4F6] cursor-pointer"
              title="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb / Title (Onde estou) */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs sm:text-sm font-semibold text-[#6B7280]">VOTAIASD</span>
              <span className="text-[#D1D5DB]">/</span>
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#111827] truncate">
                {activeNavModule === 'home'
                  ? 'Início'
                  : activeNavModule === 'active_meetings'
                  ? 'Reuniões Ativas'
                  : activeNavModule === 'history'
                  ? 'Histórico de Reuniões'
                  : activeNavModule === 'polls'
                  ? 'Reunião / Pauta & Votação'
                  : activeNavModule === 'organizing_commission_config'
                  ? 'Reunião / Configurações da Comissão Organizadora'
                  : activeNavModule === 'organizing_received_nominations'
                  ? 'Reunião / Indicações Recebidas — Comissão Organizadora'
                  : activeNavModule === 'organizing_ata'
                  ? 'Reunião / Ata da Comissão Organizadora'
                  : activeNavModule === 'received_nominations'
                  ? 'Reunião / Indicações Recebidas'
                  : activeNavModule === 'commission_config'
                  ? 'Reunião / Configurações da Comissão de Nomeações'
                  : activeNavModule === 'church_recommendations'
                  ? 'Reunião / Recomendações da Igreja'
                  : 'Reunião / Ata da Comissão de Nomeações'}
              </span>

              {activeCode && !['home', 'history', 'active_meetings'].includes(activeNavModule) && (
                <div className="hidden sm:flex items-center gap-1.5 ml-1">
                  <span className="text-[#D1D5DB]">/</span>
                  <span className="font-mono text-xs font-bold text-[#4B5563] bg-[#F3F4F6] px-2 py-0.5 rounded border border-[#E5E7EB]">
                    {activeCode}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right Action: Refresh only */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (activeNavModule === 'history') {
                  loadHistory();
                } else {
                  handleRefreshMeeting();
                  loadMeetingsList();
                }
              }}
              disabled={activeNavModule === 'history' ? isLoadingHistory : isRefreshingMeeting}
              className="p-2 bg-[#F9FAFB] hover:bg-[#F3F4F6] text-[#374151] hover:text-[#111827] border border-[#E5E7EB] rounded-xl transition-all cursor-pointer shadow-2xs shrink-0 disabled:opacity-50"
              title="Atualizar dados"
            >
              <RotateCw
                className={`w-3.5 h-3.5 ${
                  (activeNavModule === 'history' ? isLoadingHistory : isRefreshingMeeting)
                    ? 'animate-spin'
                    : ''
                }`}
              />
            </button>
          </div>
        </header>

        {/* Main Content Workspace */}
        <main id="admin-workspace" className="flex-1 py-6 px-4 sm:px-6 w-full min-w-0">
          <div className="max-w-5xl mx-auto space-y-6 w-full min-w-0">
            {/* 1. HOME / TELA INICIAL */}
            {activeNavModule === 'home' && (
              <div className="space-y-8 max-w-4xl mx-auto py-2">
                {/* Hero Card */}
                <div className="bg-white border border-[#E5E7EB] rounded-3xl p-8 sm:p-12 shadow-xs text-center space-y-5">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl bg-[#111827] text-white flex items-center justify-center shadow-md">
                    <ChurchLogo className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
                  </div>
                  <div className="space-y-1.5 max-w-lg mx-auto">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#111827]">
                      Bem-vindo ao VOTAIASD
                    </h1>
                    <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                      Sistema de gestão de reuniões, comissões, nomeações e votações.
                    </p>
                  </div>
                  <div className="pt-2 flex justify-center gap-3 flex-wrap">
                    <button
                      id="btn-home-create-meeting"
                      type="button"
                      onClick={() => setIsCreateMeetingOpen(true)}
                      className="px-6 py-3 bg-[#111827] hover:bg-black text-white text-xs sm:text-sm font-bold uppercase tracking-wider rounded-2xl shadow-sm hover:shadow-md inline-flex items-center gap-2.5 transition-all cursor-pointer transform hover:-translate-y-0.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Nova Reunião</span>
                    </button>
                  </div>
                </div>

                {/* Reuniões Ativas Cards */}
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[#6B7280]">
                      Reuniões Ativas ({activeMeetings.length})
                    </h2>
                    {activeMeetings.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveNavModule('active_meetings')}
                        className="text-xs font-semibold text-[#111827] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Gerenciar todas</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {activeMeetings.length === 0 ? (
                    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-8 text-center space-y-2">
                      <p className="text-xs text-[#6B7280]">Nenhuma reunião ativa no momento.</p>
                      <button
                        type="button"
                        onClick={() => setIsCreateMeetingOpen(true)}
                        className="text-xs font-bold text-[#111827] hover:underline"
                      >
                        Criar uma reunião agora
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeMeetings.map((m) => (
                        <div
                          key={m.id}
                          className="bg-white border border-[#E5E7EB] hover:border-[#111827]/40 rounded-2xl p-5 shadow-2xs space-y-3.5 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] font-mono font-bold text-[#6B7280] bg-[#F3F4F6] px-2 py-0.5 rounded border border-[#E5E7EB]">
                                {m.code}
                              </span>
                              <h3 className="font-bold text-sm text-[#111827] mt-1.5 line-clamp-1">
                                {formatMeetingTitle(m.name, m.nominationCommissionName)}
                              </h3>
                              {m.description && (
                                <p className="text-xs text-[#6B7280] line-clamp-1 mt-0.5">{m.description}</p>
                              )}
                            </div>
                            <div
                              className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${
                                m.status === 'VOTING_OPEN'
                                  ? 'bg-green-500 animate-pulse'
                                  : m.status === 'VOTING_CLOSED'
                                  ? 'bg-amber-500'
                                  : 'bg-gray-400'
                              }`}
                              title={
                                m.status === 'VOTING_OPEN'
                                  ? 'Votação Aberta'
                                  : m.status === 'VOTING_CLOSED'
                                  ? 'Votação Encerrada'
                                  : 'Aguardando'
                              }
                            />
                          </div>

                          <div className="pt-2 border-t border-[#F3F4F6]">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveCode(m.code);
                                setActiveNavModule('polls');
                              }}
                              className="w-full py-2.5 px-3 bg-[#111827] hover:bg-black text-white rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                            >
                              <Vote className="w-3.5 h-3.5" />
                              <span>Pauta & Votação</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Histórico Card shortcut */}
                {totalClosedMeetings > 0 && (
                  <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-white border border-[#E5E7EB] flex items-center justify-center text-[#4B5563]">
                        <Archive className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[#111827]">Histórico de Reuniões</h4>
                        <p className="text-[11px] text-[#6B7280]">
                          {totalClosedMeetings} {totalClosedMeetings === 1 ? 'reunião encerrada preservada' : 'reuniões encerradas preservadas'}.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveNavModule('history');
                        loadHistory();
                      }}
                      className="px-3 py-1.5 bg-white hover:bg-[#F3F4F6] border border-[#E5E7EB] text-[#374151] hover:text-[#111827] text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                    >
                      Acessar Histórico
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 2. REUNIÕES ATIVAS */}
            {activeNavModule === 'active_meetings' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-2xs">
                  <div>
                    <h2 className="text-base font-bold text-[#111827]">Reuniões Ativas</h2>
                    <p className="text-xs text-[#6B7280]">
                      Gerencie as reuniões atualmente em andamento no sistema.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCreateMeetingOpen(true)}
                    className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nova Reunião</span>
                  </button>
                </div>

                {activeMeetings.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center shadow-xs">
                    <h2 className="text-lg font-bold text-[#111827]">Nenhuma reunião ativa no momento</h2>
                    <p className="text-xs text-[#6B7280] mt-1 max-w-sm mx-auto">
                      Todas as reuniões anteriores foram encerradas. Crie uma nova reunião para iniciar as votações.
                    </p>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => setIsCreateMeetingOpen(true)}
                        className="px-4 py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl inline-flex items-center gap-2 cursor-pointer shadow-xs"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Nova Reunião</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeMeetings.map((m) => (
                      <div
                        key={m.id}
                        className={`bg-white border rounded-2xl p-5 shadow-2xs space-y-4 transition-all ${
                          m.code === activeCode ? 'border-[#111827] ring-1 ring-[#111827]' : 'border-[#E5E7EB]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-[#111827] bg-[#F3F4F6] px-2.5 py-0.5 rounded-lg border border-[#E5E7EB]">
                                {m.code}
                              </span>
                              {m.code === activeCode && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                                  Selecionada
                                </span>
                              )}
                            </div>
                            <h3 className="font-bold text-base text-[#111827] mt-2">
                              {formatMeetingTitle(m.name, m.nominationCommissionName)}
                            </h3>
                            {m.description && (
                              <p className="text-xs text-[#6B7280] mt-1">{m.description}</p>
                            )}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-[#F3F4F6]">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveCode(m.code);
                              setActiveNavModule('polls');
                            }}
                            className="w-full py-2.5 px-3 bg-[#111827] hover:bg-black text-white rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          >
                            <Vote className="w-3.5 h-3.5" />
                            <span>Pauta & Votação</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. HISTÓRICO DE REUNIÕES */}
            {activeNavModule === 'history' && (
              <MeetingHistoryView
                history={historyData}
                isLoading={isLoadingHistory}
                onRefresh={loadHistory}
                onViewMeeting={(code) => setSelectedHistoryMeetingCode(code)}
                onDeleteMeeting={handleOpenDeleteMeeting}
                onDeleteMonth={handleOpenDeleteMonth}
                onDeleteYear={handleOpenDeleteYear}
              />
            )}

            {/* 4. INDICAÇÕES RECEBIDAS */}
            {activeNavModule === 'received_nominations' && (
              <>
                {activeMeetings.length > 0 && activeCode ? (
                  <AdminNominationsView
                    meetings={meetings}
                    activeCode={activeCode}
                    onSelectMeeting={(code) => setActiveCode(code)}
                    onPollCreated={() => {
                      loadActiveMeeting(activeCode);
                    }}
                    onGoHome={() => setActiveNavModule('home')}
                    onBackToPolls={() => {
                      setActiveNavModule('polls');
                      loadActiveMeeting(activeCode);
                    }}
                    mode="received_nominations"
                  />
                ) : (
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center shadow-xs">
                    <h2 className="text-lg font-bold text-[#111827]">Nenhuma reunião ativa selecionada</h2>
                    <p className="text-xs text-[#6B7280] mt-1 max-w-sm mx-auto">
                      Selecione ou crie uma reunião para acessar as indicações recebidas.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* 5. CONFIGURAÇÕES DA COMISSÃO ORGANIZADORA */}
            {activeNavModule === 'organizing_commission_config' && (
              <>
                {activeMeetings.length > 0 && activeCode ? (
                  <AdminOrganizingCommissionView
                    meetings={meetings}
                    activeCode={activeCode}
                    onSelectMeeting={(code) => setActiveCode(code)}
                    onPollCreated={() => {
                      loadActiveMeeting(activeCode);
                    }}
                    onRefreshMeeting={() => {
                      loadActiveMeeting(activeCode);
                    }}
                    onGoHome={() => setActiveNavModule('home')}
                    onBackToPolls={() => {
                      setActiveNavModule('polls');
                      loadActiveMeeting(activeCode);
                    }}
                    onNavigateToPolls={() => {
                      setActiveNavModule('polls');
                      loadActiveMeeting(activeCode);
                    }}
                    mode="config"
                  />
                ) : (
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center shadow-xs">
                    <h2 className="text-lg font-bold text-[#111827]">Nenhuma reunião ativa selecionada</h2>
                    <p className="text-xs text-[#6B7280] mt-1 max-w-sm mx-auto">
                      Selecione ou crie uma reunião para acessar as configurações da Comissão Organizadora.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* 5.5 INDICAÇÕES RECEBIDAS — COMISSÃO ORGANIZADORA */}
            {activeNavModule === 'organizing_received_nominations' && (
              <>
                {activeMeetings.length > 0 && activeCode ? (
                  <AdminOrganizingCommissionView
                    meetings={meetings}
                    activeCode={activeCode}
                    onSelectMeeting={(code) => setActiveCode(code)}
                    onPollCreated={() => {
                      loadActiveMeeting(activeCode);
                    }}
                    onRefreshMeeting={() => {
                      loadActiveMeeting(activeCode);
                    }}
                    onGoHome={() => setActiveNavModule('home')}
                    onBackToPolls={() => {
                      setActiveNavModule('polls');
                      loadActiveMeeting(activeCode);
                    }}
                    onNavigateToPolls={() => {
                      setActiveNavModule('polls');
                      loadActiveMeeting(activeCode);
                    }}
                    mode="received_nominations"
                  />
                ) : (
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center shadow-xs">
                    <h2 className="text-lg font-bold text-[#111827]">Nenhuma reunião ativa selecionada</h2>
                    <p className="text-xs text-[#6B7280] mt-1 max-w-sm mx-auto">
                      Selecione ou crie uma reunião para acessar as indicações recebidas da Comissão Organizadora.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* 5.6 ATA EXCLUSIVA DA COMISSÃO ORGANIZADORA */}
            {activeNavModule === 'organizing_ata' && (
              <>
                {activeMeetings.length > 0 && activeCode ? (
                  <OrganizingAtaModal
                    isOpen={true}
                    isEmbedded={true}
                    onClose={() => setActiveNavModule('home')}
                    meetingCode={activeCode}
                  />
                ) : (
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center shadow-xs">
                    <h2 className="text-lg font-bold text-[#111827]">Nenhuma reunião ativa selecionada</h2>
                    <p className="text-xs text-[#6B7280] mt-1 max-w-sm mx-auto">
                      Selecione ou crie uma reunião para visualizar a Ata da Comissão Organizadora.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* 6. CONFIGURAÇÕES DA COMISSÃO DE NOMEAÇÕES */}
            {activeNavModule === 'commission_config' && (
              <>
                {activeMeetings.length > 0 && activeCode ? (
                  <AdminNominationsView
                    meetings={meetings}
                    activeCode={activeCode}
                    onSelectMeeting={(code) => setActiveCode(code)}
                    onPollCreated={() => {
                      loadActiveMeeting(activeCode);
                    }}
                    onGoHome={() => setActiveNavModule('home')}
                    onBackToPolls={() => {
                      setActiveNavModule('polls');
                      loadActiveMeeting(activeCode);
                    }}
                    mode="commission_config"
                  />
                ) : (
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center shadow-xs">
                    <h2 className="text-lg font-bold text-[#111827]">Nenhuma reunião ativa selecionada</h2>
                    <p className="text-xs text-[#6B7280] mt-1 max-w-sm mx-auto">
                      Selecione ou crie uma reunião para acessar as configurações da Comissão de Nomeações.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* 6. RECOMENDAÇÕES DA IGREJA */}
            {activeNavModule === 'church_recommendations' && (
              <>
                {activeMeetings.length > 0 && activeCode ? (
                  <AdminChurchNominationsTab
                    meetingCode={activeCode}
                    meetingName={meetingState?.meeting.name || ''}
                    congregationName={meetingState?.meeting.nominationCommissionName || ''}
                  />
                ) : (
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center shadow-xs">
                    <h2 className="text-lg font-bold text-[#111827]">Nenhuma reunião ativa selecionada</h2>
                    <p className="text-xs text-[#6B7280] mt-1 max-w-sm mx-auto">
                      Selecione ou crie uma reunião para acessar as recomendações da Igreja.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* 7. ATA DA COMISSÃO (EMBEDDED COM FECHAMENTO PARA INÍCIO) */}
            {activeNavModule === 'ata' && (
              <>
                {activeMeetings.length > 0 && activeCode ? (
                  <AtaModal
                    isOpen={true}
                    isEmbedded={true}
                    onClose={() => setActiveNavModule('home')}
                    meetingCode={activeCode}
                  />
                ) : (
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center shadow-xs">
                    <h2 className="text-lg font-bold text-[#111827]">Nenhuma reunião ativa selecionada</h2>
                    <p className="text-xs text-[#6B7280] mt-1 max-w-sm mx-auto">
                      Selecione ou crie uma reunião para visualizar a Ata.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* 8. PAUTAS & VOTAÇÃO */}
            {activeNavModule === 'polls' && (
              <>
                {/* If no meeting selected yet */}
                {(!meetingState || !activeCode || activeMeetings.length === 0) ? (
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center shadow-xs">
                    <h2 className="text-lg font-bold text-[#111827]">
                      {activeMeetings.length === 0
                        ? 'Nenhuma reunião ativa no momento'
                        : 'Nenhuma reunião selecionada'}
                    </h2>
                    <p className="text-xs text-[#6B7280] mt-1 max-w-sm mx-auto">
                      {activeMeetings.length === 0
                        ? 'Todas as reuniões anteriores foram encerradas e estão preservadas no Histórico de Reuniões. Crie uma nova reunião para iniciar as votações.'
                        : 'Selecione uma reunião ativa na lista acima ou clique em "Nova Reunião" para começar.'}
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <button
                        id="btn-empty-create-meeting"
                        type="button"
                        onClick={() => setIsCreateMeetingOpen(true)}
                        className="px-4 py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl inline-flex items-center gap-2 cursor-pointer shadow-xs"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Nova Reunião</span>
                      </button>

                      {totalClosedMeetings > 0 && (
                        <button
                          id="btn-empty-view-history"
                          type="button"
                          onClick={() => {
                            setActiveNavModule('history');
                            loadHistory();
                          }}
                          className="px-4 py-2.5 bg-white hover:bg-[#F3F4F6] border border-[#E5E7EB] text-[#374151] text-xs font-bold uppercase tracking-wider rounded-xl inline-flex items-center gap-2 cursor-pointer"
                        >
                          <Archive className="w-4 h-4" />
                          <span>Ver Histórico</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* 1. Header Card: Reunião Atual */}
                    <section
                      id="admin-meeting-summary"
                      className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-xs space-y-5"
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">
                              PAUTAS DA REUNIÃO
                            </span>
                            {/* Status Badge */}
                            <div
                              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border ${
                                meetingState.meeting.status === 'VOTING_OPEN'
                                  ? 'bg-green-50 text-green-700 border-green-100'
                                  : meetingState.meeting.status === 'VOTING_CLOSED'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : meetingState.meeting.status === 'MEETING_CLOSED'
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : 'bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]'
                              }`}
                            >
                              {meetingState.meeting.status === 'VOTING_OPEN' && (
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                              )}
                              <span className="text-[10px] font-bold uppercase tracking-wider">
                                {meetingState.meeting.status === 'VOTING_OPEN'
                                  ? 'Votação Aberta'
                                  : meetingState.meeting.status === 'VOTING_CLOSED'
                                  ? 'Votação Encerrada'
                                  : meetingState.meeting.status === 'MEETING_CLOSED'
                                  ? 'Reunião Encerrada'
                                  : 'Aguardando'}
                              </span>
                            </div>
                          </div>

                          {(meetingState.meeting.isDemo || meetingState.meeting.code === 'DEMO25') && (
                            <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between gap-3 text-purple-900 text-xs">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-purple-700 shrink-0" />
                                <span className="font-bold uppercase tracking-wider text-[11px]">
                                  DEMONSTRAÇÃO COM DADOS SINTÉTICOS ISOLADOS
                                </span>
                                <span className="text-[#6B7280] text-[11px] hidden sm:inline">
                                  (Dados em memória local. Nenhum registro enviado ao Firestore.)
                                </span>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-200/80 text-purple-950 border border-purple-300">
                                MEMÓRIA LOCAL
                              </span>
                            </div>
                          )}

                          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827] break-words">
                            {formatMeetingTitle(meetingState.meeting.name, meetingState.meeting.nominationCommissionName)}
                          </h2>
                          <p className="text-xs text-[#6B7280] mt-1 break-words">
                            Código de Acesso: <span className="font-mono font-bold text-[#111827]">{meetingState.meeting.code}</span>
                            {meetingState.meeting.description && ` — ${meetingState.meeting.description}`}
                          </p>
                        </div>

                        {/* Actions: [ EDITAR ] [ ENCERRAR REUNIÃO ] */}
                        <div className="text-left md:text-right flex items-center md:items-start justify-end shrink-0 gap-2">
                          <button
                            id="btn-admin-edit-meeting"
                            type="button"
                            onClick={handleOpenEditMeeting}
                            className="px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-[#374151] hover:text-[#111827] bg-white hover:bg-[#F3F4F6] border border-[#D1D5DB] rounded-xl transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
                            title="Editar dados da reunião"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>
                          {meetingState.meeting.status !== 'MEETING_CLOSED' && (
                            <button
                              id="btn-admin-close-meeting"
                              type="button"
                              onClick={() => setConfirmCloseMeetingOpen(true)}
                              className="px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer shadow-2xs"
                            >
                              Encerrar Reunião
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 3-column stats row */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#E5E7EB]">
                {/* Metric 1: Votos Registrados */}
                <div className="bg-[#F3F4F6] p-4 rounded-xl border border-[#E5E7EB]">
                  <p className="text-[10px] font-bold text-[#6B7280] uppercase mb-1 tracking-wider">
                    Votos Registrados
                  </p>
                  <p className="text-xl font-bold text-[#111827]">
                    {meetingState.currentPollResult
                      ? meetingState.currentPollResult.allowMultiple
                        ? meetingState.currentPollResult.totalVoters ?? 0
                        : meetingState.currentPollResult.totalVotes
                      : 0}{' '}
                    <span className="text-xs font-normal text-[#6B7280]">
                      {meetingState.currentPollResult?.allowMultiple
                        ? `votaram (${meetingState.currentPollResult.totalSelections ?? meetingState.currentPollResult.totalVotes} seleções)`
                        : 'votos'}
                    </span>
                  </p>
                  <div className="w-full bg-[#E5E7EB] h-1.5 mt-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#111827] h-full transition-all duration-500 rounded-full"
                      style={{
                        width: `${
                          meetingState.participantCount > 0 && meetingState.currentPollResult
                            ? Math.min(
                                100,
                                Math.round(
                                  ((meetingState.currentPollResult.allowMultiple
                                    ? meetingState.currentPollResult.totalVoters ?? 0
                                    : meetingState.currentPollResult.totalVotes) /
                                    meetingState.participantCount) *
                                    100
                                )
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>

                {/* Metric 2: Status da Pauta */}
                <div className="bg-[#F3F4F6] p-4 rounded-xl border border-[#E5E7EB]">
                  <p className="text-[10px] font-bold text-[#6B7280] uppercase mb-1 tracking-wider">
                    Status da Pauta
                  </p>
                  <p className="text-xl font-bold text-blue-600 italic">
                    {meetingState.currentPoll
                      ? meetingState.currentPoll.status === 'OPEN'
                        ? 'Em Andamento'
                        : 'Concluída'
                      : 'Nenhuma ativa'}
                  </p>
                  <p className="text-[10px] text-[#9CA3AF] mt-1.5 font-medium">
                    Atualizado em tempo real
                  </p>
                </div>

                {/* Metric 3: Participantes Conectados */}
                <div className="bg-[#F3F4F6] p-4 rounded-xl border border-[#E5E7EB] flex flex-col justify-between">
                  <p className="text-[10px] font-bold text-[#6B7280] uppercase mb-1 tracking-wider">
                    Participantes Conectados
                  </p>
                  <div>
                    <p className="text-2xl font-bold text-[#111827]">
                      {meetingState.participantCount}{' '}
                      <span className="text-xs font-normal text-[#6B7280]">
                        {meetingState.participantCount === 1 ? 'conectado' : 'conectados'}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        handleRefreshParticipants();
                        setIsParticipantsModalOpen(true);
                      }}
                      className="mt-2 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-wider inline-flex items-center gap-1 cursor-pointer transition-colors"
                      title="Ver lista de participantes conectados"
                    >
                      <span>VER LISTA ONLINE</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Share & Code Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E5E7EB]">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-[#F3F4F6] border border-[#E5E7EB] px-3 py-1.5 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-[#6B7280]">
                      Código:
                    </span>
                    <span className="font-mono text-base font-bold text-[#111827] tracking-wider">
                      {meetingState.meeting.code}
                    </span>
                  </div>

                  <button
                    id="btn-copy-link"
                    type="button"
                    onClick={copyLink}
                    className="px-3 py-1.5 bg-white hover:bg-[#F3F4F6] border border-[#E5E7EB] text-xs font-bold uppercase tracking-wider text-[#111827] rounded-xl transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-green-700">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#6B7280]" />
                        <span>Copiar link</span>
                      </>
                    )}
                  </button>

                  <button
                    id="btn-qr-code"
                    type="button"
                    onClick={() => {
                      setQrFullscreen(false);
                      setIsQrModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-[#F3F4F6] border border-[#E5E7EB] text-xs font-bold uppercase tracking-wider text-[#111827] rounded-xl transition-colors inline-flex items-center gap-1 cursor-pointer"
                    title="Apresentar QR Code da reunião"
                  >
                    <QrCode className="w-3.5 h-3.5 text-[#6B7280]" />
                    <span>QR Code</span>
                  </button>
                </div>
              </div>
            </section>

            {/* 2. Pauta Atual Section */}
            <section
              id="admin-current-poll-section"
              className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden"
            >
              <div className="p-6 border-b border-[#E5E7EB] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  {meetingState.currentPoll?.status === 'OPEN' && !isCreatingPoll && (
                    <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                  )}
                  <h2 className="text-base font-bold text-[#111827] tracking-tight uppercase">
                    {isCreatingPoll ? 'CADASTRAR NOVA PAUTA' : 'PAUTA ATUAL'}
                  </h2>
                  {isCreatingPoll ? (
                    <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                      Nova Pauta
                    </span>
                  ) : meetingState.currentPoll?.status === 'OPEN' ? (
                    <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200">
                      Votação Aberta
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]">
                      Nenhuma pauta ativa
                    </span>
                  )}
                </div>

                {/* If there's an active, waiting, or closed poll, allow editing/deleting/creating */}
                {!isCreatingPoll && meetingState.meeting.status !== 'MEETING_CLOSED' && (
                  <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                    {meetingState.currentPoll && meetingState.currentPoll.status !== 'OPEN' && (
                      <>
                        <button
                          id="btn-edit-closed-poll-top"
                          type="button"
                          onClick={() => handleOpenEditClosedPoll(meetingState.currentPoll!)}
                          className="px-3.5 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-[#4B5563]" />
                          <span>EDITAR</span>
                        </button>

                        <button
                          id="btn-delete-closed-poll-top"
                          type="button"
                          onClick={() => handleOpenDeleteClosedPoll(meetingState.currentPoll!)}
                          className="px-3.5 py-2 bg-white border border-[#FECACA] hover:bg-[#FEF2F2] text-[#DC2626] text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />
                          <span>EXCLUIR</span>
                        </button>
                      </>
                    )}

                    <button
                      id="btn-start-new-poll"
                      type="button"
                      onClick={startNewPoll}
                      className="px-3.5 py-2 bg-[#F3F4F6] hover:bg-[#E5E7EB] border border-[#E5E7EB] text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Nova Pauta</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="p-6 space-y-6">
                {/* IF CREATING NEW POLL */}
                {isCreatingPoll ? (
                  <div className="bg-[#F9FAFB] rounded-2xl p-5 sm:p-6 border border-[#E5E7EB] space-y-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-[#111827] uppercase tracking-wider">
                        Cadastrar Nova Pauta
                      </h3>
                    </div>

                    {/* Question Field */}
                    <div>
                      <label
                        htmlFor="input-poll-question"
                        className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1.5"
                      >
                        Pergunta / Pauta
                      </label>
                      <textarea
                        id="input-poll-question"
                        rows={3}
                        value={pollQuestion}
                        onChange={(e) => setPollQuestion(e.target.value)}
                        placeholder="Ex: Devemos aprovar o calendário de atividades para o próximo trimestre?"
                        className="w-full px-4 py-3 text-sm bg-white border border-[#E5E7EB] rounded-xl text-[#111827] focus:outline-hidden focus:ring-2 focus:ring-[#111827] focus:border-transparent transition-all"
                      />
                    </div>

                    {/* Quick Presets */}
                    <div>
                      <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest block mb-2">
                        Modelos Rápidos:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => applyPreset(['Aprovar', 'Rejeitar', 'Abster-se'])}
                          className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-[#F3F4F6] border border-[#E5E7EB] rounded-xl text-[#111827] transition-colors cursor-pointer"
                        >
                          Aprovar / Rejeitar / Abster-se
                        </button>
                        <button
                          type="button"
                          onClick={() => applyPreset(['Sim', 'Não', 'Abstenção'])}
                          className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-[#F3F4F6] border border-[#E5E7EB] rounded-xl text-[#111827] transition-colors cursor-pointer"
                        >
                          Sim / Não / Abstenção
                        </button>
                        <button
                          type="button"
                          onClick={() => applyPreset(['A favor', 'Contra'])}
                          className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-[#F3F4F6] border border-[#E5E7EB] rounded-xl text-[#111827] transition-colors cursor-pointer"
                        >
                          A favor / Contra
                        </button>
                      </div>
                    </div>

                    {/* Options List */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">
                          Opções de Votação
                        </label>
                        <button
                          id="btn-add-poll-option"
                          type="button"
                          onClick={handleAddOption}
                          className="text-xs font-bold text-[#111827] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Adicionar opção</span>
                        </button>
                      </div>

                      <div className="space-y-2">
                        {pollOptions.map((opt, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => handleOptionChange(idx, e.target.value)}
                              placeholder={`Opção ${idx + 1}`}
                              className="flex-1 px-3.5 py-2.5 text-sm bg-white border border-[#E5E7EB] rounded-xl text-[#111827] focus:outline-hidden focus:ring-1 focus:ring-[#111827]"
                            />
                            {pollOptions.length > 2 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveOption(idx)}
                                title="Remover opção"
                                className="p-2.5 text-[#9CA3AF] hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Multiple Choices Configuration (Clean, Minimalist, Disabled by Default) */}
                    <div className="pt-3 border-t border-[#E5E7EB] space-y-3">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          id="checkbox-allow-multiple"
                          type="checkbox"
                          checked={pollAllowMultiple}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setPollAllowMultiple(checked);
                            if (checked && (!pollMaxChoices || pollMaxChoices < 1)) {
                              setPollMaxChoices(1);
                            }
                          }}
                          className="w-4 h-4 rounded border-[#D1D5DB] text-[#111827] focus:ring-[#111827] cursor-pointer"
                        />
                        <span className="text-xs font-bold uppercase tracking-wider text-[#374151]">
                          Permitir múltiplas escolhas
                        </span>
                      </label>

                      {pollAllowMultiple && (
                        <div className="pl-6 space-y-1.5">
                          <div className="flex items-center gap-3">
                            <label
                              htmlFor="select-max-choices"
                              className="text-xs font-medium text-[#6B7280]"
                            >
                              Limite de escolhas:
                            </label>
                            <CompactChoiceLimitSelector
                              id="select-max-choices"
                              value={pollMaxChoices || 1}
                              onChange={(val) => setPollMaxChoices(val)}
                            />
                          </div>
                          <p className="text-[11px] text-[#6B7280]">
                            O participante poderá selecionar no máximo {pollMaxChoices}{' '}
                            {pollMaxChoices === 1 ? 'opção' : 'opções'}.
                          </p>
                        </div>
                      )}
                    </div>

                    {pollFormError && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{pollFormError}</span>
                      </div>
                    )}

                    {/* Form Actions: [ CANCELAR ] [ SALVAR ] [ ABRIR VOTAÇÃO IMEDIATAMENTE ] */}
                    <div className="pt-2 flex items-center justify-end gap-2.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setIsCreatingPoll(false)}
                        className="px-4 py-2 border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        id="btn-save-draft-poll"
                        type="button"
                        disabled={isSubmittingPoll}
                        onClick={() => handleSavePoll(false)}
                        className="px-4 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                      >
                        Salvar
                      </button>
                      <button
                        id="btn-save-and-open-poll"
                        type="button"
                        disabled={isSubmittingPoll}
                        onClick={() => handleSavePoll(true)}
                        className="px-5 py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Abrir Votação Imediatamente</span>
                      </button>
                    </div>
                  </div>
                ) : meetingState.currentPoll ? (
                  /* CURRENT POLL DISPLAY */
                  <div className="space-y-6">
                    {/* Poll Question Header */}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB]">
                          {meetingState.currentPoll.allowMultiple
                            ? `Múltipla Escolha (${meetingState.currentPoll.maxChoices} opções)`
                            : 'Escolha Única'}
                        </span>
                        {(meetingState.currentPoll.commissionType === 'ORGANIZING' ||
                          meetingState.currentPoll.sourceCriterionId?.startsWith('org_')) && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                            Comissão Organizadora
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-medium leading-tight text-[#374151] italic">
                        "{meetingState.currentPoll.question}"
                      </h3>
                    </div>

                    {/* VOTE COUNT & RESULTS OR DRAFT OPTIONS */}
                    {meetingState.currentPoll.status === 'WAITING' ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB]">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
                            OPÇÕES CADASTRADAS (RASCUNHO / PAUTA SALVA)
                          </span>
                          <span className="text-xs text-[#6B7280]">
                            {meetingState.currentPoll.options.length} opções disponíveis
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {meetingState.currentPoll.options.map((opt, oIdx) => (
                            <div
                              key={opt.id || oIdx}
                              className="bg-[#F9FAFB] p-3 rounded-xl border border-[#E5E7EB] flex items-center justify-between"
                            >
                              <span className="text-xs font-bold text-[#111827]">
                                <span className="text-[#9CA3AF] mr-2">{oIdx + 1}.</span>
                                {opt.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : meetingState.currentPollResult && (
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[#E5E7EB] gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
                              {meetingState.currentPoll.status === 'OPEN' ? 'RESULTADO EM TEMPO REAL' : 'RESULTADO FINAL'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setProjectionPoll(meetingState.currentPoll);
                                setProjectionPollResult(meetingState.currentPollResult);
                                setIsProjectionModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:text-black bg-[#F3F4F6] hover:bg-[#E5E7EB] px-2 py-0.5 rounded-md border border-[#E5E7EB] transition-colors cursor-pointer"
                              title="Abrir resultado na tela de projeção"
                            >
                              <Maximize2 className="w-3 h-3" />
                              <span>PROJETAR</span>
                            </button>
                          </div>
                          <div className="flex items-center gap-2.5 text-xs font-bold text-[#111827]">
                            {meetingState.currentPollResult.allowMultiple ? (
                              <>
                                <span>
                                  Participantes:{' '}
                                  <span className="font-mono text-sm">
                                    {meetingState.currentPollResult.totalVoters ?? 0}
                                  </span>
                                </span>
                                <span className="text-[#D1D5DB]">•</span>
                                <span>
                                  Total de seleções:{' '}
                                  <span className="font-mono text-sm">
                                    {meetingState.currentPollResult.totalSelections ?? meetingState.currentPollResult.totalVotes}
                                  </span>
                                </span>
                              </>
                            ) : (
                              <span>
                                Total de votos:{' '}
                                <span className="font-mono text-sm">
                                  {meetingState.currentPollResult.totalVotes}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Options & Progress Bars (Clean Minimalism theme style) */}
                        {meetingState.currentPoll.status === 'OPEN' ? (
                          <div className="space-y-4">
                            {meetingState.currentPollResult.options
                              .map((opt, idx) => ({ opt, idx }))
                              .sort((a, b) => {
                                if (b.opt.percentage !== a.opt.percentage) return b.opt.percentage - a.opt.percentage;
                                if (b.opt.votes !== a.opt.votes) return b.opt.votes - a.opt.votes;
                                return a.idx - b.idx;
                              })
                              .map(({ opt }) => {
                              const isAboveHalf = opt.percentage > 50;
                              return (
                                <div key={opt.optionId} className="space-y-1.5">
                                  <div className="flex justify-between text-sm font-bold uppercase text-[#111827] gap-2">
                                    <span className="break-words">{opt.text}</span>
                                    <span className="font-mono text-xs font-normal shrink-0 text-right">
                                      {opt.votes} {opt.votes === 1 ? 'voto' : 'votos'} (
                                      <span
                                        className={
                                          opt.percentage > 50
                                            ? 'text-emerald-600 font-bold'
                                            : opt.percentage > 25
                                            ? 'text-amber-600 font-bold'
                                            : 'text-rose-600 font-bold'
                                        }
                                      >
                                        {opt.percentage}%
                                      </span>
                                      )
                                    </span>
                                  </div>

                                  <div className="w-full h-8 bg-[#F3F4F6] rounded-xl relative overflow-hidden border border-[#E5E7EB]">
                                    <div
                                      className="absolute top-0 left-0 bg-[#111827] h-full opacity-10 transition-all duration-500"
                                      style={{ width: `${Math.min(opt.percentage, 100)}%` }}
                                    />
                                    <div
                                      className="absolute top-0 left-0 bg-[#111827] h-full border-r-2 border-[#111827] transition-all duration-500"
                                      style={{ width: `${Math.min(opt.percentage, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          /* ASSISTED PROGRESSIVE ELIMINATION (CLOSED POLL) */
                          <div className="space-y-4">
                            {/* Control & Status Bar */}
                            <div className="p-3 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB] space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {closedPollAssistedStats?.isAllSeatsFilled ? (
                                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      Todas as vagas preenchidas ({closedPollAssistedStats.initialSeats})
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                                      Vagas Restantes: {closedPollAssistedStats?.remainingOpenSeats ?? 1} de {closedPollAssistedStats?.initialSeats ?? 1}
                                    </span>
                                  )}

                                  {(closedPollAssistedStats?.confirmedCount ?? 0) > 0 && (
                                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      {closedPollAssistedStats?.confirmedCount} definitiva(s) confirmada(s)
                                    </span>
                                  )}

                                  <span className="text-[11px] font-semibold text-[#6B7280]">
                                    Maioria absoluta: &gt; 50% dos votantes efetivos
                                  </span>
                                </div>

                                {/* Adjustable Cutoff Percentage Selector */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-bold text-[#4B5563] uppercase tracking-wider mr-1">
                                    Corte sugerido:
                                  </span>
                                  {[20, 25, 30, 35, 40, 50].map((pct) => (
                                    <button
                                      key={pct}
                                      type="button"
                                      onClick={() => setAssistedCutoffPercentage(pct)}
                                      className={`px-2 py-0.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                                        assistedCutoffPercentage === pct
                                          ? 'bg-[#111827] text-white border-[#111827]'
                                          : 'bg-white text-[#374151] border-[#D1D5DB] hover:bg-[#F3F4F6]'
                                      }`}
                                    >
                                      {pct}%
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Quick Decision Action Buttons */}
                              <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-[#E5E7EB]">
                                <button
                                  type="button"
                                  onClick={handleMarkBelowCutoff}
                                  className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer flex items-center gap-1"
                                >
                                  <UserMinus className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Marcar &lt; {assistedCutoffPercentage}% para Retirada</span>
                                </button>

                                {closedPollAssistedStats &&
                                  closedPollAssistedStats.eligibleCandidates.length > 0 &&
                                  closedPollAssistedStats.confirmedCount < closedPollAssistedStats.eligibleCandidates.length && (
                                    <button
                                      type="button"
                                      onClick={handleConfirmAllEligible}
                                      className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer flex items-center gap-1"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>
                                        Confirmar Elegíveis ({closedPollAssistedStats.eligibleCandidates.length - closedPollAssistedStats.confirmedCount})
                                      </span>
                                    </button>
                                  )}

                                {assistedEliminatedCandidates.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={handleClearAssistedSelections}
                                    className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg bg-white border border-[#D1D5DB] text-[#4B5563] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                                  >
                                    Limpar Retiradas ({assistedEliminatedCandidates.length})
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Advisory Notice */}
                            <p className="text-[11px] text-[#6B7280] leading-relaxed">
                              O percentual de corte é consultivo e não elimina nenhum candidato automaticamente. Confirme individualmente situações definitivas ou marque quem não continuará. Todas as decisões podem ser revertidas antes de iniciar a nova rodada.
                            </p>

                            {/* Seat Protection Warning Banner */}
                            {closedPollAssistedStats?.hasSeatDeficit && (
                              <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs flex items-start gap-2.5">
                                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-bold uppercase tracking-wide">Atenção: Proteção de Vagas</p>
                                  <p className="mt-0.5">
                                    Restam <strong>{closedPollAssistedStats.remainingOpenSeats}</strong> vaga(s) disponível(is), mas apenas <strong>{closedPollAssistedStats.keptCandidates.length}</strong> candidato(s) foram mantidos na disputa. Reverta a retirada de candidatos para ter no mínimo {closedPollAssistedStats.remainingOpenSeats} concorrente(s).
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* All Seats Filled Banner */}
                            {closedPollAssistedStats?.isAllSeatsFilled && (
                              <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs flex items-center gap-2.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>
                                  Todas as <strong>{closedPollAssistedStats.initialSeats}</strong> vaga(s) foram preenchidas definitivamente. Pauta concluída com sucesso!
                                </span>
                              </div>
                            )}

                            {/* Error Banner */}
                            {assistedCutError && (
                              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span>{assistedCutError}</span>
                              </div>
                            )}

                            {/* Candidate Cards with 3 Color Statuses */}
                            <div className="space-y-2.5">
                              {meetingState.currentPollResult.options
                                .map((opt, idx) => ({ opt, idx }))
                                .sort((a, b) => {
                                  if (b.opt.percentage !== a.opt.percentage) return b.opt.percentage - a.opt.percentage;
                                  if (b.opt.votes !== a.opt.votes) return b.opt.votes - a.opt.votes;
                                  return a.idx - b.idx;
                                })
                                .map(({ opt }) => {
                                const isConfirmed = assistedConfirmedCandidates.includes(opt.text);
                                const isEliminated = assistedEliminatedCandidates.includes(opt.text);
                                const isEligible = closedPollAssistedStats?.eligibleCandidates.includes(opt.text);
                                const isBelowCutoff = opt.percentage < assistedCutoffPercentage;

                                // Three strict color states:
                                // VERDE: Situação definitiva confirmada
                                // VERMELHO: Retirado da próxima rodada
                                // LARANJA: Continua na disputa / Sob avaliação
                                 const cardColorClass = isConfirmed
                                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-2xs'
                                  : isEliminated
                                  ? 'bg-rose-50/70 border-rose-300 text-rose-950 shadow-2xs'
                                  : isBelowCutoff
                                  ? 'bg-amber-50/80 border-amber-300 text-amber-950 shadow-2xs ring-1 ring-amber-200'
                                  : 'bg-amber-50/40 border-amber-200 text-amber-950';

                                const progressColorClass = isConfirmed
                                  ? 'bg-emerald-500'
                                  : isEliminated
                                  ? 'bg-rose-500/80'
                                  : 'bg-amber-500';

                                return (
                                  <div
                                    key={opt.optionId}
                                    className={`p-3.5 rounded-xl border transition-all ${cardColorClass}`}
                                  >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                      <div className="space-y-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-sm font-bold uppercase tracking-tight break-words">
                                            {opt.text}
                                          </span>

                                          {/* Status Badge */}
                                          {isConfirmed && (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                              Situação definitiva confirmada
                                            </span>
                                          )}

                                          {isEliminated && (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300">
                                              <UserMinus className="w-3 h-3 text-rose-600" />
                                              Retirado da próxima rodada
                                            </span>
                                          )}

                                          {!isConfirmed && !isEliminated && (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                                              Continua na disputa
                                            </span>
                                          )}

                                          {!isConfirmed && !isEliminated && isBelowCutoff && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-200/90 text-amber-900 border border-amber-400">
                                              Abaixo do corte sugerido (&lt; {assistedCutoffPercentage}%)
                                            </span>
                                          )}
                                        </div>

                                        <p className="text-xs font-mono font-medium opacity-80">
                                          {opt.votes} {opt.votes === 1 ? 'voto' : 'votos'} •{' '}
                                          <strong className="text-xs">{opt.percentage}%</strong>
                                        </p>
                                      </div>

                                      {/* Action Controls for Candidate */}
                                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                        {isConfirmed ? (
                                          <button
                                            type="button"
                                            onClick={() => toggleConfirmCandidate(opt.text)}
                                            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                                          >
                                            Desfazer confirmação
                                          </button>
                                        ) : isEliminated ? (
                                          <button
                                            type="button"
                                            onClick={() => toggleEliminateCandidate(opt.text)}
                                            className="text-[11px] font-semibold text-rose-700 hover:text-rose-900 hover:underline cursor-pointer"
                                          >
                                            Manter na disputa (reverter)
                                          </button>
                                        ) : (
                                          <>
                                            {isEligible && (closedPollAssistedStats?.remainingOpenSeats ?? 0) > 0 && (
                                              <button
                                                type="button"
                                                onClick={() => toggleConfirmCandidate(opt.text)}
                                                className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                                              >
                                                <Check className="w-3.5 h-3.5" />
                                                <span>Confirmar Definitivo</span>
                                              </button>
                                            )}

                                            <button
                                              type="button"
                                              onClick={() => toggleEliminateCandidate(opt.text)}
                                              className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                                            >
                                              <UserMinus className="w-3.5 h-3.5" />
                                              <span>Retirar da Próx. Rodada</span>
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    {/* Progress Bar inside Card */}
                                    <div className="w-full h-2.5 bg-black/10 rounded-full relative overflow-hidden mt-2.5">
                                      <div
                                        className={`h-full rounded-full transition-all duration-500 ${progressColorClass}`}
                                        style={{ width: `${Math.min(opt.percentage, 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions for current poll */}
                    <div className="pt-2 flex flex-wrap items-center gap-3">
                      {meetingState.currentPoll.status === 'WAITING' && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            id="btn-open-poll-action"
                            type="button"
                            disabled={isProcessingAction}
                            onClick={handleOpenCurrentPoll}
                            className="px-5 py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
                          >
                            <Play className="w-4 h-4" />
                            <span>ABRIR VOTAÇÃO</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEditClosedPoll(meetingState.currentPoll!)}
                            className="px-4 py-2.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          >
                            <Edit2 className="w-4 h-4 text-[#4B5563]" />
                            <span>EDITAR</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenDeleteClosedPoll(meetingState.currentPoll!)}
                            className="px-4 py-2.5 bg-white border border-[#FECACA] hover:bg-[#FEF2F2] text-[#DC2626] text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          >
                            <Trash2 className="w-4 h-4 text-[#DC2626]" />
                            <span>EXCLUIR</span>
                          </button>

                          <button
                            id="btn-config-poll-action"
                            type="button"
                            disabled={isProcessingAction}
                            onClick={handleOpenConfigPollModal}
                            className="px-4 py-2.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <Sliders className="w-4 h-4" />
                            <span>CONFIGURAR ESCOLHAS</span>
                          </button>
                        </div>
                      )}

                      {meetingState.currentPoll.status === 'OPEN' && (
                        <button
                          id="btn-trigger-close-poll"
                          type="button"
                          disabled={isProcessingAction}
                          onClick={() => setConfirmClosePollOpen(true)}
                          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                        >
                          <Square className="w-4 h-4 fill-white" />
                          <span>ENCERRAR VOTAÇÃO</span>
                        </button>
                      )}

                      {meetingState.currentPoll.status === 'CLOSED' && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            id="btn-save-assisted-decisions"
                            type="button"
                            disabled={isSubmittingAssistedCut}
                            onClick={handleSaveAssistedDecisions}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                            title="Salvar confirmações, retiradas e percentual de corte no banco de dados e atualizar a Ata"
                          >
                            {isSubmittingAssistedCut ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>Salvando...</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Salvar e Consolidar Decisões</span>
                              </>
                            )}
                          </button>

                          <button
                            id="btn-confirm-assisted-cut-and-reopen"
                            type="button"
                            disabled={
                              isSubmittingAssistedCut ||
                              Boolean(closedPollAssistedStats?.hasSeatDeficit) ||
                              Boolean(closedPollAssistedStats?.hasUnderMinRequired) ||
                              Boolean(closedPollAssistedStats?.isAllSeatsFilled)
                            }
                            onClick={handleConfirmAssistedCutAndReopen}
                            className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-xs cursor-pointer ${
                              closedPollAssistedStats?.isAllSeatsFilled
                                ? 'bg-emerald-600 text-white opacity-60 cursor-not-allowed'
                                : closedPollAssistedStats?.hasSeatDeficit || closedPollAssistedStats?.hasUnderMinRequired
                                ? 'bg-rose-600 text-white opacity-60 cursor-not-allowed'
                                : 'bg-[#111827] hover:bg-black text-white'
                            }`}
                            title={
                              closedPollAssistedStats?.isAllSeatsFilled
                                ? 'Todas as vagas já foram preenchidas definitivamente.'
                                : closedPollAssistedStats?.hasSeatDeficit
                                ? `Restam ${closedPollAssistedStats.remainingOpenSeats} vaga(s), mas apenas ${closedPollAssistedStats.keptCandidates.length} candidato(s) foram mantidos.`
                                : closedPollAssistedStats?.hasUnderMinRequired
                                ? `Mantenha pelo menos ${closedPollAssistedStats.minRequired} candidato(s) na disputa.`
                                : `Iniciar Rodada ${closedPollAssistedStats?.nextRound || 2} com os candidatos mantidos`
                            }
                          >
                            {isSubmittingAssistedCut ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>Iniciando Rodada {closedPollAssistedStats?.nextRound || 2}...</span>
                              </>
                            ) : (
                              <>
                                <RotateCcw className="w-4 h-4" />
                                <span>Confirmar Corte e Iniciar Rodada {closedPollAssistedStats?.nextRound || 2}</span>
                              </>
                            )}
                          </button>

                          <button
                            id="btn-new-poll-after-closed"
                            type="button"
                            onClick={startNewPoll}
                            className="px-5 py-2.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 transition-colors shadow-2xs cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                            <span>NOVA PAUTA</span>
                          </button>

                          <button
                            id="btn-reopen-current-poll"
                            type="button"
                            onClick={() =>
                              handleOpenReopenModal(
                                meetingState.currentPollResult || meetingState.currentPoll!
                              )
                            }
                            className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer ${
                              meetingState.currentPollResult?.isTie ||
                              meetingState.currentPollResult?.hasExcessEligible
                                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                : 'bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151]'
                            }`}
                          >
                            <Sliders className="w-4 h-4" />
                            <span>
                              {meetingState.currentPollResult?.isTie ||
                              meetingState.currentPollResult?.hasExcessEligible
                                ? 'REABRIR PARA DESEMPATE'
                                : 'REABRIR VOTAÇÃO'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* NO POLL ACTIVE */
                  <div className="p-8 text-center bg-[#F9FAFB] rounded-2xl border border-dashed border-[#E5E7EB]">
                    <p className="text-sm font-bold text-[#111827]">
                      Nenhuma pauta ativa.
                    </p>
                    <p className="text-xs text-[#6B7280] mt-1 mb-4">
                      Crie uma pauta para abrir a votação aos participantes.
                    </p>
                    <button
                      id="btn-create-first-poll"
                      type="button"
                      onClick={startNewPoll}
                      className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Nova Pauta</span>
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* 2.5 Saved Draft Polls List (If drafts exist waiting to be opened) */}
            {meetingState.savedPolls && meetingState.savedPolls.length > 0 && (
              <section
                id="admin-saved-polls-section"
                className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-xs space-y-4"
              >
                <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-[#111827] tracking-tight uppercase">
                        OUTRAS PAUTAS SALVAS EM RASCUNHO
                      </h2>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                        {meetingState.savedPolls.length}{' '}
                        {meetingState.savedPolls.length === 1 ? 'pauta salva' : 'pautas salvas'}
                      </span>
                    </div>
                    <p className="text-xs text-[#6B7280] mt-0.5">
                      Pautas cadastradas antecipadamente prontas para abertura de votação.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {meetingState.savedPolls.map((savedPoll) => (
                        <div
                          key={savedPoll.id}
                          className="p-4 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                  Rascunho
                                </span>
                                {(savedPoll.commissionType === 'ORGANIZING' ||
                                  savedPoll.sourceCriterionId?.startsWith('org_')) && (
                                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                                    Comissão Organizadora
                                  </span>
                                )}
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white text-[#374151] border border-[#E5E7EB]">
                                  {savedPoll.allowMultiple
                                    ? `Múltipla Escolha (${savedPoll.maxChoices} escolhas)`
                                    : 'Escolha Única'}
                                </span>
                                <span className="text-[11px] text-[#6B7280]">
                                  {savedPoll.options.length} opções cadastradas
                                </span>
                              </div>
                              <h4 className="text-sm font-bold text-[#111827] mt-1">
                                "{savedPoll.question}"
                              </h4>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                              <button
                                type="button"
                                onClick={() => handleOpenSavedPoll(savedPoll.id)}
                                disabled={isProcessingAction || meetingState.currentPoll?.status === 'OPEN'}
                                className="px-3.5 py-1.5 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                                title={
                                  meetingState.currentPoll?.status === 'OPEN'
                                    ? 'Encerre a votação atual antes de abrir outra'
                                    : 'Abrir votação desta pauta'
                                }
                              >
                                <Play className="w-3.5 h-3.5" />
                                <span>ABRIR VOTAÇÃO</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenEditClosedPoll(savedPoll)}
                                className="px-3 py-1.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-[#4B5563]" />
                                <span>EDITAR</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenDeleteClosedPoll(savedPoll)}
                                className="px-3 py-1.5 bg-white border border-[#FECACA] hover:bg-[#FEF2F2] text-[#DC2626] text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />
                                <span>EXCLUIR</span>
                              </button>
                            </div>
                          </div>

                          {/* Options pills */}
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {savedPoll.options.map((opt, oIdx) => (
                              <span
                                key={opt.id || oIdx}
                                className="text-xs bg-white border border-[#E5E7EB] px-2.5 py-1 rounded-lg text-[#374151]"
                              >
                                {opt.text}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              )}

            {/* 3. Meeting History Section */}
            <section
              id="admin-history-section"
              className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-xs space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#E5E7EB] gap-3">
                <div>
                  <h2 className="text-base font-bold text-[#111827] tracking-tight uppercase">
                    HISTÓRICO DA REUNIÃO
                  </h2>
                  <p className="text-xs text-[#6B7280]">
                    Pautas anteriores já encerradas com apuração final.
                  </p>
                </div>

                {/* Export actions */}
                <div className="flex items-center gap-2">
                  <button
                    id="btn-print-report"
                    type="button"
                    onClick={handleOpenPrintReport}
                    className="px-3.5 py-1.5 bg-[#F3F4F6] hover:bg-[#E5E7EB] border border-[#E5E7EB] text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#6B7280]" />
                    <span>Imprimir / PDF</span>
                  </button>
                </div>
              </div>

              {meetingState.history.length === 0 ? (
                <p className="text-xs text-[#9CA3AF] italic py-4">
                  Nenhuma pauta concluída no histórico até o momento.
                </p>
              ) : (
                <div className="space-y-4">
                  {meetingState.history.map((hist, idx) => {
                    const isLastClosed = hist.pollId === lastClosedPollId;
                    return (
                    <div
                      key={hist.pollId}
                      className={`p-4 rounded-2xl space-y-3 transition-colors ${
                        isLastClosed
                          ? 'bg-[#F8FAFC] border-2 border-[#111827] shadow-xs'
                          : 'bg-[#F9FAFB] border border-[#E5E7EB]'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                              Pauta {String(meetingState.history.length - idx).padStart(2, '0')}
                            </span>
                            {isLastClosed && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#111827] text-white shadow-2xs">
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                <span>ÚLTIMA PAUTA VOTADA</span>
                              </span>
                            )}
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white text-[#374151] border border-[#E5E7EB]">
                              {hist.allowMultiple
                                ? `Múltipla Escolha (${hist.maxChoices} escolhas)`
                                : 'Escolha Única'}
                            </span>
                            {(hist.commissionType === 'ORGANIZING' ||
                              hist.sourceCriterionId?.startsWith('org_')) && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                                Comissão Organizadora
                              </span>
                            )}
                            {hist.round && hist.round > 1 && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Rodada {hist.round} (Resultado Final)
                              </span>
                            )}
                            {(hist.isTie || hist.hasExcessEligible) && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                Empate / Desempate Recomendado
                              </span>
                            )}
                            {(hist.closedAt || hist.createdAt) && (
                              <span className="text-[11px] text-[#9CA3AF]">
                                {new Date(hist.closedAt || hist.createdAt).toLocaleDateString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-[#111827] mt-0.5 break-words">
                            {hist.question}
                          </h4>
                        </div>
                        <div className="w-full sm:w-auto flex flex-col sm:items-end gap-2 shrink-0">
                          {hist.allowMultiple ? (
                            <div className="inline-flex flex-col items-start sm:items-end text-xs font-bold text-[#111827] bg-white border border-[#E5E7EB] px-2.5 py-1 rounded-lg">
                              <span>{hist.totalVoters ?? hist.totalVotes} participantes</span>
                              <span className="text-[10px] text-[#6B7280] font-normal">
                                {hist.totalSelections ?? hist.totalVotes} seleções totais
                              </span>
                            </div>
                          ) : (
                            <span className="font-mono text-xs font-bold text-[#111827] bg-white border border-[#E5E7EB] px-2.5 py-1 rounded-lg inline-block">
                              {hist.totalVotes} {hist.totalVotes === 1 ? 'voto' : 'votos'}
                            </span>
                          )}

                          <div className="flex items-center gap-1.5 flex-wrap justify-start sm:justify-end">
                            <button
                              type="button"
                              onClick={() => handleOpenReopenModal(hist)}
                              className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs ${
                                hist.isTie || hist.hasExcessEligible
                                  ? 'bg-amber-500 hover:bg-amber-600 text-white font-bold'
                                  : 'bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151]'
                              }`}
                              title={
                                hist.isTie || hist.hasExcessEligible
                                  ? 'Reabrir pauta para desempate'
                                  : 'Reabrir pauta para nova rodada de votação'
                              }
                            >
                              <RotateCcw className="w-3 h-3 text-current" />
                              <span>{hist.isTie || hist.hasExcessEligible ? 'DESEMPATE' : 'REABRIR'}</span>
                            </button>

                            {canDepartmentHaveAssociates(hist.sourceDepartmentId || hist.question) && (
                              <button
                                type="button"
                                onClick={() => handleOpenAssociadosModal(hist)}
                                className={`px-2.5 py-1 border text-[11px] font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs ${
                                  hist.associates && hist.associates.length > 0
                                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-white border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151]'
                                }`}
                                title={
                                  hist.associates && hist.associates.length > 0
                                    ? `${hist.associates.length} associados cadastrados. Clique para gerenciar.`
                                    : 'Cadastrar associados deste departamento'
                                }
                              >
                                <UserPlus className="w-3 h-3 text-[#4B5563]" />
                                <span>ASSOCIADOS{hist.associates && hist.associates.length > 0 ? ` (${hist.associates.length})` : ''}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setProjectionPoll(null);
                                setProjectionPollResult(hist);
                                setIsProjectionModalOpen(true);
                              }}
                              className="px-2.5 py-1 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-[11px] font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                              title="Projetar resultado desta pauta"
                            >
                              <Maximize2 className="w-3 h-3 text-[#4B5563]" />
                              <span>PROJETAR</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEditClosedPoll(hist)}
                              className="px-2.5 py-1 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-[11px] font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                            >
                              <Edit2 className="w-3 h-3 text-[#4B5563]" />
                              <span>EDITAR</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenDeleteClosedPoll(hist)}
                              className="px-2.5 py-1 bg-white border border-[#FECACA] hover:bg-[#FEF2F2] text-[#DC2626] text-[11px] font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                            >
                              <Trash2 className="w-3 h-3 text-[#DC2626]" />
                              <span>EXCLUIR</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Options table breakdown */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {hist.options
                          .map((opt, idx) => ({ opt, idx }))
                          .sort((a, b) => {
                            if (b.opt.percentage !== a.opt.percentage) return b.opt.percentage - a.opt.percentage;
                            if (b.opt.votes !== a.opt.votes) return b.opt.votes - a.opt.votes;
                            return a.idx - b.idx;
                          })
                          .map(({ opt }) => {
                          const isAboveHalf = opt.percentage > 50;
                          return (
                            <div
                              key={opt.optionId}
                              className="bg-white p-2.5 rounded-xl border border-[#E5E7EB] flex items-center justify-between gap-2"
                            >
                              <span className="font-medium text-[#374151] break-words pr-2">{opt.text}</span>
                              <span className="font-mono text-[#111827] shrink-0 text-right">
                                {opt.votes} {opt.votes === 1 ? 'voto' : 'votos'} (
                                <span
                                  className={
                                    opt.percentage > 50
                                      ? 'text-emerald-600 font-bold'
                                      : opt.percentage > 25
                                      ? 'text-amber-600 font-bold'
                                      : 'text-rose-600 font-bold'
                                  }
                                >
                                  {opt.percentage}%
                                </span>
                                )
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Associados cadastrados / votados display */}
                      {canDepartmentHaveAssociates(hist.sourceDepartmentId || hist.question) && (() => {
                        const direct = hist.associates || [];
                        const voted = (hist.votedAssociates || []).map((va) => va.winnerName);
                        const seen = new Set<string>();
                        const unifiedAssociates: string[] = [];
                        for (const name of [...direct, ...voted]) {
                          if (!name || typeof name !== 'string') continue;
                          const clean = name.trim();
                          const lower = clean.toLowerCase();
                          if (clean.length > 0 && !seen.has(lower)) {
                            seen.add(lower);
                            unifiedAssociates.push(clean);
                          }
                        }
                        if (unifiedAssociates.length === 0) return null;
                        return (
                          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 flex items-start gap-2 text-xs">
                            <Users className="w-3.5 h-3.5 text-[#4B5563] shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <span className="font-bold text-[#111827]">ASSOCIADOS: </span>
                              <span className="text-[#374151] font-medium">{unifiedAssociates.join(', ')}</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Histórico de Rodadas Anteriores (se houver mais de uma rodada) */}
                      {hist.roundHistory && hist.roundHistory.length > 0 && (
                        <div className="pt-2 border-t border-[#E5E7EB] mt-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRoundHistory((prev) => ({
                                ...prev,
                                [hist.pollId]: !prev[hist.pollId],
                              }))
                            }
                            className="text-xs font-bold text-[#4B5563] hover:text-[#111827] flex items-center gap-1.5 cursor-pointer py-1"
                          >
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform ${
                                expandedRoundHistory[hist.pollId] ? 'rotate-180' : ''
                              }`}
                            />
                            <span>
                              Histórico de Rodadas Anteriores ({hist.roundHistory.length})
                            </span>
                          </button>

                          {expandedRoundHistory[hist.pollId] && (
                            <div className="space-y-2 mt-2 pl-2 border-l-2 border-[#D1D5DB]">
                              {hist.roundHistory.map((rh) => (
                                <div
                                  key={rh.pollId}
                                  className="p-2.5 bg-white border border-[#E5E7EB] rounded-xl text-xs space-y-1.5"
                                >
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="font-bold text-[#4B5563]">
                                      Rodada {rh.round || 1} • {rh.totalVotes}{' '}
                                      {rh.totalVotes === 1 ? 'voto' : 'votos'}
                                    </span>
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                                      SUPERADA / NÃO FINAL
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                                    {rh.options
                                      .map((ro, idx) => ({ ro, idx }))
                                      .sort((a, b) => {
                                        if (b.ro.percentage !== a.ro.percentage) return b.ro.percentage - a.ro.percentage;
                                        if (b.ro.votes !== a.ro.votes) return b.ro.votes - a.ro.votes;
                                        return a.idx - b.idx;
                                      })
                                      .map(({ ro }) => (
                                      <div
                                        key={ro.optionId}
                                        className="bg-[#F9FAFB] px-2 py-1 rounded border border-[#E5E7EB] flex items-center justify-between text-[11px]"
                                      >
                                        <span className="text-[#374151]">{ro.text}</span>
                                        <span className="font-mono font-bold text-[#111827]">
                                          {ro.votes}v (
                                          <span
                                            className={
                                              ro.percentage > 50
                                                ? 'text-emerald-600 font-bold'
                                                : ro.percentage > 25
                                                ? 'text-amber-600 font-bold'
                                                : 'text-rose-600 font-bold'
                                            }
                                          >
                                            {ro.percentage}%
                                          </span>
                                          )
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </section>
                  </div>
                )}
              </>
            )}
          </div>

      {/* MODAL: Create Meeting */}
      {isCreateMeetingOpen && (
        <div
          id="modal-create-meeting-backdrop"
          className="fixed inset-0 z-50 bg-[#111827]/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsCreateMeetingOpen(false)}
        >
          <div
            id="modal-create-meeting-card"
            className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#E5E7EB] space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold text-[#111827] tracking-tight uppercase">
                Nova Reunião
              </h3>
              <p className="text-xs text-[#6B7280] mt-1">
                Cadastre a reunião para gerar o código e QR Code de acesso dos participantes.
              </p>
            </div>

            <form onSubmit={handleCreateMeeting} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1.5">
                  Nome da Reunião *
                </label>
                <div ref={meetingTypeDropdownRef} className="relative">
                  <input
                    id="input-create-meeting-name"
                    type="text"
                    required
                    value={newMeetingName}
                    onChange={(e) => setNewMeetingName(e.target.value)}
                    placeholder="Ex: Assembleia Geral Ordinária"
                    className="w-full pl-4 pr-11 py-3 text-sm bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[#111827] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] transition-all"
                    autoFocus
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">
                    <button
                      id="btn-toggle-meeting-type-dropdown"
                      type="button"
                      onClick={() => setIsMeetingTypeDropdownOpen((prev) => !prev)}
                      aria-haspopup="listbox"
                      aria-expanded={isMeetingTypeDropdownOpen}
                      title="Selecionar tipo de reunião"
                      className="h-9 w-9 flex items-center justify-center rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#E5E7EB]/60 focus:outline-hidden transition-colors cursor-pointer"
                    >
                      <ChevronDown
                        className={`w-4 h-4 transition-transform duration-150 ${
                          isMeetingTypeDropdownOpen ? 'rotate-180 text-[#111827]' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {isMeetingTypeDropdownOpen && (
                    <div
                      id="dropdown-meeting-types"
                      role="listbox"
                      aria-label="Tipos de reunião predefinidos"
                      className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-[#E5E7EB] rounded-xl shadow-lg py-1 overflow-hidden"
                    >
                      {PREDEFINED_MEETING_TYPES.map((typeOption) => {
                        const isSelected = newMeetingName.trim() === typeOption;
                        return (
                          <button
                            key={typeOption}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              setNewMeetingName(typeOption);
                              setIsMeetingTypeDropdownOpen(false);
                            }}
                            className={`w-full px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider flex items-center justify-between transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#111827] text-white'
                                : 'text-[#111827] hover:bg-[#F3F4F6]'
                            }`}
                          >
                            <span>{typeOption}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1.5">
                  Nome da Congregação
                </label>
                <input
                  type="text"
                  value={newNominationCommissionName}
                  onChange={(e) => setNewNominationCommissionName(e.target.value)}
                  placeholder="Ex: Igreja Central de Caruaru"
                  className="w-full px-4 py-3 text-sm bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[#111827] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] transition-all"
                />
                <p className="text-[11px] text-[#9CA3AF] mt-1">
                  Utilizado no cabeçalho oficial da Ata da Comissão de Nomeações.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1.5">
                  Descrição (opcional)
                </label>
                <input
                  type="text"
                  value={newMeetingDesc}
                  onChange={(e) => setNewMeetingDesc(e.target.value)}
                  placeholder="Ex: Deliberações do primeiro semestre"
                  className="w-full px-4 py-3 text-sm bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[#111827] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] transition-all"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateMeetingOpen(false)}
                  className="px-4 py-2 border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  id="btn-confirm-create-meeting"
                  type="submit"
                  disabled={isCreatingMeeting || !newMeetingName.trim()}
                  className="px-5 py-2.5 bg-[#111827] hover:bg-black disabled:bg-[#E5E7EB] text-white disabled:text-[#9CA3AF] text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  {isCreatingMeeting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Criando...</span>
                    </>
                  ) : (
                    <span>Criar Reunião</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Meeting */}
      {isEditMeetingOpen && meetingState?.meeting && (
        <div
          id="modal-edit-meeting-backdrop"
          className="fixed inset-0 z-50 bg-[#111827]/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsEditMeetingOpen(false)}
        >
          <div
            id="modal-edit-meeting-card"
            className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#E5E7EB] space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[#111827] tracking-tight uppercase">
                  Editar Reunião
                </h3>
                <p className="text-xs text-[#6B7280] mt-1">
                  Altere as informações da reunião. O código de acesso e dados vinculados permanecem inalterados.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditMeetingOpen(false)}
                className="text-[#9CA3AF] hover:text-[#111827] p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editMeetingError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-rose-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{editMeetingError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateMeeting} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1.5">
                  Nome da Reunião *
                </label>
                <input
                  type="text"
                  required
                  value={editMeetingName}
                  onChange={(e) => setEditMeetingName(e.target.value)}
                  placeholder="Ex: Assembleia Geral Ordinária"
                  className="w-full px-4 py-3 text-sm bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[#111827] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1.5">
                  Nome da Congregação
                </label>
                <input
                  type="text"
                  value={editNominationCommissionName}
                  onChange={(e) => setEditNominationCommissionName(e.target.value)}
                  placeholder="Ex: Igreja Central de Caruaru"
                  className="w-full px-4 py-3 text-sm bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[#111827] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] transition-all"
                />
                <p className="text-[11px] text-[#9CA3AF] mt-1">
                  Utilizado no cabeçalho oficial da Ata da Comissão de Nomeações.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1.5">
                  Descrição (opcional)
                </label>
                <input
                  type="text"
                  value={editMeetingDesc}
                  onChange={(e) => setEditMeetingDesc(e.target.value)}
                  placeholder="Ex: Deliberações do primeiro semestre"
                  className="w-full px-4 py-3 text-sm bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[#111827] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] transition-all"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsEditMeetingOpen(false)}
                  className="px-4 py-2 border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  id="btn-confirm-save-meeting"
                  type="submit"
                  disabled={isUpdatingMeeting || !editMeetingName.trim()}
                  className="px-5 py-2.5 bg-[#111827] hover:bg-black disabled:bg-[#E5E7EB] text-white disabled:text-[#9CA3AF] text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  {isUpdatingMeeting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>Salvar</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Config Poll Choices for WAITING Poll */}
      {isConfiguringPoll && meetingState?.currentPoll && (
        <div
          id="modal-config-poll-backdrop"
          className="fixed inset-0 z-50 bg-[#111827]/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsConfiguringPoll(false)}
        >
          <div
            id="modal-config-poll-card"
            className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#E5E7EB] space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[#111827] tracking-tight uppercase">
                  Configurar Escolhas da Pauta
                </h3>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  "{meetingState.currentPoll.question}"
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsConfiguringPoll(false)}
                className="text-[#9CA3AF] hover:text-[#111827] p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {configPollError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{configPollError}</span>
              </div>
            )}

            <form onSubmit={handleSaveConfigPoll} className="space-y-4">
              <div className="space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={configPollAllowMultiple}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setConfigPollAllowMultiple(checked);
                      if (checked && configPollMaxChoices < 1) {
                        setConfigPollMaxChoices(1);
                      }
                    }}
                    className="w-4 h-4 rounded border-[#D1D5DB] text-[#111827] focus:ring-[#111827] cursor-pointer"
                  />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#374151]">
                    Permitir múltiplas escolhas
                  </span>
                </label>

                {configPollAllowMultiple && (
                  <div className="pl-6 space-y-1.5">
                    <div className="flex items-center gap-3">
                      <label
                        htmlFor="select-config-max-choices"
                        className="text-xs font-medium text-[#6B7280]"
                      >
                        Limite de escolhas:
                      </label>
                      <CompactChoiceLimitSelector
                        id="select-config-max-choices"
                        value={configPollMaxChoices || 1}
                        onChange={(val) => setConfigPollMaxChoices(val)}
                      />
                    </div>
                    <p className="text-[11px] text-[#6B7280]">
                      O participante poderá selecionar no máximo {configPollMaxChoices}{' '}
                      {configPollMaxChoices === 1 ? 'opção' : 'opções'} de um total de{' '}
                      {meetingState.currentPoll.options.length}.
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setIsConfiguringPoll(false)}
                  disabled={isSubmittingConfigPoll}
                  className="px-4 py-2 border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  id="btn-confirm-config-poll"
                  type="submit"
                  disabled={isSubmittingConfigPoll}
                  className="px-5 py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingConfigPoll ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>Salvar Configuração</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL: Close Poll */}
      {confirmClosePollOpen && (
        <div
          id="modal-confirm-close-poll-backdrop"
          className="fixed inset-0 z-50 bg-[#111827]/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setConfirmClosePollOpen(false)}
        >
          <div
            id="modal-confirm-close-poll-card"
            className="bg-white rounded-2xl max-w-sm w-full p-5 sm:p-6 shadow-xl border border-[#E5E7EB] space-y-4 text-center max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Square className="w-5 h-5 fill-rose-600" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#111827] uppercase tracking-tight">
                Encerrar Votação
              </h3>
              <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
                Tem certeza que deseja encerrar esta votação? Ninguém mais poderá votar e o resultado será consolidado.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmClosePollOpen(false)}
                className="px-4 py-2 border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#F3F4F6] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                id="btn-modal-confirm-close-poll"
                type="button"
                disabled={isProcessingAction}
                onClick={handleCloseCurrentPoll}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {isProcessingAction ? 'Encerrando...' : 'Encerrar Votação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL: Close Meeting */}
      {confirmCloseMeetingOpen && (
        <div
          id="modal-confirm-close-meeting-backdrop"
          className="fixed inset-0 z-50 bg-[#111827]/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setConfirmCloseMeetingOpen(false)}
        >
          <div
            id="modal-confirm-close-meeting-card"
            className="bg-white rounded-2xl max-w-sm w-full p-5 sm:p-6 shadow-xl border border-[#E5E7EB] space-y-4 text-center max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-[#F3F4F6] border border-[#E5E7EB] text-[#111827] flex items-center justify-center mx-auto">
              <Clock className="w-5 h-5" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#111827] uppercase tracking-tight">
                Encerrar Reunião
              </h3>
              <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
                Tem certeza que deseja finalizar esta reunião? Todos os participantes serão notificados do encerramento.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmCloseMeetingOpen(false)}
                className="px-4 py-2 border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#F3F4F6] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                id="btn-modal-confirm-close-meeting"
                type="button"
                disabled={isProcessingAction}
                onClick={handleCloseMeeting}
                className="px-5 py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {isProcessingAction ? 'Encerrando...' : 'Sim, Encerrar Reunião'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT PREVIEW MODAL */}
      {isReportModalOpen && meetingState && (
        <div
          id="modal-report-backdrop"
          className="fixed inset-0 z-50 bg-[#111827]/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setIsReportModalOpen(false)}
        >
          <div
            id="modal-report-card"
            className="bg-white rounded-2xl max-w-4xl w-full my-8 p-6 sm:p-8 shadow-2xl border border-[#E5E7EB] space-y-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#E5E7EB] gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#111827] uppercase tracking-tight">
                  Relatório da Reunião
                </h3>
                <p className="text-xs text-[#6B7280]">
                  Visualização oficial com apuração final de todas as pautas.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="btn-modal-report-print"
                  type="button"
                  onClick={() => {
                    window.open(getMeetingReportUrl(activeCode), '_blank');
                  }}
                  className="px-3.5 py-1.5 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5 text-white" />
                  <span>Imprimir / Salvar PDF</span>
                </button>

                <button
                  id="btn-modal-report-close"
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="p-1.5 text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document Sheet Layout */}
            <div className="p-6 sm:p-8 bg-[#FAFAFA] border border-[#E5E7EB] rounded-2xl space-y-6 text-[#111827]">
              {/* Document Header */}
              <div className="border-b border-[#E5E7EB] pb-5">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-[#111827]">
                      VOTAIASD
                    </h1>
                    <p className="text-xs text-[#9CA3AF] tracking-wide mt-0.5">
                      by Pr Paulo Roberto
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white text-[#374151] border border-[#E5E7EB]">
                      {meetingState.meeting.status === 'MEETING_CLOSED' ? 'Encerrada' : 'Em Andamento'}
                    </span>
                    <p className="text-[11px] font-mono text-[#6B7280] mt-1">
                      Código: <strong>{meetingState.meeting.code}</strong>
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#E5E7EB] grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[#6B7280]">Reunião: </span>
                    <strong className="text-[#111827]">
                      {formatMeetingTitle(meetingState.meeting.name, meetingState.meeting.nominationCommissionName)}
                    </strong>
                  </div>
                  {meetingState.meeting.description && (
                    <div>
                      <span className="text-[#6B7280]">Descrição: </span>
                      <span className="text-[#374151]">{meetingState.meeting.description}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-[#6B7280]">Início: </span>
                    <span className="text-[#374151]">
                      {new Date(meetingState.meeting.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  {meetingState.meeting.endedAt && (
                    <div>
                      <span className="text-[#6B7280]">Encerramento: </span>
                      <span className="text-[#374151]">
                        {new Date(meetingState.meeting.endedAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* History List */}
              <div className="space-y-6">
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#6B7280]">
                  Pautas e Apurações
                </h4>

                {meetingState.history.length === 0 ? (
                  <p className="text-xs text-[#9CA3AF] italic py-4">
                    Nenhuma pauta foi encerrada nesta reunião até o momento.
                  </p>
                ) : (
                  meetingState.history.map((hist, idx) => (
                    <div
                      key={hist.pollId}
                      className="bg-white p-5 rounded-xl border border-[#E5E7EB] space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                            Pauta {String(meetingState.history.length - idx).padStart(2, '0')}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB]">
                            {hist.allowMultiple
                              ? `Múltipla Escolha (${hist.maxChoices} escolhas)`
                              : 'Escolha Única'}
                          </span>
                          {(hist.closedAt || hist.createdAt) && (
                            <span className="text-[11px] text-[#9CA3AF]">
                              {new Date(hist.closedAt || hist.createdAt).toLocaleString('pt-BR')}
                            </span>
                          )}
                        </div>

                        <div className="text-xs font-bold text-[#111827]">
                          {hist.allowMultiple ? (
                            <span>
                              {hist.totalVoters ?? hist.totalVotes} participantes • {hist.totalSelections ?? hist.totalVotes} seleções
                            </span>
                          ) : (
                            <span>{hist.totalVotes} {hist.totalVotes === 1 ? 'voto' : 'votos'}</span>
                          )}
                        </div>
                      </div>

                      <h3 className="text-sm font-bold text-[#111827]">
                        {hist.question}
                      </h3>

                      {/* Options breakdown table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="border-b border-[#E5E7EB] text-[10px] uppercase font-bold text-[#6B7280]">
                              <th className="py-1.5 font-bold">Opção</th>
                              <th className="py-1.5 font-bold text-right">Votos/Seleções</th>
                              <th className="py-1.5 font-bold text-right">Percentual</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F3F4F6]">
                            {hist.options
                              .map((opt, idx) => ({ opt, idx }))
                              .sort((a, b) => {
                                if (b.opt.percentage !== a.opt.percentage) return b.opt.percentage - a.opt.percentage;
                                if (b.opt.votes !== a.opt.votes) return b.opt.votes - a.opt.votes;
                                return a.idx - b.idx;
                              })
                              .map(({ opt }) => (
                              <tr key={opt.optionId}>
                                <td className="py-2 font-medium text-[#111827]">{opt.text}</td>
                                <td className="py-2 text-right font-mono font-bold text-[#111827]">
                                  {opt.votes}
                                </td>
                                <td className="py-2 text-right font-mono">
                                  <span
                                    className={
                                      opt.percentage > 50
                                        ? 'text-emerald-600 font-bold'
                                        : opt.percentage > 25
                                        ? 'text-amber-600 font-bold'
                                        : 'text-rose-600 font-bold'
                                    }
                                  >
                                    {opt.percentage}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Associados in Report Preview Modal */}
                      {canDepartmentHaveAssociates(hist.sourceDepartmentId || hist.question) && (() => {
                        const direct = hist.associates || [];
                        const voted = (hist.votedAssociates || []).map((va) => va.winnerName);
                        const seen = new Set<string>();
                        const unifiedAssociates: string[] = [];
                        for (const name of [...direct, ...voted]) {
                          if (!name || typeof name !== 'string') continue;
                          const clean = name.trim();
                          const lower = clean.toLowerCase();
                          if (clean.length > 0 && !seen.has(lower)) {
                            seen.add(lower);
                            unifiedAssociates.push(clean);
                          }
                        }
                        if (unifiedAssociates.length === 0) return null;
                        return (
                          <div className="mt-2.5 p-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl flex items-center gap-2 text-xs text-[#111827]">
                            <Users className="w-3.5 h-3.5 text-[#4B5563] shrink-0" />
                            <div>
                              <strong className="font-bold text-[#111827]">Associados: </strong>
                              <span className="text-[#374151] font-medium">{unifiedAssociates.join(', ')}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ))
                )}
              </div>

              {/* Document Footer */}
              <div className="pt-4 border-t border-[#E5E7EB] text-[10px] text-[#9CA3AF] flex flex-col sm:flex-row justify-between items-center gap-2">
                <span>VOTAIASD • by Pr Paulo Roberto</span>
                <span>Votação 100% anônima e auditada pelo sistema.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal (Supports fullscreen projector mode) */}
      <QRCodeModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        meetingCode={activeCode}
        meetingName={formatMeetingTitle(meetingState?.meeting.name, meetingState?.meeting.nominationCommissionName)}
        joinUrl={joinUrl}
        initialFullscreen={qrFullscreen}
      />

      {/* History Meeting Detail Modal */}
      <HistoryMeetingDetailModal
        isOpen={Boolean(selectedHistoryMeetingCode)}
        meetingCode={selectedHistoryMeetingCode}
        onClose={() => setSelectedHistoryMeetingCode(null)}
      />

      {/* Delete Confirmation Modal (Meeting, Month, or Year) */}
      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        type={deleteModal.type}
        meetingCode={deleteModal.meetingCode}
        meetingName={deleteModal.meetingName}
        year={deleteModal.year}
        month={deleteModal.month}
        monthName={deleteModal.monthName}
        count={deleteModal.count}
        isDeleting={deleteModal.isDeleting}
        error={deleteModal.error}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* ========================================================
          MODAL: EDITAR PAUTA (ENCERRADA OU RASCUNHO)
         ======================================================== */}
      {isEditPollOpen && editingPollId && (
        <div
          id="modal-edit-poll-backdrop"
          className="fixed inset-0 z-50 bg-[#111827]/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setIsEditPollOpen(false)}
        >
          <div
            id="modal-edit-poll-card"
            className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-xl border border-[#E5E7EB] space-y-4 my-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#111827] uppercase tracking-tight flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-[#111827]" />
                  <span>Editar Pauta</span>
                </h3>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  Atualize os dados da pauta existente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditPollOpen(false)}
                className="text-[#9CA3AF] hover:text-[#111827] p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editPollError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{editPollError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveEditPoll(false);
              }}
              className="space-y-4"
            >
              {/* Question Field */}
              <div>
                <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1.5">
                  Pergunta / Pauta *
                </label>
                <textarea
                  rows={3}
                  required
                  value={editPollQuestion}
                  onChange={(e) => setEditPollQuestion(e.target.value)}
                  placeholder="Ex: Devemos aprovar o calendário de atividades?"
                  className="w-full px-4 py-3 text-sm bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[#111827] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] transition-all"
                />
              </div>

              {/* Options List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">
                    Opções de Votação *
                  </label>
                  <button
                    type="button"
                    onClick={handleEditAddOption}
                    className="text-xs font-bold text-[#111827] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar opção</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {editPollOptions.map((opt, idx) => {
                    const optId = editPollOptionIds[idx];
                    const pct =
                      (optId ? editingPollResultsMap.get(optId) : undefined) ??
                      editingPollResultsMap.get(opt.trim().toLowerCase());
                    const hasPct = typeof pct === 'number';
                    const badgeClass =
                      hasPct && pct! > 50
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold'
                        : hasPct && pct! >= 25
                        ? 'bg-amber-50 text-amber-800 border-amber-300 font-bold'
                        : 'bg-rose-50 text-rose-700 border-rose-300 font-bold';

                    return (
                      <div key={optId || idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          required
                          value={opt}
                          onChange={(e) => handleEditOptionChange(idx, e.target.value)}
                          placeholder={`Opção ${idx + 1}`}
                          className="flex-1 px-3.5 py-2.5 text-sm bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[#111827] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#111827]"
                        />
                        {hasPct && (
                          <span
                            className={`px-2 py-1 text-xs font-mono rounded-lg border ${badgeClass} shrink-0`}
                            title={`Resultado registrado nesta opção: ${pct}%`}
                          >
                            {pct}%
                          </span>
                        )}
                        {editPollOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleEditRemoveOption(idx)}
                            title="Remover opção"
                            className="p-2.5 text-[#9CA3AF] hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Multiple Choices Configuration */}
              <div className="pt-3 border-t border-[#E5E7EB] space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editPollAllowMultiple}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEditPollAllowMultiple(checked);
                      if (checked && (!editPollMaxChoices || editPollMaxChoices < 1)) {
                        setEditPollMaxChoices(1);
                      }
                    }}
                    className="w-4 h-4 rounded border-[#D1D5DB] text-[#111827] focus:ring-[#111827] cursor-pointer"
                  />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#374151]">
                    Permitir múltiplas escolhas
                  </span>
                </label>

                {editPollAllowMultiple && (
                  <div className="pl-6 space-y-1.5">
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-medium text-[#6B7280]">
                        Limite de escolhas:
                      </label>
                      <CompactChoiceLimitSelector
                        value={editPollMaxChoices || 1}
                        onChange={(val) => setEditPollMaxChoices(val)}
                      />
                    </div>
                    <p className="text-[11px] text-[#6B7280]">
                      O participante poderá selecionar no máximo {editPollMaxChoices}{' '}
                      {editPollMaxChoices === 1 ? 'opção' : 'opções'}.
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setIsEditPollOpen(false)}
                  disabled={isSubmittingEditPoll}
                  className="px-4 py-2 border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEditPoll}
                  className="px-5 py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingEditPoll ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>Salvar Alterações</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: CONFIRMAR ALTERAÇÃO ESTRUTURAL DE PAUTA COM VOTOS
         ======================================================== */}
      {structuralConfirmModal?.isOpen && (
        <div
          id="modal-structural-confirm-backdrop"
          className="fixed inset-0 z-50 bg-[#111827]/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setStructuralConfirmModal(null)}
        >
          <div
            id="modal-structural-confirm-card"
            className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#E5E7EB] space-y-4 text-center max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#111827] uppercase tracking-tight">
                Alteração Estrutural
              </h3>
              <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
                {structuralConfirmModal.message ||
                  'Esta pauta já possui votos registrados. Alterar as opções ou a estrutura da votação pode afetar a interpretação dos resultados existentes. Deseja realmente continuar?'}
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setStructuralConfirmModal(null)}
                disabled={isSubmittingEditPoll}
                className="px-4 py-2.5 border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#F3F4F6] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmittingEditPoll}
                onClick={() => handleSaveEditPoll(true)}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {isSubmittingEditPoll ? 'Salvando...' : 'Continuar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: EXCLUIR PAUTA (CONFIRMAÇÃO)
         ======================================================== */}
      {deletePollModal.isOpen && (
        <div
          id="modal-delete-poll-backdrop"
          className="fixed inset-0 z-50 bg-[#111827]/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => {
            if (!deletePollModal.isDeleting) {
              setDeletePollModal({
                isOpen: false,
                pollId: null,
                question: '',
                isDeleting: false,
                error: null,
              });
            }
          }}
        >
          <div
            id="modal-delete-poll-card"
            className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#E5E7EB] space-y-4 text-center max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 text-rose-600" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#111827] uppercase tracking-tight">
                Excluir esta pauta?
              </h3>
              {deletePollModal.question && (
                <p className="text-xs font-medium text-[#374151] mt-1 italic">
                  "{deletePollModal.question}"
                </p>
              )}
              <p className="text-xs text-[#6B7280] mt-2 leading-relaxed">
                Esta pauta e seus dados de votação associados serão removidos. Esta ação não pode ser desfeita.
              </p>
            </div>

            {deletePollModal.error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2 text-left">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{deletePollModal.error}</span>
              </div>
            )}

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                disabled={deletePollModal.isDeleting}
                onClick={() =>
                  setDeletePollModal({
                    isOpen: false,
                    pollId: null,
                    question: '',
                    isDeleting: false,
                    error: null,
                  })
                }
                className="px-4 py-2.5 border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#F3F4F6] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                id="btn-confirm-delete-poll"
                type="button"
                disabled={deletePollModal.isDeleting}
                onClick={handleConfirmDeletePoll}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2"
              >
                {deletePollModal.isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <span>Excluir Pauta</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen / Tiebreak Poll Modal */}
      {reopenPollModal.isOpen && reopenPollModal.poll && (
        <div
          id="modal-reopen-poll-backdrop"
          className="fixed inset-0 z-50 bg-[#111827]/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() =>
            !reopenPollModal.isSubmitting &&
            setReopenPollModal({
              isOpen: false,
              poll: null,
              isTie: false,
              options: [],
              customOptions: [],
              isSubmitting: false,
              error: null,
            })
          }
        >
          <div
            id="modal-reopen-poll-card"
            className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-xl border border-[#E5E7EB] space-y-4 my-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0 shadow-2xs">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111827] tracking-tight uppercase">
                    {reopenPollModal.isTie ? 'Reabrir para Desempate' : 'Reabrir Votação (Nova Rodada)'}
                  </h3>
                  <p className="text-xs text-[#6B7280]">
                    Configurar candidatos para a Rodada {(reopenPollModal.poll.round || 1) + 1}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={reopenPollModal.isSubmitting}
                onClick={() =>
                  setReopenPollModal({
                    isOpen: false,
                    poll: null,
                    isTie: false,
                    options: [],
                    customOptions: [],
                    isSubmitting: false,
                    error: null,
                  })
                }
                className="p-1 rounded-lg text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pauta Question Card */}
            <div className="bg-[#F9FAFB] p-3.5 rounded-xl border border-[#E5E7EB] space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] block">
                PAUTA
              </span>
              <p className="text-sm font-semibold text-[#111827] italic">
                "{reopenPollModal.poll.question}"
              </p>
            </div>

            {/* Explanation Banner (Amber/Yellow style matching Image 1) */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Marque os candidatos ou opções que deverão participar da próxima rodada de votação. Candidatos desmarcados serão retirados da disputa (ou confirmados caso tenham obtido maioria absoluta).
              </span>
            </div>

            {/* Candidates Section Title & Count */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-bold text-[#374151] uppercase tracking-wider">
                CANDIDATOS / OPÇÕES PARA A NOVA RODADA:
              </span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#F3F4F6] text-[#4B5563]">
                {reopenPollModal.options.filter((o) => o.selected).length +
                  reopenPollModal.customOptions.filter((t) => t.trim()).length}{' '}
                selecionada(s)
              </span>
            </div>

            {/* Simple Candidate Cards with Checkbox */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {reopenPollModal.options.map((opt, idx) => (
                <label
                  key={idx}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                    opt.selected
                      ? 'bg-white border-[#111827] shadow-2xs'
                      : 'bg-[#F9FAFB] border-[#E5E7EB] opacity-60 hover:opacity-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={opt.selected}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setReopenPollModal((prev) => {
                        const nextOpts = [...prev.options];
                        nextOpts[idx] = { ...nextOpts[idx], selected: checked };
                        return { ...prev, options: nextOpts };
                      });
                    }}
                    className="w-4 h-4 rounded text-[#111827] focus:ring-[#111827] border-gray-300 cursor-pointer shrink-0"
                  />
                  <span className="text-sm font-bold uppercase text-[#111827] break-words">
                    {opt.text}
                  </span>
                </label>
              ))}
            </div>

            {/* Custom Extra Options */}
            {reopenPollModal.customOptions.map((customText, cIdx) => (
              <div key={cIdx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={customText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setReopenPollModal((prev) => {
                      const nextCust = [...prev.customOptions];
                      nextCust[cIdx] = val;
                      return { ...prev, customOptions: nextCust };
                    });
                  }}
                  placeholder={`Nova opção / candidato extra ${cIdx + 1}`}
                  className="flex-1 px-3 py-2 text-xs border border-[#D1D5DB] rounded-xl focus:ring-2 focus:ring-[#111827] focus:border-transparent outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    setReopenPollModal((prev) => ({
                      ...prev,
                      customOptions: prev.customOptions.filter((_, i) => i !== cIdx),
                    }));
                  }}
                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl cursor-pointer"
                  title="Remover opção"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => {
                setReopenPollModal((prev) => ({
                  ...prev,
                  customOptions: [...prev.customOptions, ''],
                }));
              }}
              className="text-xs text-[#374151] hover:text-black font-semibold flex items-center gap-1 cursor-pointer py-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar outro candidato/opção</span>
            </button>

            {/* Error Message */}
            {reopenPollModal.error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{reopenPollModal.error}</span>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E5E7EB]">
              <button
                type="button"
                disabled={reopenPollModal.isSubmitting}
                onClick={() =>
                  setReopenPollModal({
                    isOpen: false,
                    poll: null,
                    isTie: false,
                    options: [],
                    customOptions: [],
                    isSubmitting: false,
                    error: null,
                  })
                }
                className="px-4 py-2 border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#F3F4F6] transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={reopenPollModal.isSubmitting}
                onClick={handleConfirmReopenPoll}
                className="px-5 py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {reopenPollModal.isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Iniciando Rodada {(reopenPollModal.poll.round || 1) + 1}...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Confirmar e Criar Rodada {(reopenPollModal.poll.round || 1) + 1}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Participants Online Modal */}
      <AdminParticipantsModal
        isOpen={isParticipantsModalOpen}
        onClose={() => setIsParticipantsModalOpen(false)}
        participants={meetingState?.participants || []}
        count={meetingState?.participantCount || 0}
        meetingCode={meetingState?.meeting.code}
        onRefresh={handleRefreshParticipants}
        isLoading={isRefreshingParticipants}
      />

      {/* Projection Result Modal */}
      <ProjectionResultModal
        isOpen={isProjectionModalOpen}
        onClose={() => setIsProjectionModalOpen(false)}
        poll={projectionPoll}
        pollResult={
          projectionPoll && meetingState?.currentPoll && projectionPoll.id === meetingState.currentPoll.id
            ? (meetingState?.currentPollResult || projectionPollResult)
            : projectionPollResult
        }
        meetingName={formatMeetingTitle(meetingState?.meeting.name, meetingState?.meeting.nominationCommissionName)}
        confirmedWinnerNames={
          (projectionPollResult || projectionPoll)?.confirmedWinnerNames ||
          (projectionPollResult || projectionPoll)?.decisionAudit?.confirmedWinnersThisRound ||
          (meetingState?.currentPoll?.id === (projectionPollResult?.pollId || projectionPoll?.id) ? assistedConfirmedCandidates : undefined)
        }
        candidatesRemoved={
          (projectionPollResult || projectionPoll)?.decisionAudit?.candidatesRemovedByAdmin ||
          (meetingState?.currentPoll?.id === (projectionPollResult?.pollId || projectionPoll?.id) ? assistedEliminatedCandidates : undefined)
        }
        candidatesKept={
          (projectionPollResult || projectionPoll)?.decisionAudit?.candidatesKeptByAdmin
        }
        cutoffPercentage={
          (meetingState?.currentPoll?.id === (projectionPollResult?.pollId || projectionPoll?.id) ? assistedCutoffPercentage : undefined) ||
          (projectionPollResult || projectionPoll)?.suggestedCutoffPercentage ||
          (projectionPollResult || projectionPoll)?.decisionAudit?.cutoffPercentageApplied ||
          (projectionPollResult || projectionPoll)?.decisionAudit?.cutoffPercentageSuggested
        }
      />

      {/* Associados Modal */}
      <AssociadosModal
        isOpen={isAssociadosModalOpen}
        onClose={() => setIsAssociadosModalOpen(false)}
        originalPoll={associadosPoll}
        onSaveDirectAssociates={handleSaveDirectAssociates}
        onSubmitVote={handleSubmitAssociados}
        isSubmitting={isSubmittingAssociados}
      />

      {/* Ata da Comissão de Nomeações Modal */}
      <AtaModal
        isOpen={isAtaModalOpen}
        onClose={() => setIsAtaModalOpen(false)}
        meetingCode={activeCode || null}
      />

      {/* Modal de Instalação do Aplicativo (PWA) */}
      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        isAlreadyInstalled={isAppInstalled}
        hasNativePrompt={Boolean(deferredInstallPrompt || (typeof window !== 'undefined' && (window as any).__deferredInstallPrompt))}
        onTriggerNativeInstall={handleTriggerNativeInstall}
      />
        </main>
      </div>
    </div>
  );
};
