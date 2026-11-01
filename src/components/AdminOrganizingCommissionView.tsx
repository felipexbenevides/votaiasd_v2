import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers,
  Plus,
  Check,
  RotateCcw,
  RotateCw,
  Search,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Home,
  X,
  Copy,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Vote,
  CheckSquare,
  Users,
  Eye,
} from 'lucide-react';
import {
  Meeting,
  OrganizingCommissionConfig,
  OrganizingCommissionCriterion,
  OrganizingCommissionAdminSummary,
  OrganizingNominationRecord,
  OrganizingSelectedNominee,
} from '../types';
import {
  fetchOrganizingCommissionConfig,
  saveOrganizingCommissionConfig,
  updateOrganizingCommissionStatus,
  addAdminManualOrganizingNomination,
  updateAdminOrganizingNomination,
  deleteAdminOrganizingNomination,
  toggleAdminOrganizingSelection,
  batchUpdateAdminOrganizingSelections,
  createPollFromOrganizingNominations,
} from '../services/api';
import { formatOrganizingCriterionPollTitle } from '../constants/departments';
import { CompactDateTimePicker } from './CompactDateTimePicker';
import { CompactChoiceLimitSelector } from './CompactChoiceLimitSelector';
import { extractBaseMeetingName } from '../utils/meetingTitle';

interface AdminOrganizingCommissionViewProps {
  meetings: Meeting[];
  activeCode: string;
  mode?: 'config' | 'received_nominations';
  onSelectMeeting?: (code: string) => void;
  onPollCreated?: () => void;
  onGoHome?: () => void;
  onBackToPolls?: () => void;
  onNavigateToPolls?: () => void;
  onRefreshMeeting?: () => void;
}

const DEFAULT_ORGANIZING_CRITERIA: OrganizingCommissionCriterion[] = [
  { criterionId: 'homens', name: 'HOMENS', enabled: true, maxLimit: 1, isCustom: false },
  { criterionId: 'mulheres', name: 'MULHERES', enabled: true, maxLimit: 1, isCustom: false },
  { criterionId: 'jovens', name: 'JOVENS', enabled: true, maxLimit: 1, isCustom: false },
];

function normalizeCriterionNameKey(raw: string): string {
  return (raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

function formatDeadlineDisplay(iso?: string | null): string {
  if (!iso) return 'Sem prazo definido';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'Sem prazo definido';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Sem prazo definido';
  }
}

export const AdminOrganizingCommissionView: React.FC<AdminOrganizingCommissionViewProps> = ({
  meetings,
  activeCode,
  mode = 'config',
  onPollCreated,
  onGoHome,
  onBackToPolls,
  onNavigateToPolls,
  onRefreshMeeting,
}) => {
  const [config, setConfig] = useState<OrganizingCommissionConfig | null>(null);
  const [summary, setSummary] = useState<OrganizingCommissionAdminSummary | null>(null);
  const [formCriteria, setFormCriteria] = useState<OrganizingCommissionCriterion[]>(
    DEFAULT_ORGANIZING_CRITERIA
  );
  const [formDeadline, setFormDeadline] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSavingLimits, setIsSavingLimits] = useState<boolean>(false);
  const [limitsSaveSuccess, setLimitsSaveSuccess] = useState<boolean>(false);
  const [isSavingDeadline, setIsSavingDeadline] = useState<boolean>(false);
  const [deadlineSaveSuccess, setDeadlineSaveSuccess] = useState<boolean>(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Search and filter state (Config screen)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [criterionFilter, setCriterionFilter] = useState<'all' | 'enabled'>('all');

  // Add Criterion Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newCriterionName, setNewCriterionName] = useState<string>('');
  const [newCriterionLimit, setNewCriterionLimit] = useState<number>(1);
  const [isSavingNewCriterion, setIsSavingNewCriterion] = useState<boolean>(false);

  // Edit Criterion Modal state
  const [editingCriterion, setEditingCriterion] = useState<OrganizingCommissionCriterion | null>(
    null
  );
  const [editCriterionName, setEditCriterionName] = useState<string>('');
  const [editCriterionLimit, setEditCriterionLimit] = useState<number>(1);
  const [editCriterionEnabled, setEditCriterionEnabled] = useState<boolean>(true);
  const [isSavingEditCriterion, setIsSavingEditCriterion] = useState<boolean>(false);

  // Delete Criterion Modal state
  const [deletingCriterion, setDeletingCriterion] =
    useState<OrganizingCommissionCriterion | null>(null);
  const [isDeletingCriterion, setIsDeletingCriterion] = useState<boolean>(false);

  // Received Nominations screen state
  const [nominationsSearchQuery, setNominationsSearchQuery] = useState<string>('');
  const [nominationsFilter, setNominationsFilter] = useState<'all' | 'has_nominations' | 'empty'>(
    'all'
  );
  const [expandedCriteriaIds, setExpandedCriteriaIds] = useState<Set<string>>(
    new Set(['homens', 'mulheres', 'jovens'])
  );
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [batchLoadingCriterion, setBatchLoadingCriterion] = useState<string | null>(null);
  const [selectedNomineesMap, setSelectedNomineesMap] = useState<Map<string, Set<string>>>(() => new Map());

  // All checkboxes start unchecked upon opening or returning to the screen
  useEffect(() => {
    setSelectedNomineesMap(new Map());
  }, [activeCode, mode]);

  // Manual Add Nominee Modal state
  const [addingToCriterionId, setAddingToCriterionId] = useState<string | null>(null);
  const [manualNomineeName, setManualNomineeName] = useState<string>('');
  const [isAddingManualNominee, setIsAddingManualNominee] = useState<boolean>(false);

  // Edit Occurrence Modal state
  const [editingOccurrence, setEditingOccurrence] = useState<OrganizingNominationRecord | null>(
    null
  );
  const [editOccurrenceName, setEditOccurrenceName] = useState<string>('');
  const [isSavingOccurrence, setIsSavingOccurrence] = useState<boolean>(false);

  // Delete Occurrence Modal state
  const [deletingOccurrence, setDeletingOccurrence] = useState<OrganizingNominationRecord | null>(
    null
  );
  const [isDeletingOccurrence, setIsDeletingOccurrence] = useState<boolean>(false);

  // View Nominators Modal state ("VER INDICAÇÕES")
  const [viewingNomineeModal, setViewingNomineeModal] = useState<{
    nomineeName: string;
    criterionName: string;
    occurrences: OrganizingNominationRecord[];
  } | null>(null);

  // Create Poll Modal state
  const [creatingPollCriterion, setCreatingPollCriterion] =
    useState<OrganizingCommissionCriterion | null>(null);
  const [pollQuestion, setPollQuestion] = useState<string>('');
  const [pollAllowMultiple, setPollAllowMultiple] = useState<boolean>(false);
  const [pollMaxChoices, setPollMaxChoices] = useState<number>(1);
  const [includedNomineeNames, setIncludedNomineeNames] = useState<Record<string, boolean>>({});
  const [isSubmittingPoll, setIsSubmittingPoll] = useState<boolean>(false);
  const [createdPollSuccess, setCreatedPollSuccess] = useState<string | null>(null);

  const activeMeeting = useMemo(() => {
    return meetings.find((m) => m.code === activeCode);
  }, [meetings, activeCode]);

  const showSuccessBanner = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => {
      setActionSuccess((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const applySummaryResponse = useCallback(
    (resConfig: OrganizingCommissionConfig, resSummary?: OrganizingCommissionAdminSummary) => {
      setConfig(resConfig);
      setFormCriteria(
        Array.isArray(resConfig.criteria) && resConfig.criteria.length > 0
          ? resConfig.criteria
          : DEFAULT_ORGANIZING_CRITERIA
      );
      setFormDeadline(toDatetimeLocalValue(resConfig.deadline));
      if (resSummary) {
        setSummary(resSummary);
      }
    },
    []
  );

  const loadData = useCallback(
    async (code: string) => {
      if (!code) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetchOrganizingCommissionConfig(code);
        if (res && res.config) {
          applySummaryResponse(res.config, res.summary);
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Erro ao carregar dados da Comissão Organizadora.';
        setErrorMessage(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [applySummaryResponse]
  );

  useEffect(() => {
    if (activeCode) {
      loadData(activeCode);
    }
  }, [activeCode, loadData]);

  const effectiveStatus = useMemo<'NOT_OPENED' | 'OPEN' | 'CLOSED' | 'EXPIRED'>(() => {
    if (summary?.effectiveStatus) return summary.effectiveStatus;
    if (config?.status === 'NOT_OPENED') return 'NOT_OPENED';
    if (config?.status === 'CLOSED') return 'CLOSED';
    if (config?.deadline && new Date(config.deadline).getTime() <= Date.now()) {
      return 'EXPIRED';
    }
    if (config?.explicitlyOpened) return 'OPEN';
    return 'NOT_OPENED';
  }, [summary?.effectiveStatus, config?.status, config?.deadline, config?.explicitlyOpened]);

  const fullPublicUrl = useMemo(() => {
    if (!config?.publicToken) return '';
    return `${window.location.origin}/indicacoes-organizadora/${config.publicToken}`;
  }, [config?.publicToken]);

  const congregationLabel = useMemo(() => {
    if (!activeMeeting) return '';
    const { baseName, congregation } = extractBaseMeetingName(
      activeMeeting.name,
      activeMeeting.nominationCommissionName
    );
    return (congregation || baseName || activeMeeting.name || '').trim();
  }, [activeMeeting]);

  const handleCopyWhatsAppMessage = async () => {
    if (!fullPublicUrl) return;
    const churchText = congregationLabel || 'Congregação';
    const whatsappMessage = `*COMISSÃO ORGANIZADORA*\n${churchText}\n${fullPublicUrl}`;
    try {
      await navigator.clipboard.writeText(whatsappMessage);
      setCopiedLink(true);
      showSuccessBanner('Mensagem copiada! Pronta para compartilhar no WhatsApp.');
      setTimeout(() => setCopiedLink(false), 3000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = whatsappMessage;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedLink(true);
      showSuccessBanner('Mensagem copiada! Pronta para compartilhar no WhatsApp.');
      setTimeout(() => setCopiedLink(false), 3000);
    }
  };

  const handleDeadlineChange = async (newLocalValue: string) => {
    setFormDeadline(newLocalValue);
    if (!activeCode) return;
    setErrorMessage(null);
    setIsSavingDeadline(true);
    try {
      const deadlineIso =
        newLocalValue && newLocalValue.trim()
          ? new Date(newLocalValue.trim()).toISOString()
          : null;
      const res = await saveOrganizingCommissionConfig(activeCode, {
        deadline: deadlineIso,
      });
      applySummaryResponse(res.config, res.summary);
      setDeadlineSaveSuccess(true);
      setTimeout(() => setDeadlineSaveSuccess(false), 2500);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao atualizar prazo da Comissão Organizadora.';
      setErrorMessage(msg);
    } finally {
      setIsSavingDeadline(false);
    }
  };

  const handleToggleIndicationsStatus = async () => {
    if (!activeCode) return;
    setErrorMessage(null);
    setIsUpdatingStatus(true);
    try {
      const nextAction: 'OPEN' | 'CLOSE' | 'REOPEN' =
        effectiveStatus === 'NOT_OPENED'
          ? 'OPEN'
          : effectiveStatus === 'OPEN'
          ? 'CLOSE'
          : 'REOPEN';
      const deadlineIso =
        formDeadline && formDeadline.trim()
          ? new Date(formDeadline.trim()).toISOString()
          : null;
      const res = await updateOrganizingCommissionStatus(
        activeCode,
        nextAction,
        nextAction === 'OPEN' || nextAction === 'REOPEN' ? deadlineIso : undefined
      );
      applySummaryResponse(res.config, res.summary);
      showSuccessBanner(res.message);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao alterar status das indicações da Comissão Organizadora.';
      setErrorMessage(msg);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const enabledCount = useMemo(
    () => formCriteria.filter((c) => c.enabled).length,
    [formCriteria]
  );

  const handleCriterionToggle = (criterionId: string, enabled: boolean) => {
    setFormCriteria((prev) =>
      prev.map((c) => (c.criterionId === criterionId ? { ...c, enabled } : c))
    );
  };

  const handleCriterionMaxChange = (criterionId: string, val: number) => {
    const cleanVal = isNaN(val) ? 0 : Math.max(0, Math.min(500, Math.floor(val)));
    setFormCriteria((prev) =>
      prev.map((c) => (c.criterionId === criterionId ? { ...c, maxLimit: cleanVal } : c))
    );
  };

  const handleSaveChanges = async () => {
    if (!activeCode) return;
    setErrorMessage(null);

    const seen = new Set<string>();
    for (const item of formCriteria) {
      const cleanName = (item.name || '').trim().replace(/\s+/g, ' ');
      if (!cleanName) {
        setErrorMessage('O nome de cada critério deve ser preenchido.');
        return;
      }
      const normKey = normalizeCriterionNameKey(cleanName);
      if (seen.has(normKey)) {
        setErrorMessage(`Critério duplicado identificado: "${cleanName}".`);
        return;
      }
      seen.add(normKey);

      if (isNaN(item.maxLimit) || item.maxLimit < 0 || item.maxLimit > 500) {
        setErrorMessage(
          `O limite do critério "${cleanName}" é inválido. Informe um valor entre 0 e 500.`
        );
        return;
      }
    }

    setIsSavingLimits(true);
    try {
      const deadlineIso =
        formDeadline && formDeadline.trim()
          ? new Date(formDeadline.trim()).toISOString()
          : null;
      const res = await saveOrganizingCommissionConfig(activeCode, {
        criteria: formCriteria,
        deadline: deadlineIso,
      });
      applySummaryResponse(res.config, res.summary);
      setLimitsSaveSuccess(true);
      showSuccessBanner('Configurações da Comissão Organizadora salvas com sucesso!');
      setTimeout(() => setLimitsSaveSuccess(false), 2500);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao salvar configurações da Comissão Organizadora.';
      setErrorMessage(msg);
    } finally {
      setIsSavingLimits(false);
    }
  };

  const handleResetToDefaults = async () => {
    if (!activeCode) return;
    setErrorMessage(null);
    setIsSavingLimits(true);
    try {
      const defaults = DEFAULT_ORGANIZING_CRITERIA.map((c) => ({ ...c }));
      const res = await saveOrganizingCommissionConfig(activeCode, {
        criteria: defaults,
      });
      applySummaryResponse(res.config, res.summary);
      showSuccessBanner('Critérios padrão (HOMENS, MULHERES, JOVENS) restaurados com sucesso!');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao restaurar critérios padrão.';
      setErrorMessage(msg);
    } finally {
      setIsSavingLimits(false);
    }
  };

  const handleSaveNewCriterion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCode) return;
    setErrorMessage(null);

    const cleanName = newCriterionName.trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      setErrorMessage('Informe o nome do critério.');
      return;
    }

    const normKey = normalizeCriterionNameKey(cleanName);
    const alreadyExists = formCriteria.some(
      (c) => normalizeCriterionNameKey(c.name) === normKey
    );
    if (alreadyExists) {
      setErrorMessage(`Já existe um critério com o nome "${cleanName}" nesta reunião.`);
      return;
    }

    const cleanLimit = Math.max(0, Math.min(500, Math.floor(Number(newCriterionLimit) || 0)));
    const newItem: OrganizingCommissionCriterion = {
      criterionId: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName.toUpperCase(),
      enabled: true,
      maxLimit: cleanLimit,
      isCustom: true,
    };

    const updatedList = [...formCriteria, newItem];
    setIsSavingNewCriterion(true);
    try {
      const res = await saveOrganizingCommissionConfig(activeCode, {
        criteria: updatedList,
      });
      applySummaryResponse(res.config, res.summary);
      setNewCriterionName('');
      setNewCriterionLimit(1);
      setIsAddModalOpen(false);
      showSuccessBanner(`Critério "${newItem.name}" adicionado com sucesso!`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao adicionar novo critério.';
      setErrorMessage(msg);
    } finally {
      setIsSavingNewCriterion(false);
    }
  };

  const handleOpenEditCriterion = (criterion: OrganizingCommissionCriterion) => {
    setEditingCriterion(criterion);
    setEditCriterionName(criterion.name);
    setEditCriterionLimit(criterion.maxLimit);
    setEditCriterionEnabled(criterion.enabled);
  };

  const handleSaveEditCriterion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCode || !editingCriterion) return;
    setErrorMessage(null);

    const cleanName = editCriterionName.trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      setErrorMessage('O nome do critério não pode ficar vazio.');
      return;
    }

    const normKey = normalizeCriterionNameKey(cleanName);
    const duplicate = formCriteria.some(
      (c) =>
        c.criterionId !== editingCriterion.criterionId &&
        normalizeCriterionNameKey(c.name) === normKey
    );
    if (duplicate) {
      setErrorMessage(`Já existe outro critério com o nome "${cleanName}" nesta reunião.`);
      return;
    }

    const cleanLimit = Math.max(0, Math.min(500, Math.floor(Number(editCriterionLimit) || 0)));
    const updatedList = formCriteria.map((c) =>
      c.criterionId === editingCriterion.criterionId
        ? {
            ...c,
            name: editingCriterion.isCustom ? cleanName : c.name,
            maxLimit: cleanLimit,
            enabled: editCriterionEnabled,
          }
        : c
    );

    setIsSavingEditCriterion(true);
    try {
      const res = await saveOrganizingCommissionConfig(activeCode, {
        criteria: updatedList,
      });
      applySummaryResponse(res.config, res.summary);
      setEditingCriterion(null);
      showSuccessBanner('Critério atualizado com sucesso!');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao atualizar critério.';
      setErrorMessage(msg);
    } finally {
      setIsSavingEditCriterion(false);
    }
  };

  const handleConfirmDeleteCriterion = async () => {
    if (!activeCode || !deletingCriterion) return;
    setErrorMessage(null);
    setIsDeletingCriterion(true);
    try {
      const updatedList = deletingCriterion.isCustom
        ? formCriteria.filter((c) => c.criterionId !== deletingCriterion.criterionId)
        : formCriteria.map((c) =>
            c.criterionId === deletingCriterion.criterionId ? { ...c, enabled: false } : c
          );

      const res = await saveOrganizingCommissionConfig(activeCode, {
        criteria: updatedList,
      });
      applySummaryResponse(res.config, res.summary);
      setDeletingCriterion(null);
      showSuccessBanner(
        deletingCriterion.isCustom
          ? 'Critério personalizado removido com sucesso!'
          : 'Critério desativado nesta reunião.'
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao remover critério.';
      setErrorMessage(msg);
    } finally {
      setIsDeletingCriterion(false);
    }
  };

  // --- RECEIVED NOMINATIONS HELPERS & HANDLERS ---

  const nominationsList = useMemo(() => summary?.nominations || [], [summary?.nominations]);
  const selectionsList = useMemo(() => summary?.selections || [], [summary?.selections]);
  const totalSelectedCount = useMemo(() => {
    let count = 0;
    for (const set of selectedNomineesMap.values()) {
      count += set.size;
    }
    return count;
  }, [selectedNomineesMap]);

  const confirmedNomineesByCriterion = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (summary?.confirmedNominees) {
      for (const [critId, list] of Object.entries(summary.confirmedNominees)) {
        if (Array.isArray(list)) {
          map.set(critId, new Set(list.map((n: string) => n.trim().toLowerCase())));
        }
      }
    }
    return map;
  }, [summary?.confirmedNominees]);

  const isNomineeConfirmed = useCallback(
    (criterionId: string, nomineeName: string): boolean => {
      const norm = nomineeName.trim().replace(/\s+/g, ' ').toLowerCase();
      const set = confirmedNomineesByCriterion.get(criterionId);
      return Boolean(set && set.has(norm));
    },
    [confirmedNomineesByCriterion]
  );

  const nominationsByCriterion = useMemo(() => {
    const map = new Map<string, OrganizingNominationRecord[]>();
    for (const crit of formCriteria) {
      map.set(crit.criterionId, []);
    }
    for (const nom of nominationsList) {
      if (!map.has(nom.criterionId)) {
        map.set(nom.criterionId, []);
      }
      map.get(nom.criterionId)!.push(nom);
    }
    return map;
  }, [formCriteria, nominationsList]);

  const selectionsByCriterion = useMemo(() => {
    const map = new Map<string, OrganizingSelectedNominee[]>();
    for (const crit of formCriteria) {
      map.set(crit.criterionId, []);
    }
    for (const sel of selectionsList) {
      if (!map.has(sel.criterionId)) {
        map.set(sel.criterionId, []);
      }
      map.get(sel.criterionId)!.push(sel);
    }
    return map;
  }, [formCriteria, selectionsList]);

  const isNomineeSelected = useCallback(
    (criterionId: string, nomineeName: string): boolean => {
      const norm = nomineeName.trim().replace(/\s+/g, ' ').toLowerCase();
      const set = selectedNomineesMap.get(criterionId);
      return Boolean(set && set.has(norm));
    },
    [selectedNomineesMap]
  );

  const toggleCriterionAccordion = (criterionId: string) => {
    setExpandedCriteriaIds((prev) => {
      const next = new Set(prev);
      if (next.has(criterionId)) {
        next.delete(criterionId);
      } else {
        next.add(criterionId);
      }
      return next;
    });
  };

  const handleToggleNomineeSelection = (
    criterionId: string,
    nomineeName: string,
    currentlySelected: boolean
  ) => {
    const norm = nomineeName.trim().replace(/\s+/g, ' ').toLowerCase();
    setSelectedNomineesMap((prev) => {
      const next = new Map(prev);
      const existing = next.get(criterionId);
      const set = new Set<string>();
      if (existing instanceof Set) {
        existing.forEach((v) => set.add(v));
      }
      if (currentlySelected) {
        set.delete(norm);
      } else {
        set.add(norm);
      }
      next.set(criterionId, set);
      return next;
    });
  };

  const handleBatchSelectCriterion = (
    criterionId: string,
    allUniqueNames: string[],
    selectAll: boolean
  ) => {
    setSelectedNomineesMap((prev) => {
      const next = new Map(prev);
      if (!selectAll) {
        next.delete(criterionId);
      } else {
        const set = new Set<string>();
        for (const name of allUniqueNames) {
          const norm = name.trim().replace(/\s+/g, ' ').toLowerCase();
          if (norm) set.add(norm);
        }
        next.set(criterionId, set);
      }
      return next;
    });
  };

  const handleSaveManualNominee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCode || !addingToCriterionId) return;
    const cleanName = manualNomineeName.trim().replace(/\s+/g, ' ');
    if (!cleanName) return;

    setIsAddingManualNominee(true);
    setErrorMessage(null);
    try {
      const targetCriterionId = addingToCriterionId;
      const res = await addAdminManualOrganizingNomination(activeCode, {
        criterionId: targetCriterionId,
        nomineeName: cleanName,
      });
      if (res.summary) {
        setSummary(res.summary);
      }
      setAddingToCriterionId(null);
      setManualNomineeName('');
      setExpandedCriteriaIds((prev) => new Set(prev).add(targetCriterionId));
      showSuccessBanner('Nome adicionado com sucesso ao critério.');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao adicionar nome manualmente.';
      setErrorMessage(msg);
    } finally {
      setIsAddingManualNominee(false);
    }
  };

  const handleSaveOccurrenceEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCode || !editingOccurrence) return;
    const cleanName = editOccurrenceName.trim().replace(/\s+/g, ' ');
    if (!cleanName) return;

    setIsSavingOccurrence(true);
    setErrorMessage(null);
    try {
      const res = await updateAdminOrganizingNomination(
        activeCode,
        editingOccurrence.id,
        cleanName
      );
      if (res.summary) {
        setSummary(res.summary);
      }
      setEditingOccurrence(null);
      showSuccessBanner('Indicação atualizada com sucesso.');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao atualizar indicação.';
      setErrorMessage(msg);
    } finally {
      setIsSavingOccurrence(false);
    }
  };

  const handleConfirmDeleteOccurrence = async () => {
    if (!activeCode || !deletingOccurrence) return;
    setIsDeletingOccurrence(true);
    setErrorMessage(null);
    try {
      const res = await deleteAdminOrganizingNomination(activeCode, deletingOccurrence.id);
      if (res.summary) {
        setSummary(res.summary);
      }
      setDeletingOccurrence(null);
      showSuccessBanner('Indicação excluída com sucesso.');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao excluir indicação.';
      setErrorMessage(msg);
    } finally {
      setIsDeletingOccurrence(false);
    }
  };

  const handleOpenCreatePollModal = (criterion: OrganizingCommissionCriterion) => {
    const currentSelected = selectedNomineesMap.get(criterion.criterionId);
    const nomineeNames = currentSelected && currentSelected.size > 0
      ? Array.from(currentSelected)
      : (selectionsByCriterion.get(criterion.criterionId) || []).map(s => s.nomineeName);
    if (nomineeNames.length === 0) return;

    const initialMap: Record<string, boolean> = {};
    for (const name of nomineeNames) {
      initialMap[name] = true;
    }

    setCreatingPollCriterion(criterion);
    setPollQuestion(formatOrganizingCriterionPollTitle(criterion.name));
    setIncludedNomineeNames(initialMap);
    const initialChoices = Math.max(1, Math.min(15, criterion.maxLimit || 1));
    setPollAllowMultiple(initialChoices > 1);
    setPollMaxChoices(initialChoices);
    setCreatedPollSuccess(null);
  };

  const handleCreatePollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCode || !creatingPollCriterion) return;

    const chosenNames = Object.entries(includedNomineeNames)
      .filter(([, included]) => included)
      .map(([name]) => name);

    if (chosenNames.length === 0) {
      setErrorMessage('Selecione pelo menos um nome para criar a pauta.');
      return;
    }

    const effectiveChoices = Math.max(1, Math.min(15, pollMaxChoices || 1));
    const isMulti = effectiveChoices > 1;

    setIsSubmittingPoll(true);
    setErrorMessage(null);
    try {
      const res = await createPollFromOrganizingNominations(activeCode, {
        criterionId: creatingPollCriterion.criterionId,
        nomineeNames: chosenNames,
        question: pollQuestion.trim() || formatOrganizingCriterionPollTitle(creatingPollCriterion.name),
        allowMultiple: isMulti,
        maxChoices: effectiveChoices,
      });

      if (res.summary) {
        setSummary(res.summary);
      }
      setSelectedNomineesMap((prev) => {
        const next = new Map(prev);
        next.set(creatingPollCriterion.criterionId, new Set<string>());
        return next;
      });
      if (onRefreshMeeting) {
        onRefreshMeeting();
      }
      if (onPollCreated) {
        onPollCreated();
      }
      setCreatedPollSuccess(
        `A pauta "${res.poll.question}" foi criada e adicionada em Pauta & Votação com status Aguardando.`
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao criar pauta da Comissão Organizadora.';
      setErrorMessage(msg);
    } finally {
      setIsSubmittingPoll(false);
    }
  };

  const renderStatusBadge = () => {
    if (effectiveStatus === 'NOT_OPENED') {
      return (
        <span className="inline-flex items-center justify-center text-center px-2.5 py-1 rounded-full text-xs font-bold bg-[#F3F4F6] text-[#4B5563] border border-[#D1D5DB]">
          INDICAÇÕES NÃO ABERTAS
        </span>
      );
    }
    if (effectiveStatus === 'OPEN') {
      return (
        <span className="inline-flex items-center justify-center text-center px-2.5 py-1 rounded-full text-xs font-bold bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]">
          INDICAÇÕES ATIVAS
        </span>
      );
    }
    return (
      <span className="inline-flex items-center justify-center text-center px-2.5 py-1 rounded-full text-xs font-bold bg-[#111827] text-white border border-[#111827]">
        INDICAÇÕES ENCERRADAS
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* ========================================================
          CABEÇALHO PRINCIPAL E 3 CARTÕES DE RESUMO
         ======================================================== */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                {mode === 'received_nominations'
                  ? 'COMISSÃO ORGANIZADORA — INDICAÇÕES RECEBIDAS'
                  : 'CONFIGURAÇÕES DA COMISSÃO ORGANIZADORA'}
              </span>
              <span className="font-mono text-xs font-bold text-[#111827] bg-[#F3F4F6] px-2 py-0.5 rounded border border-[#E5E7EB]">
                {activeCode}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#111827] mt-0.5">
              {mode === 'received_nominations'
                ? 'Indicações Recebidas'
                : 'Configurações da Comissão Organizadora'}
            </h1>
            {activeMeeting &&
              (() => {
                const { baseName, congregation } = extractBaseMeetingName(
                  activeMeeting.name,
                  activeMeeting.nominationCommissionName
                );
                return (
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    Reunião: <span className="font-semibold text-[#374151]">{baseName}</span>
                    {congregation && (
                      <>
                        {' '}
                        | Congregação:{' '}
                        <span className="font-semibold text-[#374151]">{congregation}</span>
                      </>
                    )}
                  </p>
                );
              })()}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {onGoHome && (
              <button
                type="button"
                onClick={onGoHome}
                className="px-3.5 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Retornar ao Início"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Início</span>
              </button>
            )}

            <button
              id="btn-organizing-commission-refresh"
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

        {/* EXATAMENTE 3 CARTÕES DE RESUMO: PRAZO LIMITE, PARTICIPANTES, TOTAL DE INDICAÇÕES */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {/* 1. PRAZO LIMITE */}
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block">
              PRAZO LIMITE
            </span>
            <span className="text-xs sm:text-sm font-bold text-[#111827] mt-1 block truncate">
              {formatDeadlineDisplay(config?.deadline)}
            </span>
          </div>

          {/* 2. PARTICIPANTES */}
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block">
              PARTICIPANTES
            </span>
            <span className="text-lg font-extrabold text-[#111827] mt-0.5 block">
              {summary?.participantsCount ?? 0}
            </span>
          </div>

          {/* 3. TOTAL DE INDICAÇÕES */}
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block">
              TOTAL DE INDICAÇÕES
            </span>
            <span className="text-lg font-extrabold text-[#111827] mt-0.5 block">
              {summary?.totalNominationsCount ?? 0}
            </span>
          </div>
        </div>

        {/* Notificações Globais */}
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
      </div>

      {/* ========================================================
          MODO 1: CONFIGURAÇÕES DA COMISSÃO ORGANIZADORA
         ======================================================== */}
      {mode === 'config' && (
        <>
          {/* PAINEL DE STATUS, LINK PÚBLICO, COMPARTILHAMENTO WHATSAPP E PRAZO */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 sm:p-5 shadow-xs space-y-4">
            {/* LINHA 1: Status das Indicações + Botão ENCERRAR INDICAÇÕES / REABRIR INDICAÇÕES */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Status das Indicações:
                </span>
                <div>{renderStatusBadge()}</div>
              </div>

              <div className="flex items-center gap-2">
                {effectiveStatus === 'NOT_OPENED' ? (
                  <button
                    id="btn-open-organizing-indications"
                    type="button"
                    disabled={isUpdatingStatus || isLoading}
                    onClick={handleToggleIndicationsStatus}
                    className="px-3.5 py-1.5 bg-[#111827] hover:bg-[#1F2937] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer disabled:opacity-50 shadow-2xs shrink-0 flex items-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>ABRIR INDICAÇÕES</span>
                  </button>
                ) : effectiveStatus === 'OPEN' ? (
                  <button
                    id="btn-close-organizing-indications"
                    type="button"
                    disabled={isUpdatingStatus || isLoading}
                    onClick={handleToggleIndicationsStatus}
                    className="px-3.5 py-1.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer shadow-2xs shrink-0 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>ENCERRAR INDICAÇÕES</span>
                  </button>
                ) : (
                  <button
                    id="btn-reopen-organizing-indications"
                    type="button"
                    disabled={isUpdatingStatus || isLoading}
                    onClick={handleToggleIndicationsStatus}
                    className="px-3.5 py-1.5 bg-[#111827] hover:bg-[#1F2937] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer disabled:opacity-50 shadow-2xs shrink-0 flex items-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>REABRIR INDICAÇÕES</span>
                  </button>
                )}
              </div>
            </div>

            {effectiveStatus === 'NOT_OPENED' && (
              <div className="p-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#6B7280] leading-relaxed">
                As indicações da Comissão Organizadora ainda não foram abertas. Clique em <strong>ABRIR INDICAÇÕES</strong> para liberar o recebimento pelo link público.
              </div>
            )}

            {effectiveStatus === 'CLOSED' && (
              <div className="p-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#6B7280] leading-relaxed">
                O recebimento público de indicações da Comissão Organizadora está encerrado. Novos envios estão bloqueados até que você clique em <strong>REABRIR INDICAÇÕES</strong>.
              </div>
            )}

            {effectiveStatus === 'EXPIRED' && (
              <div className="p-2.5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#DC2626] leading-relaxed">
                O prazo para envio de indicações da Comissão Organizadora expirou ({formatDeadlineDisplay(config?.deadline)}). Novos envios pelo link público estão bloqueados.
              </div>
            )}

            {/* LINHA 2: Link Público + Copiar para WhatsApp e Prazo Opcional */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              {/* Bloco Esquerdo: Link Público (~58%) */}
              <div className="md:col-span-7 space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#4B5563] block">
                  LINK PÚBLICO
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="input-public-organizing-link"
                    type="text"
                    readOnly
                    value={fullPublicUrl}
                    className="flex-1 min-w-0 px-3 py-2 bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl text-xs font-mono text-[#374151] select-all focus:outline-hidden"
                  />
                  <button
                    id="btn-copy-organizing-whatsapp"
                    type="button"
                    onClick={handleCopyWhatsAppMessage}
                    disabled={!fullPublicUrl}
                    className={`px-3.5 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center gap-1.5 border shrink-0 ${
                      copiedLink
                        ? 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]'
                        : 'bg-white text-[#111827] border-[#D1D5DB] hover:bg-[#F9FAFB]'
                    }`}
                    title="Copiar mensagem formatada para WhatsApp"
                  >
                    {copiedLink ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>COPIAR</span>
                  </button>
                </div>
              </div>

              {/* Bloco Direito: Prazo / Data e Hora Limite (~42%) */}
              <div className="md:col-span-5 space-y-1">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="organizing-deadline-input"
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

                <CompactDateTimePicker
                  id="organizing-deadline-input"
                  value={formDeadline}
                  onChange={handleDeadlineChange}
                  className="w-full"
                  placeholder="Sem prazo definido (Opcional)"
                />
              </div>
            </div>
          </div>

          {/* SEÇÃO: CRITÉRIOS DA COMISSÃO ORGANIZADORA */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#E5E7EB] pb-3 gap-3">
              <div>
                <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#111827]" />
                  CRITÉRIOS DA COMISSÃO ORGANIZADORA
                </h3>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  {formCriteria.length}{' '}
                  {formCriteria.length === 1 ? 'Critério configurado' : 'Critérios configurados'} •
                  Configure os limites de indicação de integrantes desta reunião sem afetar a Comissão de Nomeações.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                <button
                  id="btn-add-organizing-criterion"
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setNewCriterionName('');
                    setNewCriterionLimit(1);
                    setIsAddModalOpen(true);
                  }}
                  className="px-3.5 py-2 bg-white border border-[#111827] hover:bg-[#F3F4F6] text-[#111827] text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Critério</span>
                </button>

                <button
                  id="btn-save-organizing-criteria"
                  type="button"
                  disabled={isSavingLimits || isLoading}
                  onClick={handleSaveChanges}
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
                  type="button"
                  onClick={handleResetToDefaults}
                  className="text-xs text-[#4B5563] hover:text-[#111827] flex items-center gap-1 font-semibold underline cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restaurar 3 padrão</span>
                </button>
              </div>
            </div>

            {/* Filtros e Busca de Critérios */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F9FAFB] p-3 rounded-xl border border-[#E5E7EB]">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar critério..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-[#D1D5DB] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-hidden focus:ring-1 focus:ring-[#111827]"
                />
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setCriterionFilter('all')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    criterionFilter === 'all'
                      ? 'bg-[#111827] text-white'
                      : 'bg-white text-[#4B5563] border border-[#D1D5DB] hover:bg-[#F3F4F6]'
                  }`}
                >
                  Todos ({formCriteria.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCriterionFilter('enabled')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    criterionFilter === 'enabled'
                      ? 'bg-[#111827] text-white'
                      : 'bg-white text-[#4B5563] border border-[#D1D5DB] hover:bg-[#F3F4F6]'
                  }`}
                >
                  Ativos ({enabledCount})
                </button>
              </div>
            </div>

            {/* Lista de Critérios (HOMENS, MULHERES, JOVENS + Personalizados) */}
            <div className="border border-[#E5E7EB] rounded-xl overflow-hidden divide-y divide-[#E5E7EB]">
              {formCriteria
                .filter((criterion, idx) => {
                  if (criterionFilter === 'enabled' && !criterion.enabled) return false;
                  if (searchQuery.trim().length > 0) {
                    const q = searchQuery.trim().toLowerCase();
                    const matchName = criterion.name.toLowerCase().includes(q);
                    const matchNum = String(idx + 1).includes(q);
                    if (!matchName && !matchNum) return false;
                  }
                  return true;
                })
                .map((criterion) => {
                  const originalIndex = formCriteria.findIndex(
                    (c) => c.criterionId === criterion.criterionId
                  );

                  return (
                    <div
                      key={criterion.criterionId}
                      className={`p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        !criterion.enabled ? 'bg-[#F9FAFB] opacity-60' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold font-mono text-[#9CA3AF] w-6 shrink-0 text-right">
                          {originalIndex + 1}.
                        </span>

                        <input
                          id={`cfg-crit-${criterion.criterionId}`}
                          type="checkbox"
                          checked={criterion.enabled}
                          onChange={(e) =>
                            handleCriterionToggle(criterion.criterionId, e.target.checked)
                          }
                          className="h-4 w-4 rounded-sm border-[#D1D5DB] text-[#111827] focus:ring-[#111827] cursor-pointer"
                        />

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <label
                              htmlFor={`cfg-crit-${criterion.criterionId}`}
                              className="text-xs font-bold text-[#111827] cursor-pointer"
                            >
                              {criterion.name}
                            </label>
                            {criterion.isCustom ? (
                              <span className="text-[10px] text-[#1E40AF] font-bold bg-[#EFF6FF] border border-[#BFDBFE] px-1.5 py-0.5 rounded-md">
                                Personalizado
                              </span>
                            ) : (
                              <span className="text-[10px] text-[#6B7280] font-medium bg-[#F3F4F6] px-1.5 py-0.5 rounded-md">
                                Padrão
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 self-end sm:self-auto pl-9 sm:pl-0 flex-wrap">
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`cfg-crit-max-${criterion.criterionId}`}
                            className="text-xs font-medium text-[#4B5563]"
                          >
                            Limite nesta reunião:
                          </label>
                          <input
                            id={`cfg-crit-max-${criterion.criterionId}`}
                            type="number"
                            min={0}
                            max={500}
                            disabled={!criterion.enabled}
                            value={criterion.maxLimit === 0 ? '' : criterion.maxLimit}
                            placeholder="0"
                            onChange={(e) =>
                              handleCriterionMaxChange(
                                criterion.criterionId,
                                parseInt(e.target.value, 10)
                              )
                            }
                            className="w-20 rounded-lg px-2.5 py-1 text-xs font-bold text-center border border-[#D1D5DB] text-[#111827] focus:outline-hidden focus:ring-1 focus:ring-[#111827] disabled:bg-[#F3F4F6]"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditCriterion(criterion)}
                            className="p-1.5 bg-white hover:bg-[#F3F4F6] text-[#374151] border border-[#D1D5DB] rounded-lg transition-colors cursor-pointer"
                            title="Editar critério"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {criterion.isCustom && (
                            <button
                              type="button"
                              onClick={() => setDeletingCriterion(criterion)}
                              className="p-1.5 bg-white hover:bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] rounded-lg transition-colors cursor-pointer"
                              title="Excluir critério personalizado"
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
        </>
      )}

      {/* ========================================================
          MODO 2: INDICAÇÕES RECEBIDAS — COMISSÃO ORGANIZADORA
         ======================================================== */}
      {mode === 'received_nominations' && (
        <div className="space-y-5">
          {/* Banner de candidatos selecionados */}
          {totalSelectedCount > 0 && (
            <div className="bg-[#ECFDF5] border border-[#A7F3D0] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#059669] text-white flex items-center justify-center shadow-xs shrink-0">
                  <Vote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold text-[#065F46] uppercase tracking-wider">
                    {totalSelectedCount}{' '}
                    {totalSelectedCount === 1 ? 'Nome Selecionado' : 'Nomes Selecionados'}
                  </h3>
                  <p className="text-[11px] text-[#047857]">
                    Utilize o botão &quot;CRIAR PAUTA&quot; no card do critério correspondente para enviar a pauta à votação.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Barra de Pesquisa e Filtros por Critério */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Pesquisar por critério ou nome indicado..."
                value={nominationsSearchQuery}
                onChange={(e) => setNominationsSearchQuery(e.target.value)}
                className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-hidden focus:ring-1 focus:ring-[#111827]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setNominationsFilter('all')}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                  nominationsFilter === 'all'
                    ? 'bg-[#111827] text-white'
                    : 'bg-[#F9FAFB] text-[#4B5563] border border-[#E5E7EB] hover:bg-[#F3F4F6]'
                }`}
              >
                Todos ({formCriteria.length})
              </button>
              <button
                type="button"
                onClick={() => setNominationsFilter('has_nominations')}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                  nominationsFilter === 'has_nominations'
                    ? 'bg-[#111827] text-white'
                    : 'bg-[#F9FAFB] text-[#4B5563] border border-[#E5E7EB] hover:bg-[#F3F4F6]'
                }`}
              >
                Com Indicações (
                {
                  formCriteria.filter(
                    (c) => (nominationsByCriterion.get(c.criterionId) || []).length > 0
                  ).length
                }
                )
              </button>
              <button
                type="button"
                onClick={() => setNominationsFilter('empty')}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                  nominationsFilter === 'empty'
                    ? 'bg-[#111827] text-white'
                    : 'bg-[#F9FAFB] text-[#4B5563] border border-[#E5E7EB] hover:bg-[#F3F4F6]'
                }`}
              >
                Sem Indicações (
                {
                  formCriteria.filter(
                    (c) => (nominationsByCriterion.get(c.criterionId) || []).length === 0
                  ).length
                }
                )
              </button>
            </div>
          </div>

          {/* Lista de Critérios e Nomes Indicados */}
          <div className="space-y-3">
            {formCriteria
              .filter((criterion) => {
                const records = nominationsByCriterion.get(criterion.criterionId) || [];
                if (nominationsFilter === 'has_nominations' && records.length === 0) return false;
                if (nominationsFilter === 'empty' && records.length > 0) return false;

                if (nominationsSearchQuery.trim().length > 0) {
                  const q = nominationsSearchQuery.trim().toLowerCase();
                  const matchCrit = criterion.name.toLowerCase().includes(q);
                  const matchNominee = records.some((r) =>
                    r.nomineeName.toLowerCase().includes(q)
                  );
                  if (!matchCrit && !matchNominee) return false;
                }
                return true;
              })
              .map((criterion) => {
                const originalIndex = formCriteria.findIndex(
                  (c) => c.criterionId === criterion.criterionId
                );
                const critRecords = nominationsByCriterion.get(criterion.criterionId) || [];
                const critSelections = selectionsByCriterion.get(criterion.criterionId) || [];
                const isExpanded = expandedCriteriaIds.has(criterion.criterionId);

                // Deduplicate records by normalized name
                const groupedMap = new Map<
                  string,
                  {
                    displayName: string;
                    normalizedName: string;
                    count: number;
                    occurrences: OrganizingNominationRecord[];
                  }
                >();

                for (const rec of critRecords) {
                  const norm = (rec.normalizedName || rec.nomineeName)
                    .trim()
                    .replace(/\s+/g, ' ')
                    .toLowerCase();
                  const existing = groupedMap.get(norm);
                  if (existing) {
                    existing.count++;
                    existing.occurrences.push(rec);
                  } else {
                    groupedMap.set(norm, {
                      displayName: rec.nomineeName.trim(),
                      normalizedName: norm,
                      count: 1,
                      occurrences: [rec],
                    });
                  }
                }

                // Also include any selected nominees that might have been selected earlier
                for (const sel of critSelections) {
                  const norm = (sel.normalizedName || sel.nomineeName)
                    .trim()
                    .replace(/\s+/g, ' ')
                    .toLowerCase();
                  if (!groupedMap.has(norm)) {
                    groupedMap.set(norm, {
                      displayName: sel.nomineeName.trim(),
                      normalizedName: norm,
                      count: sel.nominationCount || 1,
                      occurrences: [],
                    });
                  }
                }

                const groupedNominees = Array.from(groupedMap.values()).sort((a, b) => {
                  if (b.count !== a.count) return b.count - a.count;
                  return a.displayName.localeCompare(b.displayName);
                });

                const allUniqueNames = groupedNominees.map((g) => g.displayName);
                const allAreSelected =
                  groupedNominees.length > 0 &&
                  groupedNominees.every((g) =>
                    isNomineeSelected(criterion.criterionId, g.displayName)
                  );
                const critSelectedCount = selectedNomineesMap.get(criterion.criterionId)?.size || 0;

                return (
                  <div
                    key={criterion.criterionId}
                    className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-xs"
                  >
                    {/* Header do Critério */}
                    <div
                      onClick={() => toggleCriterionAccordion(criterion.criterionId)}
                      className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-[#F9FAFB] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[#9CA3AF]">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </span>

                        <span className="text-xs font-bold font-mono text-[#9CA3AF]">
                          {originalIndex + 1}.
                        </span>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-extrabold text-[#111827]">
                              {criterion.name}
                            </h3>
                            <span className="text-[10px] font-semibold text-[#6B7280] bg-[#F3F4F6] px-2 py-0.5 rounded-full border border-[#E5E7EB]">
                              Limite: {criterion.maxLimit}
                            </span>
                            {!criterion.enabled && (
                              <span className="text-[10px] font-bold text-[#DC2626] bg-[#FEF2F2] px-2 py-0.5 rounded-full border border-[#FECACA]">
                                Desativado
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div
                        className="flex flex-wrap items-center gap-2 self-end sm:self-auto"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB]">
                          {critRecords.length}{' '}
                          {critRecords.length === 1 ? 'indicação' : 'indicações'}
                        </span>

                        {critSelectedCount > 0 && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]">
                            {critSelectedCount}{' '}
                            {critSelectedCount === 1 ? 'selecionado' : 'selecionados'}
                          </span>
                        )}

                        {groupedNominees.length > 0 && (
                          <button
                            id={`btn-select-all-org-${criterion.criterionId}`}
                            type="button"
                            disabled={batchLoadingCriterion === criterion.criterionId}
                            onClick={() =>
                              handleBatchSelectCriterion(
                                criterion.criterionId,
                                allUniqueNames,
                                !allAreSelected
                              )
                            }
                            className="px-2.5 py-1 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <CheckSquare className="w-3.5 h-3.5 text-[#111827]" />
                            <span>
                              {allAreSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                            </span>
                          </button>
                        )}

                        <button
                          id={`btn-create-pauta-org-${criterion.criterionId}`}
                          type="button"
                          disabled={critSelectedCount === 0}
                          onClick={() => handleOpenCreatePollModal(criterion)}
                          className="px-3 py-1 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                        >
                          <Vote className="w-3.5 h-3.5" />
                          <span>CRIAR PAUTA ({critSelectedCount})</span>
                        </button>
                      </div>
                    </div>

                    {/* Corpo Expandido do Critério */}
                    {isExpanded && (
                      <div className="border-t border-[#E5E7EB] p-4 sm:p-5 bg-white space-y-3">
                        {groupedNominees.length === 0 ? (
                          <div className="text-center py-6 bg-[#F9FAFB] rounded-xl border border-dashed border-[#D1D5DB] space-y-2">
                            <Users className="w-6 h-6 text-[#9CA3AF] mx-auto" />
                            <p className="text-xs text-[#6B7280]">
                              Nenhuma indicação recebida para <strong>{criterion.name}</strong> até o momento.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingToCriterionId(criterion.criterionId);
                                setManualNomineeName('');
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#111827] text-xs font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>ADICIONAR NOME</span>
                            </button>
                          </div>
                        ) : (
                          <div className="divide-y divide-[#F3F4F6] border border-[#E5E7EB] rounded-xl overflow-hidden">
                            {groupedNominees.map((group) => {
                              const isSelected = isNomineeSelected(
                                criterion.criterionId,
                                group.displayName
                              );
                              const toggleId = `${criterion.criterionId}:${group.normalizedName}`;
                              const isToggling = togglingKey === toggleId;

                              return (
                                <div
                                  key={group.normalizedName}
                                  className="p-3 sm:px-4 transition-colors bg-white hover:bg-[#F9FAFB]"
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        disabled={isToggling}
                                        onChange={() => {
                                          handleToggleNomineeSelection(
                                            criterion.criterionId,
                                            group.displayName,
                                            isSelected
                                          );
                                        }}
                                        className="h-4 w-4 rounded-sm border-[#D1D5DB] text-[#111827] focus:ring-[#111827] cursor-pointer shrink-0 disabled:opacity-40"
                                      />

                                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                        <span className="text-xs font-bold truncate text-[#111827]">
                                          {group.displayName}
                                        </span>

                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB] shrink-0">
                                          {group.count}{' '}
                                          {group.count === 1 ? 'indicação' : 'indicações'}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setViewingNomineeModal({
                                            nomineeName: group.displayName,
                                            criterionName: criterion.name,
                                            occurrences: group.occurrences,
                                          })
                                        }
                                        className="px-2.5 py-1 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                      >
                                        <Eye className="w-3 h-3 text-[#4B5563]" />
                                        <span>VER INDICAÇÕES</span>
                                      </button>

                                      {group.occurrences.length > 0 && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingOccurrence(group.occurrences[0]);
                                              setEditOccurrenceName(group.displayName);
                                            }}
                                            className="px-2.5 py-1 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                          >
                                            <Edit2 className="w-3 h-3 text-[#4B5563]" />
                                            <span>EDITAR</span>
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => setDeletingOccurrence(group.occurrences[0])}
                                            className="px-2.5 py-1 bg-white border border-[#FECACA] hover:bg-[#FEF2F2] text-[#DC2626] rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                          >
                                            <Trash2 className="w-3 h-3 text-[#DC2626]" />
                                            <span>EXCLUIR</span>
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {groupedNominees.length > 0 && (
                          <div className="pt-2 border-t border-[#F3F4F6]">
                            <button
                              type="button"
                              onClick={() => {
                                setAddingToCriterionId(criterion.criterionId);
                                setManualNomineeName('');
                              }}
                              className="px-3 py-1.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#111827] text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
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
              })}
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ADICIONAR CRITÉRIO
         ======================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#111827]" />
                Adicionar Critério
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-[#9CA3AF] hover:text-[#111827] p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewCriterion} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#374151] mb-1">
                  Nome do Critério:
                </label>
                <input
                  id="input-new-criterion-name"
                  type="text"
                  required
                  autoFocus
                  placeholder="Ex: ANCIÃOS, DIÁCONOS, REPRESENTANTES..."
                  value={newCriterionName}
                  onChange={(e) => setNewCriterionName(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs text-[#111827] focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#374151] mb-1">
                  Limite nesta reunião:
                </label>
                <input
                  id="input-new-criterion-limit"
                  type="number"
                  min={1}
                  max={500}
                  required
                  value={newCriterionLimit}
                  onChange={(e) =>
                    setNewCriterionLimit(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  className="w-28 bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs text-[#111827] font-bold focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSavingNewCriterion}
                  className="px-4 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  id="btn-confirm-add-criterion"
                  type="submit"
                  disabled={isSavingNewCriterion || !newCriterionName.trim()}
                  className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingNewCriterion ? 'Adicionando...' : 'Adicionar Critério'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: EDITAR CRITÉRIO
         ======================================================== */}
      {editingCriterion && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#111827]" />
                Editar Critério
              </h3>
              <button
                type="button"
                onClick={() => setEditingCriterion(null)}
                className="text-[#9CA3AF] hover:text-[#111827] p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditCriterion} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#374151] mb-1">
                  Nome do Critério:
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  disabled={!editingCriterion.isCustom}
                  value={editCriterionName}
                  onChange={(e) => setEditCriterionName(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs text-[#111827] focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white disabled:opacity-60"
                />
                {!editingCriterion.isCustom && (
                  <p className="text-[11px] text-[#6B7280] mt-1">
                    Os nomes dos 3 critérios padrão (HOMENS, MULHERES, JOVENS) são fixos.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#374151] mb-1">
                  Limite nesta reunião:
                </label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  required
                  value={editCriterionLimit}
                  onChange={(e) =>
                    setEditCriterionLimit(Math.max(0, parseInt(e.target.value, 10) || 0))
                  }
                  className="w-28 bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs text-[#111827] font-bold focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-criterion-enabled-checkbox"
                  checked={editCriterionEnabled}
                  onChange={(e) => setEditCriterionEnabled(e.target.checked)}
                  className="h-4 w-4 rounded-sm border-[#D1D5DB] text-[#111827] focus:ring-[#111827] cursor-pointer"
                />
                <label
                  htmlFor="edit-criterion-enabled-checkbox"
                  className="text-xs font-bold text-[#374151] cursor-pointer"
                >
                  Critério Habilitado nesta Reunião
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setEditingCriterion(null)}
                  disabled={isSavingEditCriterion}
                  className="px-4 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEditCriterion || !editCriterionName.trim()}
                  className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingEditCriterion ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: EXCLUIR CRITÉRIO PERSONALIZADO
         ======================================================== */}
      {deletingCriterion && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center mx-auto text-[#DC2626]">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#111827]">
                Excluir Critério Personalizado?
              </h3>
              <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
                Deseja remover o critério <strong>{deletingCriterion.name}</strong> desta reunião?
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCriterion(null)}
                disabled={isDeletingCriterion}
                className="w-1/2 py-2.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCriterion}
                disabled={isDeletingCriterion}
                className="w-1/2 py-2.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isDeletingCriterion ? 'Excluindo...' : 'EXCLUIR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ADICIONAR INDICAÇÃO MANUAL AO CRITÉRIO
         ======================================================== */}
      {addingToCriterionId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#111827]" />
                Adicionar Indicação Manual
              </h3>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Critério:{' '}
                <strong>
                  {formCriteria.find((c) => c.criterionId === addingToCriterionId)?.name}
                </strong>
              </p>
            </div>

            <form onSubmit={handleSaveManualNominee} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#374151] mb-1">
                  Nome da pessoa indicada:
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ex: Carlos Andrade"
                  value={manualNomineeName}
                  onChange={(e) => setManualNomineeName(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs text-[#111827] focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddingToCriterionId(null)}
                  disabled={isAddingManualNominee}
                  className="px-4 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAddingManualNominee || !manualNomineeName.trim()}
                  className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  {isAddingManualNominee ? 'Adicionando...' : 'Adicionar Nome'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: EDITAR OCORRÊNCIA DE INDICAÇÃO
         ======================================================== */}
      {editingOccurrence && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-[#111827]" />
              Corrigir Grafia da Indicação
            </h3>

            <form onSubmit={handleSaveOccurrenceEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#374151] mb-1">
                  Nome da pessoa indicada:
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={editOccurrenceName}
                  onChange={(e) => setEditOccurrenceName(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs text-[#111827] focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingOccurrence(null)}
                  disabled={isSavingOccurrence}
                  className="px-4 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingOccurrence || !editOccurrenceName.trim()}
                  className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  {isSavingOccurrence ? 'Salvando...' : 'Salvar Alteração'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: EXCLUIR OCORRÊNCIA DE INDICAÇÃO
         ======================================================== */}
      {deletingOccurrence && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center mx-auto text-[#DC2626]">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#111827]">Excluir esta indicação?</h3>
              <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
                Deseja remover esta indicação de <strong>{deletingOccurrence.nomineeName}</strong>?
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingOccurrence(null)}
                disabled={isDeletingOccurrence}
                className="w-1/2 py-2.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteOccurrence}
                disabled={isDeletingOccurrence}
                className="w-1/2 py-2.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                {isDeletingOccurrence ? 'Excluindo...' : 'EXCLUIR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: VER INDICAÇÕES RECEBIDAS PARA UM NOME
         ======================================================== */}
      {viewingNomineeModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#111827]" />
                Detalhes das Indicações
              </h3>
              <button
                type="button"
                onClick={() => setViewingNomineeModal(null)}
                className="text-[#9CA3AF] hover:text-[#111827] p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3.5 space-y-1.5">
                <div>
                  <span className="text-[#6B7280] font-medium">Indicações recebidas para: </span>
                  <strong className="text-[#111827] text-sm">{viewingNomineeModal.nomineeName}</strong>
                </div>
                <div>
                  <span className="text-[#6B7280] font-medium">Critério: </span>
                  <strong className="text-[#111827]">{viewingNomineeModal.criterionName}</strong>
                </div>
              </div>

              <div className="space-y-2">
                <span className="font-bold text-[#374151] block">Indicado por:</span>
                {(() => {
                  const identifiedNames: string[] = [];
                  let legacyCount = 0;

                  for (const occ of viewingNomineeModal.occurrences) {
                    const pName = (occ.participantName || '').trim();
                    if (occ.participantSessionId?.startsWith('admin_manual_')) {
                      identifiedNames.push('Administrador (inclusão manual)');
                    } else if (
                      pName &&
                      pName.toLowerCase() !== 'participante'
                    ) {
                      identifiedNames.push(pName);
                    } else {
                      legacyCount++;
                    }
                  }

                  if (identifiedNames.length === 0 && legacyCount > 0) {
                    return (
                      <div className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[#6B7280]">
                        Sem identificação de participante nos registros anteriores ({legacyCount}{' '}
                        {legacyCount === 1 ? 'indicação' : 'indicações'}).
                      </div>
                    );
                  }

                  if (identifiedNames.length === 0) {
                    return (
                      <div className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[#6B7280]">
                        Nenhum registro de participante encontrado.
                      </div>
                    );
                  }

                  return (
                    <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3.5 space-y-1.5 max-h-56 overflow-y-auto">
                      <ul className="space-y-1.5">
                        {identifiedNames.map((name, idx) => (
                          <li
                            key={idx}
                            className="flex items-center gap-2 text-xs font-semibold text-[#111827]"
                          >
                            <span className="text-[#059669] font-bold">•</span>
                            <span>{name}</span>
                          </li>
                        ))}
                      </ul>
                      {legacyCount > 0 && (
                        <p className="text-[11px] text-[#6B7280] pt-1.5 border-t border-[#E5E7EB]">
                          + {legacyCount}{' '}
                          {legacyCount === 1
                            ? 'indicação anterior sem identificação de participante.'
                            : 'indicações anteriores sem identificação de participante.'}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => setViewingNomineeModal(null)}
                className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
              >
                FECHAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: CRIAR PAUTA PARA VOTAÇÃO (COMISSÃO ORGANIZADORA)
         ======================================================== */}
      {creatingPollCriterion && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 max-w-lg w-full shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  COMISSÃO ORGANIZADORA • {creatingPollCriterion.name}
                </span>
                <h3 className="text-base font-bold text-[#111827]">
                  Criar Pauta para Votação
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreatingPollCriterion(null);
                  setCreatedPollSuccess(null);
                }}
                className="text-[#9CA3AF] hover:text-[#111827] p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createdPollSuccess ? (
              <div className="space-y-4 py-2">
                <div className="p-4 bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-[#059669] mx-auto" />
                  <h4 className="text-sm font-bold text-[#065F46]">
                    Pauta Criada com Sucesso!
                  </h4>
                  <p className="text-xs text-[#047857] leading-relaxed">
                    {createdPollSuccess}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                  {(onNavigateToPolls || onBackToPolls) && (
                    <button
                      id="btn-go-to-polls-from-organizing"
                      type="button"
                      onClick={() => {
                        setCreatingPollCriterion(null);
                        setCreatedPollSuccess(null);
                        if (onNavigateToPolls) {
                          onNavigateToPolls();
                        } else if (onBackToPolls) {
                          onBackToPolls();
                        }
                      }}
                      className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
                    >
                      IR PARA PAUTA &amp; VOTAÇÃO
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingPollCriterion(null);
                      setCreatedPollSuccess(null);
                    }}
                    className="px-4 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
                  >
                    FECHAR
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreatePollSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#374151] mb-1">
                    Título da Pauta:
                  </label>
                  <input
                    id="input-organizing-poll-question"
                    type="text"
                    required
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs font-semibold text-[#111827] focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3.5 py-2.5">
                  <label className="text-xs font-bold text-[#374151]">
                    Múltipla escolha:
                  </label>
                  <CompactChoiceLimitSelector
                    id="select-organizing-poll-max-choices"
                    value={Math.max(1, Math.min(15, pollMaxChoices || 1))}
                    min={1}
                    max={15}
                    onChange={(val) => {
                      setPollMaxChoices(val);
                      setPollAllowMultiple(val > 1);
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#374151] mb-1.5">
                    Nomes Selecionados ({Object.values(includedNomineeNames).filter(Boolean).length}
                    ):
                  </label>
                  <div className="border border-[#E5E7EB] rounded-xl divide-y divide-[#F3F4F6] max-h-48 overflow-y-auto">
                    {Object.entries(includedNomineeNames).map(([name, included]) => (
                      <label
                        key={name}
                        className="flex items-center justify-between p-2.5 px-3 text-xs cursor-pointer hover:bg-[#F9FAFB]"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={included}
                            onChange={(e) =>
                              setIncludedNomineeNames((prev) => ({
                                ...prev,
                                [name]: e.target.checked,
                              }))
                            }
                            className="h-4 w-4 rounded-sm border-[#D1D5DB] text-[#111827] focus:ring-[#111827]"
                          />
                          <span className="font-bold text-[#111827]">{name}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
                  <button
                    type="button"
                    onClick={() => setCreatingPollCriterion(null)}
                    disabled={isSubmittingPoll}
                    className="px-4 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    id="btn-confirm-create-organizing-poll"
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
    </div>
  );
};
