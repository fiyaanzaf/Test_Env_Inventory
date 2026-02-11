import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button,
  MenuItem, Chip, CircularProgress, Snackbar, Alert, Divider,
} from '@mui/material';
import {
  BugReport as BugIcon, Send as SendIcon,
  History as HistoryIcon, CheckCircle as CheckIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import client from '../api/client';

interface Ticket {
  id: number;
  severity: string;
  message: string;
  status: string;
  created_at: string;
}

const SEVERITIES = [
  { value: 'info', label: 'Info' },
  { value: 'medium', label: 'Medium' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];

const STATUS_COLORS: Record<string, 'error' | 'warning' | 'info' | 'success' | 'default'> = {
  active: 'error', pending_user: 'warning', resolved: 'success',
};

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('user_token')}` },
});

export const SupportPage: React.FC = () => {
  const [severity, setSeverity] = useState('medium');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });

  const showSnack = (msg: string, sev: 'success' | 'error' = 'success') => setSnack({ open: true, msg, sev });

  const fetchTickets = async () => {
    setLoadingHistory(true);
    try {
      const res = await client.get('/api/v1/system/alerts/my', getAuthHeaders());
      setMyTickets(res.data);
    } catch {
      showSnack('Failed to load tickets', 'error');
    }
    setLoadingHistory(false);
  };

  useEffect(() => { fetchTickets(); }, []);

  const handleSubmit = async () => {
    if (!message.trim()) { showSnack('Please enter a message', 'error'); return; }
    setSubmitting(true);
    try {
      await client.post('/api/v1/system/alerts/report', { severity, message }, getAuthHeaders());
      setSuccessMsg('Issue reported successfully');
      setMessage('');
      setSeverity('medium');
      fetchTickets();
    } catch (e: any) {
      showSnack(e?.response?.data?.detail || 'Failed to report', 'error');
    }
    setSubmitting(false);
  };

  const handleConfirmFix = async (id: number) => {
    if (!window.confirm('Confirm this issue has been fixed?')) return;
    try {
      await client.put(`/api/v1/system/alerts/${id}/confirm_fix`, {}, getAuthHeaders());
      showSnack('Fix confirmed');
      fetchTickets();
    } catch {
      showSnack('Failed to confirm fix', 'error');
    }
  };

  return (
    <Box sx={{ pb: 10 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <BugIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Support</Typography>
      </Box>

      {/* Report Issue */}
      <Card sx={{ borderRadius: 3, mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>Report an Issue</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField select size="small" label="Severity" fullWidth value={severity}
              onChange={e => setSeverity(e.target.value)}>
              {SEVERITIES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </TextField>
            <TextField label="Describe the issue" multiline rows={4} fullWidth size="small"
              value={message} onChange={e => setMessage(e.target.value)}
              placeholder="What went wrong? Be specific..."
            />
            <Button fullWidth variant="contained" startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
              onClick={handleSubmit} disabled={submitting} sx={{ borderRadius: 2 }}>
              {submitting ? 'Submitting…' : 'Submit Report'}
            </Button>
          </Box>
          {successMsg && (
            <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSuccessMsg('')}>{successMsg}</Alert>
          )}
        </CardContent>
      </Card>

      {/* My Tickets */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon color="action" />
          <Typography variant="subtitle1" fontWeight={700}>My Tickets</Typography>
        </Box>
        <Button size="small" startIcon={<RefreshIcon />} onClick={fetchTickets}>Refresh</Button>
      </Box>

      {loadingHistory ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : myTickets.length === 0 ? (
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
          No tickets found. Report an issue above.
        </Typography>
      ) : (
        myTickets.map(t => (
          <Card key={t.id} sx={{ mb: 1.5, borderRadius: 3, borderLeft: `4px solid ${t.status === 'resolved' ? '#10b981' : t.status === 'pending_user' ? '#f59e0b' : '#ef4444'}` }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Chip label={t.severity} size="small" color={STATUS_COLORS[t.severity] || 'default'} />
                <Chip label={t.status.replace('_', ' ')} size="small" variant="outlined"
                  color={STATUS_COLORS[t.status] || 'default'} />
              </Box>
              <Typography variant="body2" sx={{ my: 1 }}>{t.message}</Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  {dayjs(t.created_at).format('DD MMM YYYY HH:mm')}
                </Typography>
                {t.status === 'pending_user' && (
                  <Button size="small" variant="contained" color="success"
                    startIcon={<CheckIcon />} onClick={() => handleConfirmFix(t.id)}>
                    Confirm Fix
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        ))
      )}

      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack(s => ({ ...s, open: false }))}>
        <Alert severity={snack.sev} variant="filled" sx={{ width: '100%' }}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
};
