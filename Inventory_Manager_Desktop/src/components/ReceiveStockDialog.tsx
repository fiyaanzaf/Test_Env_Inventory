import React, { useState, useEffect, useCallback } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Box, TextField, Stepper, Step, StepLabel,
    CircularProgress, Alert, Chip, IconButton, Divider,
    MenuItem, Collapse, LinearProgress, Tooltip
} from '@mui/material';
import {
    CheckCircle as ApproveIcon,
    Cancel as RejectIcon,
    ArrowForward as NextIcon,
    ArrowBack as BackIcon,
    Warehouse as WarehouseIcon,

    ExpandMore as ExpandIcon,
    ExpandLess as CollapseIcon,
} from '@mui/icons-material';

import {
    startGRN, getGRN, scanGRNItem, submitQA, confirmGRN,
    type GRNDetail, type QADecision, type ItemDateEntry
} from '../services/grnService';
import { getLocations, type Location } from '../services/inventoryService';

interface Props {
    open: boolean;
    onClose: () => void;
    poId: number;
    supplierId: number;
    supplierName: string;
    poTotal?: number;
    onSuccess: () => void;
}

export const ReceiveStockDialog: React.FC<Props> = ({
    open, onClose, poId, supplierId: _supplierId, supplierName, poTotal, onSuccess
}) => {
    const [activeStep, setActiveStep] = useState(0);
    const [grnId, setGrnId] = useState<number | null>(null);
    const [grnData, setGrnData] = useState<GRNDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Step 0 state
    const [invoiceNo, setInvoiceNo] = useState('');
    const [invoiceDate, setInvoiceDate] = useState('');
    const [totalAmount, setTotalAmount] = useState(poTotal ? poTotal.toString() : '');
    const [taxAmount, setTaxAmount] = useState('');

    // Step 1 state
    const [barcodeInput, setBarcodeInput] = useState('');
    const [scanning, setScanning] = useState(false);

    // Step 2 state
    const [decisions, setDecisions] = useState<Record<number, { status: 'approved' | 'rejected'; notes: string }>>({});
    const [expandedItemId, setExpandedItemId] = useState<number | null>(null);

    // Step 3 state
    const [warehouses, setWarehouses] = useState<Location[]>([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');

    const [completed, setCompleted] = useState(false);
    const [completionResult, setCompletionResult] = useState<any>(null);

    // Item dates state (keyed by product_id)
    const [itemDates, setItemDates] = useState<Record<number, { mfgDate: string; bestBefore: string; expiryDate: string }>>({});

    useEffect(() => {
        if (open) {
            getLocations()
                .then(locs => {
                    const whs = locs.filter(l => l.type === 'warehouse');
                    setWarehouses(whs);
                    if (whs.length === 1) setSelectedWarehouse(whs[0].id.toString());
                })
                .catch(() => { });
        }
    }, [open]);

    const refreshGRN = useCallback(async (id?: number) => {
        const targetId = id || grnId;
        if (!targetId) return;
        const data = await getGRN(targetId);
        setGrnData(data);
        return data;
    }, [grnId]);

    // Step 0: Start GRN
    const handleStartGRN = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await startGRN({
                po_id: poId,
                invoice_number: invoiceNo.trim(),
                invoice_date: invoiceDate || undefined,
                total_amount: totalAmount ? parseFloat(totalAmount) : 0,
                tax_amount: taxAmount ? parseFloat(taxAmount) : 0,
                subtotal: totalAmount ? parseFloat(totalAmount) - (taxAmount ? parseFloat(taxAmount) : 0) : 0,
            });
            setGrnId(result.grn_id);
            const grnDetails = await refreshGRN(result.grn_id);

            // If resumed, populate invoice fields from saved data
            if (result.resumed && grnDetails) {
                if (grnDetails.invoice_number) setInvoiceNo(grnDetails.invoice_number);
                if (grnDetails.invoice_date) setInvoiceDate(grnDetails.invoice_date);
                if (grnDetails.invoice_total) setTotalAmount(grnDetails.invoice_total.toString());

                if (result.status === 'qa_pending') {
                    setActiveStep(2);
                } else {
                    setActiveStep(1);
                }
            } else {
                setActiveStep(1);
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to start GRN');
        } finally {
            setLoading(false);
        }
    };

    // Step 1: Scan
    const handleScanBarcode = async () => {
        if (!grnId || !barcodeInput.trim()) return;
        setScanning(true);
        setError('');
        try {
            await scanGRNItem(grnId, barcodeInput.trim());
            setBarcodeInput('');
            await refreshGRN();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Scan failed');
        } finally {
            setScanning(false);
        }
    };

    // Step 2: QA
    const handleQASubmit = async () => {
        if (!grnId) return;
        setLoading(true);
        setError('');
        try {
            const qaList: QADecision[] = Object.entries(decisions).map(([id, d]) => ({
                item_id: parseInt(id),
                status: d.status,
                notes: d.notes || undefined,
            }));
            await submitQA(grnId, qaList);
            const data = await refreshGRN();
            if (data) setGrnData(data);
            setActiveStep(3);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'QA failed');
        } finally {
            setLoading(false);
        }
    };

    // Step 3: Confirm
    const handleConfirm = async () => {
        if (!grnId || !selectedWarehouse) return;
        setLoading(true);
        setError('');
        try {
            // Build item_dates from state
            const dateEntries: ItemDateEntry[] = Object.entries(itemDates)
                .filter(([_, d]) => d.mfgDate || d.bestBefore || d.expiryDate)
                .map(([pid, d]) => ({
                    product_id: parseInt(pid),
                    manufacturing_date: d.mfgDate || undefined,
                    best_before_days: d.bestBefore ? parseInt(d.bestBefore) : undefined,
                    expiry_date: d.expiryDate || undefined,
                }));

            const result = await confirmGRN(
                grnId,
                parseInt(selectedWarehouse),
                dateEntries.length > 0 ? dateEntries : undefined
            );
            setCompletionResult(result);
            setCompleted(true);
            setSuccess(`Stock received! ${result.approved_count} items added to inventory.`);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Confirm failed');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (completed) onSuccess();
        setActiveStep(0);
        setGrnId(null);
        setGrnData(null);
        setInvoiceNo('');
        setInvoiceDate('');
        setTotalAmount('');
        setTaxAmount('');
        setBarcodeInput('');
        setDecisions({});
        setItemDates({});
        setCompleted(false);
        setCompletionResult(null);
        setError('');
        setSuccess('');
        onClose();
    };

    useEffect(() => {
        if (grnData?.scanned_items && activeStep === 2) {
            const init: any = {};
            grnData.scanned_items.forEach(item => {
                init[item.id] = { status: item.qa_status === 'pending' ? 'approved' : item.qa_status, notes: item.qa_notes || '' };
            });
            setDecisions(init);
        }
    }, [grnData?.scanned_items, activeStep]);

    const steps = ['Invoice Details', 'Scan Items', 'QA Review', 'Confirm'];

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
            <DialogTitle sx={{ pb: 1 }}>
                <Typography variant="h5" fontWeight={700}>📦 Receive Stock — PO #{poId}</Typography>
                <Typography variant="body2" color="text.secondary">{supplierName}</Typography>
            </DialogTitle>

            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

                {!completed && (
                    <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
                        {steps.map(label => (
                            <Step key={label}><StepLabel>{label}</StepLabel></Step>
                        ))}
                    </Stepper>
                )}

                {/* Step 0: Invoice */}
                {activeStep === 0 && !completed && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField
                            label="Supplier Invoice Number *" fullWidth
                            value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)}
                            placeholder="e.g. INV-2026-0012"
                        />
                        <TextField
                            label="Invoice Date" type="date" fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                        />
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Total Amount (₹)" type="number" fullWidth
                                value={totalAmount} onChange={e => setTotalAmount(e.target.value)}
                            />
                            <TextField
                                label="Tax Amount (₹)" type="number" fullWidth
                                value={taxAmount} onChange={e => setTaxAmount(e.target.value)}
                            />
                        </Box>
                    </Box>
                )}

                {/* Step 1: Scan */}
                {activeStep === 1 && grnData && !completed && (
                    <Box>
                        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                            <Chip label={`Invoice: ${grnData.invoice_number}`} size="small" color="primary" variant="outlined" />
                            <Chip label={`${grnData.scanned_items.length}/${grnData.invoice_items.length} scanned`} size="small"
                                color={grnData.scanned_items.length >= grnData.invoice_items.length ? 'success' : 'default'} />
                        </Box>

                        <LinearProgress variant="determinate"
                            value={grnData.invoice_items.length > 0 ? (grnData.scanned_items.length / grnData.invoice_items.length) * 100 : 0}
                            sx={{ height: 6, borderRadius: 3, mb: 2 }}
                        />

                        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                            <TextField
                                label="Scan or type barcode" fullWidth size="small" autoFocus
                                value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleScanBarcode()}
                                helperText="Use USB barcode scanner or type manually"
                            />
                            <Button variant="contained" onClick={handleScanBarcode} disabled={scanning || !barcodeInput.trim()}
                                sx={{ minWidth: 80, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}>
                                {scanning ? <CircularProgress size={20} /> : 'Scan'}
                            </Button>
                        </Box>

                        <Divider sx={{ my: 1 }} />
                        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Items:</Typography>
                        {grnData.invoice_items.map(item => {
                            const scanned = grnData.scanned_items.find(s => s.product_id === item.product_id);
                            return (
                                <Box key={item.id} sx={{
                                    display: 'flex', alignItems: 'center', gap: 1.5, p: 1, mb: 0.5,
                                    borderRadius: 2, bgcolor: scanned ? '#f0fdf4' : '#fafafa',
                                    border: '1px solid', borderColor: scanned ? '#86efac' : '#e5e7eb',
                                }}>
                                    {scanned ? <ApproveIcon sx={{ color: '#16a34a' }} /> : <Box sx={{ width: 24 }} />}
                                    <Box sx={{ flex: 1 }}>
                                        <Typography fontWeight={600} variant="body2">
                                            {item.product_name}
                                            {item.variant_name && <span style={{ color: '#6366f1' }}> ({item.variant_name})</span>}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Qty: {item.invoiced_qty} · ₹{item.unit_cost}/unit
                                        </Typography>
                                    </Box>
                                    {scanned && (
                                        <Chip label={scanned.internal_code} size="small"
                                            sx={{ fontSize: '0.65rem', fontWeight: 600, bgcolor: '#dcfce7', color: '#166534' }} />
                                    )}
                                </Box>
                            );
                        })}
                    </Box>
                )}

                {/* Step 2: QA */}
                {activeStep === 2 && grnData && !completed && (
                    <Box>
                        <Box sx={{ display: 'flex', gap: 2, mb: 2, p: 1.5, borderRadius: 2, bgcolor: '#f8fafc' }}>
                            <Typography variant="body2">
                                ✅ Approved: <b>{Object.values(decisions).filter(d => d.status === 'approved').length}</b>
                            </Typography>
                            <Typography variant="body2">
                                ❌ Rejected: <b>{Object.values(decisions).filter(d => d.status === 'rejected').length}</b>
                            </Typography>
                        </Box>

                        {grnData.scanned_items.map(item => {
                            const dec = decisions[item.id];
                            return (
                                <Box key={item.id} sx={{
                                    mb: 1, p: 1.5, borderRadius: 2,
                                    border: '2px solid',
                                    borderColor: dec?.status === 'approved' ? '#86efac' : dec?.status === 'rejected' ? '#fca5a5' : '#e5e7eb',
                                }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ flex: 1 }}>
                                            <Typography fontWeight={600} variant="body2">
                                                {item.product_name}
                                                {item.variant_name && <span style={{ color: '#6366f1' }}> ({item.variant_name})</span>}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Qty: {item.received_qty} · ₹{item.unit_cost}/unit · {item.internal_code}
                                            </Typography>
                                        </Box>
                                        <Tooltip title="Approve"><IconButton size="small"
                                            onClick={() => setDecisions(p => ({ ...p, [item.id]: { ...p[item.id], status: 'approved' } }))}
                                            sx={{ bgcolor: dec?.status === 'approved' ? '#dcfce7' : '#f1f5f9' }}
                                        ><ApproveIcon sx={{ color: dec?.status === 'approved' ? '#16a34a' : '#94a3b8' }} /></IconButton></Tooltip>
                                        <Tooltip title="Reject"><IconButton size="small"
                                            onClick={() => {
                                                setDecisions(p => ({ ...p, [item.id]: { ...p[item.id], status: 'rejected' } }));
                                                setExpandedItemId(item.id);
                                            }}
                                            sx={{ bgcolor: dec?.status === 'rejected' ? '#fee2e2' : '#f1f5f9' }}
                                        ><RejectIcon sx={{ color: dec?.status === 'rejected' ? '#dc2626' : '#94a3b8' }} /></IconButton></Tooltip>
                                        <IconButton size="small" onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}>
                                            {expandedItemId === item.id ? <CollapseIcon /> : <ExpandIcon />}
                                        </IconButton>
                                    </Box>
                                    <Collapse in={expandedItemId === item.id}>
                                        <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid #e5e7eb' }}>
                                            <Typography variant="caption" color="text.secondary">
                                                Ordered: {item.ordered_qty} | Invoiced: {item.invoiced_qty} | Received: {item.received_qty} | Barcode: {item.universal_barcode}
                                            </Typography>
                                            {dec?.status === 'rejected' && (
                                                <TextField label="Rejection notes" size="small" fullWidth multiline rows={2}
                                                    value={dec.notes} sx={{ mt: 1 }}
                                                    onChange={e => setDecisions(p => ({ ...p, [item.id]: { ...p[item.id], notes: e.target.value } }))}
                                                />
                                            )}
                                        </Box>
                                    </Collapse>
                                </Box>
                            );
                        })}
                    </Box>
                )}

                {/* Step 3: Confirm */}
                {activeStep === 3 && grnData && !completed && (
                    <Box>
                        <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f0fdf4', border: '1px solid #86efac', mb: 2 }}>
                            <Typography fontWeight={600} sx={{ mb: 1 }}>Ready to receive:</Typography>
                            <Typography variant="body2">
                                ✅ {grnData.scanned_items.filter(i => i.qa_status === 'approved').length} items approved
                                {grnData.scanned_items.filter(i => i.qa_status === 'rejected').length > 0 &&
                                    ` · ❌ ${grnData.scanned_items.filter(i => i.qa_status === 'rejected').length} rejected`}
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 0.5 }}>
                                Invoice: {grnData.invoice_number} · Total: ₹{grnData.invoice_total.toLocaleString()}
                            </Typography>
                        </Box>

                        <TextField
                            select label="Receive into Warehouse *" fullWidth
                            value={selectedWarehouse} onChange={e => setSelectedWarehouse(e.target.value)}
                        >
                            {warehouses.map(w => (
                                <MenuItem key={w.id} value={w.id.toString()}>{w.name}</MenuItem>
                            ))}
                        </TextField>

                        {/* Manufacturing Date & Best Before per product */}
                        {(() => {
                            const approvedItems = grnData.scanned_items.filter(i => i.qa_status === 'approved');
                            // Deduplicate by product_id
                            const seenProducts = new Set<number>();
                            const uniqueProducts = approvedItems.filter(item => {
                                if (seenProducts.has(item.product_id)) return false;
                                seenProducts.add(item.product_id);
                                return true;
                            });

                            if (uniqueProducts.length === 0) return null;

                            return (
                                <Box sx={{ mt: 2 }}>
                                    <Divider sx={{ mb: 1.5 }} />
                                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: '#475569' }}>
                                        Manufacturing & Expiry Details
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                                        Manufacturing date is required. Choose either Best Before (days) or Expiry Date.
                                    </Typography>
                                    {uniqueProducts.map(item => {
                                        const dates = itemDates[item.product_id] || { mfgDate: '', bestBefore: '', expiryDate: '' };
                                        const calculatedExpiry = dates.mfgDate && dates.bestBefore
                                            ? new Date(new Date(dates.mfgDate).getTime() + parseInt(dates.bestBefore) * 86400000)
                                                .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                            : null;
                                        const displayExpiry = dates.expiryDate
                                            ? new Date(dates.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                            : calculatedExpiry;

                                        return (
                                            <Box key={item.product_id} sx={{
                                                p: 1.5, mb: 1, borderRadius: 2,
                                                border: '1px solid #e2e8f0', bgcolor: '#fafbfc',
                                            }}>
                                                <Typography fontWeight={600} variant="body2" sx={{ mb: 1 }}>
                                                    {item.product_name}
                                                    {item.variant_name && <span style={{ color: '#6366f1' }}> ({item.variant_name})</span>}
                                                </Typography>
                                                <TextField
                                                    label="Manufacturing Date *" type="date" size="small" fullWidth required
                                                    InputLabelProps={{ shrink: true }}
                                                    value={dates.mfgDate}
                                                    onChange={e => setItemDates(prev => ({
                                                        ...prev,
                                                        [item.product_id]: { ...dates, mfgDate: e.target.value }
                                                    }))}
                                                    sx={{ mb: 1 }}
                                                />
                                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                                    <TextField
                                                        label="Best Before (days)" type="number" size="small"
                                                        value={dates.bestBefore}
                                                        disabled={!!dates.expiryDate}
                                                        onChange={e => setItemDates(prev => ({
                                                            ...prev,
                                                            [item.product_id]: { ...dates, bestBefore: e.target.value }
                                                        }))}
                                                        placeholder="e.g. 180"
                                                        sx={{ flex: 1 }}
                                                    />
                                                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>OR</Typography>
                                                    <TextField
                                                        label="Expiry Date" type="date" size="small"
                                                        InputLabelProps={{ shrink: true }}
                                                        value={dates.expiryDate}
                                                        disabled={!!dates.bestBefore}
                                                        onChange={e => setItemDates(prev => ({
                                                            ...prev,
                                                            [item.product_id]: { ...dates, expiryDate: e.target.value }
                                                        }))}
                                                        sx={{ flex: 1 }}
                                                    />
                                                </Box>
                                                {displayExpiry && (
                                                    <Typography variant="caption" sx={{ mt: 0.5, display: 'block', color: '#16a34a', fontWeight: 600 }}>
                                                        Expiry: {displayExpiry}
                                                    </Typography>
                                                )}
                                            </Box>
                                        );
                                    })}
                                </Box>
                            );
                        })()}
                    </Box>
                )}

                {/* Completion */}
                {completed && completionResult && (
                    <Box sx={{ textAlign: 'center', py: 3 }}>
                        <ApproveIcon sx={{ fontSize: 64, color: '#16a34a', mb: 1 }} />
                        <Typography variant="h6" fontWeight={700}>Stock Received Successfully!</Typography>
                        <Typography color="text.secondary" sx={{ mb: 2 }}>
                            {completionResult.approved_count} item{completionResult.approved_count !== 1 ? 's' : ''} added to inventory
                            {completionResult.rejected_count > 0 && `, ${completionResult.rejected_count} rejected`}
                        </Typography>
                        <Chip label={`PO Status: ${completionResult.po_status}`}
                            sx={{
                                fontWeight: 600,
                                bgcolor: completionResult.po_status === 'received' ? '#dcfce7' : '#fef3c7',
                                color: completionResult.po_status === 'received' ? '#166534' : '#92400e',
                            }}
                        />
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2, gap: 1 }}>
                {!completed ? (
                    <>
                        {activeStep > 0 && (
                            <Button onClick={() => setActiveStep(s => s - 1)} startIcon={<BackIcon />}
                                sx={{ fontWeight: 600, textTransform: 'none' }}>Back</Button>
                        )}
                        <Box sx={{ flex: 1 }} />
                        {activeStep === 0 && (
                            <Button variant="contained" onClick={handleStartGRN}
                                disabled={loading || !invoiceNo.trim()} endIcon={loading ? <CircularProgress size={18} /> : <NextIcon />}
                                sx={{
                                    fontWeight: 600, textTransform: 'none', borderRadius: 2,
                                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)'
                                }}>
                                Start GRN
                            </Button>
                        )}
                        {activeStep === 1 && (
                            <Button variant="contained" onClick={() => setActiveStep(2)}
                                disabled={!grnData || grnData.scanned_items.length === 0} endIcon={<NextIcon />}
                                sx={{
                                    fontWeight: 600, textTransform: 'none', borderRadius: 2,
                                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)'
                                }}>
                                Proceed to QA
                            </Button>
                        )}
                        {activeStep === 2 && (
                            <Button variant="contained" onClick={handleQASubmit}
                                disabled={loading} endIcon={loading ? <CircularProgress size={18} /> : <NextIcon />}
                                sx={{
                                    fontWeight: 600, textTransform: 'none', borderRadius: 2,
                                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)'
                                }}>
                                Submit QA
                            </Button>
                        )}
                        {activeStep === 3 && (
                            <Button variant="contained" onClick={handleConfirm}
                                disabled={loading || !selectedWarehouse}
                                startIcon={loading ? <CircularProgress size={18} /> : <WarehouseIcon />}
                                sx={{
                                    fontWeight: 600, textTransform: 'none', borderRadius: 2,
                                    background: 'linear-gradient(135deg, #16a34a, #15803d)'
                                }}>
                                Receive Into Inventory
                            </Button>
                        )}
                    </>
                ) : (
                    <Button variant="contained" onClick={handleClose}
                        sx={{
                            fontWeight: 600, textTransform: 'none', borderRadius: 2, px: 4,
                            background: 'linear-gradient(135deg, #6366f1, #4f46e5)'
                        }}>
                        Done
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};
