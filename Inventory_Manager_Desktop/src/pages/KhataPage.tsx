import React, { useState, useCallback } from 'react';
import { Box, Typography, Alert, Snackbar } from '@mui/material';
import { AccountBalance as KhataIcon } from '@mui/icons-material';
import type { KhataCustomer } from '../services/khataService';
import KhataDashboardCards from '../components/khata/KhataDashboardCards';
import KhataCustomerList from '../components/khata/KhataCustomerList';
import AddKhataCustomerDialog from '../components/khata/AddKhataCustomerDialog';
import KhataCustomerDetail from '../components/khata/KhataCustomerDetail';
import QuickCreditSaleDialog from '../components/khata/QuickCreditSaleDialog';

const KhataPage: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'customer-detail'>('dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [sellDialogCustomer, setSellDialogCustomer] = useState<KhataCustomer | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  const handleRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const handleCustomerClick = (customer: KhataCustomer) => {
    setSelectedCustomerId(customer.id);
    setView('customer-detail');
  };

  const handleBackToDashboard = () => {
    setView('dashboard');
    setSelectedCustomerId(null);
    handleRefresh();
  };

  const handleCustomerAdded = () => {
    handleRefresh();
    setSnackbar({ open: true, message: 'Customer added successfully', severity: 'success' });
  };

  const handleSellToCustomer = (customer: KhataCustomer) => {
    setSellDialogCustomer(customer);
  };

  const handleCreditSaleSuccess = (orderId: number) => {
    setSellDialogCustomer(null);
    handleRefresh();
    setSnackbar({ open: true, message: `Credit sale completed! Order #${orderId}`, severity: 'success' });
  };

  // Customer Detail View
  if (view === 'customer-detail' && selectedCustomerId) {
    return (
      <Box sx={{ p: 3 }}>
        <KhataCustomerDetail 
          customerId={selectedCustomerId} 
          onBack={handleBackToDashboard}
        />
      </Box>
    );
  }

  // Dashboard View
  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <KhataIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              Khata (Credit Customers)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage credit accounts for regular customers who pay at month-end
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Dashboard Cards */}
      <KhataDashboardCards />

      {/* Customer List */}
      <Box sx={{ mt: 3 }}>
        <KhataCustomerList 
          onCustomerSelect={handleCustomerClick}
          onAddCustomer={() => setAddCustomerOpen(true)}
          onSellToCustomer={handleSellToCustomer}
          refreshTrigger={refreshTrigger}
        />
      </Box>

      {/* Add Customer Dialog */}
      <AddKhataCustomerDialog
        open={addCustomerOpen}
        onClose={() => setAddCustomerOpen(false)}
        onSuccess={handleCustomerAdded}
      />

      {/* Quick Credit Sale Dialog */}
      {sellDialogCustomer && (
        <QuickCreditSaleDialog
          open={!!sellDialogCustomer}
          onClose={() => setSellDialogCustomer(null)}
          customer={sellDialogCustomer}
          onSuccess={handleCreditSaleSuccess}
        />
      )}

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))} 
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default KhataPage;
