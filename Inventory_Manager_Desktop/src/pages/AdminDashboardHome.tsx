import React, { useEffect, useState } from 'react';
import {
  Paper, Typography, CircularProgress, Box, Chip, Card,
  CardContent, CardActionArea, Button, IconButton, Tooltip, Divider,
  ToggleButton, ToggleButtonGroup, FormControlLabel, Switch
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import {
  CheckCircle, Error as ErrorIcon, People, Dns, Backup, ArrowForward,
  Schedule as ScheduleIcon, Storage as StorageIcon, Refresh as RefreshIcon,
  Assignment as AssignmentIcon, PersonAdd as PersonAddIcon, History as HistoryIcon,
  SettingsBackupRestore as RestoreIcon, NotificationsActive as AlertsIcon,
  CalendarToday as CalendarIcon, CheckCircleOutline as NoAlertsIcon
} from '@mui/icons-material';
import { getSystemAlerts, type SystemAlert, triggerManualBackup, getBackups, type BackupFile, requestAlertClosure } from '../services/systemService';
import { getAllUsers } from '../services/userService';
import { useNavigate } from 'react-router-dom';

export const AdminDashboardHome: React.FC = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [userCount, setUserCount] = useState<number>(0);
  const [backupInfo, setBackupInfo] = useState<{ lastBackup: BackupFile | null; totalCount: number; totalSize: number }>({ lastBackup: null, totalCount: 0, totalSize: 0 });
  const [loading, setLoading] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [hideResolved, setHideResolved] = useState<boolean>(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // 1. Fetch System Alerts
        const alertData = await getSystemAlerts();
        setAlerts(alertData);

        // 2. Fetch Users & Calculate Active Staff Count
        const allUsers = await getAllUsers();

        // Filter logic: Must be active AND have a staff role (not just a customer)
        const activeStaff = allUsers.filter(user =>
          user.is_active &&
          user.roles.some(role => ['manager', 'employee', 'it_admin', 'owner'].includes(role))
        ).length;

        setUserCount(activeStaff);

        // 3. Fetch Backup Status
        try {
          const backups = await getBackups();
          const sortedBackups = backups.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          const totalSize = backups.reduce((acc, b) => acc + b.size_mb, 0);
          setBackupInfo({
            lastBackup: sortedBackups[0] || null,
            totalCount: backups.length,
            totalSize: Math.round(totalSize * 100) / 100
          });
        } catch (e) {
          console.warn('Could not fetch backups', e);
        }

        setLastUpdated(new Date());

      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };
    loadData();
  }, []);

  const handleQuickBackup = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the card click
    if (!window.confirm("Trigger immediate system backup?")) return;

    setBackupLoading(true);
    try {
      await triggerManualBackup();
      alert("Backup initiated successfully!");
      // Optional: Refresh alerts to show the new backup log if your backend logs it as an alert
      const newAlerts = await getSystemAlerts();
      setAlerts(newAlerts);
    } catch (err) {
      alert("Backup failed. Check system logs.");
    } finally {
      setBackupLoading(false);
    }
  };

  // Only count unresolved alerts for meaningful metrics
  const criticalAlerts = alerts.filter(a => a.severity === 'critical' && a.status !== 'resolved').length;
  const pendingIssues = alerts.filter(a => a.status !== 'resolved').length;

  const columns: GridColDef[] = [
    {
      field: 'severity', headerName: 'Severity', width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value}
          color={params.value === 'critical' ? 'error' : params.value === 'warning' ? 'warning' : 'info'}
          size="small"
          sx={{ fontWeight: 600, textTransform: 'capitalize' }}
        />
      )
    },
    { field: 'message', headerName: 'Message', flex: 1 },
    {
      field: 'created_at', headerName: 'Time', width: 180,
      valueFormatter: (value: string) => value ? new Date(value).toLocaleString() : ''
    },
    {
      field: 'status', headerName: 'Status', width: 140,
      renderCell: (params) => {
        const status = params.value || 'active';
        if (status === 'resolved') {
          return <Chip label="Resolved" color="success" size="small" variant="outlined" sx={{ fontWeight: 500, fontSize: '0.7rem' }} />;
        } else if (status === 'pending_user') {
          return <Chip label="Pending Confirm" color="warning" size="small" variant="outlined" sx={{ fontWeight: 500, fontSize: '0.7rem' }} />;
        } else {
          return <Chip label="Active" color="error" size="small" variant="outlined" sx={{ fontWeight: 500, fontSize: '0.7rem' }} />;
        }
      }
    },
    {
      field: 'actions', headerName: 'Action', width: 130,
      renderCell: (params) => {
        const status = params.row.status || 'active';

        if (status === 'resolved') {
          return <Chip label="Done" size="small" color="success" icon={<CheckCircle sx={{ fontSize: 12 }} />} sx={{ fontSize: '0.7rem', height: 24 }} />;
        } else if (status === 'pending_user') {
          return <Chip label="Awaiting User" size="small" color="warning" variant="outlined" sx={{ fontSize: '0.65rem', height: 24 }} />;
        } else {
          return (
            <Chip
              label="Mark Fixed"
              size="small"
              color="primary"
              clickable
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await requestAlertClosure(params.row.id);
                  setAlerts(prev => prev.map(a => a.id === params.row.id ? { ...a, status: 'pending_user' } : a));
                } catch (err) {
                  console.error('Failed to mark as fixed', err);
                }
              }}
              sx={{ fontWeight: 600, fontSize: '0.7rem', height: 24 }}
            />
          );
        }
      }
    }
  ];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress size={48} />
      </Box>
    );
  }

  // --- Refresh Handler ---
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const alertData = await getSystemAlerts();
      setAlerts(alertData);

      const allUsers = await getAllUsers();
      const activeStaff = allUsers.filter(user =>
        user.is_active &&
        user.roles.some(role => ['manager', 'employee', 'it_admin', 'owner'].includes(role))
      ).length;
      setUserCount(activeStaff);

      try {
        const backups = await getBackups();
        const sortedBackups = backups.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const totalSize = backups.reduce((acc, b) => acc + b.size_mb, 0);
        setBackupInfo({
          lastBackup: sortedBackups[0] || null,
          totalCount: backups.length,
          totalSize: Math.round(totalSize * 100) / 100
        });
      } catch (e) { }

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to refresh', err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
            🖥️ IT Operations Center
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CalendarIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem />
            <Typography variant="body2" color="text.secondary">
              Monitor system health, backups, and user access.
            </Typography>
            {lastUpdated && (
              <>
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                <Typography variant="caption" color="text.disabled">
                  Updated {lastUpdated.toLocaleTimeString()}
                </Typography>
              </>
            )}
            <Tooltip title="Refresh all data">
              <IconButton
                size="small"
                onClick={handleRefresh}
                disabled={refreshing}
                sx={{ ml: 0.5 }}
              >
                <RefreshIcon sx={{ fontSize: 18, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {/* Status Cards Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' }, gap: 3 }}>

        {/* 1. System Health Card */}
        <Card
          sx={{
            borderRadius: 3,
            boxShadow: 3,
            bgcolor: criticalAlerts > 0 ? '#ef4444' : '#10b981',
            color: 'white',
            transition: 'transform 0.2s',
            '&:hover': { transform: 'translateY(-4px)' }
          }}
        >
          <CardActionArea onClick={() => navigate('/system')} sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', borderRadius: '12px', p: 1 }}>
                  {criticalAlerts > 0 ? <ErrorIcon fontSize="large" /> : <CheckCircle fontSize="large" />}
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>System Status</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {criticalAlerts > 0 ? `${criticalAlerts} Critical Issues` : 'Operational'}
                  </Typography>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Go to Health Check <ArrowForward fontSize="small" style={{ fontSize: 12 }} />
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>

        {/* 2. Active Staff Card (Now Dynamic) */}
        <Card
          sx={{
            borderRadius: 3,
            boxShadow: 3,
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            color: 'white',
            transition: 'transform 0.2s',
            '&:hover': { transform: 'translateY(-4px)' }
          }}
        >
          <CardActionArea onClick={() => navigate('/users')} sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', borderRadius: '12px', p: 1 }}>
                  <People fontSize="large" />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Active Staff</Typography>
                  {/* Dynamic Count */}
                  <Typography variant="h3" sx={{ fontWeight: 700 }}>{userCount}</Typography>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Manage Permissions <ArrowForward fontSize="small" style={{ fontSize: 12 }} />
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>

        {/* 3. Pending Issues Card */}
        <Card
          sx={{
            borderRadius: 3,
            boxShadow: 3,
            background: pendingIssues > 0
              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
              : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            color: 'white',
            transition: 'transform 0.2s',
            '&:hover': { transform: 'translateY(-4px)' }
          }}
        >
          <CardActionArea onClick={() => navigate('/system')} sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', borderRadius: '12px', p: 1 }}>
                  <AssignmentIcon fontSize="large" />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Pending Issues</Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700 }}>{pendingIssues}</Typography>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {pendingIssues > 0 ? 'Needs Attention' : 'All Clear'} <ArrowForward fontSize="small" style={{ fontSize: 12 }} />
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>

        {/* 4. Backup Status Card */}
        <Card
          sx={{
            borderRadius: 3,
            boxShadow: 3,
            background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            color: 'white',
            transition: 'transform 0.2s',
            '&:hover': { transform: 'translateY(-4px)' }
          }}
        >
          <CardActionArea onClick={() => navigate('/system')} sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', borderRadius: '12px', p: 1 }}>
                  <StorageIcon fontSize="large" />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Backup Status</Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700 }}>{backupInfo.totalCount}</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>Total backups • {backupInfo.totalSize} MB</Typography>
                </Box>
              </Box>

              {/* Last Backup Info */}
              <Box sx={{ bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 2, p: 1.5, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <ScheduleIcon sx={{ fontSize: 16, opacity: 0.9 }} />
                  <Typography variant="caption" sx={{ opacity: 0.9 }}>Last Backup</Typography>
                </Box>
                {backupInfo.lastBackup ? (
                  <>
                    <Typography variant="body2" fontWeight={600}>
                      {new Date(backupInfo.lastBackup.created_at).toLocaleString()}
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>
                      {backupInfo.lastBackup.type === 'auto' ? '🔄 Automatic' : '👤 Manual'} • {backupInfo.lastBackup.size_mb} MB
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" sx={{ opacity: 0.7 }}>No backups found</Typography>
                )}
              </Box>

              {/* Quick Backup Button */}
              <Button
                variant="contained"
                size="small"
                fullWidth
                startIcon={backupLoading ? <CircularProgress size={14} color="inherit" /> : <Backup />}
                onClick={(e) => { e.stopPropagation(); handleQuickBackup(e); }}
                disabled={backupLoading}
                sx={{
                  bgcolor: 'white',
                  color: '#7c3aed',
                  fontWeight: 'bold',
                  textTransform: 'none',
                  '&:hover': { bgcolor: '#f3f4f6' }
                }}
              >
                {backupLoading ? 'Backing up...' : 'Trigger Backup Now'}
              </Button>
            </CardContent>
          </CardActionArea>
        </Card>
      </Box>

      {/* Quick Actions */}
      <Paper sx={{ p: 3, borderRadius: 3, boxShadow: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          ⚡ Quick Actions
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            onClick={() => navigate('/users', { state: { openCreateDialog: true } })}
            sx={{
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              px: 3
            }}
          >
            Add New User
          </Button>
          <Button
            variant="outlined"
            startIcon={<HistoryIcon />}
            onClick={() => navigate('/system', { state: { scrollToAuditLogs: true } })}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            View Audit Logs
          </Button>
          <Button
            variant="outlined"
            startIcon={<RestoreIcon />}
            onClick={() => navigate('/system', { state: { openRestoreDialog: true } })}
            color="secondary"
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            Restore Backup
          </Button>
          <Button
            variant="outlined"
            startIcon={<AlertsIcon />}
            onClick={() => navigate('/system')}
            color="warning"
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            View All Alerts
          </Button>
        </Box>
      </Paper>

      {/* Recent Alerts Table */}
      <Paper sx={{ p: 3, height: 500, width: '100%', borderRadius: 3, boxShadow: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            🚨 Recent System Alerts
          </Typography>
          <ToggleButtonGroup
            value={filterSeverity}
            exclusive
            onChange={(_, value) => setFilterSeverity(value)}
            size="small"
          >
            <ToggleButton value="" sx={{ textTransform: 'none', px: 2 }}>
              All
            </ToggleButton>
            <ToggleButton value="critical" sx={{ textTransform: 'none', px: 2, color: '#ef4444' }}>
              Critical ({alerts.filter(a => a.severity === 'critical' && (!hideResolved || a.status !== 'resolved')).length})
            </ToggleButton>
            <ToggleButton value="warning" sx={{ textTransform: 'none', px: 2, color: '#f59e0b' }}>
              Warning ({alerts.filter(a => a.severity === 'warning' && (!hideResolved || a.status !== 'resolved')).length})
            </ToggleButton>
            <ToggleButton value="medium" sx={{ textTransform: 'none', px: 2, color: '#3b82f6' }}>
              Medium ({alerts.filter(a => a.severity === 'medium' && (!hideResolved || a.status !== 'resolved')).length})
            </ToggleButton>
          </ToggleButtonGroup>
          <FormControlLabel
            control={
              <Switch
                checked={hideResolved}
                onChange={(e) => setHideResolved(e.target.checked)}
                size="small"
              />
            }
            label={<Typography variant="body2" color="text.secondary">Hide Resolved</Typography>}
            sx={{ ml: 1 }}
          />
        </Box>
        <Box sx={{ height: 400 }}>
          {(() => {
            const filteredAlerts = alerts
              .filter(a => !filterSeverity || a.severity === filterSeverity)
              .filter(a => !hideResolved || a.status !== 'resolved');

            return filteredAlerts.length === 0 ? (
              <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'text.secondary'
              }}>
                <NoAlertsIcon sx={{ fontSize: 64, color: '#22c55e', mb: 2 }} />
                <Typography variant="h6" fontWeight={600} color="text.primary">
                  All Clear! 🎉
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {filterSeverity
                    ? `No ${filterSeverity} alerts${hideResolved ? ' (unresolved)' : ''} at the moment.`
                    : hideResolved
                      ? 'No unresolved alerts. Everything is running smoothly!'
                      : 'No system alerts to display.'
                  }
                </Typography>
              </Box>
            ) : (
              <DataGrid
                rows={filteredAlerts}
                columns={columns}
                getRowHeight={() => 52}
                initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
                pageSizeOptions={[5, 10]}
                disableRowSelectionOnClick
                sx={{
                  border: 'none',
                  '& .MuiDataGrid-columnHeaders': { bgcolor: '#f8fafc', fontWeight: 600 },
                  '& .MuiDataGrid-row': {
                    borderBottom: '1px solid #e2e8f0',
                    '&:hover': { bgcolor: '#f8fafc' }
                  },
                  '& .MuiDataGrid-cell': { py: 1.5 }
                }}
              />
            )
          })()}
        </Box>
      </Paper>
    </Box>
  );
};
