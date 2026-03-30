import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { AuthService } from './auth.service';
import { PasswordResetOtp } from './entities/password-reset-otp.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findActiveByEmail: jest.fn(),
            findActiveById: jest.fn(),
            findByEmailVerificationToken: jest.fn(),
            findOne: jest.fn(),
            createPartial: jest.fn(),
            save: jest.fn(),
          },
        },
        { provide: JwtService, useValue: { signAsync: jest.fn(), verifyAsync: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === 'jwt') {
                return {
                  keysDir: '/tmp',
                  accessExpiresIn: '15m',
                  refreshExpiresIn: '7d',
                  passwordResetExpiresIn: '15m',
                  issuer: 'test',
                };
              }
              if (key === 'app') {
                return { baseUrl: 'http://localhost:3000' };
              }
              if (key === 'security') {
                return { otpPepper: 'test-pepper' };
              }
              throw new Error(`unknown ${key}`);
            }),
          },
        },
        { provide: MailerService, useValue: { sendMail: jest.fn() } },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), update: jest.fn() },
        },
        {
          provide: getRepositoryToken(PasswordResetOtp),
          useValue: { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), update: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
