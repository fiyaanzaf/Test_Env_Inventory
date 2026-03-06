import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, Box, Typography, IconButton, Button, CircularProgress
} from '@mui/material';
import {
    Close as CloseIcon,
    Print as PrintIcon,
    Download as DownloadIcon,
    QrCodeScanner as ScanIcon,
} from '@mui/icons-material';
import client from '../api/client';
import { getToken } from '../services/authService';

interface Props {
    open: boolean;
    onClose: () => void;
    batchId: number | null;
    batchCode: string;
}

export const BatchBarcodeDialog: React.FC<Props> = ({ open, onClose, batchId, batchCode }) => {
    const [barcodeUrl, setBarcodeUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open || !batchId) { setBarcodeUrl(null); return; }
        setLoading(true);
        setError('');

        const baseUrl = client.defaults.baseURL || '';
        const token = getToken();
        const url = `${baseUrl}/api/v1/batches/${batchId}/barcode?token=${token}`;

        // Verify the image loads
        const img = new Image();
        img.onload = () => { setBarcodeUrl(url); setLoading(false); };
        img.onerror = () => { setError('Failed to load barcode'); setLoading(false); };
        img.src = url;

        return () => { img.onload = null; img.onerror = null; };
    }, [open, batchId]);

    const handlePrint = () => {
        if (!barcodeUrl) return;
        const printWin = window.open('', '_blank', 'width=400,height=300');
        if (printWin) {
            printWin.document.write(`
                <html><head><title>Barcode - ${batchCode}</title>
                <style>
                    body { display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; font-family: sans-serif; }
                    .container { text-align: center; }
                    img { max-width: 350px; }
                    p { margin: 8px 0 0; font-size: 14px; color: #333; font-weight: 600; }
                </style></head>
                <body>
                    <div class="container">
                        <img src="${barcodeUrl}" />
                        <p>${batchCode}</p>
                    </div>
                    <script>window.onload = () => { window.print(); };</script>
                </body></html>
            `);
            printWin.document.close();
        }
    };

    const handleDownload = async () => {
        if (!barcodeUrl) return;
        try {
            const response = await fetch(barcodeUrl);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `barcode-${batchCode}.png`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            console.error('Download failed');
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="xs"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 4,
                    overflow: 'hidden',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                }
            }}
        >
            <DialogTitle sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', py: 1.5,
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ScanIcon sx={{ color: '#6366f1' }} />
                    <Typography fontWeight={700} fontSize="0.95rem">Batch Barcode</Typography>
                </Box>
                <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
            </DialogTitle>

            <DialogContent sx={{ p: 0, bgcolor: '#fafafe' }}>
                {/* Scanner-style frame */}
                <Box sx={{
                    position: 'relative', m: 3, p: 3,
                    border: '2px solid #c7d2fe',
                    borderRadius: 3,
                    bgcolor: 'white',
                    minHeight: 200,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    {/* Corner markers */}
                    {[
                        { top: -2, left: -2, borderTop: '4px solid #6366f1', borderLeft: '4px solid #6366f1', borderRadius: '8px 0 0 0' },
                        { top: -2, right: -2, borderTop: '4px solid #6366f1', borderRight: '4px solid #6366f1', borderRadius: '0 8px 0 0' },
                        { bottom: -2, left: -2, borderBottom: '4px solid #6366f1', borderLeft: '4px solid #6366f1', borderRadius: '0 0 0 8px' },
                        { bottom: -2, right: -2, borderBottom: '4px solid #6366f1', borderRight: '4px solid #6366f1', borderRadius: '0 0 8px 0' },
                    ].map((style, i) => (
                        <Box key={i} sx={{
                            position: 'absolute', width: 28, height: 28, ...style,
                        }} />
                    ))}

                    {/* Animated scan line */}
                    <Box sx={{
                        position: 'absolute', left: 16, right: 16, height: 2,
                        background: 'linear-gradient(90deg, transparent 0%, #6366f1 30%, #8b5cf6 50%, #6366f1 70%, transparent 100%)',
                        borderRadius: 2,
                        animation: 'scanLine 2.5s ease-in-out infinite',
                        '@keyframes scanLine': {
                            '0%': { top: 20, opacity: 0.3 },
                            '50%': { top: 'calc(100% - 20px)', opacity: 0.8 },
                            '100%': { top: 20, opacity: 0.3 },
                        },
                    }} />

                    {loading && (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <CircularProgress size={36} sx={{ color: '#6366f1' }} />
                            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                                Generating barcode...
                            </Typography>
                        </Box>
                    )}

                    {error && (
                        <Typography color="error" variant="body2" sx={{ py: 4 }}>{error}</Typography>
                    )}

                    {barcodeUrl && !loading && (
                        <Box sx={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
                            <img
                                src={barcodeUrl}
                                alt={`Barcode for ${batchCode}`}
                                style={{
                                    maxWidth: '100%', height: 'auto',
                                    filter: 'contrast(1.1)',
                                }}
                            />
                        </Box>
                    )}
                </Box>

                {/* Batch code label */}
                <Box sx={{ textAlign: 'center', px: 3, pb: 1 }}>
                    <Typography sx={{
                        fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700,
                        color: '#4f46e5', letterSpacing: 1.5,
                    }}>
                        {batchCode}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Scan this barcode to identify and track this batch
                    </Typography>
                </Box>

                {/* Action buttons */}
                <Box sx={{
                    display: 'flex', gap: 1.5, p: 3, pt: 2,
                    borderTop: '1px solid #f1f5f9',
                }}>
                    <Button
                        fullWidth
                        variant="contained"
                        startIcon={<PrintIcon />}
                        onClick={handlePrint}
                        disabled={!barcodeUrl}
                        sx={{
                            bgcolor: '#4f46e5', borderRadius: 2, py: 1.2, fontWeight: 600,
                            '&:hover': { bgcolor: '#4338ca' },
                            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
                        }}
                    >
                        Print
                    </Button>
                    <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={handleDownload}
                        disabled={!barcodeUrl}
                        sx={{
                            borderColor: '#c7d2fe', color: '#4f46e5', borderRadius: 2, py: 1.2, fontWeight: 600,
                            '&:hover': { borderColor: '#6366f1', bgcolor: '#eef2ff' },
                        }}
                    >
                        Download
                    </Button>
                </Box>
            </DialogContent>
        </Dialog>
    );
};
