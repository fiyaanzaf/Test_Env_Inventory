import React, { useState } from 'react';
import {
    Box, Typography, Button, CircularProgress, Paper, LinearProgress
} from '@mui/material';
import {
    WifiOff as WifiOffIcon,
    Refresh as ReconnectIcon,
    Login as LoginIcon,
} from '@mui/icons-material';

interface Props {
    secondsLeft: number;
    onReconnect: () => Promise<boolean>;
    onLogout: () => void;
}

export const ConnectionLostOverlay: React.FC<Props> = ({ secondsLeft, onReconnect, onLogout }) => {
    const [trying, setTrying] = useState(false);
    const [lastResult, setLastResult] = useState<string | null>(null);

    const totalSeconds = 5 * 60;
    const progress = (secondsLeft / totalSeconds) * 100;
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;

    const handleReconnect = async () => {
        setTrying(true);
        setLastResult(null);
        const ok = await onReconnect();
        setTrying(false);
        if (!ok) {
            setLastResult('Still cannot reach backend. Check your network.');
        }
    };

    return (
        <Box
            sx={{
                position: 'fixed', inset: 0, zIndex: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: 'rgba(15, 23, 42, 0.92)',
                backdropFilter: 'blur(8px)',
            }}
        >
            <Paper
                elevation={6}
                sx={{
                    maxWidth: 360, width: '90%', p: 3, borderRadius: 4,
                    textAlign: 'center', bgcolor: '#fff',
                }}
            >
                {/* Icon */}
                <Box sx={{
                    width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
                    border: '2px solid #fca5a5',
                }}>
                    <WifiOffIcon sx={{ fontSize: 32, color: '#dc2626' }} />
                </Box>

                <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5, color: '#0f172a' }}>
                    Connection Lost
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, fontSize: '0.8rem' }}>
                    Cannot reach the backend. Check your network and try reconnecting.
                </Typography>

                {/* Countdown bar */}
                <Box sx={{ mb: 2 }}>
                    <LinearProgress
                        variant="determinate"
                        value={progress}
                        sx={{
                            height: 5, borderRadius: 3,
                            bgcolor: '#f1f5f9',
                            '& .MuiLinearProgress-bar': {
                                borderRadius: 3,
                                background: progress > 30
                                    ? 'linear-gradient(90deg, #6366f1, #4f46e5)'
                                    : 'linear-gradient(90deg, #f59e0b, #dc2626)',
                            },
                        }}
                    />
                    <Typography variant="caption" sx={{ mt: 0.5, display: 'block', color: '#64748b', fontWeight: 600 }}>
                        Auto-logout in {mins}:{secs.toString().padStart(2, '0')}
                    </Typography>
                </Box>

                {lastResult && (
                    <Typography variant="body2" sx={{ mb: 1.5, color: '#dc2626', fontWeight: 600, fontSize: '0.78rem' }}>
                        {lastResult}
                    </Typography>
                )}

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Button
                        variant="contained"
                        size="large"
                        onClick={handleReconnect}
                        disabled={trying}
                        startIcon={trying ? <CircularProgress size={18} color="inherit" /> : <ReconnectIcon />}
                        sx={{
                            py: 1.5, borderRadius: 2, fontWeight: 700, textTransform: 'none',
                            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                            '&:hover': { background: 'linear-gradient(135deg, #4f46e5, #4338ca)' },
                        }}
                    >
                        {trying ? 'Reconnecting...' : 'Reconnect'}
                    </Button>
                    <Button
                        variant="outlined"
                        size="large"
                        onClick={onLogout}
                        startIcon={<LoginIcon />}
                        sx={{
                            py: 1.5, borderRadius: 2, fontWeight: 600, textTransform: 'none',
                            color: '#64748b', borderColor: '#e2e8f0',
                            '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' },
                        }}
                    >
                        Go to Login
                    </Button>
                </Box>
            </Paper>
        </Box>
    );
};
