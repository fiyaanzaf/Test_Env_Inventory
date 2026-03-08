import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Box, Typography, Button, TextField, Chip, Snackbar, Alert,
    CircularProgress, IconButton, Stepper, Step, StepLabel,
    Card, CardContent, Collapse, MenuItem, Dialog, DialogTitle,
    DialogContent, DialogActions, LinearProgress
} from '@mui/material';
import {
    Receipt as InvoiceIcon,
    QrCodeScanner as ScanIcon,
    CheckCircle as ApproveIcon,
    Cancel as RejectIcon,
    Warehouse as WarehouseIcon,
    ArrowBack as BackIcon,
    ArrowForward as NextIcon,
    LocalShipping as POIcon,
    Inventory as ProductIcon,
    Download as DownloadIcon,
    CameraAlt as CameraIcon,
    Info as InfoIcon,
    ExpandMore as ExpandIcon,
    ExpandLess as CollapseIcon,
} from '@mui/icons-material';

import {
    startGRN, getGRN, scanGRNItem, submitQA, confirmGRN,
    type GRNDetail, type GRNScannedItem, type QADecision,
    type StartGRNPayload
} from '../services/grnService';
import { getPurchaseOrders } from '../services/purchaseService';
import { getLocations } from '../services/inventoryService';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';

// ══════════════════════════════════════
// STEP COMPONENTS
// ══════════════════════════════════════

// ── Step 0: Select PO ────────────────
const SelectPOStep: React.FC<{
    onStart: (poId: number, invoiceData: Partial<StartGRNPayload>) => void;
    loading: boolean;
    preselectedPoId?: number;
}> = ({ onStart, loading, preselectedPoId }) => {
    const [orders, setOrders] = useState<any[]>([]);
    const [fetching, setFetching] = useState(true);
    const [selectedPO, setSelectedPO] = useState<any>(null);
    const [invoiceNo, setInvoiceNo] = useState('');
    const [invoiceDate, setInvoiceDate] = useState('');
    const [totalAmount, setTotalAmount] = useState('');
    const [taxAmount, setTaxAmount] = useState('');

    useEffect(() => {
        getPurchaseOrders().then(all => {
            const placed = all.filter((o: any) => o.status === 'placed');
            setOrders(placed);
            // Auto-select PO if passed from Orders tab
            if (preselectedPoId) {
                const match = placed.find((o: any) => o.id === preselectedPoId);
                if (match) {
                    setSelectedPO(match);
                    setTotalAmount(Number(match.total_amount).toString());
                }
            }
        }).catch(() => { }).finally(() => setFetching(false));
    }, [preselectedPoId]);

    if (fetching) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
    }

    if (orders.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', py: 6 }}>
                <POIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 1 }} />
                <Typography color="text.secondary">No placed orders to receive</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {!selectedPO ? (
                <>
                    <Typography variant="subtitle2" sx={{ color: '#64748b', fontWeight: 600, px: 0.5 }}>
                        Select an incoming order to receive:
                    </Typography>
                    {orders.map(po => (
                        <Card
                            key={po.id}
                            onClick={() => {
                                setSelectedPO(po);
                                setTotalAmount(Number(po.total_amount).toString());
                            }}
                            sx={{
                                cursor: 'pointer', borderRadius: 3,
                                border: '1px solid #e2e8f0',
                                '&:active': { transform: 'scale(0.98)' },
                                transition: 'all 0.15s',
                            }}
                        >
                            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                <Box sx={{
                                    width: 40, height: 40, borderRadius: 2, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                    bgcolor: '#eef2ff', border: '1px solid #c7d2fe',
                                }}>
                                    <POIcon sx={{ fontSize: 20, color: '#4f46e5' }} />
                                </Box>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography fontWeight={700} sx={{ fontSize: '0.9rem' }}>
                                        PO #{po.id}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                                        {po.supplier_name} · {po.item_count} items · ₹{Number(po.total_amount).toLocaleString()}
                                    </Typography>
                                </Box>
                                <Chip label="Placed" size="small" sx={{
                                    fontWeight: 600, fontSize: '0.68rem', height: 22,
                                    bgcolor: '#dbeafe', color: '#1d4ed8'
                                }} />
                            </CardContent>
                        </Card>
                    ))}
                </>
            ) : (
                <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <IconButton size="small" onClick={() => setSelectedPO(null)}>
                            <BackIcon fontSize="small" />
                        </IconButton>
                        <Typography fontWeight={700}>PO #{selectedPO.id} — {selectedPO.supplier_name}</Typography>
                    </Box>

                    <Typography variant="subtitle2" sx={{ color: '#475569', fontWeight: 600 }}>
                        📄 Enter supplier invoice details:
                    </Typography>

                    <TextField
                        label="Invoice Number *" size="small" fullWidth
                        value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)}
                        placeholder="e.g. INV-2026-0012"
                    />
                    <TextField
                        label="Invoice Date" type="date" size="small" fullWidth
                        InputLabelProps={{ shrink: true }}
                        value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                    />
                    <Box sx={{ display: 'flex', gap: 1.5 }}>
                        <TextField
                            label="Total Amount (₹)" type="number" size="small" fullWidth
                            value={totalAmount} onChange={e => setTotalAmount(e.target.value)}
                        />
                        <TextField
                            label="Tax (₹)" type="number" size="small" fullWidth
                            value={taxAmount} onChange={e => setTaxAmount(e.target.value)}
                        />
                    </Box>

                    <Button
                        variant="contained" fullWidth disabled={!invoiceNo.trim() || loading}
                        onClick={() => onStart(selectedPO.id, {
                            invoice_number: invoiceNo.trim(),
                            invoice_date: invoiceDate || undefined,
                            total_amount: totalAmount ? parseFloat(totalAmount) : 0,
                            tax_amount: taxAmount ? parseFloat(taxAmount) : 0,
                            subtotal: totalAmount ? parseFloat(totalAmount) - (taxAmount ? parseFloat(taxAmount) : 0) : 0,
                        })}
                        sx={{
                            mt: 1, py: 1.2, borderRadius: 2, fontWeight: 700, textTransform: 'none',
                            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                        }}
                        startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <NextIcon />}
                    >
                        {loading ? 'Starting...' : 'Start Receiving'}
                    </Button>
                </>
            )}
        </Box>
    );
};


// ── Step 1: Scan Items ───────────────
const ScanItemsStep: React.FC<{
    grn: GRNDetail;
    onItemScanned: () => void;
    onNext: () => void;
    onBack: () => void;
}> = ({ grn, onItemScanned, onNext, onBack }) => {
    const { startScan, isSupported } = useBarcodeScanner();
    const [scanning, setScanning] = useState(false);
    const [manualBarcode, setManualBarcode] = useState('');
    const [error, setError] = useState('');
    const [showManual, setShowManual] = useState(false);

    const scannedProductIds = new Set(grn.scanned_items.map(s => s.product_id));
    const totalItems = grn.invoice_items.length;
    const scannedCount = grn.scanned_items.length;
    const progress = totalItems > 0 ? (scannedCount / totalItems) * 100 : 0;

    const handleScan = async (barcode?: string) => {
        const code = barcode || manualBarcode.trim();
        if (!code) return;
        setScanning(true);
        setError('');
        try {
            await scanGRNItem(grn.id, code);
            onItemScanned();
            setManualBarcode('');
            setShowManual(false);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Scan failed');
        } finally {
            setScanning(false);
        }
    };

    const handleCameraScan = async () => {
        const result = await startScan();
        if (result?.hasContent) {
            handleScan(result.content);
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Progress bar */}
            <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="text.secondary">
                        Scanning Progress
                    </Typography>
                    <Typography variant="caption" fontWeight={700} color="primary">
                        {scannedCount}/{totalItems}
                    </Typography>
                </Box>
                <LinearProgress variant="determinate" value={progress}
                    sx={{
                        height: 8, borderRadius: 4, bgcolor: '#e2e8f0',
                        '& .MuiLinearProgress-bar': { borderRadius: 4, background: 'linear-gradient(90deg, #6366f1, #4f46e5)' }
                    }}
                />
            </Box>

            {/* Invoice info */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip icon={<InvoiceIcon />} label={`Inv: ${grn.invoice_number}`} size="small"
                    sx={{ fontWeight: 600, bgcolor: '#f0fdf4', color: '#15803d', fontSize: '0.72rem' }} />
                <Chip label={grn.supplier_name} size="small"
                    sx={{ fontWeight: 600, bgcolor: '#eff6ff', color: '#1d4ed8', fontSize: '0.72rem' }} />
            </Box>

            {error && <Alert severity="error" onClose={() => setError('')} sx={{ borderRadius: 2 }}>{error}</Alert>}

            {/* Scan buttons */}
            <Box sx={{ display: 'flex', gap: 1.5 }}>
                {isSupported && (
                    <Button
                        variant="contained" fullWidth
                        onClick={handleCameraScan}
                        disabled={scanning}
                        startIcon={<CameraIcon />}
                        sx={{
                            py: 1.5, borderRadius: 2, fontWeight: 700, textTransform: 'none',
                            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                        }}
                    >
                        Scan Barcode
                    </Button>
                )}
                <Button
                    variant="outlined" fullWidth
                    onClick={() => setShowManual(!showManual)}
                    sx={{ py: 1.5, borderRadius: 2, fontWeight: 600, textTransform: 'none' }}
                >
                    {showManual ? 'Hide' : 'Enter Manually'}
                </Button>
            </Box>

            <Collapse in={showManual}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                        label="Barcode" size="small" fullWidth
                        value={manualBarcode} onChange={e => setManualBarcode(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleScan()}
                    />
                    <Button variant="contained" onClick={() => handleScan()} disabled={scanning || !manualBarcode.trim()}
                        sx={{ borderRadius: 2, fontWeight: 600, textTransform: 'none', minWidth: 70 }}
                    >
                        {scanning ? <CircularProgress size={20} color="inherit" /> : 'Add'}
                    </Button>
                </Box>
            </Collapse>

            {/* Expected items list */}
            <Typography variant="subtitle2" sx={{ color: '#475569', fontWeight: 600, mt: 1 }}>
                Items to receive:
            </Typography>
            {grn.invoice_items.map(item => {
                const isScanned = scannedProductIds.has(item.product_id);
                const scannedItem = grn.scanned_items.find(s => s.product_id === item.product_id);
                return (
                    <Card key={item.id} sx={{
                        borderRadius: 2.5, border: '1px solid',
                        borderColor: isScanned ? '#86efac' : '#e2e8f0',
                        bgcolor: isScanned ? '#f0fdf4' : 'white',
                        transition: 'all 0.2s',
                    }}>
                        <CardContent sx={{ py: 1.2, px: 1.5, '&:last-child': { pb: 1.2 } }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {isScanned ? (
                                    <ApproveIcon sx={{ fontSize: 22, color: '#16a34a' }} />
                                ) : (
                                    <ProductIcon sx={{ fontSize: 22, color: '#94a3b8' }} />
                                )}
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography fontWeight={600} sx={{ fontSize: '0.85rem', lineHeight: 1.2 }}>
                                        {item.product_name}
                                        {item.variant_name && <Typography component="span" sx={{ color: '#6366f1', ml: 0.5, fontSize: '0.78rem' }}>({item.variant_name})</Typography>}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                                        Qty: {item.invoiced_qty} · ₹{item.unit_cost}/unit
                                    </Typography>
                                </Box>
                                {isScanned && scannedItem && (
                                    <Chip label={scannedItem.internal_code} size="small"
                                        sx={{ fontWeight: 600, fontSize: '0.6rem', height: 20, bgcolor: '#dcfce7', color: '#15803d' }} />
                                )}
                            </Box>
                        </CardContent>
                    </Card>
                );
            })}

            {/* Navigation */}
            <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
                <Button variant="outlined" onClick={onBack} sx={{ flex: 1, borderRadius: 2, fontWeight: 600, textTransform: 'none' }}>
                    Back
                </Button>
                <Button
                    variant="contained" onClick={onNext}
                    disabled={scannedCount === 0}
                    sx={{
                        flex: 2, borderRadius: 2, fontWeight: 700, textTransform: 'none',
                        background: scannedCount >= totalItems
                            ? 'linear-gradient(135deg, #16a34a, #15803d)'
                            : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    }}
                    endIcon={<NextIcon />}
                >
                    {scannedCount >= totalItems ? 'Proceed to QA' : `QA (${scannedCount} scanned)`}
                </Button>
            </Box>
        </Box>
    );
};


// ── Step 2: QA Review ────────────────
const QAReviewStep: React.FC<{
    grn: GRNDetail;
    onSubmit: (decisions: QADecision[]) => void;
    onBack: () => void;
    loading: boolean;
}> = ({ grn, onSubmit, onBack, loading }) => {
    const [decisions, setDecisions] = useState<Record<number, { status: 'approved' | 'rejected'; notes: string }>>(() => {
        const init: any = {};
        grn.scanned_items.forEach(item => {
            init[item.id] = { status: item.qa_status === 'pending' ? 'approved' : item.qa_status, notes: item.qa_notes || '' };
        });
        return init;
    });
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const approved = Object.values(decisions).filter(d => d.status === 'approved').length;
    const rejected = Object.values(decisions).filter(d => d.status === 'rejected').length;

    const handleSubmit = () => {
        const qaList: QADecision[] = Object.entries(decisions).map(([id, d]) => ({
            item_id: parseInt(id),
            status: d.status,
            notes: d.notes || undefined,
        }));
        onSubmit(qaList);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Summary bar */}
            <Box sx={{
                display: 'flex', gap: 1.5, p: 1.5, borderRadius: 2.5,
                bgcolor: '#f8fafc', border: '1px solid #e2e8f0',
            }}>
                <Box sx={{ flex: 1, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Approved</Typography>
                    <Typography fontWeight={700} sx={{ color: '#16a34a' }}>{approved}</Typography>
                </Box>
                <Box sx={{ flex: 1, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Rejected</Typography>
                    <Typography fontWeight={700} sx={{ color: '#dc2626' }}>{rejected}</Typography>
                </Box>
                <Box sx={{ flex: 1, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Total</Typography>
                    <Typography fontWeight={700}>{grn.scanned_items.length}</Typography>
                </Box>
            </Box>

            {/* Items */}
            {grn.scanned_items.map(item => {
                const dec = decisions[item.id];
                const isExpanded = expandedId === item.id;
                return (
                    <Card key={item.id} sx={{
                        borderRadius: 2.5, border: '2px solid',
                        borderColor: dec?.status === 'approved' ? '#86efac' : dec?.status === 'rejected' ? '#fca5a5' : '#e2e8f0',
                        transition: 'all 0.2s',
                    }}>
                        <CardContent sx={{ py: 1.2, px: 1.5, '&:last-child': { pb: 1.2 } }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography fontWeight={700} sx={{ fontSize: '0.88rem', lineHeight: 1.2 }}>
                                        {item.product_name}
                                        {item.variant_name && <Typography component="span" sx={{ color: '#6366f1', ml: 0.5, fontSize: '0.78rem' }}>({item.variant_name})</Typography>}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                                        Qty: {item.received_qty} · ₹{item.unit_cost}/unit · Code: {item.internal_code}
                                    </Typography>
                                </Box>
                                {/* Toggle buttons */}
                                <IconButton
                                    size="small"
                                    onClick={() => setDecisions(prev => ({ ...prev, [item.id]: { ...prev[item.id], status: 'approved' } }))}
                                    sx={{
                                        bgcolor: dec?.status === 'approved' ? '#dcfce7' : '#f1f5f9',
                                        '&:hover': { bgcolor: '#bbf7d0' },
                                    }}
                                >
                                    <ApproveIcon sx={{ fontSize: 20, color: dec?.status === 'approved' ? '#16a34a' : '#94a3b8' }} />
                                </IconButton>
                                <IconButton
                                    size="small"
                                    onClick={() => {
                                        setDecisions(prev => ({ ...prev, [item.id]: { ...prev[item.id], status: 'rejected' } }));
                                        setExpandedId(item.id);
                                    }}
                                    sx={{
                                        bgcolor: dec?.status === 'rejected' ? '#fee2e2' : '#f1f5f9',
                                        '&:hover': { bgcolor: '#fecaca' },
                                    }}
                                >
                                    <RejectIcon sx={{ fontSize: 20, color: dec?.status === 'rejected' ? '#dc2626' : '#94a3b8' }} />
                                </IconButton>
                                <IconButton size="small" onClick={() => setExpandedId(isExpanded ? null : item.id)}>
                                    {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                                </IconButton>
                            </Box>

                            <Collapse in={isExpanded}>
                                <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid #e2e8f0' }}>
                                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, mb: 1 }}>
                                        <Typography variant="caption" color="text.secondary">Ordered: {item.ordered_qty}</Typography>
                                        <Typography variant="caption" color="text.secondary">Invoiced: {item.invoiced_qty}</Typography>
                                        <Typography variant="caption" color="text.secondary">Received: {item.received_qty}</Typography>
                                        <Typography variant="caption" color="text.secondary">Barcode: {item.universal_barcode}</Typography>
                                    </Box>
                                    {dec?.status === 'rejected' && (
                                        <TextField
                                            label="Rejection reason" size="small" fullWidth multiline rows={2}
                                            value={dec.notes}
                                            onChange={e => setDecisions(prev => ({ ...prev, [item.id]: { ...prev[item.id], notes: e.target.value } }))}
                                            sx={{ mt: 0.5 }}
                                        />
                                    )}
                                </Box>
                            </Collapse>
                        </CardContent>
                    </Card>
                );
            })}

            {/* Navigation */}
            <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
                <Button variant="outlined" onClick={onBack} sx={{ flex: 1, borderRadius: 2, fontWeight: 600, textTransform: 'none' }}>
                    Back
                </Button>
                <Button
                    variant="contained" onClick={handleSubmit} disabled={loading}
                    sx={{
                        flex: 2, borderRadius: 2, fontWeight: 700, textTransform: 'none',
                        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    }}
                    startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <ApproveIcon />}
                >
                    {loading ? 'Submitting...' : 'Submit QA Review'}
                </Button>
            </Box>
        </Box>
    );
};


// ── Step 3: Confirm & Receive ────────
const ConfirmStep: React.FC<{
    grn: GRNDetail;
    onConfirm: (warehouseId: number) => void;
    onBack: () => void;
    loading: boolean;
}> = ({ grn, onConfirm, onBack, loading }) => {
    const [locations, setLocations] = useState<any[]>([]);
    const [warehouseId, setWarehouseId] = useState<number>(0);

    useEffect(() => {
        getLocations().then(locs => {
            const whs = locs.filter((l: any) => l.type === 'warehouse');
            setLocations(whs);
            if (whs.length === 1) setWarehouseId(whs[0].id);
        }).catch(() => { });
    }, []);

    const approved = grn.scanned_items.filter(i => i.qa_status === 'approved');
    const rejected = grn.scanned_items.filter(i => i.qa_status === 'rejected');
    const totalValue = approved.reduce((sum, i) => sum + (i.received_qty * i.unit_cost), 0);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Summary */}
            <Box sx={{
                p: 2, borderRadius: 3,
                background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
                border: '1px solid #c7d2fe',
            }}>
                <Typography fontWeight={700} sx={{ fontSize: '1rem', mb: 1.5 }}>📦 Receive Summary</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <Box>
                        <Typography variant="caption" color="text.secondary">Invoice</Typography>
                        <Typography fontWeight={600} sx={{ fontSize: '0.85rem' }}>{grn.invoice_number}</Typography>
                    </Box>
                    <Box>
                        <Typography variant="caption" color="text.secondary">Supplier</Typography>
                        <Typography fontWeight={600} sx={{ fontSize: '0.85rem' }}>{grn.supplier_name}</Typography>
                    </Box>
                    <Box>
                        <Typography variant="caption" color="text.secondary">Approved</Typography>
                        <Typography fontWeight={700} sx={{ color: '#16a34a', fontSize: '0.85rem' }}>
                            {approved.length} item{approved.length !== 1 ? 's' : ''}
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="caption" color="text.secondary">Rejected</Typography>
                        <Typography fontWeight={700} sx={{ color: rejected.length > 0 ? '#dc2626' : '#94a3b8', fontSize: '0.85rem' }}>
                            {rejected.length} item{rejected.length !== 1 ? 's' : ''}
                        </Typography>
                    </Box>
                    <Box sx={{ gridColumn: 'span 2' }}>
                        <Typography variant="caption" color="text.secondary">Total Value (Approved)</Typography>
                        <Typography fontWeight={700} sx={{ fontSize: '1.1rem', color: '#4f46e5' }}>
                            ₹{totalValue.toLocaleString()}
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {rejected.length > 0 && (
                <Alert severity="warning" sx={{ borderRadius: 2 }}>
                    {rejected.length} item{rejected.length > 1 ? 's' : ''} rejected — will not be added to inventory
                </Alert>
            )}

            {/* Warehouse selection */}
            <TextField
                select label="Receive Into Warehouse *" fullWidth size="small"
                value={warehouseId || ''} onChange={e => setWarehouseId(Number(e.target.value))}
            >
                {locations.map(l => (
                    <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
                ))}
            </TextField>

            {/* Approved items list */}
            <Typography variant="subtitle2" sx={{ color: '#475569', fontWeight: 600 }}>
                Will be added to inventory:
            </Typography>
            {approved.map(item => (
                <Box key={item.id} sx={{
                    display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
                    borderRadius: 2, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0',
                }}>
                    <ApproveIcon sx={{ fontSize: 18, color: '#16a34a' }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography fontWeight={600} sx={{ fontSize: '0.82rem' }}>
                            {item.product_name}
                            {item.variant_name && <span style={{ color: '#6366f1' }}> ({item.variant_name})</span>}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                            Qty: {item.received_qty} · ₹{item.unit_cost}/unit · {item.internal_code}
                        </Typography>
                    </Box>
                </Box>
            ))}

            {/* Actions */}
            <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
                <Button variant="outlined" onClick={onBack} sx={{ flex: 1, borderRadius: 2, fontWeight: 600, textTransform: 'none' }}>
                    Back
                </Button>
                <Button
                    variant="contained" onClick={() => onConfirm(warehouseId)}
                    disabled={loading || !warehouseId || approved.length === 0}
                    sx={{
                        flex: 2, borderRadius: 2, fontWeight: 700, textTransform: 'none',
                        background: 'linear-gradient(135deg, #16a34a, #15803d)',
                        '&:hover': { background: 'linear-gradient(135deg, #15803d, #166534)' },
                    }}
                    startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <WarehouseIcon />}
                >
                    {loading ? 'Receiving...' : 'Receive Into Inventory'}
                </Button>
            </Box>
        </Box>
    );
};


// ══════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════
export const ReceiveStockPage: React.FC = () => {
    const location = useLocation();
    const preselectedPoId = (location.state as any)?.poId as number | undefined;
    const [activeStep, setActiveStep] = useState(0);
    const [grnId, setGrnId] = useState<number | null>(null);
    const [grnData, setGrnData] = useState<GRNDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
        open: false, message: '', severity: 'info'
    });
    const [completed, setCompleted] = useState(false);
    const [completionResult, setCompletionResult] = useState<any>(null);

    const refreshGRN = useCallback(async (id?: number) => {
        const targetId = id || grnId;
        if (!targetId) return null;
        try {
            const data = await getGRN(targetId);
            setGrnData(data);
            return data;
        } catch {
            setSnackbar({ open: true, message: 'Failed to load GRN', severity: 'error' });
            return null;
        }
    }, [grnId]);

    // Step 0: Start GRN
    const handleStart = async (poId: number, invoiceData: Partial<StartGRNPayload>) => {
        setLoading(true);
        try {
            const result = await startGRN({
                po_id: poId,
                invoice_number: invoiceData.invoice_number || '',
                ...invoiceData,
            });
            setGrnId(result.grn_id);
            const grnDetails = await refreshGRN(result.grn_id);
            // Jump to appropriate step based on resumed GRN status
            if (result.resumed) {
                if (result.status === 'qa_pending') {
                    setActiveStep(2);
                } else if (grnDetails && grnDetails.scanned_items.length > 0) {
                    setActiveStep(1);
                } else {
                    setActiveStep(1);
                }
            } else {
                setActiveStep(1);
            }
            setSnackbar({ open: true, message: result.resumed ? `Resumed GRN #${result.grn_id}` : 'GRN started — scan items now', severity: 'success' });
        } catch (err: any) {
            setSnackbar({ open: true, message: err.response?.data?.detail || 'Failed to start GRN', severity: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // Step 1: Item scanned
    const handleItemScanned = () => {
        refreshGRN();
        setSnackbar({ open: true, message: 'Item scanned ✓', severity: 'success' });
    };

    // Step 2: QA submit
    const handleQASubmit = async (decisions: QADecision[]) => {
        if (!grnId) return;
        setLoading(true);
        try {
            await submitQA(grnId, decisions);
            await refreshGRN();
            setActiveStep(3);
            setSnackbar({ open: true, message: 'QA review submitted', severity: 'success' });
        } catch (err: any) {
            setSnackbar({ open: true, message: err.response?.data?.detail || 'QA submission failed', severity: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // Step 3: Confirm
    const handleConfirm = async (warehouseId: number) => {
        if (!grnId) return;
        setLoading(true);
        try {
            const result = await confirmGRN(grnId, warehouseId);
            setCompletionResult(result);
            setCompleted(true);
            setSnackbar({ open: true, message: 'Stock received into inventory!', severity: 'success' });
        } catch (err: any) {
            setSnackbar({ open: true, message: err.response?.data?.detail || 'Confirm failed', severity: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setActiveStep(0);
        setGrnId(null);
        setGrnData(null);
        setCompleted(false);
        setCompletionResult(null);
    };

    const steps = ['Select PO', 'Scan Items', 'QA Review', 'Confirm'];

    // ── Completion Screen ──
    if (completed && completionResult) {
        return (
            <Box sx={{ p: 2, maxWidth: 600, mx: 'auto' }}>
                <Box sx={{
                    textAlign: 'center', py: 4, px: 2, borderRadius: 4,
                    background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                    border: '1px solid #86efac',
                }}>
                    <ApproveIcon sx={{ fontSize: 56, color: '#16a34a', mb: 1 }} />
                    <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>Stock Received! ✓</Typography>
                    <Typography color="text.secondary" sx={{ mb: 2 }}>
                        {completionResult.approved_count} item{completionResult.approved_count !== 1 ? 's' : ''} added to inventory.
                        {completionResult.rejected_count > 0 && ` ${completionResult.rejected_count} rejected.`}
                    </Typography>
                    <Chip label={`PO Status: ${completionResult.po_status}`} sx={{
                        fontWeight: 600, mb: 2,
                        bgcolor: completionResult.po_status === 'received' ? '#dcfce7' : '#fef3c7',
                        color: completionResult.po_status === 'received' ? '#15803d' : '#92400e',
                    }} />
                    <Box>
                        <Button variant="contained" onClick={handleReset}
                            sx={{
                                mt: 2, borderRadius: 2, fontWeight: 700, textTransform: 'none', px: 4,
                                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                            }}
                        >
                            Receive Another Order
                        </Button>
                    </Box>
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 2, maxWidth: 600, mx: 'auto', pb: 10 }}>
            {/* Header */}
            <Typography variant="h6" fontWeight={800} sx={{
                mb: 2,
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
                📦 Receive Stock
            </Typography>

            {/* Stepper */}
            <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 3 }}>
                {steps.map(label => (
                    <Step key={label}>
                        <StepLabel sx={{ '& .MuiStepLabel-label': { fontSize: '0.7rem', fontWeight: 600 } }}>
                            {label}
                        </StepLabel>
                    </Step>
                ))}
            </Stepper>

            {/* Step content */}
            {activeStep === 0 && (
                <SelectPOStep onStart={handleStart} loading={loading} preselectedPoId={preselectedPoId} />
            )}
            {activeStep === 1 && grnData && (
                <ScanItemsStep
                    grn={grnData}
                    onItemScanned={handleItemScanned}
                    onNext={() => setActiveStep(2)}
                    onBack={() => setActiveStep(0)}
                />
            )}
            {activeStep === 2 && grnData && (
                <QAReviewStep
                    grn={grnData}
                    onSubmit={handleQASubmit}
                    onBack={() => setActiveStep(1)}
                    loading={loading}
                />
            )}
            {activeStep === 3 && grnData && (
                <ConfirmStep
                    grn={grnData}
                    onConfirm={handleConfirm}
                    onBack={() => setActiveStep(2)}
                    loading={loading}
                />
            )}

            <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
                <Alert severity={snackbar.severity} sx={{ borderRadius: 2, fontWeight: 600 }}>{snackbar.message}</Alert>
            </Snackbar>
        </Box>
    );
};
