import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  Mail,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ArrowLeft,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  userLogin,
  userRegister,
  loginWithGoogle,
  requestPasswordReset,
  verifyResetToken,
  confirmPasswordReset,
} from '../services/api';
import {
  auth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from '../services/firebase';
import { User as UserType } from '../types';

interface AuthViewProps {
  onAuthSuccess: (user: UserType) => void;
  initialMode?: 'login' | 'register' | 'forgot' | 'reset';
  initialResetToken?: string;
}

export const AuthView: React.FC<AuthViewProps> = ({
  onAuthSuccess,
  initialMode = 'login',
  initialResetToken = '',
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(initialMode);

  // Form states - Login
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Form states - Register
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  // Form states - Forgot Password
  const [forgotEmail, setForgotEmail] = useState('');

  // Form states - Reset Password
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetNewPassword, setShowResetNewPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const [tokenUserInfo, setTokenUserInfo] = useState<{ username?: string; email?: string } | null>(null);
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);

  // Status & Feedback
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Handle URL reset token on mount or change
  useEffect(() => {
    if (initialResetToken) {
      setResetToken(initialResetToken);
      setMode('reset');
      checkTokenValidity(initialResetToken);
    }
  }, [initialResetToken]);

  // Handle Firebase redirect result (for mobile browsers or redirect fallback)
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          setIsGoogleLoading(true);
          try {
            const idToken = await result.user.getIdToken();
            const res = await loginWithGoogle(
              idToken,
              result.user.displayName || undefined,
              result.user.photoURL || undefined
            );
            if (res.user) {
              onAuthSuccess(res.user);
            }
          } catch (err) {
            setErrorMessage(
              err instanceof Error ? err.message : 'Erro ao processar login com Google.'
            );
          } finally {
            setIsGoogleLoading(false);
          }
        }
      })
      .catch((err) => {
        if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
          setErrorMessage('Erro ao autenticar com o Google. Tente novamente.');
        }
      });
  }, [onAuthSuccess]);

  const checkTokenValidity = async (token: string) => {
    if (!token) return;
    setIsVerifyingToken(true);
    setErrorMessage(null);
    try {
      const res = await verifyResetToken(token);
      if (res.valid) {
        setTokenUserInfo({ username: res.username, email: res.email });
      } else {
        setErrorMessage(res.error || 'Link de recuperação inválido ou expirado.');
      }
    } catch {
      setErrorMessage('Erro ao validar token de recuperação.');
    } finally {
      setIsVerifyingToken(false);
    }
  };

  const clearFeedback = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // --- Handlers ---

  const handleGoogleLogin = async () => {
    clearFeedback();
    setIsGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      let userCredential;
      try {
        userCredential = await signInWithPopup(auth, provider);
      } catch (popupErr: any) {
        if (popupErr?.code === 'auth/popup-blocked') {
          // If popup is blocked by mobile browser, fallback to redirect
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupErr;
      }

      if (userCredential && userCredential.user) {
        const idToken = await userCredential.user.getIdToken();
        const res = await loginWithGoogle(
          idToken,
          userCredential.user.displayName || undefined,
          userCredential.user.photoURL || undefined
        );
        if (res.user) {
          onAuthSuccess(res.user);
        }
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setErrorMessage('Login com Google cancelado.');
      } else if (code === 'auth/unauthorized-domain') {
        setErrorMessage('Domínio não autorizado no Firebase Authentication.');
      } else if (code === 'auth/invalid-continue-uri' || code === 'auth/invalid-api-key' || code === 'auth/api-key-invalid') {
        setErrorMessage('Chave de API do Firebase ou URI de redirecionamento inválida no projeto votaiasd-v2.');
      } else if (code === 'auth/network-request-failed') {
        setErrorMessage('Erro de conexão ao comunicar com o Google. Verifique sua rede e tente novamente.');
      } else {
        const msg = err instanceof Error ? err.message : 'Não foi possível entrar com o Google. Tente novamente.';
        setErrorMessage(msg);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!loginIdentifier.trim() || !loginPassword) {
      setErrorMessage('Preencha o usuário/e-mail e a senha.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await userLogin(loginIdentifier.trim(), loginPassword);
      if (res.user) {
        onAuthSuccess(res.user);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Usuário ou senha incorretos.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!regUsername.trim()) {
      setErrorMessage('Informe um nome de usuário.');
      return;
    }
    if (!regEmail.trim()) {
      setErrorMessage('Informe um e-mail válido.');
      return;
    }
    if (regPassword.length < 6) {
      setErrorMessage('A senha deve conter no mínimo 6 caracteres.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setErrorMessage('As senhas digitadas não conferem.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await userRegister(
        regUsername.trim(),
        regEmail.trim(),
        regPassword,
        regConfirmPassword
      );

      if (res.user) {
        // Automatic login on registration
        onAuthSuccess(res.user);
      } else {
        setSuccessMessage('Conta criada com sucesso! Faça login para continuar.');
        setMode('login');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao realizar cadastro.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!forgotEmail.trim()) {
      setErrorMessage('Informe o e-mail cadastrado.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await requestPasswordReset(forgotEmail.trim());
      setSuccessMessage(
        res.message ||
          'Se existir uma conta cadastrada com este e-mail, enviaremos um link para redefinir sua senha.'
      );
      setForgotEmail('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao solicitar recuperação.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!resetToken.trim()) {
      setErrorMessage('Código ou token de recuperação ausente.');
      return;
    }
    if (resetNewPassword.length < 6) {
      setErrorMessage('A nova senha deve conter no mínimo 6 caracteres.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setErrorMessage('As senhas digitadas não conferem.');
      return;
    }

    setIsLoading(true);
    try {
      await confirmPasswordReset(resetToken.trim(), resetNewPassword, resetConfirmPassword);
      setSuccessMessage('Senha redefinida com sucesso! Você já pode entrar com a nova senha.');
      setMode('login');
      setLoginPassword('');
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao redefinir senha.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main
      id="admin-auth-container"
      className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 bg-[#F9FAFB]"
    >
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#E5E7EB] shadow-xs p-6 sm:p-8">
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#F3F4F6] border border-[#E5E7EB] text-[#111827] mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-[#111827] tracking-tight">
            VOTAIASD
          </h1>
        </div>

        {/* Tab switcher for Login / Register (when in login or register mode) */}
        {(mode === 'login' || mode === 'register') && (
          <div className="grid grid-cols-2 gap-1 bg-[#F3F4F6] p-1 rounded-xl border border-[#E5E7EB] mb-6">
            <button
              id="tab-auth-login"
              type="button"
              onClick={() => {
                setMode('login');
                clearFeedback();
              }}
              className={`py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-white text-[#111827] shadow-xs border border-[#E5E7EB]'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              Entrar
            </button>
            <button
              id="tab-auth-register"
              type="button"
              onClick={() => {
                setMode('register');
                clearFeedback();
              }}
              className={`py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                mode === 'register'
                  ? 'bg-white text-[#111827] shadow-xs border border-[#E5E7EB]'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              Criar Conta
            </button>
          </div>
        )}

        {/* Feedback Alerts */}
        {errorMessage && (
          <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span className="font-medium">{successMessage}</span>
          </div>
        )}

        {/* MODE 1: LOGIN */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="input-login-identifier"
                className="block text-xs font-bold uppercase tracking-widest text-[#6B7280] mb-1.5"
              >
                Usuário ou E-mail
              </label>
              <div className="relative">
                <input
                  id="input-login-identifier"
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="Seu usuário ou e-mail"
                  className="w-full pl-10 pr-4 py-3 text-sm text-[#111827] bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] focus:border-transparent transition-all"
                  autoFocus
                  required
                />
                <User className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="input-login-password"
                  className="block text-xs font-bold uppercase tracking-widest text-[#6B7280]"
                >
                  Senha
                </label>
                <button
                  id="btn-link-forgot-password"
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    clearFeedback();
                  }}
                  className="text-xs text-[#4B5563] hover:text-[#111827] font-medium underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <input
                  id="input-login-password"
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full pl-10 pr-10 py-3 text-sm text-[#111827] bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] focus:border-transparent transition-all"
                  required
                />
                <KeyRound className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#111827] focus:outline-hidden p-1 transition-colors cursor-pointer"
                  title={showLoginPassword ? 'Ocultar senha' : 'Exibir senha'}
                  aria-label={showLoginPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="btn-login-submit"
              type="submit"
              disabled={isLoading || isGoogleLoading || !loginIdentifier.trim() || !loginPassword}
              className="w-full py-3.5 px-4 bg-[#111827] hover:bg-black disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Entrando...</span>
                </>
              ) : (
                <span>Entrar no Sistema</span>
              )}
            </button>

            {/* Separador Visual OU */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#E5E7EB]" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2.5 text-[#9CA3AF] font-bold tracking-wider">
                  OU
                </span>
              </div>
            </div>

            {/* Botão Entrar com Google */}
            <button
              id="btn-login-google"
              type="button"
              disabled={isLoading || isGoogleLoading}
              onClick={handleGoogleLogin}
              className="w-full py-3 px-4 bg-white hover:bg-[#F9FAFB] border border-[#D1D5DB] hover:border-[#9CA3AF] text-[#111827] font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-2xs flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGoogleLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#111827]" />
                  <span>Conectando com Google...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Entrar com Google</span>
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <p className="text-xs text-[#6B7280]">
                Novo por aqui?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    clearFeedback();
                  }}
                  className="font-bold text-[#111827] hover:underline cursor-pointer"
                >
                  Criar minha conta
                </button>
              </p>
            </div>
          </form>
        )}

        {/* MODE 2: REGISTER */}
        {mode === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="input-reg-username"
                className="block text-xs font-bold uppercase tracking-widest text-[#6B7280] mb-1"
              >
                Usuário
              </label>
              <div className="relative">
                <input
                  id="input-reg-username"
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="ex: paulo.roberto"
                  className="w-full pl-10 pr-4 py-2.5 text-sm text-[#111827] bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] focus:border-transparent transition-all"
                  autoFocus
                  required
                />
                <User className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-[11px] text-[#9CA3AF] mt-1">Nome único para identificação no sistema.</p>
            </div>

            <div>
              <label
                htmlFor="input-reg-email"
                className="block text-xs font-bold uppercase tracking-widest text-[#6B7280] mb-1"
              >
                E-mail
              </label>
              <div className="relative">
                <input
                  id="input-reg-email"
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full pl-10 pr-4 py-2.5 text-sm text-[#111827] bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] focus:border-transparent transition-all"
                  required
                />
                <Mail className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <label
                htmlFor="input-reg-password"
                className="block text-xs font-bold uppercase tracking-widest text-[#6B7280] mb-1"
              >
                Senha
              </label>
              <div className="relative">
                <input
                  id="input-reg-password"
                  type={showRegPassword ? 'text' : 'password'}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-10 pr-10 py-2.5 text-sm text-[#111827] bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] focus:border-transparent transition-all"
                  required
                />
                <KeyRound className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowRegPassword((prev) => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#111827] focus:outline-hidden p-1 transition-colors cursor-pointer"
                  title={showRegPassword ? 'Ocultar senha' : 'Exibir senha'}
                  aria-label={showRegPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="input-reg-confirm-password"
                className="block text-xs font-bold uppercase tracking-widest text-[#6B7280] mb-1"
              >
                Confirmar Senha
              </label>
              <div className="relative">
                <input
                  id="input-reg-confirm-password"
                  type={showRegConfirmPassword ? 'text' : 'password'}
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  className="w-full pl-10 pr-10 py-2.5 text-sm text-[#111827] bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] focus:border-transparent transition-all"
                  required
                />
                <KeyRound className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowRegConfirmPassword((prev) => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#111827] focus:outline-hidden p-1 transition-colors cursor-pointer"
                  title={showRegConfirmPassword ? 'Ocultar senha' : 'Exibir senha'}
                  aria-label={showRegConfirmPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showRegConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="btn-register-submit"
              type="submit"
              disabled={
                isLoading ||
                isGoogleLoading ||
                !regUsername.trim() ||
                !regEmail.trim() ||
                !regPassword ||
                !regConfirmPassword
              }
              className="w-full py-3.5 px-4 bg-[#111827] hover:bg-black disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed mt-3"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Cadastrando...</span>
                </>
              ) : (
                <span>Criar Minha Conta</span>
              )}
            </button>

            {/* Separador Visual OU */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#E5E7EB]" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2.5 text-[#9CA3AF] font-bold tracking-wider">
                  OU
                </span>
              </div>
            </div>

            {/* Botão Cadastrar com Google */}
            <button
              id="btn-register-google"
              type="button"
              disabled={isLoading || isGoogleLoading}
              onClick={handleGoogleLogin}
              className="w-full py-3 px-4 bg-white hover:bg-[#F9FAFB] border border-[#D1D5DB] hover:border-[#9CA3AF] text-[#111827] font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-2xs flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGoogleLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#111827]" />
                  <span>Conectando com Google...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Entrar com Google</span>
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <p className="text-xs text-[#6B7280]">
                Já tem uma conta?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    clearFeedback();
                  }}
                  className="font-bold text-[#111827] hover:underline cursor-pointer"
                >
                  Fazer login
                </button>
              </p>
            </div>
          </form>
        )}

        {/* MODE 3: FORGOT PASSWORD */}
        {mode === 'forgot' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  clearFeedback();
                }}
                className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#111827]">
                Recuperação de Senha
              </h2>
            </div>

            <p className="text-xs text-[#6B7280] leading-relaxed">
              Informe o e-mail cadastrado em sua conta para receber o link seguro de redefinição de senha.
            </p>

            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="input-forgot-email"
                  className="block text-xs font-bold uppercase tracking-widest text-[#6B7280] mb-1.5"
                >
                  E-mail Cadastrado
                </label>
                <div className="relative">
                  <input
                    id="input-forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full pl-10 pr-4 py-3 text-sm text-[#111827] bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] focus:border-transparent transition-all"
                    autoFocus
                    required
                  />
                  <Mail className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <button
                id="btn-forgot-submit"
                type="submit"
                disabled={isLoading || !forgotEmail.trim()}
                className="w-full py-3.5 px-4 bg-[#111827] hover:bg-black disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <span>ENVIAR LINK</span>
                )}
              </button>
            </form>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  clearFeedback();
                }}
                className="text-xs font-bold text-[#4B5563] hover:text-[#111827] hover:underline cursor-pointer"
              >
                Voltar para o Login
              </button>
            </div>
          </div>
        )}

        {/* MODE 4: RESET PASSWORD */}
        {mode === 'reset' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  clearFeedback();
                }}
                className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#111827]">
                Nova Senha
              </h2>
            </div>

            {isVerifyingToken ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-center">
                <RefreshCw className="w-5 h-5 animate-spin text-[#6B7280]" />
                <span className="text-xs text-[#6B7280]">Validando link de recuperação...</span>
              </div>
            ) : (
              <>
                {tokenUserInfo && (
                  <div className="p-3 bg-[#F3F4F6] border border-[#E5E7EB] rounded-xl text-xs text-[#374151]">
                    Redefinindo senha para: <strong className="text-[#111827]">{tokenUserInfo.username}</strong> ({tokenUserInfo.email})
                  </div>
                )}

                <form onSubmit={handleResetSubmit} className="space-y-3.5">
                  {!resetToken && (
                    <div>
                      <label
                        htmlFor="input-reset-token"
                        className="block text-xs font-bold uppercase tracking-widest text-[#6B7280] mb-1"
                      >
                        Código / Token do Link
                      </label>
                      <input
                        id="input-reset-token"
                        type="text"
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        placeholder="Cole o token recebido"
                        className="w-full px-4 py-2.5 text-sm font-mono text-[#111827] bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] focus:border-transparent transition-all"
                        required
                      />
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="input-reset-new-password"
                      className="block text-xs font-bold uppercase tracking-widest text-[#6B7280] mb-1"
                    >
                      Nova Senha
                    </label>
                    <div className="relative">
                      <input
                        id="input-reset-new-password"
                        type={showResetNewPassword ? 'text' : 'password'}
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full pl-10 pr-10 py-2.5 text-sm text-[#111827] bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] focus:border-transparent transition-all"
                        autoFocus
                        required
                      />
                      <KeyRound className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <button
                        type="button"
                        onClick={() => setShowResetNewPassword((prev) => !prev)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#111827] focus:outline-hidden p-1 transition-colors cursor-pointer"
                        title={showResetNewPassword ? 'Ocultar senha' : 'Exibir senha'}
                        aria-label={showResetNewPassword ? 'Ocultar senha' : 'Exibir senha'}
                      >
                        {showResetNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="input-reset-confirm-password"
                      className="block text-xs font-bold uppercase tracking-widest text-[#6B7280] mb-1"
                    >
                      Confirmar Nova Senha
                    </label>
                    <div className="relative">
                      <input
                        id="input-reset-confirm-password"
                        type={showResetConfirmPassword ? 'text' : 'password'}
                        value={resetConfirmPassword}
                        onChange={(e) => setResetConfirmPassword(e.target.value)}
                        placeholder="Repita a nova senha"
                        className="w-full pl-10 pr-10 py-2.5 text-sm text-[#111827] bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827] focus:border-transparent transition-all"
                        required
                      />
                      <KeyRound className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <button
                        type="button"
                        onClick={() => setShowResetConfirmPassword((prev) => !prev)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#111827] focus:outline-hidden p-1 transition-colors cursor-pointer"
                        title={showResetConfirmPassword ? 'Ocultar senha' : 'Exibir senha'}
                        aria-label={showResetConfirmPassword ? 'Ocultar senha' : 'Exibir senha'}
                      >
                        {showResetConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    id="btn-reset-password-submit"
                    type="submit"
                    disabled={
                      isLoading ||
                      !resetNewPassword ||
                      !resetConfirmPassword ||
                      !resetToken.trim()
                    }
                    className="w-full py-3.5 px-4 bg-[#111827] hover:bg-black disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed mt-3"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Salvando Nova Senha...</span>
                      </>
                    ) : (
                      <span>Salvar Nova Senha</span>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        )}

        {/* Assinatura Institucional na parte inferior do cartão */}
        <div className="mt-6 pt-4 border-t border-[#F3F4F6] text-center">
          <span className="text-[11px] text-[#9CA3AF] font-medium tracking-wide">
            by Pr Paulo Roberto
          </span>
        </div>
      </div>
    </main>
  );
};
