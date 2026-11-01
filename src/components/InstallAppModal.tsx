import React, { useState, useEffect } from 'react';
import {
  Download,
  Smartphone,
  Monitor,
  CheckCircle2,
  X,
  Share2,
  MoreVertical,
  PlusSquare,
  Compass,
  ExternalLink,
  Info,
} from 'lucide-react';
import { ChurchLogo } from './ChurchLogo';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAlreadyInstalled?: boolean;
  hasNativePrompt?: boolean;
  onTriggerNativeInstall?: () => Promise<boolean | void> | void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({
  isOpen,
  onClose,
  isAlreadyInstalled = false,
  hasNativePrompt = false,
  onTriggerNativeInstall,
}) => {
  const [activeTab, setActiveTab] = useState<'android' | 'ios' | 'desktop'>('desktop');
  const [isInstalling, setIsInstalling] = useState(false);

  const isIframe = typeof window !== 'undefined' && window.self !== window.top;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = window.navigator.userAgent.toLowerCase();
      if (/iphone|ipad|ipod/.test(ua)) {
        setActiveTab('ios');
      } else if (/android/.test(ua)) {
        setActiveTab('android');
      } else {
        setActiveTab('desktop');
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (isAlreadyInstalled) return;

    if (hasNativePrompt && onTriggerNativeInstall) {
      setIsInstalling(true);
      try {
        await onTriggerNativeInstall();
      } catch (err) {
        console.warn('Erro ao disparar prompt nativo:', err);
      } finally {
        setIsInstalling(false);
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#E5E7EB] shadow-xl p-6 sm:p-7 space-y-5 text-[#111827]">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F3F4F6] border border-[#E5E7EB] flex items-center justify-center text-[#111827] shrink-0">
              <ChurchLogo className="w-6 h-6 text-[#111827]" />
            </div>
            <div>
              <h2 id="install-modal-title" className="text-base font-bold text-[#111827] leading-tight">
                Instalar Aplicativo
              </h2>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Adicione o VOTAIASD à sua tela inicial ou computador
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F3F4F6] rounded-lg transition-colors cursor-pointer"
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {isAlreadyInstalled ? (
          /* Caso C: Já Instalado */
          <div className="py-2 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <p className="text-xs text-[#4B5563] leading-relaxed">
              O VOTAIASD já está instalado neste dispositivo.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 bg-[#111827] hover:bg-black text-white font-semibold text-xs rounded-xl transition-all cursor-pointer shadow-xs"
            >
              Fechar
            </button>
          </div>
        ) : (
          /* Instalação: Botão Principal + Abas com Instruções */
          <div className="space-y-4">
            {/* Botão Principal Centralizado em Destaque */}
            <button
              id="btn-install-app-modal-primary"
              type="button"
              onClick={handleInstallClick}
              disabled={isInstalling}
              className="w-full py-3 px-4 bg-[#111827] hover:bg-black text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              <Download className="w-4 h-4" />
              <span>Instalar aplicativo</span>
            </button>

            {/* Abas de Plataforma */}
            <div className="grid grid-cols-3 gap-1 bg-[#F3F4F6] p-1 rounded-xl border border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => setActiveTab('android')}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'android'
                    ? 'bg-white text-[#111827] shadow-xs border border-[#E5E7EB]'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span>Android</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('ios')}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'ios'
                    ? 'bg-white text-[#111827] shadow-xs border border-[#E5E7EB]'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                <Compass className="w-3.5 h-3.5 shrink-0" />
                <span>iPhone / iPad</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('desktop')}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'desktop'
                    ? 'bg-white text-[#111827] shadow-xs border border-[#E5E7EB]'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                <Monitor className="w-3.5 h-3.5 shrink-0" />
                <span>Computador</span>
              </button>
            </div>

            {/* Instruções Curtas e Específicas por Aba */}
            <div className="p-3.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs space-y-2.5 text-[#374151]">
              {activeTab === 'android' && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-[#111827] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      1
                    </span>
                    <p className="leading-relaxed">
                      Toque no botão <strong>"Instalar aplicativo"</strong> acima para instalação direta.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-[#111827] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      2
                    </span>
                    <p className="leading-relaxed">
                      Ou abra o menu de <strong>três pontos</strong> (<MoreVertical className="w-3 h-3 inline text-[#6B7280] -mt-0.5" />) do navegador e selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'ios' && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-[#111827] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      1
                    </span>
                    <p className="leading-relaxed">
                      No navegador Safari, toque no botão de <strong>Compartilhar</strong> (<Share2 className="w-3 h-3 inline text-[#6B7280] -mt-0.5" />) na barra inferior.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-[#111827] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      2
                    </span>
                    <p className="leading-relaxed">
                      Role as opções e toque em <strong>"Adicionar à Tela de Início"</strong> (<PlusSquare className="w-3 h-3 inline text-[#6B7280] -mt-0.5" />).
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-[#111827] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      3
                    </span>
                    <p className="leading-relaxed">
                      Confirme em <strong>"Adicionar"</strong> no canto superior direito para fixar o atalho.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'desktop' && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-[#111827] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      1
                    </span>
                    <p className="leading-relaxed">
                      Clique no botão <strong>"Instalar aplicativo"</strong> acima para acionar a janela oficial do Chrome ou Edge.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-[#111827] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      2
                    </span>
                    <p className="leading-relaxed">
                      Se a janela direta não abrir, procure o ícone de instalação (<Download className="w-3 h-3 inline text-[#6B7280] -mt-0.5" />) na barra de endereços ou abra o menu (<MoreVertical className="w-3 h-3 inline text-[#6B7280] -mt-0.5" />) e selecione <strong>"Instalar VOTAIASD..."</strong>.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Alternativa para ambiente de Preview (Iframe) */}
            {isIframe && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-900 text-left">
                <div className="flex items-center gap-1.5 font-bold text-amber-950">
                  <Info className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>Acesso pelo Preview</span>
                </div>
                <p className="leading-relaxed">
                  O navegador bloqueia janelas nativas de instalação dentro de quadros/previews. Para instalar com 1 clique no computador, abra em uma aba direta:
                </p>
                <a
                  href={typeof window !== 'undefined' ? window.location.href : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                >
                  <span>Abrir em Nova Aba</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
