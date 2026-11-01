import React, { useEffect, useState } from 'react';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { generateQrDataUrl } from '../utils/qrcode';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingCode: string;
  meetingName: string;
  joinUrl: string;
  initialFullscreen?: boolean;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  isOpen,
  onClose,
  meetingCode,
  meetingName,
  joinUrl,
  initialFullscreen = false,
}) => {
  const [qrSrc, setQrSrc] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);

  useEffect(() => {
    if (isOpen) {
      setIsFullscreen(initialFullscreen);
    }
  }, [isOpen, initialFullscreen]);

  useEffect(() => {
    if (isOpen && joinUrl) {
      generateQrDataUrl(joinUrl)
        .then(setQrSrc)
        .catch((err) => console.error('QR code generation error:', err));
    }
  }, [isOpen, joinUrl]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullscreen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      id="qr-code-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        id="qr-code-modal-container"
        className={`bg-white shadow-2xl transition-all ${
          isFullscreen
            ? 'fixed inset-0 z-50 flex flex-col justify-between items-center p-6 sm:p-10 overflow-y-auto'
            : 'w-full max-w-sm sm:max-w-md rounded-2xl border border-[#E5E7EB] p-5 sm:p-7 flex flex-col max-h-[90vh] overflow-y-auto'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Actions */}
        <div className="w-full flex items-center justify-between pb-3.5 border-b border-[#E5E7EB]">
          <div className="min-w-0 pr-2">
            <h2 className="text-base sm:text-lg font-bold text-[#111827] tracking-tight uppercase">
              Acesso à Reunião
            </h2>
            {meetingName && (
              <p className="text-xs text-[#6B7280] truncate mt-0.5">{meetingName}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              id="qr-modal-btn-fullscreen"
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Restaurar tamanho' : 'Ampliar para tela cheia'}
              className="px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-[#374151] hover:text-[#111827] bg-[#F3F4F6] hover:bg-[#E5E7EB] rounded-xl transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Restaurar</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ampliar</span>
                </>
              )}
            </button>
            <button
              id="qr-modal-btn-close"
              type="button"
              onClick={onClose}
              title="Fechar"
              className="p-1.5 text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F3F4F6] rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* QR Code Graphic & Code */}
        <div className="flex-1 flex flex-col items-center justify-center py-5 text-center my-auto">
          <div className="p-3.5 sm:p-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-xs inline-block">
            {qrSrc ? (
              <img
                id="qr-code-image"
                src={qrSrc}
                alt={`QR Code para reunião ${meetingCode}`}
                className={`${
                  isFullscreen
                    ? 'w-72 h-72 sm:w-96 sm:h-96 md:w-[420px] md:h-[420px] max-w-[85vw] max-h-[55vh]'
                    : 'w-56 h-56 sm:w-64 sm:h-64 max-w-full'
                } object-contain`}
              />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center bg-[#F9FAFB] text-[#9CA3AF] text-xs">
                Gerando QR Code...
              </div>
            )}
          </div>

          {/* Meeting Code Display */}
          <div className="mt-5 text-center">
            <p className="text-[10px] uppercase tracking-widest text-[#9CA3AF] font-bold">
              CÓDIGO DA REUNIÃO
            </p>
            <div className="mt-1 inline-block bg-[#F3F4F6] border border-[#E5E7EB] rounded-xl px-6 py-2">
              <span
                className={`font-mono font-bold tracking-widest text-[#111827] ${
                  isFullscreen ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-3xl'
                }`}
              >
                {meetingCode}
              </span>
            </div>
          </div>
        </div>

        {/* Footer info (Clean, without URL or technical copy buttons) */}
        <div className="w-full pt-3 border-t border-[#E5E7EB] text-center">
          <p className="text-[10px] text-[#9CA3AF] uppercase font-bold tracking-widest">
            Aponte a câmera para escanear e votar
          </p>
        </div>
      </div>
    </div>
  );
};
