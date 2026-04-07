import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.storeos.inventorymanager.demo',
  appName: 'Store OS Demo',
  webDir: 'dist',               // Vite build output folder
  
  server: {
    // Allow all HTTP connections (needed for LAN backend)
    cleartext: true,
    // Use an IP address for testing, although production uses dynamic URL
    androidScheme: 'http',
    allowNavigation: ['*'],
  },

  android: {
    // Allow mixed content (HTTP within HTTPS context)
    allowMixedContent: true,
  },


  plugins: {
    // No special plugin config needed
  },
};

export default config;
