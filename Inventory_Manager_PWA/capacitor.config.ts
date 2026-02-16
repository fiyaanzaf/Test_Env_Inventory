import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.storeos.inventorymanager',
  appName: 'Store OS',
  webDir: 'dist',               // Vite build output folder
  bundledWebRuntime: false,
  
  server: {
    // Allow all HTTP connections (needed for LAN backend)
    cleartext: true,
    // Don't use any URL — load from local dist/ files
    // The app will use localStorage backend_url for API calls
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
