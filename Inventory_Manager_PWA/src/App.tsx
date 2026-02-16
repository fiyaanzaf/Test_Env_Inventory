import React, { useEffect, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline, Box, CircularProgress } from '@mui/material';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { mobileTheme } from './theme';
import { useAuthStore } from './store/authStore';
import { Layout } from './components/Layout';
import { LoginScreen } from './components/LoginScreen';
import { DashboardRouter } from './components/DashboardRouter';
import { QRScanScreen } from './components/QRScanScreen';
import { isBackendConfigured } from './api/client';

import { CatalogPage } from './pages/CatalogPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SystemPage } from './pages/SystemPage';
import { UserProfilePage } from './pages/UserProfilePage';
import { InventoryPage } from './pages/InventoryPage';
import { OrdersPage } from './pages/OrdersPage';
import { SupportPage } from './pages/SupportPage';
import SalesHistoryPage from './pages/SalesHistoryPage';
import { StockAlertsPage } from './pages/StockAlertsPage';
import B2BPage from './pages/B2BPage';
import KhataPage from './pages/KhataPage';


const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <Box sx={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: '100dvh',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
      }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

function App() {
  const { checkAuth } = useAuthStore();
  const [backendReady, setBackendReady] = useState<boolean>(() => {
    // In browser (not APK), auto-detect works, so skip QR scan gate
    // In APK (Capacitor), hostname is 'localhost' and we need QR scan
    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname;
      // If opened via IP in browser (e.g. http://192.168.1.5:5174), backend is auto-resolved
      if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return true;
      }
    }
    // Otherwise, check if URL was saved via QR scan
    return isBackendConfigured();
  });

  useEffect(() => {
    if (backendReady) {
      checkAuth();
    }
  }, [checkAuth, backendReady]);

  // Show QR scan screen if backend not configured (APK first launch)
  if (!backendReady) {
    return (
      <ThemeProvider theme={mobileTheme}>
        <CssBaseline />
        <QRScanScreen onConnected={() => setBackendReady(true)} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={mobileTheme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardRouter />} />
            <Route path="products" element={<CatalogPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="system" element={<SystemPage />} />
            <Route path="profile" element={<UserProfilePage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="sales/history" element={<SalesHistoryPage />} />
            <Route path="stock-alerts" element={<StockAlertsPage />} />
            <Route path="b2b" element={<B2BPage />} />
            <Route path="khata" element={<KhataPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
