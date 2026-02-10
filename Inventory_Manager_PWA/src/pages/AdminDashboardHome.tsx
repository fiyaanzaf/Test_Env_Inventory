import React, { useEffect, useState } from 'react';
import {
  Box, Typography, CircularProgress, Card, CardContent,
  Button, Chip, IconButton, Divider, Skeleton
} from '@mui/material';
import {
  CheckCircle, Error as ErrorIcon, People, Backup,
  ArrowForward, Refresh as RefreshIcon,
  PersonAdd as PersonAddIcon, History as HistoryIcon,
  SettingsBackupRestore as RestoreIcon,
  NotificationsActive as AlertsIcon,
  Storage as StorageIcon,
  Schedule as ScheduleIcon,
  Assignment as AssignmentIcon
} from '@mui/icons-material';
import {
  getSystemAlerts, type SystemAlert,
  triggerManualBackup, getBackups, type BackupFile,
  requestAlertClosure
} from '../services/systemService';
import { getAllUsers } from '../services/userService';
import { useNavigate } from 'react-router-dom';

export const AdminDashboardHome: React.FC = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [userCount, setUserCount] = useState<number>(0);
  const [backupInfo, setBackupInfo] = useState<{ lastBackup: BackupFile | null; totalCount: number; totalSize: number }>({
    lastBackup: null, totalCount: 0, totalSize: 0
  });
  const [loading, setLoading] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

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
        const sortedBackups = backups.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
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
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => loadData(true);

  const handleQuickBackup = async () => {
    if (!window.confirm('Trigger immediate system backup?')) return;
    setBackupLoading(true);
    try {
      await triggerManualBackup();
      alert('Backup initiated successfully!');
      const newAlerts = await getSystemAlerts();
      setAlerts(newAlerts);
    } catch (err) {
      alert('Backup failed. Check system logs.');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleMarkFixed = async (alertId: number) => {
    try {
      await requestAlertClosure(alertId);
      setAlerts(prev => prev.map(a =>
        a.id === alertId ? { ...a, status: 'pending_user' as const } : a
      ));
    } catch (err) {
      console.error('Failed to mark as fixed', err);
    }
  };

  const criticalAlerts = alerts.filter(a => a.severity === 'critical' && a.status !== 'resolved').length;
  const pendingIssues = alerts.filter(a => a.status !== 'resolved').length;
  const unresolvedAlerts = alerts.filter(a => a.status !== 'resolved');

  const getSeverityColor = (severity: string): 'error' | 'warning' | 'info' => {
    switch (severity) {
      case 'critical': return 'error';
      case 'warning': return 'warning';
      default: return 'info';
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Skeleton variant="rounded" height={60} />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} variant="rounded" height={120} />)}
        </Box>
        <Skeleton variant="rounded" height={300} />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 10, px: 2, pt: 2, maxWidth: 800, mx: 'auto', width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          🖥️ IT Operations
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </Typography>
          {lastUpdated && (
            <>
              <Divider orientation="vertical" flexItem />
              <Typography variant="caption" color="text.disabled">
                {lastUpdated.toLocaleTimeString()}
              </Typography>
            </>
          )}
          <IconButton
            size="small"
            onClick={handleRefresh}
            disabled={refreshing}
            sx={{ ml: 'auto' }}
          >
            <RefreshIcon sx={{ fontSize: 20, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </IconButton>
        </Box>
      </Box>

      {/* Status Cards Grid - 2 columns */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
        {/* System Health */}
        <Card
          onClick={() => navigate('/system')}
          sx={{
            borderRadius: 3, overflow: 'hidden', cursor: 'pointer',
            bgcolor: criticalAlerts > 0 ? '#ef4444' : '#10b981',
            color: 'white', minHeight: 100,
            transition: 'transform 0.2s',
            '&:active': { transform: 'scale(0.97)' }
          }}
        >
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              {criticalAlerts > 0 ? <ErrorIcon sx={{ fontSize: 20 }} /> : <CheckCircle sx={{ fontSize: 20 }} />}
              <Typography variant="caption" sx={{ opacity: 0.9 }}>System</Typography>
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {criticalAlerts > 0 ? `${criticalAlerts} Critical` : 'Healthy'}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8, display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
              Details <ArrowForward sx={{ fontSize: 12 }} />
            </Typography>
          </CardContent>
        </Card>

        {/* Active Staff */}
        <Card
          onClick={() => navigate('/users')}
          sx={{
            borderRadius: 3, overflow: 'hidden', cursor: 'pointer',
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            color: 'white', minHeight: 100,
            transition: 'transform 0.2s',
            '&:active': { transform: 'scale(0.97)' }
          }}
        >
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <People sx={{ fontSize: 20 }} />
              <Typography variant="caption" sx={{ opacity: 0.9 }}>Active Staff</Typography>
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {userCount}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8, display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
              Manage <ArrowForward sx={{ fontSize: 12 }} />
            </Typography>
          </CardContent>
        </Card>

        {/* Pending Issues */}
        <Card
          onClick={() => navigate('/system')}
          sx={{
            borderRadius: 3, overflow: 'hidden', cursor: 'pointer',
            background: pendingIssues > 0
              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
              : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            color: 'white', minHeight: 100,
            transition: 'transform 0.2s',
            '&:active': { transform: 'scale(0.97)' }
          }}
        >
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <AssignmentIcon sx={{ fontSize: 20 }} />
              <Typography variant="caption" sx={{ opacity: 0.9 }}>Issues</Typography>
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {pendingIssues}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              {pendingIssues > 0 ? 'Needs Attention' : 'All Clear'}
            </Typography>
          </CardContent>
        </Card>

        {/* Backup Status */}
        <Card
          onClick={() => navigate('/system')}
          sx={{
            borderRadius: 3, overflow: 'hidden', cursor: 'pointer',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            color: 'white', minHeight: 100,
            transition: 'transform 0.2s',
            '&:active': { transform: 'scale(0.97)' }
          }}
        >
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <StorageIcon sx={{ fontSize: 20 }} />
              <Typography variant="caption" sx={{ opacity: 0.9 }}>Backups</Typography>
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {backupInfo.totalCount}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              {backupInfo.totalSize} MB total
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Last Backup Info & Trigger */}
      <Card sx={{ borderRadius: 3, mb: 2, boxShadow: 2 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <ScheduleIcon sx={{ color: '#8b5cf6', fontSize: 22 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
              Last Backup
            </Typography>
          </Box>

          {backupInfo.lastBackup ? (
            <Box sx={{ bgcolor: '#f8fafc', borderRadius: 2, p: 1.5, mb: 1.5, border: '1px solid #e2e8f0' }}>
              <Typography variant="body2" fontWeight={600}>
                {new Date(backupInfo.lastBackup.created_at).toLocaleString()}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {backupInfo.lastBackup.type === 'auto' ? '🔄 Automatic' : '👤 Manual'} • {backupInfo.lastBackup.size_mb} MB
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              No backups found
            </Typography>
          )}

          <Button
            variant="contained"
            fullWidth
            startIcon={backupLoading ? <CircularProgress size={16} color="inherit" /> : <Backup />}
            onClick={handleQuickBackup}
            disabled={backupLoading}
            sx={{
              minHeight: 48, borderRadius: 2,
              textTransform: 'none', fontWeight: 700,
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' }
            }}
          >
            {backupLoading ? 'Backing up...' : 'Trigger Backup Now'}
          </Button>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card sx={{ borderRadius: 3, mb: 2, boxShadow: 2 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            ⚡ Quick Actions
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <Button
              variant="contained"
              startIcon={<PersonAddIcon />}
              fullWidth
              onClick={() => navigate('/users', { state: { openCreateDialog: true } })}
              sx={{
                py: 1.5, minHeight: 48, borderRadius: 2,
                textTransform: 'none', fontWeight: 600, fontSize: '0.8rem',
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                '&:hover': { background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)' }
              }}
            >
              Add User
            </Button>
            <Button
              variant="outlined"
              startIcon={<HistoryIcon />}
              fullWidth
              onClick={() => navigate('/system', { state: { scrollToAuditLogs: true } })}
              sx={{
                py: 1.5, minHeight: 48, borderRadius: 2,
                textTransform: 'none', fontWeight: 600, fontSize: '0.8rem'
              }}
            >
              Audit Logs
            </Button>
            <Button
              variant="outlined"
              startIcon={<RestoreIcon />}
              fullWidth
              onClick={() => navigate('/system', { state: { openRestoreDialog: true } })}
              color="secondary"
              sx={{
                py: 1.5, minHeight: 48, borderRadius: 2,
                textTransform: 'none', fontWeight: 600, fontSize: '0.8rem'
              }}
            >
              Restore
            </Button>
            <Button
              variant="outlined"
              startIcon={<AlertsIcon />}
              fullWidth
              onClick={() => navigate('/system')}
              color="warning"
              sx={{
                py: 1.5, minHeight: 48, borderRadius: 2,
                textTransform: 'none', fontWeight: 600, fontSize: '0.8rem'
              }}
            >
              All Alerts
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* System Alerts List */}
      <Card sx={{ borderRadius: 3, mb: 2, boxShadow: 2 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <AlertsIcon sx={{ color: '#f59e0b', fontSize: 24 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
              System Alerts
            </Typography>
            <Chip
              label={`${unresolvedAlerts.length} active`}
              size="small"
              color={unresolvedAlerts.length > 0 ? 'warning' : 'success'}
              sx={{ fontWeight: 700 }}
            />
          </Box>

          {unresolvedAlerts.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {unresolvedAlerts.slice(0, 10).map((alert) => (
                <Card
                  key={alert.id}
                  variant="outlined"
                  sx={{
                    borderRadius: 2,
                    borderColor: alert.severity === 'critical' ? '#fca5a5'
                      : alert.severity === 'warning' ? '#fde68a' : '#bfdbfe',
                    bgcolor: alert.severity === 'critical' ? '#fef2f2'
                      : alert.severity === 'warning' ? '#fffbeb' : '#eff6ff'
                  }}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
                      <Chip
                        label={alert.severity}
                        size="small"
                        color={getSeverityColor(alert.severity)}
                        sx={{ fontWeight: 600, textTransform: 'capitalize', height: 22, fontSize: '0.65rem' }}
                      />
                      {alert.status === 'pending_user' && (
                        <Chip
                          label="Pending Confirm"
                          size="small"
                          color="warning"
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.6rem', fontWeight: 500 }}
                        />
                      )}
                      <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto', flexShrink: 0 }}>
                        {new Date(alert.created_at).toLocaleDateString()}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.4, my: 0.5 }}>
                      {alert.message}
                    </Typography>
                    {alert.status !== 'pending_user' && alert.status !== 'resolved' && (
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        onClick={() => handleMarkFixed(alert.id)}
                        sx={{
                          minHeight: 36, borderRadius: 2, mt: 0.5,
                          textTransform: 'none', fontWeight: 600, fontSize: '0.75rem'
                        }}
                      >
                        Mark as Fixed
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
              {unresolvedAlerts.length > 10 && (
                <Button
                  fullWidth
                  size="small"
                  onClick={() => navigate('/system')}
                  sx={{ textTransform: 'none', fontWeight: 600, minHeight: 40 }}
                >
                  View All {unresolvedAlerts.length} Alerts
                </Button>
              )}
            </Box>
          ) : (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <CheckCircle sx={{ fontSize: 48, color: '#22c55e', mb: 1 }} />
              <Typography variant="body1" fontWeight={600}>
                All Clear! 🎉
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                No unresolved alerts. Everything is running smoothly!
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Spin animation keyframe */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Box>
  );
};
