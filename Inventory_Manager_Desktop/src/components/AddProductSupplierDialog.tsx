import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Button, Box, Alert, Typography, MenuItem, Autocomplete, CircularProgress
} from '@mui/material';
import { createProductSupplierLink } from '../services/catalogService';
import { getSuppliers } from '../services/catalogService';
import { getAllProducts } from '../services/productService';

interface AddProductSupplierDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const AddProductSupplierDialog: React.FC<AddProductSupplierDialogProps> = ({ open, onClose, onSuccess }) => {
    const [productId, setProductId] = useState<number | null>(null);
    const [supplierId, setSupplierId] = useState<number | null>(null);
    const [supplyPrice, setSupplyPrice] = useState('');
    const [supplierSku, setSupplierSku] = useState('');

    const [products, setProducts] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);

    const [loadingData, setLoadingData] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setLoadingData(true);
            Promise.all([getAllProducts(), getSuppliers()])
                .then(([pData, sData]) => {
                    setProducts(pData);
                    setSuppliers(sData);
                })
                .catch(() => setError("Failed to load products or suppliers"))
                .finally(() => setLoadingData(false));
        }
    }, [open]);

    const handleSubmit = async () => {
        if (!productId || !supplierId || !supplyPrice) {
            setError("Please fill in all required fields.");
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            await createProductSupplierLink({
                product_id: productId,
                supplier_id: supplierId,
                supply_price: parseFloat(supplyPrice),
                supplier_sku: supplierSku,
                is_preferred: false // Default to backup
            });
            onSuccess();
            onClose();
            // Reset
            setProductId(null);
            setSupplierId(null);
            setSupplyPrice('');
            setSupplierSku('');
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.detail || "Failed to create link.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
        >
            <DialogTitle sx={{ pb: 1 }}>
                <Typography variant="h5" fontWeight="700" color="text.primary">
                    Link Product to Supplier
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Add an alternative source or price for a product
                </Typography>
            </DialogTitle>

            <DialogContent>
                <Box component="form" sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

                    {loadingData ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress /></Box>
                    ) : (
                        <>
                            <Autocomplete
                                options={products}
                                getOptionLabel={(option) => `${option.name} (${option.sku})`}
                                onChange={(_, value) => setProductId(value ? value.id : null)}
                                renderInput={(params) => <TextField {...params} label="Select Product" required />}
                            />

                            <Autocomplete
                                options={suppliers}
                                getOptionLabel={(option) => option.name}
                                onChange={(_, value) => setSupplierId(value ? value.id : null)}
                                renderInput={(params) => <TextField {...params} label="Select Supplier" required />}
                            />

                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                                <TextField
                                    label="Supply Price (₹)"
                                    type="number"
                                    value={supplyPrice}
                                    onChange={(e) => setSupplyPrice(e.target.value)}
                                    required
                                    fullWidth
                                />
                                <TextField
                                    label="Supplier SKU (Optional)"
                                    value={supplierSku}
                                    onChange={(e) => setSupplierSku(e.target.value)}
                                    fullWidth
                                />
                            </Box>
                        </>
                    )}

                </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button onClick={onClose} color="inherit" sx={{ fontWeight: 600 }}>Cancel</Button>
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    disabled={submitting || loadingData}
                    sx={{
                        px: 4, py: 1, borderRadius: 2, textTransform: 'none', fontWeight: 600,
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', // Orange theme
                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                        '&:hover': {
                            background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                            boxShadow: '0 6px 15px rgba(245, 158, 11, 0.4)',
                        }
                    }}
                >
                    {submitting ? 'Linking...' : 'Create Link'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
