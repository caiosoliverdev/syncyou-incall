import { registerAs } from '@nestjs/config';

export default registerAs('security', () => ({
  otpPepper: process.env.OTP_PEPPER ?? 'dev-otp-pepper-change-in-production',
}));
