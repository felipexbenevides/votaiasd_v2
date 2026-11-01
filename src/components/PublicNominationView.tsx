import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Layers,
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  Search,
  User as UserIcon,
  X,
  Edit3,
  RotateCcw,
  Send,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { ChurchLogo } from './ChurchLogo';
import { PublicNominationState } from '../types';
import {
  fetchPublicNominationState,
  startParticipantNominationSession,
  fetchParticipantNominations,
  saveParticipantNominations,
  finalizeParticipantNominations,
} from '../services/api';
import { getDepartmentDescription } from '../constants/departments';
import { extractBaseMeetingName } from '../utils/meetingTitle';

interface PublicNominationViewProps {
  token: string;
}

interface LocalSessionData {
  sessionId: string;
  nominatorName: string;
  nominations: Record<string, string[]>;
}

interface DepartmentFeedback {
  type: 'success' | 'error';
  message: string;
}

export const PublicNominationView: React.FC<PublicNominationViewProps> = ({
  token,
}) => {
  const [state, setState] = useState<PublicNominationState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Participant session state
  const [sessionId, setSessionId] = useState<string>('');
  const [nominatorName, setNominatorName] = useState<string>('');
  const [tempNameInput, setTempNameInput] = useState<string>('');
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [hasExistingSession, setHasExistingSession] = useState<boolean>(false);

  // Accordion state (PARTE 1, 2, 3) - All departments collapsed initially
  const [openDepartmentId, setOpenDepartmentId] = useState<string | null>(null);

  // Active info modal department
  const [activeInfoDept, setActiveInfoDept] = useState<{ id: string; name: string } | null>(null);

  // Finalization states
  const [isSendingAll, setIsSendingAll] = useState<boolean>(false);
  const [isFinalized, setIsFinalized] = useState<boolean>(false);
  const [isFinalizedConfirmed, setIsFinalizedConfirmed] = useState<boolean>(false);

  // Official nominations saved on backend: map of departmentId -> string[]
  const [savedNominations, setSavedNominations] = useState<Record<string, string[]>>({});

  // Draft inputs while editing: map of departmentId -> string[]
  const [draftNominations, setDraftNominations] = useState<Record<string, string[]>>({});

  // Departments currently in explicit edit mode (for departments that already have saved nominations)
  const [editingDepartments, setEditingDepartments] = useState<Record<string, boolean>>({});

  // Saving state per department
  const [savingDepartments, setSavingDepartments] = useState<Record<string, boolean>>({});

  // Feedback messages per department
  const [departmentFeedbacks, setDepartmentFeedbacks] = useState<
    Record<string, DepartmentFeedback | null>
  >({});

  // General error (session creation or global)
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'sent' | 'pending'>('all');

  const storageKey = useMemo(() => `votaiasd_nomination_${token}`, [token]);

  // Persist local draft backup to localStorage
  const persistLocalDraft = useCallback(
    (
      currentSaved: Record<string, string[]>,
      currentDraft: Record<string, string[]>,
      currentSessionId: string,
      currentName: string
    ) => {
      if (!currentSessionId || !currentName) return;
      try {
        // Merge drafts with saved so unsent drafts are not lost on refresh
        const merged: Record<string, string[]> = { ...currentSaved };
        for (const [deptId, list] of Object.entries(currentDraft)) {
          if (Array.isArray(list) && list.some((n) => n.trim().length > 0)) {
            merged[deptId] = list;
          }
        }
        const payload: LocalSessionData = {
          sessionId: currentSessionId,
          nominatorName: currentName,
          nominations: merged,
        };
        localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        // Ignore localStorage quota errors
      }
    },
    [storageKey]
  );

  // Load public meeting state and check existing session
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);

    fetchPublicNominationState(token)
      .then(async (pubState) => {
        if (!isMounted) return;
        setState(pubState);

        if (pubState.valid && pubState.status === 'OPEN') {
          try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
              const parsed: LocalSessionData = JSON.parse(raw);
              if (parsed.sessionId && parsed.nominatorName) {
                setSessionId(parsed.sessionId);
                setNominatorName(parsed.nominatorName);
                setTempNameInput(parsed.nominatorName);
                setHasExistingSession(true);

                // Fetch latest saved nominations from backend in background
                try {
                  const remote = await fetchParticipantNominations(token, parsed.sessionId);
                  if (remote && remote.nominations) {
                    setSavedNominations(remote.nominations);
                    setDraftNominations(remote.nominations);
                  } else if (parsed.nominations) {
                    setDraftNominations(parsed.nominations);
                  }
                } catch {
                  if (parsed.nominations) {
                    setDraftNominations(parsed.nominations);
                  }
                }
              }
            }
          } catch {
            // Ignore parse errors
          }
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setErrorMessage(err.message || 'Erro ao carregar link de indicações.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token, storageKey]);

  // Countdown Timer State based on state?.deadline
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format deadline for user
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

  // Real-time Countdown Info
  const countdownInfo = useMemo(() => {
    if (!state?.deadline) return null;
    try {
      const deadlineMs = new Date(state.deadline).getTime();
      if (isNaN(deadlineMs)) return null;

      const diffMs = deadlineMs - now;

      if (diffMs <= 0) {
        return {
          isExpired: true,
          isUrgent: false,
          text: 'INDICAÇÕES ENCERRADAS',
        };
      }

      const totalSeconds = Math.floor(diffMs / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      const isUrgent = diffMs < 15 * 60 * 1000; // < 15 minutes

      let text = '';
      if (days > 0) {
        text = `RESTAM ${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}min ${String(seconds).padStart(2, '0')}s`;
      } else if (hours > 0) {
        text = `RESTAM ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}min ${String(seconds).padStart(2, '0')}s`;
      } else if (minutes > 0) {
        text = `RESTAM ${String(minutes).padStart(2, '0')}min ${String(seconds).padStart(2, '0')}s`;
      } else {
        text = `RESTAM ${seconds}s`;
      }

      return {
        isExpired: false,
        isUrgent,
        text,
      };
    } catch {
      return null;
    }
  }, [state?.deadline, now]);

  // STEP 1: Start participant session with provided name
  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = tempNameInput.trim();
    if (!cleanName) {
      setGeneralError('Por favor, informe seu nome para registrar suas indicações.');
      return;
    }

    setGeneralError(null);
    try {
      const res = await startParticipantNominationSession(token, cleanName, sessionId || undefined);
      setSessionId(res.sessionId);
      setNominatorName(res.nominatorName);
      setHasStarted(true);

      // Try to load any existing remote nominations for restored session
      try {
        const remote = await fetchParticipantNominations(token, res.sessionId);
        if (remote && remote.nominations) {
          setSavedNominations(remote.nominations);
          setDraftNominations(remote.nominations);
        }
      } catch {
        // No prior remote nominations
      }

      persistLocalDraft(savedNominations, draftNominations, res.sessionId, res.nominatorName);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao iniciar sessão.';
      setGeneralError(msg);
    }
  };

  // Modify draft name input
  const handleDraftNameChange = (departmentId: string, index: number, value: string) => {
    setDraftNominations((prev) => {
      const list = [...(prev[departmentId] || [''])];
      list[index] = value;
      const updated = { ...prev, [departmentId]: list };
      persistLocalDraft(savedNominations, updated, sessionId, nominatorName);
      return updated;
    });

    // Clear previous error feedback on change
    if (departmentFeedbacks[departmentId]?.type === 'error') {
      setDepartmentFeedbacks((prev) => ({ ...prev, [departmentId]: null }));
    }
  };

  // Add draft input field
  const handleAddDraftField = (departmentId: string, maxLimit: number) => {
    setDraftNominations((prev) => {
      const currentList = prev[departmentId] || [];
      if (currentList.length >= maxLimit) return prev;
      const updated = { ...prev, [departmentId]: [...currentList, ''] };
      persistLocalDraft(savedNominations, updated, sessionId, nominatorName);
      return updated;
    });
    setEditingDepartments((prev) => ({ ...prev, [departmentId]: true }));
  };

  // Remove draft input field
  const handleRemoveDraftField = (departmentId: string, index: number) => {
    setDraftNominations((prev) => {
      const currentList = prev[departmentId] || [];
      const updatedList = currentList.filter((_, i) => i !== index);
      const updated = { ...prev, [departmentId]: updatedList };
      persistLocalDraft(savedNominations, updated, sessionId, nominatorName);
      return updated;
    });
  };

  // Enter edit mode for a department
  const handleStartEditing = (departmentId: string) => {
    const saved = savedNominations[departmentId] || [];
    setDraftNominations((prev) => ({
      ...prev,
      [departmentId]: saved.length > 0 ? [...saved] : [''],
    }));
    setEditingDepartments((prev) => ({ ...prev, [departmentId]: true }));
    setDepartmentFeedbacks((prev) => ({ ...prev, [departmentId]: null }));
  };

  // Add an extra name slot directly from read-only view
  const handleAddFromReadOnly = (departmentId: string, maxLimit: number) => {
    const saved = savedNominations[departmentId] || [];
    if (saved.length >= maxLimit) return;
    setDraftNominations((prev) => ({
      ...prev,
      [departmentId]: [...saved, ''],
    }));
    setEditingDepartments((prev) => ({ ...prev, [departmentId]: true }));
    setDepartmentFeedbacks((prev) => ({ ...prev, [departmentId]: null }));
  };

  // Cancel edit mode and revert draft to official saved names
  const handleCancelEditing = (departmentId: string) => {
    const saved = savedNominations[departmentId] || [];
    setDraftNominations((prev) => ({
      ...prev,
      [departmentId]: [...saved],
    }));
    setEditingDepartments((prev) => ({ ...prev, [departmentId]: false }));
    setDepartmentFeedbacks((prev) => ({ ...prev, [departmentId]: null }));
  };

  // Toggle accordion department (PARTE 1, 2, 3)
  const handleToggleDepartment = (departmentId: string) => {
    if (openDepartmentId === departmentId) {
      setOpenDepartmentId(null);
    } else {
      setOpenDepartmentId(departmentId);
      const saved = savedNominations[departmentId] || [];
      if (saved.length === 0 && (!draftNominations[departmentId] || draftNominations[departmentId].length === 0)) {
        setDraftNominations((prev) => ({ ...prev, [departmentId]: [''] }));
      }
    }
  };

  // SAVE SINGLE DEPARTMENT to Backend
  const handleSaveDepartment = async (departmentId: string, maxLimit: number) => {
    if (countdownInfo?.isExpired) {
      setDepartmentFeedbacks((prev) => ({
        ...prev,
        [departmentId]: {
          type: 'error',
          message: 'O prazo de indicações já expirou. Não é possível enviar novas indicações.',
        },
      }));
      return;
    }

    if (!sessionId || !nominatorName) {
      setGeneralError('Informe seu nome antes de salvar indicações.');
      return;
    }

    const rawList = draftNominations[departmentId] || [];
    const cleanNames: string[] = [];
    const seen = new Set<string>();

    for (const name of rawList) {
      if (typeof name !== 'string') continue;
      const trimmed = name.trim();
      if (!trimmed) continue;
      const normalized = trimmed.toLowerCase();
      if (seen.has(normalized)) {
        setDepartmentFeedbacks((prev) => ({
          ...prev,
          [departmentId]: {
            type: 'error',
            message: `O nome "${trimmed}" foi informado mais de uma vez neste departamento.`,
          },
        }));
        return;
      }
      seen.add(normalized);
      cleanNames.push(trimmed);
    }

    if (cleanNames.length > maxLimit) {
      setDepartmentFeedbacks((prev) => ({
        ...prev,
        [departmentId]: {
          type: 'error',
          message: `Este departamento permite no máximo ${maxLimit} ${
            maxLimit === 1 ? 'indicação' : 'indicações'
          }.`,
        },
      }));
      return;
    }

    setSavingDepartments((prev) => ({ ...prev, [departmentId]: true }));
    setDepartmentFeedbacks((prev) => ({ ...prev, [departmentId]: null }));

    try {
      const res = await saveParticipantNominations(token, {
        sessionId,
        nominatorName,
        departmentId,
        nomineeNames: cleanNames,
      });

      const updatedSavedNames = res.savedNames !== undefined ? res.savedNames : cleanNames;

      setSavedNominations((prev) => {
        const updated = { ...prev, [departmentId]: updatedSavedNames };
        persistLocalDraft(updated, draftNominations, sessionId, nominatorName);
        return updated;
      });

      setDraftNominations((prev) => ({ ...prev, [departmentId]: updatedSavedNames }));
      setEditingDepartments((prev) => ({ ...prev, [departmentId]: false }));

      // Auto-close department on save (PARTE 2)
      setOpenDepartmentId(null);

      const feedbackText =
        updatedSavedNames.length === 0
          ? 'Indicações deste departamento removidas.'
          : updatedSavedNames.length === 1
          ? 'Indicação salva com sucesso!'
          : `${updatedSavedNames.length} indicações salvas com sucesso!`;

      setDepartmentFeedbacks((prev) => ({
        ...prev,
        [departmentId]: { type: 'success', message: feedbackText },
      }));

      // Auto-clear success notification after 4 seconds
      setTimeout(() => {
        setDepartmentFeedbacks((prev) => {
          if (prev[departmentId]?.type === 'success') {
            return { ...prev, [departmentId]: null };
          }
          return prev;
        });
      }, 4000);
    } catch (err: unknown) {
      const status = (err as any)?.status;
      if (status === 'EXPIRED') {
        const msg = 'O período de indicações foi encerrado. Novos envios não são mais aceitos.';
        setDepartmentFeedbacks((prev) => ({
          ...prev,
          [departmentId]: { type: 'error', message: msg },
        }));
        fetchPublicNominationState(token)
          .then((res) => setState(res))
          .catch(() => {});
      } else {
        const msg = err instanceof Error ? err.message : 'Falha ao salvar indicações do departamento.';
        setDepartmentFeedbacks((prev) => ({
          ...prev,
          [departmentId]: { type: 'error', message: msg },
        }));
      }
    } finally {
      setSavingDepartments((prev) => ({ ...prev, [departmentId]: false }));
    }
  };

  // SAVE ALL NOMINATIONS & FINALIZE (PARTE 9, 10, 11)
  const handleSendAllNominations = async () => {
    if (!sessionId || !nominatorName) {
      setGeneralError('Informe seu nome antes de salvar indicações.');
      return;
    }

    setIsSendingAll(true);
    setGeneralError(null);

    try {
      if (state?.departments) {
        for (const dept of state.departments) {
          const draft = draftNominations[dept.departmentId];
          const saved = savedNominations[dept.departmentId] || [];

          if (draft && draft.some((n) => n.trim().length > 0)) {
            const cleanNames = draft
              .map((n) => n.trim())
              .filter((n) => n.length > 0);

            const isDifferent =
              cleanNames.length !== saved.length ||
              cleanNames.some((n, idx) => n !== saved[idx]);

            if (isDifferent) {
              const res = await saveParticipantNominations(token, {
                sessionId,
                nominatorName,
                departmentId: dept.departmentId,
                nomineeNames: cleanNames.slice(0, dept.maxPerPerson),
              });
              const updatedSaved = res.savedNames !== undefined ? res.savedNames : cleanNames;
              setSavedNominations((prev) => ({ ...prev, [dept.departmentId]: updatedSaved }));
              setDraftNominations((prev) => ({ ...prev, [dept.departmentId]: updatedSaved }));
              setEditingDepartments((prev) => ({ ...prev, [dept.departmentId]: false }));
            }
          }
        }
      }

      // Explicitly mark session as finalized on backend (PARTE 10, 11)
      try {
        await finalizeParticipantNominations(token, {
          sessionId,
          nominatorName,
        });
      } catch {
        // Fallback gracefully
      }

      setIsFinalized(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao sincronizar todas as indicações.';
      setGeneralError(msg);
    } finally {
      setIsSendingAll(false);
    }
  };

  // Departments list filtering
  const visibleDepartments = useMemo(() => {
    if (!state?.departments) return [];
    return state.departments.filter((dept) => {
      const saved = savedNominations[dept.departmentId] || [];
      const isSent = saved.length > 0;

      if (filterStatus === 'sent' && !isSent) return false;
      if (filterStatus === 'pending' && isSent) return false;

      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        return dept.name.toLowerCase().includes(q);
      }

      return true;
    });
  }, [state?.departments, savedNominations, filterStatus, searchQuery]);

  // Count statistics
  const totalDepartments = state?.departments?.length || 0;
  const sentDepartmentsCount = useMemo(() => {
    if (!state?.departments) return 0;
    return state.departments.filter((dept) => {
      const saved = savedNominations[dept.departmentId] || [];
      return saved.length > 0;
    }).length;
  }, [state?.departments, savedNominations]);

  const completeDepartmentsCount = useMemo(() => {
    if (!state?.departments) return 0;
    return state.departments.filter((dept) => {
      const saved = savedNominations[dept.departmentId] || [];
      return saved.length >= dept.maxPerPerson;
    }).length;
  }, [state?.departments, savedNominations]);

  const meetingWithChurchTitle = useMemo(() => {
    if (!state) return '';
    const { baseName, congregation } = extractBaseMeetingName(
      state.meetingName,
      state.nominationCommissionName
    );
    return congregation ? `${baseName} — ${congregation}` : baseName;
  }, [state]);

  // Final confirmation / Thank You Screen (PARTE 10, 11, 12, 14, 28)
  if (isFinalized) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 sm:p-10 max-w-md w-full text-center shadow-xs space-y-6">
          {/* Logo Institucional VOTAIASD (PARTE 14) */}
          <div className="flex items-center justify-center gap-2.5">
            <ChurchLogo className="w-10 h-10 text-[#111827]" />
            <span className="font-bold text-xl tracking-tight text-[#111827]">
              VOTAIASD
            </span>
          </div>

          <div className="w-14 h-14 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center mx-auto text-[#059669]">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#059669] bg-[#ECFDF5] px-3 py-1 rounded-full border border-[#A7F3D0]">
              INDICAÇÕES ENVIADAS
            </span>
            <h2 className="text-xl font-extrabold text-[#111827] pt-2">
              Obrigado por enviar suas indicações!
            </h2>
            <p className="text-xs text-[#374151] leading-relaxed font-medium">
              Suas indicações foram registradas com sucesso.
            </p>
            <p className="text-xs text-[#6B7280] leading-relaxed">
              Agora aguarde as próximas orientações da Comissão de Nomeação.
            </p>
          </div>

          {meetingWithChurchTitle && (
            <div className="text-[11px] text-[#6B7280] bg-[#F9FAFB] p-3 rounded-xl border border-[#E5E7EB]">
              Reunião: <strong>{meetingWithChurchTitle}</strong> • Participante: <strong>{nominatorName}</strong>
            </div>
          )}

          {/* Botão Final (PARTE 12) - Permanece na tela final neutra de encerramento */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setIsFinalizedConfirmed(true)}
              disabled={isFinalizedConfirmed}
              className={`w-full py-3 text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-xs ${
                isFinalizedConfirmed
                  ? 'bg-[#F3F4F6] text-[#9CA3AF] border border-[#E5E7EB] cursor-default'
                  : 'bg-[#111827] hover:bg-black text-white cursor-pointer active:scale-[0.99]'
              }`}
            >
              {isFinalizedConfirmed ? 'CONCLUÍDO' : 'FINALIZAR'}
            </button>
          </div>

          {isFinalizedConfirmed && (
            <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl text-center space-y-0.5">
              <p className="text-xs text-[#059669] font-bold">
                ✓ Processo de indicações concluído com sucesso.
              </p>
              <p className="text-[11px] text-[#047857]">
                Você pode fechar esta página com segurança.
              </p>
            </div>
          )}

          {state?.status === 'OPEN' && !isFinalizedConfirmed && (
            <div className="pt-2 border-t border-[#F3F4F6]">
              <button
                type="button"
                onClick={() => {
                  setIsFinalized(false);
                  setIsFinalizedConfirmed(false);
                }}
                className="text-xs text-[#6B7280] hover:text-[#111827] underline font-medium cursor-pointer"
              >
                Revisar ou alterar minhas indicações
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Loading screen
  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 max-w-md w-full text-center shadow-xs">
          <div className="w-8 h-8 border-3 border-[#111827] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-base font-bold text-[#111827]">Verificando link de indicações...</h2>
          <p className="text-xs text-[#6B7280] mt-1">Carregando dados da reunião.</p>
        </div>
      </div>
    );
  }

  // Error / Closed / Expired screen
  if (errorMessage || !state || !state.valid || state.status !== 'OPEN') {
    const status = state?.status || 'NOT_FOUND';
    let title = 'Link de Indicações Indisponível';
    let desc = state?.error || errorMessage || 'Não foi possível acessar as indicações.';

    if (status === 'EXPIRED') {
      title = 'Prazo de Indicações Expirado';
      desc = 'O prazo estipulado para envio de indicações nesta reunião já foi encerrado.';
    } else if (status === 'CLOSED') {
      title = 'Indicações Encerradas';
      desc = 'O período de recebimento de indicações para esta reunião está encerrado no momento.';
    } else if (status === 'DISABLED') {
      title = 'Indicações Desativadas';
      desc = 'O módulo de indicações não está ativo para esta reunião.';
    } else if (status === 'NOT_FOUND') {
      title = 'Link Não Encontrado';
      desc = 'O token informado não corresponde a nenhuma reunião ou link ativo de indicações.';
    }

    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 max-w-md w-full text-center shadow-xs space-y-4">
          <div className="w-12 h-12 rounded-full bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center mx-auto text-[#DC2626]">
            <AlertCircle className="w-6 h-6" />
          </div>

          <div>
            {meetingWithChurchTitle && (
              <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280] block mb-1">
                {meetingWithChurchTitle}
              </span>
            )}
            <h2 className="text-lg font-bold text-[#111827]">{title}</h2>
            <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">{desc}</p>
          </div>

          {state?.deadline && (
            <div className="text-[11px] text-[#6B7280] bg-[#F9FAFB] p-2.5 rounded-xl border border-[#E5E7EB]">
              Prazo limite registrado: <strong>{formatDeadline(state.deadline)}</strong>
            </div>
          )}
        </div>
      </div>
    );
  }

  // STEP 1: Participant Name Identification Screen (PARTE 4, 5, 6)
  if (!hasStarted) {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-6">
        {/* Meeting Header */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-xs text-center space-y-3">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#6B7280] bg-[#F3F4F6] px-3 py-1 rounded-full border border-[#E5E7EB]">
            INDICAÇÕES
          </span>

          <h1 className="text-xl sm:text-2xl font-extrabold text-[#111827]">
            {meetingWithChurchTitle}
          </h1>

          {state.deadline && (
            <div className="inline-flex flex-wrap items-center justify-center gap-2 text-xs text-[#6B7280] bg-[#F9FAFB] px-3.5 py-2 rounded-xl border border-[#E5E7EB]">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#111827]" />
                <span>
                  Prazo limite: <strong>{formatDeadline(state.deadline)}</strong>
                </span>
              </div>
              {countdownInfo && (
                <span
                  className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded-lg border ${
                    countdownInfo.isExpired
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : countdownInfo.isUrgent
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-white text-[#111827] border-[#D1D5DB]'
                  }`}
                >
                  {countdownInfo.text}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Name Registration Card */}
        <form
          onSubmit={handleStartSession}
          className="bg-white rounded-2xl border border-[#E5E7EB] p-6 sm:p-7 shadow-xs space-y-5"
        >
          <div className="space-y-1">
            <h2 className="text-base font-bold text-[#111827] flex items-center gap-2 uppercase tracking-tight">
              <UserIcon className="w-4 h-4 text-[#111827]" />
              {hasExistingSession ? 'CONTINUAR SUAS INDICAÇÕES' : 'VAMOS COMEÇAR!'}
            </h2>
            <p className="text-xs text-[#6B7280]">
              {hasExistingSession
                ? 'Clique em “Continuar indicações” para voltar ao formulário.'
                : 'Informe seu primeiro nome para registrar suas indicações nesta reunião.'}
            </p>
          </div>

          {generalError && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl flex items-center gap-2.5 text-xs text-[#DC2626]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{generalError}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="nominator-name-input"
              className="block text-xs font-bold uppercase tracking-widest text-[#6B7280] mb-1.5"
            >
              PRIMEIRO NOME
            </label>
            <input
              id="nominator-name-input"
              type="text"
              required
              autoFocus
              maxLength={30}
              value={tempNameInput}
              onChange={(e) => setTempNameInput(e.target.value)}
              placeholder="Ex: João"
              className="w-full px-4 py-3 text-sm font-semibold text-[#111827] bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] focus:border-transparent transition-all"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-xs active:scale-[0.99]"
          >
            {hasExistingSession ? 'CONTINUAR INDICAÇÕES' : 'INICIAR INDICAÇÕES'}
          </button>
        </form>
      </div>
    );
  }

  // STEP 2: Functional Nominations Form with Independent Per-Department Flow
  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5 pb-16">
      {/* Participant Header Card */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 shadow-xs space-y-3">
        <div className="border-b border-[#E5E7EB] pb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
            {meetingWithChurchTitle}
          </span>
          <h1 className="text-lg sm:text-xl font-extrabold text-[#111827]">
            Participante: {nominatorName}
          </h1>
        </div>

        <p className="text-xs text-[#4B5563] leading-relaxed">
          Você pode enviar suas indicações de cada departamento/ministério separadamente. Ao preencher uma indicação, clique no botão de envio do departamento ou preencha todas as indicações e, ao final, clique em “ENVIAR TODAS AS INDICAÇÕES”.
        </p>

        {state.deadline && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-[#4B5563] bg-[#F9FAFB] p-2.5 sm:p-3 rounded-xl border border-[#E5E7EB]">
            <div className="flex items-center gap-1.5 min-w-0">
              <Clock className="w-3.5 h-3.5 text-[#111827] shrink-0" />
              <span className="truncate">
                Prazo limite para recebimento: <strong>{formatDeadline(state.deadline)}</strong>
              </span>
            </div>
            {countdownInfo && (
              <div
                className={`font-mono font-bold text-xs px-2.5 py-1 rounded-lg border shrink-0 inline-flex items-center gap-1 self-start sm:self-auto ${
                  countdownInfo.isExpired
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : countdownInfo.isUrgent
                    ? 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
                    : 'bg-white text-[#111827] border-[#D1D5DB] shadow-2xs'
                }`}
              >
                {countdownInfo.text}
              </div>
            )}
          </div>
        )}

        {/* Status Tracker Stats */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#F3F4F6] text-center">
          <div className="bg-[#F9FAFB] p-2.5 rounded-xl border border-[#E5E7EB]">
            <span className="text-[10px] uppercase font-bold text-[#6B7280] block">
              Total
            </span>
            <span className="text-sm font-extrabold text-[#111827] mt-0.5 block">
              {totalDepartments}
            </span>
          </div>

          <div className="bg-[#ECFDF5] p-2.5 rounded-xl border border-[#A7F3D0]">
            <span className="text-[10px] uppercase font-bold text-[#059669] block">
              Enviados
            </span>
            <span className="text-sm font-extrabold text-[#059669] mt-0.5 block">
              {sentDepartmentsCount}
            </span>
          </div>

          <div className="bg-[#F9FAFB] p-2.5 rounded-xl border border-[#E5E7EB]">
            <span className="text-[10px] uppercase font-bold text-[#9CA3AF] block">
              Pendentes
            </span>
            <span className="text-sm font-extrabold text-[#374151] mt-0.5 block">
              {Math.max(0, totalDepartments - sentDepartmentsCount)}
            </span>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-[#E5E7EB] shadow-xs">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar departamento..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-hidden focus:ring-1 focus:ring-[#111827]"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
              filterStatus === 'all'
                ? 'bg-[#111827] text-white'
                : 'bg-[#F9FAFB] text-[#4B5563] border border-[#E5E7EB] hover:bg-[#F3F4F6]'
            }`}
          >
            Todos ({totalDepartments})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('sent')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
              filterStatus === 'sent'
                ? 'bg-[#059669] text-white'
                : 'bg-[#F9FAFB] text-[#4B5563] border border-[#E5E7EB] hover:bg-[#F3F4F6]'
            }`}
          >
            Enviados ({sentDepartmentsCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('pending')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
              filterStatus === 'pending'
                ? 'bg-[#111827] text-white'
                : 'bg-[#F9FAFB] text-[#4B5563] border border-[#E5E7EB] hover:bg-[#F3F4F6]'
            }`}
          >
            Pendentes ({Math.max(0, totalDepartments - sentDepartmentsCount)})
          </button>
        </div>
      </div>

      {/* Departments Form Cards */}
      <div className="space-y-4">
        {visibleDepartments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 text-center text-xs text-[#6B7280]">
            Nenhum departamento encontrado para o filtro informado.
          </div>
        ) : (
          visibleDepartments.map((dept, idx) => {
            const saved = savedNominations[dept.departmentId] || [];
            const savedCount = saved.length;
            const max = dept.maxPerPerson;
            const isSingle = max === 1;

            // Determine State
            // State 1: NÃO ENVIADO (savedCount === 0) -> Neutro/Cinza
            // State 2: PARCIALMENTE ENVIADO (savedCount > 0 && savedCount < max) -> Amarelo/Dourado
            // State 3: COMPLETO (savedCount >= max) -> Verde
            const isComplete = savedCount >= max;
            const isPartiallySent = savedCount > 0 && savedCount < max;
            const isNotSent = savedCount === 0;

            const isOpen = openDepartmentId === dept.departmentId;

            // Edit mode is active if explicitly enabled or if department has no saved records yet
            const isEditing = Boolean(editingDepartments[dept.departmentId]) || isNotSent;
            const isSavingThisDept = Boolean(savingDepartments[dept.departmentId]);
            const feedback = departmentFeedbacks[dept.departmentId];

            // Draft list for editing mode
            const draftList =
              draftNominations[dept.departmentId] ||
              (savedCount > 0 ? [...saved] : isSingle ? [''] : ['']);

            const filledDraftCount = draftList.filter((n) => n.trim().length > 0).length;

            return (
              <div
                key={dept.departmentId}
                id={`dept-card-${dept.departmentId}`}
                className={`rounded-2xl border shadow-xs transition-all ${
                  isComplete
                    ? 'border-[#A7F3D0] bg-[#ECFDF5]/30'
                    : isPartiallySent
                    ? 'border-amber-200 bg-amber-50/20'
                    : 'border-[#E5E7EB] bg-white'
                }`}
              >
                {/* Department Header - Click to open/close (PARTE 1, 2, 3, 4) */}
                <div
                  onClick={() => handleToggleDepartment(dept.departmentId)}
                  className={`p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                    isOpen ? 'border-b border-[#F3F4F6]' : 'rounded-2xl hover:bg-[#F9FAFB]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`text-xs font-mono font-bold shrink-0 ${
                        isComplete
                          ? 'text-[#059669]'
                          : isPartiallySent
                          ? 'text-amber-700'
                          : 'text-[#9CA3AF]'
                      }`}
                    >
                      {isComplete ? '✓' : `${idx + 1}.`}
                    </span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h2 className="text-sm font-bold text-[#111827] truncate">
                        {dept.name}
                      </h2>
                      <button
                        type="button"
                        aria-label={`Informações sobre ${dept.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveInfoDept({ id: dept.departmentId, name: dept.name });
                        }}
                        className="w-6 h-6 rounded-full text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F3F4F6] flex items-center justify-center shrink-0 transition cursor-pointer"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Cápsula de Estado Colorida - Sem bolinhas decorativas (PARTE 4, 5) */}
                    {isComplete ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]">
                        {max} de {max} {max === 1 ? 'indicação' : 'indicações'}
                      </span>
                    ) : isPartiallySent ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        {savedCount} de {max} {savedCount === 1 ? 'indicação' : 'indicações'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F3F4F6] text-[#6B7280] border border-[#E5E7EB]">
                        0 de {max} {max === 1 ? 'indicação' : 'indicações'}
                      </span>
                    )}

                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-[#6B7280]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />
                    )}
                  </div>
                </div>

                {/* Collapsible Body: Only rendered when isOpen (PARTE 1, 2, 3) */}
                {isOpen && (
                  <div className="p-4 sm:p-5 space-y-3.5 pt-3">
                    {/* Inline Feedback Alerts */}
                    {feedback && (
                      <div
                        className={`p-3 rounded-xl flex items-center gap-2 text-xs transition-all ${
                          feedback.type === 'success'
                            ? 'bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]'
                            : 'bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]'
                        }`}
                      >
                        {feedback.type === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0" />
                        )}
                        <span>{feedback.message}</span>
                      </div>
                    )}

                    {/* VIEW A: READ-ONLY DISPLAY (When department has saved nominations and is not editing) */}
                    {!isEditing && savedCount > 0 ? (
                      <div className="space-y-3">
                        {/* List of Sent Nominees (PARTE 6: sem 'Salva' ou 'Enviada', apenas ✓ Nome) */}
                        {isSingle ? (
                          <div className="bg-[#F9FAFB] rounded-xl p-3.5 border border-[#E5E7EB] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[#059669] font-bold text-sm">✓</span>
                              <span className="font-bold text-sm text-[#111827]">
                                {saved[0]}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {saved.map((nameVal, i) => (
                              <div
                                key={i}
                                className="bg-[#F9FAFB] rounded-xl px-3.5 py-2.5 border border-[#E5E7EB] flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center gap-2 font-medium text-[#111827]">
                                  <span className="text-[#059669] font-bold text-xs">✓</span>
                                  <span className="text-[#9CA3AF] font-mono text-[11px] w-4">
                                    {i + 1}.
                                  </span>
                                  <span className="font-semibold">{nameVal}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Department Action Buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleStartEditing(dept.departmentId)}
                            className="px-3.5 py-2 bg-white hover:bg-[#F3F4F6] border border-[#D1D5DB] text-[#374151] text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>EDITAR</span>
                          </button>

                          {/* If not complete, allow adding more names (Apenas UM símbolo +, sem ++) */}
                          {!isComplete && (
                            <button
                              type="button"
                              onClick={() => handleAddFromReadOnly(dept.departmentId, max)}
                              className="px-3.5 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>ADICIONAR NOME</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* VIEW B: EDITING / INPUT MODE */
                      <div className="space-y-3">
                        {/* Single Input Department (Limit = 1) */}
                        {isSingle ? (
                          <div className="space-y-1.5">
                            <div className="relative">
                              <input
                                type="text"
                                value={draftList[0] || ''}
                                onChange={(e) =>
                                  handleDraftNameChange(dept.departmentId, 0, e.target.value)
                                }
                                placeholder="Nome da pessoa indicada"
                                className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2.5 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white pr-9"
                              />
                              {draftList[0] && draftList[0].length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleDraftNameChange(dept.departmentId, 0, '')}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#DC2626] p-1 cursor-pointer"
                                  title="Limpar campo"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          /* Multiple Inputs Department (Limit > 1) */
                          <div className="space-y-2">
                            {draftList.length === 0 ? (
                              <div className="text-[11px] text-[#9CA3AF] italic py-1">
                                Nenhum campo de nome adicionado. Clique no botão abaixo para adicionar.
                              </div>
                            ) : (
                              draftList.map((nameVal, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <span className="text-[11px] font-bold text-[#9CA3AF] w-4 text-right shrink-0">
                                    {i + 1}.
                                  </span>
                                  <input
                                    type="text"
                                    value={nameVal}
                                    onChange={(e) =>
                                      handleDraftNameChange(dept.departmentId, i, e.target.value)
                                    }
                                    placeholder={`Nome ${i + 1} indicado`}
                                    className="flex-1 bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-hidden focus:ring-1 focus:ring-[#111827] focus:bg-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveDraftField(dept.departmentId, i)}
                                    className="p-2 text-[#9CA3AF] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors cursor-pointer shrink-0"
                                    title="Remover este campo"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))
                            )}

                            {/* Add Name Action if under limit (Apenas UM símbolo +, sem ++) */}
                            {draftList.length < max ? (
                              <button
                                type="button"
                                onClick={() => handleAddDraftField(dept.departmentId, max)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#111827] hover:bg-[#F3F4F6] border border-dashed border-[#D1D5DB] rounded-xl transition-colors cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5 text-[#111827]" />
                                <span>
                                  ADICIONAR NOME ({draftList.length}/{max})
                                </span>
                              </button>
                            ) : (
                              <div className="text-[11px] font-bold text-[#059669] bg-[#ECFDF5] px-2.5 py-1 rounded-lg inline-block border border-[#A7F3D0]">
                                ✓ Limite máximo de campos atingido ({max}/{max})
                              </div>
                            )}
                          </div>
                        )}

                        {/* Department Send / Save Actions */}
                        <div className="pt-2 flex items-center justify-between border-t border-[#F3F4F6] gap-2 flex-wrap">
                          <div className="text-[11px] text-[#6B7280]">
                            {filledDraftCount > 0 ? (
                              <span>
                                <strong>{filledDraftCount}</strong> de {max} preenchido
                                {filledDraftCount === 1 ? '' : 's'}
                              </span>
                            ) : (
                              <span className="italic text-[#9CA3AF]">Nenhum nome preenchido</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Cancel editing button if previously saved records existed */}
                            {savedCount > 0 && (
                              <button
                                type="button"
                                onClick={() => handleCancelEditing(dept.departmentId)}
                                disabled={isSavingThisDept}
                                className="px-3.5 py-2 bg-white hover:bg-[#F3F4F6] border border-[#D1D5DB] text-[#6B7280] hover:text-[#111827] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                              >
                                Cancelar
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleSaveDepartment(dept.departmentId, max)}
                              disabled={isSavingThisDept || (isNotSent && filledDraftCount === 0)}
                              className="px-4 py-2 bg-[#111827] hover:bg-black disabled:bg-[#E5E7EB] text-white disabled:text-[#9CA3AF] text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs disabled:cursor-not-allowed"
                            >
                              {isSavingThisDept ? (
                                <>
                                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  <span>Enviando...</span>
                                </>
                              ) : (
                                <>
                                  <Send className="w-3.5 h-3.5" />
                                  <span>
                                    {savedCount > 0
                                      ? 'SALVAR ALTERAÇÕES'
                                      : max === 1
                                      ? 'ENVIAR INDICAÇÃO'
                                      : 'ENVIAR INDICAÇÕES'}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Finalize Card with "ENVIAR TODAS AS INDICAÇÕES" (PARTE 9, 10) */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-[#111827]">
            Finalizar Envio das Indicações
          </h3>
          <p className="text-xs text-[#6B7280]">
            Sincroniza os departamentos com alterações e conclui seu envio. Não é obrigatório preencher todos os departamentos.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSendAllNominations}
          disabled={isSendingAll}
          className="px-6 py-3 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-[0.99] shrink-0 disabled:opacity-50"
        >
          {isSendingAll ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Enviando Todas...</span>
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              <span>ENVIAR TODAS AS INDICAÇÕES</span>
            </>
          )}
        </button>
      </div>

      {/* Modal Informativo: O que se espera do líder deste departamento */}
      {activeInfoDept && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs"
          onClick={() => setActiveInfoDept(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl border border-[#E5E7EB] p-5 sm:p-6 max-w-sm w-full shadow-2xl space-y-3 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-[#F3F4F6] pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#F3F4F6] text-[#111827] flex items-center justify-center shrink-0">
                  <Info className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-sm text-[#111827] block truncate">
                    {activeInfoDept.name}
                  </span>
                  <span className="text-[10px] text-[#6B7280] font-medium block">
                    O que se espera do líder deste departamento?
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveInfoDept(null)}
                className="p-1.5 text-[#9CA3AF] hover:text-[#111827] rounded-xl hover:bg-[#F3F4F6] transition cursor-pointer shrink-0 ml-2"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#4B5563] leading-relaxed">
              {getDepartmentDescription(activeInfoDept.id, activeInfoDept.name)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
