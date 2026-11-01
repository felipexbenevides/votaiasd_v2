import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
  KeyRound,
  Save,
  RotateCcw,
  RotateCw,
  Check,
  Copy,
  Info,
  Layers,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Search,
  Link as LinkIcon,
  ExternalLink,
  Sparkles,
  Edit2,
  Trash2,
  Plus,
  ArrowUpDown,
  GripVertical,
  ChevronUp,
  Filter,
  UserCheck,
  UserPlus,
  UserX,
  ShieldCheck,
  Calendar,
  CheckSquare,
  Vote,
  FileText,
  X,
  ArrowLeft,
  Church,
  Lock,
  Unlock,
  Home,
} from 'lucide-react';
import {
  Meeting,
  NominationMeetingConfig,
  NominationStatus,
  MeetingDepartmentConfig,
  NominationAdminSummary,
  NominationRecord,
  SelectedNominee,
  Poll,
  ExpectedParticipant,
  NominationParticipantsTracking,
} from '../types';
import {
  fetchNominationConfig,
  updateNominationConfig,
  fetchNominationSummary,
  fetchDepartmentCatalog,
  generateNominationLink,
  fetchAdminNominations,
  addAdminManualNomination,
  updateAdminNomination,
  deleteAdminNomination,
  fetchAdminSelections,
  addAdminSelection,
  removeAdminSelection,
  removeAdminSelectionByName,
  batchUpdateAdminSelections,
  createPollFromNominations,
  addCustomDepartment,
  updateDepartment,
  deleteOrDisableDepartment,
  fetchParticipantsTracking,
  fetchExpectedParticipants,
  addExpectedParticipants,
  removeExpectedParticipant,
  clearExpectedParticipants,
  saveMeetingAtaDepartmentOrderApi,
  resetMeetingAtaDepartmentOrderApi,
} from '../services/api';
import { CENTRAL_DEPARTMENT_CATALOG, getDepartmentPollDisplayName } from '../constants/departments';
import { CompactChoiceLimitSelector } from './CompactChoiceLimitSelector';
import { CompactDateTimePicker } from './CompactDateTimePicker';
import { ENABLE_CHURCH_INDICATIONS } from '../constants/featureFlags';
import { AdminChurchNominationsTab } from './AdminChurchNominationsTab';
import { extractBaseMeetingName } from '../utils/meetingTitle';

interface AdminNominationsViewProps {
  meetings: Meeting[];
  activeCode: string;
  onSelectMeeting: (code: string) => void;
  onPollCreated?: () => void;
  onBackToPolls?: () => void;
  onGoHome?: () => void;
  initialTab?: 'nominations_list' | 'config_link' | 'church_indications';
  onTabChange?: (tab: 'nominations_list' | 'config_link' | 'church_indications') => void;
  mode?: 'all' | 'commission' | 'church' | 'received_nominations' | 'commission_config';
}

interface GroupedNominee {
  normalizedName: string;
  displayName: string;
  count: number;
  occurrences: NominationRecord[];
}

export const AdminNominationsView: React.FC<AdminNominationsViewProps> = ({
  meetings,
  activeCode,
  onSelectMeeting,
  onPollCreated,
  onBackToPolls,
  onGoHome,
  initialTab,
  onTabChange,
  mode = 'all',
}) => {
  // Navigation tab
  const [activeTab, setActiveTab] = useState<
    'nominations_list' | 'config_link' | 'church_indications'
  >(() => {
    if (mode === 'received_nominations') return 'nominations_list';
    if (mode === 'commission_config') return 'config_link';
    if (mode === 'church') return 'church_indications';
    if (initialTab) return initialTab;
    return mode === 'commission' ? 'config_link' : 'nominations_list';
  });

  useEffect(() => {
    if (mode === 'received_nominations') {
      setActiveTab('nominations_list');
    } else if (mode === 'commission_config') {
      setActiveTab('config_link');
    } else if (mode === 'church') {
      setActiveTab('church_indications');
    } else if (initialTab && initialTab !== activeTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, mode]);

  const handleTabChange = (tab: 'nominations_list' | 'config_link' | 'church_indications') => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  // Modal de Participantes da Consulta (Ajuste 1)
  const [isParticipantsModalOpen, setIsParticipantsModalOpen] = useState(false);

  // Core data states
  const [config, setConfig] = useState<NominationMeetingConfig | null>(null);
  const [summary, setSummary] = useState<NominationAdminSummary | null>(null);
  const [nominations, setNominations] = useState<NominationRecord[]>([]);
  const [selections, setSelections] = useState<SelectedNominee[]>([]);
  const [trackingData, setTrackingData] = useState<NominationParticipantsTracking | null>(null);
  const [togglingNominee, setTogglingNominee] = useState<string | null>(null);

  // Loading and action states
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [linkSuccess, setLinkSuccess] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Form local state (Config & Link tab)
  const [formEnabled, setFormEnabled] = useState(false);
  const [formStatus, setFormStatus] = useState<NominationStatus>('NOT_CONFIGURED');
  const [formDeadline, setFormDeadline] = useState<string>('');
  const [formDepartments, setFormDepartments] = useState<MeetingDepartmentConfig[]>([]);

  // Simplified UI states (Controles Principais, Link e Limites)
  const [isCloseNominationsModalOpen, setIsCloseNominationsModalOpen] = useState(false);
  const [isClosingNominations, setIsClosingNominations] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isSavingDeadline, setIsSavingDeadline] = useState(false);
  const [deadlineSaveSuccess, setDeadlineSaveSuccess] = useState(false);
  const [isSavingLimits, setIsSavingLimits] = useState(false);
  const [limitsSaveSuccess, setLimitsSaveSuccess] = useState(false);

  // Reopen with expired deadline modal (PARTE 6)
  const [isReopenExpiredModalOpen, setIsReopenExpiredModalOpen] = useState(false);
  const [newFutureDeadline, setNewFutureDeadline] = useState('');
  const [isReopeningWithNewDeadline, setIsReopeningWithNewDeadline] = useState(false);

  // Custom Department management states (PARTE 10-15)
  const [isAddDeptModalOpen, setIsAddDeptModalOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptLimit, setNewDeptLimit] = useState(1);
  const [isSavingNewDept, setIsSavingNewDept] = useState(false);

  const [editingDept, setEditingDept] = useState<MeetingDepartmentConfig | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editDeptLimit, setEditDeptLimit] = useState(1);
  const [editDeptEnabled, setEditDeptEnabled] = useState(true);
  const [isSavingEditDept, setIsSavingEditDept] = useState(false);

  const [deletingDept, setDeletingDept] = useState<MeetingDepartmentConfig | null>(null);
  const [isDeletingDept, setIsDeletingDept] = useState(false);

  // Expected participants management states (PARTE 20-28)
  const [isAddParticipantModalOpen, setIsAddParticipantModalOpen] = useState(false);
  const [participantNamesInput, setParticipantNamesInput] = useState('');
  const [isAddingParticipants, setIsAddingParticipants] = useState(false);
  const [participantSearchQuery, setParticipantSearchQuery] = useState('');
  const [participantStatusFilter, setParticipantStatusFilter] = useState<'all' | 'participated' | 'pending' | 'unexpected'>('all');

  // Search & Filters for Config Tab
  const [configSearchQuery, setConfigSearchQuery] = useState('');
  const [configDeptFilter, setConfigDeptFilter] = useState<'all' | 'enabled' | 'pending'>('all');

  // Search & Filters for Nominations Tab
  const [nominationsSearchQuery, setNominationsSearchQuery] = useState('');
  const [nominationsDeptFilter, setNominationsDeptFilter] = useState<'all' | 'has_nominations' | 'empty'>('all');
  const [deptSortMap, setDeptSortMap] = useState<Record<string, 'frequency' | 'az' | 'za'>>({});
  const [deptSearchMap, setDeptSearchMap] = useState<Record<string, string>>({});
  const [batchProcessingDept, setBatchProcessingDept] = useState<string | null>(null);

  // Accordion state for Nominations Tab: All departments start closed by default (Parte 5)
  const [expandedDeptIds, setExpandedDeptIds] = useState<Set<string>>(() => new Set());

  // Modals state for Edit, Delete, Add
  const [editingRecord, setEditingRecord] = useState<NominationRecord | null>(null);
  const [editNameInput, setEditNameInput] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  const [deletingRecord, setDeletingRecord] = useState<NominationRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [addingToDept, setAddingToDept] = useState<string | null>(null);
  const [addNameInput, setAddNameInput] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);

  // Modal state for Creating Poll from Selections (Etapa 2E)
  const [isCreatePollModalOpen, setIsCreatePollModalOpen] = useState(false);
  const [selectedDeptIdForPoll, setSelectedDeptIdForPoll] = useState<string>('');
  const [pollQuestion, setPollQuestion] = useState<string>('');
  const [includedNomineeNames, setIncludedNomineeNames] = useState<Record<string, boolean>>({});
  const [isSubmittingPoll, setIsSubmittingPoll] = useState(false);
  const [pollSuccessData, setPollSuccessData] = useState<{ question: string; optionsCount: number; poll: Poll } | null>(null);
  const [pollCreationError, setPollCreationError] = useState<string | null>(null);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [pollMaxChoices, setPollMaxChoices] = useState(1);

  // ATA Department Reordering state (Parte 1)
  const [isReorderingAta, setIsReorderingAta] = useState(false);
  const [reorderedDeptIds, setReorderedDeptIds] = useState<string[]>([]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [showResetOrderConfirm, setShowResetOrderConfirm] = useState(false);
  const [isResettingOrder, setIsResettingOrder] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Load meeting data
  const loadData = useCallback(async (code: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [nomsData, cfg, sels, tracking] = await Promise.all([
        fetchAdminNominations(code).catch(() => null),
        fetchNominationConfig(code).catch(() => null),
        fetchAdminSelections(code).catch(() => []),
        fetchParticipantsTracking(code).catch(() => null),
      ]);

      if (cfg) {
        setConfig(cfg);
        setFormEnabled(cfg.enabled);
        setFormStatus(cfg.status);
        setFormDeadline(cfg.deadline ? toLocalDatetimeInput(cfg.deadline) : '');
        setFormDepartments(cfg.departments || []);
      }

      if (nomsData) {
        setNominations(nomsData.nominations || []);
        setSummary(nomsData.summary || null);
      }

      // Caixas desmarcadas por padrão ao carregar/retornar
      setSelections([]);

      if (tracking) {
        setTrackingData(tracking);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar dados de indicações.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeCode) return;
    loadData(activeCode);
  }, [activeCode, loadData]);

  // Ao abrir ou retornar à tela Indicações Recebidas, todos os candidatos iniciam com as caixas desmarcadas
  useEffect(() => {
    setSelections([]);
  }, [activeCode, activeTab]);

  const toLocalDatetimeInput = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      const year = date.getFullYear();
      const month = pad(date.getMonth() + 1);
      const day = pad(date.getDate());
      const hours = pad(date.getHours());
      const minutes = pad(date.getMinutes());
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch {
      return '';
    }
  };

  const formatDeadline = (isoString: string | null) => {
    if (!isoString) return 'Sem prazo definido';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return 'Data inválida';
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  const activeMeeting = useMemo(() => {
    return meetings.find((m) => m.code === activeCode);
  }, [meetings, activeCode]);

  // Catalog defaults map for instant lookup
  const catalogDefaultsMap = useMemo(() => {
    const map = new Map<string, number>();
    CENTRAL_DEPARTMENT_CATALOG.forEach((d) => map.set(d.id, d.defaultMaxPerPerson));
    return map;
  }, []);

  const fullPublicUrl = useMemo(() => {
    if (!config?.publicToken) return '';
    return `${window.location.origin}/indicacoes/${config.publicToken}`;
  }, [config?.publicToken]);

  const handleCopyLink = () => {
    if (!fullPublicUrl) return;

    const rawName = activeMeeting?.name || '';
    const rawCongregation = activeMeeting?.nominationCommissionName || '';
    const { baseName, congregation } = extractBaseMeetingName(rawName, rawCongregation);

    const meetingDisplayName = baseName || rawName;
    const congregationDisplayName = congregation || rawCongregation;

    const lines = [
      '*INDICAÇÕES*',
      meetingDisplayName,
      congregationDisplayName,
      fullPublicUrl,
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Determine computed status (OPEN, CLOSED, EXPIRED, NOT_CONFIGURED)
  const computedStatus = useMemo(() => {
    if (!config) return 'NOT_CONFIGURED';
    if (config.status === 'CLOSED') return 'CLOSED';
    if (config.status === 'OPEN') {
      if (config.deadline && new Date(config.deadline).getTime() <= Date.now()) {
        return 'EXPIRED';
      }
      return 'OPEN';
    }
    return 'NOT_CONFIGURED';
  }, [config]);

  // Count active departments with pending limits (<= 0)
  const pendingCount = useMemo(() => {
    return formDepartments.filter((d) => d.enabled && (!d.maxPerPerson || d.maxPerPerson <= 0)).length;
  }, [formDepartments]);

  const enabledCount = useMemo(() => {
    return formDepartments.filter((d) => d.enabled).length;
  }, [formDepartments]);

  // Map of selections by departmentId and normalized name
  const selectionsMap = useMemo(() => {
    const map = new Map<string, SelectedNominee>();
    for (const sel of selections) {
      const key = `${sel.departmentId}_${sel.nomineeName.trim().toLowerCase()}`;
      map.set(key, sel);
    }
    return map;
  }, [selections]);

  // Count selections for a department
  const getDeptSelectionsCount = useCallback(
    (deptId: string): number => {
      return selections.filter((s) => s.departmentId === deptId).length;
    },
    [selections]
  );

  // Departments that have >= 1 selection
  const departmentsWithSelections = useMemo(() => {
    if (!config?.departments) return [];
    return config.departments.filter((dept) => {
      return selections.some((s) => s.departmentId === dept.departmentId);
    });
  }, [config?.departments, selections]);

  // Toggle selection of a nominee for future poll creation
  const handleToggleSelection = async (
    departmentId: string,
    nomineeName: string,
    isCurrentlySelected: boolean
  ) => {
    if (!activeCode) return;
    const key = `${departmentId}_${nomineeName.trim().toLowerCase()}`;
    setTogglingNominee(key);
    setErrorMessage(null);

    try {
      if (isCurrentlySelected) {
        const existing = selectionsMap.get(key);
        if (existing) {
          await removeAdminSelection(activeCode, existing.id);
        } else {
          await removeAdminSelectionByName(activeCode, { departmentId, nomineeName });
        }
        setSelections((prev) =>
          prev.filter(
            (s) =>
              !(
                s.departmentId === departmentId &&
                s.nomineeName.trim().toLowerCase() === nomineeName.trim().toLowerCase()
              )
          )
        );
      } else {
        const newSel = await addAdminSelection(activeCode, { departmentId, nomineeName });
        setSelections((prev) => {
          const exists = prev.some(
            (s) =>
              s.departmentId === departmentId &&
              s.nomineeName.trim().toLowerCase() === nomineeName.trim().toLowerCase()
          );
          if (exists) return prev;
          return [...prev, newSel];
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao alterar seleção.';
      setErrorMessage(msg);
    } finally {
      setTogglingNominee(null);
    }
  };

  // Toggle selection of all nominees in a department (Botão SELECIONAR TODOS / DESMARCAR TODOS)
  const handleToggleSelectAllDept = async (
    departmentId: string,
    groupedList: GroupedNominee[],
    areAllSelected: boolean
  ) => {
    if (!activeCode || groupedList.length === 0) return;
    setBatchProcessingDept(departmentId);
    setErrorMessage(null);

    const action = areAllSelected ? 'deselect_all' : 'select_all';
    const nomineeNames = groupedList.map((g) => g.displayName);

    // Optimistic UI update
    if (areAllSelected) {
      setSelections((prev) => prev.filter((s) => s.departmentId !== departmentId));
    } else {
      const existingInDept = new Set(
        selections
          .filter((s) => s.departmentId === departmentId)
          .map((s) => s.nomineeName.trim().toLowerCase())
      );
      const newItems: SelectedNominee[] = [];
      const now = new Date().toISOString();
      for (const g of groupedList) {
        if (!existingInDept.has(g.normalizedName)) {
          newItems.push({
            id: 'temp_' + Math.random(),
            meetingId: activeMeeting?.id || '',
            departmentId,
            nomineeName: g.displayName,
            selectedBy: 'admin',
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      setSelections((prev) => [...prev, ...newItems]);
    }

    try {
      const updated = await batchUpdateAdminSelections(activeCode, {
        departmentId,
        action,
        nomineeNames,
      });
      setSelections(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao alternar seleção em lote.';
      setErrorMessage(msg);
      // reload selections on failure
      const current = await fetchAdminSelections(activeCode).catch(() => null);
      if (current) setSelections(current);
    } finally {
      setBatchProcessingDept(null);
    }
  };

  // Open Create Poll Modal (Etapa 2E)
  const handleOpenCreatePollModal = (presetDeptId?: string) => {
    if (departmentsWithSelections.length === 0) return;
    setPollCreationError(null);
    setPollSuccessData(null);

    const targetDeptId =
      presetDeptId && departmentsWithSelections.some((d) => d.departmentId === presetDeptId)
        ? presetDeptId
        : departmentsWithSelections[0].departmentId;

    setSelectedDeptIdForPoll(targetDeptId);

    const targetDept = config?.departments.find((d) => d.departmentId === targetDeptId);
    setPollQuestion(targetDept ? getDepartmentPollDisplayName(targetDept.name) : '');

    // All selected nominees in this department start checked true
    const deptSels = selections.filter((s) => s.departmentId === targetDeptId);
    const initialMap: Record<string, boolean> = {};
    for (const s of deptSels) {
      initialMap[s.nomineeName] = true;
    }
    setIncludedNomineeNames(initialMap);
    setPollAllowMultiple(false);
    setPollMaxChoices(1);

    setIsCreatePollModalOpen(true);
  };

  const handleSelectDeptForPoll = (deptId: string) => {
    setSelectedDeptIdForPoll(deptId);
    const dept = config?.departments.find((d) => d.departmentId === deptId);
    setPollQuestion(dept ? getDepartmentPollDisplayName(dept.name) : '');

    const deptSels = selections.filter((s) => s.departmentId === deptId);
    const map: Record<string, boolean> = {};
    for (const s of deptSels) {
      map[s.nomineeName] = true;
    }
    setIncludedNomineeNames(map);
    setPollAllowMultiple(false);
    setPollMaxChoices(1);
    setPollCreationError(null);
  };

  const handleToggleIncludeNominee = (nomineeName: string) => {
    setIncludedNomineeNames((prev) => ({
      ...prev,
      [nomineeName]: !prev[nomineeName],
    }));
  };

  const handleConfirmCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCode || !selectedDeptIdForPoll) return;

    const cleanQuestion = pollQuestion.trim();
    if (!cleanQuestion) {
      setPollCreationError('O título/pergunta da pauta é obrigatório.');
      return;
    }

    const selectedOptions = Object.entries(includedNomineeNames)
      .filter(([_, isIncluded]) => isIncluded)
      .map(([name]) => name);

    if (selectedOptions.length === 0) {
      setPollCreationError('Selecione pelo menos um nome para criar a pauta.');
      return;
    }

    if (pollAllowMultiple) {
      if (isNaN(pollMaxChoices) || pollMaxChoices < 1) {
        setPollCreationError('O limite de escolhas deve ser um número inteiro maior que zero.');
        return;
      }
      if (pollMaxChoices > selectedOptions.length) {
        setPollCreationError(
          `O limite de escolhas (${pollMaxChoices}) não pode ser maior que o número de opções selecionadas (${selectedOptions.length}).`
        );
        return;
      }
    }

    setIsSubmittingPoll(true);
    setPollCreationError(null);

    try {
      const res = await createPollFromNominations(activeCode, {
        departmentId: selectedDeptIdForPoll,
        nomineeNames: selectedOptions,
        question: cleanQuestion,
        allowMultiple: pollAllowMultiple,
        maxChoices: pollAllowMultiple ? pollMaxChoices : 1,
      });

      setPollSuccessData({
        question: cleanQuestion,
        optionsCount: selectedOptions.length,
        poll: res.poll,
      });

      // Automatically unmark/deselect all names used in this poll
      const usedNamesSet = new Set(selectedOptions.map((n) => n.trim().toLowerCase()));
      setSelections((prev) =>
        prev.filter(
          (s) =>
            !(
              s.departmentId === selectedDeptIdForPoll &&
              usedNamesSet.has(s.nomineeName.trim().toLowerCase())
            )
        )
      );

      // Keep the department expanded in accordion
      setExpandedDeptIds((prev) => new Set(prev).add(selectedDeptIdForPoll));

      try {
        const freshSelections = await fetchAdminSelections(activeCode);
        setSelections(freshSelections);
      } catch {
        // Fallback to local filtering
      }

      if (onPollCreated) {
        onPollCreated();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao criar pauta.';
      setPollCreationError(msg);
    } finally {
      setIsSubmittingPoll(false);
    }
  };

  // Group nominations by department
  const nominationsByDept = useMemo(() => {
    const map = new Map<string, NominationRecord[]>();
    for (const nom of nominations) {
      const list = map.get(nom.departmentId) || [];
      list.push(nom);
      map.set(nom.departmentId, list);
    }
    return map;
  }, [nominations]);

  // Helper to group records by nominee name inside a department
  const getGroupedNominees = useCallback(
    (deptId: string): GroupedNominee[] => {
      const deptRecords = nominationsByDept.get(deptId) || [];
      const groupsMap = new Map<string, GroupedNominee>();

      for (const rec of deptRecords) {
        const normalized = rec.nomineeName.trim().toLowerCase();
        const existing = groupsMap.get(normalized);
        if (existing) {
          existing.count += 1;
          existing.occurrences.push(rec);
        } else {
          groupsMap.set(normalized, {
            normalizedName: normalized,
            displayName: rec.nomineeName.trim(),
            count: 1,
            occurrences: [rec],
          });
        }
      }

      let list = Array.from(groupsMap.values());

      // Filter by internal search for this department
      const deptSearch = (deptSearchMap[deptId] || '').trim().toLowerCase();
      if (deptSearch.length > 0) {
        list = list.filter((g) => g.displayName.toLowerCase().includes(deptSearch));
      }

      // Sort
      const sortMode = deptSortMap[deptId] || 'frequency';
      if (sortMode === 'frequency') {
        list.sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.displayName.localeCompare(b.displayName, 'pt-BR');
        });
      } else if (sortMode === 'az') {
        list.sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
      } else if (sortMode === 'za') {
        list.sort((a, b) => b.displayName.localeCompare(a.displayName, 'pt-BR'));
      }

      return list;
    },
    [nominationsByDept, deptSearchMap, deptSortMap]
  );

  // Filtered departments list for Nominations Tab (Respects custom ATA order if present, or official catalog order)
  const visibleNominationsDepartments = useMemo(() => {
    if (!config?.departments) return [];

    const order = activeMeeting?.ataDepartmentOrder;
    const hasCustomOrder = Array.isArray(order) && order.length > 0;
    const orderKeys = hasCustomOrder ? order.map((k) => k.toLowerCase()) : [];

    const sortedDepts = [...config.departments].sort((a, b) => {
      if (hasCustomOrder) {
        const idxA = orderKeys.indexOf(a.departmentId.toLowerCase());
        const idxB = orderKeys.indexOf(b.departmentId.toLowerCase());
        if (idxA !== -1 && idxB !== -1) {
          if (idxA !== idxB) return idxA - idxB;
        } else if (idxA !== -1) {
          return -1;
        } else if (idxB !== -1) {
          return 1;
        }
      }
      return 0;
    });

    return sortedDepts.filter((dept, idx) => {
      const deptRecords = nominationsByDept.get(dept.departmentId) || [];
      const hasNominations = deptRecords.length > 0;

      // Filter: all / has_nominations / empty
      if (nominationsDeptFilter === 'has_nominations' && !hasNominations) return false;
      if (nominationsDeptFilter === 'empty' && hasNominations) return false;

      // Global search across departments or nominee names
      if (nominationsSearchQuery.trim().length > 0) {
        const q = nominationsSearchQuery.trim().toLowerCase();
        const matchName = dept.name.toLowerCase().includes(q);
        const matchNum = String(idx + 1).includes(q);
        const matchNominee = deptRecords.some((r) => r.nomineeName.toLowerCase().includes(q));
        if (!matchName && !matchNum && !matchNominee) return false;
      }

      return true;
    });
  }, [config?.departments, activeMeeting?.ataDepartmentOrder, nominationsByDept, nominationsDeptFilter, nominationsSearchQuery]);

  // Handle Starting ATA Department Reorder mode
  const handleStartReorder = () => {
    if (!config?.departments) return;
    const currentOrder = activeMeeting?.ataDepartmentOrder;
    const hasCustom = Array.isArray(currentOrder) && currentOrder.length > 0;
    const keys = hasCustom ? currentOrder.map((k) => k.toLowerCase()) : [];

    const sorted = [...config.departments].sort((a, b) => {
      if (hasCustom) {
        const idxA = keys.indexOf(a.departmentId.toLowerCase());
        const idxB = keys.indexOf(b.departmentId.toLowerCase());
        if (idxA !== -1 && idxB !== -1) {
          if (idxA !== idxB) return idxA - idxB;
        } else if (idxA !== -1) {
          return -1;
        } else if (idxB !== -1) {
          return 1;
        }
      }
      return 0;
    });

    setReorderedDeptIds(sorted.map((d) => d.departmentId));
    setIsReorderingAta(true);
  };

  const handleMoveDeptOrder = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= reorderedDeptIds.length) return;
    setReorderedDeptIds((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  };

  const handleSaveReorder = async () => {
    if (!activeCode) return;
    setIsSavingOrder(true);
    setErrorMessage(null);
    try {
      await saveMeetingAtaDepartmentOrderApi(activeCode, reorderedDeptIds);
      if (activeMeeting) {
        activeMeeting.ataDepartmentOrder = reorderedDeptIds;
      }
      setIsReorderingAta(false);
      setActionSuccess('Ordem da ATA salva.');
      setTimeout(() => setActionSuccess(null), 3500);
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar ordem da ATA.';
      setErrorMessage(msg);
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleCancelReorder = () => {
    setIsReorderingAta(false);
    setReorderedDeptIds([]);
  };

  const handleResetOrderToOfficial = async () => {
    if (!activeCode) return;
    setIsResettingOrder(true);
    setErrorMessage(null);
    try {
      await resetMeetingAtaDepartmentOrderApi(activeCode);
      if (activeMeeting) {
        delete activeMeeting.ataDepartmentOrder;
      }
      setShowResetOrderConfirm(false);
      setIsReorderingAta(false);
      setReorderedDeptIds([]);
      setActionSuccess('Ordem oficial dos departamentos restaurada.');
      setTimeout(() => setActionSuccess(null), 3500);
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao restaurar ordem oficial.';
      setErrorMessage(msg);
    } finally {
      setIsResettingOrder(false);
    }
  };

  // Reset accordion to all closed ONLY when switching meeting
  useEffect(() => {
    setExpandedDeptIds(new Set());
  }, [activeCode]);

  const toggleDeptExpansion = (deptId: string) => {
    setExpandedDeptIds((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) {
        next.delete(deptId);
      } else {
        next.add(deptId);
      }
      return next;
    });
  };

  // Handle Edit Action
  const handleOpenEdit = (record: NominationRecord) => {
    setEditingRecord(record);
    setEditNameInput(record.nomineeName);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord || !activeCode) return;
    const cleanName = editNameInput.trim();
    if (!cleanName) {
      alert('O nome da indicação não pode ficar vazio.');
      return;
    }

    setIsUpdating(true);
    setErrorMessage(null);
    try {
      const targetDeptId = editingRecord.departmentId;
      await updateAdminNomination(activeCode, editingRecord.id, cleanName);
      setEditingRecord(null);
      setActionSuccess('Indicação atualizada com sucesso.');
      setTimeout(() => setActionSuccess(null), 3000);
      setExpandedDeptIds((prev) => new Set(prev).add(targetDeptId));
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao atualizar indicação.';
      setErrorMessage(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle Delete Action
  const handleOpenDelete = (record: NominationRecord) => {
    setDeletingRecord(record);
  };

  const handleConfirmDelete = async () => {
    if (!deletingRecord || !activeCode) return;
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      const targetDeptId = deletingRecord.departmentId;
      await deleteAdminNomination(activeCode, deletingRecord.id);
      setDeletingRecord(null);
      setActionSuccess('Indicação excluída com sucesso.');
      setTimeout(() => setActionSuccess(null), 3000);
      setExpandedDeptIds((prev) => new Set(prev).add(targetDeptId));
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao excluir indicação.';
      setErrorMessage(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Manual Add Action
  const handleOpenAdd = (deptId: string) => {
    setAddingToDept(deptId);
    setAddNameInput('');
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingToDept || !activeCode) return;
    const cleanName = addNameInput.trim();
    if (!cleanName) {
      alert('Informe o nome da pessoa indicada.');
      return;
    }

    setIsAdding(true);
    setErrorMessage(null);
    try {
      const targetDeptId = addingToDept;
      await addAdminManualNomination(activeCode, {
        departmentId: targetDeptId,
        nomineeName: cleanName,
      });
      setAddingToDept(null);
      setAddNameInput('');
      setActionSuccess('Indicação manual adicionada com sucesso.');
      setTimeout(() => setActionSuccess(null), 3000);
      setExpandedDeptIds((prev) => new Set(prev).add(targetDeptId));
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao adicionar indicação manual.';
      setErrorMessage(msg);
    } finally {
      setIsAdding(false);
    }
  };

  // Ativar Indicações (Ação Principal Clara)
  const handleActivateNominations = async () => {
    if (!activeCode) return;
    setErrorMessage(null);

    // Validação de departamentos com limite zerado
    if (pendingCount > 0) {
      setErrorMessage(
        `Existem ${pendingCount} departamento(s) ativo(s) com limite pendente (0). Defina os limites na seção abaixo antes de ativar.`
      );
      return;
    }

    // Se o prazo anterior já estiver vencido, abre o modal para exigir uma nova data futura (PARTE 6)
    if (config?.deadline && new Date(config.deadline).getTime() <= Date.now()) {
      const def = new Date();
      def.setDate(def.getDate() + 7);
      def.setHours(23, 59, 0, 0);
      const pad = (n: number) => String(n).padStart(2, '0');
      setNewFutureDeadline(
        `${def.getFullYear()}-${pad(def.getMonth() + 1)}-${pad(def.getDate())}T${pad(def.getHours())}:${pad(def.getMinutes())}`
      );
      setIsReopenExpiredModalOpen(true);
      return;
    }

    // Prazo opcional: se vazio, mantém null (sem prazo)
    const targetDeadline = formDeadline && formDeadline.trim() ? formDeadline.trim() : null;
    if (targetDeadline && new Date(targetDeadline).getTime() <= Date.now()) {
      setErrorMessage('O prazo selecionado já expirou. Selecione uma data e hora no futuro ou deixe em branco.');
      return;
    }

    setIsActivating(true);
    try {
      const deadlineIso = targetDeadline ? new Date(targetDeadline).toISOString() : null;
      let updatedConfig = config;

      // Se o link ainda não foi gerado, gera o token exclusivo
      if (!config?.publicToken) {
        const res = await generateNominationLink(activeCode, {
          deadline: deadlineIso,
          departments: formDepartments,
        });
        updatedConfig = res.config;
      } else {
        updatedConfig = await updateNominationConfig(activeCode, {
          enabled: true,
          status: 'OPEN',
          deadline: deadlineIso,
          departments: formDepartments,
        });
      }

      setConfig(updatedConfig);
      setFormEnabled(true);
      setFormStatus('OPEN');
      setActionSuccess('Indicações ativadas com sucesso!');
      setTimeout(() => setActionSuccess(null), 3500);
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao ativar indicações.';
      setErrorMessage(msg);
    } finally {
      setIsActivating(false);
    }
  };

  // Toggle Chave Visual (PARTE 4, 5, 6)
  const handleToggleNominationStatus = () => {
    if (computedStatus === 'OPEN') {
      setIsCloseNominationsModalOpen(true);
    } else {
      if (config?.deadline && new Date(config.deadline).getTime() <= Date.now()) {
        const def = new Date();
        def.setDate(def.getDate() + 7);
        def.setHours(23, 59, 0, 0);
        const pad = (n: number) => String(n).padStart(2, '0');
        setNewFutureDeadline(
          `${def.getFullYear()}-${pad(def.getMonth() + 1)}-${pad(def.getDate())}T${pad(def.getHours())}:${pad(def.getMinutes())}`
        );
        setIsReopenExpiredModalOpen(true);
      } else {
        handleActivateNominations();
      }
    }
  };

  // Reabertura com novo prazo futuro válido (PARTE 6)
  const handleConfirmReopenWithNewDeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCode || !newFutureDeadline) return;
    if (new Date(newFutureDeadline).getTime() <= Date.now()) {
      setErrorMessage('O novo prazo deve ser uma data e hora no futuro.');
      return;
    }

    setIsReopeningWithNewDeadline(true);
    setErrorMessage(null);
    try {
      const deadlineIso = new Date(newFutureDeadline).toISOString();
      const updated = await updateNominationConfig(activeCode, {
        enabled: true,
        status: 'OPEN',
        deadline: deadlineIso,
        departments: formDepartments,
      });
      setConfig(updated);
      setFormStatus('OPEN');
      setFormDeadline(newFutureDeadline);
      setIsReopenExpiredModalOpen(false);
      setActionSuccess('Indicações reabertas com sucesso!');
      setTimeout(() => setActionSuccess(null), 3500);
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao reabrir indicações.';
      setErrorMessage(msg);
    } finally {
      setIsReopeningWithNewDeadline(false);
    }
  };

  // Confirmar Encerramento das Indicações (Modal)
  const handleConfirmCloseNominations = async () => {
    if (!activeCode) return;
    setIsClosingNominations(true);
    setErrorMessage(null);

    try {
      const updated = await updateNominationConfig(activeCode, {
        enabled: true,
        status: 'CLOSED',
        deadline: formDeadline ? new Date(formDeadline).toISOString() : (config?.deadline || null),
        departments: formDepartments,
      });

      setConfig(updated);
      setFormStatus('CLOSED');
      setIsCloseNominationsModalOpen(false);
      setActionSuccess('Indicações encerradas com sucesso.');
      setTimeout(() => setActionSuccess(null), 3500);
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao encerrar indicações.';
      setErrorMessage(msg);
    } finally {
      setIsClosingNominations(false);
    }
  };

  // Custom Department Handlers (PARTE 10-15)
  const handleSaveNewDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCode || !newDeptName.trim()) return;
    setIsSavingNewDept(true);
    setErrorMessage(null);
    try {
      const updatedConfig = await addCustomDepartment(activeCode, {
        name: newDeptName.trim(),
        maxPerPerson: newDeptLimit,
      });
      setConfig(updatedConfig);
      setFormDepartments(updatedConfig.departments || []);
      setIsAddDeptModalOpen(false);
      setNewDeptName('');
      setNewDeptLimit(1);
      setActionSuccess('Novo departamento adicionado com sucesso!');
      setTimeout(() => setActionSuccess(null), 3500);
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao adicionar departamento.';
      setErrorMessage(msg);
    } finally {
      setIsSavingNewDept(false);
    }
  };

  const handleOpenEditDept = (dept: MeetingDepartmentConfig) => {
    setEditingDept(dept);
    setEditDeptName(dept.name);
    setEditDeptLimit(dept.maxPerPerson);
    setEditDeptEnabled(dept.enabled);
  };

  const handleSaveEditDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCode || !editingDept || !editDeptName.trim()) return;
    setIsSavingEditDept(true);
    setErrorMessage(null);
    try {
      const updatedConfig = await updateDepartment(activeCode, editingDept.departmentId, {
        name: editDeptName.trim(),
        maxPerPerson: editDeptLimit,
        enabled: editDeptEnabled,
      });
      setConfig(updatedConfig);
      setFormDepartments(updatedConfig.departments || []);
      setEditingDept(null);
      setActionSuccess('Departamento atualizado com sucesso!');
      setTimeout(() => setActionSuccess(null), 3500);
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar departamento.';
      setErrorMessage(msg);
    } finally {
      setIsSavingEditDept(false);
    }
  };

  const handleOpenDeleteDept = (dept: MeetingDepartmentConfig) => {
    setDeletingDept(dept);
  };

  const handleConfirmDeleteDept = async (forceDisableOnly?: boolean) => {
    if (!activeCode || !deletingDept) return;
    setIsDeletingDept(true);
    setErrorMessage(null);
    try {
      const res = await deleteOrDisableDepartment(activeCode, deletingDept.departmentId, forceDisableOnly);
      setConfig(res.config);
      setFormDepartments(res.config.departments || []);
      setDeletingDept(null);
      setActionSuccess(res.message);
      setTimeout(() => setActionSuccess(null), 4000);
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir/desativar departamento.';
      setErrorMessage(msg);
    } finally {
      setIsDeletingDept(false);
    }
  };

  // Expected Participants Handlers (PARTE 20-28)
  const handleAddExpectedParticipants = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCode || !participantNamesInput.trim()) return;
    setIsAddingParticipants(true);
    setErrorMessage(null);
    try {
      const names = participantNamesInput
        .split(/[\n,]+/)
        .map((n) => n.trim())
        .filter((n) => n.length > 0);

      if (names.length === 0) {
        setErrorMessage('Informe ao menos um nome válido.');
        setIsAddingParticipants(false);
        return;
      }

      await addExpectedParticipants(activeCode, names);
      setParticipantNamesInput('');
      setIsAddParticipantModalOpen(false);
      setActionSuccess(`${names.length} participante(s) esperado(s) adicionado(s)!`);
      setTimeout(() => setActionSuccess(null), 3500);
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao adicionar participantes esperados.';
      setErrorMessage(msg);
    } finally {
      setIsAddingParticipants(false);
    }
  };

  const handleRemoveExpectedParticipant = async (participantId: string) => {
    if (!activeCode) return;
    try {
      await removeExpectedParticipant(activeCode, participantId);
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao remover participante esperado.';
      setErrorMessage(msg);
    }
  };

  const handleClearExpectedParticipants = async () => {
    if (!activeCode) return;
    if (!window.confirm('Tem certeza que deseja limpar toda a lista de participantes esperados desta reunião?')) {
      return;
    }
    try {
      await clearExpectedParticipants(activeCode);
      setActionSuccess('Lista de participantes esperados limpa.');
      setTimeout(() => setActionSuccess(null), 3000);
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao limpar participantes esperados.';
      setErrorMessage(msg);
    }
  };

  // Alterar e Salvar Prazo Compacto (Ajuste 2)
  const handleDeadlineChange = async (val: string) => {
    setFormDeadline(val);
    if (!activeCode || !config?.publicToken) return;
    setIsSavingDeadline(true);
    try {
      const deadlineIso = val && val.trim() ? new Date(val.trim()).toISOString() : null;
      const updated = await updateNominationConfig(activeCode, {
        enabled: formEnabled,
        status: formStatus,
        deadline: deadlineIso,
        departments: formDepartments,
      });
      setConfig(updated);
      setDeadlineSaveSuccess(true);
      setTimeout(() => setDeadlineSaveSuccess(false), 2000);
      await loadData(activeCode);
    } catch (err: unknown) {
      console.error('Erro ao salvar prazo:', err);
    } finally {
      setIsSavingDeadline(false);
    }
  };

  // Salvar Prazo (Configurações Avançadas)
  const handleSaveDeadline = async () => {
    if (!activeCode) return;
    setErrorMessage(null);

    const deadlineIso = formDeadline && formDeadline.trim() ? new Date(formDeadline.trim()).toISOString() : null;
    if (deadlineIso && new Date(deadlineIso).getTime() <= Date.now() && computedStatus === 'OPEN') {
      setErrorMessage('O prazo selecionado já expirou. Selecione uma data e hora no futuro ou deixe em branco.');
      return;
    }

    setIsSavingDeadline(true);
    try {
      const updated = await updateNominationConfig(activeCode, {
        enabled: formEnabled,
        status: formStatus,
        deadline: deadlineIso,
        departments: formDepartments,
      });
      setConfig(updated);
      setDeadlineSaveSuccess(true);
      setTimeout(() => setDeadlineSaveSuccess(false), 3000);
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar prazo.';
      setErrorMessage(msg);
    } finally {
      setIsSavingDeadline(false);
    }
  };

  // Salvar Limites dos 35 Departamentos
  const handleSaveLimits = async () => {
    if (!activeCode) return;
    setErrorMessage(null);

    if (pendingCount > 0) {
      setErrorMessage(
        `Atenção: existem ${pendingCount} departamento(s) ativo(s) com limite pendente (0). Defina os limites antes de salvar.`
      );
      return;
    }

    setIsSavingLimits(true);
    try {
      const deadlineIso = formDeadline ? new Date(formDeadline).toISOString() : (config?.deadline || null);
      const updated = await updateNominationConfig(activeCode, {
        enabled: formEnabled,
        status: formStatus,
        deadline: deadlineIso,
        departments: formDepartments,
      });
      setConfig(updated);
      setLimitsSaveSuccess(true);
      setTimeout(() => setLimitsSaveSuccess(false), 3000);
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar limites dos departamentos.';
      setErrorMessage(msg);
    } finally {
      setIsSavingLimits(false);
    }
  };

  // Generate Link Action
  const handleGenerateLink = async () => {
    if (!activeCode) return;
    setErrorMessage(null);

    // Prazo opcional: se vazio, mantém null (sem prazo)
    const targetDeadline = formDeadline && formDeadline.trim() ? formDeadline.trim() : null;
    if (targetDeadline && new Date(targetDeadline).getTime() <= Date.now()) {
      setErrorMessage('O prazo selecionado já expirou. Selecione uma data e hora no futuro ou deixe em branco.');
      return;
    }

    if (pendingCount > 0) {
      setErrorMessage(
        `Existem ${pendingCount} departamento(s) ativo(s) com limite pendente de configuração. Defina os limites antes de gerar o link.`
      );
      return;
    }

    setIsGeneratingLink(true);
    try {
      const res = await generateNominationLink(activeCode, {
        deadline: targetDeadline ? new Date(targetDeadline).toISOString() : null,
        departments: formDepartments,
      });

      setConfig(res.config);
      setFormStatus('OPEN');
      setFormEnabled(true);
      setLinkSuccess(true);
      setTimeout(() => setLinkSuccess(false), 4000);
      await loadData(activeCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar link de indicações.';
      setErrorMessage(msg);
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleResetDepartmentsToDefaults = async () => {
    setErrorMessage(null);
    const standardIds = new Set(CENTRAL_DEPARTMENT_CATALOG.map((d) => d.id));
    const customDepts = formDepartments.filter(
      (d) => d.isCustom && !standardIds.has(d.departmentId)
    );
    const resetDepts: MeetingDepartmentConfig[] = [
      ...CENTRAL_DEPARTMENT_CATALOG.map((dept) => ({
        departmentId: dept.id,
        name: dept.name,
        enabled: true,
        maxPerPerson: dept.defaultMaxPerPerson,
        isCustom: false,
      })),
      ...customDepts,
    ];
    setFormDepartments(resetDepts);

    if (activeCode) {
      try {
        const deadlineIso = formDeadline
          ? new Date(formDeadline).toISOString()
          : config?.deadline || null;
        const saved = await updateNominationConfig(activeCode, {
          enabled: formEnabled,
          status: formStatus,
          deadline: deadlineIso,
          departments: resetDepts,
        });
        setConfig(saved);
        setActionSuccess('Os 35 departamentos padrão e seus limites foram restaurados com sucesso.');
        setTimeout(() => setActionSuccess(null), 3500);
      } catch (err) {
        console.error('Erro ao restaurar departamentos padrão:', err);
      }
    }
  };

  const handleSelectAllDepartments = async () => {
    setErrorMessage(null);
    const updated = formDepartments.map((d) => ({
      ...d,
      enabled: true,
    }));
    setFormDepartments(updated);

    if (activeCode) {
      try {
        const deadlineIso = formDeadline
          ? new Date(formDeadline).toISOString()
          : config?.deadline || null;
        const saved = await updateNominationConfig(activeCode, {
          enabled: formEnabled,
          status: formStatus,
          deadline: deadlineIso,
          departments: updated,
        });
        setConfig(saved);
        setActionSuccess('Todos os departamentos foram selecionados.');
        setTimeout(() => setActionSuccess(null), 3000);
      } catch (err) {
        console.error('Erro ao selecionar todos os departamentos:', err);
      }
    }
  };

  const handleDepartmentToggle = async (departmentId: string, enabled: boolean) => {
    const updated = formDepartments.map((d) => (d.departmentId === departmentId ? { ...d, enabled } : d));
    setFormDepartments(updated);
    if (activeCode && config?.publicToken) {
      try {
        const deadlineIso = formDeadline ? new Date(formDeadline).toISOString() : (config?.deadline || null);
        const saved = await updateNominationConfig(activeCode, {
          enabled: formEnabled,
          status: formStatus,
          deadline: deadlineIso,
          departments: updated,
        });
        setConfig(saved);
      } catch (err) {
        console.error('Erro ao sincronizar status do departamento:', err);
      }
    }
  };

  const handleDepartmentMaxChange = (departmentId: string, value: number) => {
    const safeVal = isNaN(value) ? 0 : Math.max(0, Math.min(50, Math.floor(value)));
    setFormDepartments((prev) =>
      prev.map((d) => (d.departmentId === departmentId ? { ...d, maxPerPerson: safeVal } : d))
    );
  };

  if (meetings.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 text-center max-w-xl mx-auto shadow-xs">
        <Users className="w-10 h-10 text-[#9CA3AF] mx-auto mb-3" />
        <h3 className="text-base font-bold text-[#111827]">Nenhuma reunião encontrada</h3>
        <p className="text-xs text-[#6B7280] mt-1">
          Crie ou selecione uma reunião para visualizar e gerenciar as indicações.
        </p>
      </div>
    );
  }

  const getStatusBadge = () => {
    switch (computedStatus) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center justify-center text-center px-2.5 py-1 rounded-full text-xs font-bold bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]">
            INDICAÇÕES ATIVAS
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center justify-center text-center px-2.5 py-1 rounded-full text-xs font-bold bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]">
            INDICAÇÕES EXPIRADAS
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center justify-center text-center px-2.5 py-1 rounded-full text-xs font-bold bg-[#111827] text-white border border-[#111827]">
            INDICAÇÕES ENCERRADAS
          </span>
        );
      case 'NOT_CONFIGURED':
      default:
        return (
          <span className="inline-flex items-center justify-center text-center px-2.5 py-1 rounded-full text-xs font-bold bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB]">
            NÃO CONFIGURADAS
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 4. Resumo da Reunião (Topo) */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                {mode === 'commission_config'
                  ? 'CONFIGURAÇÕES DA COMISSÃO DE NOMEAÇÕES'
                  : mode === 'received_nominations'
                  ? 'INDICAÇÕES RECEBIDAS'
                  : 'COMISSÃO DE NOMEAÇÕES'}
              </span>
              <span className="font-mono text-xs font-bold text-[#111827] bg-[#F3F4F6] px-2 py-0.5 rounded border border-[#E5E7EB]">
                {activeCode}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#111827] mt-0.5">
              {mode === 'commission_config'
                ? 'Configurações da Comissão de Nomeações'
                : mode === 'received_nominations'
                ? 'Indicações Recebidas'
                : 'Indicações da Reunião'}
            </h1>
            {activeMeeting && (() => {
              const { baseName, congregation } = extractBaseMeetingName(activeMeeting.name, activeMeeting.nominationCommissionName);
              return (
                <p className="text-xs text-[#6B7280] mt-0.5">
                  Reunião: <span className="font-semibold text-[#374151]">{baseName}</span>
                  {congregation && (
                    <>
                      {' '}| Congregação: <span className="font-semibold text-[#374151]">{congregation}</span>
                    </>
                  )}
                </p>
              );
            })()}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {(onGoHome || onBackToPolls) && (
              <button
                type="button"
                onClick={onGoHome || onBackToPolls}
                className="px-3.5 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Retornar ao Início"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Início</span>
              </button>
            )}

            <button
              id="btn-nominations-refresh"
              type="button"
              onClick={() => loadData(activeCode)}
              disabled={isLoading}
              className="p-2 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#374151] hover:text-[#111827] border border-[#E5E7EB] rounded-xl transition-all cursor-pointer shadow-2xs shrink-0 disabled:opacity-50"
              title="Atualizar dados"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Informative Stats & Badges (4 metrics) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {/* Status */}
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3.5">
            <span className="text-[11px] font-medium text-[#6B7280] block">Status</span>
            <div className="mt-1">{getStatusBadge()}</div>
          </div>

          {/* Prazo */}
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3.5">
            <span className="text-[11px] font-medium text-[#6B7280] block">Prazo Limite</span>
            <span className="text-xs font-bold text-[#111827] mt-1 block truncate">
              {formatDeadline(config?.deadline || null)}
            </span>
          </div>

          {/* Total de Participantes */}
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3.5">
            <span className="text-[11px] font-medium text-[#6B7280] block">Participantes</span>
            <span className="text-lg font-extrabold text-[#111827] mt-0.5 block">
              {summary?.distinctParticipantsCount ?? 0}
            </span>
          </div>

          {/* Total de Indicações */}
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3.5">
            <span className="text-[11px] font-medium text-[#6B7280] block">Total de Indicações</span>
            <span className="text-lg font-extrabold text-[#111827] mt-0.5 block">
              {summary?.totalNominations ?? nominations.length}
            </span>
          </div>
        </div>

        {/* Global Notifications */}
        {errorMessage && (
          <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl flex items-center gap-2.5 text-xs text-[#DC2626]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {actionSuccess && (
          <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl flex items-center gap-2.5 text-xs text-[#059669]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Main Tab Switcher (Exibido apenas em modo 'all') */}
        {mode === 'all' && (
          <div className="flex items-center gap-2 border-b border-[#E5E7EB] pt-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => handleTabChange('nominations_list')}
              className={`pb-2.5 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'nominations_list'
                  ? 'border-[#111827] text-[#111827]'
                  : 'border-transparent text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Indicações Recebidas ({nominations.length})</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('config_link')}
              className={`pb-2.5 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'config_link'
                  ? 'border-[#111827] text-[#111827]'
                  : 'border-transparent text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              <Vote className="w-3.5 h-3.5" />
              <span>Configurações da Comissão de Nomeações</span>
            </button>

            {ENABLE_CHURCH_INDICATIONS && (
              <button
                type="button"
                onClick={() => handleTabChange('church_indications')}
                className={`pb-2.5 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'church_indications'
                    ? 'border-[#111827] text-[#111827]'
                    : 'border-transparent text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                <Church className="w-3.5 h-3.5" />
                <span>Recomendações da Igreja</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ========================================================
          TAB 1: INDICAÇÕES RECEBIDAS, SELEÇÃO & CRIAR PAUTA (ETAPA 2E)
         ======================================================== */}
      {activeTab === 'nominations_list' && (
        <div className="space-y-5">
          {/* Action Bar for selections counter */}
          {selections.length > 0 && (
            <div className="bg-[#ECFDF5] border border-[#A7F3D0] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#059669] text-white flex items-center justify-center shadow-xs shrink-0">
                  <Vote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold text-[#065F46] uppercase tracking-wider">
                    {selections.length} {selections.length === 1 ? 'Candidato Selecionado' : 'Candidatos Selecionados'}
                  </h3>
                  <p className="text-[11px] text-[#047857]">
                    Utilize o botão &quot;CRIAR PAUTA&quot; no card do departamento correspondente para iniciar a votação.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Top Search & Filter Bar across departments */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Pesquisar por nome de departamento ou indicado..."
                value={nominationsSearchQuery}
                onChange={(e) => setNominationsSearchQuery(e.target.value)}
                className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-hidden focus:ring-1 focus:ring-[#111827]"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5 w-full sm:w-auto sm:flex sm:items-center shrink-0">
              <button
                type="button"
                onClick={() => setNominationsDeptFilter('all')}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer text-center justify-center flex items-center ${
                  nominationsDeptFilter === 'all'
                    ? 'bg-[#111827] text-white'
                    : 'bg-[#F9FAFB] text-[#4B5563] border border-[#E5E7EB] hover:bg-[#F3F4F6]'
                }`}
              >
                Todos ({config?.departments.length || 35})
              </button>
              <button
                type="button"
                onClick={() => setNominationsDeptFilter('has_nominations')}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer text-center justify-center flex items-center ${
                  nominationsDeptFilter === 'has_nominations'
                    ? 'bg-[#111827] text-white'
                    : 'bg-[#F9FAFB] text-[#4B5563] border border-[#E5E7EB] hover:bg-[#F3F4F6]'
                }`}
              >
                Com Indicações ({config?.departments.filter((d) => (nominationsByDept.get(d.departmentId) || []).length > 0).length || 0})
              </button>
              <button
                type="button"
                onClick={() => setNominationsDeptFilter('empty')}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer text-center justify-center flex items-center ${
                  nominationsDeptFilter === 'empty'
                    ? 'bg-[#111827] text-white'
                    : 'bg-[#F9FAFB] text-[#4B5563] border border-[#E5E7EB] hover:bg-[#F3F4F6]'
                }`}
              >
                Sem Indicações ({config?.departments.filter((d) => (nominationsByDept.get(d.departmentId) || []).length === 0).length || 0})
              </button>

              <button
                type="button"
                onClick={() => setIsParticipantsModalOpen(true)}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-[#F9FAFB] text-[#111827] border border-[#E5E7EB] hover:bg-[#F3F4F6] transition-colors cursor-pointer flex items-center justify-center text-center gap-1.5"
              >
                <UserCheck className="w-3.5 h-3.5 text-[#059669]" />
                <span>Participantes ({trackingData?.participatedCount ?? 0})</span>
              </button>

              <button
                id="btn-reorder-ata-departments"
                type="button"
                onClick={handleStartReorder}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-white text-[#374151] hover:text-[#111827] border border-[#D1D5DB] hover:bg-[#F3F4F6] transition-colors cursor-pointer flex items-center justify-center text-center gap-1.5 shadow-2xs"
                title="Reorganizar ordem dos departamentos na ATA"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-[#4B5563]" />
                <span>Reorganizar ordem da ATA</span>
              </button>
            </div>
          </div>

          {/* MODO DE REORGANIZAÇÃO DA ATA (PARTE 1) */}
          {isReorderingAta ? (
            <div className="space-y-4">
              <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#D97706] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <ArrowUpDown className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#92400E] bg-[#FDE68A] px-2 py-0.5 rounded-full border border-[#F59E0B]/30">
                        REORDENAR ATA — ATIVO
                      </span>
                    </div>
                    <p className="text-xs text-[#78350F] mt-1 font-medium">
                      Arraste os itens ou utilize as setas para definir a ordem de apresentação dos departamentos na ATA oficial desta reunião.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowResetOrderConfirm(true)}
                    className="px-3.5 py-2 bg-white hover:bg-[#F9FAFB] border border-[#D1D5DB] text-[#4B5563] hover:text-[#111827] text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                    title="Restaurar sequência padrão oficial"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurar ordem oficial</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelReorder}
                    className="px-3.5 py-2 bg-white hover:bg-[#F9FAFB] border border-[#D1D5DB] text-[#374151] text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-2xs"
                  >
                    Cancelar
                  </button>

                  <button
                    id="btn-save-ata-order"
                    type="button"
                    onClick={handleSaveReorder}
                    disabled={isSavingOrder}
                    className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingOrder ? 'Salvando...' : 'Salvar Ordem'}</span>
                  </button>
                </div>
              </div>

              {/* Lista dos departamentos reordenáveis */}
              <div className="space-y-2">
                {reorderedDeptIds.map((deptId, idx) => {
                  const dept = config?.departments.find((d) => d.departmentId === deptId) || {
                    departmentId: deptId,
                    name: deptId,
                    enabled: true,
                  };
                  const deptRecords = nominationsByDept.get(deptId) || [];
                  const hasNoms = deptRecords.length > 0;

                  return (
                    <div
                      key={deptId}
                      draggable
                      onDragStart={() => setDraggedIndex(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (draggedIndex !== null && draggedIndex !== idx) {
                          handleMoveDeptOrder(draggedIndex, idx);
                          setDraggedIndex(null);
                        }
                      }}
                      className={`bg-white border rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-3 transition-all shadow-xs ${
                        draggedIndex === idx
                          ? 'opacity-50 border-dashed border-[#3B82F6] bg-blue-50/20'
                          : 'border-[#E5E7EB] hover:border-[#D1D5DB]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="cursor-grab active:cursor-grabbing text-[#9CA3AF] hover:text-[#111827] p-1">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <div className="w-7 h-7 rounded-lg bg-[#F3F4F6] border border-[#E5E7EB] text-[#111827] text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs sm:text-sm font-bold text-[#111827] block truncate">
                            {dept.name}
                          </span>
                          {hasNoms && (
                            <span className="text-[10px] text-[#059669] font-semibold">
                              {deptRecords.length} {deptRecords.length === 1 ? 'indicação' : 'indicações'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveDeptOrder(idx, idx - 1)}
                          disabled={idx === 0}
                          className="p-1.5 text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] disabled:opacity-30 disabled:pointer-events-none rounded-lg transition-colors cursor-pointer border border-[#E5E7EB]"
                          title="Mover para cima"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveDeptOrder(idx, idx + 1)}
                          disabled={idx === reorderedDeptIds.length - 1}
                          className="p-1.5 text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] disabled:opacity-30 disabled:pointer-events-none rounded-lg transition-colors cursor-pointer border border-[#E5E7EB]"
                          title="Mover para baixo"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
          /* 35 Official Departments (Cards List with Selection Checkbox) */
          <div className="space-y-4">
            {visibleNominationsDepartments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 text-center text-xs text-[#6B7280]">
                Nenhum departamento encontrado para o filtro selecionado.
              </div>
            ) : (
              visibleNominationsDepartments.map((dept) => {
                const originalIndex =
                  config?.departments.findIndex((d) => d.departmentId === dept.departmentId) ?? 0;
                const deptRecords = nominationsByDept.get(dept.departmentId) || [];
                const groupedList = getGroupedNominees(dept.departmentId);
                const distinctNomineesCount = new Set(
                  deptRecords.map((r) => r.nomineeName.trim().toLowerCase())
                ).size;
                const deptSelectionsCount = getDeptSelectionsCount(dept.departmentId);
                const sortMode = deptSortMap[dept.departmentId] || 'frequency';
                const searchVal = deptSearchMap[dept.departmentId] || '';
                const totalNomineesInDept = groupedList.length;
                const areAllSelected =
                  totalNomineesInDept > 0 &&
                  groupedList.every((g) => selectionsMap.has(`${dept.departmentId}_${g.normalizedName}`));

                const isExpanded = expandedDeptIds.has(dept.departmentId);
                const hasIndications = deptRecords.length > 0;

                return (
                  <div
                    key={dept.departmentId}
                    className={`bg-white rounded-2xl border transition-all shadow-xs overflow-hidden ${
                      hasIndications
                        ? 'border-blue-400/90 shadow-blue-500/5'
                        : isExpanded
                        ? 'border-[#D1D5DB]'
                        : 'border-[#E5E7EB]'
                    } ${!dept.enabled ? 'opacity-70 bg-[#FAFAFA]' : ''}`}
                  >
                    {/* Department Header Card - Click to Expand / Collapse (Partes 1-4, 7-10) */}
                    <div
                      onClick={() => toggleDeptExpansion(dept.departmentId)}
                      className={`p-3.5 sm:p-4.5 ${
                        hasIndications
                          ? 'bg-blue-50/20 hover:bg-blue-50/40'
                          : 'bg-[#FCFCFD] hover:bg-[#F9FAFB]'
                      } transition-colors cursor-pointer select-none flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isExpanded
                          ? hasIndications
                            ? 'border-b border-blue-200/60'
                            : 'border-b border-[#E5E7EB]'
                          : ''
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        {/* Expansion Chevron (Parte 2: ▸ = fechado, ⌄ = aberto) */}
                        <div
                          className="p-1 rounded-lg text-[#6B7280] shrink-0 mt-0.5 sm:mt-0 flex items-center justify-center"
                          aria-hidden="true"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-[#111827]" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-[#9CA3AF]" />
                          )}
                        </div>

                        {/* Department Name & Summary Counters */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono font-bold text-[#9CA3AF]">
                              {originalIndex + 1}.
                            </span>
                            <h2 className="text-sm sm:text-base font-bold text-[#111827]">
                              {dept.name}
                            </h2>
                            {!dept.enabled && (
                              <span className="text-[10px] font-bold text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] px-2 py-0.5 rounded-full">
                                Desabilitado nesta reunião
                              </span>
                            )}
                            {dept.isCustom && (
                              <span className="text-[10px] font-bold text-[#4B5563] bg-[#F3F4F6] border border-[#E5E7EB] px-2 py-0.5 rounded-full">
                                Personalizado
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-[#6B7280]">
                            <span>Limite por pessoa: <strong>{dept.maxPerPerson}</strong></span>
                            <span>·</span>
                            <span className={hasIndications ? 'text-blue-700 font-medium' : ''}>
                              <strong>{deptRecords.length}</strong>{' '}
                              {deptRecords.length === 1 ? 'indicação' : 'indicações'}
                            </span>
                            <span>·</span>
                            <span>
                              <strong>{distinctNomineesCount}</strong>{' '}
                              {distinctNomineesCount === 1 ? 'nome único' : 'nomes únicos'}
                            </span>
                            <span>·</span>
                            <span
                              className={
                                deptSelectionsCount > 0
                                  ? 'text-[#059669] font-bold inline-flex items-center gap-1'
                                  : 'inline-flex items-center gap-1'
                              }
                            >
                              {deptSelectionsCount > 0 && <CheckSquare className="w-3 h-3 text-[#059669]" />}
                              <strong>{deptSelectionsCount}</strong>{' '}
                              {deptSelectionsCount === 1 ? 'selecionado' : 'selecionados'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Header: Shortcut to Create Poll if selections > 0 */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 flex-wrap self-end sm:self-auto shrink-0"
                      >
                        {deptSelectionsCount > 0 && dept.enabled && (
                          <button
                            type="button"
                            onClick={() => handleOpenCreatePollModal(dept.departmentId)}
                            className="px-2.5 py-1 bg-[#059669] hover:bg-[#047857] text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                            title={`Criar pauta com os ${deptSelectionsCount} selecionados deste departamento`}
                          >
                            <Vote className="w-3 h-3" />
                            <span>CRIAR PAUTA ({deptSelectionsCount})</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Department Nominees List - ONLY WHEN EXPANDED (Partes 1-4, 10-12) */}
                    {isExpanded && (
                      <div className="p-4 sm:p-5 space-y-4">
                        {/* Subheader controls inside opened department (Sort, Search, Master Checkbox, Add Nominee) */}
                        {deptRecords.length > 0 && (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-[#F3F4F6]">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Sort selector */}
                              <div className="relative inline-block">
                                <select
                                  value={sortMode}
                                  onChange={(e) =>
                                    setDeptSortMap((prev) => ({
                                      ...prev,
                                      [dept.departmentId]: e.target.value as 'frequency' | 'az' | 'za',
                                    }))
                                  }
                                  className="appearance-none bg-white border border-[#D1D5DB] rounded-lg px-2.5 py-1 text-[11px] font-semibold text-[#374151] pr-6 focus:outline-hidden focus:ring-1 focus:ring-[#111827] cursor-pointer"
                                  title="Ordenar nomes"
                                >
                                  <option value="frequency">Mais indicados</option>
                                  <option value="az">Nome A–Z</option>
                                  <option value="za">Nome Z–A</option>
                                </select>
                                <ArrowUpDown className="w-3 h-3 text-[#9CA3AF] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </div>

                              {/* Internal search input */}
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Pesquisar..."
                                  value={searchVal}
                                  onChange={(e) =>
                                    setDeptSearchMap((prev) => ({
                                      ...prev,
                                      [dept.departmentId]: e.target.value,
                                    }))
                                  }
                                  className="w-28 sm:w-36 bg-white border border-[#D1D5DB] rounded-lg pl-6 pr-2 py-1 text-[11px] text-[#111827] placeholder-[#9CA3AF] focus:outline-hidden focus:ring-1 focus:ring-[#111827]"
                                />
                                <Search className="w-3 h-3 text-[#9CA3AF] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-start sm:self-auto">
                              {/* Master Selection Checkbox - With "Selecionar todos" label */}
                              {totalNomineesInDept > 0 && dept.enabled && (
                                <label
                                  htmlFor={`checkbox-master-${dept.departmentId}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1.5 py-1 px-1.5 hover:bg-[#F3F4F6] rounded-lg transition-colors cursor-pointer shrink-0 select-none text-xs font-medium text-[#374151]"
                                  title={areAllSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                                >
                                  <input
                                    type="checkbox"
                                    id={`checkbox-master-${dept.departmentId}`}
                                    ref={(el) => {
                                      if (el) {
                                        el.indeterminate =
                                          deptSelectionsCount > 0 && deptSelectionsCount < totalNomineesInDept;
                                      }
                                    }}
                                    checked={areAllSelected}
                                    disabled={batchProcessingDept === dept.departmentId}
                                    onChange={() =>
                                      handleToggleSelectAllDept(dept.departmentId, groupedList, areAllSelected)
                                    }
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4 rounded-sm border-[#D1D5DB] text-[#111827] focus:ring-[#111827] cursor-pointer shrink-0 disabled:opacity-40"
                                  />
                                  <span>Selecionar todos</span>
                                </label>
                              )}

                              {/* Manual add button - Apenas UM símbolo + (PARTE 11) */}
                              <button
                                type="button"
                                onClick={() => handleOpenAdd(dept.departmentId)}
                                disabled={!dept.enabled}
                                className="px-2.5 py-1 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#111827] text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50"
                              >
                                <Plus className="w-3 h-3" />
                                <span>ADICIONAR NOME</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {deptRecords.length === 0 ? (
                          <div className="py-2 space-y-3">
                            <div className="text-xs text-[#6B7280]">
                              Nenhuma indicação recebida.
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenAdd(dept.departmentId)}
                                disabled={!dept.enabled}
                                className="px-3 py-1.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#111827] text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>ADICIONAR NOME</span>
                              </button>
                            </div>
                          </div>
                        ) : groupedList.length === 0 ? (
                          <div className="text-xs text-[#9CA3AF] italic py-2">
                            Nenhum nome encontrado para a pesquisa &quot;{searchVal}&quot;.
                          </div>
                        ) : (
                          <div className="divide-y divide-[#F3F4F6]">
                            {groupedList.map((group) => {
                              const selKey = `${dept.departmentId}_${group.normalizedName}`;
                              const isSelected = selectionsMap.has(selKey);
                              const isToggling = togglingNominee === selKey;

                              return (
                                <div
                                  key={group.normalizedName}
                                  className="py-2.5 space-y-2 first:pt-0 last:pb-0 transition-colors rounded-xl px-2 -mx-2 hover:bg-[#F9FAFB]"
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                      {/* Selection Checkbox (Etapa 2D) */}
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        disabled={!dept.enabled || isToggling}
                                        onChange={() =>
                                          handleToggleSelection(
                                            dept.departmentId,
                                            group.displayName,
                                            isSelected
                                          )
                                        }
                                        className="h-4 w-4 rounded-sm border-[#D1D5DB] text-[#111827] focus:ring-[#111827] cursor-pointer shrink-0 disabled:opacity-40"
                                        title={
                                          isSelected
                                            ? 'Desmarcar seleção'
                                            : 'Selecionar para futura pauta'
                                        }
                                      />

                                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                        <span className="text-xs font-bold truncate text-[#111827]">
                                          {group.displayName}
                                        </span>

                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB] shrink-0">
                                          {group.count} {group.count === 1 ? 'indicação' : 'indicações'}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Ações diretas por nome: EDITAR e EXCLUIR */}
                                    {group.occurrences.length === 1 && (
                                      <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenEdit(group.occurrences[0])}
                                          className="px-2.5 py-1 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                          title="Corrigir grafia"
                                        >
                                          <Edit2 className="w-3 h-3 text-[#4B5563]" />
                                          <span>EDITAR</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => handleOpenDelete(group.occurrences[0])}
                                          className="px-2.5 py-1 bg-white border border-[#FECACA] hover:bg-[#FEF2F2] text-[#DC2626] rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                          title="Excluir esta ocorrência"
                                        >
                                          <Trash2 className="w-3 h-3 text-[#DC2626]" />
                                          <span>EXCLUIR</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Se houver múltiplas ocorrências do mesmo nome, listar diretamente cada uma com EDITAR e EXCLUIR */}
                                  {group.occurrences.length > 1 && (
                                    <div className="mt-1 pl-3 sm:pl-7 space-y-1.5 py-1">
                                      {group.occurrences.map((rec, occIdx) => (
                                        <div
                                          key={rec.id}
                                          className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-2 sm:px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                                        >
                                          <div className="space-y-0.5">
                                            <div className="flex items-center gap-2">
                                              <span className="font-mono text-[#9CA3AF] text-[10px]">
                                                #{occIdx + 1}
                                              </span>
                                              <span className="font-semibold text-[#111827]">
                                                {rec.nomineeName}
                                              </span>
                                              {rec.source === 'ADMIN' && (
                                                <span className="px-1.5 py-0.2 rounded-md text-[9px] font-bold bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE]">
                                                  Manual (Admin)
                                                </span>
                                              )}
                                            </div>

                                            <div className="text-[11px] text-[#6B7280]">
                                              {rec.source === 'ADMIN' ? (
                                                <span>Adicionado manualmente pelo administrador</span>
                                              ) : (
                                                <span>
                                                  Indicado por: <strong>{rec.nominatorName || 'Participante'}</strong>
                                                </span>
                                              )}
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                                            <button
                                              type="button"
                                              onClick={() => handleOpenEdit(rec)}
                                              className="px-2.5 py-1 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                              title="Corrigir grafia"
                                            >
                                              <Edit2 className="w-3 h-3 text-[#4B5563]" />
                                              <span>EDITAR</span>
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => handleOpenDelete(rec)}
                                              className="px-2.5 py-1 bg-white border border-[#FECACA] hover:bg-[#FEF2F2] text-[#DC2626] rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                              title="Excluir esta ocorrência"
                                            >
                                              <Trash2 className="w-3 h-3 text-[#DC2626]" />
                                              <span>EXCLUIR</span>
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Bottom Add Nominee button if there are records */}
                        {deptRecords.length > 0 && (
                          <div className="pt-2 border-t border-[#F3F4F6]">
                            <button
                              type="button"
                              onClick={() => handleOpenAdd(dept.departmentId)}
                              disabled={!dept.enabled}
                              className="px-3 py-1.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#111827] text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>ADICIONAR NOME</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          )}
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO PARA RESTAURAR ORDEM OFICIAL */}
      {showResetOrderConfirm && (
        <div className="fixed inset-0 z-50 bg-[#111827]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E5E7EB] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
                <RotateCcw className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#111827]">
                Restaurar a ordem oficial dos departamentos?
              </h3>
            </div>
            <p className="text-xs text-[#4B5563] leading-relaxed">
              Esta ação substituirá a ordem personalizada desta reunião e restaurará a sequência padrão oficial dos 35 departamentos.
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => setShowResetOrderConfirm(false)}
                className="px-4 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-2xs"
              >
                Cancelar
              </button>
              <button
                id="btn-confirm-restore-official-order"
                type="button"
                onClick={handleResetOrderToOfficial}
                disabled={isResettingOrder}
                className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isResettingOrder ? 'Restaurando...' : 'Restaurar Ordem'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 2: INDICAÇÕES DA COMISSÃO DE NOMEAÇÕES
         ======================================================== */}
      {activeTab === 'config_link' && (
        <div className="space-y-5">
          {/* PAINEL COMPACTO DE CONTROLE E CONFIGURAÇÃO (2 LINHAS: STATUS EM CIMA, LINK + PRAZO EM BAIXO) */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-3.5 sm:p-4 shadow-xs space-y-3">
            {/* LINHA 1: Status da Consulta (Esquerda) + Ação (Direita) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Status da Consulta:
                </span>
                <div>{getStatusBadge()}</div>
              </div>

              <div className="flex items-center gap-2">
                {computedStatus === 'OPEN' ? (
                  <button
                    id="btn-close-nominations-action"
                    type="button"
                    onClick={() => setIsCloseNominationsModalOpen(true)}
                    className="px-3.5 py-1.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer shadow-2xs shrink-0 flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>ENCERRAR CONSULTA</span>
                  </button>
                ) : (
                  <button
                    id="btn-activate-nominations-action"
                    type="button"
                    disabled={isActivating || isLoading}
                    onClick={handleActivateNominations}
                    className="px-3.5 py-1.5 bg-[#111827] hover:bg-[#1F2937] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer disabled:opacity-50 shadow-2xs shrink-0 flex items-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>
                      {computedStatus === 'CLOSED'
                        ? 'REABRIR CONSULTA'
                        : 'GERAR LINK E ABRIR'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Mensagens contextuais dos estados */}
            {computedStatus === 'CLOSED' && (
              <div className="p-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#6B7280] leading-relaxed">
                A coleta pública de indicações foi encerrada. O link público está desativado para novos envios e edições.
              </div>
            )}

            {computedStatus === 'EXPIRED' && (
              <div className="p-2.5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#DC2626] leading-relaxed">
                O prazo para envio de indicações expirou ({formatDeadline(config?.deadline || null)}). Novos envios pelo link público estão bloqueados.
              </div>
            )}

            {/* LINHA 2: Link Público (58%) + Prazo (42%) lado a lado no Desktop */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              {/* Bloco Esquerdo: Link Público (~58%) */}
              <div className="md:col-span-7 space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#4B5563] block">
                  LINK PÚBLICO
                </label>
                {config?.publicToken ? (
                  <div className="flex items-center gap-2">
                    <input
                      id="input-public-nomination-link"
                      type="text"
                      readOnly
                      value={fullPublicUrl}
                      className="flex-1 min-w-0 px-3 py-2 bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl text-xs font-mono text-[#374151] select-all focus:outline-hidden"
                    />
                    <button
                      id="btn-copy-public-link"
                      type="button"
                      onClick={handleCopyLink}
                      className={`px-3.5 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center gap-1.5 border shrink-0 ${
                        copiedLink
                          ? 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]'
                          : 'bg-white text-[#111827] border-[#D1D5DB] hover:bg-[#F9FAFB]'
                      }`}
                    >
                      {copiedLink ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#6B7280]">
                    O link público ainda não foi gerado. Defina o prazo e clique em Gerar.
                  </div>
                )}
              </div>

              {/* Bloco Direito: Prazo / Data e Hora Limite (~42%) */}
              <div className="md:col-span-5 space-y-1">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="nomination-deadline-input"
                    className="text-[10px] font-bold uppercase tracking-wider text-[#4B5563]"
                  >
                    PRAZO / DATA E HORA LIMITE (OPCIONAL)
                  </label>
                  {isSavingDeadline && (
                    <span className="text-[10px] text-[#6B7280] font-medium">Salvando...</span>
                  )}
                  {deadlineSaveSuccess && (
                    <span className="text-[10px] text-[#059669] font-bold">Salvo!</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <CompactDateTimePicker
                    id="nomination-deadline-input"
                    value={formDeadline}
                    onChange={handleDeadlineChange}
                    className="flex-1 min-w-0"
                    placeholder="Sem prazo definido (Opcional)"
                  />

                  {!config?.publicToken && (
                    <button
                      id="btn-generate-nomination-link"
                      type="button"
                      onClick={handleGenerateLink}
                      disabled={isGeneratingLink || isLoading}
                      className="px-3.5 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50 shadow-2xs"
                    >
                      {isGeneratingLink ? (
                        <>
                          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Gerando...</span>
                        </>
                      ) : (
                        <span>GERAR</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* D) LIMITES DOS DEPARTAMENTOS */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#E5E7EB] pb-3 gap-3">
              <div>
                <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#111827]" />
                  LIMITES DE INDICAÇÃO POR PESSOA
                </h3>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  {formDepartments.length} Departamentos • Ajuste os limites desta reunião sem afetar outras reuniões ou o catálogo central.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setIsAddDeptModalOpen(true)}
                  className="px-3.5 py-2 bg-white border border-[#111827] hover:bg-[#F3F4F6] text-[#111827] text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Departamento</span>
                </button>

                <button
                  id="btn-save-limits"
                  type="button"
                  disabled={isSavingLimits || isLoading}
                  onClick={handleSaveLimits}
                  className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  {isSavingLimits ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : limitsSaveSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#34D399]" />
                      <span>SALVO!</span>
                    </>
                  ) : (
                    <span>SALVAR ALTERAÇÕES</span>
                  )}
                </button>

                <button
                  id="btn-restore-35-defaults"
                  type="button"
                  onClick={handleResetDepartmentsToDefaults}
                  className="text-xs text-[#4B5563] hover:text-[#111827] flex items-center gap-1 font-semibold underline cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restaurar 35 padrão</span>
                </button>
              </div>
            </div>

            {/* Filtros e Busca de Departamentos */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F9FAFB] p-3 rounded-xl border border-[#E5E7EB]">
              <div className="relative w-full sm:w-56 md:w-64 lg:w-72 shrink-0">
                <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar departamento..."
                  value={configSearchQuery}
                  onChange={(e) => setConfigSearchQuery(e.target.value)}
                  className="w-full bg-white border border-[#D1D5DB] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-hidden focus:ring-1 focus:ring-[#111827]"
                />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                <button
                  type="button"
                  onClick={() => setConfigDeptFilter('all')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    configDeptFilter === 'all'
                      ? 'bg-[#111827] text-white'
                      : 'bg-white text-[#4B5563] border border-[#D1D5DB] hover:bg-[#F3F4F6]'
                  }`}
                >
                  Todos ({formDepartments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setConfigDeptFilter('enabled')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    configDeptFilter === 'enabled'
                      ? 'bg-[#111827] text-white'
                      : 'bg-white text-[#4B5563] border border-[#D1D5DB] hover:bg-[#F3F4F6]'
                  }`}
                >
                  Ativos ({enabledCount})
                </button>
                <button
                  id="btn-select-all-departments"
                  type="button"
                  onClick={handleSelectAllDepartments}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer bg-white text-[#111827] border border-[#D1D5DB] hover:bg-[#F3F4F6] flex items-center gap-1"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Selecionar todos</span>
                </button>
              </div>
            </div>

            {/* Tabela de Limites dos Departamentos */}
            <div className="border border-[#E5E7EB] rounded-xl overflow-hidden divide-y divide-[#E5E7EB]">
              {formDepartments
                .filter((dept, idx) => {
                  if (configDeptFilter === 'enabled' && !dept.enabled) return false;
                  if (configSearchQuery.trim().length > 0) {
                    const q = configSearchQuery.trim().toLowerCase();
                    const matchName = dept.name.toLowerCase().includes(q);
                    const matchNum = String(idx + 1).includes(q);
                    if (!matchName && !matchNum) return false;
                  }
                  return true;
                })
                .map((dept) => {
                  const originalIndex = formDepartments.findIndex(
                    (d) => d.departmentId === dept.departmentId
                  );
                  const catalogDefault = catalogDefaultsMap.get(dept.departmentId) ?? 1;

                  return (
                    <div
                      key={dept.departmentId}
                      className={`p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        !dept.enabled ? 'bg-[#F9FAFB] opacity-60' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold font-mono text-[#9CA3AF] w-6 shrink-0 text-right">
                          {originalIndex + 1}.
                        </span>

                        <input
                          id={`cfg-dept-${dept.departmentId}`}
                          type="checkbox"
                          checked={dept.enabled}
                          onChange={(e) =>
                            handleDepartmentToggle(dept.departmentId, e.target.checked)
                          }
                          className="h-4 w-4 rounded-sm border-[#D1D5DB] text-[#111827] focus:ring-[#111827] cursor-pointer"
                        />

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <label
                              htmlFor={`cfg-dept-${dept.departmentId}`}
                              className="text-xs font-bold text-[#111827] cursor-pointer"
                            >
                              {dept.name}
                            </label>
                            {dept.isCustom ? (
                              <span className="text-[10px] text-[#1E40AF] font-bold bg-[#EFF6FF] border border-[#BFDBFE] px-1.5 py-0.5 rounded-md">
                                Personalizado
                              </span>
                            ) : (
                              <span className="text-[10px] text-[#6B7280] font-medium bg-[#F3F4F6] px-1.5 py-0.5 rounded-md">
                                Padrão: {catalogDefault}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 self-end sm:self-auto pl-9 sm:pl-0 flex-wrap">
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`cfg-max-${dept.departmentId}`}
                            className="text-xs font-medium text-[#4B5563]"
                          >
                            Limite nesta reunião:
                          </label>
                          <input
                            id={`cfg-max-${dept.departmentId}`}
                            type="number"
                            min={0}
                            max={50}
                            disabled={!dept.enabled}
                            value={dept.maxPerPerson === 0 ? '' : dept.maxPerPerson}
                            placeholder="0"
                            onChange={(e) =>
                              handleDepartmentMaxChange(
                                dept.departmentId,
                                parseInt(e.target.value, 10)
                              )
                            }
                            className="w-20 rounded-lg px-2.5 py-1 text-xs font-bold text-center border border-[#D1D5DB] text-[#111827] focus:outline-hidden focus:ring-1 focus:ring-[#111827] disabled:bg-[#F3F4F6]"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditDept(dept)}
                            className="p-1.5 bg-white hover:bg-[#F3F4F6] text-[#374151] border border-[#D1D5DB] rounded-lg transition-colors cursor-pointer"
                            title="Editar departamento"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {dept.isCustom && (
                            <button
                              type="button"
                              onClick={() => handleOpenDeleteDept(dept)}
                              className="p-1.5 bg-white hover:bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] rounded-lg transition-colors cursor-pointer"
                              title="Excluir ou desativar departamento personalizado"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 4: INDICAÇÕES DA IGREJA (MÓDULO EXPERIMENTAL CONSULTIVO)
         ======================================================== */}
      {ENABLE_CHURCH_INDICATIONS && activeTab === 'church_indications' && (
        <AdminChurchNominationsTab
          meetingCode={activeCode}
          meetingName={activeMeeting?.name || ''}
          congregationName={activeMeeting?.nominationCommissionName || ''}
        />
      )}

      {/* ========================================================
          MODAL: CRIAR PAUTA A PARTIR DOS NOMES SELECIONADOS (ETAPA 2E)
         ======================================================== */}
      {isCreatePollModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-lg w-full shadow-xl space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#059669] text-white flex items-center justify-center shadow-xs">
                  <Vote className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111827]">
                    Criar Pauta a partir dos Selecionados
                  </h3>
                  <p className="text-xs text-[#6B7280]">
                    Cada departamento gera uma pauta de votação independente.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCreatePollModalOpen(false)}
                className="p-1 text-[#9CA3AF] hover:text-[#111827] rounded-lg transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Success state */}
            {pollSuccessData ? (
              <div className="space-y-4 py-2 text-center">
                <div className="w-12 h-12 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center mx-auto text-[#059669]">
                  <CheckCircle2 className="w-6 h-6" />
                </div>

                <div className="space-y-1">
                  <h4 className="text-base font-extrabold text-[#111827]">
                    PAUTA CRIADA COM SUCESSO
                  </h4>
                  <p className="text-xs text-[#4B5563] max-w-sm mx-auto leading-relaxed">
                    A pauta com <strong>{pollSuccessData.optionsCount} opções</strong> foi registrada no estado{' '}
                    <strong>Aguardando</strong>. A votação NÃO foi aberta automaticamente.
                  </p>
                </div>

                <div className="p-3 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB] text-left text-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[#9CA3AF] block">
                    Pergunta Cadastrada:
                  </span>
                  <p className="font-semibold text-[#111827]">{pollSuccessData.question}</p>
                </div>

                <p className="text-[11px] text-[#6B7280]">
                  Você pode abrir a votação a qualquer momento no painel de Pautas da reunião. As indicações e seleções permanecem salvas para consulta.
                </p>

                <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                  <button
                    id="btn-continue-nominations"
                    type="button"
                    onClick={() => {
                      setIsCreatePollModalOpen(false);
                      setPollSuccessData(null);
                    }}
                    className="flex-1 py-2.5 px-3 bg-white hover:bg-[#F9FAFB] text-[#374151] border border-[#D1D5DB] text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-2xs"
                  >
                    Continuar nas Indicações
                  </button>

                  <button
                    id="btn-go-to-polls"
                    type="button"
                    onClick={() => {
                      setIsCreatePollModalOpen(false);
                      setPollSuccessData(null);
                      if (onBackToPolls) {
                        onBackToPolls();
                      }
                    }}
                    className="flex-1 py-2.5 px-3 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <span>Ir para Pauta & Votação</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Form State */
              <form onSubmit={handleConfirmCreatePoll} className="space-y-4">
                {pollCreationError && (
                  <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl flex items-center gap-2 text-xs text-[#DC2626]">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{pollCreationError}</span>
                  </div>
                )}

                {/* Step 1: Select Department (if more than 1 has selections) */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#374151]">
                    Departamento da Pauta:
                  </label>
                  {departmentsWithSelections.length > 1 ? (
                    <select
                      value={selectedDeptIdForPoll}
                      onChange={(e) => handleSelectDeptForPoll(e.target.value)}
                      className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3 py-2 text-xs font-semibold text-[#111827] focus:outline-hidden focus:ring-1 focus:ring-[#111827]"
                    >
                      {departmentsWithSelections.map((d) => {
                        const count = getDeptSelectionsCount(d.departmentId);
                        const displayName = getDepartmentPollDisplayName(d.name);
                        return (
                          <option key={d.departmentId} value={d.departmentId}>
                            {displayName} — ({count} {count === 1 ? 'selecionado' : 'selecionados'})
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3.5 py-2 text-xs font-bold text-[#111827]">
                      {getDepartmentPollDisplayName(departmentsWithSelections[0]?.name)}
                    </div>
                  )}
                </div>

                {/* Step 2: Poll Question/Title */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#374151]">
                    Título / Pergunta da Pauta:
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="Ex: Escolha o Ancião para o próximo período."
                    className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs text-[#111827] focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white resize-none"
                  />
                  <span className="text-[10px] text-[#9CA3AF] block">
                    Você pode personalizar o texto que os participantes visualizarão no smartphone.
                  </span>
                </div>

                {/* Step 3: Review Options (Selected nominees with checkboxes) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#374151]">
                      Opções da Pauta (Nomes Selecionados):
                    </label>
                    <span className="text-[11px] font-semibold text-[#6B7280]">
                      {
                        Object.values(includedNomineeNames).filter(Boolean).length
                      }{' '}
                      de {Object.keys(includedNomineeNames).length} incluídos
                    </span>
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-[#E5E7EB] rounded-xl divide-y divide-[#E5E7EB] bg-[#F9FAFB] p-1">
                    {Object.keys(includedNomineeNames).length === 0 ? (
                      <div className="text-xs text-[#9CA3AF] italic p-3 text-center">
                        Nenhum candidato selecionado neste departamento.
                      </div>
                    ) : (
                      Object.keys(includedNomineeNames).map((nomineeName, idx) => {
                        const isIncluded = includedNomineeNames[nomineeName] ?? true;
                        return (
                          <label
                            key={nomineeName}
                            className={`p-2.5 flex items-center justify-between gap-2.5 text-xs rounded-lg transition-colors cursor-pointer ${
                              isIncluded ? 'bg-white font-medium text-[#111827]' : 'text-[#9CA3AF] opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() => handleToggleIncludeNominee(nomineeName)}
                                className="h-4 w-4 rounded-sm border-[#D1D5DB] text-[#111827] focus:ring-[#111827] cursor-pointer"
                              />
                              <span>
                                {idx + 1}. {nomineeName}
                              </span>
                            </div>

                            <span className="text-[10px] text-[#9CA3AF]">
                              {isIncluded ? 'Incluído na pauta' : 'Retirado desta pauta'}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <span className="text-[10px] text-[#6B7280] block">
                    Desmarcar um nome aqui apenas o retira desta pauta específica; ele continua selecionado no painel de indicações.
                  </span>
                </div>

                {/* Step 4: Configuração de Limite de Escolhas */}
                <div className="pt-3 border-t border-[#E5E7EB] space-y-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pollAllowMultiple}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setPollAllowMultiple(checked);
                        if (checked && pollMaxChoices < 1) {
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
                        <label className="text-xs font-bold text-[#374151]">
                          Limite de escolhas:
                        </label>
                        <CompactChoiceLimitSelector
                          value={pollMaxChoices || 1}
                          onChange={(val) => setPollMaxChoices(val)}
                        />
                      </div>
                      <p className="text-[11px] text-[#6B7280]">
                        O participante poderá selecionar no máximo {pollMaxChoices} {pollMaxChoices === 1 ? 'opção' : 'opções'}.
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E5E7EB]">
                  <button
                    type="button"
                    onClick={() => setIsCreatePollModalOpen(false)}
                    disabled={isSubmittingPoll}
                    className="px-4 py-2.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    CANCELAR
                  </button>

                  <button
                    type="submit"
                    disabled={
                      isSubmittingPoll ||
                      !pollQuestion.trim() ||
                      Object.values(includedNomineeNames).filter(Boolean).length === 0
                    }
                    className="px-5 py-2.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-xs disabled:opacity-50"
                  >
                    {isSubmittingPoll ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Criando Pauta...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>CRIAR PAUTA</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: EDITAR GRAFIA DE INDICAÇÃO
         ======================================================== */}
      {editingRecord && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-[#111827]" />
              Corrigir Grafia da Indicação
            </h3>

            <p className="text-xs text-[#6B7280] leading-relaxed">
              Altere a grafia do nome indicado. Esta ação modifica apenas este registro específico.
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#374151] mb-1">
                  Nome da pessoa indicada:
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={editNameInput}
                  onChange={(e) => setEditNameInput(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs text-[#111827] focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isUpdating ? 'Salvando...' : 'Salvar Alteração'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: CONFIRMAR EXCLUSÃO DE INDICAÇÃO
         ======================================================== */}
      {deletingRecord && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center mx-auto text-[#DC2626]">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#111827]">Excluir esta indicação?</h3>
              <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
                Esta ação removerá esta indicação da reunião ({deletingRecord.nomineeName}).
                Se outros participantes também indicaram este nome, as ocorrências deles permanecerão intactas.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingRecord(null)}
                disabled={isDeleting}
                className="w-1/2 py-2.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="w-1/2 py-2.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                {isDeleting ? 'Excluindo...' : 'EXCLUIR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ADICIONAR INDICAÇÃO MANUAL (ADMIN)
         ======================================================== */}
      {addingToDept && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#111827]" />
                Adicionar Indicação Manual
              </h3>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Departamento:{' '}
                <strong>
                  {config?.departments.find((d) => d.departmentId === addingToDept)?.name}
                </strong>
              </p>
            </div>

            <form onSubmit={handleSaveAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#374151] mb-1">
                  Nome da pessoa indicada:
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ex: Carlos Andrade"
                  value={addNameInput}
                  onChange={(e) => setAddNameInput(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs text-[#111827] focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddingToDept(null)}
                  disabled={isAdding}
                  className="px-4 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isAdding ? 'Adicionando...' : 'Adicionar Indicação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: CONFIRMAR ENCERRAMENTO DAS INDICAÇÕES (PARTE 16-19)
         ======================================================== */}
      {isCloseNominationsModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center mx-auto text-[#DC2626]">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#111827]">Encerrar Indicações?</h3>
              <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
                Os participantes não poderão mais enviar ou editar indicações para esta reunião. Deseja realmente encerrar o período de indicações?
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCloseNominationsModalOpen(false)}
                disabled={isClosingNominations}
                className="w-1/2 py-2.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={handleConfirmCloseNominations}
                disabled={isClosingNominations}
                className="w-1/2 py-2.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isClosingNominations ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Encerrando...</span>
                  </>
                ) : (
                  <span>ENCERRAR INDICAÇÕES</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ADICIONAR DEPARTAMENTO PERSONALIZADO (PARTE 10-15)
         ======================================================== */}
      {isAddDeptModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#111827]" />
                Adicionar Departamento Personalizado
              </h3>
              <button
                type="button"
                onClick={() => setIsAddDeptModalOpen(false)}
                className="text-[#9CA3AF] hover:text-[#111827] p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewDepartment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#374151] mb-1">
                  Nome do Departamento:
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ex: Conselho Tutelar, Comissão Especial..."
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs text-[#111827] focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#374151] mb-1">
                  Limite de Indicação por Pessoa:
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  required
                  value={newDeptLimit}
                  onChange={(e) => setNewDeptLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-28 bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs text-[#111827] font-bold focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white"
                />
                <p className="text-[11px] text-[#6B7280] mt-1">
                  Quantidade máxima de indicações que cada participante pode enviar para este departamento.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setIsAddDeptModalOpen(false)}
                  disabled={isSavingNewDept}
                  className="px-4 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingNewDept || !newDeptName.trim()}
                  className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingNewDept ? 'Adicionando...' : 'Adicionar Departamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: EDITAR DEPARTAMENTO (PARTE 10-15)
         ======================================================== */}
      {editingDept && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#111827]" />
                Editar Departamento
              </h3>
              <button
                type="button"
                onClick={() => setEditingDept(null)}
                className="text-[#9CA3AF] hover:text-[#111827] p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditDept} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#374151] mb-1">
                  Nome do Departamento:
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={editDeptName}
                  onChange={(e) => setEditDeptName(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs text-[#111827] focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#374151] mb-1">
                  Limite de Indicação por Pessoa:
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  required
                  value={editDeptLimit}
                  onChange={(e) => setEditDeptLimit(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-28 bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs text-[#111827] font-bold focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-dept-enabled-modal-checkbox"
                  checked={editDeptEnabled}
                  onChange={(e) => setEditDeptEnabled(e.target.checked)}
                  className="h-4 w-4 rounded-sm border-[#D1D5DB] text-[#111827] focus:ring-[#111827] cursor-pointer"
                />
                <label
                  htmlFor="edit-dept-enabled-modal-checkbox"
                  className="text-xs font-bold text-[#374151] cursor-pointer"
                >
                  Departamento Habilitado nesta Reunião
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setEditingDept(null)}
                  disabled={isSavingEditDept}
                  className="px-4 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEditDept || !editDeptName.trim()}
                  className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingEditDept ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: EXCLUIR / DESATIVAR DEPARTAMENTO (PARTE 10-15)
         ======================================================== */}
      {deletingDept && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center mx-auto text-[#DC2626]">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#111827]">
                {deletingDept.isCustom ? 'Excluir Departamento?' : 'Desativar Departamento?'}
              </h3>
              <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
                Deseja remover o departamento <strong>{deletingDept.name}</strong> desta reunião?
              </p>
              {(nominationsByDept.get(deletingDept.departmentId) || []).length > 0 && (
                <div className="mt-2.5 text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200 text-left">
                  ⚠️ Este departamento já possui {(nominationsByDept.get(deletingDept.departmentId) || []).length} indicação(ões) registrada(s). Ele será desativado para preservar o histórico existente.
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingDept(null)}
                disabled={isDeletingDept}
                className="w-1/2 py-2.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDeleteDept()}
                disabled={isDeletingDept}
                className="w-1/2 py-2.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isDeletingDept ? 'Processando...' : deletingDept.isCustom ? 'EXCLUIR' : 'DESATIVAR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ADICIONAR PARTICIPANTES ESPERADOS (PARTE 20-28)
         ======================================================== */}
      {isAddParticipantModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-lg w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#111827]" />
                Adicionar Participantes Esperados
              </h3>
              <button
                type="button"
                onClick={() => setIsAddParticipantModalOpen(false)}
                className="text-[#9CA3AF] hover:text-[#111827] p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddExpectedParticipants} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#374151] mb-1">
                  Cole ou digite os nomes dos participantes:
                </label>
                <textarea
                  required
                  autoFocus
                  rows={7}
                  placeholder={`João da Silva\nMaria Oliveira\nCarlos Souza\nAna Paula\n...`}
                  value={participantNamesInput}
                  onChange={(e) => setParticipantNamesInput(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl p-3 text-xs text-[#111827] focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white font-mono"
                />
                <p className="text-[11px] text-[#6B7280] mt-1.5 leading-relaxed">
                  Insira um nome por linha ou separe por vírgula. Participantes que entrarem com outros nomes não serão bloqueados e continuarão sendo computados normalmente.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setIsAddParticipantModalOpen(false)}
                  disabled={isAddingParticipants}
                  className="px-4 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAddingParticipants || !participantNamesInput.trim()}
                  className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isAddingParticipants ? 'Adicionando...' : 'Adicionar à Lista'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: REABRIR COM NOVO PRAZO (PARTE 6)
         ======================================================== */}
      {isReopenExpiredModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#111827]" />
                Reabrir Indicações com Novo Prazo
              </h3>
              <button
                type="button"
                onClick={() => setIsReopenExpiredModalOpen(false)}
                className="text-[#9CA3AF] hover:text-[#111827] p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmReopenWithNewDeadline} className="space-y-4">
              <p className="text-xs text-[#6B7280]">
                O prazo anterior já expirou. Para reabrir as indicações, defina um novo prazo futuro válido:
              </p>

              <div>
                <label className="block text-xs font-bold text-[#374151] mb-1">
                  Novo Prazo Limite (Data e Hora):
                </label>
                <CompactDateTimePicker
                  id="reopen-deadline-input"
                  value={newFutureDeadline}
                  onChange={(val) => setNewFutureDeadline(val)}
                  className="w-full"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setIsReopenExpiredModalOpen(false)}
                  disabled={isReopeningWithNewDeadline}
                  className="px-4 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isReopeningWithNewDeadline || !newFutureDeadline}
                  className="px-4 py-2 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isReopeningWithNewDeadline ? 'Reabrindo...' : 'Reabrir Indicações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: PARTICIPANTES DA CONSULTA (AJUSTE 1)
         ======================================================== */}
      {isParticipantsModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-2xl space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#F3F4F6] pb-3 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#059669] shrink-0" />
                <h3 className="text-sm sm:text-base font-extrabold text-[#111827] leading-tight">
                  MEMBROS DA COMISSÃO DE NOMEAÇÕES
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsParticipantsModalOpen(false)}
                className="p-1.5 text-[#9CA3AF] hover:text-[#111827] rounded-xl transition cursor-pointer shrink-0"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List */}
            <div className="max-h-[60vh] overflow-y-auto space-y-1 pr-1">
              {(!trackingData ||
                (trackingData.participated || []).filter(
                  (p) =>
                    !p.sessionId?.startsWith('admin_manual_') &&
                    !(p.name === 'Administrador' && p.sessionId?.startsWith('admin_manual_'))
                ).length === 0) ? (
                <div className="py-8 text-center text-xs text-[#6B7280]">
                  Nenhum participante enviou indicações até o momento.
                </div>
              ) : (
                <div className="divide-y divide-[#E5E7EB]">
                  {(trackingData.participated || [])
                    .filter(
                      (p) =>
                        !p.sessionId?.startsWith('admin_manual_') &&
                        !(p.name === 'Administrador' && p.sessionId?.startsWith('admin_manual_'))
                    )
                    .map((p, idx) => {
                      const isSent = Boolean(p.finalized);
                      const percentStr = p.finalized ? '100%' : `${p.percentage ?? 0}%`;

                      return (
                        <div
                          key={`modal-part-${idx}`}
                          className="py-3 px-2 flex items-center justify-between gap-2 sm:gap-3 text-xs"
                        >
                          <span className="font-bold text-[#111827] truncate min-w-0 flex-1">
                            {p.name}
                          </span>

                          <div className="flex items-center gap-2 shrink-0">
                            {isSent ? (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                                ENVIADO
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                                EM ANDAMENTO
                              </span>
                            )}

                            <span
                              className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded-md border shrink-0 text-right min-w-[48px] ${
                                isSent
                                  ? 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]'
                                  : 'bg-[#F3F4F6] text-[#374151] border-[#E5E7EB]'
                              }`}
                            >
                              {percentStr}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-[#F3F4F6]">
              <button
                type="button"
                onClick={() => setIsParticipantsModalOpen(false)}
                className="w-full py-2.5 bg-[#111827] hover:bg-[#1F2937] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer"
              >
                FECHAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
