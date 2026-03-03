import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Box, Chip, CircularProgress, Alert,
    Accordion, AccordionSummary, AccordionDetails,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    Tooltip, IconButton
} from '@mui/material';
import {
    ExpandMore as ExpandMoreIcon,
    Print as PrintIcon,
    Inventory as InventoryIcon
} from '@mui/icons-material';
import {
    getBatchBreakdown,
    getBatchBarcodeUrl,
    type BatchBreakdownResponse,
    type BatchTracking
} from '../services/batchService';

interface Props {
    open: boolean;
    onClose: () => void;
    productId: number | null;
    productName: string;
}

export const BatchBreakdownDialog: React.FC<Props> = ({ open, onClose, productId, productName }) => {
    const [data, setData] = useState<BatchBreakdownResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [expandedVariants, setExpandedVariants] = useState<Set<number | string>>(new Set());

    useEffect(() => {
        if (open && productId) {
            setLoading(true);
            getBatchBreakdown(productId)
                .then(res => {
                    setData(res);
                    // Auto-expand all variants
                    const keys = new Set<number | string>(res.variants.map(v => v.variant_id ?? 'base'));
                    setExpandedVariants(keys);
                    setError('');
                })
                .catch(() => setError('Failed to load batch data'))
                .finally(() => setLoading(false));
        }
    }, [open, productId]);

    const toggleVariant = (key: number | string) => {
        setExpandedVariants(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const handlePrintBarcode = (batchId: number) => {
        const token = localStorage.getItem('user_token');
        const url = getBatchBarcodeUrl(batchId);
        // Open barcode in new window for printing
        const printWindow = window.open('', '_blank', 'width=400,height=300');
        if (printWindow) {
            printWindow.document.write(`
        <html><head><title>Print Barcode</title></head>
        <body style="text-align:center;padding:20px;">
          <img src="${url}?token=${token}" style="max-width:100%;" onload="window.print();" />
        </body></html>
      `);
        }
    };

    const getExpiryColor = (expiry: string | null) => {
        if (!expiry) return 'default';
        const days = Math.floor((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (days < 0) return 'error';
        if (days < 30) return 'warning';
        return 'success';
    };

    const renderBatchTable = (batches: BatchTracking[]) => (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table size="small">
                <TableHead sx={{ bgcolor: '#f8fafc' }}>
                    <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Batch Code</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Supplier</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Mfg Date</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Expiry</TableCell>
                        <TableCell sx={{ fontWeight: 600 }} align="right">Cost (₹)</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Origin</TableCell>
                        <TableCell sx={{ fontWeight: 600 }} align="center">Stock</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                        <TableCell sx={{ fontWeight: 600 }} width={60}>Barcode</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {batches.map(b => (
                        <TableRow key={b.id} sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                            <TableCell>
                                <Chip label={b.batch_code} size="small"
                                    sx={{ fontWeight: 600, bgcolor: '#e0e7ff', color: '#4338ca', borderRadius: 1, fontSize: '0.7rem' }} />
                            </TableCell>
                            <TableCell>
                                <Typography variant="body2">{b.supplier_name || '—'}</Typography>
                            </TableCell>
                            <TableCell>
                                <Typography variant="caption">
                                    {b.manufacturing_date ? new Date(b.manufacturing_date).toLocaleDateString() : '—'}
                                </Typography>
                            </TableCell>
                            <TableCell>
                                {b.expiry_date ? (
                                    <Chip label={new Date(b.expiry_date).toLocaleDateString()} size="small"
                                        color={getExpiryColor(b.expiry_date) as any} variant="outlined" sx={{ fontWeight: 500, fontSize: '0.7rem' }} />
                                ) : '—'}
                            </TableCell>
                            <TableCell align="right">
                                <Typography variant="body2" fontWeight={500}>
                                    {b.procurement_price != null ? `₹${b.procurement_price}` : '—'}
                                </Typography>
                            </TableCell>
                            <TableCell>
                                <Typography variant="caption" color="text.secondary">{b.state_of_origin || '—'}</Typography>
                            </TableCell>
                            <TableCell align="center">
                                <Chip label={b.stock_quantity} size="small"
                                    color={b.stock_quantity === 0 ? 'error' : b.stock_quantity < 10 ? 'warning' : 'success'}
                                    variant={b.stock_quantity === 0 ? 'filled' : 'outlined'} sx={{ fontWeight: 'bold' }} />
                            </TableCell>
                            <TableCell>
                                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 120, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {b.batch_description || '—'}
                                </Typography>
                            </TableCell>
                            <TableCell>
                                <Tooltip title="Print Barcode">
                                    <IconButton size="small" onClick={() => handlePrintBarcode(b.id)} sx={{ color: '#6366f1' }}>
                                        <PrintIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </TableCell>
                        </TableRow>
                    ))}
                    {batches.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={9} align="center" sx={{ py: 3 }}>
                                <Typography variant="body2" color="text.secondary">No batches recorded</Typography>
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
            <DialogTitle sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <InventoryIcon color="primary" />
                    <Box>
                        <Typography variant="h5" fontWeight={700}>Batch Breakdown</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {productName} — {data?.total_batches ?? 0} batch{(data?.total_batches ?? 0) !== 1 ? 'es' : ''} • {data?.total_quantity ?? 0} total units
                        </Typography>
                    </Box>
                </Box>
            </DialogTitle>

            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>{error}</Alert>}

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
                ) : data && data.variants.length > 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        {data.variants.map((variant, idx) => {
                            const key = variant.variant_id ?? 'base';
                            const isExpanded = expandedVariants.has(key);

                            return (
                                <Accordion
                                    key={idx}
                                    expanded={isExpanded}
                                    onChange={() => toggleVariant(key)}
                                    sx={{
                                        borderRadius: '12px !important',
                                        '&:before': { display: 'none' },
                                        boxShadow: 1,
                                        overflow: 'hidden'
                                    }}
                                >
                                    <AccordionSummary
                                        expandIcon={<ExpandMoreIcon />}
                                        sx={{
                                            bgcolor: variant.variant_id ? '#f0f4ff' : '#f8fafc',
                                            '&:hover': { bgcolor: variant.variant_id ? '#e8edff' : '#f1f5f9' }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                                            <Typography variant="subtitle1" fontWeight={600}>
                                                {variant.variant_name}
                                            </Typography>
                                            <Chip label={`${variant.batches.length} batch${variant.batches.length !== 1 ? 'es' : ''}`}
                                                size="small" sx={{ bgcolor: '#e0e7ff', color: '#4338ca', fontWeight: 600 }} />
                                            <Chip label={`${variant.total_quantity} units`}
                                                size="small" color={variant.total_quantity === 0 ? 'error' : 'success'} variant="outlined"
                                                sx={{ fontWeight: 600, ml: 'auto', mr: 2 }} />
                                        </Box>
                                    </AccordionSummary>
                                    <AccordionDetails sx={{ p: 2 }}>
                                        {renderBatchTable(variant.batches)}
                                    </AccordionDetails>
                                </Accordion>
                            );
                        })}
                    </Box>
                ) : (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                        <InventoryIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary">No Batches Found</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Batch tracking entries will appear here when purchase orders are received.
                        </Typography>
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose} sx={{ fontWeight: 600 }}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};
