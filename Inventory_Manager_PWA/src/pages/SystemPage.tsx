import React, { useEffect, useState } from 'react';
import {
  Box, Typography, CircularProgress, Card, CardContent,
  Chip, Tabs, Tab, Button, IconButton, Snackbar, Alert,
  Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  ErrorOutline as ErrorIcon, CheckCircle as SuccessIcon,
  Backup as BackupIcon, History as LogIcon,
  NotificationsActive as AlertIcon, Refresh as RefreshIcon,
  RestorePage as RestoreIcon, Delete as DeleteIcon,
  CloudUpload as UploadIcon, Build as FixIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import {
  getSystemAlerts, triggerManualBackup, getBackups,
  restoreBackup, deleteBackup, requestAlertClosure, resolveAlert,
  type SystemAlert, type BackupFile,
} from '../services/systemService';
import { getAuditLogs, type AuditLogEntry } from '../services/analyticsService';

const SEVERITY_COLORS: Record<string, 'error' | 'warning' | 'info' | 'success' | 'default'> = {
  critical: 'error',
  warning: 'warning',
  medium: 'warning',
  info: 'info',
};

export const SystemPage: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({ open: false, msg: '', sev: 'success' });
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; text: string; action: () => void }>({
    open: false, title: '', text: '', action: () => {},
  });

  const showSnack = (msg: string, sev: 'success' | 'error' | 'info' = 'success') => setSnack({ open: true, msg, sev });

  const fetchAlerts = async () => { try { setAlerts(await getSystemAlerts()); } catch { showSnack('Failed to load alerts', 'error'); } };
  const fetchBackups = async () => { try { setBackups(await getBackups()); } catch { showSnack('Failed to load backups', 'error'); } };
  const fetchLogs = async () => { try { setAuditLogs(await getAuditLogs(200)); } catch { showSnack('Failed to load logs', 'error'); } };

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchAlerts(), fetchBackups(), fetchLogs()]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const res = await triggerManualBackup();
      showSnack(res.message || 'Backup created');
      fetchBackups();
    } catch { showSnack('Backup failed', 'error'); }
    setBackingUp(false);
  };

  const handleResolve = async (id: number) => {
    try { await resolveAlert(id); showSnack('Alert resolved'); fetchAlerts(); }
    catch { showSnack('Failed to resolve', 'error'); }
  };

  const handleMarkFixed = async (id: number) => {
    try { await requestAlertClosure(id); showSnack('Closure requested'); fetchAlerts(); }
    catch { showSnack('Failed to request closure', 'error'); }
  };

  const handleRestore = (filename: string) => {
    setConfirmDialog({
      open: true, title: 'Restore Backup',
      text: `Are you sure you want to restore "${filename}"? This will overwrite current data.`,
      action: async () => {
        try { await restoreBackup(filename); showSnack('Backup restored'); } catch { showSnack('Restore failed', 'error'); }
        setConfirmDialog(d => ({ ...d, open: false }));
      },
    });
  };

  const handleDelete = (filename: string) => {
    setConfirmDialog({
      open: true, title: 'Delete Backup',
      text: `Delete "${filename}"? This cannot be undone.`,
      action: async () => {
        try { await deleteBackup(filename); showSnack('Backup deleted'); fetchBackups(); } catch { showSnack('Delete failed', 'error'); }
        setConfirmDialog(d => ({ ...d, open: false }));
      },
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="h5" fontWeight={700}>System</Typography>
        <IconButton onClick={fetchAll}><RefreshIcon /></IconButton>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ mb: 2 }}>
        <Tab icon={<AlertIcon />} label="Alerts" iconPosition="start" sx={{ minHeight: 48, textTransform: 'none' }} />
        <Tab icon={<BackupIcon />} label="Backups" iconPosition="start" sx={{ minHeight: 48, textTransform: 'none' }} />
        <Tab icon={<LogIcon />} label="Logs" iconPosition="start" sx={{ minHeight: 48, textTransform: 'none' }} />
      </Tabs>

      {/* Alerts Tab */}
      {tab === 0 && (
        <Box>
          {alerts.length === 0 ? (
            <Card sx={{ borderRadius: 3, textAlign: 'center', py: 4 }}>
              <SuccessIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
              <Typography>No active alerts</Typography>
            </Card>
          ) : (
            alerts.map(a => (
              <Card key={a.id} sx={{ mb: 1.5, borderRadius: 3, borderLeft: `4px solid ${a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#3b82f6'}` }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Chip label={a.severity} size="small" color={SEVERITY_COLORS[a.severity] || 'default'} />
                    <Chip label={a.status} size="small" variant="outlined"
                      icon={a.is_resolved ? <SuccessIcon /> : <ErrorIcon />}
                      color={a.is_resolved ? 'success' : 'default'}
                    />
                  </Box>
                  <Typography variant="body2" sx={{ my: 1 }}>{a.message}</Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                      {dayjs(a.created_at).format('DD MMM YYYY HH:mm')}
                    </Typography>
                    {!a.is_resolved && (
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button size="small" startIcon={<FixIcon />} onClick={() => handleMarkFixed(a.id)}>
                          Mark Fixed
                        </Button>
                        <Button size="small" variant="contained" color="success" startIcon={<SuccessIcon />}
                          onClick={() => handleResolve(a.id)}>
                          Resolve
                        </Button>
                      </Box>
                    )}
                  </Box>
                </CardContent>
              </Card>
            ))
          )}
        </Box>
      )}

      {/* Backups Tab */}
      {tab === 1 && (
        <Box>
          <Button fullWidth variant="contained" startIcon={backingUp ? <CircularProgress size={16} color="inherit" /> : <UploadIcon />}
            onClick={handleBackup} disabled={backingUp} sx={{ mb: 2, borderRadius: 2 }}>
            {backingUp ? 'Creating Backup…' : 'Trigger Manual Backup'}
          </Button>
          {backups.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center">No backups found.</Typography>
          ) : (
            backups.map(b => (
              <Card key={b.filename} sx={{ mb: 1.5, borderRadius: 3 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="body2" fontWeight={600} noWrap>{b.filename}</Typography>
                  <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {dayjs(b.created_at).format('DD MMM YYYY HH:mm')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{b.size_mb.toFixed(1)} MB</Typography>
                    <Chip label={b.type} size="small" variant="outlined" />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
                    <Button size="small" startIcon={<RestoreIcon />} onClick={() => handleRestore(b.filename)}>Restore</Button>
                    <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => handleDelete(b.filename)}>Delete</Button>
                  </Box>
                </CardContent>
              </Card>
            ))
          )}
        </Box>
      )}

      {/* Audit Logs Tab */}
      {tab === 2 && (
        <Box>
          {auditLogs.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center">No audit logs.</Typography>
          ) : (
            auditLogs.map(log => (
              <Card key={log.id} sx={{ mb: 1, borderRadius: 2 }}>
                <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" fontWeight={600}>{log.action}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {log.username || `User #${log.user_id}`} · {log.target_table}{log.target_id ? ` #${log.target_id}` : ''}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', ml: 1 }}>
                      {dayjs(log.timestamp).format('DD/MM HH:mm')}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            ))
          )}
        </Box>
      )}

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog(d => ({ ...d, open: false }))}>
        <DialogTitle>{confirmDialog.title}</DialogTitle>
        <DialogContent><DialogContentText>{confirmDialog.text}</DialogContentText></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(d => ({ ...d, open: false }))}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmDialog.action}>Confirm</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack(s => ({ ...s, open: false }))}>
        <Alert severity={snack.sev} variant="filled" sx={{ width: '100%' }}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
};
