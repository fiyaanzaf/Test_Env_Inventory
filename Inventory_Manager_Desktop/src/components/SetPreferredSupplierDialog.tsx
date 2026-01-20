import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    CircularProgress,
    Typography,
    Box,
    Alert
} from '@mui/material';
import { getAllProducts, type Product } from '../services/productService';
import { setProductSupplierPreferred, getSuppliersForProduct, type ProductSupplier } from '../services/catalogService';

interface SetPreferredSupplierDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const SetPreferredSupplierDialog: React.FC<SetPreferredSupplierDialogProps> = ({
    open,
    onClose,
    onSuccess
}) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
    const [suppliers, setSuppliers] = useState<ProductSupplier[]>([]);
    const [selectedLinkId, setSelectedLinkId] = useState<number | ''>('');

    const [loadingProducts, setLoadingProducts] = useState(false);
    const [loadingSuppliers, setLoadingSuppliers] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Load products when dialog opens
    useEffect(() => {
        if (open) {
            setLoadingProducts(true);
            getAllProducts()
                .then(setProducts)
                .catch(() => setError('Failed to load products'))
                .finally(() => setLoadingProducts(false));

            // Reset state
            setSelectedProductId('');
            setSuppliers([]);
            setSelectedLinkId('');
            setError('');
        }
    }, [open]);

    // Load suppliers when a product is selected
    useEffect(() => {
        if (selectedProductId) {
            setLoadingSuppliers(true);
            getSuppliersForProduct(Number(selectedProductId))
                .then((data) => {
                    setSuppliers(data);
                    // Auto-select current preferred if exists
                    const currentPreferred = data.find(s => s.is_preferred);
                    if (currentPreferred) {
                        setSelectedLinkId(currentPreferred.link_id);
                    } else {
                        setSelectedLinkId('');
                    }
                })
                .catch(() => setError('Failed to load suppliers for this product'))
                .finally(() => setLoadingSuppliers(false));
        } else {
            setSuppliers([]);
            setSelectedLinkId('');
        }
    }, [selectedProductId]);

    const handleSave = async () => {
        if (!selectedLinkId) return;

        setSaving(true);
        setError('');
        try {
            await setProductSupplierPreferred(Number(selectedLinkId));
            onSuccess();
            onClose();
        } catch (err) {
            setError('Failed to set preferred supplier.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 'bold' }}>Set Preferred Supplier</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
                    {error && <Alert severity="error">{error}</Alert>}

                    <FormControl fullWidth>
                        <InputLabel>Select Product</InputLabel>
                        <Select
                            value={selectedProductId}
                            label="Select Product"
                            onChange={(e) => setSelectedProductId(e.target.value as number)}
                            disabled={loadingProducts}
                        >
                            {loadingProducts ? (
                                <MenuItem disabled><CircularProgress size={20} /></MenuItem>
                            ) : (
                                products.map((p) => (
                                    <MenuItem key={p.id} value={p.id}>
                                        {p.name} ({p.sku})
                                    </MenuItem>
                                ))
                            )}
                        </Select>
                    </FormControl>

                    {selectedProductId && (
                        <FormControl fullWidth>
                            <InputLabel>Select Preferred Supplier</InputLabel>
                            <Select
                                value={selectedLinkId}
                                label="Select Preferred Supplier"
                                onChange={(e) => setSelectedLinkId(e.target.value as number)}
                                disabled={loadingSuppliers || suppliers.length === 0}
                            >
                                {loadingSuppliers ? (
                                    <MenuItem disabled><CircularProgress size={20} /></MenuItem>
                                ) : suppliers.length === 0 ? (
                                    <MenuItem disabled>No suppliers linked to this product</MenuItem>
                                ) : (
                                    suppliers.map((s) => (
                                        <MenuItem key={s.link_id} value={s.link_id}>
                                            {s.name} - ₹{s.cost} {s.is_preferred ? '(Current Preferred)' : ''}
                                        </MenuItem>
                                    ))
                                )}
                            </Select>
                            {suppliers.length === 0 && !loadingSuppliers && (
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                                    Tip: Link a supplier first using the "Link Product" button.
                                </Typography>
                            )}
                        </FormControl>
                    )}
                </Box>
            </DialogContent>
            <DialogActions sx={{ p: 2.5 }}>
                <Button onClick={onClose} disabled={saving}>Cancel</Button>
                <Button
                    onClick={handleSave}
                    variant="contained"
                    disabled={!selectedLinkId || saving}
                    sx={{ fontWeight: 'bold' }}
                >
                    {saving ? 'Saving...' : 'Set Preferred'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
