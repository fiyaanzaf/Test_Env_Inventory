import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Button, Box, Alert, Typography
} from '@mui/material';
import { createSupplier, type CreateSupplierData } from '../services/catalogService';

interface AddSupplierDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const AddSupplierDialog: React.FC<AddSupplierDialogProps> = ({ open, onClose, onSuccess }) => {
    const [formData, setFormData] = useState<CreateSupplierData>({
        name: '',
        location: '',
        contact_person: '',
        phone_number: '',
        email: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async () => {
        if (!formData.name) {
            setError("Supplier name is required.");
            return;
        }

        setLoading(true);
        setError('');
        try {
            await createSupplier(formData);
            onSuccess();
            onClose();
            // Reset
            setFormData({
                name: '', location: '', contact_person: '', phone_number: '', email: ''
            });
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.detail || "Failed to create supplier.");
        } finally {
            setLoading(false);
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
                    Add New Supplier
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Register a new vendor or partner
                </Typography>
            </DialogTitle>

            <DialogContent>
                <Box component="form" sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

                    <TextField
                        label="Supplier Name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        fullWidth
                        placeholder="e.g. Acme Corp"
                    />

                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                        <TextField
                            label="Contact Person"
                            name="contact_person"
                            value={formData.contact_person}
                            onChange={handleChange}
                            fullWidth
                        />
                        <TextField
                            label="Location / City"
                            name="location"
                            value={formData.location}
                            onChange={handleChange}
                            fullWidth
                        />
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                        <TextField
                            label="Phone Number"
                            name="phone_number"
                            value={formData.phone_number}
                            onChange={handleChange}
                            fullWidth
                        />
                        <TextField
                            label="Email Address"
                            name="email"
                            type="email"
                            value={formData.email}
                            onChange={handleChange}
                            fullWidth
                        />
                    </Box>
                </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button onClick={onClose} color="inherit" sx={{ fontWeight: 600 }}>Cancel</Button>
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    disabled={loading}
                    sx={{
                        px: 4, py: 1, borderRadius: 2, textTransform: 'none', fontWeight: 600,
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', // Green theme for suppliers
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                        '&:hover': {
                            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                            boxShadow: '0 6px 15px rgba(16, 185, 129, 0.4)',
                        }
                    }}
                >
                    {loading ? 'Adding...' : 'Add Supplier'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
