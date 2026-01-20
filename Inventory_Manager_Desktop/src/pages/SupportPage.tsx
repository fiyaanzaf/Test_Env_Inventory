import React, { useEffect, useState } from 'react';
import { 
  Box, Typography, Paper, TextField, Button, MenuItem, 
  Alert, Chip, CircularProgress, Badge, Tooltip, Snackbar 
} from '@mui/material';
import { DataGrid, type GridColDef, type GridRenderCellParams } from '@mui/x-data-grid';
import { 
  Send, CheckCircle, HourglassEmpty, ErrorOutline, 
  NotificationsActive as BellIcon // Notification Icon
} from '@mui/icons-material';
import client from '../api/client';

export const SupportPage: React.FC = () => {
  // Report Form State
  const [severity, setSeverity] = useState('medium');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // History List State
  const [myTickets, setMyTickets] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Notification State
  const [showPopup, setShowPopup] = useState(false);

  // Calculate pending fixes
  const pendingFixes = myTickets.filter(t => t.status === 'pending_user').length;

  // Load History
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
        const token = localStorage.getItem('user_token');
        const res = await client.get('/api/v1/system/alerts/my', {
            headers: { Authorization: `Bearer ${token}` }
        });
        setMyTickets(res.data);

        // Show popup if there are pending fixes
        const count = res.data.filter((t: any) => t.status === 'pending_user').length;
        if (count > 0) setShowPopup(true);
        
    } catch (err) {
        console.error("Failed to load history");
    } finally {
        setLoadingHistory(false);
    }
  };

  useEffect(() => { loadHistory(); }, []);

  // Submit Handler
  const handleSubmit = async () => {
    if(!message) return;
    setSubmitting(true);
    try {
        const token = localStorage.getItem('user_token');
        await client.post('/api/v1/system/alerts/report', { severity, message }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setSuccessMsg("Ticket created successfully.");
        setMessage('');
        loadHistory(); 
    } catch (err) {
        alert("Failed to submit ticket");
    } finally {
        setSubmitting(false);
    }
  };

  // Confirm Fix Handler
  const handleConfirmFix = async (id: number) => {
    if(!window.confirm("Confirm that this issue is resolved?")) return;
    try {
        const token = localStorage.getItem('user_token');
        await client.put(`/api/v1/system/alerts/${id}/confirm_fix`, {}, {
            headers: { Authorization: `Bearer ${token}` }
        });
        loadHistory();
    } catch(err) {
        alert("Action failed");
    }
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    { 
      field: 'created_at', 
      headerName: 'Date', 
      width: 180, 
      valueFormatter: (value: any) => value ? new Date(value).toLocaleString() : '' 
    },
    { field: 'message', headerName: 'Issue', flex: 1 },
    { 
        field: 'status', headerName: 'Status', width: 180,
        renderCell: (params: GridRenderCellParams) => {
            const s = params.value;
            // --- PERFECT EMERALD GREEN STATUS ---
            if(s === 'resolved') {
                return (
                    <Chip 
                        label="Resolved" 
                        size="small" 
                        icon={<CheckCircle />} 
                        sx={{ 
                            backgroundColor: '#dcfce7',        
                            color: '#166534',                  
                            border: '1px solid #86efac',       
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            fontSize: '0.70rem',
                            height: 24,
                            '& .MuiChip-icon': { color: '#166534', marginLeft: '4px' }
                        }} 
                    />
                );
            }
            if(s === 'pending_user') return <Chip label="Action Required" color="warning" size="small" />;
            return <Chip label="Open / In Progress" color="info" size="small" icon={<HourglassEmpty/>} />;
        }
    },
    {
        field: 'action', headerName: 'Action', width: 180,
        renderCell: (params: GridRenderCellParams) => {
            if (params.row.status === 'pending_user') {
                return (
                    <Button 
                        variant="contained" color="success" size="small"
                        onClick={() => handleConfirmFix(params.row.id)}
                    >
                        Confirm Fix
                    </Button>
                )
            }
            return null;
        }
    }
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Typography variant="h4" fontWeight="bold">🛠️ Support Center</Typography>

        {/* 1. Report Form (Retained Layout) */}
        <Paper sx={{ p: 3, borderRadius: 3 }}>
            
            {/* --- HEADER WITH NOTIFICATION BADGE --- */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Typography variant="h6">Report a New Issue</Typography>
                
                {/* NOTIFICATION BADGE ADDED HERE */}
                {pendingFixes > 0 && (
                    <Tooltip title={`${pendingFixes} fix(es) waiting for confirmation`}>
                        <Badge 
                            badgeContent={pendingFixes} 
                            color="error"
                            sx={{ 
                                '& .MuiBadge-badge': { 
                                    animation: 'pulse 1.5s infinite',
                                    border: '2px solid white'
                                } 
                            }}
                        >
                            <BellIcon 
                                color="warning" 
                                sx={{ 
                                    fontSize: 28,
                                    // Gentle swing animation to catch eye
                                    animation: 'swing 3s ease infinite',
                                    '@keyframes swing': {
                                        '0%, 100%': { transform: 'rotate(0deg)' },
                                        '20%': { transform: 'rotate(15deg)' },
                                        '40%': { transform: 'rotate(-10deg)' },
                                        '60%': { transform: 'rotate(5deg)' },
                                        '80%': { transform: 'rotate(-5deg)' }
                                    },
                                    '@keyframes pulse': {
                                        '0%': { transform: 'scale(1)', opacity: 1 },
                                        '50%': { transform: 'scale(1.2)', opacity: 0.8 },
                                        '100%': { transform: 'scale(1)', opacity: 1 },
                                    }
                                }} 
                            />
                        </Badge>
                    </Tooltip>
                )}
            </Box>

            {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}
            
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                <TextField 
                    select label="Type" size="small" sx={{ width: 200 }}
                    value={severity} onChange={(e) => setSeverity(e.target.value)}
                >
                    <MenuItem value="low">Suggestion</MenuItem>
                    <MenuItem value="medium">Bug / Glitch</MenuItem>
                    <MenuItem value="critical">Critical Failure</MenuItem>
                </TextField>
                <TextField 
                    fullWidth label="Describe the issue..." size="small"
                    value={message} onChange={(e) => setMessage(e.target.value)}
                />
                <Button 
                    variant="contained" startIcon={submitting ? <CircularProgress size={20} color="inherit"/> : <Send/>}
                    onClick={handleSubmit} disabled={submitting || !message}
                >
                    Submit
                </Button>
            </Box>
        </Paper>

        {/* 2. Notification Area (if pending confirmation) */}
        {pendingFixes > 0 && (
            <Alert severity="warning" variant="filled" icon={<ErrorOutline fontSize="inherit" />}>
                <strong>Action Required:</strong> IT Admin has marked {pendingFixes} of your tickets as resolved. Please review and confirm the fix in the table below.
            </Alert>
        )}

        {/* 3. History Table */}
        <Paper sx={{ p: 3, borderRadius: 3, height: 500 }}>
            <Typography variant="h6" gutterBottom>My Ticket History</Typography>
            <DataGrid 
                rows={myTickets} columns={columns} 
                initialState={{ pagination: { paginationModel: { pageSize: 5 }}}}
                disableRowSelectionOnClick
            />
        </Paper>

        {/* 4. SLIDE-IN POPUP (Snackbar) */}
        <Snackbar
            open={showPopup}
            autoHideDuration={6000}
            onClose={() => setShowPopup(false)}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
            <Alert 
                onClose={() => setShowPopup(false)} 
                severity="success" 
                variant="filled"
                sx={{ width: '100%', boxShadow: 4, fontWeight: 'bold' }}
                icon={<BellIcon fontSize="inherit" />}
            >
                You have {pendingFixes} fixed issue(s) to confirm!
            </Alert>
        </Snackbar>

    </Box>
  );
};