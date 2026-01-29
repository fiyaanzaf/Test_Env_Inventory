import React, { useEffect, useState, useRef } from 'react';
import {
  Box, Typography, Paper, Button, Alert, Chip, CircularProgress,
  Card, CardContent, Tabs, Tab, Tooltip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Dialog,
  DialogTitle, DialogContent, DialogContentText, DialogActions,
  IconButton, TextField, Select, MenuItem, FormControl, InputLabel, Pagination
} from '@mui/material';
import { DataGrid, type GridColDef, type GridRenderCellParams } from '@mui/x-data-grid';
import {
  Backup as BackupIcon,
  Restore as RestoreIcon,
  Storage as StorageIcon,
  ErrorOutline as ErrorIcon,
  CheckCircle as SuccessIcon,
  DoneAll as DoneIcon,
  Build as FixIcon,
  HourglassEmpty as WaitingIcon,
  Person as PersonIcon,
  AdminPanelSettings as AdminIcon,
  Check as ResolveIcon,
  Dns as SystemIcon,
  Warning as WarningIcon,
  Delete as DeleteIcon,
  EventRepeat as AutoIcon,
  TouchApp as ManualIcon,
  History as HistoryIcon,
  Search as SearchIcon,
  FilterList as FilterIcon
} from '@mui/icons-material';
import {
  triggerManualBackup,
  getBackups,
  restoreBackup,
  deleteBackup,
  type SystemAlert,
  type BackupFile
} from '../services/systemService';
import client from '../api/client';
import { useLocation } from 'react-router-dom';

// --- STYLING CONSTANTS ---

const styles = {
  pageContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    pb: 4
  },
  headerTitle: {
    fontWeight: 800,
    color: '#1e293b',
    mb: 1,
    letterSpacing: '-0.5px'
  },
  gradientCard: {
    background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
    color: 'white',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 10px 30px -10px rgba(99, 102, 241, 0.5)',
    borderRadius: 4,
  },
  glassIconBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: '16px',
    p: 1.5,
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.1)'
  },
  whitePillButton: {
    bgcolor: 'white',
    color: '#6366f1',
    '&:hover': {
      bgcolor: '#f8fafc',
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
    },
    transition: 'all 0.2s ease',
    fontWeight: 700,
    px: 4,
    py: 1.5,
    borderRadius: 50,
    textTransform: 'none'
  },
  tableContainer: {
    border: 'none',
    borderRadius: 4,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
    overflow: 'hidden',
    bgcolor: 'white'
  },
  tabs: {
    px: 2,
    borderBottom: '1px solid #f1f5f9',
    '& .MuiTab-root': {
      textTransform: 'none',
      fontWeight: 600,
      fontSize: '0.95rem',
      minHeight: 64,
      color: '#94a3b8',
      transition: 'color 0.3s'
    }
  },
  dataGrid: {
    border: 'none',
    fontFamily: 'inherit',
    '& .MuiDataGrid-columnHeaders': {
      backgroundColor: '#f8fafc',
      color: '#475569',
      fontWeight: 700,
      textTransform: 'uppercase',
      fontSize: '0.75rem',
      letterSpacing: '0.5px',
      borderBottom: '1px solid #e2e8f0'
    },
    '& .MuiDataGrid-cell': {
      borderColor: '#f1f5f9',
      py: 1.5,
    },
    '& .MuiDataGrid-row:hover': {
      backgroundColor: '#f8fafc',
    },
    '& .MuiDataGrid-footerContainer': {
      borderTop: '1px solid #e2e8f0',
    },
  },
  confirmFixBtn: {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.85rem',
    borderRadius: '8px',
    padding: '6px 16px',
    color: '#ffffff',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3), 0 2px 4px -1px rgba(16, 185, 129, 0.1)',
    border: '1px solid #059669',
    transition: 'all 0.2s ease-in-out',
    '&:hover': {
      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
      transform: 'translateY(-1px)',
      boxShadow: '0 6px 10px -1px rgba(16, 185, 129, 0.4)',
    }
  },
  actionBtn: {
    textTransform: 'none',
    borderRadius: 2,
    fontWeight: 600,
    boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
    '&:hover': {
      transform: 'translateY(-1px)',
      boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
    },
    transition: 'all 0.2s'
  }
};

const getSeverityChipProps = (severity: string) => {
  const isCritical = severity === 'critical';
  const isWarning = severity === 'warning';

  return {
    sx: {
      fontWeight: 700,
      textTransform: 'uppercase',
      fontSize: '0.7rem',
      borderRadius: '6px',
      backgroundColor: isCritical ? '#fee2e2' : isWarning ? '#fef3c7' : '#e0f2fe',
      color: isCritical ? '#991b1b' : isWarning ? '#92400e' : '#075985',
      border: '1px solid',
      borderColor: isCritical ? '#fecaca' : isWarning ? '#fde68a' : '#bae6fd'
    }
  };
};

// --- TYPES ---

interface ExtendedAlert extends SystemAlert {
  username?: string;
  user_id?: number;
}

// --- COMPONENT ---

export const SystemPage: React.FC = () => {
  const location = useLocation();
  const auditLogsRef = useRef<HTMLDivElement>(null);

  // Alerts State
  const [alerts, setAlerts] = useState<ExtendedAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [tabValue, setTabValue] = useState(0);

  // Backup State
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);

  // NEW: Backup Tab State (0 = Manual, 1 = Auto)
  const [backupTab, setBackupTab] = useState(0);

  // NEW: Type Filter State
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // AUDIT LOGS STATE
  interface AuditLog {
    id: number;
    timestamp: string;
    username: string;
    action: string;
    target_table: string | null;
    target_id: number | null;
    ip_address: string | null;
    details: Record<string, unknown>;
  }
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPages, setAuditPages] = useState(0);
  const [auditFilters, setAuditFilters] = useState({
    startDate: '',
    endDate: '',
    username: '',
    action: '',
    search: ''
  });
  const [actionOptions, setActionOptions] = useState<string[]>([]);

  // Helper to get tab color based on current selection (Alerts)
  const getTabColor = () => {
    if (tabValue === 0) return '#ef4444';
    if (tabValue === 1) return '#f59e0b';
    return '#10b981';
  };

  // Helper to determine alert type from message and user_id
  const getAlertType = (message: string, userId?: number): string => {
    if (userId) return 'user_report';
    if (message.includes('SHELF RESTOCK NEEDED')) return 'shelf_restock';
    if (message.includes('LOW STOCK')) return 'low_stock';
    return 'other';
  };



  const getAlertTypeColor = (type: string) => {
    if (type === 'shelf_restock') return { bg: '#fef3c7', color: '#92400e', border: '#fde68a' };
    if (type === 'low_stock') return { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' };
    if (type === 'user_report') return { bg: '#e9d5ff', color: '#7c3aed', border: '#c4b5fd' };
    return { bg: '#e0f2fe', color: '#075985', border: '#bae6fd' };
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('user_token');
      const res = await client.get('/api/v1/system/alerts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAlerts(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBackups = async () => {
    setLoadingBackups(true);
    try {
      const data = await getBackups();
      setBackups(data);
    } catch (err) {
      console.error("Failed to load backups", err);
    } finally {
      setLoadingBackups(false);
    }
  };

  // AUDIT LOGS: Fetch paginated logs with filters
  const fetchAuditLogs = async (page = 1) => {
    setAuditLoading(true);
    try {
      const token = localStorage.getItem('user_token');
      const params: Record<string, string | number> = { page, limit: 50 };
      if (auditFilters.startDate) params.start_date = auditFilters.startDate;
      if (auditFilters.endDate) params.end_date = auditFilters.endDate;
      if (auditFilters.username) params.username = auditFilters.username;
      if (auditFilters.action) params.action = auditFilters.action;
      if (auditFilters.search) params.search = auditFilters.search;

      const res = await client.get('/api/v1/system/audit-logs', {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      setAuditLogs(res.data.data);
      setAuditTotal(res.data.total);
      setAuditPages(res.data.pages);
      setAuditPage(page);
    } catch (err) {
      console.error("Failed to load audit logs", err);
    } finally {
      setAuditLoading(false);
    }
  };

  // AUDIT LOGS: Fetch action options for dropdown
  const fetchActionOptions = async () => {
    try {
      const token = localStorage.getItem('user_token');
      const res = await client.get('/api/v1/system/audit-logs/actions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setActionOptions(res.data.actions);
    } catch (err) {
      console.error("Failed to load action options", err);
    }
  };

  useEffect(() => {
    loadData();
    fetchBackups();
    fetchActionOptions();
    fetchAuditLogs(1);
  }, []);

  // Scroll to Audit Logs if navigated with that state
  useEffect(() => {
    if (location.state?.scrollToAuditLogs && auditLogsRef.current) {
      setTimeout(() => {
        auditLogsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [location.state]);

  // --- HANDLERS ---

  const handleBackup = async () => {
    setBackupLoading(true);
    setMessage(null);
    try {
      const res = await triggerManualBackup();
      setMessage({ type: 'success', text: `${res.message} (${res.file})` });
      loadData();
      fetchBackups(); // Refresh backup list
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Backup failed.';
      setMessage({ type: 'error', text: errorMsg });
      loadData();
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreClick = (filename: string) => {
    setSelectedBackup(filename);
    setConfirmOpen(true);
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!window.confirm(`Are you sure you want to PERMANENTLY delete ${filename}?`)) {
      return;
    }

    try {
      await deleteBackup(filename);
      setMessage({ type: 'success', text: `Backup ${filename} deleted successfully.` });
      fetchBackups(); // Refresh the list immediately
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Failed to delete backup.';
      setMessage({ type: 'error', text: errorMsg });
    }
  };

  const executeRestore = async () => {
    if (!selectedBackup) return;
    setConfirmOpen(false);
    setBackupLoading(true);

    try {
      await restoreBackup(selectedBackup);
      setMessage({ type: 'success', text: `System successfully restored from ${selectedBackup}.` });
      loadData();
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Critical Failure: Could not restore database.';
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setBackupLoading(false);
      setSelectedBackup(null);
    }
  };

  const handleMarkFixed = async (id: number) => {
    if (!window.confirm("Mark this issue as fixed? This will notify the user to confirm.")) return;
    try {
      const token = localStorage.getItem('user_token');
      await client.put(`/api/v1/system/alerts/${id}/request_closure`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'pending_user' } : a));
      setMessage({ type: 'success', text: 'Fix deployed. Waiting for user confirmation.' });
    } catch (err) {
      setMessage({ type: 'error', text: "Failed to update ticket status." });
    }
  };

  const handleSystemResolve = async (id: number) => {
    try {
      const token = localStorage.getItem('user_token');
      await client.put(`/api/v1/system/alerts/${id}/confirm_fix`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'resolved', is_resolved: true } : a));
      setMessage({ type: 'success', text: 'System alert resolved.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: "Failed to resolve ticket." });
    }
  };

  // --- FILTERS ---

  const filteredAlerts = alerts.filter(a => {
    // Status tab filter
    let matchesTab = false;
    if (tabValue === 0) matchesTab = a.status === 'active' || !a.status;
    else if (tabValue === 1) matchesTab = a.status === 'pending_user';
    else if (tabValue === 2) matchesTab = a.status === 'resolved' || a.is_resolved;

    if (!matchesTab) return false;

    // Type filter
    if (typeFilter !== 'all') {
      const alertType = getAlertType(a.message, a.user_id);
      if (alertType !== typeFilter) return false;
    }

    return true;
  });

  // Count alerts by type (for the current tab)
  const typeCounts = alerts.reduce((acc, a) => {
    // Only count for current tab
    let matchesTab = false;
    if (tabValue === 0) matchesTab = a.status === 'active' || !a.status;
    else if (tabValue === 1) matchesTab = a.status === 'pending_user';
    else if (tabValue === 2) matchesTab = a.status === 'resolved' || a.is_resolved;

    if (matchesTab) {
      const type = getAlertType(a.message, a.user_id);
      acc[type] = (acc[type] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  // NEW: Filter backups based on the selected tab (Manual vs Auto)
  const filteredBackups = backups.filter(b => {
    if (backupTab === 0) return b.type === 'manual';
    if (backupTab === 1) return b.type === 'auto';
    return true;
  });

  // --- COLUMNS DEF ---

  const columns: GridColDef[] = [
    {
      field: 'severity', headerName: 'Severity', width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Chip
            label={params.value} size="small"
            icon={params.value === 'critical' ? <ErrorIcon /> : undefined}
            {...getSeverityChipProps(params.value)}
          />
        </Box>
      )
    },
    {
      field: 'type', headerName: 'Type', width: 130,
      valueGetter: (_value: any, row: any) => getAlertType(row.message, row.user_id),
      renderCell: (params: GridRenderCellParams) => {
        const colors = getAlertTypeColor(params.value);
        const labels: Record<string, string> = {
          shelf_restock: 'Shelf Restock',
          low_stock: 'Low Stock',
          user_report: 'User Report',
          other: 'Other'
        };
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Chip
              label={labels[params.value] || 'Other'}
              size="small"
              sx={{
                fontWeight: 600,
                fontSize: '0.7rem',
                bgcolor: colors.bg,
                color: colors.color,
                border: `1px solid ${colors.border}`
              }}
            />
          </Box>
        );
      }
    },
    {
      field: 'username', headerName: 'Reported By', width: 180,
      renderCell: (params: GridRenderCellParams) => {
        const isSystem = !params.row.user_id;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, height: '100%', color: isSystem ? 'text.disabled' : 'text.primary' }}>
            <Box sx={{ bgcolor: isSystem ? '#f1f5f9' : '#e0e7ff', p: 0.5, borderRadius: '50%', display: 'flex' }}>
              {isSystem ? <SystemIcon fontSize="small" /> : <PersonIcon fontSize="small" sx={{ color: '#4f46e5' }} />}
            </Box>
            <Typography variant="body2" fontWeight={isSystem ? 500 : 600}>
              {params.value || 'System Log'}
            </Typography>
          </Box>
        )
      }
    },
    {
      field: 'message', headerName: 'Issue Description', flex: 1,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', py: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.5, color: '#334155', whiteSpace: 'normal' }}>
            {params.value}
          </Typography>
        </Box>
      )
    },
    {
      field: 'created_at', headerName: 'Timestamp', width: 220,
      valueFormatter: (value: any) => value ? new Date(value).toLocaleString() : ''
    },
    {
      field: 'actions', headerName: 'Actions', width: 220,
      renderCell: (params: GridRenderCellParams) => {
        if (tabValue === 0) {
          const isUserReport = !!params.row.user_id;
          if (isUserReport) {
            return (
              <Tooltip title="Deploy fix and ask user to confirm">
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<FixIcon />}
                  onClick={() => handleMarkFixed(params.row.id)}
                  sx={styles.confirmFixBtn}
                >
                  Confirm Fix
                </Button>
              </Tooltip>
            );
          } else {
            return (
              <Tooltip title="System Alert: Close immediately">
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<ResolveIcon />}
                  onClick={() => handleSystemResolve(params.row.id)}
                  sx={styles.confirmFixBtn}
                >
                  Resolve
                </Button>
              </Tooltip>
            );
          }
        }
        if (tabValue === 1) {
          const isUserReport = !!params.row.user_id;
          if (isUserReport) {
            return (
              <Chip
                label="Waiting for User"
                color="warning"
                variant="outlined"
                size="small"
                icon={<WaitingIcon />}
                sx={{ fontWeight: 600, borderColor: '#f59e0b', color: '#b45309' }}
              />
            );
          }
          return (
            <Button
              variant="outlined" color="warning" size="small" startIcon={<AdminIcon />}
              onClick={() => handleSystemResolve(params.row.id)}
              sx={styles.actionBtn}
            >
              Force Resolve
            </Button>
          );
        }
        return (
          <Chip
            label="Resolved"
            size="small"
            icon={<SuccessIcon fontSize="small" />}
            sx={{
              fontWeight: 700,
              bgcolor: '#ecfdf5',
              color: '#059669',
              border: '1px solid #6ee7b7',
              fontSize: '0.75rem',
              height: 28,
              boxShadow: '0 2px 4px rgba(16, 185, 129, 0.1)',
              '& .MuiChip-icon': { color: '#059669', marginLeft: '4px' }
            }}
          />
        );
      }
    }
  ];

  return (
    <Box sx={styles.pageContainer}>
      {/* Header */}
      <Box>
        <Typography variant="h4" sx={styles.headerTitle}>
          ⚙️ System Health
        </Typography>
        <Typography variant="body1" sx={{ color: '#64748b', maxWidth: 700 }}>
          Manage database backups and monitor user-reported issues.
        </Typography>
      </Box>

      {/* Manual Backup Creation Card */}
      <Card sx={styles.gradientCard}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
                <Box sx={styles.glassIconBox}>
                  <StorageIcon fontSize="large" sx={{ color: 'white' }} />
                </Box>
                <Typography variant="h5" fontWeight="800" sx={{ textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                  Database Backup
                </Typography>
              </Box>
              <Typography variant="body1" sx={{ opacity: 0.9, maxWidth: 600, mt: 1, lineHeight: 1.6 }}>
                Create a manual snapshot of the entire database immediately.
                <br />
                <i>Note: Automatic backups run daily at 12:00 PM.</i>
              </Typography>
            </Box>
            <Button
              variant="contained" size="large"
              startIcon={backupLoading ? <CircularProgress size={20} color="inherit" /> : <BackupIcon />}
              onClick={handleBackup} disabled={backupLoading}
              sx={styles.whitePillButton}
            >
              {backupLoading ? 'Processing...' : 'Backup Now'}
            </Button>
          </Box>
          <Box sx={{
            position: 'absolute', width: 300, height: 300, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 70%)',
            right: -50, bottom: -150
          }} />
        </CardContent>
      </Card>

      {/* AVAILABLE RECOVERY POINTS (Split Tab View) */}
      <Paper sx={{ p: 0, borderRadius: 2, overflow: 'hidden' }}>

        {/* Title Area */}
        <Box sx={{ p: 3, pb: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#334155' }}>
            Available Recovery Points
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select a snapshot to restore. Automatic backups are retained for 7 days.
            <br />
            <Box component="span" sx={{ color: 'error.main', fontWeight: 'bold' }}>
              WARNING: Restoring will overwrite current data.
            </Box>
          </Typography>
        </Box>

        {/* Backup Type Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
          <Tabs
            value={backupTab}
            onChange={(_, v) => setBackupTab(v)}
            sx={{ minHeight: 48 }}
          >
            <Tab icon={<ManualIcon fontSize="small" />} iconPosition="start" label="Manual Backups" />
            <Tab icon={<AutoIcon fontSize="small" />} iconPosition="start" label="Automatic (Daily)" />
          </Tabs>
        </Box>

        <TableContainer sx={{ maxHeight: 300 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 700 }}>Filename</TableCell>
                <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 700 }}>Type</TableCell>
                <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 700 }}>Date Created</TableCell>
                <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 700 }}>Size</TableCell>
                <TableCell align="right" sx={{ bgcolor: '#f8fafc', fontWeight: 700 }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loadingBackups ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3 }}><CircularProgress size={24} /></TableCell>
                </TableRow>
              ) : filteredBackups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    {backupTab === 0 ? "No manual backups found." : "No automatic backups generated yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredBackups.map((backup) => (
                  <TableRow key={backup.filename} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{backup.filename}</TableCell>
                    <TableCell>
                      <Chip
                        label={backup.type}
                        size="small"
                        color={backup.type === 'auto' ? "info" : "default"}
                        variant="outlined"
                        sx={{ textTransform: 'capitalize', height: 24, fontSize: '0.75rem' }}
                      />
                    </TableCell>
                    <TableCell>{backup.created_at}</TableCell>
                    <TableCell>{backup.size_mb} MB</TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Button
                          color="error" size="small" variant="outlined" startIcon={<RestoreIcon />}
                          onClick={() => handleRestoreClick(backup.filename)}
                          disabled={backupLoading}
                          sx={{ textTransform: 'none', borderRadius: 2 }}
                        >
                          Restore
                        </Button>
                        <Tooltip title="Permanently Delete">
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteBackup(backup.filename)}
                            disabled={backupLoading}
                            sx={{
                              color: '#94a3b8',
                              border: '1px solid #e2e8f0',
                              borderRadius: 2,
                              '&:hover': {
                                color: '#ef4444',
                                bgcolor: '#fee2e2',
                                borderColor: '#fecaca'
                              }
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {message && (
        <Alert severity={message.type} onClose={() => setMessage(null)} sx={{ borderRadius: 2, boxShadow: 1 }}>
          {message.text}
        </Alert>
      )}

      {/* Alerts Table Section */}
      <Paper sx={styles.tableContainer}>
        <Box sx={{ borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
          <Tabs
            value={tabValue} onChange={(_, v) => setTabValue(v)}
            sx={{
              ...styles.tabs,
              '& .Mui-selected': { color: getTabColor() },
              '& .MuiTabs-indicator': { backgroundColor: getTabColor(), height: 3 }
            }}
          >
            <Tab
              label={`Active Issues (${alerts.filter(a => a.status === 'active' || (!a.status && !a.is_resolved)).length})`}
              icon={<ErrorIcon sx={{ color: tabValue === 0 ? '#ef4444' : 'inherit' }} />} iconPosition="start"
            />
            <Tab
              label={`Pending Confirmation (${alerts.filter(a => a.status === 'pending_user').length})`}
              icon={<WaitingIcon sx={{ color: tabValue === 1 ? '#f59e0b' : 'inherit' }} />} iconPosition="start"
            />
            <Tab
              label="Resolved Logs"
              icon={<DoneIcon sx={{ color: tabValue === 2 ? '#10b981' : 'inherit' }} />} iconPosition="start"
            />
          </Tabs>
        </Box>

        {/* Type Filter Chips */}
        <Box sx={{ px: 2, py: 1.5, display: 'flex', gap: 1, alignItems: 'center', borderBottom: '1px solid #f1f5f9', bgcolor: '#fafbfc' }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: '#64748b', mr: 1 }}>
            Filter by Type:
          </Typography>
          {[
            { key: 'all', label: 'All' },
            { key: 'user_report', label: 'User Report' },
            { key: 'other', label: 'Other' }
          ].map(({ key, label }) => {
            const colors = getAlertTypeColor(key);
            const count = typeCounts[key] || 0;
            const isActive = typeFilter === key;

            return (
              <Chip
                key={key}
                label={`${label} (${count})`}
                size="small"
                onClick={() => setTypeFilter(key)}
                sx={{
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  bgcolor: isActive ? colors.bg : 'white',
                  color: isActive ? colors.color : '#64748b',
                  border: '1px solid',
                  borderColor: isActive ? colors.border : '#e2e8f0',
                  '&:hover': {
                    bgcolor: colors.bg,
                    borderColor: colors.border
                  }
                }}
              />
            );
          })}
        </Box>

        {loading ? (
          <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
        ) : (
          <Box sx={{ width: '100%', height: 500 }}>
            {filteredAlerts.length === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.6 }}>
                <SuccessIcon sx={{ fontSize: 60, color: '#10b981', mb: 2 }} />
                <Typography variant="h6" color="text.secondary">
                  {tabValue === 0 ? "No active issues. Systems normal." :
                    tabValue === 1 ? "No tickets pending confirmation." : "No resolved logs found."}
                </Typography>
              </Box>
            ) : (
              <DataGrid
                rows={filteredAlerts} columns={columns} getRowHeight={() => 'auto'}
                initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                pageSizeOptions={[10, 20]} disableRowSelectionOnClick
                sx={styles.dataGrid}
              />
            )}
          </Box>
        )}
      </Paper>

      {/* AUDIT LOGS SECTION */}
      <Paper ref={auditLogsRef} sx={{ p: 0, borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none', overflow: 'hidden' }}>
        <Box sx={{ p: 3, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 2 }}>
          <HistoryIcon sx={{ color: '#6366f1', fontSize: 28 }} />
          <Box>
            <Typography variant="h6" fontWeight={700} color="#1e293b">
              Audit Logs
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Complete activity trail for security investigations ({auditTotal.toLocaleString()} total records)
            </Typography>
          </Box>
        </Box>

        {/* Filters Row */}
        <Box sx={{ p: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            label="Start Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={auditFilters.startDate}
            onChange={(e) => setAuditFilters({ ...auditFilters, startDate: e.target.value })}
            sx={{ width: 150 }}
          />
          <TextField
            label="End Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={auditFilters.endDate}
            onChange={(e) => setAuditFilters({ ...auditFilters, endDate: e.target.value })}
            sx={{ width: 150 }}
          />
          <TextField
            label="Username"
            size="small"
            placeholder="Filter by user..."
            value={auditFilters.username}
            onChange={(e) => setAuditFilters({ ...auditFilters, username: e.target.value })}
            sx={{ width: 150 }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Action Type</InputLabel>
            <Select
              value={auditFilters.action}
              label="Action Type"
              onChange={(e) => setAuditFilters({ ...auditFilters, action: e.target.value })}
            >
              <MenuItem value="">All Actions</MenuItem>
              {actionOptions.map(action => (
                <MenuItem key={action} value={action}>{action}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Search"
            size="small"
            placeholder="Search details..."
            value={auditFilters.search}
            onChange={(e) => setAuditFilters({ ...auditFilters, search: e.target.value })}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 1, fontSize: 20 }} />
            }}
            sx={{ width: 200 }}
          />
          <Button
            variant="contained"
            onClick={() => fetchAuditLogs(1)}
            startIcon={<FilterIcon />}
            sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
          >
            Apply
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              setAuditFilters({ startDate: '', endDate: '', username: '', action: '', search: '' });
              fetchAuditLogs(1);
            }}
          >
            Clear
          </Button>
        </Box>

        {/* Audit Logs Table */}
        {auditLoading ? (
          <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
        ) : (
          <TableContainer sx={{ maxHeight: 500 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 700, width: 180 }}>Timestamp</TableCell>
                  <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 700, width: 120 }}>User</TableCell>
                  <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 700, width: 150 }}>Action</TableCell>
                  <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 700, width: 120 }}>Target Table</TableCell>
                  <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 700, width: 80 }}>Target ID</TableCell>
                  <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 700, width: 120 }}>IP Address</TableCell>
                  <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 700 }}>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No audit logs found matching filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  auditLogs.map((log) => (
                    <TableRow key={log.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {log.timestamp}
                      </TableCell>
                      <TableCell>
                        <Chip label={log.username} size="small" sx={{ fontWeight: 600 }} />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={log.action}
                          size="small"
                          sx={{
                            bgcolor: log.action.includes('DELETE') || log.action.includes('WRITE_OFF') ? '#fee2e2' : '#e0f2fe',
                            color: log.action.includes('DELETE') || log.action.includes('WRITE_OFF') ? '#991b1b' : '#0369a1',
                            fontWeight: 600,
                            fontSize: '0.7rem'
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: '#64748b' }}>{log.target_table || '-'}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{log.target_id || '-'}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.ip_address || '-'}</TableCell>
                      <TableCell sx={{ maxWidth: 300 }}>
                        <Tooltip title={JSON.stringify(log.details, null, 2)} arrow placement="left">
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.75rem',
                              color: '#64748b',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 300,
                              cursor: 'help'
                            }}
                          >
                            {JSON.stringify(log.details).substring(0, 80)}...
                          </Typography>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Pagination */}
        {auditPages > 1 && (
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', borderTop: '1px solid #f1f5f9' }}>
            <Pagination
              count={auditPages}
              page={auditPage}
              onChange={(_, page) => fetchAuditLogs(page)}
              color="primary"
              showFirstButton
              showLastButton
            />
          </Box>
        )}
      </Paper>

      {/* RESTORE CONFIRMATION DIALOG */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#d32f2f' }}>
          <WarningIcon /> Confirm System Restore
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to restore the database from <b>{selectedBackup}</b>?
            <br /><br />
            1. Current data will be <b>overwritten</b>.
            <br />
            2. The system might be unavailable for a few seconds.
            <br />
            3. This action <b>cannot be undone</b>.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setConfirmOpen(false)} variant="outlined" color="inherit">Cancel</Button>
          <Button
            onClick={executeRestore}
            color="error"
            variant="contained"
            autoFocus
          >
            Yes, Restore Database
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
