import React, { useState, useMemo } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, MenuItem, Box, Typography, Alert, Chip
} from '@mui/material';
import { SwapHoriz as TransferIcon } from '@mui/icons-material';
import { transferBatch, type BatchTracking, type BatchTreeProduct } from '../services/batchService';

interface Props {
    open: boolean;
    onClose: () => void;
    sourceBatch: BatchTracking | null;
    treeData: BatchTreeProduct[];
    onSuccess: () => void;
}

export const BatchTransferDialog: React.FC<Props> = ({ open, onClose, sourceBatch, treeData, onSuccess }) => {
    const [destBatchId, setDestBatchId] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Get all possible destination batches (same product, different batch)
    const destOptions = useMemo(() => {
        if (!sourceBatch) return [];
        const options: BatchTracking[] = [];
        for (const product of treeData) {
            if (product.product_id === sourceBatch.product_id) {
                for (const variant of product.variants) {
                    for (const batch of variant.batches) {
                        if (batch.id !== sourceBatch.id) {
                            options.push(batch);
                        }
                    }
                }
            }
        }
        return options;
    }, [sourceBatch, treeData]);

    const handleTransfer = async () => {
        if (!sourceBatch || !destBatchId) return;
        if (quantity <= 0) { setError('Quantity must be positive'); return; }
        if (quantity > sourceBatch.stock_quantity) { setError(`Max available: ${sourceBatch.stock_quantity}`); return; }

        setLoading(true);
        setError('');
        try {
            await transferBatch(sourceBatch.id, parseInt(destBatchId), quantity);
            onSuccess();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Transfer failed');
        } finally {
            setLoading(false);
        }
    };

    if (!sourceBatch) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TransferIcon color="warning" /> Transfer Batch Stock
            </DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
                    {/* Source Info */}
                    <Box sx={{ p: 2, bgcolor: '#fef2f2', borderRadius: 2, border: '1px solid #fecaca' }}>
                        <Typography variant="subtitle2" color="error.dark">Source Batch</Typography>
                        <Typography variant="body2" fontFamily="monospace" fontWeight={600}>{sourceBatch.batch_code}</Typography>
                        <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                            <Chip label={`${sourceBatch.stock_quantity} units available`} size="small" color="error" variant="outlined" />
                            {sourceBatch.variant_name && <Chip label={sourceBatch.variant_name} size="small" variant="outlined" />}
                            {sourceBatch.product_name && <Chip label={sourceBatch.product_name} size="small" sx={{ bgcolor: '#eef2ff', color: '#4f46e5' }} />}
                        </Box>
                    </Box>

                    {/* Destination */}
                    <TextField
                        select
                        label="Destination Batch"
                        value={destBatchId}
                        onChange={(e) => setDestBatchId(e.target.value)}
                        fullWidth
                        helperText={destOptions.length === 0 ? 'No other batches for this product' : 'Select target batch'}
                    >
                        {destOptions.map(b => (
                            <MenuItem key={b.id} value={b.id}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                    <Typography variant="body2" fontFamily="monospace">{b.batch_code}</Typography>
                                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                                        {b.variant_name && <Chip label={b.variant_name} size="small" sx={{ fontSize: '0.7rem', height: 18 }} />}
                                        <Chip label={`${b.stock_quantity}u`} size="small" sx={{ fontSize: '0.7rem', height: 18, bgcolor: '#dcfce7', color: '#166534' }} />
                                    </Box>
                                </Box>
                            </MenuItem>
                        ))}
                    </TextField>

                    {/* Quantity */}
                    <TextField
                        label="Quantity to Transfer"
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                        fullWidth
                        InputProps={{ inputProps: { min: 1, max: sourceBatch.stock_quantity } }}
                        helperText={`Max: ${sourceBatch.stock_quantity} units`}
                    />

                    {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button onClick={onClose} color="inherit">Cancel</Button>
                <Button
                    variant="contained"
                    onClick={handleTransfer}
                    disabled={loading || !destBatchId || quantity <= 0}
                    startIcon={<TransferIcon />}
                    sx={{ bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' } }}
                >
                    {loading ? 'Transferring...' : 'Transfer'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
