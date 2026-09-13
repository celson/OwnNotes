import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ownnotes.app',
  appName: 'OwnNotes',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
