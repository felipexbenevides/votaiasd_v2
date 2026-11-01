import https from 'https';
import fs from 'fs';
import path from 'path';

export interface FirebaseAccountResult {
  localId: string; // The Firebase UID
  email: string;
  idToken?: string;
  refreshToken?: string;
}

export interface FirebaseLookupUser {
  localId: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  emailVerified?: boolean;
}

export class FirebaseAuthService {
  private static cachedApiKey: string | null = null;

  public static hasApiKey(): boolean {
    return Boolean(this.getApiKey().length > 0);
  }

  private static getApiKey(): string {
    if (this.cachedApiKey !== null) {
      return this.cachedApiKey;
    }
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.apiKey && typeof parsed.apiKey === 'string' && parsed.apiKey.trim().length > 0) {
          this.cachedApiKey = parsed.apiKey.trim();
          return this.cachedApiKey;
        }
      }
    } catch {
      // ignore
    }

    const envKey = (process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || '').trim();
    if (envKey && !envKey.includes('AIzaSyCOEdbd')) {
      this.cachedApiKey = envKey;
      return this.cachedApiKey;
    }

    this.cachedApiKey = '';
    return this.cachedApiKey;
  }

  private static post(path: string, body: Record<string, any>): Promise<{ status: number; data: any }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return Promise.reject(new Error('Chave de API do Firebase não configurada no servidor (VITE_FIREBASE_API_KEY).'));
    }

    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const req = https.request(
        {
          hostname: 'identitytoolkit.googleapis.com',
          path: `${path}?key=${apiKey}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let chunks = '';
          res.on('data', (c) => (chunks += c));
          res.on('end', () => {
            try {
              const data = JSON.parse(chunks);
              resolve({ status: res.statusCode || 500, data });
            } catch (e) {
              resolve({ status: res.statusCode || 500, data: { raw: chunks } });
            }
          });
        }
      );

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Create account in Firebase Authentication
   */
  public static async createAccount(email: string, password: string): Promise<FirebaseAccountResult> {
    const res = await this.post('/v1/accounts:signUp', {
      email,
      password,
      returnSecureToken: true,
    });

    if (res.status !== 200) {
      const errCode = res.data?.error?.message || 'Erro ao criar conta no Firebase.';
      if (errCode.includes('EMAIL_EXISTS')) {
        throw new Error('Este e-mail já está cadastrado.');
      }
      if (errCode.includes('WEAK_PASSWORD')) {
        throw new Error('A senha deve conter no mínimo 6 caracteres.');
      }
      if (errCode.includes('INVALID_EMAIL')) {
        throw new Error('Formato de e-mail inválido.');
      }
      throw new Error(`Erro no Firebase Auth: ${errCode}`);
    }

    return {
      localId: res.data.localId,
      email: res.data.email,
      idToken: res.data.idToken,
      refreshToken: res.data.refreshToken,
    };
  }

  /**
   * Sign in with Email and Password in Firebase Authentication
   */
  public static async signInWithPassword(email: string, password: string): Promise<FirebaseAccountResult> {
    const res = await this.post('/v1/accounts:signInWithPassword', {
      email,
      password,
      returnSecureToken: true,
    });

    if (res.status !== 200) {
      const errCode = res.data?.error?.message || '';
      if (
        errCode.includes('EMAIL_NOT_FOUND') ||
        errCode.includes('INVALID_PASSWORD') ||
        errCode.includes('INVALID_LOGIN_CREDENTIALS')
      ) {
        throw new Error('Usuário ou senha incorretos.');
      }
      if (errCode.includes('USER_DISABLED')) {
        throw new Error('Esta conta de usuário foi desativada.');
      }
      throw new Error(`Erro ao autenticar: ${errCode}`);
    }

    return {
      localId: res.data.localId,
      email: res.data.email,
      idToken: res.data.idToken,
      refreshToken: res.data.refreshToken,
    };
  }

  /**
   * Send official Firebase Password Reset Email
   */
  public static async sendPasswordResetEmail(email: string): Promise<{ success: boolean; email: string }> {
    const res = await this.post('/v1/accounts:sendOobCode', {
      requestType: 'PASSWORD_RESET',
      email,
    });

    if (res.status !== 200) {
      const errCode = res.data?.error?.message || '';
      // Firebase Identity Toolkit returns EMAIL_NOT_FOUND if user doesn't exist,
      // but for security we should not expose user enumeration unless needed.
      if (errCode.includes('EMAIL_NOT_FOUND')) {
        return { success: true, email };
      }
      throw new Error(`Erro ao enviar e-mail de recuperação: ${errCode}`);
    }

    return { success: true, email: res.data.email || email };
  }

  /**
   * Verify an out-of-band password reset code (oobCode) from Firebase email
   */
  public static async verifyPasswordResetCode(oobCode: string): Promise<{ email: string }> {
    const res = await this.post('/v1/accounts:resetPassword', {
      oobCode,
    });

    if (res.status !== 200) {
      const errCode = res.data?.error?.message || '';
      if (errCode.includes('EXPIRED_OOB_CODE')) {
        throw new Error('O link de recuperação de senha expirou. Solicite um novo link.');
      }
      if (errCode.includes('INVALID_OOB_CODE')) {
        throw new Error('O link de recuperação de senha é inválido ou já foi utilizado.');
      }
      throw new Error(`Código de recuperação inválido: ${errCode}`);
    }

    return { email: res.data.email };
  }

  /**
   * Reset password with the out-of-band code (oobCode)
   */
  public static async confirmPasswordReset(oobCode: string, newPassword: string): Promise<{ email: string }> {
    const res = await this.post('/v1/accounts:resetPassword', {
      oobCode,
      newPassword,
    });

    if (res.status !== 200) {
      const errCode = res.data?.error?.message || '';
      if (errCode.includes('EXPIRED_OOB_CODE')) {
        throw new Error('O link de recuperação de senha expirou. Solicite um novo link.');
      }
      if (errCode.includes('INVALID_OOB_CODE')) {
        throw new Error('O link de recuperação de senha é inválido ou já foi utilizado.');
      }
      if (errCode.includes('WEAK_PASSWORD')) {
        throw new Error('A nova senha é muito fraca. Escolha uma senha com no mínimo 6 caracteres.');
      }
      throw new Error(`Erro ao redefinir senha no Firebase: ${errCode}`);
    }

    return { email: res.data.email };
  }

  /**
   * Verify Firebase ID token using accounts:lookup
   */
  public static async verifyIdToken(idToken: string): Promise<FirebaseLookupUser | null> {
    if (!idToken || typeof idToken !== 'string') return null;
    try {
      const res = await this.post('/v1/accounts:lookup', {
        idToken,
      });
      if (res.status === 200 && res.data?.users && res.data.users.length > 0) {
        const u = res.data.users[0];
        return {
          localId: u.localId,
          email: u.email,
          displayName: u.displayName,
          photoUrl: u.photoUrl,
          emailVerified: u.emailVerified,
        };
      }
      return null;
    } catch {
      return null;
    }
  }
}
