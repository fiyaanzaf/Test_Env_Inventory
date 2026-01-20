import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Button, Box, Alert, Typography, MenuItem
} from '@mui/material';
import { createLocation, type CreateLocationData } from '../services/catalogService';

interface AddLocationDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const AddLocationDialog: React.FC<AddLocationDialogProps> = ({ open, onClose, onSuccess }) => {
    const [formData, setFormData] = useState<CreateLocationData>({
        name: '',
        type: 'store', // Default
        description: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async () => {
        if (!formData.name) {
            setError("Location name is required.");
            return;
        }

        setLoading(true);
        setError('');
        try {
            await createLocation(formData);
            onSuccess();
            onClose();
            setFormData({ name: '', type: 'store', description: '' }); // Reset
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.detail || "Failed to create location.");
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
                    Add New Location
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Create a new store, warehouse, or site
                </Typography>
            </DialogTitle>

            <DialogContent>
                <Box component="form" sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

                    <TextField
                        label="Location Name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        fullWidth
                        placeholder="e.g. Downtown Warehouse"
                    />

                    <TextField
                        select
                        label="Type"
                        name="type"
                        value={formData.type}
                        onChange={handleChange}
                        fullWidth
                    >
                        <MenuItem value="store">Store</MenuItem>
                        <MenuItem value="warehouse">Warehouse</MenuItem>
                        <MenuItem value="showroom">Showroom</MenuItem>
                    </TextField>

                    <TextField
                        label="Description"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        multiline
                        rows={3}
                        fullWidth
                        placeholder="Optional details..."
                    />
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
                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                        '&:hover': {
                            background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                            boxShadow: '0 6px 15px rgba(99, 102, 241, 0.4)',
                        }
                    }}
                >
                    {loading ? 'Adding...' : 'Add Location'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
