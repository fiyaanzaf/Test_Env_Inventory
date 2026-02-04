import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  InputAdornment,
  CircularProgress,
  Alert
} from '@mui/material';
import { createKhataCustomer, type KhataCustomerCreate } from '../../services/khataService';

interface AddKhataCustomerDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AddKhataCustomerDialog: React.FC<AddKhataCustomerDialogProps> = ({
  open,
  onClose,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<KhataCustomerCreate>({
    name: '',
    phone: '',
    email: '',
    address: '',
    credit_limit: 5000,
    notes: ''
  });

  const handleChange = (field: keyof KhataCustomerCreate) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [field]: field === 'credit_limit' ? Number(e.target.value) : e.target.value
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!formData.phone.trim()) {
      setError('Phone is required');
      return;
    }
    if (formData.phone.length < 10) {
      setError('Phone must be at least 10 digits');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await createKhataCustomer({
        ...formData,
        email: formData.email || undefined,
        address: formData.address || undefined,
        notes: formData.notes || undefined
      });
      setFormData({
        name: '',
        phone: '',
        email: '',
        address: '',
        credit_limit: 5000,
        notes: ''
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create customer';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setError(null);
      setFormData({
        name: '',
        phone: '',
        email: '',
        address: '',
        credit_limit: 5000,
        notes: ''
      });
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Khata Customer</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2, mt: 1 }}>
            {error}
          </Alert>
        )}
        
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Customer Name"
              value={formData.name}
              onChange={handleChange('name')}
              required
              autoFocus
            />
          </Grid>
          
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Phone Number"
              value={formData.phone}
              onChange={handleChange('phone')}
              required
              placeholder="9876543210"
              InputProps={{
                startAdornment: <InputAdornment position="start">+91</InputAdornment>
              }}
            />
          </Grid>
          
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Credit Limit"
              type="number"
              value={formData.credit_limit}
              onChange={handleChange('credit_limit')}
              InputProps={{
                startAdornment: <InputAdornment position="start">₹</InputAdornment>
              }}
            />
          </Grid>
          
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Email (Optional)"
              type="email"
              value={formData.email}
              onChange={handleChange('email')}
            />
          </Grid>
          
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Address (Optional)"
              value={formData.address}
              onChange={handleChange('address')}
              multiline
              rows={2}
            />
          </Grid>
          
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Notes (Optional)"
              value={formData.notes}
              onChange={handleChange('notes')}
              multiline
              rows={2}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button 
          variant="contained" 
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? <CircularProgress size={24} /> : 'Add Customer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddKhataCustomerDialog;
