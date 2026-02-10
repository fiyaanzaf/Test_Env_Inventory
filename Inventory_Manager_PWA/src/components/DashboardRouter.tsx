import React, { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Paper } from '@mui/material';
import { Dashboard as ManagerIcon, Settings as AdminIcon } from '@mui/icons-material';
import { useAuthStore } from '../store/authStore';
import { DashboardHome } from '../pages/DashboardHome';
import { AdminDashboardHome } from '../pages/AdminDashboardHome';
import { EmployeeDashboardHome } from '../pages/EmployeeDashboardHome';

export const DashboardRouter: React.FC = () => {
  const { user } = useAuthStore();

  const isManager = user?.roles.includes('manager');
  const isAdmin = user?.roles.includes('it_admin');
  const isEmployee = user?.roles.includes('employee');
  const isOwner = user?.roles.includes('owner');

  const hasManagerAccess = isManager || isOwner;
  const hasDualRoles = hasManagerAccess && isAdmin;
  const isEmployeeOnly = isEmployee && !isManager && !isOwner && !isAdmin;

  const getDefaultView = () => {
    if (hasManagerAccess) return 'manager';
    if (isAdmin) return 'admin';
    return 'employee';
  };

  const [viewMode, setViewMode] = useState<'admin' | 'manager' | 'employee'>(getDefaultView());

  const handleViewChange = (
    _event: React.MouseEvent<HTMLElement>,
    newView: 'admin' | 'manager' | 'employee' | null,
  ) => {
    if (newView !== null) setViewMode(newView);
  };

  const renderDashboard = () => {
    if (isEmployeeOnly) return <EmployeeDashboardHome />;
    if (viewMode === 'admin' && isAdmin) return <AdminDashboardHome />;
    if (viewMode === 'employee') return <EmployeeDashboardHome />;
    return <DashboardHome />;
  };

  return (
    <Box>
      {hasDualRoles && (
        <Paper
          elevation={0}
          sx={{
            display: 'flex',
            p: 0.5,
            mb: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            background: 'white',
            overflow: 'auto',
          }}
        >
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewChange}
            fullWidth
            sx={{
              '& .MuiToggleButton-root': {
                border: 'none',
                borderRadius: 1.5,
                px: 2,
                py: 0.8,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.813rem',
                '&.Mui-selected': {
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                },
              },
            }}
          >
            <ToggleButton value="manager">
              <ManagerIcon sx={{ mr: 0.5, fontSize: 18 }} />
              Manager
            </ToggleButton>
            <ToggleButton value="admin">
              <AdminIcon sx={{ mr: 0.5, fontSize: 18 }} />
              Admin
            </ToggleButton>
          </ToggleButtonGroup>
        </Paper>
      )}
      {renderDashboard()}
    </Box>
  );
};
