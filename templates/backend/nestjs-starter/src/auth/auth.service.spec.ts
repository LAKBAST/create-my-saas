import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { AuthToken } from './auth-token.entity';
import { AuthService } from './auth.service';
import { OAuthAccount } from './oauth-account.entity';
import { OAuthState } from './oauth-state.entity';
import { RefreshSession } from './refresh-session.entity';
import { SecureEmailService } from './secure-email.service';
import { User } from '../users/user.entity';

type OAuthExchange = {
  exchangeOAuthProfile: (
    provider: string,
    code: string,
    verifier: string,
    config: { clientId: string; clientSecret: string; tokenUrl: string; userInfoUrl: string; redirectUri: string },
  ) => Promise<unknown>;
  oauthJson: (url: string, options: RequestInit) => Promise<unknown>;
};

function service(): AuthService {
  return new AuthService(
    {} as UsersService,
    {} as JwtService,
    {} as ConfigService,
    {} as Repository<RefreshSession>,
    {} as Repository<AuthToken>,
    {} as Repository<OAuthState>,
    {} as Repository<OAuthAccount>,
    {} as DataSource,
    {} as SecureEmailService,
  );
}

describe('AuthService OAuth profiles', () => {
  it('rejects an unverified GitHub email returned by /user', async () => {
    const auth = service();
    const exchange = auth as unknown as OAuthExchange;
    const oauthJson = jest.spyOn(exchange, 'oauthJson')
      .mockResolvedValueOnce({ access_token: 'provider-token' })
      .mockResolvedValueOnce({ id: 42, email: 'person@example.com', login: 'octocat' })
      .mockResolvedValueOnce([{ email: 'person@example.com', primary: true, verified: false }]);

    await expect(exchange.exchangeOAuthProfile('github', 'code', 'verifier', {
      clientId: 'id', clientSecret: 'secret', tokenUrl: 'https://provider.test/token',
      userInfoUrl: 'https://provider.test/user', redirectUri: 'https://api.test/callback',
    })).rejects.toMatchObject({ code: 'OAUTH_EMAIL_UNVERIFIED' });

    expect(oauthJson).toHaveBeenLastCalledWith('https://api.github.com/user/emails', expect.any(Object));
  });
});

describe('OAuth linking an existing password account', () => {
  it.each([false, true])('protects credentials according to prior verification (%s)', async (verified) => {
    let stored: User;
    const sessions: RefreshSession[] = [];
    const sessionRepository = {
      create: (values: RefreshSession) => values,
      save: async (values: RefreshSession) => { sessions.push(values); return values; },
      findOneBy: async ({ tokenHash }: { tokenHash: string }) => sessions.find((session) => session.tokenHash === tokenHash),
      update: jest.fn(async ({ userId }: { userId: string }, values: Partial<RefreshSession>) => {
        for (const session of sessions) if (session.userId === userId && !session.revokedAt) Object.assign(session, values);
        return { affected: 1 };
      }),
    };
    let beforeLockedRead = async () => {};
    const userRepository = {
      findOne: jest.fn(async (options: { lock: { mode: string }; select?: { passwordHash: boolean } }) => {
        expect(options.lock.mode).toBe('pessimistic_write');
        if (options.select) expect(options.select.passwordHash).toBe(true);
        await beforeLockedRead();
        return { ...stored };
      }),
      update: jest.fn(async (_criteria: unknown, values: Partial<User>) => {
        if (stored.emailVerified) return { affected: 0 };
        Object.assign(stored, values);
        return { affected: 1 };
      }),
    };
    const users = {
      findByEmail: async (_email: string, includePassword = false) => stored
        ? { ...stored, passwordHash: includePassword ? stored.passwordHash : undefined } : null,
      create: async (values: Partial<User>) => {
        stored = Object.assign(new User(), values, { id: 'user-id', isActive: true, emailVerified: false });
        return stored;
      },
    };
    const auth = new AuthService(
      users as unknown as UsersService,
      { signAsync: async () => 'access-token' } as unknown as JwtService,
      { get: (key: string, fallback: unknown) => ({
        OAUTH_ENABLED: true, OAUTH_GOOGLE_CLIENT_ID: 'client', OAUTH_GOOGLE_CLIENT_SECRET: 'secret',
        OAUTH_GOOGLE_REDIRECT_URI: 'https://api.test/callback',
      } as Record<string, unknown>)[key] ?? fallback } as unknown as ConfigService,
      sessionRepository as unknown as Repository<RefreshSession>,
      { update: async () => ({}), create: (values: unknown) => values, save: async () => ({}) } as unknown as Repository<AuthToken>,
      { findOneBy: async () => ({ id: 'state', codeVerifier: 'verifier' }), update: async () => ({ affected: 1 }) } as unknown as Repository<OAuthState>,
      { findOneBy: async () => null, create: (values: unknown) => values, save: async (values: unknown) => values } as unknown as Repository<OAuthAccount>,
      { transaction: async (work: (manager: unknown) => Promise<unknown>) => work({
        getRepository: (entity: unknown) => entity === User ? userRepository : sessionRepository,
      }) } as unknown as DataSource,
      { send: async () => {} } as unknown as SecureEmailService,
    );
    const credentials = { email: 'person@example.com', password: 'password123' };
    await auth.register({ ...credentials, name: 'Person' });
    stored!.emailVerified = verified;
    const passwordHash = stored!.passwordHash;
    const previous = [await auth.login(credentials), await auth.login(credentials)];
    const other = { userId: 'other-user', revokedAt: null } as RefreshSession;
    sessions.push(other);
    jest.spyOn(auth as unknown as OAuthExchange, 'exchangeOAuthProfile').mockResolvedValue({
      email: credentials.email, name: 'Person', providerAccountId: 'subject',
    });

    let resumeLogin!: () => void;
    let loginReady!: () => void;
    const ready = new Promise<void>((resolve) => { loginReady = resolve; });
    const resume = new Promise<void>((resolve) => { resumeLogin = resolve; });
    beforeLockedRead = async () => { loginReady(); await resume; };
    const pendingLogin = auth.login(credentials);
    await ready;
    const result = await auth.oauthCallback('google', 'state', 'code');
    resumeLogin();
    if (verified) await expect(pendingLogin).resolves.toHaveProperty('refreshToken');
    else await expect(pendingLogin).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });

    expect(stored!.emailVerified).toBe(true);
    expect(stored!.passwordHash).toBe(verified ? passwordHash : null);
    expect(sessions.slice(0, 2).every((session) => Boolean(session.revokedAt) === !verified)).toBe(true);
    expect(other.revokedAt).toBeNull();
    expect(sessions[sessions.length - 1].revokedAt).toBeNull();
    expect(result.authentication.user).not.toHaveProperty('passwordHash');
    if (verified) {
      await expect(auth.login(credentials)).resolves.toHaveProperty('refreshToken');
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(sessionRepository.update).not.toHaveBeenCalled();
    } else {
      await expect(auth.login(credentials)).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
      for (const session of previous) {
        await expect(auth.refresh(session.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
      }
    }
  });
});
