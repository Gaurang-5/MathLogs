import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mathlogs.app',
  appName: 'MathLogs',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    hostname: 'mathlogs.app',
    cleartext: true,
  }
};

export default config;
