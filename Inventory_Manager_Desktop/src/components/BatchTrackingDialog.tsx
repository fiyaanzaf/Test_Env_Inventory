import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Box, TextField, MenuItem,
    Alert, CircularProgress, Divider
} from '@mui/material';
import { getVariantsForProduct, type Variant } from '../services/variantService';
import { createBatchTracking, type CreateBatchData } from '../services/batchService';
import { getSuppliers, type Supplier } from '../services/catalogService';

interface BatchItem {
    product_id: number;
    product_name: string;
    variant_id: number | null;
    variant_name: string | null;
    quantity: number;
}

export interface CreatedBatchInfo {
    product_id: number;
    variant_id: number | null;
    tracking_batch_id: number;
}

interface Props {
    open: boolean;
    onClose: () => void;
    poId: number;
    supplierId: number;
    items: BatchItem[];
    onSuccess: (batchResults: CreatedBatchInfo[]) => void;
}

interface BatchFormData {
    manufacturing_date: string;
    expiry_date: string;
    procurement_price: string;
    state_of_origin: string;
    batch_description: string;
    variant_id: string;
}

export const BatchTrackingDialog: React.FC<Props> = ({ open, onClose, poId, supplierId, items, onSuccess }) => {
    const [batchForms, setBatchForms] = useState<BatchFormData[]>([]);
    const [variants, setVariants] = useState<Record<number, Variant[]>>({});
    const [supplier, setSupplier] = useState<Supplier | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        if (!open || items.length === 0) return;

        setLoading(true);
        setError('');
        setSuccess('');

        // Initialize forms for each item
        const forms: BatchFormData[] = items.map(item => ({
            manufacturing_date: '',
            expiry_date: '',
            procurement_price: '',
            state_of_origin: '',
            batch_description: '',
            variant_id: item.variant_id?.toString() || ''
        }));
        setBatchForms(forms);

        // Fetch supplier info for state_of_origin
        const fetchData = async () => {
            try {
                const suppliers = await getSuppliers();
                const sup = suppliers.find(s => s.id === supplierId);
                if (sup) {
                    setSupplier(sup);
                    // Auto-fill state_of_origin from supplier location
                    if (sup.location) {
                        const updated = forms.map(f => ({ ...f, state_of_origin: sup.location || '' }));
                        setBatchForms(updated);
                    }
                }

                // Fetch variants for each unique product
                const uniqueProductIds = [...new Set(items.map(i => i.product_id))];
                const variantMap: Record<number, Variant[]> = {};
                for (const pid of uniqueProductIds) {
                    try {
                        const v = await getVariantsForProduct(pid);
                        variantMap[pid] = v;
                    } catch {
                        variantMap[pid] = [];
                    }
                }
                setVariants(variantMap);
            } catch (err) {
                console.error('Failed to load data', err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [open, items, supplierId]);

    const updateForm = (index: number, field: keyof BatchFormData, value: string) => {
        setBatchForms(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const handleSubmit = async () => {
        setSaving(true);
        setError('');

        try {
            // Create batch tracking entries for each item and collect results
            const batchResults: CreatedBatchInfo[] = [];

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const form = batchForms[i];

                const selectedVariantId = form.variant_id ? parseInt(form.variant_id) : null;

                const data: CreateBatchData = {
                    product_id: item.product_id,
                    variant_id: selectedVariantId ?? undefined,
                    supplier_id: supplierId,
                    manufacturing_date: form.manufacturing_date || undefined,
                    expiry_date: form.expiry_date || undefined,
                    procurement_price: form.procurement_price ? parseFloat(form.procurement_price) : undefined,
                    state_of_origin: form.state_of_origin || undefined,
                    batch_description: form.batch_description || undefined,
                    po_id: poId
                };

                const created = await createBatchTracking(data);
                batchResults.push({
                    product_id: item.product_id,
                    variant_id: selectedVariantId,
                    tracking_batch_id: created.id
                });
            }

            setSuccess(`Created ${items.length} batch tracking entr${items.length > 1 ? 'ies' : 'y'} successfully!`);
            setTimeout(() => {
                onSuccess(batchResults);
                onClose();
            }, 1200);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to create batch entries');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
            <DialogTitle sx={{ pb: 1 }}>
                <Typography variant="h5" fontWeight={700}>📦 Batch Tracking</Typography>
                <Typography variant="body2" color="text.secondary">
                    PO #{poId} — Fill in batch details for {items.length} item{items.length > 1 ? 's' : ''}
                </Typography>
            </DialogTitle>

            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
                        {items.map((item, idx) => (
                            <Box key={idx}>
                                {idx > 0 && <Divider sx={{ mb: 2 }} />}

                                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
                                    {item.product_name}
                                    {item.variant_name && <Typography component="span" color="primary" sx={{ ml: 1 }}>({item.variant_name})</Typography>}
                                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                        Qty: {item.quantity}
                                    </Typography>
                                </Typography>

                                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                                    {/* Variant Selector — read-only if already chosen during order */}
                                    {(variants[item.product_id]?.length ?? 0) > 0 && (
                                        <TextField
                                            select label="Variant" size="small"
                                            value={batchForms[idx]?.variant_id || ''}
                                            onChange={e => updateForm(idx, 'variant_id', e.target.value)}
                                            disabled={!!item.variant_id}
                                            helperText={item.variant_id ? 'Pre-selected from order' : undefined}
                                            sx={{ gridColumn: 'span 2' }}
                                        >
                                            <MenuItem value="">No Variant (Base Product)</MenuItem>
                                            {variants[item.product_id]?.map(v => (
                                                <MenuItem key={v.id} value={v.id}>{v.variant_name} {v.variant_sku ? `(${v.variant_sku})` : ''}</MenuItem>
                                            ))}
                                        </TextField>
                                    )}

                                    <TextField
                                        label="Manufacturing Date" type="date" size="small"
                                        InputLabelProps={{ shrink: true }}
                                        value={batchForms[idx]?.manufacturing_date || ''}
                                        onChange={e => updateForm(idx, 'manufacturing_date', e.target.value)}
                                    />
                                    <TextField
                                        label="Expiry Date" type="date" size="small"
                                        InputLabelProps={{ shrink: true }}
                                        value={batchForms[idx]?.expiry_date || ''}
                                        onChange={e => updateForm(idx, 'expiry_date', e.target.value)}
                                    />
                                    <TextField
                                        label="Procurement Price (₹)" type="number" size="small"
                                        value={batchForms[idx]?.procurement_price || ''}
                                        onChange={e => updateForm(idx, 'procurement_price', e.target.value)}
                                    />
                                    <TextField
                                        label="State of Origin" size="small"
                                        value={batchForms[idx]?.state_of_origin || ''}
                                        onChange={e => updateForm(idx, 'state_of_origin', e.target.value)}
                                        helperText={supplier?.location ? `Auto-filled from supplier: ${supplier.location}` : ''}
                                    />
                                    <TextField
                                        label="Batch Description" size="small" multiline rows={2}
                                        value={batchForms[idx]?.batch_description || ''}
                                        onChange={e => updateForm(idx, 'batch_description', e.target.value)}
                                        sx={{ gridColumn: 'span 2' }}
                                        placeholder="e.g. First shipment of summer 2026 batch"
                                    />
                                </Box>
                            </Box>
                        ))}
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2, gap: 1 }}>
                <Button onClick={onClose} color="inherit" sx={{ fontWeight: 600 }}>Skip</Button>
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    disabled={saving}
                    sx={{
                        px: 4, py: 1, borderRadius: 2, textTransform: 'none', fontWeight: 600,
                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                        '&:hover': { background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)' }
                    }}
                >
                    {saving ? 'Saving...' : `Create ${items.length} Batch Entr${items.length > 1 ? 'ies' : 'y'}`}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
