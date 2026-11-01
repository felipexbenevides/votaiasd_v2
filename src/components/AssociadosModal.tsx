import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, UserPlus, CheckCircle2, AlertCircle, ChevronDown, ArrowLeft, Users, Save } from 'lucide-react';
import { PollResult } from '../types';
import { canDepartmentHaveAssociates } from '../constants/departments';

interface AssociadosModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalPoll: PollResult | null;
  onSaveDirectAssociates: (pollId: string, associates: string[]) => Promise<void>;
  onSubmitVote: (
    question: string,
    options: string[],
    allowMultiple: boolean,
    maxChoices: number,
    shouldOpen: boolean
  ) => Promise<void>;
  isSubmitting: boolean;
}

export const AssociadosModal: React.FC<AssociadosModalProps> = ({
  isOpen,
  onClose,
  originalPoll,
  onSaveDirectAssociates,
  onSubmitVote,
  isSubmitting,
}) => {
  // Mode: 'DIRECT' (default: direct registration without vote) vs 'VOTE' (exceptional vote)
  const [activeMode, setActiveMode] = useState<'DIRECT' | 'VOTE'>('DIRECT');

  // Titular and Base Cargo
  const [titularName, setTitularName] = useState('');
  const [baseCargo, setBaseCargo] = useState('');

  // Mode DIRECT: list of associate names
  const [directAssociates, setDirectAssociates] = useState<string[]>(['']);

  // Mode VOTE: voting configuration (ALWAYS defaults to Escolha Única / 1 voto)
  const [voteQuestion, setVoteQuestion] = useState('');
  const [voteCandidates, setVoteCandidates] = useState<string[]>(['', '', '']);
  const [voteAllowMultiple, setVoteAllowMultiple] = useState(false);
  const [voteMaxChoices, setVoteMaxChoices] = useState(1);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && originalPoll) {
      // Find titular name from winning / top option
      const sorted = [...(originalPoll.options || [])].sort(
        (a, b) => (b.votes || 0) - (a.votes || 0)
      );
      const winner = sorted[0];
      const name = winner ? winner.text.trim() : '';
      setTitularName(name);

      // Clean up original question name for title
      let cargo = originalPoll.question.trim();
      cargo = cargo.replace(/^(eleição\s+(para\s+)?|nomeação\s+(para\s+)?|votação\s+(para\s+)?)/i, '').trim();
      setBaseCargo(cargo);

      // Pre-fill existing associates if any, otherwise 1 empty field
      if (originalPoll.associates && originalPoll.associates.length > 0) {
        setDirectAssociates([...originalPoll.associates]);
      } else {
        setDirectAssociates(['']);
      }

      // Default voting configuration for exceptional mode (ALWAYS reset to Escolha Única / 1 voto)
      setVoteQuestion(`ASSOCIADOS - ${cargo.toUpperCase()}`);
      setVoteCandidates(['', '', '']);
      setVoteAllowMultiple(false);
      setVoteMaxChoices(1);

      setActiveMode('DIRECT');
      setError(null);
      setSuccessMessage(null);
    }
  }, [isOpen, originalPoll]);

  if (!isOpen || !originalPoll) return null;

  // --- Handlers for DIRECT Mode ---
  const handleAddDirectAssociate = () => {
    setDirectAssociates((prev) => [...prev, '']);
  };

  const handleRemoveDirectAssociate = (index: number) => {
    if (directAssociates.length <= 1) {
      setDirectAssociates(['']);
      return;
    }
    setDirectAssociates((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDirectAssociateChange = (index: number, val: string) => {
    setError(null);
    setDirectAssociates((prev) => {
      const updated = [...prev];
      updated[index] = val;
      return updated;
    });
  };

  const handleSaveDirect = async () => {
    setError(null);
    setSuccessMessage(null);

    if (!canDepartmentHaveAssociates(originalPoll.sourceDepartmentId || originalPoll.question)) {
      setError(`O departamento "${originalPoll.question}" não permite o cadastro de associados (Regra Oficial).`);
      return;
    }

    const cleanNames = directAssociates
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    // Optional check: titular shouldn't be associate
    if (titularName) {
      const titularLower = titularName.toLowerCase();
      const hasTitular = cleanNames.some((c) => c.toLowerCase() === titularLower);
      if (hasTitular) {
        setError(`O titular nomeado "${titularName}" não deve ser incluído como associado.`);
        return;
      }
    }

    // Check duplicate names
    const duplicates = cleanNames.filter(
      (item, index) => cleanNames.indexOf(item) !== index
    );
    if (duplicates.length > 0) {
      setError(`Nome duplicado encontrado: "${duplicates[0]}".`);
      return;
    }

    try {
      await onSaveDirectAssociates(originalPoll.pollId, cleanNames);
      setSuccessMessage('Associados salvos com sucesso!');
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar associados.');
    }
  };

  // --- Handlers for VOTE Mode ---
  const handleAddVoteCandidate = () => {
    setVoteCandidates((prev) => [...prev, '']);
  };

  const handleRemoveVoteCandidate = (index: number) => {
    if (voteCandidates.length <= 2) {
      setError('A votação precisa de pelo menos 2 opções.');
      return;
    }
    setError(null);
    setVoteCandidates((prev) => prev.filter((_, i) => i !== index));
  };

  const handleVoteCandidateChange = (index: number, val: string) => {
    setError(null);
    setVoteCandidates((prev) => {
      const updated = [...prev];
      updated[index] = val;
      return updated;
    });
  };

  const handleSubmitVoteForm = async (shouldOpen: boolean) => {
    setError(null);

    if (!canDepartmentHaveAssociates(originalPoll.sourceDepartmentId || originalPoll.question)) {
      setError(`O departamento "${originalPoll.question}" não permite a votação de associados (Regra Oficial).`);
      return;
    }

    const cleanQuestion = voteQuestion.trim();
    if (!cleanQuestion) {
      setError('Informe o título da pauta de associados.');
      return;
    }

    const cleanCandidates = voteCandidates
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cleanCandidates.length < 2) {
      setError('Adicione pelo menos 2 candidatos para a votação de associados.');
      return;
    }

    // Validation: titular should NOT be in associates candidates
    if (titularName) {
      const titularLower = titularName.toLowerCase();
      const hasTitular = cleanCandidates.some(
        (c) => c.toLowerCase() === titularLower
      );
      if (hasTitular) {
        setError(
          `O titular nomeado "${titularName}" não deve ser incluído na votação de associados.`
        );
        return;
      }
    }

    // Check duplicate names
    const duplicates = cleanCandidates.filter(
      (item, index) => cleanCandidates.indexOf(item) !== index
    );
    if (duplicates.length > 0) {
      setError(`Nome duplicado encontrado: "${duplicates[0]}".`);
      return;
    }

    if (voteAllowMultiple) {
      if (voteMaxChoices < 1 || isNaN(voteMaxChoices)) {
        setError('O número de escolhas deve ser pelo menos 1.');
        return;
      }
      if (voteMaxChoices > cleanCandidates.length) {
        setError(
          `O limite de escolhas (${voteMaxChoices}) não pode ser maior que o número de opções (${cleanCandidates.length}).`
        );
        return;
      }
    }

    try {
      await onSubmitVote(
        cleanQuestion,
        cleanCandidates,
        voteAllowMultiple,
        voteAllowMultiple ? voteMaxChoices : 1,
        shouldOpen
      );
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar votação de associados.');
    }
  };

  return (
    <div
      id="modal-associados-backdrop"
      className="fixed inset-0 z-50 bg-[#111827]/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="modal-associados-card"
        className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-[#E5E7EB] space-y-5 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3.5 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#F3F4F6] text-[#111827] flex items-center justify-center border border-[#E5E7EB] shrink-0">
              <Users className="w-5 h-5 text-[#111827]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#111827] uppercase tracking-tight">
                {activeMode === 'DIRECT' ? 'Associados do Departamento' : 'Votação de Associados'}
              </h3>
              <p className="text-xs text-[#6B7280]">
                {activeMode === 'DIRECT'
                  ? 'Cadastre os nomes escolhidos diretamente pelo titular.'
                  : 'Configure a votação excepcional para associados.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F3F4F6] rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Titular Nomeado Display */}
        {titularName && (
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#9CA3AF] block">
                Departamento: {baseCargo || originalPoll.question}
              </span>
              <span className="text-sm font-extrabold text-[#111827] truncate block mt-0.5">
                Titular: {titularName}
              </span>
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Eleito(a)</span>
            </div>
          </div>
        )}

        {/* Success notification */}
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* ========================================================
            MODO 1 (PADRÃO): CADASTRO DIRETO DE ASSOCIADOS
           ======================================================== */}
        {activeMode === 'DIRECT' && (
          <div className="space-y-4">
            <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3 text-xs text-[#4B5563] leading-relaxed">
              O titular eleito informa quem serão seus associados. Digite os nomes abaixo para salvá-los diretamente junto deste titular (sem necessidade de votação).
            </div>

            {/* List of Direct Associates */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider">
                  Associados Escolhidos ({directAssociates.filter((n) => n.trim().length > 0).length})
                </label>
                <span className="text-[10px] text-[#9CA3AF] font-medium">
                  Informados pelo titular
                </span>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {directAssociates.map((assoc, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-6 text-center font-mono text-xs text-[#9CA3AF] font-bold shrink-0">
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      value={assoc}
                      onChange={(e) => handleDirectAssociateChange(idx, e.target.value)}
                      placeholder={`Nome do associado ${idx + 1}`}
                      style={{ WebkitAppearance: 'none' }}
                      className="flex-1 px-3.5 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm font-medium text-[#111827] outline-none focus:outline-none focus:border-[#111827] focus:ring-0 transition-colors shadow-none appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveDirectAssociate(idx)}
                      title="Remover este associado"
                      className="p-2 text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddDirectAssociate}
                className="w-full py-2 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#374151] rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-[#E5E7EB]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Mais um Associado</span>
              </button>
            </div>

            {/* Switch to Vote Mode (Option for exceptions) */}
            <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-between">
              <span className="text-xs text-[#6B7280]">
                A comissão decidiu colocar os associados em votação?
              </span>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setVoteAllowMultiple(false);
                  setVoteMaxChoices(1);
                  setActiveMode('VOTE');
                }}
                className="text-xs font-bold text-[#111827] hover:underline cursor-pointer flex items-center gap-1 shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Realizar Votação</span>
              </button>
            </div>

            {/* Footer Actions for Direct Mode */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-3 border-t border-[#E5E7EB]">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSaveDirect}
                className="w-full sm:w-auto px-5 py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>{isSubmitting ? 'Salvando...' : 'Salvar Associados'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================
            MODO 2 (EXCEÇÃO): VOTAÇÃO DE ASSOCIADOS
           ======================================================== */}
        {activeMode === 'VOTE' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
              <span>Modo Excepcional: Criando pauta para os participantes votarem nos associados.</span>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setActiveMode('DIRECT');
                }}
                className="text-xs font-bold text-amber-900 hover:underline cursor-pointer flex items-center gap-1 shrink-0 ml-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar ao Cadastro Direto</span>
              </button>
            </div>

            {/* Poll Title / Cargo */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider">
                Título da Pauta
              </label>
              <input
                type="text"
                value={voteQuestion}
                onChange={(e) => setVoteQuestion(e.target.value)}
                placeholder="Ex: ASSOCIADOS DO TESOUREIRO"
                className="w-full px-3.5 py-2.5 bg-white border border-[#D1D5DB] rounded-xl text-sm font-bold text-[#111827] focus:outline-hidden focus:border-[#111827] focus:ring-1 focus:ring-[#111827] uppercase transition-colors"
              />
            </div>

            {/* Candidates Input List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider">
                  Candidatos a Associado ({voteCandidates.filter((c) => c.trim().length > 0).length})
                </label>
                <span className="text-[10px] text-[#9CA3AF] font-medium">
                  Mínimo 2 opções para votação
                </span>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {voteCandidates.map((candidate, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-6 text-center font-mono text-xs text-[#9CA3AF] font-bold shrink-0">
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      value={candidate}
                      onChange={(e) => handleVoteCandidateChange(idx, e.target.value)}
                      placeholder={`Nome do candidato ${idx + 1}`}
                      style={{ WebkitAppearance: 'none' }}
                      className="flex-1 px-3.5 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm font-medium text-[#111827] outline-none focus:outline-none focus:border-[#111827] focus:ring-0 transition-colors shadow-none appearance-none"
                    />
                    {voteCandidates.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveVoteCandidate(idx)}
                        title="Remover candidato"
                        className="p-2 text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddVoteCandidate}
                className="w-full py-2 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#374151] rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-[#E5E7EB]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Candidato</span>
              </button>
            </div>

            {/* Voting Type (Single or Multiple Choice) */}
            <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3.5 space-y-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#6B7280] block">
                Modalidade de Escolha
              </span>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setVoteAllowMultiple(false);
                    setVoteMaxChoices(1);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold uppercase tracking-wider border text-center transition-all cursor-pointer ${
                    !voteAllowMultiple
                      ? 'bg-[#111827] text-white border-[#111827] shadow-xs'
                      : 'bg-white text-[#374151] border-[#D1D5DB] hover:bg-[#F3F4F6]'
                  }`}
                >
                  ESCOLHA ÚNICA (1 VOTO)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setVoteAllowMultiple(true);
                    if (voteMaxChoices < 2) setVoteMaxChoices(2);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold uppercase tracking-wider border text-center transition-all cursor-pointer ${
                    voteAllowMultiple
                      ? 'bg-[#111827] text-white border-[#111827] shadow-xs'
                      : 'bg-white text-[#374151] border-[#D1D5DB] hover:bg-[#F3F4F6]'
                  }`}
                >
                  MÚLTIPLA ESCOLHA
                </button>
              </div>

              {voteAllowMultiple && (
                <div className="pt-2 border-t border-[#E5E7EB] flex items-center justify-between gap-3">
                  <label className="text-xs font-medium text-[#374151]">
                    Máximo de escolhas por participante:
                  </label>
                  <div className="relative inline-block">
                    <select
                      value={voteMaxChoices || 1}
                      onChange={(e) => setVoteMaxChoices(parseInt(e.target.value, 10))}
                      className="appearance-none font-bold text-sm bg-white hover:bg-[#F3F4F6] border border-[#D1D5DB] rounded-xl px-4 py-1.5 pr-8 text-[#111827] focus:outline-hidden focus:ring-2 focus:ring-[#111827] cursor-pointer shadow-2xs"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <option key={num} value={num}>
                          {num}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-[#6B7280] absolute right-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions for Vote Mode */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-3 border-t border-[#E5E7EB]">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSubmitVoteForm(false)}
                className="w-full sm:w-auto px-4 py-2.5 bg-[#F3F4F6] hover:bg-[#E5E7EB] border border-[#E5E7EB] text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
              >
                {isSubmitting ? 'Salvando...' : 'Salvar Rascunho'}
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSubmitVoteForm(true)}
                className="w-full sm:w-auto px-5 py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>{isSubmitting ? 'Iniciando...' : 'Abrir Votação'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
