import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mathlogs.app',
  appName: 'MathLogs',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
  server: {
    androidScheme: 'https',
    cleartext: true,
    hostname: 'mathlogs.app'
  }
};

export default config;
