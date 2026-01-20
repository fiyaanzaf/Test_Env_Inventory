import React, { useState } from 'react';
import { 
    Dialog, DialogTitle, DialogContent, DialogActions, 
    Button, TextField, Typography, Box, CircularProgress 
} from '@mui/material';
import client from '../api/client';

interface AddToDraftDialogProps {
    open: boolean;
    onClose: () => void;
    item: {
        product_id: number;
        product_name: string;
        draft_order_id?: number | null;
        supplier_name?: string;
        average_cost?: number;
        reorder_level?: number;
        current_stock?: number;
    } | null;
    onSuccess: () => void;
}

export const AddToDraftDialog: React.FC<AddToDraftDialogProps> = ({ open, onClose, item, onSuccess }) => {
    const [quantity, setQuantity] = useState<number>(0);
    const [loading, setLoading] = useState(false);

    // Reset quantity when dialog opens
    React.useEffect(() => {
        if (open && item) {
            const suggested = Math.max((item.reorder_level || 0) - (item.current_stock || 0), 10);
            setQuantity(suggested);
        }
    }, [open, item]);

    const handleSubmit = async () => {
        if (!item || !item.draft_order_id) return;

        setLoading(true);
        try {
            const token = localStorage.getItem('user_token');
            
            // FIX: Wrapped the payload in an "items" array to match Backend Schema
            await client.post(`/api/v1/purchases/${item.draft_order_id}/items`, {
                items: [
                    {
                        product_id: item.product_id,
                        quantity: Number(quantity),
                        unit_cost: item.average_cost || 0
                    }
                ]
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Failed to add to draft', error);
            // Log the actual error detail from backend to help debugging
            const msg = error.response?.data?.detail;
            alert(typeof msg === 'object' ? JSON.stringify(msg) : msg || 'Failed to add item to order.');
        } finally {
            setLoading(false);
        }
    };

    if (!item) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Add to Order #{item.draft_order_id}</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        Product: <strong>{item.product_name}</strong><br/>
                        Supplier: {item.supplier_name}
                    </Typography>
                    <TextField
                        label="Quantity to Add"
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                        fullWidth
                        autoFocus
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="inherit">Cancel</Button>
                <Button 
                    onClick={handleSubmit} 
                    variant="contained" 
                    color="primary"
                    disabled={loading || quantity <= 0}
                    startIcon={loading && <CircularProgress size={16} color="inherit"/>}
                >
                    {loading ? 'Adding...' : 'Add to Order'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};