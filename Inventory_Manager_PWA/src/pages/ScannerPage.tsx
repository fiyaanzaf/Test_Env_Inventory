import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box, Typography, Button, IconButton, Alert, Chip, TextField,
    List, ListItem, ListItemText, ListItemIcon, Divider,
    Snackbar, CircularProgress, Paper, ToggleButtonGroup, ToggleButton,
    FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import {
    QrCodeScanner as ScanIcon,
    CheckCircle as SuccessIcon,
    Error as ErrorIcon,
    FiberManualRecord as DotIcon,
    Delete as ClearIcon,
    ShoppingCart as BillingIcon,
    Inventory as ReceiveIcon,
    AddCircle as AddIcon,
    QrCodeScanner as QrPairIcon,
} from '@mui/icons-material';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import client from '../api/client';
import { ReceiveStockPage } from './ReceiveStockPage';

interface ScanResult {
    barcode: string;
    status: 'found' | 'not_found' | 'received' | 'out_of_stock' | 'error';
    product_name?: string;
    product_price?: number;
    stock_quantity?: number;
    batch_quantity?: number;
    total_stock?: number;
    batch_code?: string;
    location_name?: string;
    message?: string;
    timestamp: Date;
    mode: 'billing' | 'receive';
}

interface Location {
    id: number;
    name: string;
    type: string;
}

// -- Helper: Build WebSocket URL from the saved backend HTTP URL ---------------
function getWsUrl(room: string): string {
    const roomParam = room ? `&room=${room}` : '';
    const saved = localStorage.getItem('backend_url');
    if (saved) {
        return saved.replace(/^http/, 'ws') + '/ws/scanner?role=phone' + roomParam;
    }
    if (typeof window !== 'undefined' && window.location) {
        const hostname = window.location.hostname;
        if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
            return `ws://${hostname}:8001/ws/scanner?role=phone${roomParam}`;
        }
    }
    return `ws://127.0.0.1:8001/ws/scanner?role=phone${roomParam}`;
}

const SESSION_LOCATION_KEY = 'scanner_last_location';
const SESSION_ROOM_KEY = 'scanner_room_code';

export const ScannerPage: React.FC = () => {
    const scanner = useBarcodeScanner();
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'warning' }>({
        open: false, message: '', severity: 'success'
    });

    // -- Mode & Location State --
    const [mode, setMode] = useState<'billing' | 'receive'>('billing');
    const [locations, setLocations] = useState<Location[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<number>(
        () => {
            const saved = sessionStorage.getItem(SESSION_LOCATION_KEY);
            return saved ? parseInt(saved, 10) : 0;
        }
    );

    // -- Room code for desk pairing --
    const [roomCode, setRoomCode] = useState<string>(
        () => sessionStorage.getItem(SESSION_ROOM_KEY) || ''
    );

    // -- Fetch locations on mount --
    useEffect(() => {
        const fetchLocations = async () => {
            try {
                const token = localStorage.getItem('user_token');
                const response = await client.get('/api/v1/inventory/locations', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setLocations(response.data);
                // If no saved location, default to first warehouse
                if (!sessionStorage.getItem(SESSION_LOCATION_KEY) && response.data.length > 0) {
                    const warehouse = response.data.find((l: Location) => l.type === 'warehouse');
                    const defaultId = warehouse ? warehouse.id : response.data[0].id;
                    setSelectedLocation(defaultId);
                    sessionStorage.setItem(SESSION_LOCATION_KEY, String(defaultId));
                }
            } catch (err) {
                console.error('[Scanner] Failed to fetch locations:', err);
            }
        };
        fetchLocations();
    }, []);

    // -- Persist location selection --
    const handleLocationChange = (locId: number) => {
        setSelectedLocation(locId);
        sessionStorage.setItem(SESSION_LOCATION_KEY, String(locId));
    };

    // -- WebSocket Connection --
    const connectWs = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.onclose = null;
            wsRef.current.close();
        }

        setConnecting(true);
        const ws = new WebSocket(getWsUrl(roomCode));

        ws.onopen = () => {
            console.log('[Scanner WS] Connected');
            setConnected(true);
            setConnecting(false);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const result: ScanResult = {
                    barcode: data.barcode || '',
                    status: data.status || 'error',
                    product_name: data.product_name,
                    product_price: data.product_price,
                    stock_quantity: data.stock_quantity,
                    batch_quantity: data.batch_quantity,
                    total_stock: data.total_stock,
                    batch_code: data.batch_code,
                    location_name: data.location_name,
                    message: data.message,
                    timestamp: new Date(),
                    mode: data.status === 'received' ? 'receive' : 'billing',
                };

                setScanHistory(prev => [result, ...prev.slice(0, 19)]);

                if (data.status === 'found') {
                    setSnackbar({
                        open: true,
                        message: `${data.product_name} - Rs.${data.product_price}`,
                        severity: 'success'
                    });
                    if (navigator.vibrate) navigator.vibrate(100);
                } else if (data.status === 'received') {
                    setSnackbar({
                        open: true,
                        message: `+1 ${data.product_name} (Batch: ${data.batch_quantity})`,
                        severity: 'success'
                    });
                    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
                } else if (data.status === 'out_of_stock') {
                    setSnackbar({
                        open: true,
                        message: `Out of Stock: ${data.product_name}`,
                        severity: 'error'
                    });
                    // Long-short-short vibration to signal stock issue
                    if (navigator.vibrate) navigator.vibrate([200, 80, 100, 80, 100]);
                } else if (data.status === 'not_found') {
                    setSnackbar({
                        open: true,
                        message: `Barcode not found: ${data.barcode}`,
                        severity: 'warning'
                    });
                    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                } else if (data.status === 'error') {
                    setSnackbar({
                        open: true,
                        message: data.message || 'Error',
                        severity: 'error'
                    });
                }
            } catch (err) {
                console.error('[Scanner WS] Parse error:', err);
            }
        };

        ws.onclose = () => {
            console.log('[Scanner WS] Disconnected');
            setConnected(false);
            setConnecting(false);
            reconnectTimerRef.current = setTimeout(connectWs, 3000);
        };

        ws.onerror = (err) => {
            console.error('[Scanner WS] Error:', err);
            setConnected(false);
            setConnecting(false);
        };

        wsRef.current = ws;
    }, [roomCode]);

    // Reconnect when room code changes
    useEffect(() => {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.close();
        }
        connectWs();
        return () => {
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
            }
        };
    }, [connectWs]);

    // -- Scan Handler --
    const handleScan = async () => {
        try {
            const result = await scanner.startScan();
            const barcode = result?.content;
            if (!barcode) return;

            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                setSnackbar({ open: true, message: 'Not connected to server!', severity: 'error' });
                return;
            }

            if (mode === 'receive') {
                if (!selectedLocation) {
                    setSnackbar({ open: true, message: 'Please select a location first', severity: 'warning' });
                    return;
                }
                wsRef.current.send(JSON.stringify({
                    barcode,
                    mode: 'receive',
                    location_id: selectedLocation,
                }));
            } else {
                wsRef.current.send(JSON.stringify({ barcode }));
            }
        } catch (err: any) {
            if (err?.message !== 'User cancelled') {
                setSnackbar({ open: true, message: 'Scanner error', severity: 'error' });
            }
        }
    };

    // -- Scan QR to pair with a desk --
    const handleScanToPair = async () => {
        try {
            const result = await scanner.startScan();
            const content = result?.content?.trim();
            if (!content) return;

            // Parse DESK:<CODE> format from the desktop QR
            if (content.startsWith('DESK:')) {
                const code = content.slice(5).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
                if (code.length === 4) {
                    setRoomCode(code);
                    sessionStorage.setItem(SESSION_ROOM_KEY, code);
                    setSnackbar({ open: true, message: `Paired with desk ${code}!`, severity: 'success' });
                    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
                } else {
                    setSnackbar({ open: true, message: 'Invalid desk QR code', severity: 'warning' });
                }
            } else {
                setSnackbar({ open: true, message: 'Not a desk pairing QR code', severity: 'warning' });
            }
        } catch (err: any) {
            if (err?.message !== 'User cancelled') {
                setSnackbar({ open: true, message: 'Scanner error', severity: 'error' });
            }
        }
    };

    const isBillingMode = mode === 'billing';
    const gradientBilling = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    const gradientReceive = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
    const gradientDisabled = 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)';

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 56px - 64px - env(safe-area-inset-top) - env(safe-area-inset-bottom))', gap: 1.5 }}>

            {/* Header Row: Title + Connection Status */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" fontWeight={700}>Wireless Scanner</Typography>
                <Chip
                    icon={<DotIcon sx={{ fontSize: 12, color: connected ? '#22c55e' : connecting ? '#f59e0b' : '#ef4444' }} />}
                    label={connected ? 'Connected' : connecting ? 'Connecting...' : 'Disconnected'}
                    size="small"
                    variant="outlined"
                    sx={{
                        borderColor: connected ? '#22c55e' : connecting ? '#f59e0b' : '#ef4444',
                        color: connected ? '#22c55e' : connecting ? '#f59e0b' : '#ef4444',
                        fontWeight: 600,
                    }}
                />
            </Box>

            {/* Mode Toggle */}
            <ToggleButtonGroup
                value={mode}
                exclusive
                onChange={(_, val) => { if (val) setMode(val); }}
                fullWidth
                size="small"
                sx={{
                    '& .MuiToggleButton-root': {
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        py: 0.8,
                    },
                    '& .Mui-selected': {
                        color: isBillingMode ? '#667eea !important' : '#16a34a !important',
                        backgroundColor: isBillingMode ? 'rgba(102,126,234,0.1) !important' : 'rgba(22,163,74,0.1) !important',
                    },
                }}
            >
                <ToggleButton value="billing">
                    <BillingIcon sx={{ mr: 0.5, fontSize: 18 }} /> Billing
                </ToggleButton>
                <ToggleButton value="receive">
                    <ReceiveIcon sx={{ mr: 0.5, fontSize: 18 }} /> Receive Stock
                </ToggleButton>
            </ToggleButtonGroup>

            {/* Receive Stock Mode: Show full GRN workflow */}
            {mode === 'receive' && (
                <Box sx={{
                    flex: 1, overflow: 'auto', minHeight: 0, mx: -2


                }}>
                    <ReceiveStockPage />
                </Box>
            )}

            {/* Billing Mode: Connection status, scan button, history */}
            {mode === 'billing' && (
                <>
                    {!connected && !connecting && (
                        <Alert severity="warning" sx={{ borderRadius: 2 }}>
                            Disconnected from server. Attempting to reconnect...
                            <Button size="small" onClick={connectWs} sx={{ ml: 1 }}>Retry Now</Button>
                        </Alert>
                    )}

                    {/* Room Code: Scan QR or enter manually */}
                    <Paper sx={{ p: 1.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={handleScanToPair}
                            startIcon={<QrPairIcon />}
                            sx={{
                                minWidth: 'auto', px: 1.5, py: 0.8,
                                borderRadius: 2, textTransform: 'none', fontWeight: 700,
                                fontSize: '0.75rem', borderColor: '#6366f1', color: '#6366f1',
                                '&:hover': { bgcolor: 'rgba(99,102,241,0.08)' }
                            }}
                        >
                            Pair
                        </Button>
                        <Typography variant="caption" sx={{ color: '#94a3b8' }}>or</Typography>
                        <TextField
                            value={roomCode}
                            onChange={(e) => {
                                const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
                                setRoomCode(val);
                                sessionStorage.setItem(SESSION_ROOM_KEY, val);
                            }}
                            placeholder="CODE"
                            size="small"
                            inputProps={{
                                maxLength: 4,
                                style: { textAlign: 'center', fontWeight: 800, fontSize: '1rem', letterSpacing: 3, textTransform: 'uppercase' }
                            }}
                            sx={{
                                flex: 1, maxWidth: 120,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    bgcolor: roomCode.length === 4 ? '#f0fdf4' : '#fff',
                                }
                            }}
                        />
                        {roomCode.length === 4 && (
                            <Chip
                                label="Paired"
                                size="small"
                                sx={{ bgcolor: '#dcfce7', color: '#16a34a', fontWeight: 700, fontSize: '0.7rem' }}
                            />
                        )}
                        {roomCode.length > 0 && roomCode.length < 4 && (
                            <Chip
                                label={`${4 - roomCode.length} more`}
                                size="small"
                                sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 600, fontSize: '0.7rem' }}
                            />
                        )}
                    </Paper>

                    {/* Big Scan Button */}
                    <Paper
                        elevation={0}
                        sx={{
                            flex: '0 0 auto',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            py: 4,
                            borderRadius: 4,
                            background: connected ? gradientBilling : gradientDisabled,
                            position: 'relative',
                            overflow: 'hidden',
                            transition: 'background 0.3s ease',
                        }}
                    >
                        {/* Pulse ring */}
                        {connected && (
                            <Box
                                sx={{
                                    position: 'absolute',
                                    width: 160,
                                    height: 160,
                                    borderRadius: '50%',
                                    border: '2px solid rgba(255,255,255,0.3)',
                                    animation: 'pulse 2s ease-in-out infinite',
                                    '@keyframes pulse': {
                                        '0%': { transform: 'scale(0.8)', opacity: 1 },
                                        '100%': { transform: 'scale(1.4)', opacity: 0 },
                                    },
                                }}
                            />
                        )}

                        <IconButton
                            onClick={handleScan}
                            disabled={!connected || scanner.isScanning}
                            sx={{
                                width: 110,
                                height: 110,
                                backgroundColor: 'rgba(255,255,255,0.2)',
                                border: '3px solid rgba(255,255,255,0.5)',
                                color: 'white',
                                '&:hover': { backgroundColor: 'rgba(255,255,255,0.3)' },
                                '&.Mui-disabled': {
                                    color: 'rgba(255,255,255,0.5)',
                                    backgroundColor: 'rgba(255,255,255,0.1)',
                                },
                                zIndex: 1,
                            }}
                        >
                            {scanner.isScanning ? (
                                <CircularProgress size={44} sx={{ color: 'white' }} />
                            ) : (
                                <ScanIcon sx={{ fontSize: 52 }} />
                            )}
                        </IconButton>

                        <Typography
                            variant="subtitle1"
                            sx={{ color: 'white', fontWeight: 600, mt: 1.5, zIndex: 1 }}
                        >
                            {scanner.isScanning ? 'Scanning...' : connected ? 'Tap to Scan' : 'Connect to scan'}
                        </Typography>
                        <Typography
                            variant="caption"
                            sx={{ color: 'rgba(255,255,255,0.7)', zIndex: 1, mt: 0.5 }}
                        >
                            Scanned items appear on desktop billing
                        </Typography>
                    </Paper>

                    {/* Scan History */}
                    <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
                                Scan History ({scanHistory.length})
                            </Typography>
                            {scanHistory.length > 0 && (
                                <IconButton size="small" onClick={() => setScanHistory([])}>
                                    <ClearIcon fontSize="small" />
                                </IconButton>
                            )}
                        </Box>

                        {scanHistory.length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 3, color: 'text.disabled' }}>
                                <ScanIcon sx={{ fontSize: 44, mb: 1, opacity: 0.3 }} />
                                <Typography variant="body2">No scans yet</Typography>
                            </Box>
                        ) : (
                            <List dense sx={{ bgcolor: 'white', borderRadius: 2, p: 0 }}>
                                {scanHistory.map((scan, index) => (
                                    <React.Fragment key={`${scan.barcode}-${scan.timestamp.getTime()}`}>
                                        {index > 0 && <Divider />}
                                        <ListItem sx={{ px: 2, py: 1 }}>
                                            <ListItemIcon sx={{ minWidth: 32 }}>
                                                {scan.status === 'found' ? (
                                                    <SuccessIcon sx={{ color: '#6366f1', fontSize: 20 }} />
                                                ) : scan.status === 'received' ? (
                                                    <AddIcon sx={{ color: '#22c55e', fontSize: 20 }} />
                                                ) : (
                                                    <ErrorIcon sx={{ color: '#ef4444', fontSize: 20 }} />
                                                )}
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={
                                                    scan.status === 'found'
                                                        ? scan.product_name
                                                        : scan.status === 'received'
                                                            ? `+1 ${scan.product_name}`
                                                            : `Unknown: ${scan.barcode}`
                                                }
                                                secondary={
                                                    scan.status === 'found'
                                                        ? `Rs.${scan.product_price} | Stock: ${scan.stock_quantity} | ${scan.timestamp.toLocaleTimeString()}`
                                                        : scan.status === 'received'
                                                            ? `Batch: ${scan.batch_quantity} | Total: ${scan.total_stock} | ${scan.location_name} | ${scan.timestamp.toLocaleTimeString()}`
                                                            : scan.timestamp.toLocaleTimeString()
                                                }
                                                primaryTypographyProps={{ fontWeight: 600, fontSize: '0.875rem' }}
                                                secondaryTypographyProps={{ fontSize: '0.75rem' }}
                                            />
                                        </ListItem>
                                    </React.Fragment>
                                ))}
                            </List>
                        )}
                    </Box>

                    {/* Snackbar */}
                    <Snackbar
                        open={snackbar.open}
                        autoHideDuration={3000}
                        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
                        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                    >
                        <Alert
                            severity={snackbar.severity}
                            onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
                            sx={{ borderRadius: 2, fontWeight: 600 }}
                        >
                            {snackbar.message}
                        </Alert>
                    </Snackbar>
                </>)
            }
        </Box>
    );
};

export default ScannerPage;
