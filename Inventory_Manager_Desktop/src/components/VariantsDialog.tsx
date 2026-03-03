import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Box, TextField, IconButton, Chip,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, Alert, CircularProgress, Tooltip
} from '@mui/material';
import {
    Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
    Save as SaveIcon, Close as CloseIcon
} from '@mui/icons-material';
import {
    getVariantsForProduct, createVariant, updateVariant, deleteVariant,
    type Variant, type CreateVariantData
} from '../services/variantService';

interface Props {
    open: boolean;
    onClose: () => void;
    productId: number | null;
    productName: string;
    onUpdate?: () => void;
}

export const VariantsDialog: React.FC<Props> = ({ open, onClose, productId, productName, onUpdate }) => {
    const [variants, setVariants] = useState<Variant[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Add form state
    const [newVariant, setNewVariant] = useState<CreateVariantData>({
        variant_name: '', variant_sku: '', variant_barcode: '',
        selling_price: undefined, average_cost: undefined, unit_of_measure: ''
    });

    // Edit form state
    const [editData, setEditData] = useState<CreateVariantData>({
        variant_name: '', variant_sku: '', variant_barcode: '',
        selling_price: undefined, average_cost: undefined, unit_of_measure: ''
    });

    const loadVariants = async () => {
        if (!productId) return;
        setLoading(true);
        try {
            const data = await getVariantsForProduct(productId);
            setVariants(data);
            setError('');
        } catch {
            setError('Failed to load variants');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open && productId) loadVariants();
    }, [open, productId]);

    const handleAdd = async () => {
        if (!productId || !newVariant.variant_name.trim()) {
            setError('Variant name is required');
            return;
        }
        try {
            await createVariant(productId, newVariant);
            setNewVariant({ variant_name: '', variant_sku: '', variant_barcode: '', selling_price: undefined, average_cost: undefined, unit_of_measure: '' });
            setIsAdding(false);
            loadVariants();
            onUpdate?.();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to create variant');
        }
    };

    const handleEdit = (v: Variant) => {
        setEditingId(v.id);
        setEditData({
            variant_name: v.variant_name,
            variant_sku: v.variant_sku || '',
            variant_barcode: v.variant_barcode || '',
            selling_price: v.selling_price ?? undefined,
            average_cost: v.average_cost ?? undefined,
            unit_of_measure: v.unit_of_measure || ''
        });
    };

    const handleSaveEdit = async () => {
        if (!editingId) return;
        try {
            await updateVariant(editingId, editData);
            setEditingId(null);
            loadVariants();
            onUpdate?.();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to update variant');
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Delete this variant?')) return;
        try {
            await deleteVariant(id);
            loadVariants();
            onUpdate?.();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to delete');
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
            <DialogTitle sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="h5" fontWeight={700}>Manage Variants</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {productName} — {variants.length} variant{variants.length !== 1 ? 's' : ''}
                        </Typography>
                    </Box>
                    <Button
                        startIcon={<AddIcon />}
                        variant="contained"
                        onClick={() => setIsAdding(true)}
                        disabled={isAdding}
                        sx={{
                            borderRadius: 2, textTransform: 'none', fontWeight: 600,
                            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                        }}
                    >
                        Add Variant
                    </Button>
                </Box>
            </DialogTitle>

            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>{error}</Alert>}

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
                ) : (
                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                        <Table size="small">
                            <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 600 }}>Variant Name</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>SKU</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>Barcode</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }} align="right">Sell Price</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }} align="right">Avg Cost</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>UOM</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }} align="center">Stock</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }} align="center">Status</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }} width={120}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {/* Add New Row */}
                                {isAdding && (
                                    <TableRow sx={{ bgcolor: '#f0fdf4' }}>
                                        <TableCell>
                                            <TextField size="small" placeholder="e.g. 5 Slice Pack" value={newVariant.variant_name}
                                                onChange={e => setNewVariant({ ...newVariant, variant_name: e.target.value })} fullWidth autoFocus />
                                        </TableCell>
                                        <TableCell>
                                            <TextField size="small" placeholder="SKU" value={newVariant.variant_sku}
                                                onChange={e => setNewVariant({ ...newVariant, variant_sku: e.target.value })} sx={{ width: 100 }} />
                                        </TableCell>
                                        <TableCell>
                                            <TextField size="small" placeholder="Barcode" value={newVariant.variant_barcode}
                                                onChange={e => setNewVariant({ ...newVariant, variant_barcode: e.target.value })} sx={{ width: 100 }} />
                                        </TableCell>
                                        <TableCell>
                                            <TextField size="small" type="number" placeholder="₹" value={newVariant.selling_price ?? ''}
                                                onChange={e => setNewVariant({ ...newVariant, selling_price: e.target.value ? parseFloat(e.target.value) : undefined })} sx={{ width: 80 }} />
                                        </TableCell>
                                        <TableCell>
                                            <TextField size="small" type="number" placeholder="₹" value={newVariant.average_cost ?? ''}
                                                onChange={e => setNewVariant({ ...newVariant, average_cost: e.target.value ? parseFloat(e.target.value) : undefined })} sx={{ width: 80 }} />
                                        </TableCell>
                                        <TableCell>
                                            <TextField size="small" placeholder="Pack" value={newVariant.unit_of_measure}
                                                onChange={e => setNewVariant({ ...newVariant, unit_of_measure: e.target.value })} sx={{ width: 70 }} />
                                        </TableCell>
                                        <TableCell align="center">—</TableCell>
                                        <TableCell align="center">—</TableCell>
                                        <TableCell>
                                            <IconButton size="small" color="success" onClick={handleAdd}><SaveIcon fontSize="small" /></IconButton>
                                            <IconButton size="small" onClick={() => setIsAdding(false)}><CloseIcon fontSize="small" /></IconButton>
                                        </TableCell>
                                    </TableRow>
                                )}

                                {/* Variant Rows */}
                                {variants.map(v => (
                                    <TableRow key={v.id} sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                                        {editingId === v.id ? (
                                            <>
                                                <TableCell>
                                                    <TextField size="small" value={editData.variant_name}
                                                        onChange={e => setEditData({ ...editData, variant_name: e.target.value })} fullWidth />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField size="small" value={editData.variant_sku}
                                                        onChange={e => setEditData({ ...editData, variant_sku: e.target.value })} sx={{ width: 100 }} />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField size="small" value={editData.variant_barcode}
                                                        onChange={e => setEditData({ ...editData, variant_barcode: e.target.value })} sx={{ width: 100 }} />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField size="small" type="number" value={editData.selling_price ?? ''}
                                                        onChange={e => setEditData({ ...editData, selling_price: e.target.value ? parseFloat(e.target.value) : undefined })} sx={{ width: 80 }} />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField size="small" type="number" value={editData.average_cost ?? ''}
                                                        onChange={e => setEditData({ ...editData, average_cost: e.target.value ? parseFloat(e.target.value) : undefined })} sx={{ width: 80 }} />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField size="small" value={editData.unit_of_measure}
                                                        onChange={e => setEditData({ ...editData, unit_of_measure: e.target.value })} sx={{ width: 70 }} />
                                                </TableCell>
                                                <TableCell align="center">{v.total_quantity}</TableCell>
                                                <TableCell align="center">—</TableCell>
                                                <TableCell>
                                                    <IconButton size="small" color="success" onClick={handleSaveEdit}><SaveIcon fontSize="small" /></IconButton>
                                                    <IconButton size="small" onClick={() => setEditingId(null)}><CloseIcon fontSize="small" /></IconButton>
                                                </TableCell>
                                            </>
                                        ) : (
                                            <>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight={500}>{v.variant_name}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    {v.variant_sku && <Chip label={v.variant_sku} size="small" sx={{ bgcolor: '#e0e7ff', color: '#4338ca', fontWeight: 600, borderRadius: 1 }} />}
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="caption" color="text.secondary">{v.variant_barcode || '—'}</Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    {v.selling_price != null ? <Typography variant="body2" fontWeight={600} color="success.main">₹{v.selling_price}</Typography> : '—'}
                                                </TableCell>
                                                <TableCell align="right">
                                                    {v.average_cost != null ? <Typography variant="caption" color="text.secondary">₹{v.average_cost}</Typography> : '—'}
                                                </TableCell>
                                                <TableCell>{v.unit_of_measure || '—'}</TableCell>
                                                <TableCell align="center">
                                                    <Chip label={v.total_quantity} size="small"
                                                        color={v.total_quantity === 0 ? 'error' : v.total_quantity < 10 ? 'warning' : 'success'}
                                                        variant={v.total_quantity === 0 ? 'filled' : 'outlined'} sx={{ fontWeight: 'bold' }} />
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Chip label={v.is_active ? 'Active' : 'Inactive'} size="small"
                                                        color={v.is_active ? 'success' : 'default'} variant="outlined" sx={{ fontWeight: 500 }} />
                                                </TableCell>
                                                <TableCell>
                                                    <Tooltip title="Edit">
                                                        <IconButton size="small" onClick={() => handleEdit(v)} sx={{ color: '#6366f1' }}>
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Delete">
                                                        <IconButton size="small" onClick={() => handleDelete(v.id)} sx={{ color: 'error.main' }}>
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </TableCell>
                                            </>
                                        )}
                                    </TableRow>
                                ))}

                                {variants.length === 0 && !isAdding && (
                                    <TableRow>
                                        <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                                            <Typography variant="body2" color="text.secondary">
                                                No variants yet. Click "Add Variant" to create one.
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose} sx={{ fontWeight: 600 }}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};
