import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db, verifyPassword } from './db';
import { sseManager } from './sse';
import { presenceTracker } from './presence';
import { FirebaseAuthService } from './firebaseAuth';
import { CENTRAL_DEPARTMENT_CATALOG, canDepartmentHaveAssociates } from '../constants/departments';
import { formatMeetingTitle } from '../utils/meetingTitle';

export const apiRouter = Router();

export const getUserSession = (token: string) => {
  if (!token || typeof token !== 'string') return null;
  const session = db.getSession(token);
  if (!session) return null;
  return session;
};

// Middleware to authenticate user/admin requests (supports Authorization header or query token)
export const requireAdmin = (req: Request, res: Response, next: () => void) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.query.token as string);

  if (!token) {
    res.status(401).json({ error: 'Acesso restrito. Faça login para continuar.' });
    return;
  }

  const session = getUserSession(token);
  if (!session) {
    res.status(401).json({ error: 'Sessão expirada ou não autenticada. Faça login novamente.' });
    return;
  }

  const user = db.getUserById(session.userId);
  if (!user) {
    res.status(401).json({ error: 'Conta de usuário não encontrada.' });
    return;
  }

  (req as any).user = {
    id: user.id,
    username: user.username,
    email: user.email,
  };
  (req as any).userId = user.id;
  next();
};

// --- Authentication & User Management Routes with Firebase Authentication ---

// In-flight concurrency lock to prevent simultaneous duplicate username creation
const inFlightRegistrations = new Set<string>();

// 1. User Registration (Cadastro com Usuário + E-mail + Senha + Confirmar Senha)
apiRouter.post('/auth/register', async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  // Validation: Username
  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    res.status(400).json({ error: 'O nome de usuário é obrigatório.' });
    return;
  }
  const cleanUsername = username.trim();
  if (cleanUsername.length < 3 || cleanUsername.length > 30) {
    res.status(400).json({ error: 'O nome de usuário deve conter entre 3 e 30 caracteres.' });
    return;
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
    res.status(400).json({ error: 'O nome de usuário deve conter apenas letras, números, ponto, hífen ou sublinhado.' });
    return;
  }

  // Validation: Email
  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    res.status(400).json({ error: 'O e-mail é obrigatório.' });
    return;
  }
  const cleanEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    res.status(400).json({ error: 'Formato de e-mail inválido.' });
    return;
  }

  // Validation: Password
  if (!password || typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
    return;
  }

  // Validation: Confirm Password
  if (password !== confirmPassword) {
    res.status(400).json({ error: 'A confirmação de senha não confere com a senha digitada.' });
    return;
  }

  const lockKey = cleanUsername.toLowerCase();
  if (inFlightRegistrations.has(lockKey)) {
    res.status(400).json({ error: 'Este nome de usuário já está em uso.' });
    return;
  }
  inFlightRegistrations.add(lockKey);

  try {
    // Check unique username & email in authoritative Firestore
    const existingUser = await db.findUserByUsername(cleanUsername);
    if (existingUser) {
      res.status(400).json({ error: 'Este nome de usuário já está em uso.' });
      return;
    }
    const existingEmail = await db.findUserByEmail(cleanEmail);
    if (existingEmail) {
      res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
      return;
    }

    let user;
    if (FirebaseAuthService.hasApiKey()) {
      // 1. Create account in Firebase Authentication
      const fbResult = await FirebaseAuthService.createAccount(cleanEmail, password);

      // 2. Persist local user profile mapped to Firebase UID
      user = await db.createFirebaseUser(cleanUsername, cleanEmail, fbResult.localId, password);
    } else {
      // Fallback: Local database authentication when Firebase API key is not configured
      user = await db.createUser(cleanUsername, cleanEmail, password);
    }

    // 3. Issue authenticated session
    const session = await db.createSession(user.id);

    res.status(201).json({
      success: true,
      message: 'Conta criada com sucesso! Você já pode entrar no sistema.',
      token: session.token,
      user: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao realizar cadastro.';
    res.status(400).json({ error: message });
  } finally {
    inFlightRegistrations.delete(lockKey);
  }
});

// 2. User Login (Login com Usuário ou E-mail + Senha, autenticado pelo Firebase Auth)
apiRouter.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
    res.status(400).json({ error: 'Informe o usuário/e-mail e a senha.' });
    return;
  }

  const cleanIdentifier = username.trim();
  const isEmailInput = cleanIdentifier.includes('@');

  try {
    // Authoritative query against Firestore votaiasd-v2/(default)
    let user = isEmailInput
      ? (await db.findUserByEmail(cleanIdentifier)) || (await db.findUserByUsername(cleanIdentifier))
      : (await db.findUserByUsername(cleanIdentifier)) || (await db.findUserByEmail(cleanIdentifier));

    let sessionUserId: string;

    if (FirebaseAuthService.hasApiKey()) {
      const emailToAuth = user ? user.email : isEmailInput ? cleanIdentifier.toLowerCase() : null;

      if (!emailToAuth) {
        res.status(401).json({ error: 'Usuário ou senha incorretos.' });
        return;
      }

      let firebaseUid: string | undefined;
      try {
        // Primary authentication attempt via Firebase Authentication
        const fbAuth = await FirebaseAuthService.signInWithPassword(emailToAuth, password);
        firebaseUid = fbAuth.localId;
      } catch (fbErr: any) {
        // Fallback: If Firebase Auth returns error but user exists in Firestore with matching passwordHash, allow login!
        if (user && user.passwordHash && user.salt) {
          const isValid = verifyPassword(password, user.passwordHash, user.salt);
          if (isValid) {
            sessionUserId = user.id;
            const session = await db.createSession(sessionUserId);
            res.json({
              success: true,
              token: session.token,
              user: {
                id: sessionUserId,
                firebaseUid: user.firebaseUid,
                username: user.username,
                email: user.email,
              },
            });
            return;
          }
        }
        throw fbErr;
      }

      if (firebaseUid) {
        if (!user) {
          // Find by Firebase UID if user was created earlier
          user = (await db.findUserByFirebaseUid(firebaseUid)) || (await db.findUserById(firebaseUid));

          if (!user) {
            // Auto-provision user profile for this existing Firebase Auth account in Firestore
            const baseName = cleanIdentifier.includes('@') ? cleanIdentifier.split('@')[0] : cleanIdentifier;
            let uniqueName = baseName.replace(/[^a-zA-Z0-9_.-]/g, '_');
            if (uniqueName.length < 3) uniqueName = 'user_' + firebaseUid.substring(0, 5);
            let counter = 1;
            while (await db.findUserByUsername(uniqueName)) {
              uniqueName = `${baseName}_${counter}`;
              counter++;
            }
            user = await db.createFirebaseUser(uniqueName, emailToAuth, firebaseUid, password);
          }
        } else if (!user.firebaseUid || user.firebaseUid !== firebaseUid) {
          user = (await db.linkUserFirebaseUid(user.id, firebaseUid)) || user;
        }

        sessionUserId = user.id;
      } else {
        res.status(401).json({ error: 'Usuário ou senha incorretos.' });
        return;
      }
    } else {
      if (!user) {
        res.status(401).json({ error: 'Usuário ou senha incorretos.' });
        return;
      }
      if (!user.passwordHash || !user.salt) {
        res.status(401).json({ error: 'Usuário ou senha incorretos.' });
        return;
      }
      const isValid = verifyPassword(password, user.passwordHash, user.salt);
      if (!isValid) {
        res.status(401).json({ error: 'Usuário ou senha incorretos.' });
        return;
      }
      sessionUserId = user.id;
    }

    const session = await db.createSession(sessionUserId);

    res.json({
      success: true,
      token: session.token,
      user: {
        id: sessionUserId,
        firebaseUid: user.firebaseUid,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    console.error('[Login Error]', rawMsg);

    if (
      rawMsg.includes('PERMISSION_DENIED') ||
      rawMsg.includes('NOT_FOUND') ||
      rawMsg.includes('indisponível') ||
      rawMsg.includes('Missing or insufficient permissions')
    ) {
      res.status(503).json({ error: 'Serviço de banco de dados Firestore (votaiasd-v2) temporariamente indisponível ou sem permissão de acesso.' });
      return;
    }

    let message = 'Usuário ou senha incorretos.';
    if (rawMsg.includes('desativada')) {
      message = 'Esta conta de usuário foi desativada.';
    } else if (rawMsg.includes('Chave de API do Firebase não configurada')) {
      message = 'Serviço de autenticação temporariamente indisponível.';
    }
    res.status(401).json({ error: message });
  }
});

// 2.1 Google Authentication for Admin (Exclusivo para Área Administrativa)
apiRouter.post('/auth/google', async (req, res) => {
  const { idToken, email, displayName, photoURL } = req.body;

  if (!idToken || typeof idToken !== 'string') {
    res.status(400).json({ error: 'Token de autenticação do Google não fornecido.' });
    return;
  }

  try {
    let verifiedLocalId: string;
    let verifiedEmail: string;
    let verifiedDisplayName: string | undefined = displayName;
    let verifiedPhotoUrl: string | undefined = photoURL;

    if (FirebaseAuthService.hasApiKey()) {
      const verified = await FirebaseAuthService.verifyIdToken(idToken);
      if (!verified || !verified.localId) {
        res.status(401).json({ error: 'Token de autenticação do Google inválido ou expirado.' });
        return;
      }
      verifiedLocalId = verified.localId;
      verifiedEmail = (verified.email || (email ? String(email).trim() : '')).toLowerCase();
      if (verified.displayName) verifiedDisplayName = verified.displayName;
      if (verified.photoUrl) verifiedPhotoUrl = verified.photoUrl;
    } else {
      verifiedLocalId = 'google_' + crypto.randomUUID();
      verifiedEmail = (email && typeof email === 'string' ? email.trim() : 'admin@google.com').toLowerCase();
    }

    if (!verifiedEmail) {
      res.status(400).json({ error: 'Não foi possível obter o e-mail da conta Google.' });
      return;
    }

    // 1. Check if user exists by Email FIRST to guarantee 1 Email = 1 User Profile
    const userByEmail = await db.findUserByEmail(verifiedEmail);

    let user: any;
    if (userByEmail) {
      // Link Google Firebase UID to the existing user profile, preserving passwordHash and salt
      user = (await db.linkUserFirebaseUid(userByEmail.id, verifiedLocalId)) || userByEmail;
    } else {
      // 2. Check by UID if not found by Email
      user = (await db.findUserByFirebaseUid(verifiedLocalId)) || (await db.findUserById(verifiedLocalId));
    }

    // 3. If still not found, create a new administrative user profile
    if (!user) {
      let baseUsername = (verifiedDisplayName || verifiedEmail.split('@')[0])
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_.-]/g, '.')
        .replace(/\.+/g, '.')
        .replace(/^\.|\.$/g, '');

      if (baseUsername.length < 3) {
        baseUsername = 'admin.' + verifiedLocalId.substring(0, 5).toLowerCase();
      }

      let uniqueUsername = baseUsername;
      let counter = 1;
      while (await db.findUserByUsername(uniqueUsername)) {
        uniqueUsername = `${baseUsername}${counter}`;
        counter++;
      }

      user = await db.createFirebaseUser(uniqueUsername, verifiedEmail, verifiedLocalId);
    }

    // 4. Create authenticated session
    const session = await db.createSession(user.id);

    res.json({
      success: true,
      token: session.token,
      user: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        username: user.username,
        email: user.email,
        displayName: verifiedDisplayName || user.username,
        photoURL: verifiedPhotoUrl,
        createdAt: user.createdAt,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao autenticar com o Google.';
    res.status(401).json({ error: message });
  }
});

// 3. Check Session / Current User
apiRouter.get('/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.query.token as string);

  if (!token) {
    res.json({ authenticated: false });
    return;
  }

  const session = getUserSession(token);
  if (!session) {
    res.json({ authenticated: false });
    return;
  }

  const user = db.getUserById(session.userId);
  if (!user) {
    res.json({ authenticated: false });
    return;
  }

  res.json({
    authenticated: true,
    user: {
      id: user.id,
      firebaseUid: user.firebaseUid,
      username: user.username,
      email: user.email,
    },
  });
});

// 4. Logout
apiRouter.post('/auth/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.query.token as string);

  if (token) {
    await db.deleteSession(token);
  }
  res.json({ success: true });
});

// 5. Password Reset Request via Firebase Authentication or Local DB
apiRouter.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    res.status(400).json({ error: 'Informe o e-mail cadastrado.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    if (FirebaseAuthService.hasApiKey()) {
      // Send password reset email directly via Firebase Authentication
      await FirebaseAuthService.sendPasswordResetEmail(cleanEmail);

      res.json({
        success: true,
        message:
          'Se existir uma conta cadastrada com este e-mail, as instruções de redefinição de senha do Firebase Authentication foram enviadas.',
      });
    } else {
      const user = db.getUserByEmail(cleanEmail);
      if (user) {
        const { token } = await db.createPasswordResetToken(user.id);
        res.json({
          success: true,
          message:
            'Solicitação de recuperação processada. Copie o token de recuperação abaixo para redefinir sua senha.',
          token,
        });
      } else {
        res.json({
          success: true,
          message: 'Se existir uma conta cadastrada com este e-mail, as instruções foram processadas.',
        });
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao solicitar recuperação de senha.';
    res.status(500).json({ error: message });
  }
});

// 6. Verify Reset Token / Code (Firebase oobCode or Local Token)
apiRouter.get('/auth/verify-reset-token', async (req, res) => {
  const token = (req.query.token || req.query.oobCode) as string;
  if (!token) {
    res.status(400).json({ valid: false, error: 'Código ou token de recuperação não fornecido.' });
    return;
  }

  try {
    if (FirebaseAuthService.hasApiKey()) {
      const result = await FirebaseAuthService.verifyPasswordResetCode(token);
      const user = db.getUserByEmail(result.email);
      res.json({
        valid: true,
        email: result.email,
        username: user?.username || result.email,
      });
    } else {
      const result = db.verifyPasswordResetToken(token);
      if (!result.valid || !result.user) {
        res.status(400).json({
          valid: false,
          error: result.error || 'Código de recuperação inválido ou expirado.',
        });
        return;
      }
      res.json({
        valid: true,
        email: result.user.email,
        username: result.user.username,
      });
    }
  } catch (err: any) {
    res.status(400).json({
      valid: false,
      error: err.message || 'Código de recuperação inválido ou expirado.',
    });
  }
});

// 7. Reset Password (Firebase confirmPasswordReset or Local DB)
apiRouter.post('/auth/reset-password', async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Token ou código de recuperação ausente.' });
    return;
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
    return;
  }

  if (newPassword !== confirmPassword) {
    res.status(400).json({ error: 'A confirmação de senha não confere.' });
    return;
  }

  try {
    if (FirebaseAuthService.hasApiKey()) {
      const result = await FirebaseAuthService.confirmPasswordReset(token, newPassword);
      res.json({
        success: true,
        message: 'Senha redefinida com sucesso! Você já pode entrar com seu usuário e a nova senha.',
        email: result.email,
      });
    } else {
      const result = await db.resetUserPassword(token, newPassword);
      if (!result.success) {
        res.status(400).json({
          error: result.error || 'Erro ao redefinir senha.',
        });
        return;
      }
      res.json({
        success: true,
        message: 'Senha redefinida com sucesso! Você já pode entrar com seu usuário e a nova senha.',
      });
    }
  } catch (err: any) {
    res.status(400).json({
      error: err.message || 'Erro ao redefinir senha.',
    });
  }
});

// Backward-compatible admin aliases
apiRouter.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Informe o usuário e a senha.' });
    return;
  }
  const cleanIdentifier = (username as string).trim();
  const user = db.getUserByUsername(cleanIdentifier) || db.getUserByEmail(cleanIdentifier);
  if (!user) {
    res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    return;
  }

  try {
    let sessionUserId = user.id;

    if (FirebaseAuthService.hasApiKey()) {
      let firebaseUid = user.firebaseUid;
      if (firebaseUid) {
        await FirebaseAuthService.signInWithPassword(user.email, password);
      } else if (user.passwordHash && user.salt && verifyPassword(password, user.passwordHash, user.salt)) {
        try {
          const fbCreated = await FirebaseAuthService.createAccount(user.email, password);
          firebaseUid = fbCreated.localId;
        } catch (fbErr: any) {
          const fbLogin = await FirebaseAuthService.signInWithPassword(user.email, password);
          firebaseUid = fbLogin.localId;
        }
        db.linkUserFirebaseUid(user.id, firebaseUid);
      } else {
        const fbAuth = await FirebaseAuthService.signInWithPassword(user.email, password);
        firebaseUid = fbAuth.localId;
        db.linkUserFirebaseUid(user.id, firebaseUid);
      }
      sessionUserId = firebaseUid;
    } else {
      if (!user.passwordHash || !user.salt) {
        res.status(401).json({ error: 'Usuário ou senha incorretos.' });
        return;
      }
      const isValid = verifyPassword(password, user.passwordHash, user.salt);
      if (!isValid) {
        res.status(401).json({ error: 'Usuário ou senha incorretos.' });
        return;
      }
      sessionUserId = user.id;
    }

    const session = await db.createSession(sessionUserId);
    res.json({
      success: true,
      token: session.token,
      user: { id: sessionUserId, firebaseUid: user.firebaseUid, username: user.username, email: user.email },
    });
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Usuário ou senha incorretos.' });
  }
});

apiRouter.get('/admin/check', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.query.token as string);

  if (!token) {
    res.json({ authenticated: false });
    return;
  }

  const session = getUserSession(token);
  if (!session) {
    res.json({ authenticated: false });
    return;
  }

  const user = db.getUserById(session.userId);
  if (!user) {
    res.json({ authenticated: false });
    return;
  }

  res.json({
    authenticated: true,
    user: { id: user.id, firebaseUid: user.firebaseUid, username: user.username, email: user.email },
  });
});

apiRouter.post('/admin/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.query.token as string);
  if (token) {
    await db.deleteSession(token);
  }
  res.json({ success: true });
});

// Safe profile deletion endpoint
apiRouter.delete('/admin/users/self', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  try {
    const success = await db.deleteUserAccount(userId);
    res.json({ success, message: 'Perfil de usuário excluído com sucesso.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao excluir perfil de usuário.';
    res.status(500).json({ error: message });
  }
});

// --- Admin Meeting Management with Strict User Data Isolation ---

apiRouter.get('/admin/meetings', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const status = req.query.status as string | undefined;

  const meetings = db.getMeetingsByUser(userId, status as any);
  res.json({ meetings });
});

// History organized by Year and Month (Closed Meetings Only, User Isolated)
apiRouter.get('/admin/meetings/history', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const history = db.getClosedMeetingsHistory(userId);
  res.json({ history });
});

// Delete all closed meetings of a specific Month (Protected: Admin & User Isolated)
apiRouter.delete('/admin/meetings/history/month', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { year, month } = req.body;
  const parsedYear = parseInt(year, 10);
  const parsedMonth = parseInt(month, 10);

  if (isNaN(parsedYear) || isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    res.status(400).json({ error: 'Ano e mês inválidos.' });
    return;
  }

  try {
    const result = await db.deleteClosedMeetingsByMonth(parsedYear, parsedMonth, userId);
    res.json({ success: true, count: result.count });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao excluir reuniões.';
    res.status(500).json({ error: message });
  }
});

// Delete all closed meetings of a specific Year (Protected: Admin & User Isolated)
apiRouter.delete('/admin/meetings/history/year', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { year } = req.body;
  const parsedYear = parseInt(year, 10);

  if (isNaN(parsedYear)) {
    res.status(400).json({ error: 'Ano inválido.' });
    return;
  }

  try {
    const result = await db.deleteClosedMeetingsByYear(parsedYear, userId);
    res.json({ success: true, count: result.count });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao excluir reuniões.';
    res.status(500).json({ error: message });
  }
});

apiRouter.post('/admin/meetings', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { name, description, nominationCommissionName, congregationName } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'O nome da reunião é obrigatório.' });
    return;
  }

  try {
    const commName = congregationName !== undefined ? congregationName : nominationCommissionName;
    const meeting = await db.createMeeting(name, description, userId, commName);
    res.status(201).json({ meeting });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao criar reunião.';
    res.status(500).json({ error: message });
  }
});

// Endpoint para Inicializar Reunião Isolada de Demonstração (Dados Sintéticos)
apiRouter.post('/admin/demo-seed-assisted-elimination', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  try {
    const meeting = await db.createDemoMeeting(userId);
    res.json({
      success: true,
      message: 'Reunião fictícia de demonstração gerada com sucesso na memória local!',
      code: meeting.code,
      meeting,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao inicializar demonstração.';
    res.status(500).json({ error: message });
  }
});

// Update meeting details (Protected: Admin & User Isolated)
apiRouter.put('/admin/meetings/:code', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const { name, description, nominationCommissionName, congregationName } = req.body;

  const meeting = db.getMeetingByCode(code);
  if (!meeting) {
    res.status(404).json({ error: 'Reunião não encontrada.' });
    return;
  }

  if (meeting.userId && meeting.userId !== userId) {
    res.status(403).json({ error: 'Você não tem permissão para editar esta reunião.' });
    return;
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'O nome da reunião é obrigatório.' });
    return;
  }

  try {
    const updated = await db.updateMeeting(meeting.id, {
      name,
      description,
      nominationCommissionName,
      congregationName,
    });
    if (!updated) {
      res.status(404).json({ error: 'Reunião não encontrada.' });
      return;
    }

    res.json({ meeting: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar reunião.';
    res.status(500).json({ error: message });
  }
});

// Delete single closed meeting (Protected: Admin & User Isolated)
apiRouter.delete('/admin/meetings/:code', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting) {
    res.status(404).json({ error: 'Reunião não encontrada.' });
    return;
  }

  if (meeting.userId && meeting.userId !== userId) {
    res.status(403).json({ error: 'Você não tem permissão para excluir esta reunião.' });
    return;
  }

  if (meeting.status !== 'MEETING_CLOSED') {
    res.status(400).json({
      error: 'Reuniões ativas não podem ser excluídas. Apenas reuniões encerradas podem ser excluídas.',
    });
    return;
  }

  try {
    const result = await db.deleteClosedMeeting(meeting.id, userId);
    if (!result.success) {
      res.status(400).json({ error: result.error || 'Erro ao excluir reunião.' });
      return;
    }

    res.json({ success: true, message: 'Reunião e dados associados excluídos permanentemente.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao excluir reunião.';
    res.status(500).json({ error: message });
  }
});

apiRouter.get('/admin/meetings/:code', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const participantCount = sseManager.getParticipantCount(code);
  const participants = sseManager.getParticipants(code);
  const state = db.getAdminMeetingState(code, participantCount, participants);

  if (!state) {
    res.status(404).json({ error: 'Reunião não encontrada.' });
    return;
  }

  res.json(state);
});

// --- Módulo Indicações (Nominations) Admin Endpoints ---

// 1. Central catalog of departments
apiRouter.get('/admin/departments/catalog', requireAdmin, (_req, res) => {
  res.json({ catalog: CENTRAL_DEPARTMENT_CATALOG });
});

// 2. Get nomination configuration for a specific meeting
apiRouter.get('/admin/meetings/:code/nominations/config', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const config = db.getOrCreateNominationConfig(meeting.id);
  res.json({ config });
});

// 3. Save / update nomination configuration for a specific meeting
apiRouter.put('/admin/meetings/:code/nominations/config', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { enabled, status, deadline, departments } = req.body;

  if (status && !['NOT_CONFIGURED', 'OPEN', 'CLOSED'].includes(status)) {
    res.status(400).json({ error: 'Status de indicações inválido.' });
    return;
  }

  try {
    const updated = await db.saveNominationConfig(meeting.id, {
      enabled,
      status,
      deadline: deadline !== undefined ? deadline : undefined,
      departments,
    });
    res.json({ success: true, config: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao salvar configurações de indicações.';
    res.status(400).json({ error: msg });
  }
});

// 4. Get nomination summary for a specific meeting
apiRouter.get('/admin/meetings/:code/nominations/summary', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const summary = db.getNominationAdminSummary(meeting.id);
  if (!summary) {
    res.status(404).json({ error: 'Resumo de indicações não disponível.' });
    return;
  }

  res.json({ summary });
});

// Custom department endpoints (PARTE 10-15)
apiRouter.post('/admin/meetings/:code/nominations/departments', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }
  const { name, maxPerPerson } = req.body;
  try {
    const config = await db.addCustomDepartment(meeting.id, name, maxPerPerson);
    res.status(201).json({ success: true, config, message: 'Departamento adicionado com sucesso.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao adicionar departamento.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.patch('/admin/meetings/:code/nominations/departments/:departmentId', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, departmentId } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }
  const { name, maxPerPerson, enabled } = req.body;
  try {
    const config = await db.updateDepartment(meeting.id, departmentId, { name, maxPerPerson, enabled });
    res.json({ success: true, config, message: 'Departamento atualizado com sucesso.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao atualizar departamento.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.delete('/admin/meetings/:code/nominations/departments/:departmentId', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, departmentId } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }
  const forceDisableOnly = Boolean(req.body?.forceDisableOnly || req.query?.forceDisableOnly === 'true');
  try {
    const result = await db.deleteOrDisableDepartment(meeting.id, departmentId, forceDisableOnly);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao excluir/desativar departamento.';
    res.status(400).json({ error: msg });
  }
});

// Expected participants tracking endpoints (PARTE 20-28)
apiRouter.get('/admin/meetings/:code/nominations/participants/tracking', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }
  try {
    const tracking = db.getParticipantsTracking(meeting.id);
    res.json({ success: true, tracking });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao recuperar acompanhamento de participantes.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.get('/admin/meetings/:code/nominations/participants/expected', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }
  try {
    const expected = db.getExpectedParticipants(meeting.id);
    res.json({ success: true, expected });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao listar participantes esperados.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.post('/admin/meetings/:code/nominations/participants/expected', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }
  const { names } = req.body;
  if (!Array.isArray(names) || names.length === 0) {
    res.status(400).json({ error: 'Informe ao menos um nome de participante.' });
    return;
  }
  try {
    const expected = await db.addExpectedParticipants(meeting.id, names);
    res.status(201).json({ success: true, expected, message: 'Participante(s) esperado(s) adicionado(s) com sucesso.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao adicionar participantes esperados.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.delete('/admin/meetings/:code/nominations/participants/expected/:participantId', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, participantId } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }
  try {
    await db.removeExpectedParticipant(meeting.id, participantId);
    res.json({ success: true, message: 'Participante esperado removido com sucesso.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao remover participante esperado.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.delete('/admin/meetings/:code/nominations/participants/expected', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }
  try {
    await db.clearExpectedParticipants(meeting.id);
    res.json({ success: true, message: 'Lista de participantes esperados limpa com sucesso.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao limpar participantes esperados.';
    res.status(400).json({ error: msg });
  }
});

// List all nominations for admin organization
apiRouter.get('/admin/meetings/:code/nominations', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const nominations = db.getNominationsByMeeting(meeting.id);
  const summary = db.getNominationAdminSummary(meeting.id);

  res.json({
    success: true,
    nominations,
    summary,
  });
});

// Manually add nomination by admin
apiRouter.post('/admin/meetings/:code/nominations', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { departmentId, nomineeName } = req.body;
  try {
    const nomination = await db.addManualNomination({
      meetingId: meeting.id,
      departmentId,
      nomineeName,
    });
    res.json({ success: true, nomination });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao adicionar indicação.';
    res.status(400).json({ error: msg });
  }
});

// Edit nomination record (nomineeName spelling correction)
apiRouter.patch('/admin/meetings/:code/nominations/:nominationId', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, nominationId } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { nomineeName } = req.body;
  try {
    const updated = await db.updateNominationRecord({
      meetingId: meeting.id,
      nominationId,
      nomineeName,
    });
    res.json({ success: true, nomination: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao atualizar indicação.';
    const isNotFound = msg.includes('não encontrada');
    res.status(isNotFound ? 404 : 400).json({ error: msg });
  }
});

// Delete individual nomination record
apiRouter.delete('/admin/meetings/:code/nominations/:nominationId', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, nominationId } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    await db.deleteNominationRecord(meeting.id, nominationId);
    res.json({ success: true, message: 'Indicação excluída com sucesso.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao excluir indicação.';
    const isNotFound = msg.includes('não encontrada');
    res.status(isNotFound ? 404 : 400).json({ error: msg });
  }
});

// Selection endpoints for future poll creation (Etapa 2D)
// 1. Get all selected nominees for a meeting
apiRouter.get('/admin/meetings/:code/nominations/selections', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const selections = db.getSelectedNomineesByMeeting(meeting.id);
  res.json({ success: true, selections });
});

// 2. Add / Toggle-on selection of a nominee
apiRouter.post('/admin/meetings/:code/nominations/selections', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { departmentId, nomineeName } = req.body;
  try {
    const selection = await db.addSelectedNominee({
      meetingId: meeting.id,
      departmentId,
      nomineeName,
      selectedBy: userId,
    });
    res.json({ success: true, selection });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao registrar seleção.';
    res.status(400).json({ error: msg });
  }
});

// 3. Remove / Toggle-off selection by selectionId
apiRouter.delete('/admin/meetings/:code/nominations/selections/:selectionId', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, selectionId } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    await db.removeSelectedNominee(meeting.id, selectionId);
    res.json({ success: true, message: 'Seleção removida com sucesso.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao remover seleção.';
    const isNotFound = msg.includes('não encontrada');
    res.status(isNotFound ? 404 : 400).json({ error: msg });
  }
});

// 4. Remove / Toggle-off selection by department and name
apiRouter.delete('/admin/meetings/:code/nominations/selections', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { departmentId, nomineeName } = req.body;
  try {
    await db.removeSelectedNomineeByName({
      meetingId: meeting.id,
      departmentId,
      nomineeName,
    });
    res.json({ success: true, message: 'Seleção removida com sucesso.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao remover seleção.';
    res.status(400).json({ error: msg });
  }
});

// 5. Batch Select / Deselect for a department
apiRouter.post('/admin/meetings/:code/nominations/selections/batch', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { departmentId, action, nomineeNames } = req.body;
  if (!departmentId) {
    res.status(400).json({ error: 'ID do departamento é obrigatório.' });
    return;
  }

  try {
    let selections: any[] = [];
    if (action === 'select_all') {
      if (!Array.isArray(nomineeNames) || nomineeNames.length === 0) {
        res.status(400).json({ error: 'Lista de nomes é obrigatória para seleção em lote.' });
        return;
      }
      selections = await db.batchSelectDepartmentNominees({
        meetingId: meeting.id,
        departmentId,
        nomineeNames,
        selectedBy: userId,
      });
    } else if (action === 'deselect_all') {
      selections = await db.batchDeselectDepartmentNominees({
        meetingId: meeting.id,
        departmentId,
      });
    } else {
      res.status(400).json({ error: 'Ação inválida. Use select_all ou deselect_all.' });
      return;
    }

    res.json({ success: true, selections });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao processar seleção em lote.';
    res.status(400).json({ error: msg });
  }
});

// 5. Create poll (pauta) from selected nominees (Etapa 2E)
apiRouter.post('/admin/meetings/:code/nominations/create-pauta', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { departmentId, nomineeNames, question, allowMultiple, maxChoices } = req.body;

  try {
    const poll = await db.createPollFromSelectedNominations({
      meetingId: meeting.id,
      departmentId,
      nomineeNames,
      question,
      allowMultiple: Boolean(allowMultiple),
      maxChoices: maxChoices !== undefined ? Number(maxChoices) : undefined,
    });
    res.json({
      success: true,
      message: 'Pauta criada com sucesso a partir dos selecionados!',
      poll,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao criar pauta a partir das indicações.';
    res.status(400).json({ error: msg });
  }
});

// 5. Generate nomination link / open nominations
apiRouter.post('/admin/meetings/:code/nominations/generate-link', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { deadline, departments } = req.body;

  try {
    const updated = await db.saveNominationConfig(meeting.id, {
      enabled: true,
      status: 'OPEN',
      deadline: deadline !== undefined ? deadline : undefined,
      departments,
    });

    res.json({
      success: true,
      config: updated,
      publicToken: updated.publicToken,
      linkPath: `/indicacoes/${updated.publicToken}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar link de indicações.';
    res.status(400).json({ error: msg });
  }
});

// 6. Public endpoint to verify and fetch nomination state by publicToken (no admin info revealed)
apiRouter.get('/public/nominations/:token', (req, res) => {
  const { token } = req.params;
  const state = db.getPublicNominationState(token);
  if (!state.valid && state.status === 'NOT_FOUND') {
    res.status(404).json(state);
    return;
  }
  res.json(state);
});

// 7. Public endpoint to start/restore participant nomination session
apiRouter.post('/api/public/nominations/:token/session', async (req, res) => {
  const { token } = req.params;
  const { nominatorName, existingSessionId } = req.body;
  try {
    const session = await db.createOrGetParticipantSession({
      publicToken: token,
      nominatorName,
      existingSessionId,
    });
    res.json({ success: true, ...session });
  } catch (err: unknown) {
    const status = (err as any)?.status || 400;
    const msg = err instanceof Error ? err.message : 'Erro ao iniciar sessão de indicações.';
    res.status(status === 'EXPIRED' ? 400 : 400).json({ error: msg, status });
  }
});

// 8. Public endpoint to retrieve saved nominations of a participant session (for local continuity)
apiRouter.get('/public/nominations/:token/session/:sessionId', (req, res) => {
  const { token, sessionId } = req.params;
  try {
    const sessionData = db.getParticipantNominations(token, sessionId);
    res.json({ success: true, ...sessionData });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao recuperar indicações da sessão.';
    res.status(404).json({ error: msg });
  }
});

// Also support matching with and without /api/ prefix if mounted on router
apiRouter.post('/public/nominations/:token/session', async (req, res) => {
  const { token } = req.params;
  const { nominatorName, existingSessionId } = req.body;
  try {
    const session = await db.createOrGetParticipantSession({
      publicToken: token,
      nominatorName,
      existingSessionId,
    });
    res.json({ success: true, ...session });
  } catch (err: unknown) {
    const status = (err as any)?.status || 400;
    const msg = err instanceof Error ? err.message : 'Erro ao iniciar sessão de indicações.';
    res.status(400).json({ error: msg, status });
  }
});

// 9. Public endpoint to save/update nominations for a participant session (supports per-department and bulk)
apiRouter.post('/public/nominations/:token/save', async (req, res) => {
  const { token } = req.params;
  const { sessionId, nominatorName, departmentId, nomineeNames, nominations, finalized } = req.body;

  try {
    const result = await db.saveParticipantNominations({
      publicToken: token,
      sessionId,
      nominatorName,
      departmentId,
      nomineeNames,
      nominations,
      finalized: Boolean(finalized),
    });
    res.json({
      success: true,
      message: 'Indicações salvas com sucesso.',
      ...result,
    });
  } catch (err: unknown) {
    const status = (err as any)?.status || 400;
    const msg = err instanceof Error ? err.message : 'Erro ao salvar indicações.';
    res.status(status === 'EXPIRED' ? 400 : 400).json({ error: msg, status });
  }
});

// 10. Public endpoint to explicitly finalize participant session (PARTE 10, 11)
apiRouter.post('/public/nominations/:token/finalize', async (req, res) => {
  const { token } = req.params;
  const { sessionId, nominatorName } = req.body;

  try {
    const result = await db.finalizeParticipantSession({
      publicToken: token,
      sessionId,
      nominatorName,
    });
    res.json({
      success: true,
      message: 'Sessão finalizada com sucesso.',
      ...result,
    });
  } catch (err: unknown) {
    const status = (err as any)?.status || 400;
    const msg = err instanceof Error ? err.message : 'Erro ao finalizar indicações.';
    res.status(status === 'EXPIRED' ? 400 : 400).json({ error: msg, status });
  }
});

// ========================================================
// --- MÓDULO EXPERIMENTAL: INDICAÇÕES DA IGREJA (CONSULTIVO) ---
// ========================================================

// 1. Obter relatório consolidado e configuração das indicações da igreja
apiRouter.get('/admin/meetings/:code/church-nominations', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const config = await db.getOrCreateChurchNominationConfig(meeting.id);
  const report = db.getChurchNominationsReport(meeting.id);

  res.json({
    success: true,
    config,
    report,
  });
});

// 2. Salvar configuração das indicações da igreja (ativar/desativar, status, prazo)
apiRouter.post('/admin/meetings/:code/church-nominations/config', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { enabled, status, deadline } = req.body;

  try {
    const updated = await db.saveChurchNominationConfig(meeting.id, {
      enabled: enabled !== undefined ? Boolean(enabled) : undefined,
      status,
      deadline: deadline !== undefined ? deadline : undefined,
    });

    res.json({
      success: true,
      config: updated,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao salvar configuração.';
    res.status(400).json({ error: msg });
  }
});

// 3. Abrir indicações e gerar/obter link público para a igreja
apiRouter.post('/admin/meetings/:code/church-nominations/open', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { deadline } = req.body;

  try {
    const updated = await db.saveChurchNominationConfig(meeting.id, {
      enabled: true,
      status: 'OPEN',
      deadline: deadline !== undefined ? deadline : undefined,
    });

    res.json({
      success: true,
      config: updated,
      publicToken: updated.publicToken,
      linkPath: `/indicacoes-igreja/${updated.publicToken}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao abrir indicações da igreja.';
    res.status(400).json({ error: msg });
  }
});

// 4. Encerrar indicações da igreja
apiRouter.post('/admin/meetings/:code/church-nominations/close', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    const updated = await db.saveChurchNominationConfig(meeting.id, {
      status: 'CLOSED',
    });

    res.json({
      success: true,
      config: updated,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao encerrar indicações da igreja.';
    res.status(400).json({ error: msg });
  }
});

// 5. Gerar novo token público exclusivo
apiRouter.post('/admin/meetings/:code/church-nominations/new-token', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    const updated = await db.generateNewChurchNominationToken(meeting.id);
    res.json({
      success: true,
      config: updated,
      publicToken: updated.publicToken,
      linkPath: `/indicacoes-igreja/${updated.publicToken}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar novo link.';
    res.status(400).json({ error: msg });
  }
});

// 6. Endpoint público para verificar status e obter departamentos para o membro da igreja
apiRouter.get('/public/church-nominations/:token', (req, res) => {
  const { token } = req.params;
  const state = db.getPublicChurchNominationState(token);
  if (!state.valid && state.status === 'NOT_FOUND') {
    res.status(404).json(state);
    return;
  }
  res.json(state);
});

// 7. Endpoint público para envio de resposta pelo membro da igreja
apiRouter.post('/public/church-nominations/:token/submit', async (req, res) => {
  const { token } = req.params;
  const { participantName, selectedDepartments, nominations } = req.body;

  try {
    const submission = await db.submitChurchNomination(token, {
      participantName,
      selectedDepartments,
      nominations,
    });

    res.json({
      success: true,
      message: 'Indicações registradas com sucesso!',
      submissionId: submission.id,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao enviar indicações.';
    res.status(400).json({ error: msg });
  }
});

// 8. Relatório Consultivo em Formato Pronto para Impressão / Salvar PDF
apiRouter.get('/admin/meetings/:code/church-nominations/pdf', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).send('Reunião não encontrada ou acesso não autorizado.');
    return;
  }

  const report = db.getChurchNominationsReport(meeting.id);
  const displayTitle = formatMeetingTitle(meeting.name, meeting.nominationCommissionName);
  const dateStr = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const activeDepts = report.departmentConsolidations.filter(
    (d) => d.totalMentions > 0 || d.interestCount > 0
  );

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Relatório Consultivo — Indicações da Igreja — ${displayTitle}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111827;
      background: #FFFFFF;
      margin: 0;
      padding: 24px;
      line-height: 1.4;
      font-size: 13px;
    }
    .no-print-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #F3F4F6;
      border: 1px solid #E5E7EB;
      padding: 12px 18px;
      border-radius: 12px;
      margin-bottom: 24px;
    }
    .btn {
      background: #111827;
      color: #FFFFFF;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 12px;
      cursor: pointer;
    }
    .header {
      border-bottom: 2px solid #111827;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }
    .title {
      font-size: 20px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: -0.5px;
      margin: 0 0 4px 0;
    }
    .subtitle {
      font-size: 13px;
      color: #4B5563;
      margin: 0;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 20px;
    }
    .meta-item { font-size: 11px; }
    .meta-label { font-weight: 700; color: #6B7280; text-transform: uppercase; font-size: 10px; }
    .meta-value { font-weight: 700; color: #111827; font-size: 13px; margin-top: 2px; }
    .disclaimer-box {
      background: #FEF3C7;
      border: 1px solid #FCD34D;
      color: #92400E;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 24px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #D1D5DB;
      padding-bottom: 6px;
      margin: 20px 0 12px 0;
      color: #111827;
    }
    .dept-card {
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
      page-break-inside: avoid;
    }
    .dept-name {
      font-size: 13px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 8px;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-interest { background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; }
    .badge-mention { background: #F3F4F6; color: #1F2937; border: 1px solid #E5E7EB; }
    .sub-section { margin-top: 8px; }
    .sub-title { font-size: 11px; font-weight: 700; color: #4B5563; text-transform: uppercase; margin-bottom: 4px; }
    .names-list { font-size: 12px; color: #374151; }
    .footer {
      margin-top: 36px;
      border-top: 1px solid #E5E7EB;
      padding-top: 12px;
      font-size: 10px;
      color: #9CA3AF;
      text-align: center;
    }
    @media print {
      .no-print-bar { display: none !important; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div>
      <strong>Relatório Consultivo — Indicações da Igreja</strong>
      <span style="font-size:11px; color:#6B7280; margin-left:8px;">Pronto para impressão ou exportação em PDF</span>
    </div>
    <button class="btn" onclick="window.print()">Salvar / Imprimir PDF</button>
  </div>

  <div class="header">
    <h1 class="title">Relatório Consultivo — Indicações da Igreja</h1>
    <p class="subtitle">${displayTitle}</p>
  </div>

  <div class="disclaimer-box">
    Estas informações são recomendações e manifestações da igreja e servem como subsídio para a Comissão de Nomeações. Não representam votação ou decisão oficial.
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <div class="meta-label">Total de Respostas</div>
      <div class="meta-value">${report.totalSubmissions}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Membros Participantes</div>
      <div class="meta-value">${report.uniqueParticipants}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Data de Emissão</div>
      <div class="meta-value">${dateStr}</div>
    </div>
  </div>

  <div class="section-title">Consolidação por Departamentos</div>
  ${
    activeDepts.length === 0
      ? '<p style="color:#6B7280; font-style:italic;">Nenhuma resposta registrada até o momento.</p>'
      : activeDepts
          .map((dept) => {
            return `
    <div class="dept-card">
      <div class="dept-name">
        ${dept.departmentName}
        ${
          dept.interestCount > 0
            ? `<span class="badge badge-interest" style="margin-left:8px;">${dept.interestCount} ${
                dept.interestCount === 1 ? 'interesse' : 'interesses'
              }</span>`
            : ''
        }
        ${
          dept.totalMentions > 0
            ? `<span class="badge badge-mention" style="margin-left:4px;">${dept.totalMentions} ${
                dept.totalMentions === 1 ? 'recomendação' : 'recomendações'
              }</span>`
            : ''
        }
      </div>

      ${
        dept.interestedParticipants && dept.interestedParticipants.length > 0
          ? `
        <div class="sub-section">
          <div class="sub-title">Manifestaram Interesse em Servir:</div>
          <div class="names-list">${dept.interestedParticipants.join(', ')}</div>
        </div>
      `
          : ''
      }

      ${
        dept.nominees.length > 0
          ? `
        <div class="sub-section">
          <div class="sub-title">Pessoas Recomendadas:</div>
          <div class="names-list">
            ${dept.nominees
              .map(
                (n) =>
                  `<strong>${n.personName}</strong> (${n.count} ${
                    n.count === 1 ? 'indicação' : 'indicações'
                  }${
                    n.recommenders && n.recommenders.length > 0
                      ? ` — por: ${n.recommenders.join(', ')}`
                      : ''
                  })`
              )
              .join('; ')}
          </div>
        </div>
      `
          : ''
      }
    </div>`;
          })
          .join('')
  }

  <div class="footer">
    VOTAIASD V2 — Sistema de Votação e Indicações • Documento de Consulta Interna
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

apiRouter.post('/admin/meetings/:code/polls', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const { question, options, allowMultiple, maxChoices, openImmediately, parentPollId, isAssociatePoll } = req.body;

  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    res.status(400).json({ error: 'A pergunta da pauta é obrigatória.' });
    return;
  }

  if (!Array.isArray(options) || options.length < 2) {
    res.status(400).json({ error: 'Adicione pelo menos 2 opções de voto.' });
    return;
  }

  try {
    const shouldOpen = openImmediately !== undefined ? Boolean(openImmediately) : false;
    const poll = await db.createPoll(
      meeting.id,
      question,
      options,
      Boolean(allowMultiple),
      maxChoices ? Number(maxChoices) : 1,
      2,
      'MANUAL',
      undefined,
      shouldOpen,
      parentPollId,
      Boolean(isAssociatePoll || parentPollId)
    );
    if (!poll) {
      res.status(400).json({ error: 'Não foi possível criar a pauta. A reunião pode estar encerrada.' });
      return;
    }

    // Broadcast poll creation/state to clients
    sseManager.notifyPollChanged(code);

    res.status(201).json({ poll });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao criar pauta.';
    res.status(400).json({ error: message });
  }
});

// Edit an existing poll (draft or closed)
apiRouter.put('/admin/meetings/:code/polls/:pollId', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, pollId } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { question, options, optionItems, allowMultiple, maxChoices, forceStructuralChange } = req.body;

  try {
    const result = await db.editPoll(meeting.id, pollId, {
      question,
      options,
      optionItems: Array.isArray(optionItems) ? optionItems : undefined,
      allowMultiple: allowMultiple !== undefined ? Boolean(allowMultiple) : undefined,
      maxChoices: maxChoices !== undefined ? Number(maxChoices) : undefined,
      forceStructuralChange: Boolean(forceStructuralChange),
    });

    if (result.requiresConfirmation) {
      res.json({
        requiresConfirmation: true,
        message: result.message,
        poll: result.poll,
      });
      return;
    }

    sseManager.notifyPollChanged(code);
    res.json({ success: true, poll: result.poll });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao editar pauta.';
    res.status(400).json({ error: message });
  }
});

// Delete an existing poll (draft or closed)
apiRouter.delete('/admin/meetings/:code/polls/:pollId', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, pollId } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    const deleted = await db.deletePoll(meeting.id, pollId);
    if (!deleted) {
      res.status(400).json({ error: 'Não foi possível excluir a pauta.' });
      return;
    }

    sseManager.notifyPollChanged(code);
    res.json({ success: true, message: 'Pauta excluída com sucesso.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao excluir pauta.';
    res.status(400).json({ error: message });
  }
});

apiRouter.patch('/admin/meetings/:code/polls/:pollId/config', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, pollId } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { allowMultiple, maxChoices } = req.body;
  try {
    const updated = await db.updatePollConfig(meeting.id, pollId, {
      allowMultiple: Boolean(allowMultiple),
      maxChoices: maxChoices !== undefined ? Number(maxChoices) : undefined,
    });
    sseManager.notifyPollChanged(code);
    res.json({ success: true, poll: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar configuração da pauta.';
    res.status(400).json({ error: message });
  }
});

// Update associates directly on a poll (without voting)
apiRouter.put('/admin/meetings/:code/polls/:pollId/associates', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, pollId } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { associates } = req.body;
  if (!Array.isArray(associates)) {
    res.status(400).json({ error: 'Lista de associados inválida.' });
    return;
  }

  try {
    const updated = await db.updatePollAssociates(meeting.id, pollId, associates);
    sseManager.notifyPollChanged(code);
    res.json({ success: true, poll: updated, associates: updated.associates || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar associados.';
    res.status(400).json({ error: message });
  }
});

apiRouter.post('/admin/meetings/:code/polls/:pollId/open', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, pollId } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const updatedPoll = await db.openPoll(pollId);
  if (!updatedPoll) {
    res.status(400).json({ error: 'Não foi possível abrir a votação.' });
    return;
  }

  sseManager.notifyPollChanged(code);
  res.json({ success: true, poll: updatedPoll });
});

apiRouter.post('/admin/meetings/:code/polls/:pollId/close', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, pollId } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const updatedPoll = await db.closePoll(pollId);
  if (!updatedPoll) {
    res.status(400).json({ error: 'Não foi possível encerrar a votação.' });
    return;
  }

  const finalResult = db.calculatePollResult(pollId);
  sseManager.notifyPollChanged(code);

  res.json({ success: true, poll: updatedPoll, result: finalResult });
});

apiRouter.post('/admin/meetings/:code/polls/:pollId/reopen', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, pollId } = req.params;
  const { options, cutoffPercentageApplied, candidatesConfirmed, candidatesKept, candidatesRemoved } = req.body || {};

  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    const decisionAuditInput = {
      cutoffPercentageApplied: typeof cutoffPercentageApplied === 'number' ? cutoffPercentageApplied : undefined,
      candidatesConfirmed: Array.isArray(candidatesConfirmed) ? candidatesConfirmed : undefined,
      candidatesKept: Array.isArray(candidatesKept) ? candidatesKept : undefined,
      candidatesRemoved: Array.isArray(candidatesRemoved) ? candidatesRemoved : undefined,
    };
    const result = await db.reopenPoll(
      meeting.id,
      pollId,
      Array.isArray(options) ? options : undefined,
      decisionAuditInput
    );
    sseManager.notifyPollChanged(code);
    res.json({ success: true, newPoll: result.newPoll, previousPoll: result.previousPoll });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao reabrir votação.';
    res.status(400).json({ error: message });
  }
});

// Explicit confirmation of an eligible candidate without deleting options or votes (ALTO-01)
apiRouter.post('/admin/meetings/:code/polls/:pollId/confirm-candidate', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, pollId } = req.params;
  const { candidateName, optionId } = req.body || {};

  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    const candidateIdentifier = (candidateName || optionId || '').trim();
    const result = await db.confirmPollCandidate(meeting.id, pollId, candidateIdentifier);
    sseManager.notifyPollChanged(code);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao confirmar candidato.';
    res.status(400).json({ error: message });
  }
});

// Explicit persistence of administrative decisions in progressive assisted elimination (MÉDIO-01)
apiRouter.post('/admin/meetings/:code/polls/:pollId/save-assisted-decisions', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, pollId } = req.params;
  const { candidatesConfirmed, candidatesRemoved, cutoffPercentageApplied } = req.body || {};

  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    const decisions = {
      candidatesConfirmed: Array.isArray(candidatesConfirmed) ? candidatesConfirmed : undefined,
      candidatesRemoved: Array.isArray(candidatesRemoved) ? candidatesRemoved : undefined,
      cutoffPercentageApplied: typeof cutoffPercentageApplied === 'number' ? cutoffPercentageApplied : undefined,
    };
    const result = await db.saveAssistedDecisions(meeting.id, pollId, decisions);
    sseManager.notifyPollChanged(code);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar decisões administrativas.';
    res.status(400).json({ error: message });
  }
});

apiRouter.post('/admin/meetings/:code/close', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const closed = await db.closeMeeting(meeting.id);
  if (!closed) {
    res.status(400).json({ error: 'Não foi possível encerrar a reunião.' });
    return;
  }

  sseManager.notifyMeetingEnded(code);
  res.json({ success: true, meeting: closed });
});

// CSV Export route (Protected & User Isolated)
apiRouter.get('/admin/meetings/:code/export', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const isAssociateSubPoll = (p: any): boolean => {
    if (p.isAssociatePoll || Boolean(p.parentPollId)) return true;
    if (typeof p.question === 'string' && p.question.startsWith('ASSOCIADOS - ')) return true;
    return false;
  };
  const polls = db.getPollsByMeeting(meeting.id).filter((p) => !isAssociateSubPoll(p));
  const results = polls.map((p) => db.calculatePollResult(p.id)!).filter(Boolean);

  const statusLabel =
    meeting.status === 'MEETING_CLOSED'
      ? 'Encerrada'
      : meeting.status === 'VOTING_OPEN'
      ? 'Votação em Andamento'
      : meeting.status === 'VOTING_CLOSED'
      ? 'Votação Concluída'
      : 'Aguardando';

  const displayTitle = formatMeetingTitle(meeting.name, meeting.nominationCommissionName);

  let csv = `VOTAIASD — SISTEMA DE VOTAÇÃO ANÔNIMA\n`;
  csv += `by Pr Paulo Roberto\n`;
  csv += `RELATÓRIO OFICIAL DE RESULTADOS DA REUNIÃO\n\n`;
  csv += `Nome da Reunião;"${displayTitle.replace(/"/g, '""')}"\n`;
  csv += `Código da Reunião;${meeting.code}\n`;
  csv += `Data e Horário de Início;${new Date(meeting.createdAt).toLocaleString('pt-BR')}\n`;
  if (meeting.closedAt) {
    csv += `Data e Horário de Encerramento;${new Date(meeting.closedAt).toLocaleString('pt-BR')}\n`;
  }
  csv += `Status da Reunião;${statusLabel}\n`;
  csv += `Total de Pautas Realizadas;${results.length}\n`;
  csv += `Anonimato;Votação 100% anônima. Nenhum dado pessoal ou identificador associado aos votos.\n\n`;

  csv += `RESUMO DAS PAUTAS\n`;
  csv += `Nº;Pergunta / Pauta;Tipo de Votação;Status;Participantes que Votaram;Total de Seleções;Opções e Detalhamento;Resultado Final\n`;

  results.forEach((r, idx) => {
    const tipo = r.allowMultiple
      ? `Múltipla Escolha (${r.maxChoices || 1} escolhas exigidas)`
      : 'Escolha Única';
    const votantes = r.allowMultiple ? (r.totalVoters ?? 0) : (r.totalVotes ?? 0);
    const selecoes = r.allowMultiple ? (r.totalSelections ?? 0) : (r.totalVotes ?? 0);

    const details = r.options
      .map((o) =>
        r.allowMultiple
          ? `${o.text} — ${o.votes} seleções — ${o.percentage}%`
          : `${o.text} — ${o.votes} votos — ${o.percentage}%`
      )
      .join(' | ');

    const winnerText = r.options
      .map(
        (o) =>
          `${o.text}: Resultado: ${
            o.percentage > 50
              ? 'Atingiu mais de 50% dos votos.'
              : 'Não atingiu mais de 50% dos votos.'
          }`
      )
      .concat(
        canDepartmentHaveAssociates(r.sourceDepartmentId || r.question)
          ? (() => {
              const direct = r.associates || [];
              const voted = (r.votedAssociates || []).map((va: any) => va.winnerName);
              const list = Array.from(new Set([...direct, ...voted])).filter((n) => n && n.trim().length > 0);
              return list.length > 0 ? [`Associados: ${list.join(', ')}`] : [];
            })()
          : []
      )
      .join(' | ');

    csv += `${idx + 1};"${r.question.replace(/"/g, '""')}";${tipo};${r.status};${votantes};${selecoes};"${details.replace(/"/g, '""')}";"${winnerText.replace(/"/g, '""')}"\n`;
  });

  const filename = `votacao_${meeting.code}_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + csv);
});

// Standalone Printable / PDF Report route (Protected & User Isolated)
apiRouter.get('/admin/meetings/:code/report', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).send('Reunião não encontrada ou acesso não autorizado.');
    return;
  }

  const isAssociateSubPoll = (p: any): boolean => {
    if (p.isAssociatePoll || Boolean(p.parentPollId)) return true;
    if (typeof p.question === 'string' && p.question.startsWith('ASSOCIADOS - ')) return true;
    return false;
  };
  const polls = db.getPollsByMeeting(meeting.id).filter((p) => !isAssociateSubPoll(p));
  const results = polls.map((p) => db.calculatePollResult(p.id)!).filter(Boolean);

  const statusLabel =
    meeting.status === 'MEETING_CLOSED'
      ? 'Encerrada'
      : meeting.status === 'VOTING_OPEN'
      ? 'Votação em Andamento'
      : meeting.status === 'VOTING_CLOSED'
      ? 'Votação Concluída'
      : 'Aguardando';

  const displayTitle = formatMeetingTitle(meeting.name, meeting.nominationCommissionName);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Relatório de Votação — ${displayTitle} (${meeting.code})</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #111827; background: #fff; padding: 32px 24px; line-height: 1.5; }
    .container { max-width: 800px; margin: 0 auto; }
    .header { border-bottom: 2px solid #111827; padding-bottom: 16px; margin-bottom: 24px; }
    .title-row { display: flex; justify-content: space-between; align-items: flex-start; }
    h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #111827; }
    .subtitle { font-size: 13px; font-weight: 500; color: #4B5563; margin-top: 2px; }
    .badge { display: inline-block; padding: 4px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; border-radius: 6px; background: #F3F4F6; border: 1px solid #E5E7EB; color: #111827; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
    .info-table td { padding: 8px 12px; border: 1px solid #E5E7EB; }
    .info-table td.label { font-weight: 700; background: #F9FAFB; width: 28%; color: #4B5563; }
    .section-title { font-size: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin: 24px 0 12px; color: #111827; border-bottom: 1px solid #E5E7EB; padding-bottom: 6px; }
    .poll-card { border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; }
    .poll-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .poll-num { font-size: 11px; font-weight: 800; color: #6B7280; text-transform: uppercase; }
    .poll-question { font-size: 15px; font-weight: 700; margin-top: 2px; color: #111827; }
    .poll-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
    .poll-table th { background: #F9FAFB; border: 1px solid #E5E7EB; padding: 8px 10px; text-align: left; font-weight: 700; }
    .poll-table td { border: 1px solid #E5E7EB; padding: 8px 10px; }
    .poll-table td.num { text-align: right; font-weight: 600; }
    .poll-summary { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 10px 12px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
    .winner-box { margin-top: 10px; padding: 10px 12px; border-radius: 6px; background: #F3F4F6; border: 1px solid #D1D5DB; font-size: 13px; font-weight: 700; }
    .tie { color: #B45309; background: #FEF3C7; border-color: #FDE68A; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E7EB; font-size: 11px; color: #6B7280; text-align: center; }
    .no-print-bar { background: #F3F4F6; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .btn { background: #111827; color: #fff; border: none; padding: 8px 16px; font-size: 13px; font-weight: 700; border-radius: 6px; cursor: pointer; }
    .btn-secondary { background: #fff; color: #111827; border: 1px solid #D1D5DB; margin-left: 8px; }
    @media print {
      body { padding: 0; }
      .no-print-bar { display: none !important; }
      .poll-card { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="no-print-bar">
      <div>
        <strong>Relatório da Reunião</strong>
        <span style="font-size:12px; color:#6B7280; margin-left:8px;">Pronto para impressão ou salvar em PDF</span>
      </div>
      <div>
        <button class="btn" onclick="window.print()">Imprimir / Salvar PDF</button>
        <button class="btn btn-secondary" onclick="window.close()">Fechar</button>
      </div>
    </div>

    <div class="header">
      <div class="title-row">
        <div>
          <h1>VOTAIASD</h1>
          <div class="subtitle">by Pr Paulo Roberto</div>
        </div>
        <div>
          <span class="badge">Relatório Oficial</span>
        </div>
      </div>
    </div>

    <table class="info-table">
      <tr>
        <td class="label">Reunião</td>
        <td><strong>${displayTitle}</strong></td>
      </tr>
      <tr>
        <td class="label">Código de Acesso</td>
        <td><strong style="font-family: monospace;">${meeting.code}</strong></td>
      </tr>
      <tr>
        <td class="label">Início</td>
        <td>${new Date(meeting.createdAt).toLocaleString('pt-BR')}</td>
      </tr>
      ${meeting.closedAt ? `<tr>
        <td class="label">Encerramento</td>
        <td>${new Date(meeting.closedAt).toLocaleString('pt-BR')}</td>
      </tr>` : ''}
      <tr>
        <td class="label">Status</td>
        <td><strong>${statusLabel}</strong></td>
      </tr>
      <tr>
        <td class="label">Total de Pautas</td>
        <td>${results.length} pauta(s) realizada(s)</td>
      </tr>
    </table>

    <div class="section-title">Pautas e Resultados da Votação</div>

    ${results.length === 0 ? '<p style="color:#6B7280; font-size:13px; font-style:italic; padding:16px 0;">Nenhuma pauta cadastrada nesta reunião.</p>' : ''}

    ${results.map((r, idx) => {
      const isMultiple = Boolean(r.allowMultiple);
      const votantes = isMultiple ? (r.totalVoters ?? 0) : (r.totalVotes ?? 0);
      const selecoes = isMultiple ? (r.totalSelections ?? 0) : (r.totalVotes ?? 0);

      // Consolidate associates for this poll
      const allowsAssociates = canDepartmentHaveAssociates(r.sourceDepartmentId || r.question);
      let pollAssociates: string[] = [];

      if (allowsAssociates) {
        const rawAssociates: string[] = [];
        if (r.associates && Array.isArray(r.associates)) {
          rawAssociates.push(...r.associates);
        }
        if (r.votedAssociates && Array.isArray(r.votedAssociates)) {
          for (const va of r.votedAssociates) {
            if (va.winnerName) rawAssociates.push(va.winnerName);
          }
        }
        const seen = new Set<string>();
        for (const name of rawAssociates) {
          if (!name || typeof name !== 'string') continue;
          const clean = name.trim();
          const lower = clean.toLowerCase();
          if (clean.length > 0 && !seen.has(lower)) {
            seen.add(lower);
            pollAssociates.push(clean);
          }
        }
      }

      return `
      <div class="poll-card">
        <div class="poll-header">
          <div>
            <div class="poll-num">Pauta ${String(idx + 1).padStart(2, '0')} — ${isMultiple ? `Múltipla Escolha (${r.maxChoices || 1} escolhas exigidas)` : 'Escolha Única'}</div>
            <div class="poll-question">${r.question}</div>
          </div>
        </div>

        <table class="poll-table">
          <thead>
            <tr>
              <th>Opção</th>
              <th style="width: 140px; text-align:right;">${isMultiple ? 'Seleções' : 'Votos'}</th>
              <th style="width: 100px; text-align:right;">Percentual</th>
            </tr>
          </thead>
          <tbody>
            ${r.options
              .map((opt, origIdx) => ({ opt, origIdx }))
              .sort((a, b) => {
                if (b.opt.percentage !== a.opt.percentage) return b.opt.percentage - a.opt.percentage;
                if (b.opt.votes !== a.opt.votes) return b.opt.votes - a.opt.votes;
                return a.origIdx - b.origIdx;
              })
              .map(({ opt }) => `
              <tr>
                <td><strong>${opt.text}</strong></td>
                <td class="num">${opt.votes} ${isMultiple ? 'seleções' : 'votos'}</td>
                <td class="num" style="color: ${opt.percentage > 50 ? '#059669' : '#dc2626'}; font-weight: 700;">${opt.percentage}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="poll-summary">
          ${isMultiple ? `
            <span><strong>Participantes que votaram:</strong> ${votantes}</span>
            <span><strong>Total de seleções:</strong> ${selecoes}</span>
          ` : `
            <span><strong>Total de participantes que votaram:</strong> ${votantes}</span>
          `}
        </div>

        ${pollAssociates.length > 0 ? `
          <div style="margin-top: 10px; padding: 8px 12px; border-radius: 6px; background: #F9FAFB; border: 1px solid #E5E7EB; font-size: 13px; color: #111827;">
            <strong>Associados:</strong> ${pollAssociates.join(', ')}
          </div>
        ` : ''}
      </div>
      `;
    }).join('')}

    <div class="footer">
      Relatório gerado em ${new Date().toLocaleString('pt-BR')} • Votação 100% anônima e auditada pelo sistema VOTAIASD.
    </div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// --- ATA DA COMISSÃO DE NOMEAÇÕES ENDPOINTS ---

// 1. Get or Generate ATA data (JSON)
apiRouter.get('/admin/meetings/:code/ata', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    const ata = db.getOrGenerateMeetingAta(meeting.id);
    res.json({ success: true, ata });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao gerar Ata da Comissão de Nomeações.';
    res.status(400).json({ error: message });
  }
});

// 2. Save edited ATA data (JSON)
apiRouter.put('/admin/meetings/:code/ata', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    const updatedAta = await db.saveMeetingAta(meeting.id, req.body || {});
    res.json({ success: true, ata: updatedAta });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar alterações da Ata.';
    res.status(400).json({ error: message });
  }
});

// 2b. Save custom ATA department ordering
apiRouter.put('/admin/meetings/:code/ata-order', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    const { departmentOrder } = req.body || {};
    const updatedMeeting = await db.setMeetingAtaDepartmentOrder(meeting.id, departmentOrder || null);
    res.json({ success: true, ataDepartmentOrder: updatedMeeting.ataDepartmentOrder, meeting: updatedMeeting });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar ordem dos departamentos da Ata.';
    res.status(400).json({ error: message });
  }
});

// 2c. Reset ATA department ordering to official catalog order
apiRouter.delete('/admin/meetings/:code/ata-order', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    const updatedMeeting = await db.setMeetingAtaDepartmentOrder(meeting.id, null);
    res.json({ success: true, message: 'Ordem oficial restaurada com sucesso.', meeting: updatedMeeting });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao restaurar ordem oficial dos departamentos.';
    res.status(400).json({ error: message });
  }
});

// 3. Standalone Printable / Word-ready HTML View of the ATA
apiRouter.get('/admin/meetings/:code/ata/html', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const token = req.query.token as string || '';
  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).send('Reunião não encontrada ou acesso não autorizado.');
    return;
  }

  try {
    const ata = db.getOrGenerateMeetingAta(meeting.id);

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ata da Comissão de Nomeações — ${ata.voteNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #525659;
      font-family: 'Times New Roman', Times, 'Liberation Serif', Georgia, serif;
      color: #000000;
      line-height: 1.6;
      padding: 24px;
      margin: 0;
    }
    .no-print-bar {
      max-width: 800px;
      margin: 0 auto 20px auto;
      background: #ffffff;
      border: 1px solid #D1D5DB;
      border-radius: 12px;
      padding: 12px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .bar-info {
      display: flex;
      flex-direction: column;
    }
    .bar-title {
      font-size: 13px;
      font-weight: 800;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .bar-subtitle {
      font-size: 11px;
      color: #6B7280;
    }
    .bar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      font-weight: 700;
      padding: 7px 14px;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .btn-primary {
      background: #111827;
      color: #ffffff;
    }
    .btn-primary:hover {
      background: #000000;
    }
    .btn-secondary {
      background: #ffffff;
      color: #374151;
      border-color: #D1D5DB;
    }
    .btn-secondary:hover {
      background: #F3F4F6;
    }
    .btn-word {
      background: #1E40AF;
      color: #ffffff;
    }
    .btn-word:hover {
      background: #1E3A8A;
    }
    .document-page {
      max-width: 800px;
      min-height: 1000px;
      margin: 0 auto;
      background: #ffffff;
      padding: 60px 70px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      border-radius: 4px;
    }
    .voto-header {
      font-size: 16px;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 24px;
      letter-spacing: 0.3px;
      color: #000000;
    }
    .intro-text {
      font-size: 15px;
      text-align: justify;
      margin-bottom: 28px;
      line-height: 1.7;
    }
    .intro-text strong {
      font-weight: bold;
      text-transform: uppercase;
    }
    .departments-list {
      margin-top: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .dept-item {
      font-size: 15px;
      line-height: 1.6;
    }
    .dept-main {
      color: #000000;
    }
    .dept-main strong {
      font-weight: bold;
    }
    .dept-associates {
      margin-top: 2px;
      padding-left: 20px;
      color: #111827;
    }
    .dept-associates strong {
      font-weight: bold;
    }
    .empty-state-doc {
      font-style: italic;
      color: #6B7280;
      padding: 24px 0;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
        margin: 0;
      }
      .no-print-bar {
        display: none !important;
      }
      .document-page {
        box-shadow: none;
        padding: 0;
        margin: 0;
        max-width: 100%;
        min-height: auto;
      }
      @page {
        margin: 25mm 20mm 25mm 20mm;
      }
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div class="bar-info">
      <span class="bar-title">Ata da Comissão de Nomeações (${ata.voteNumber})</span>
      <span class="bar-subtitle">Documento oficial pronto para revisão, impressão e exportação</span>
    </div>
    <div class="bar-actions">
      <button class="btn btn-word" onclick="downloadWordDoc()" title="Exportar para Microsoft Word">
        Exportar Word (.doc)
      </button>
      <button class="btn btn-secondary" onclick="toggleEditMode()" id="btn-edit-toggle">
        Editar Texto
      </button>
      <button class="btn btn-secondary" onclick="window.close()">
        Fechar
      </button>
    </div>
  </div>

  <div class="document-page" id="ata-document-content">
    <div class="voto-header" id="doc-voto-header">${ata.voteCode}</div>

    <div class="intro-text" id="doc-intro-text">
      <strong>VOTADO</strong> aprovar e registrar o relatório da Comissão de Nomeações para o período ${ata.period}, conforme detalhado abaixo:
    </div>

    <div class="departments-list" id="doc-departments-list">
      ${ata.departments.length === 0 ? `
        <div class="empty-state-doc">
          Nenhum departamento com titular eleito registrado nesta reunião até o momento.
        </div>
      ` : ata.departments.map((dept) => `
        <div class="dept-item">
          <div class="dept-main">
            <strong>${dept.departmentName}:</strong> ${dept.titularName}
          </div>
          ${dept.associates && dept.associates.length > 0 ? `
            <div class="dept-associates">
              <strong>Associados:</strong> ${dept.associates.join(', ')}
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  </div>

  <script>
    let isEditing = false;
    function toggleEditMode() {
      isEditing = !isEditing;
      const content = document.getElementById('ata-document-content');
      const btn = document.getElementById('btn-edit-toggle');
      if (isEditing) {
        content.contentEditable = 'true';
        content.style.outline = '2px dashed #3B82F6';
        content.style.padding = '58px 68px';
        btn.textContent = 'Salvar Edição';
        btn.style.backgroundColor = '#059669';
        btn.style.color = '#ffffff';
      } else {
        content.contentEditable = 'false';
        content.style.outline = 'none';
        content.style.padding = '60px 70px';
        btn.textContent = 'Editar Texto';
        btn.style.backgroundColor = '';
        btn.style.color = '';
      }
    }

    function downloadWordDoc() {
      const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' "+
            "xmlns:w='urn:schemas-microsoft-com:office:word' "+
            "xmlns='http://www.w3.org/TR/REC-html40'>"+
            "<head><meta charset='utf-8'><title>Ata</title>"+
            "<style>body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; color: #000; } strong { font-weight: bold; } </style></head><body>";
      const footer = "</body></html>";
      const docHtml = document.getElementById('ata-document-content').innerHTML;
      const fullHtml = header + docHtml + footer;

      const blob = new Blob(['\\ufeff' + fullHtml], {
        type: 'application/msword'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Ata_Comissao_Nomeacoes_${ata.voteNumber}.doc';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao renderizar Ata da Comissão de Nomeações.';
    res.status(500).send(message);
  }
});

// --- Participant Presence & Routes ---

// Heartbeat presence endpoint
apiRouter.post('/meetings/:code/presence', (req, res) => {
  const { code } = req.params;
  const { sessionId, participantName } = req.body;
  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ error: 'sessionId é obrigatório.' });
    return;
  }

  presenceTracker.touch(code, sessionId, participantName);
  const count = presenceTracker.getCount(code);
  const participants = presenceTracker.getParticipants(code);
  res.json({ success: true, participantCount: count, participants });
});

// Explicit leave endpoint
apiRouter.post('/meetings/:code/leave', (req, res) => {
  const { code } = req.params;
  const { sessionId } = req.body;
  if (sessionId && typeof sessionId === 'string') {
    presenceTracker.remove(code, sessionId);
  }
  res.json({ success: true });
});

// Admin endpoint to view list of connected participant first names
apiRouter.get('/admin/meetings/:code/participants', requireAdmin, (req, res) => {
  const { code } = req.params;
  const userId = (req as any).userId;

  const meeting = db.getMeetingByCode(code);
  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const count = presenceTracker.getCount(code);
  const participants = presenceTracker.getParticipants(code);
  res.json({ success: true, count, participants });
});

// Helper: get current active meeting code if available
apiRouter.get('/active-meeting-code', (req, res) => {
  const activeMeeting = db.getAllMeetings().find((m) => m.status !== 'MEETING_CLOSED');
  res.json({ code: activeMeeting ? activeMeeting.code : null });
});

apiRouter.get('/meetings/:code', (req, res) => {
  const { code } = req.params;
  const participantCount = sseManager.getParticipantCount(code);
  const state = db.getPublicMeetingState(code, participantCount);

  if (!state) {
    res.status(404).json({ error: 'Reunião não encontrada. Verifique o código digitado.' });
    return;
  }

  res.json(state);
});

// Check if user already voted in a specific poll
apiRouter.get('/meetings/:code/polls/:pollId/has-voted', (req, res) => {
  const { pollId } = req.params;
  const anonymousSessionId = req.query.sessionId as string;

  if (!anonymousSessionId) {
    res.json({ hasVoted: false });
    return;
  }

  const hasVoted = db.hasUserVoted(pollId, anonymousSessionId);
  res.json({ hasVoted });
});

// Submit anonymous vote (single or multiple choices)
apiRouter.post('/meetings/:code/vote', async (req, res) => {
  const { code } = req.params;
  const { pollId, optionId, optionIds, anonymousSessionId } = req.body;

  const submittedChoices = optionIds !== undefined ? optionIds : optionId;

  if (!pollId || submittedChoices === undefined || !anonymousSessionId) {
    res.status(400).json({ error: 'Dados de voto incompletos.' });
    return;
  }

  try {
    const result = await db.registerVote(pollId, submittedChoices, anonymousSessionId);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    // Real-time broadcast
    sseManager.notifyVoteRegistered(code, pollId);

    res.json({ success: true, message: 'Voto registrado com sucesso.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao processar voto.';
    res.status(400).json({ error: msg });
  }
});

// Real-Time SSE Stream for a meeting
apiRouter.get('/meetings/:code/stream', (req, res) => {
  const { code } = req.params;
  const token = req.query.token as string;
  const sessionId = req.query.sessionId as string;
  const participantName = (req.query.name as string) || (req.query.participantName as string);

  const meeting = db.getMeetingByCode(code);
  if (!meeting) {
    res.status(404).end();
    return;
  }

  const session = token ? getUserSession(token) : null;
  const isAdmin = Boolean(session && (!meeting.userId || meeting.userId === session.userId));

  const clientId = crypto.randomUUID();
  sseManager.addClient(clientId, code, res, isAdmin, sessionId, participantName);
});

// =========================================================
// MÓDULO: COMISSÃO ORGANIZADORA (ISOLADO DA COMISSÃO DE NOMEAÇÕES)
// =========================================================

apiRouter.get('/admin/meetings/:code/organizing-commission', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    const summary = db.getOrganizingCommissionAdminSummary(meeting.id);
    res.json({
      success: true,
      config: summary.config,
      summary,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao carregar configurações da Comissão Organizadora.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.put('/admin/meetings/:code/organizing-commission/config', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { criteria, deadline, status } = req.body || {};
  try {
    const updated = await db.saveOrganizingCommissionConfig(meeting.id, {
      criteria,
      deadline,
      status,
    });
    const summary = db.getOrganizingCommissionAdminSummary(meeting.id);
    res.json({
      success: true,
      config: updated,
      summary,
      message: 'Configurações da Comissão Organizadora salvas com sucesso!',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao salvar configurações da Comissão Organizadora.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.post('/admin/meetings/:code/organizing-commission/status', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { action, deadline } = req.body || {};
  if (action !== 'OPEN' && action !== 'CLOSE' && action !== 'REOPEN') {
    res.status(400).json({ error: 'Ação inválida. Use OPEN, CLOSE ou REOPEN.' });
    return;
  }

  try {
    const updated = await db.setOrganizingCommissionStatus(meeting.id, action, deadline);
    const summary = db.getOrganizingCommissionAdminSummary(meeting.id);
    res.json({
      success: true,
      config: updated,
      summary,
      message:
        action === 'OPEN'
          ? 'Indicações da Comissão Organizadora abertas com sucesso.'
          : action === 'CLOSE'
          ? 'Indicações da Comissão Organizadora encerradas com sucesso.'
          : 'Indicações da Comissão Organizadora reabertas com sucesso.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao alterar status das indicações da Comissão Organizadora.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.post('/admin/meetings/:code/organizing-commission/nominations', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { criterionId, nomineeName } = req.body || {};
  try {
    const nomination = await db.addManualOrganizingNominee({
      meetingId: meeting.id,
      criterionId,
      nomineeName,
    });
    const summary = db.getOrganizingCommissionAdminSummary(meeting.id);
    res.status(201).json({
      success: true,
      nomination,
      summary,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao adicionar nome indicado.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.patch('/admin/meetings/:code/organizing-commission/nominations/:nominationId', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, nominationId } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { nomineeName } = req.body || {};
  try {
    const nomination = await db.updateOrganizingNominationOccurrence({
      meetingId: meeting.id,
      nominationId,
      nomineeName,
    });
    const summary = db.getOrganizingCommissionAdminSummary(meeting.id);
    res.json({
      success: true,
      nomination,
      summary,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao editar ocorrência da indicação.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.delete('/admin/meetings/:code/organizing-commission/nominations/:nominationId', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code, nominationId } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    await db.deleteOrganizingNominationOccurrence(meeting.id, nominationId);
    const summary = db.getOrganizingCommissionAdminSummary(meeting.id);
    res.json({
      success: true,
      summary,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao excluir ocorrência da indicação.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.post('/admin/meetings/:code/organizing-commission/selections/toggle', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { criterionId, nomineeName, selected } = req.body || {};
  try {
    const selections = await db.toggleOrganizingNomineeSelection({
      meetingId: meeting.id,
      criterionId,
      nomineeName,
      selected,
    });
    const summary = db.getOrganizingCommissionAdminSummary(meeting.id);
    res.json({
      success: true,
      selections,
      summary,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao atualizar seleção do indicado.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.post('/admin/meetings/:code/organizing-commission/selections/batch', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { criterionId, action, nomineeNames } = req.body || {};
  try {
    const selections = await db.selectAllOrganizingCriterionNominees({
      meetingId: meeting.id,
      criterionId,
      nomineeNames: Array.isArray(nomineeNames) ? nomineeNames : undefined,
      selectAll: action === 'select_all',
    });
    const summary = db.getOrganizingCommissionAdminSummary(meeting.id);
    res.json({
      success: true,
      selections,
      summary,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao selecionar/desmarcar todos os indicados do critério.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.post('/admin/meetings/:code/organizing-commission/create-pauta', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  const { criterionId, nomineeNames, question, allowMultiple, maxChoices } = req.body || {};
  try {
    const poll = await db.createPollFromOrganizingSelections({
      meetingId: meeting.id,
      criterionId,
      nomineeNames: Array.isArray(nomineeNames) ? nomineeNames : [],
      question,
      allowMultiple: Boolean(allowMultiple),
      maxChoices: maxChoices !== undefined ? Number(maxChoices) : 1,
    });

    sseManager.notifyPollChanged(code);
    const summary = db.getOrganizingCommissionAdminSummary(meeting.id);

    res.status(201).json({
      success: true,
      poll,
      summary,
      message: 'Pauta da Comissão Organizadora criada com sucesso!',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao criar pauta da Comissão Organizadora.';
    res.status(400).json({ error: msg });
  }
});

// --- ATA EXCLUSIVA DA COMISSÃO ORGANIZADORA ENDPOINTS ---

apiRouter.get('/admin/meetings/:code/organizing-commission/ata', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    const ata = db.getOrGenerateOrganizingMeetingAta(meeting.id);
    res.json({ success: true, ata });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar Ata da Comissão Organizadora.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.put('/admin/meetings/:code/organizing-commission/ata', requireAdmin, async (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).json({ error: 'Reunião não encontrada ou acesso não autorizado.' });
    return;
  }

  try {
    const updatedAta = await db.saveOrganizingMeetingAta(meeting.id, req.body || {});
    res.json({ success: true, ata: updatedAta });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao salvar alterações da Ata da Comissão Organizadora.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.get('/admin/meetings/:code/organizing-commission/ata/html', requireAdmin, (req, res) => {
  const userId = (req as any).userId;
  const { code } = req.params;
  const meeting = db.getMeetingByCode(code);

  if (!meeting || (meeting.userId && meeting.userId !== userId)) {
    res.status(404).send('Reunião não encontrada ou acesso não autorizado.');
    return;
  }

  try {
    const ata = db.getOrGenerateOrganizingMeetingAta(meeting.id);
    const esc = (str?: string) =>
      String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const dateDisplay = ata.meetingDate ? esc(ata.meetingDate) : '___/___/______';
    const quantityPrefix = ata.membersCount ? `${esc(ata.membersCount)} ` : '';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ata da Comissão Organizadora — ${esc(ata.voteNumber)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #525659;
      font-family: 'Times New Roman', Times, 'Liberation Serif', Georgia, serif;
      color: #000000;
      line-height: 1.65;
      padding: 24px;
      margin: 0;
    }
    .no-print-bar {
      max-width: 800px;
      margin: 0 auto 20px auto;
      background: #ffffff;
      border: 1px solid #D1D5DB;
      border-radius: 12px;
      padding: 12px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .bar-info {
      display: flex;
      flex-direction: column;
    }
    .bar-title {
      font-size: 13px;
      font-weight: 800;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .bar-subtitle {
      font-size: 11px;
      color: #6B7280;
    }
    .bar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      font-weight: 700;
      padding: 7px 14px;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .btn-primary {
      background: #111827;
      color: #ffffff;
    }
    .btn-primary:hover {
      background: #000000;
    }
    .btn-secondary {
      background: #ffffff;
      color: #374151;
      border-color: #D1D5DB;
    }
    .btn-secondary:hover {
      background: #F3F4F6;
    }
    .btn-word {
      background: #1E40AF;
      color: #ffffff;
    }
    .btn-word:hover {
      background: #1E3A8A;
    }
    .document-page {
      max-width: 800px;
      min-height: 1000px;
      margin: 0 auto;
      background: #ffffff;
      padding: 60px 70px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      border-radius: 4px;
    }
    .voto-header {
      font-size: 16px;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 24px;
      letter-spacing: 0.3px;
      color: #000000;
    }
    .intro-text {
      font-size: 15px;
      text-align: justify;
      margin-bottom: 22px;
      line-height: 1.7;
    }
    .section-block {
      margin-bottom: 24px;
      font-size: 15px;
      line-height: 1.7;
    }
    .section-title {
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .field-label {
      font-weight: bold;
      margin-bottom: 4px;
    }
    .field-value {
      text-align: justify;
      margin-bottom: 14px;
    }
    .members-list {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .member-item {
      font-size: 15px;
      line-height: 1.6;
    }
    .signatures-block {
      margin-top: 64px;
      padding-top: 16px;
      display: flex;
      flex-direction: column;
      gap: 48px;
      align-items: center;
      text-align: center;
    }
    .signature-item {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .signature-line {
      font-family: 'Times New Roman', serif;
      letter-spacing: 1px;
      margin-bottom: 4px;
    }
    .signature-role {
      font-size: 14px;
      font-weight: bold;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
        margin: 0;
      }
      .no-print-bar {
        display: none !important;
      }
      .document-page {
        box-shadow: none;
        padding: 0;
        margin: 0;
        max-width: 100%;
        min-height: auto;
      }
      @page {
        margin: 25mm 20mm 25mm 20mm;
      }
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div class="bar-info">
      <span class="bar-title">Ata da Comissão Organizadora (${esc(ata.voteNumber)})</span>
      <span class="bar-subtitle">Documento oficial pronto para revisão, impressão e exportação</span>
    </div>
    <div class="bar-actions">
      <button class="btn btn-primary" onclick="window.print()">
        Imprimir / PDF
      </button>
      <button class="btn btn-word" onclick="downloadWordDoc()" title="Exportar para Microsoft Word">
        Exportar Word (.doc)
      </button>
      <button class="btn btn-secondary" onclick="toggleEditMode()" id="btn-edit-toggle">
        Editar Texto
      </button>
      <button class="btn btn-secondary" onclick="window.close()">
        Fechar
      </button>
    </div>
  </div>

  <div class="document-page" id="ata-document-content">
    <div class="voto-header">${esc(ata.voteCode)}</div>

    <div class="intro-text">
      <strong>PROPÕE-SE</strong> aprovar e registrar o relatório da Comissão Organizadora que se reuniu no dia ${dateDisplay}, com a presença dos seguintes membros:
    </div>

    <div class="section-block">
      <div class="field-label">Membros presentes:</div>
      <div class="field-value">${ata.presentMembers ? esc(ata.presentMembers) : ''}</div>
    </div>

    <div class="section-block">
      <div class="section-title">PROPOSTA DA QUANTIDADE DE MEMBROS DA COMISSÃO DE NOMEAÇÕES:</div>
      <div class="field-value">
        ${quantityPrefix}membros, garantindo uma representação justa na composição da comissão de nomeações, incluindo diferentes faixas etárias e ambos os sexos, limitando a participação de um membro por núcleo familiar.
      </div>
    </div>

    <div class="section-block">
      <div class="section-title">NOMES PROPOSTOS PARA FORMAR A COMISSÃO DE NOMEAÇÕES:</div>

      <div style="margin-top: 12px;">
        <div class="field-label">Secretário(a) da Comissão de Nomeações:</div>
        <div class="field-value">${ata.secretaryName ? esc(ata.secretaryName) : ''}</div>
      </div>

      <div style="margin-top: 12px;">
        <div class="field-label">Membros da Comissão de Nomeações:</div>
        <div class="members-list">
          ${ata.membersList.map((member) => `<div class="member-item">${esc(member)}</div>`).join('')}
        </div>
      </div>
    </div>

    <div class="signatures-block">
      <div class="signature-item">
        <div class="signature-line">____________________________</div>
        <div class="signature-role">Presidente</div>
      </div>

      <div class="signature-item">
        <div class="signature-line">____________________________</div>
        <div class="signature-role">Secretário(a)</div>
      </div>
    </div>
  </div>

  <script>
    let isEditing = false;
    function toggleEditMode() {
      isEditing = !isEditing;
      const content = document.getElementById('ata-document-content');
      const btn = document.getElementById('btn-edit-toggle');
      if (isEditing) {
        content.contentEditable = 'true';
        content.style.outline = '2px dashed #3B82F6';
        content.style.padding = '58px 68px';
        btn.textContent = 'Concluir Edição';
        btn.style.backgroundColor = '#059669';
        btn.style.color = '#ffffff';
      } else {
        content.contentEditable = 'false';
        content.style.outline = 'none';
        content.style.padding = '60px 70px';
        btn.textContent = 'Editar Texto';
        btn.style.backgroundColor = '';
        btn.style.color = '';
      }
    }

    function downloadWordDoc() {
      const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' "+
            "xmlns:w='urn:schemas-microsoft-com:office:word' "+
            "xmlns='http://www.w3.org/TR/REC-html40'>"+
            "<head><meta charset='utf-8'><title>Ata da Comiss\\u00e3o Organizadora</title>"+
            "<style>body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; color: #000; } strong { font-weight: bold; } </style></head><body>";
      const footer = "</body></html>";
      const docHtml = document.getElementById('ata-document-content').innerHTML;
      const fullHtml = header + docHtml + footer;

      const blob = new Blob(['\\ufeff' + fullHtml], {
        type: 'application/msword'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Ata_Comissao_Organizadora_${esc(ata.voteNumber)}.doc';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao renderizar Ata da Comissão Organizadora.';
    res.status(500).send(msg);
  }
});

// --- PUBLIC ORGANIZING COMMISSION ENDPOINTS ---

apiRouter.get('/public/organizing-commission/:token', (req, res) => {
  const { token } = req.params;
  const sessionId = req.query.sessionId as string | undefined;
  const state = db.getPublicOrganizingCommissionState(token, sessionId);
  if (!state.valid && state.status === 'NOT_FOUND') {
    res.status(404).json(state);
    return;
  }
  res.json(state);
});

apiRouter.post('/public/organizing-commission/:token/session', async (req, res) => {
  const { token } = req.params;
  const { nominatorName, existingSessionId } = req.body || {};
  try {
    const session = await db.createOrGetOrganizingParticipantSession({
      publicToken: token,
      nominatorName,
      existingSessionId,
    });
    res.json({
      success: true,
      sessionId: session.sessionId,
      nominatorName: session.nominatorName,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao iniciar sessão de indicações.';
    const status = (err as any)?.status;
    res.status(400).json({ error: msg, ...(status ? { status } : {}) });
  }
});

apiRouter.get('/public/organizing-commission/:token/session/:sessionId', (req, res) => {
  const { token, sessionId } = req.params;
  try {
    const data = db.getParticipantOrganizingNominations(token, sessionId);
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao carregar indicações da sessão.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.post('/public/organizing-commission/:token/save', async (req, res) => {
  const { token } = req.params;
  const { sessionId, participantName, nominatorName, criterionId, nomineeNames, nominations, finalized } = req.body || {};
  try {
    const result = await db.saveParticipantOrganizingNominations({
      publicToken: token,
      sessionId,
      participantName: participantName || nominatorName,
      nominatorName: nominatorName || participantName,
      criterionId,
      nomineeNames,
      nominations,
      finalized,
    });
    res.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao salvar indicações da Comissão Organizadora.';
    const status = (err as any)?.status;
    res.status(400).json({ error: msg, ...(status ? { status } : {}) });
  }
});

apiRouter.post('/public/organizing-commission/:token/finalize', async (req, res) => {
  const { token } = req.params;
  const { sessionId, nominatorName } = req.body || {};
  try {
    const result = await db.finalizeOrganizingParticipantSession({
      publicToken: token,
      sessionId,
      nominatorName,
    });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao finalizar indicações da Comissão Organizadora.';
    const status = (err as any)?.status;
    res.status(400).json({ error: msg, ...(status ? { status } : {}) });
  }
});
