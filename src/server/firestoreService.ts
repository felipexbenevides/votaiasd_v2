import { initializeApp, getApps, getApp, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

export interface DatabaseData {
  users?: any[];
  sessions?: any[];
  passwordResetTokens?: any[];
  meetings?: any[];
  polls?: any[];
  options?: any[];
  votes?: any[];
  nominationConfigs?: any[];
  nominations?: any[];
  selectedNominees?: any[];
  expectedParticipants?: any[];
  participantSessions?: any[];
  churchNominationConfigs?: any[];
  churchNominationSubmissions?: any[];
  organizingCommissionConfigs?: any[];
  organizingNominations?: any[];
  organizingSelectedNominees?: any[];
  organizingParticipantSessions?: any[];
}

class FirestoreService {
  private db: Firestore | null = null;
  private adminApp: App | null = null;
  private isInitialized = false;
  private initPromise: Promise<boolean> | null = null;
  private simulateFailure = false;

  public async init(): Promise<boolean> {
    if (this.isInitialized && this.db) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        let cfg: any = {};
        if (fs.existsSync(configPath)) {
          try {
            cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          } catch (e) {
            console.warn('[Firestore Admin] Could not parse firebase-applet-config.json:', e);
          }
        }

        // VOTAIASD V2 MUST exclusively connect to votaiasd-v2 / (default)
        const projectId = 'votaiasd-v2';
        const databaseId = '(default)';

        this.adminApp = getApps().length
          ? getApp()
          : initializeApp({
              projectId,
            });

        this.db = getFirestore(this.adminApp, databaseId);
        this.isInitialized = true;
        console.log(`[Firestore Admin] Initialized on project: ${projectId}, database: ${databaseId}`);
        return true;
      } catch (err) {
        console.error('[Firestore Admin] Initialization error:', err);
        return false;
      }
    })();

    return this.initPromise;
  }

  public async loadAll(): Promise<DatabaseData | null> {
    const ready = await this.init();
    if (!ready || !this.db) return null;

    console.log('[Firestore Admin] Loading all collections from votaiasd-v2/(default)...');
    const collections = [
      'users',
      'sessions',
      'passwordResetTokens',
      'meetings',
      'polls',
      'options',
      'votes',
      'nominationConfigs',
      'nominations',
      'selectedNominees',
      'expectedParticipants',
      'participantSessions',
      'churchNominationConfigs',
      'churchNominationSubmissions',
      'organizingCommissionConfigs',
      'organizingNominations',
      'organizingSelectedNominees',
      'organizingParticipantSessions',
    ];

    const results: Record<string, any[]> = {};

    await Promise.all(
      collections.map(async (colName) => {
        try {
          const snap = await this.db!.collection(colName).get();
          results[colName] = snap.docs.map((d) => d.data());
        } catch (colErr: any) {
          console.error(`[Firestore Admin] Error loading collection ${colName}:`, colErr?.message || colErr);
          throw colErr;
        }
      })
    );

    console.log('[Firestore Admin] Successfully loaded data from Cloud Firestore.');
    return results as DatabaseData;
  }

  public async getUserByUsername(username: string): Promise<any | null> {
    if (!username) return null;
    const ready = await this.init();
    if (!ready || !this.db) {
      throw new Error('[Firestore Admin] Firestore votaiasd-v2/(default) indisponível.');
    }

    const lower = username.trim().toLowerCase();
    try {
      // Direct query by usernameLower in authoritative Firestore
      const snap = await this.db.collection('users').where('usernameLower', '==', lower).get();
      if (!snap.empty) {
        const docs = snap.docs.map((d) => d.data());
        const withPassword = docs.find((u: any) => u.passwordHash && u.salt);
        if (withPassword) return withPassword;
        return docs[0];
      }
      // Fallback query by exact username
      const snap2 = await this.db.collection('users').where('username', '==', username.trim()).get();
      if (!snap2.empty) {
        const docs = snap2.docs.map((d) => d.data());
        const withPassword = docs.find((u: any) => u.passwordHash && u.salt);
        if (withPassword) return withPassword;
        return docs[0];
      }
      return null;
    } catch (err: any) {
      console.error('[Firestore Admin] Error querying user by username:', err?.message || err);
      throw err;
    }
  }

  public async getUserByEmail(email: string): Promise<any | null> {
    if (!email) return null;
    const ready = await this.init();
    if (!ready || !this.db) {
      throw new Error('[Firestore Admin] Firestore votaiasd-v2/(default) indisponível.');
    }

    const lower = email.trim().toLowerCase();
    try {
      // Direct query by emailLower in authoritative Firestore
      const snap = await this.db.collection('users').where('emailLower', '==', lower).get();
      if (!snap.empty) {
        const docs = snap.docs.map((d) => d.data());
        const withPassword = docs.find((u: any) => u.passwordHash && u.salt);
        if (withPassword) return withPassword;
        return docs[0];
      }
      // Fallback query by exact email
      const snap2 = await this.db.collection('users').where('email', '==', email.trim()).get();
      if (!snap2.empty) {
        const docs = snap2.docs.map((d) => d.data());
        const withPassword = docs.find((u: any) => u.passwordHash && u.salt);
        if (withPassword) return withPassword;
        return docs[0];
      }
      return null;
    } catch (err: any) {
      console.error('[Firestore Admin] Error querying user by email:', err?.message || err);
      throw err;
    }
  }

  public async getUserById(id: string): Promise<any | null> {
    if (!id) return null;
    const ready = await this.init();
    if (!ready || !this.db) {
      throw new Error('[Firestore Admin] Firestore votaiasd-v2/(default) indisponível.');
    }

    try {
      const doc = await this.db.collection('users').doc(String(id)).get();
      if (doc.exists) {
        return doc.data();
      }
      const snap = await this.db.collection('users').where('firebaseUid', '==', String(id)).get();
      if (!snap.empty) {
        const docs = snap.docs.map((d) => d.data());
        const withPassword = docs.find((u: any) => u.passwordHash && u.salt);
        if (withPassword) return withPassword;
        return docs[0];
      }
      return null;
    } catch (err: any) {
      console.error('[Firestore Admin] Error querying user by id:', err?.message || err);
      throw err;
    }
  }

  public setSimulateFailure(fail: boolean) {
    this.simulateFailure = fail;
  }

  public isSimulateFailure(): boolean {
    return this.simulateFailure;
  }

  public async saveEntity(colName: string, id: string, data: any): Promise<void> {
    if (
      data &&
      (data.isDemo === true ||
        data.isSynthetic === true ||
        (typeof data.code === 'string' && data.code.toUpperCase().startsWith('DEMO')) ||
        (typeof data.meetingCode === 'string' && data.meetingCode.toUpperCase().startsWith('DEMO')) ||
        (typeof data.meetingId === 'string' && data.meetingId.startsWith('demo-')) ||
        (typeof data.pollId === 'string' && data.pollId.startsWith('demo-')) ||
        (typeof id === 'string' && id.startsWith('demo-')))
    ) {
      console.log(`[Firestore Admin] [DEMO ISOLATION GUARD] Skipping cloud write for synthetic entity ${colName}/${id}`);
      return;
    }
    if (this.simulateFailure) {
      throw new Error(`[Firestore Admin] Simulação controlada de falha de persistência em ${colName}/${id}`);
    }
    if (!this.isInitialized) {
      const ok = await this.init();
      if (!ok) {
        throw new Error(`[Firestore Admin] Falha na inicialização antes de gravar em ${colName}/${id}`);
      }
    }
    if (!this.db || !id) {
      throw new Error(`[Firestore Admin] Conexão indisponível ou ID inválido para ${colName}/${id}`);
    }
    const cleanData = JSON.parse(JSON.stringify(data));
    await this.db.collection(colName).doc(String(id)).set(cleanData, { merge: true });
  }

  public async deleteEntity(colName: string, id: string): Promise<void> {
    if (id && typeof id === 'string' && id.startsWith('demo-')) {
      console.log(`[Firestore Admin] [DEMO ISOLATION GUARD] Skipping cloud delete for synthetic entity ${colName}/${id}`);
      return;
    }
    if (this.simulateFailure) {
      throw new Error(`[Firestore Admin] Simulação controlada de falha de exclusão em ${colName}/${id}`);
    }
    if (!this.isInitialized) {
      const ok = await this.init();
      if (!ok) {
        throw new Error(`[Firestore Admin] Falha na inicialização antes de excluir de ${colName}/${id}`);
      }
    }
    if (!this.db || !id) {
      throw new Error(`[Firestore Admin] Conexão indisponível ou ID inválido para ${colName}/${id}`);
    }
    await this.db.collection(colName).doc(String(id)).delete();
  }

  public async batchSave(colName: string, items: Array<{ id: string; data: any }>): Promise<void> {
    const realItems = items.filter(
      (item) =>
        !(
          item.data &&
          (item.data.isDemo === true ||
            item.data.isSynthetic === true ||
            (typeof item.data.code === 'string' && item.data.code.toUpperCase().startsWith('DEMO')) ||
            (typeof item.data.meetingCode === 'string' && item.data.meetingCode.toUpperCase().startsWith('DEMO')) ||
            (typeof item.id === 'string' && item.id.startsWith('demo-')))
        )
    );
    if (realItems.length === 0) return;
    if (this.simulateFailure) {
      throw new Error(`[Firestore Admin] Simulação controlada de falha em batchSave para ${colName}`);
    }
    if (!this.isInitialized) {
      const ok = await this.init();
      if (!ok) {
        throw new Error(`[Firestore Admin] Falha na inicialização antes de batchSave em ${colName}`);
      }
    }
    if (!this.db) {
      throw new Error(`[Firestore Admin] Conexão indisponível para batchSave em ${colName}`);
    }
    try {
      for (let i = 0; i < realItems.length; i += 25) {
        const chunk = realItems.slice(i, i + 25);
        const batch = this.db.batch();
        for (const item of chunk) {
          const cleanData = JSON.parse(JSON.stringify(item.data));
          batch.set(this.db.collection(colName).doc(String(item.id)), cleanData, { merge: true });
        }
        await batch.commit();
      }
    } catch (err: any) {
      console.error(`[Firestore Admin] Erro persistente em batchSave para ${colName}:`, err?.message || err);
      throw err;
    }
  }

  public async batchDelete(colName: string, ids: string[]): Promise<void> {
    const realIds = ids.filter((id) => typeof id === 'string' && !id.startsWith('demo-'));
    if (realIds.length === 0) return;
    if (this.simulateFailure) {
      throw new Error(`[Firestore Admin] Simulação controlada de falha em batchDelete para ${colName}`);
    }
    if (!this.isInitialized) {
      const ok = await this.init();
      if (!ok) {
        throw new Error(`[Firestore Admin] Falha na inicialização antes de batchDelete em ${colName}`);
      }
    }
    if (!this.db) return;
    try {
      for (let i = 0; i < realIds.length; i += 25) {
        const chunk = realIds.slice(i, i + 25);
        const batch = this.db.batch();
        for (const id of chunk) {
          batch.delete(this.db.collection(colName).doc(String(id)));
        }
        await batch.commit();
      }
    } catch (err: any) {
      console.error(`[Firestore Admin] Erro persistente em batchDelete para ${colName}:`, err?.message || err);
      throw err;
    }
  }
}

export const firestoreService = new FirestoreService();
