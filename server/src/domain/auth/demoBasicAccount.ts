export type DemoBasicCredentials = {
  phone: string;
  otp: string;
};

function digits(value: string | undefined): string {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Demo credentials are opt-in and unavailable in production. Keeping them in
 * environment variables prevents a shared OTP from becoming a live backdoor.
 */
export function demoBasicCredentials(
  environment: NodeJS.ProcessEnv = process.env,
): DemoBasicCredentials | null {
  if (environment.NODE_ENV === 'production') return null;
  const phone = digits(environment.DEMO_BASIC_PHONE);
  const otp = digits(environment.DEMO_BASIC_OTP);
  if (!/^\d{10}$/.test(phone) || !/^\d{5}$/.test(otp)) return null;
  return { phone, otp };
}
