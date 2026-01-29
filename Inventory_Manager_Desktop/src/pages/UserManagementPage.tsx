import React, { useEffect, useState } from 'react';
import {
  Paper, Typography, Box, Button, Chip, CircularProgress,
  Alert, Tabs, Tab, IconButton, Tooltip
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import {
  Security, PersonAdd, LocalOffer, Badge,
  Block, CheckCircle
} from '@mui/icons-material';
import { getAllUsers, toggleUserStatus, type User } from '../services/userService';
import { AssignRoleDialog } from '../components/AssignRoleDialog';
import { AddUserDialog } from '../components/AddUserDialog';
import { LoyaltySettingsCard } from '../components/LoyaltySettingsCard';
import { useAuthStore } from '../store/authStore';

export const UserManagementPage: React.FC = () => {
  // Get user role from auth store
  const { user } = useAuthStore();
  const userRole = user?.roles?.includes('owner') ? 'owner'
    : user?.roles?.includes('manager') ? 'manager'
      : 'employee';

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog States
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Holds the full User object
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [error, setError] = useState('');

  // Tab State: 0 = Staff, 1 = Customers
  const [tabValue, setTabValue] = useState(0);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getAllUsers();
      setUsers(data);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to load users. Ensure you are an IT Admin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Handle Block/Unblock
  const handleToggleStatus = async (username: string, currentStatus: boolean) => {
    const action = currentStatus ? "BLOCK" : "ACTIVATE";
    if (!window.confirm(`Are you sure you want to ${action} user ${username}?`)) return;

    try {
      await toggleUserStatus(username);
      loadUsers(); // Refresh list to show new status
    } catch (err: any) {
      alert(err.response?.data?.detail || "Action failed");
    }
  };

  // Filter users based on tabs
  const filteredUsers = users.filter(user => {
    // Check if user has ANY staff role
    const isStaff = user.roles.some(r => ['manager', 'employee', 'it_admin'].includes(r));

    if (tabValue === 0) {
      // STAFF TAB: Show if they are staff OR have no roles (new users)
      return isStaff || user.roles.length === 0;
    } else {
      // CUSTOMER TAB: Show ONLY if they are strictly a customer (and NOT staff)
      return !isStaff && user.roles.includes('customer');
    }
  });

  const columns: GridColDef[] = [
    {
      field: 'id',
      headerName: 'ID',
      width: 70,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          {params.value}
        </Box>
      )
    },
    {
      field: 'username',
      headerName: tabValue === 1 ? 'Customer Name' : 'Username',
      width: 180,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2" fontWeight="600">{params.value}</Typography>
        </Box>
      )
    },
    {
      field: 'email',
      headerName: 'Email',
      width: 250,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2" color="text.secondary">{params.value}</Typography>
        </Box>
      )
    },
    {
      field: 'roles',
      headerName: 'Assigned Roles',
      width: 280,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', height: '100%' }}>
          {params.value.length === 0 && (
            <Chip label="No Role" size="small" color="default" variant="outlined" />
          )}
          {params.value.map((role: string) => {
            let color = '#94a3b8';
            let bg = '#f1f5f9';

            if (role === 'it_admin') { color = '#dc2626'; bg = '#fee2e2'; }
            else if (role === 'manager') { color = '#7c3aed'; bg = '#ede9fe'; }
            else if (role === 'employee') { color = '#2563eb'; bg = '#dbeafe'; }
            else if (role === 'customer') { color = '#059669'; bg = '#d1fae5'; }

            return (
              <Chip
                key={role}
                label={role}
                size="small"
                sx={{
                  fontWeight: 600,
                  color: color,
                  backgroundColor: bg,
                  textTransform: 'capitalize',
                  height: 24,
                  borderRadius: 1
                }}
              />
            );
          })}
        </Box>
      )
    },
    // --- NEW: Status Column ---
    {
      field: 'is_active',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Chip
            label={params.value ? "Active" : "Blocked"}
            color={params.value ? "success" : "error"}
            size="small"
            variant={params.value ? "filled" : "outlined"}
            sx={{ fontWeight: 600 }}
          />
        </Box>
      )
    },
    // --- UPDATED: Actions Column ---
    {
      field: 'actions',
      headerName: 'Actions',
      width: 200,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: '100%' }}>
          <Button
            size="small"
            startIcon={<Security />}
            variant="outlined"
            onClick={() => {
              setSelectedUser(params.row);
              setRoleDialogOpen(true);
            }}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              borderColor: '#cbd5e1',
              color: '#475569',
              '&:hover': {
                borderColor: '#db2777',
                color: '#db2777',
                backgroundColor: '#fdf2f8'
              }
            }}
          >
            Manage
          </Button>

          <Tooltip title={params.row.is_active ? "Block User" : "Unblock User"}>
            <IconButton
              size="small"
              color={params.row.is_active ? "error" : "success"}
              onClick={() => handleToggleStatus(params.row.username, params.row.is_active)}
              sx={{
                bgcolor: params.row.is_active ? '#fee2e2' : '#dcfce7',
                '&:hover': { bgcolor: params.row.is_active ? '#fecaca' : '#bbf7d0' }
              }}
            >
              {params.row.is_active ? <Block fontSize="small" /> : <CheckCircle fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      )
    }
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Page Title & Add Button */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" fontWeight="700" color="text.primary">
            {tabValue === 0 ? '👥 Staff Management' : '🌟 Customer Loyalty'}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {tabValue === 0 ? 'Manage employees, managers and admins' : 'View registered loyalty program members'}
          </Typography>
        </Box>

        <Button
          variant="contained"
          size="large"
          startIcon={<PersonAdd />}
          onClick={() => setAddDialogOpen(true)}
          sx={{
            bgcolor: tabValue === 0 ? '#6366f1' : '#10b981',
            '&:hover': { bgcolor: tabValue === 0 ? '#4f46e5' : '#059669' },
            px: 3,
            py: 1,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            boxShadow: 2
          }}
        >
          Add {tabValue === 0 ? 'Staff' : 'Customer'}
        </Button>
      </Box>

      {/* Tab Switcher */}
      <Paper sx={{ borderRadius: 3, overflow: 'hidden', boxShadow: 1 }}>
        <Tabs
          value={tabValue}
          onChange={(_, v) => setTabValue(v)}
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: '#ffffff',
            '& .MuiTab-root': { fontWeight: 600, textTransform: 'none', minHeight: 56 }
          }}
        >
          <Tab icon={<Badge />} iconPosition="start" label="Staff & Admins" />
          <Tab icon={<LocalOffer />} iconPosition="start" label="Loyalty Customers" />
        </Tabs>

        {error && <Alert severity="error" sx={{ m: 2, borderRadius: 2 }}>{error}</Alert>}

        {loading ? (
          <Box sx={{ p: 8, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
        ) : (
          <Box sx={{ height: 500, width: '100%' }}>
            <DataGrid
              rows={filteredUsers}
              columns={columns}
              rowHeight={60}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
              pageSizeOptions={[10, 25]}
              disableRowSelectionOnClick
              sx={{
                border: 'none',
                '& .MuiDataGrid-cell': { borderColor: '#f1f5f9', px: 2 },
                '& .MuiDataGrid-columnHeaders': {
                  backgroundColor: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  color: '#64748b',
                  fontWeight: 600,
                },
                '& .MuiDataGrid-footerContainer': { borderTop: '1px solid #e2e8f0' },
              }}
            />
          </Box>
        )}
      </Paper>

      {/* Dialogs */}
      <AssignRoleDialog
        open={roleDialogOpen}
        onClose={() => setRoleDialogOpen(false)}
        selectedUser={selectedUser}
        onSuccess={loadUsers}
      />

      <AddUserDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSuccess={loadUsers}
        initialTab={tabValue}
      />

      {/* Loyalty Settings Card (Manager/Owner only) */}
      {(userRole === 'owner' || userRole === 'manager') && (
        <LoyaltySettingsCard userRole={userRole} />
      )}
    </Box>
  );
};