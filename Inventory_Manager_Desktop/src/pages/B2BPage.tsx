import React, { useState, useCallback } from 'react';
import { Box, Typography, Alert, Snackbar } from '@mui/material';
import { Storefront as B2BIcon } from '@mui/icons-material';
import type { B2BClient } from '../services/b2bService';
import B2BDashboardCards from '../components/b2b/B2BDashboardCards';
import B2BClientList from '../components/b2b/B2BClientList';
import AddB2BClientDialog from '../components/b2b/AddB2BClientDialog';
import B2BClientDetail from '../components/b2b/B2BClientDetail';

const B2BPage: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'client-detail'>('dashboard');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  const handleRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const handleClientClick = (client: B2BClient) => {
    setSelectedClientId(client.id);
    setView('client-detail');
  };

  const handleBackToDashboard = () => {
    setView('dashboard');
    setSelectedClientId(null);
    handleRefresh(); // Refresh data when coming back
  };

  const handleClientAdded = () => {
    handleRefresh();
    setSnackbar({ open: true, message: 'Client added successfully', severity: 'success' });
  };

  // Client Detail View
  if (view === 'client-detail' && selectedClientId) {
    return (
      <Box sx={{ p: 3 }}>
        <B2BClientDetail 
          clientId={selectedClientId} 
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
          <B2BIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              Wholesale / B2B
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage B2B clients, orders, and khata accounts
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Dashboard Cards */}
      <B2BDashboardCards 
        onClientClick={handleClientClick}
      />

      {/* Client List */}
      <Box sx={{ mt: 3 }}>
        <B2BClientList 
          onClientSelect={handleClientClick}
          onAddClient={() => setAddClientOpen(true)}
          refreshTrigger={refreshTrigger}
        />
      </Box>

      {/* Add Client Dialog */}
      <AddB2BClientDialog
        open={addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onSuccess={handleClientAdded}
      />

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

export default B2BPage;
