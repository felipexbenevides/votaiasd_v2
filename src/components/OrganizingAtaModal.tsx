import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Edit2,
  Save,
  Download,
  ExternalLink,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { OrganizingAtaDocumentData } from '../types';
import {
  fetchOrganizingMeetingAta,
  saveOrganizingMeetingAtaApi,
  getOrganizingMeetingAtaHtmlUrl,
} from '../services/api';

interface OrganizingAtaModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingCode: string;
  isEmbedded?: boolean;
}

function buildOrganizingAtaVoteHeader(voteNumber: string, congregationName?: string): string {
  const cleanCong = (congregationName || '')
    .trim()
    .toUpperCase()
    .replace(/^COMISS[ÃA]O\s+ORGANIZADORA\s*[-–—:]?\s*/i, '')
    .replace(/^COMISS[ÃA]O\s+DE\s+NOMEA[ÇC][ÕO]ES\s*[-–—:]?\s*/i, '')
    .replace(/^\(+|\)+$/g, '')
    .trim();
  if (!cleanCong) {
    return `${voteNumber} COMISSÃO ORGANIZADORA — APROVAR`;
  }
  return `${voteNumber} COMISSÃO ORGANIZADORA — ${cleanCong} — APROVAR`;
}

export const OrganizingAtaModal: React.FC<OrganizingAtaModalProps> = ({
  isOpen,
  onClose,
  meetingCode,
  isEmbedded = false,
}) => {
  const [ata, setAta] = useState<OrganizingAtaDocumentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Editable form states
  const [voteCode, setVoteCode] = useState('');
  const [congregationName, setCongregationName] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [presentMembers, setPresentMembers] = useState('');
  const [membersCount, setMembersCount] = useState('');
  const [secretaryName, setSecretaryName] = useState('');
  const [membersList, setMembersList] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen && meetingCode) {
      loadAta();
    }
  }, [isOpen, meetingCode]);

  const populateFormFromData = (data: OrganizingAtaDocumentData) => {
    setAta(data);
    setVoteCode(data.voteCode);
    setCongregationName(data.congregationName || '');
    setMeetingDate(data.meetingDate || '');
    setPresentMembers(data.presentMembers || '');
    setMembersCount(data.membersCount || '');
    setSecretaryName(data.secretaryName || '');
    setMembersList(Array.isArray(data.membersList) ? [...data.membersList] : []);
  };

  const loadAta = async () => {
    setIsLoading(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const data = await fetchOrganizingMeetingAta(meetingCode);
      populateFormFromData(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar a Ata da Comissão Organizadora.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleCongregationNameChange = (newName: string) => {
    setCongregationName(newName);
    if (ata) {
      setVoteCode(buildOrganizingAtaVoteHeader(ata.voteNumber, newName));
    }
  };

  const handleSave = async () => {
    if (!ata) return;
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const cleanMembers = membersList
        .map((m) => m.trim())
        .filter((m) => m.length > 0);

      const updated = await saveOrganizingMeetingAtaApi(meetingCode, {
        voteCode: voteCode.trim(),
        congregationName: congregationName.trim(),
        meetingDate: meetingDate.trim(),
        presentMembers: presentMembers.trim(),
        membersCount: membersCount.trim(),
        secretaryName: secretaryName.trim(),
        membersList: cleanMembers,
      });
      populateFormFromData(updated);
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar alterações da Ata da Comissão Organizadora.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddMember = () => {
    setMembersList((prev) => [...prev, '']);
  };

  const handleRemoveMember = (index: number) => {
    setMembersList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateMember = (index: number, value: string) => {
    setMembersList((prev) => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  };

  const handleDownloadWord = () => {
    if (!ata) return;

    const escapeHtml = (str?: string) =>
      String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const activeVoteCode = isEditing ? voteCode : ata.voteCode;
    const activeDate = (isEditing ? meetingDate : ata.meetingDate) || '___/___/______';
    const activePresent = isEditing ? presentMembers : ata.presentMembers;
    const rawCount = (isEditing ? membersCount : ata.membersCount).trim();
    const formattedCount =
      rawCount && /^\d+$/.test(rawCount) && parseInt(rawCount, 10) > 0 && parseInt(rawCount, 10) < 10
        ? String(parseInt(rawCount, 10)).padStart(2, '0')
        : rawCount;
    const activeSecretary = isEditing ? secretaryName : ata.secretaryName;
    const activeMembers = (isEditing ? membersList : ata.membersList)
      .map((m) => m.trim())
      .filter((m) => m.length > 0);

    const membersHtml = activeMembers
      .map(
        (m) =>
          `<div style="margin-bottom: 4pt; font-family: 'Times New Roman', serif; font-size: 12pt;">${escapeHtml(
            m
          )}</div>`
      )
      .join('');

    const countPrefix = formattedCount ? `${escapeHtml(formattedCount)} ` : '';

    const fullHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Ata da Comissão Organizadora - ${escapeHtml(ata.voteNumber)}</title>
        <style>
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 12pt;
            line-height: 1.5;
            color: #000000;
          }
          .header {
            font-size: 13pt;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 18pt;
          }
          .intro {
            font-size: 12pt;
            text-align: justify;
            margin-bottom: 16pt;
          }
          .section-block {
            margin-bottom: 16pt;
            font-size: 12pt;
          }
          .section-title {
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 6pt;
          }
          .field-label {
            font-weight: bold;
            margin-bottom: 4pt;
          }
          .field-value {
            text-align: justify;
            margin-bottom: 10pt;
          }
          .signatures {
            margin-top: 48pt;
            text-align: center;
          }
          .sig-block {
            margin-bottom: 36pt;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">${escapeHtml(activeVoteCode)}</div>
        <div class="intro">
          <strong>PROPÕE-SE</strong> aprovar e registrar o relatório da Comissão Organizadora que se reuniu no dia ${escapeHtml(
            activeDate
          )}, com a presença dos seguintes membros:
        </div>

        <div class="section-block">
          <div class="field-label">Membros presentes:</div>
          <div class="field-value">${escapeHtml(activePresent)}</div>
        </div>

        <div class="section-block">
          <div class="section-title">PROPOSTA DA QUANTIDADE DE MEMBROS DA COMISSÃO DE NOMEAÇÕES:</div>
          <div class="field-value">
            ${countPrefix}membros, garantindo uma representação justa na composição da comissão de nomeações, incluindo diferentes faixas etárias e ambos os sexos, limitando a participação de um membro por núcleo familiar.
          </div>
        </div>

        <div class="section-block">
          <div class="section-title">NOMES PROPOSTOS PARA FORMAR A COMISSÃO DE NOMEAÇÕES:</div>
          <div style="margin-top: 8pt;">
            <div class="field-label">Secretário(a) da Comissão de Nomeações:</div>
            <div class="field-value">${escapeHtml(activeSecretary)}</div>
          </div>
          <div style="margin-top: 8pt;">
            <div class="field-label">Membros da Comissão de Nomeações:</div>
            <div style="margin-top: 4pt;">
              ${membersHtml}
            </div>
          </div>
        </div>

        <div class="signatures">
          <div class="sig-block">
            <div>____________________________</div>
            <div><strong>Presidente</strong></div>
          </div>
          <div class="sig-block">
            <div>____________________________</div>
            <div><strong>Secretário(a)</strong></div>
          </div>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + fullHtml], {
      type: 'application/msword',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ata_Comissao_Organizadora_${ata.voteNumber}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleOpenNewTab = () => {
    const url = getOrganizingMeetingAtaHtmlUrl(meetingCode);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const formattedDisplayCount = (() => {
    const raw = (ata?.membersCount || '').trim();
    if (raw && /^\d+$/.test(raw)) {
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n > 0 && n < 10) {
        return String(n).padStart(2, '0');
      }
    }
    return raw;
  })();

  return (
    <div
      id="modal-organizing-ata-backdrop"
      className={
        isEmbedded
          ? 'w-full'
          : 'fixed inset-0 z-50 bg-[#111827]/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto'
      }
      onClick={isEmbedded ? undefined : onClose}
    >
      <div
        id="modal-organizing-ata-card"
        className={
          isEmbedded
            ? 'bg-[#F3F4F6] rounded-2xl w-full shadow-xs border border-[#E5E7EB] flex flex-col overflow-hidden'
            : 'bg-[#F3F4F6] rounded-2xl max-w-4xl w-full max-h-[94vh] shadow-2xl border border-[#E5E7EB] flex flex-col overflow-hidden'
        }
        onClick={isEmbedded ? undefined : (e) => e.stopPropagation()}
      >
        {/* Top Control Bar */}
        <div className="bg-white border-b border-[#E5E7EB] px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#111827] text-white flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-[#111827] uppercase tracking-tight">
                  Ata da Comissão Organizadora
                </h2>
                {ata && (
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-[#F3F4F6] text-[#111827] border border-[#E5E7EB]">
                    Voto {ata.voteNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#6B7280]">
                Documento administrativo exclusivo da Comissão Organizadora • Numeração anual automática
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!isLoading && ata && (
              <>
                <button
                  type="button"
                  onClick={loadAta}
                  className="px-2.5 py-2 bg-white hover:bg-[#F3F4F6] border border-[#D1D5DB] text-[#374151] text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Sincronizar com votações encerradas da Comissão Organizadora"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Atualizar</span>
                </button>

                {!isEditing ? (
                  <button
                    id="btn-edit-organizing-ata"
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="px-3 py-2 bg-white hover:bg-[#F3F4F6] border border-[#D1D5DB] text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-[#4B5563]" />
                    <span>Editar Ata</span>
                  </button>
                ) : (
                  <button
                    id="btn-save-organizing-ata"
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    {isSaving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>{isSaving ? 'Salvando...' : 'Salvar Edição'}</span>
                  </button>
                )}

                <button
                  id="btn-download-word-organizing-ata"
                  type="button"
                  onClick={handleDownloadWord}
                  className="px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  title="Exportar como documento do Microsoft Word (.doc)"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Word (.doc)</span>
                </button>

                <button
                  id="btn-open-tab-organizing-ata"
                  type="button"
                  onClick={handleOpenNewTab}
                  className="px-3 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  title="Abrir documento para impressão em nova guia"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Nova Guia</span>
                </button>
              </>
            )}

            <button
              id="btn-close-organizing-ata"
              type="button"
              onClick={onClose}
              className="ml-auto sm:ml-1 px-2.5 py-2 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 rounded-xl flex items-center justify-center transition-colors cursor-pointer shadow-2xs shrink-0"
              title="Fechar Ata da Comissão Organizadora"
              aria-label="Fechar Ata da Comissão Organizadora"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Status / Notifications Banner */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {saveSuccess && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>Alterações da Ata da Comissão Organizadora salvas com sucesso!</span>
          </div>
        )}

        {/* Main Document Body */}
        <div
          className={
            isEmbedded
              ? 'p-3 sm:p-8 flex justify-center'
              : 'flex-1 overflow-y-auto p-3 sm:p-8 flex justify-center'
          }
        >
          {isLoading ? (
            <div className="bg-white rounded-xl border border-[#E5E7EB] w-full max-w-[780px] min-h-[500px] flex flex-col items-center justify-center p-12 text-center">
              <RefreshCw className="w-8 h-8 text-[#9CA3AF] animate-spin mb-3" />
              <p className="text-sm font-bold text-[#111827]">
                Gerando Ata da Comissão Organizadora...
              </p>
              <p className="text-xs text-[#6B7280] mt-1">
                Consolidando votações encerradas da Comissão Organizadora.
              </p>
            </div>
          ) : ata ? (
            <div className="bg-white rounded-sm shadow-lg border border-[#D1D5DB] w-full max-w-[780px] min-h-[760px] p-6 sm:p-14 text-black selection:bg-blue-100">
              {!isEditing ? (
                /* ==========================================
                   MODO VISUALIZAÇÃO (DOCUMENTO OFICIAL)
                   ========================================== */
                <div className="font-serif space-y-6 text-[#000000]">
                  {/* 4.1 TÍTULO / CABEÇALHO DO VOTO */}
                  <div className="text-base sm:text-[17px] font-bold uppercase tracking-wide text-black leading-snug">
                    {ata.voteCode}
                  </div>

                  {/* 4.2 PARÁGRAFO INTRODUTÓRIO */}
                  <p className="text-sm sm:text-[15px] leading-relaxed text-justify text-black">
                    <strong className="font-bold uppercase">PROPÕE-SE</strong> aprovar e registrar o
                    relatório da Comissão Organizadora que se reuniu no dia{' '}
                    <span className="font-medium">
                      {ata.meetingDate || '___/___/______'}
                    </span>
                    , com a presença dos seguintes membros:
                  </p>

                  {/* 4.3 MEMBROS PRESENTES (CAMPO MANUAL EDITÁVEL) */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm sm:text-[15px] font-bold text-black">
                        Membros presentes:
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="font-sans text-[11px] font-semibold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 cursor-pointer print:hidden"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>{ata.presentMembers ? 'Editar nomes' : 'Inserir nomes'}</span>
                      </button>
                    </div>
                    {ata.presentMembers && ata.presentMembers.trim().length > 0 ? (
                      <p className="text-sm sm:text-[15px] leading-relaxed text-justify text-black">
                        {ata.presentMembers}
                      </p>
                    ) : (
                      <div
                        onClick={() => setIsEditing(true)}
                        className="font-sans p-3 rounded-xl border border-dashed border-[#D1D5DB] bg-[#F9FAFB] hover:bg-[#F3F4F6] text-xs text-[#6B7280] cursor-pointer transition-colors print:hidden"
                      >
                        Clique aqui ou em &ldquo;Editar Ata&rdquo; para inserir os nomes dos membros
                        presentes separados por vírgula.
                      </div>
                    )}
                  </div>

                  {/* 4.4 PROPOSTA DA QUANTIDADE DE MEMBROS DA COMISSÃO DE NOMEAÇÕES */}
                  <div className="space-y-1.5 pt-2">
                    <div className="text-sm sm:text-[15px] font-bold uppercase text-black">
                      PROPOSTA DA QUANTIDADE DE MEMBROS DA COMISSÃO DE NOMEAÇÕES:
                    </div>
                    <p className="text-sm sm:text-[15px] leading-relaxed text-justify text-black">
                      {formattedDisplayCount ? `${formattedDisplayCount} ` : ''}membros, garantindo
                      uma representação justa na composição da comissão de nomeações, incluindo
                      diferentes faixas etárias e ambos os sexos, limitando a participação de um
                      membro por núcleo familiar.
                    </p>
                  </div>

                  {/* 4.5 NOMES PROPOSTOS PARA FORMAR A COMISSÃO DE NOMEAÇÕES */}
                  <div className="space-y-4 pt-2">
                    <div className="text-sm sm:text-[15px] font-bold uppercase text-black">
                      NOMES PROPOSTOS PARA FORMAR A COMISSÃO DE NOMEAÇÕES:
                    </div>

                    {/* Secretário(a) da Comissão de Nomeações */}
                    <div className="space-y-1">
                      <div className="text-sm sm:text-[15px] font-bold text-black">
                        Secretário(a) da Comissão de Nomeações:
                      </div>
                      {ata.secretaryName && ata.secretaryName.trim().length > 0 ? (
                        <div className="text-sm sm:text-[15px] leading-relaxed text-black">
                          {ata.secretaryName}
                        </div>
                      ) : (
                        <div className="text-xs italic text-[#6B7280] font-sans print:hidden">
                          Aguardando definição em votação ou preenchimento manual em &ldquo;Editar
                          Ata&rdquo;.
                        </div>
                      )}
                    </div>

                    {/* Membros da Comissão de Nomeações */}
                    <div className="space-y-1.5">
                      <div className="text-sm sm:text-[15px] font-bold text-black">
                        Membros da Comissão de Nomeações:
                      </div>
                      {ata.membersList.length === 0 ? (
                        <div className="text-xs italic text-[#6B7280] font-sans py-2 print:hidden">
                          Nenhum membro com votação encerrada e confirmada até o momento. Assim que
                          as pautas da Comissão Organizadora forem encerradas, os nomes eleitos
                          aparecerão automaticamente aqui.
                        </div>
                      ) : (
                        <div className="space-y-1 pt-0.5">
                          {ata.membersList.map((memberName, idx) => (
                            <div
                              key={`${memberName}-${idx}`}
                              className="text-sm sm:text-[15px] leading-relaxed text-black"
                            >
                              {memberName}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 4.6 ASSINATURAS AO FINAL DA ATA */}
                  <div className="pt-16 pb-4 flex flex-col items-center justify-center space-y-12 text-center text-black">
                    <div className="flex flex-col items-center">
                      <div className="tracking-widest text-sm sm:text-[15px]">
                        ____________________________
                      </div>
                      <div className="text-sm sm:text-[15px] font-bold mt-1">Presidente</div>
                    </div>

                    <div className="flex flex-col items-center">
                      <div className="tracking-widest text-sm sm:text-[15px]">
                        ____________________________
                      </div>
                      <div className="text-sm sm:text-[15px] font-bold mt-1">Secretário(a)</div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ==========================================
                   MODO EDIÇÃO (AJUSTE MANUAL ANTES DE IMPRIMIR/EXPORTAR)
                   ========================================== */
                <div className="space-y-6 font-sans">
                  <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-blue-800">
                      Você está no <strong>Modo de Edição da Ata da Comissão Organizadora</strong>.
                      Todos os ajustes manuais feitos abaixo ficarão salvos e preservados nesta
                      reunião.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (ata) populateFormFromData(ata);
                        setIsEditing(false);
                      }}
                      className="text-xs font-bold text-blue-700 hover:underline shrink-0 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mb-1">
                        Nome da Congregação
                      </label>
                      <input
                        type="text"
                        value={congregationName}
                        onChange={(e) => handleCongregationNameChange(e.target.value)}
                        placeholder="Ex: CENTRAL DE CARUARU"
                        className="w-full px-3.5 py-2.5 text-sm bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl text-[#111827] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mb-1">
                        Data da Reunião
                      </label>
                      <input
                        type="text"
                        value={meetingDate}
                        onChange={(e) => setMeetingDate(e.target.value)}
                        placeholder="DD/MM/AAAA"
                        className="w-full px-3.5 py-2.5 text-sm bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl text-[#111827] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mb-1">
                      Título / Código do Voto
                    </label>
                    <input
                      type="text"
                      value={voteCode}
                      onChange={(e) => setVoteCode(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm font-bold uppercase bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl text-[#111827] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mb-1">
                      Membros presentes (separados por vírgula)
                    </label>
                    <textarea
                      rows={3}
                      value={presentMembers}
                      onChange={(e) => setPresentMembers(e.target.value)}
                      placeholder="Ex: João Silva, Maria Oliveira, Pedro Santos..."
                      className="w-full px-3.5 py-2.5 text-sm bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl text-[#111827] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mb-1">
                        Quantidade Proposta de Membros
                      </label>
                      <input
                        type="text"
                        value={membersCount}
                        onChange={(e) => setMembersCount(e.target.value)}
                        placeholder="Ex: 09"
                        className="w-full px-3.5 py-2.5 text-sm bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl text-[#111827] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827]"
                      />
                      <p className="text-[11px] text-[#6B7280] mt-1">
                        Preenchido automaticamente quando houver pauta encerrada sobre a quantidade,
                        ou informe manualmente.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mb-1">
                        Secretário(a) da Comissão de Nomeações
                      </label>
                      <input
                        type="text"
                        value={secretaryName}
                        onChange={(e) => setSecretaryName(e.target.value)}
                        placeholder="Nome do(a) Secretário(a)"
                        className="w-full px-3.5 py-2.5 text-sm bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl text-[#111827] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827]"
                      />
                    </div>
                  </div>

                  {/* Membros da Comissão de Nomeações Editable List */}
                  <div className="space-y-3 pt-2 border-t border-[#E5E7EB]">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#111827]">
                        Membros da Comissão de Nomeações ({membersList.length})
                      </label>
                      <button
                        type="button"
                        onClick={handleAddMember}
                        className="px-3 py-1.5 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar Nome</span>
                      </button>
                    </div>

                    {membersList.length === 0 ? (
                      <div className="p-6 bg-[#F9FAFB] border border-dashed border-[#D1D5DB] rounded-xl text-center text-xs text-[#6B7280]">
                        Nenhum membro listado. Os nomes aprovados nas votações da Comissão
                        Organizadora são inseridos automaticamente, ou clique em &ldquo;Adicionar
                        Nome&rdquo;.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {membersList.map((member, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={member}
                              onChange={(e) => handleUpdateMember(idx, e.target.value)}
                              placeholder="Nome do membro da Comissão de Nomeações"
                              className="flex-1 px-3.5 py-2 text-sm bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl text-[#111827] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#111827]"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(idx)}
                              className="p-2 text-[#9CA3AF] hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Remover nome da Ata"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-[#E5E7EB] flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (ata) populateFormFromData(ata);
                        setIsEditing(false);
                      }}
                      className="px-4 py-2 border border-[#D1D5DB] text-[#4B5563] hover:text-[#111827] text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
                    >
                      {isSaving ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      <span>Salvar Alterações</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
