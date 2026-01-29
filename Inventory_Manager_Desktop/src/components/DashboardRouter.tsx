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

  // Determine if user has multiple dashboard-eligible roles
  const hasManagerAccess = isManager || isOwner;
  const hasDualRoles = hasManagerAccess && isAdmin;
  const isEmployeeOnly = isEmployee && !isManager && !isOwner && !isAdmin;

  // Default view mode based on role priority
  // Priority: Manager/Owner > Admin > Employee
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
    if (newView !== null) {
      setViewMode(newView);
    }
  };

  const renderDashboard = () => {
    // Employee-only users always get the employee dashboard
    if (isEmployeeOnly) return <EmployeeDashboardHome />;

    if (viewMode === 'admin' && isAdmin) return <AdminDashboardHome />;
    if (viewMode === 'employee') return <EmployeeDashboardHome />;
    return <DashboardHome />;
  };

  return (
    <Box>
      {/* Toggle Control - Only show if user has multiple roles */}
      {hasDualRoles && (
        <Paper
          elevation={0}
          sx={{
            display: 'inline-flex',
            p: 0.5,
            mb: 3,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            background: 'white',
          }}
        >
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewChange}
            aria-label="dashboard view"
            sx={{
              '& .MuiToggleButton-root': {
                border: 'none',
                borderRadius: 1.5,
                px: 3,
                py: 1,
                textTransform: 'none',
                fontWeight: 600,
                transition: 'all 0.2s ease',
                '&.Mui-selected': {
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%)',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(102, 126, 234, 0.08)',
                },
              },
            }}
          >
            <ToggleButton value="manager" aria-label="manager view">
              <ManagerIcon sx={{ mr: 1, fontSize: 20 }} />
              Manager View
            </ToggleButton>
            <ToggleButton value="admin" aria-label="admin view">
              <AdminIcon sx={{ mr: 1, fontSize: 20 }} />
              Admin View
            </ToggleButton>
          </ToggleButtonGroup>
        </Paper>
      )}

      {/* Render selected dashboard */}
      {renderDashboard()}
    </Box>
  );
};
