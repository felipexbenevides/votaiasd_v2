import React, { useState, useEffect } from 'react';
import {
  X,
  FileDown,
  Edit3,
  Check,
  ExternalLink,
  Save,
  AlertCircle,
  CheckCircle2,
  FileText,
  Plus,
  RotateCcw,
  RotateCw,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { AtaDocumentData } from '../types';
import { fetchMeetingAta, saveMeetingAtaApi, getMeetingAtaHtmlUrl } from '../services/api';

interface AtaModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingCode: string | null;
  isEmbedded?: boolean;
}

export const AtaModal: React.FC<AtaModalProps> = ({
  isOpen,
  onClose,
  meetingCode,
  isEmbedded = false,
}) => {
  const [ata, setAta] = useState<AtaDocumentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editCommissionName, setEditCommissionName] = useState('');
  const [editVoteCode, setEditVoteCode] = useState('');
  const [editPeriod, setEditPeriod] = useState('');
  const [editIntroText, setEditIntroText] = useState('');
  const [editDepartments, setEditDepartments] = useState<
    { departmentId?: string; departmentName: string; titularName: string; associates?: string[] }[]
  >([]);

  useEffect(() => {
    if ((isOpen || isEmbedded) && meetingCode) {
      loadAta(meetingCode);
    } else if (!isEmbedded) {
      setAta(null);
      setIsEditing(false);
      setError(null);
      setSuccessMessage(null);
    }
  }, [isOpen, meetingCode, isEmbedded]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const loadAta = async (code: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchMeetingAta(code);
      setAta(data);
      populateEditFields(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar Ata da Comissão de Nomeações.');
    } finally {
      setIsLoading(false);
    }
  };

  const populateEditFields = (data: AtaDocumentData) => {
    setEditCommissionName(data.commissionName || '');
    setEditVoteCode(data.voteCode);
    setEditPeriod(data.period);
    setEditIntroText(data.introText);
    const validDepts = (data.departments || []).filter(
      (d) => d.departmentName.trim().length > 0 || d.titularName.trim().length > 0
    );
    setEditDepartments(
      validDepts.map((d) => ({
        departmentId: d.departmentId,
        departmentName: d.departmentName,
        titularName: d.titularName,
        associates: d.associates ? [...d.associates] : undefined,
      }))
    );
  };

  const formatCommissionHeader = (voteNum: string, commName: string): string => {
    if (!commName || !commName.trim()) {
      return `${voteNum} COMISSÃO DE NOMEAÇÕES – APROVAR`;
    }
    const clean = commName.trim().toUpperCase();
    if (clean.startsWith('COMISSÃO DE NOMEAÇÕES') || clean.startsWith('COMISSAO DE NOMEACOES')) {
      return `${voteNum} ${clean} – APROVAR`;
    }
    return `${voteNum} COMISSÃO DE NOMEAÇÕES ${clean} – APROVAR`;
  };

  const handleAddDepartment = () => {
    setEditDepartments((prev) => [
      ...prev,
      {
        departmentName: '',
        titularName: '',
        associates: undefined,
      },
    ]);
  };

  const handleRemoveDepartment = (indexToRemove: number) => {
    setEditDepartments((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleMoveDepartmentBlock = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= editDepartments.length) return;
    setEditDepartments((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  };

  const handleSaveEdits = async () => {
    if (!meetingCode || !ata) return;
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Filter out completely empty blocks
      const cleanDepts = editDepartments
        .filter(
          (d) => d.departmentName.trim().length > 0 || d.titularName.trim().length > 0
        )
        .map((d) => ({
          departmentId: d.departmentId,
          departmentName: d.departmentName.trim(),
          titularName: d.titularName.trim(),
          associates: d.associates
            ? d.associates.map((a) => a.trim()).filter((a) => a.length > 0)
            : undefined,
        }));

      const updated = await saveMeetingAtaApi(meetingCode, {
        commissionName: editCommissionName.trim() || undefined,
        voteCode: editVoteCode.trim(),
        period: editPeriod.trim(),
        introText: editIntroText.trim(),
        departments: cleanDepts,
      });

      setAta(updated);
      populateEditFields(updated);
      setIsEditing(false);
      setSuccessMessage('Ata salva com sucesso!');
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar alterações da Ata.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenNewTab = () => {
    if (!meetingCode) return;
    const url = getMeetingAtaHtmlUrl(meetingCode);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadWord = () => {
    if (!ata) return;
    const header =
      "<html xmlns:o='urn:schemas-microsoft-com:office:office' " +
      "xmlns:w='urn:schemas-microsoft-com:office:word' " +
      "xmlns='http://www.w3.org/TR/REC-html40'>" +
      "<head><meta charset='utf-8'><title>Ata da Comissão de Nomeações</title>" +
      "<style>body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; color: #000000; text-align: justify; margin: 2.5cm; } strong { font-weight: bold; } p { margin-bottom: 12pt; text-align: justify; text-indent: 0; } .header-code { font-weight: bold; margin-bottom: 14pt; } .dept-block { margin-bottom: 10pt; line-height: 1.4; } .assoc-block { margin-left: 20pt; margin-top: 2pt; font-size: 12pt; } </style></head><body>";
    const footer = '</body></html>';

    const validDepts = (ata.departments || []).filter(
      (d) => d.departmentName.trim().length > 0 && d.titularName.trim().length > 0
    );

    const deptsHtml = validDepts
      .map(
        (d) => `
        <div class="dept-block">
          <div><strong>${d.departmentName}:</strong> ${d.titularName}</div>
          ${
            d.associates && d.associates.length > 0
              ? `<div><strong>Associados:</strong> ${d.associates.join(', ')}</div>`
              : ''
          }
        </div>
      `
      )
      .join('');

    const bodyHtml = `
      <div class="header-code">${ata.voteCode}</div>
      <p>${ata.introText}</p>
      <div>${deptsHtml}</div>
    `;

    const fullHtml = header + bodyHtml + footer;
    const blob = new Blob(['\ufeff' + fullHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ata_Comissao_Nomeacoes_${ata.voteNumber}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen && !isEmbedded) return null;

  // Render list of clean display departments
  const displayDepartments = (ata?.departments || []).filter(
    (d) => d.departmentName.trim().length > 0 && d.titularName.trim().length > 0
  );

  const content = (
    <div
      id="modal-ata-container"
      className={`bg-[#F3F4F6] rounded-2xl w-full flex flex-col ${
        isEmbedded ? 'shadow-xs border border-[#E5E7EB] max-w-5xl mx-auto' : 'max-w-4xl shadow-2xl border border-[#D1D5DB] my-auto max-h-[92vh]'
      } overflow-hidden`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Header with Title and Dedicated Close X Button (Extreme Right) */}
      <div className="bg-white px-4 sm:px-6 py-3.5 border-b border-[#E5E7EB] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#111827] text-white flex items-center justify-center shrink-0 shadow-xs">
            <FileText className="w-4 h-4" />
          </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-[#111827] truncate uppercase tracking-tight">
                  Ata da Comissão de Nomeações {ata ? `(${ata.voteNumber})` : ''}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#4B5563] mt-0.5">
                {ata?.commissionName && (
                  <div>
                    <span className="text-[#6B7280]">Congregação:</span>{' '}
                    <strong className="text-[#111827]">{ata.commissionName}</strong>
                  </div>
                )}
                {meetingCode && (
                  <div className={ata?.commissionName ? "border-l border-[#D1D5DB] pl-3 flex items-center gap-1" : "flex items-center gap-1"}>
                    <span className="text-[#6B7280]">Código:</span>
                    <strong className="font-mono text-[#111827] bg-[#F3F4F6] px-1.5 py-0.5 rounded border border-[#E5E7EB]">{meetingCode}</strong>
                  </div>
                )}
              </div>
            </div>
        </div>

        {/* Close X Button (Extreme Right) */}
        <button
          id="btn-close-ata-modal"
          type="button"
          onClick={onClose}
          className="p-2 text-[#9CA3AF] hover:text-[#DC2626] bg-[#F9FAFB] hover:bg-[#FEF2F2] border border-[#E5E7EB] hover:border-[#FECACA] rounded-xl transition-all cursor-pointer shadow-2xs shrink-0"
          title={isEmbedded ? "Fechar e voltar ao Início" : "Fechar janela da Ata (Esc)"}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

        {/* Action Buttons Toolbar */}
        <div className="bg-[#FAFAFA] px-4 sm:px-6 py-2.5 border-b border-[#E5E7EB] flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="btn-ata-download-word"
              type="button"
              onClick={handleDownloadWord}
              disabled={isLoading || !ata}
              className="px-3.5 py-1.5 bg-[#1E40AF] hover:bg-[#1E3A8A] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              title="Exportar para Microsoft Word (.doc)"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Word (.doc)</span>
            </button>

            {!isEditing ? (
              <button
                id="btn-ata-edit-toggle"
                type="button"
                onClick={() => setIsEditing(true)}
                disabled={isLoading || !ata}
                className="px-3.5 py-1.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                title="Habilitar edição do texto da ata"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
            ) : (
              <button
                id="btn-ata-save-edits"
                type="button"
                onClick={handleSaveEdits}
                disabled={isSaving}
                className="px-3.5 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                title="Salvar alterações no texto da ata"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Salvando...' : 'Salvar'}</span>
              </button>
            )}

            <button
              id="btn-ata-refresh"
              type="button"
              onClick={() => meetingCode && loadAta(meetingCode)}
              disabled={isLoading || !meetingCode}
              className="p-2 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#374151] hover:text-[#111827] border border-[#E5E7EB] rounded-xl transition-all cursor-pointer shadow-2xs shrink-0 disabled:opacity-50"
              title="Atualizar dados da Ata do servidor"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <button
            id="btn-ata-open-tab"
            type="button"
            onClick={handleOpenNewTab}
            disabled={isLoading || !meetingCode}
            className="px-2.5 py-1.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5 shrink-0"
            title="Abrir visualização em Nova Aba independente"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nova Aba</span>
          </button>
        </div>

        {/* Notifications & Status */}
        {successMessage && (
          <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 px-6 py-2 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-b border-red-200 text-red-700 px-6 py-2 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Scrollable Document Preview Area */}
        <div className="p-2 sm:p-6 md:p-8 overflow-y-auto flex-1 flex justify-center bg-[#525659]/10">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-16 space-y-3">
              <div className="w-7 h-7 border-2 border-[#111827] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-[#6B7280] font-medium">
                Carregando dados da Ata...
              </span>
            </div>
          ) : !ata ? (
            <div className="p-12 text-center text-xs text-[#6B7280]">
              Não foi possível carregar a ata desta reunião.
            </div>
          ) : (
            /* Official Paper Document Styling */
            <div
              id="ata-printable-sheet"
              className="bg-white w-full max-w-2xl p-6 sm:p-12 md:p-16 shadow-lg border border-[#D1D5DB] rounded-xs space-y-6 text-black font-serif"
              style={{
                fontFamily: "'Times New Roman', Times, 'Liberation Serif', Georgia, serif",
                fontSize: '12pt',
                lineHeight: 1.5,
              }}
            >
              {/* Header Title / Voto Code */}
              {!isEditing ? (
                <div className="text-[14pt] font-bold uppercase tracking-tight text-black">
                  {ata.voteCode}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-sans font-bold uppercase tracking-wider text-[#6B7280]">
                      Nome da Congregação:
                    </label>
                    <input
                      type="text"
                      value={editCommissionName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditCommissionName(val);
                        if (ata) {
                          setEditVoteCode(formatCommissionHeader(ata.voteNumber, val));
                        }
                      }}
                      placeholder="Ex: Igreja Central de Caruaru"
                      className="w-full font-serif font-bold text-sm p-2 bg-[#F9FAFB] border border-[#3B82F6] rounded-lg outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-sans font-bold uppercase tracking-wider text-[#6B7280]">
                      Título do Voto (Cabeçalho formatado):
                    </label>
                    <input
                      type="text"
                      value={editVoteCode}
                      onChange={(e) => setEditVoteCode(e.target.value)}
                      className="w-full font-serif font-bold text-base p-2 bg-[#F9FAFB] border border-[#3B82F6] rounded-lg outline-none uppercase"
                    />
                  </div>
                </div>
              )}

              {/* Introductory Paragraph */}
              {!isEditing ? (
                <p className="text-sm sm:text-base text-justify leading-relaxed">
                  <strong className="font-bold">VOTADO</strong> aprovar e registrar o relatório da
                  Comissão de Nomeações para o período{' '}
                  <strong className="font-bold">{ata.period}</strong>, conforme detalhado abaixo:
                </p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-sans font-bold uppercase tracking-wider text-[#6B7280]">
                      Período:
                    </label>
                    <input
                      type="text"
                      value={editPeriod}
                      onChange={(e) => setEditPeriod(e.target.value)}
                      className="w-32 font-serif text-sm p-1.5 bg-[#F9FAFB] border border-[#3B82F6] rounded-lg outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-sans font-bold uppercase tracking-wider text-[#6B7280]">
                      Texto do Voto:
                    </label>
                    <textarea
                      rows={3}
                      value={editIntroText}
                      onChange={(e) => setEditIntroText(e.target.value)}
                      className="w-full font-serif text-sm p-2 bg-[#F9FAFB] border border-[#3B82F6] rounded-lg outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Departments and Elected Nominees */}
              <div className="pt-2 space-y-4">
                {!isEditing ? (
                  displayDepartments.length === 0 ? (
                    <div className="py-8 text-center italic text-sm text-[#6B7280] border border-dashed border-[#D1D5DB] rounded-lg">
                      Nenhum departamento com titular eleito registrado nesta reunião até o momento.
                    </div>
                  ) : (
                    displayDepartments.map((dept, idx) => (
                      <div key={dept.departmentId || idx} className="text-[12pt] leading-[1.5] text-black space-y-1">
                        <div>
                          <strong className="font-bold">{dept.departmentName}:</strong>{' '}
                          <span>{dept.titularName}</span>
                        </div>
                        {dept.associates && dept.associates.length > 0 && (
                          <div className="text-[12pt] text-black">
                            <strong className="font-bold">Associados:</strong>{' '}
                            <span>{dept.associates.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    ))
                  )
                ) : (
                  <div className="space-y-4">
                    {editDepartments.map((dept, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl space-y-2.5 text-sm relative group"
                      >
                        {/* Header of Block with Move Up/Down & Delete X Button */}
                        <div className="flex items-center justify-between pb-1 border-b border-[#E5E7EB]">
                          <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-[#6B7280]">
                            Bloco #{idx + 1} {dept.departmentName ? `— ${dept.departmentName}` : ''}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveDepartmentBlock(idx, idx - 1)}
                              disabled={idx === 0}
                              className="p-1 text-[#6B7280] hover:text-[#111827] hover:bg-[#E5E7EB] disabled:opacity-30 disabled:pointer-events-none rounded-lg transition-colors cursor-pointer"
                              title="Mover bloco para cima"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveDepartmentBlock(idx, idx + 1)}
                              disabled={idx === editDepartments.length - 1}
                              className="p-1 text-[#6B7280] hover:text-[#111827] hover:bg-[#E5E7EB] disabled:opacity-30 disabled:pointer-events-none rounded-lg transition-colors cursor-pointer"
                              title="Mover bloco para baixo"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveDepartment(idx)}
                              className="p-1 text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Remover este bloco da Ata"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-sans font-semibold text-[#6B7280]">
                              Departamento:
                            </label>
                            <input
                              type="text"
                              placeholder="Ex: Escola Sabatina"
                              value={dept.departmentName}
                              onChange={(e) => {
                                const updated = [...editDepartments];
                                updated[idx].departmentName = e.target.value;
                                setEditDepartments(updated);
                              }}
                              className="w-full font-serif font-bold text-sm p-1.5 bg-white border border-[#D1D5DB] rounded-lg outline-none focus:border-[#3B82F6]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-sans font-semibold text-[#6B7280]">
                              Titular Eleito:
                            </label>
                            <input
                              type="text"
                              placeholder="Ex: Pedro"
                              value={dept.titularName}
                              onChange={(e) => {
                                const updated = [...editDepartments];
                                updated[idx].titularName = e.target.value;
                                setEditDepartments(updated);
                              }}
                              className="w-full font-serif text-sm p-1.5 bg-white border border-[#D1D5DB] rounded-lg outline-none focus:border-[#3B82F6]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-sans font-semibold text-[#6B7280]">
                            Associados (separados por vírgula, opcional):
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: João, Maria"
                            value={dept.associates ? dept.associates.join(', ') : ''}
                            onChange={(e) => {
                              const updated = [...editDepartments];
                              const raw = e.target.value;
                              if (raw.trim().length === 0) {
                                updated[idx].associates = undefined;
                              } else {
                                updated[idx].associates = raw
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter((s) => s.length > 0);
                              }
                              setEditDepartments(updated);
                            }}
                            className="w-full font-serif text-sm p-1.5 bg-white border border-[#D1D5DB] rounded-lg outline-none focus:border-[#3B82F6]"
                          />
                        </div>
                      </div>
                    ))}

                    {/* Button to Add New Department */}
                    <div className="pt-2 flex justify-start">
                      <button
                        type="button"
                        onClick={handleAddDepartment}
                        className="px-3.5 py-2 bg-white border border-dashed border-[#9CA3AF] hover:border-[#111827] hover:bg-[#F3F4F6] text-[#374151] hover:text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#111827]" />
                        <span>Adicionar Departamento</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );

  if (isEmbedded) {
    return content;
  }

  return (
    <div
      id="modal-ata-backdrop"
      className="fixed inset-0 z-50 bg-[#111827]/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      {content}
    </div>
  );
};
