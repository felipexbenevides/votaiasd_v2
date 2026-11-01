import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  QrCode,
  RotateCcw,
  RotateCw,
  Search,
  ChevronDown,
  ChevronUp,
  FileText,
  UserCheck,
  Calendar,
  Lock,
  Unlock,
  Printer,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  ChurchNominationConfig,
  ChurchNominationsReport,
  ChurchDepartmentConsolidation,
} from '../types';
import {
  fetchChurchNominationsReport,
  saveChurchNominationConfig,
  openChurchNominations,
  closeChurchNominations,
  getAdminToken,
} from '../services/api';
import { CompactDateTimePicker } from './CompactDateTimePicker';
import { generateQrDataUrl } from '../utils/qrcode';
import { extractBaseMeetingName } from '../utils/meetingTitle';

interface AdminChurchNominationsTabProps {
  meetingCode: string;
  meetingName: string;
  congregationName?: string;
}

export const AdminChurchNominationsTab: React.FC<AdminChurchNominationsTabProps> = ({
  meetingCode,
  meetingName,
  congregationName,
}) => {
  const [config, setConfig] = useState<ChurchNominationConfig | null>(null);
  const [report, setReport] = useState<ChurchNominationsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sub-tabs: 'interest' | 'recommendations' | 'submissions'
  const [activeSubTab, setActiveSubTab] = useState<'interest' | 'recommendations' | 'submissions'>('interest');

  // Selected department for Interest tab and Recommendations tab (empty by default)
  const [selectedInterestDeptId, setSelectedInterestDeptId] = useState<string>('');
  const [selectedRecDeptId, setSelectedRecDeptId] = useState<string>('');

  // Search query within departments
  const [deptSearchQuery, setDeptSearchQuery] = useState('');

  // Expand set for "VER QUEM RECOMENDOU"
  const [expandedNomineeKeys, setExpandedNomineeKeys] = useState<Set<string>>(new Set());

  // Deadline state for form
  const [deadlineInput, setDeadlineInput] = useState('');
  const [isSavingDeadline, setIsSavingDeadline] = useState(false);

  // Actions states
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Dedicated Close Confirmation Modal
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  // Dedicated Church Consultation QR Code Modal
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErrorMessage(null);

    try {
      const data = await fetchChurchNominationsReport(meetingCode);
      setConfig(data.config);
      setReport(data.report);
      if (data.config?.deadline) {
        setDeadlineInput(data.config.deadline);
      } else {
        setDeadlineInput('');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar dados das indicações da igreja.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [meetingCode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const publicUrl = useMemo(() => {
    if (!config?.publicToken) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/indicacoes-igreja/${config.publicToken}`;
  }, [config?.publicToken]);

  // Generate QR Code data url whenever modal opens
  useEffect(() => {
    if (isQrModalOpen && publicUrl) {
      generateQrDataUrl(publicUrl)
        .then(setQrCodeDataUrl)
        .catch((err) => console.error('Erro ao gerar QR Code:', err));
    }
  }, [isQrModalOpen, publicUrl]);

  const handleCopyLink = () => {
    if (!publicUrl) return;

    const { congregation } = extractBaseMeetingName(meetingName, congregationName);
    const congregationDisplayName = congregation || congregationName || '';

    const lines = [
      '*RECOMENDAÇÕES*',
      congregationDisplayName,
      publicUrl,
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleOpenNominations = async () => {
    setIsTogglingStatus(true);
    try {
      const deadlineIso = deadlineInput && deadlineInput.trim() ? new Date(deadlineInput.trim()).toISOString() : null;
      const res = await openChurchNominations(meetingCode, deadlineIso);
      setConfig(res.config);
      await loadData(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao abrir indicações da igreja.';
      setErrorMessage(msg);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleConfirmClose = async () => {
    setIsTogglingStatus(true);
    try {
      const updated = await closeChurchNominations(meetingCode);
      setConfig(updated);
      setIsCloseModalOpen(false);
      await loadData(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao encerrar consulta da igreja.';
      setErrorMessage(msg);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleDeadlineChange = async (val: string) => {
    setDeadlineInput(val);
    setIsSavingDeadline(true);
    try {
      const deadlineIso = val && val.trim() ? new Date(val.trim()).toISOString() : null;
      const updated = await saveChurchNominationConfig(meetingCode, {
        deadline: deadlineIso,
      });
      setConfig(updated);
    } catch (err: unknown) {
      console.error('Erro ao salvar prazo:', err);
    } finally {
      setIsSavingDeadline(false);
    }
  };

  const handleOpenPdfReport = () => {
    const token = getAdminToken();
    const url = `/api/admin/meetings/${encodeURIComponent(meetingCode)}/church-nominations/pdf${
      token ? `?token=${encodeURIComponent(token)}` : ''
    }`;
    window.open(url, '_blank');
  };

  const toggleNomineeExpanded = (key: string) => {
    setExpandedNomineeKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center shadow-xs">
        <div className="w-8 h-8 border-3 border-[#111827] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
          Carregando indicações da igreja...
        </p>
      </div>
    );
  }

  const isOpen = config?.enabled && config?.status === 'OPEN';
  const isClosed = config?.status === 'CLOSED';

  // Find active consolidation for Interest
  const activeInterestDept = selectedInterestDeptId
    ? report?.departmentConsolidations.find((d) => d.departmentId === selectedInterestDeptId) || null
    : null;

  // Find active consolidation for Recommendations
  const activeRecDept = selectedRecDeptId
    ? report?.departmentConsolidations.find((d) => d.departmentId === selectedRecDeptId) || null
    : null;

  return (
    <div className="space-y-6">
      {/* 1. Header do Módulo Consultivo */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-[#111827] tracking-tight">
                RECOMENDAÇÕES DA IGREJA
              </h2>
              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-[#F3F4F6] text-[#4B5563] px-2 py-0.5 rounded-full border border-[#E5E7EB] shrink-0">
                MÓDULO CONSULTIVO
              </span>
            </div>
            {(() => {
              const { baseName, congregation } = extractBaseMeetingName(meetingName, congregationName);
              if (!baseName && !meetingName) return null;
              return (
                <p className="text-xs text-[#6B7280] mt-1">
                  Reunião: <span className="font-semibold text-[#374151]">{baseName || meetingName}</span>
                  {congregation && (
                    <>
                      {' '}| Congregação: <span className="font-semibold text-[#374151]">{congregation}</span>
                    </>
                  )}
                </p>
              );
            })()}
            <p className="text-xs text-[#6B7280] mt-1">
              Consulta pública para os membros da congregação apresentarem sugestões de liderança e manifestarem áreas de interesse para servir.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={handleOpenPdfReport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-white hover:bg-[#F9FAFB] text-[#111827] rounded-xl border border-[#D1D5DB] transition cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>EXPORTAR PDF</span>
            </button>

            <button
              id="btn-church-nominations-refresh"
              type="button"
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="p-2 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#374151] hover:text-[#111827] border border-[#E5E7EB] rounded-xl transition-all cursor-pointer shadow-2xs shrink-0 disabled:opacity-50"
              title="Atualizar recomendações da igreja"
            >
              <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Disclaimer Obrigatório */}
        <div className="text-[11px] text-[#6B7280] bg-[#F9FAFB] p-2.5 rounded-xl border border-[#E5E7EB] leading-relaxed">
          <strong>Aviso Importante:</strong> Estas informações são recomendações e manifestações da igreja e servem como subsídio para a Comissão de Nomeações. Não representam votação ou decisão oficial.
        </div>

        {errorMessage && (
          <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#DC2626] font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* 2. Card Compacto de Controle, Link Único e Prazo (2 LINHAS: STATUS EM CIMA, LINK + PRAZO EM BAIXO) */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-3.5 sm:p-4 shadow-xs space-y-3">
        {/* LINHA 1: Status da Consulta (Esquerda) + Ação (Direita) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
              Status da Consulta:
            </span>
            <span
              className={`inline-flex items-center justify-center text-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
                isOpen
                  ? 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]'
                  : isClosed
                  ? 'bg-[#111827] text-white border-[#111827]'
                  : 'bg-[#F3F4F6] text-[#4B5563] border-[#E5E7EB]'
              }`}
            >
              {isOpen && <span className="w-2 h-2 rounded-full bg-[#10B981]" />}
              {isOpen ? 'Aberto para Envios' : isClosed ? 'Indicações Encerradas' : 'Não Configurado'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isOpen ? (
              <button
                type="button"
                onClick={() => setIsCloseModalOpen(true)}
                disabled={isTogglingStatus}
                className="px-3.5 py-1.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer disabled:opacity-50 shadow-2xs shrink-0 flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>ENCERRAR CONSULTA</span>
              </button>
            ) : isClosed ? (
              <button
                type="button"
                onClick={handleOpenNominations}
                disabled={isTogglingStatus}
                className="px-3.5 py-1.5 bg-[#111827] hover:bg-[#1F2937] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer disabled:opacity-50 shadow-2xs shrink-0 flex items-center gap-1.5"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>REABRIR CONSULTA</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenNominations}
                disabled={isTogglingStatus}
                className="px-3.5 py-1.5 bg-[#111827] hover:bg-[#1F2937] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer disabled:opacity-50 shadow-2xs shrink-0 flex items-center gap-1.5"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>GERAR LINK E ABRIR</span>
              </button>
            )}
          </div>
        </div>

        {/* LINHA 2: Link Público da Igreja (58%) + Prazo (42%) lado a lado no Desktop */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          {/* Bloco Esquerdo: Link Público da Igreja (~58%) */}
          <div className="md:col-span-7 space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#4B5563] block">
              LINK PÚBLICO DA IGREJA
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={publicUrl}
                className="flex-1 min-w-0 px-3 py-2 bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl text-xs font-mono text-[#374151] select-all focus:outline-hidden"
              />
              <button
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
              <button
                type="button"
                onClick={() => setIsQrModalOpen(true)}
                className="p-2 bg-white text-[#111827] border border-[#D1D5DB] hover:bg-[#F9FAFB] rounded-xl transition cursor-pointer shrink-0 flex items-center justify-center"
                title="Exibir QR Code das Recomendações"
              >
                <QrCode className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Bloco Direito: Prazo (~42%) */}
          <div className="md:col-span-5 space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#4B5563] block">
              PRAZO / DATA E HORA LIMITE (OPCIONAL)
            </label>
            <div>
              <CompactDateTimePicker
                value={deadlineInput}
                onChange={handleDeadlineChange}
                placeholder="Sem prazo definido (Opcional)"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Indicadores Gerais */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-3.5 text-center shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] block mb-0.5">
              Total de Envios
            </span>
            <span className="text-xl font-extrabold text-[#111827]">
              {report.totalSubmissions}
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-3.5 text-center shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] block mb-0.5">
              Membros Participantes
            </span>
            <span className="text-xl font-extrabold text-[#111827]">
              {report.uniqueParticipants}
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-3.5 text-center shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] block mb-0.5">
              Manifestações de Interesse
            </span>
            <span className="text-xl font-extrabold text-[#059669]">
              {report.departmentConsolidations.reduce((acc, d) => acc + d.interestCount, 0)}
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-3.5 text-center shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] block mb-0.5">
              Recomendações Feitas
            </span>
            <span className="text-xl font-extrabold text-[#111827]">
              {report.departmentConsolidations.reduce((acc, d) => acc + d.totalMentions, 0)}
            </span>
          </div>
        </div>
      )}

      {/* 4. Sub-Navegação: Manifestações de Interesse | Recomendações | Respostas Completas */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-xs space-y-5">
        <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('interest')}
            className={`pb-2 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'interest'
                ? 'border-[#111827] text-[#111827]'
                : 'border-transparent text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>MANIFESTAÇÕES DE INTERESSE</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('recommendations')}
            className={`pb-2 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'recommendations'
                ? 'border-[#111827] text-[#111827]'
                : 'border-transparent text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>RECOMENDAÇÕES</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('submissions')}
            className={`pb-2 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'submissions'
                ? 'border-[#111827] text-[#111827]'
                : 'border-transparent text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>RESPOSTAS COMPLETAS ({report?.totalSubmissions || 0})</span>
          </button>
        </div>

        {/* ========================================================
            SUB-TAB 1: MANIFESTAÇÕES DE INTERESSE
           ======================================================== */}
        {activeSubTab === 'interest' && (
          <div className="space-y-4">
            {/* Seletor de Departamento */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-xs font-bold uppercase tracking-wider text-[#4B5563] shrink-0">
                Selecionar Departamento:
              </label>
              <select
                value={selectedInterestDeptId}
                onChange={(e) => setSelectedInterestDeptId(e.target.value)}
                className="flex-1 px-3 py-2 bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl text-xs font-bold text-[#111827] focus:outline-none focus:border-[#111827]"
              >
                <option value="">Selecione um departamento...</option>
                {report?.departmentConsolidations.map((dept) => (
                  <option key={dept.departmentId} value={dept.departmentId}>
                    {dept.departmentName} ({dept.interestCount} {dept.interestCount === 1 ? 'interessado' : 'interessados'})
                  </option>
                ))}
              </select>
            </div>

            {/* Resultado do Departamento Selecionado */}
            {!selectedInterestDeptId ? (
              <div className="bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB] p-8 text-center text-xs text-[#6B7280]">
                Selecione um departamento para visualizar as manifestações de interesse.
              </div>
            ) : activeInterestDept ? (
              <div className="bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB] p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E7EB] pb-3">
                  <div>
                    <h3 className="text-base font-bold text-[#111827]">
                      MANIFESTAÇÕES DE INTERESSE — {activeInterestDept.departmentName.toUpperCase()}
                    </h3>
                    <p className="text-xs text-[#6B7280]">
                      Membros que declararam interesse em servir nesta área.
                    </p>
                  </div>
                  <span className="text-xs font-extrabold uppercase tracking-wider bg-white px-3 py-1 rounded-full border border-[#D1D5DB] text-[#059669]">
                    Total: {activeInterestDept.interestCount}{' '}
                    {activeInterestDept.interestCount === 1 ? 'pessoa' : 'pessoas'}
                  </span>
                </div>

                {activeInterestDept.interestedParticipants && activeInterestDept.interestedParticipants.length > 0 ? (
                  <div className="divide-y divide-[#E5E7EB]">
                    {activeInterestDept.interestedParticipants.map((name, idx) => (
                      <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#111827]">{name}</span>
                        <span className="text-[11px] font-medium text-[#059669] bg-[#ECFDF5] px-2 py-0.5 rounded-md border border-[#A7F3D0]">
                          Declarou interesse
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-[#9CA3AF] italic">
                    Nenhum membro declarou interesse neste departamento até o momento.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* ========================================================
            SUB-TAB 2: RECOMENDAÇÕES
           ======================================================== */}
        {activeSubTab === 'recommendations' && (
          <div className="space-y-4">
            {/* Seletor de Departamento */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-xs font-bold uppercase tracking-wider text-[#4B5563] shrink-0">
                Selecionar Departamento:
              </label>
              <select
                value={selectedRecDeptId}
                onChange={(e) => setSelectedRecDeptId(e.target.value)}
                className="flex-1 px-3 py-2 bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl text-xs font-bold text-[#111827] focus:outline-none focus:border-[#111827]"
              >
                <option value="">Selecione um departamento...</option>
                {report?.departmentConsolidations.map((dept) => (
                  <option key={dept.departmentId} value={dept.departmentId}>
                    {dept.departmentName} ({dept.totalMentions} {dept.totalMentions === 1 ? 'recomendação' : 'recomendações'})
                  </option>
                ))}
              </select>
            </div>

            {/* Resultado do Departamento Selecionado */}
            {!selectedRecDeptId ? (
              <div className="bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB] p-8 text-center text-xs text-[#6B7280]">
                Selecione um departamento para visualizar as recomendações.
              </div>
            ) : activeRecDept ? (
              <div className="bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB] p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E7EB] pb-3">
                  <div>
                    <h3 className="text-base font-bold text-[#111827]">
                      RECOMENDAÇÕES — {activeRecDept.departmentName.toUpperCase()}
                    </h3>
                    <p className="text-xs text-[#6B7280]">
                      Quem foi recomendado pela membresia para este departamento.
                    </p>
                  </div>
                  <span className="text-xs font-extrabold uppercase tracking-wider bg-white px-3 py-1 rounded-full border border-[#D1D5DB] text-[#111827]">
                    Total: {activeRecDept.totalMentions}{' '}
                    {activeRecDept.totalMentions === 1 ? 'recomendação' : 'recomendações'}
                  </span>
                </div>

                {activeRecDept.nominees.length > 0 ? (
                  <div className="space-y-2.5">
                    {activeRecDept.nominees.map((nom, idx) => {
                      const expandKey = `${activeRecDept.departmentId}_${nom.normalizedName}`;
                      const isExpanded = expandedNomineeKeys.has(expandKey);

                      return (
                        <div
                          key={idx}
                          className="bg-white rounded-xl border border-[#E5E7EB] p-3.5 space-y-2 shadow-2xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-[#111827]">
                              {nom.personName}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-[#111827] bg-[#F3F4F6] px-2.5 py-1 rounded-lg border border-[#E5E7EB]">
                                {nom.count} {nom.count === 1 ? 'recomendação' : 'recomendações'}
                              </span>

                              <button
                                type="button"
                                onClick={() => toggleNomineeExpanded(expandKey)}
                                className="text-xs font-bold text-[#4B5563] hover:text-[#111827] underline cursor-pointer"
                              >
                                {isExpanded ? 'Ocultar' : 'VER QUEM RECOMENDOU'}
                              </button>
                            </div>
                          </div>

                          {/* Lista expandida de quem recomendou */}
                          {isExpanded && (
                            <div className="pt-2 border-t border-[#F3F4F6] text-xs">
                              <span className="font-bold text-[#6B7280] block mb-1">
                                Recomendado por:
                              </span>
                              <div className="text-[#374151] pl-2 border-l-2 border-[#D1D5DB]">
                                {nom.recommenders && nom.recommenders.length > 0
                                  ? nom.recommenders.join(', ')
                                  : 'Informação não registrada nos envios.'}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-[#9CA3AF] italic">
                    Nenhuma pessoa recomendada para este departamento até o momento.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* ========================================================
            SUB-TAB 3: RESPOSTAS COMPLETAS
           ======================================================== */}
        {activeSubTab === 'submissions' && (
          <div className="space-y-3">
            {!report?.submissions || report.submissions.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#6B7280]">
                Nenhuma resposta individual recebida até o momento.
              </div>
            ) : (
              report.submissions.map((sub) => (
                <div
                  key={sub.id}
                  className="p-4 rounded-2xl bg-[#F9FAFB] border border-[#E5E7EB] space-y-2.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[#111827]">
                      {sub.participantName}
                    </span>
                    <span className="text-[10px] text-[#6B7280]">
                      {new Date(sub.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>

                  {sub.selectedDepartments.length > 0 && (
                    <div>
                      <span className="font-semibold text-[#4B5563]">
                        Áreas de Interesse:{' '}
                      </span>
                      <span className="text-[#111827]">
                        {sub.selectedDepartments.join(', ')}
                      </span>
                    </div>
                  )}

                  {sub.nominations.length > 0 && (
                    <div>
                      <span className="font-semibold text-[#4B5563]">
                        Recomendações Feitas:{' '}
                      </span>
                      <div className="mt-1 pl-2 border-l-2 border-[#D1D5DB] space-y-1">
                        {sub.nominations.map((nom, i) => (
                          <div key={i} className="text-[#374151]">
                            • <strong className="text-[#111827]">{nom.personName}</strong>{' '}
                            para{' '}
                            <span className="text-[#4B5563]">
                              {nom.departmentName || nom.departmentId}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ========================================================
          MODAL: CONFIRMAÇÃO DE ENCERRAMENTO DA CONSULTA (ITEM 8)
         ======================================================== */}
      {isCloseModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#E5E7EB] p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center mx-auto text-[#DC2626]">
              <Lock className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#111827]">
                ENCERRAR CONSULTA?
              </h3>
              <p className="text-xs text-[#6B7280] mt-2 leading-relaxed">
                Após o encerramento, não será possível enviar ou alterar recomendações. As informações já recebidas permanecerão disponíveis para consulta.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsCloseModalOpen(false)}
                disabled={isTogglingStatus}
                className="w-1/2 py-2.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={handleConfirmClose}
                disabled={isTogglingStatus}
                className="w-1/2 py-2.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isTogglingStatus ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Encerrando...</span>
                  </>
                ) : (
                  <span>ENCERRAR CONSULTA</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL DEDICADO: QR CODE DAS RECOMENDAÇÕES DA IGREJA (ITENS 10, 11)
         ======================================================== */}
      {isQrModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#E5E7EB] p-6 sm:p-7 max-w-sm w-full shadow-2xl space-y-4 text-center">
            <div className="flex items-center justify-between border-b border-[#F3F4F6] pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#111827]">
                RECOMENDAÇÕES DA IGREJA
              </span>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(false)}
                className="p-1 text-[#9CA3AF] hover:text-[#111827] rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-extrabold text-[#111827]">
                ACESSO ÀS RECOMENDAÇÕES
              </h3>
              <p className="text-xs text-[#6B7280] mt-1 font-medium">
                {meetingName} — Recomendações da Igreja
              </p>
            </div>

            {/* QR Code Canvas */}
            <div className="p-4 bg-white border border-[#E5E7EB] rounded-2xl flex items-center justify-center mx-auto w-56 h-56 shadow-2xs">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="QR Code de Recomendações da Igreja"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-8 h-8 border-2 border-[#111827] border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            <p className="text-xs text-[#4B5563] leading-relaxed">
              Aponte a câmera para acessar o formulário de recomendações.
            </p>

            <button
              type="button"
              onClick={() => setIsQrModalOpen(false)}
              className="w-full py-2.5 bg-[#111827] hover:bg-[#1F2937] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer"
            >
              FECHAR
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
