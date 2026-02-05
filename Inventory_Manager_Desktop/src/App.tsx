import React, { useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline, Box, CircularProgress } from '@mui/material';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { modernTheme } from './theme';
import { useAuthStore } from './store/authStore';
import { Layout } from './components/Layout';
import { LoginScreen } from './components/LoginScreen';
import { DashboardRouter } from './components/DashboardRouter';

// --- CHANGE 1: Import CatalogPage instead of ProductTable ---
// import { ProductTable } from './components/ProductTable'; // REMOVED
import { CatalogPage } from './pages/CatalogPage'; // ADDED

import { AnalyticsPage } from './pages/AnalyticsPage';
import { DataSciencePage } from './pages/DataSciencePage';
import { SystemPage } from './pages/SystemPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { UserProfilePage } from './pages/UserProfilePage';
import { InventoryPage } from './pages/InventoryPage';
import ReportsPage from './pages/ReportPage';
import { OrdersPage } from './pages/OrdersPage';
import { SupportPage } from './pages/SupportPage';
import { BillingPage } from './pages/billingPage';
import SalesHistoryPage from './pages/SalesHistoryPage';
import { StockAlertsPage } from './pages/StockAlertsPage';
import B2BPage from './pages/B2BPage';
import KhataPage from './pages/KhataPage';


const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
      }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

function App() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <ThemeProvider theme={modernTheme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />

          {/* Main Layout Routes - ALL pages should be inside here */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardRouter />} />

            {/* --- CHANGE 2: Update the route to use CatalogPage --- */}
            <Route path="products" element={<CatalogPage />} />

            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="datascience" element={<DataSciencePage />} />
            <Route path="system" element={<SystemPage />} />
            <Route path="users" element={<UserManagementPage />} />
            <Route path="profile" element={<UserProfilePage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="support" element={<SupportPage />} />

            {/* Billing / POS Route */}
            <Route path="sales" element={<BillingPage />} />

            {/* Sales History Route */}
            <Route path="sales/history" element={<SalesHistoryPage />} />

            {/* Stock Alerts Route */}
            <Route path="stock-alerts" element={<StockAlertsPage />} />

            {/* B2B / Wholesale Route */}
            <Route path="b2b" element={<B2BPage />} />

            {/* Khata (Credit Customers) Route */}
            <Route path="khata" element={<KhataPage />} />

            {/* Invoice Settings Route */}

          </Route>

          {/* Catch-all Route */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;