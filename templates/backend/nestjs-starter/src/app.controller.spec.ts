import { validateEnvironment } from './config';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ReadinessService } from './common/readiness/readiness.service';

describe('AppController', () => {
  let appController: AppController;
  let readiness: { check: jest.Mock };

  beforeEach(async () => {
    readiness = {
      check: jest.fn().mockResolvedValue({ status: 'ready', checks: { database: 'ok', redis: 'disabled' } }),
    };
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: ReadinessService,
          useValue: readiness,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health check', () => {
    it('reports the service as running', () => {
      expect(appController.getHealth()).toEqual({ message: 'Running successfully!' });
    });

    it('keeps liveness independent from external dependencies', () => {
      expect(appController.getLiveness()).toEqual({ status: 'ok' });
    });

    it('reports readiness separately', async () => {
      await expect(appController.getReadiness()).resolves.toEqual({
        status: 'ready',
        checks: { database: 'ok', redis: 'disabled' },
      });
    });

    it('maps an unavailable dependency to a structured 503', async () => {
      const failure = {
        status: 'not_ready',
        checks: { database: 'unavailable', redis: 'ok' },
        error: {
          code: 'SERVICE_NOT_READY',
          message: 'One or more required dependencies are unavailable.',
        },
      };
      readiness.check.mockResolvedValue(failure);

      await expect(appController.getReadiness()).rejects.toMatchObject({
        response: failure,
        status: 503,
      });
    });
  });
});


describe('production configuration', () => {
  const valid = {
    SECRET_KEY: 'a'.repeat(32), DATABASE_URL: 'postgresql://db.example.test/app', DATABASE_SSL: 'true',
    CORS_ORIGINS: 'https://app.example.test', COOKIE_SECURE: 'true', RATE_LIMIT_ENABLED: 'true',
    REDIS_URL: 'rediss://redis.example.test', EMAIL_DELIVERY_URL: 'https://mail.example.test', EMAIL_DELIVERY_TOKEN: 'token',
  };
  for (const APP_ENV of ['staging', 'production']) {
    for (const SECRET_KEY of ['development-only-secret-not-for-production-32b', 'change-me-in-production', 'replace-with-a-long-random-secret', 'a'.repeat(31)]) {
      it(APP_ENV + ' rejects example or short secrets: ' + SECRET_KEY, () => {
        expect(() => validateEnvironment({ ...valid, APP_ENV, SECRET_KEY })).toThrow('SECRET_KEY must be a unique value of at least 32 characters in production.');
      });
    }
    it(APP_ENV + ' rejects a local database', () => {
      expect(() => validateEnvironment({ ...valid, APP_ENV, DATABASE_URL: 'postgresql://localhost/app' })).toThrow('DATABASE_URL must point to the production database.');
    });
    it(APP_ENV + ' accepts a remote database and a 32-character secret', () => {
      expect(validateEnvironment({ ...valid, APP_ENV }).SECRET_KEY).toBe(valid.SECRET_KEY);
    });
  }
  it('keeps development examples available locally', () => {
    expect(validateEnvironment({ SECRET_KEY: 'change-me-in-production', DATABASE_URL: 'postgresql://localhost/app' }).APP_ENV).toBe('development');
  });
});
