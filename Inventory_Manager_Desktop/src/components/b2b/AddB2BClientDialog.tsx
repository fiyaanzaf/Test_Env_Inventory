import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Grid, MenuItem, Box, Typography,
  InputAdornment, Alert
} from '@mui/material';
import {
  Business as BusinessIcon,
  Person as PersonIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Receipt as GstIcon,
  LocationOn as AddressIcon
} from '@mui/icons-material';
import { b2bService } from '../../services/b2bService';
import type { B2BClientCreate } from '../../services/b2bService';

interface AddB2BClientDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddB2BClientDialog: React.FC<AddB2BClientDialogProps> = ({
  open,
  onClose,
  onSuccess
}) => {
  const [formData, setFormData] = useState<B2BClientCreate>({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    gstin: '',
    address: '',
    credit_limit: 10000,
    price_tier: 'standard'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof B2BClientCreate) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData({ ...formData, [field]: e.target.value });
    setError(null);
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError('Business name is required');
      return false;
    }
    if (!formData.phone.trim()) {
      setError('Phone number is required');
      return false;
    }
    if (formData.phone.length < 10) {
      setError('Phone number must be at least 10 digits');
      return false;
    }
    if (formData.gstin && formData.gstin.length !== 15) {
      setError('GSTIN must be exactly 15 characters');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      await b2bService.createClient(formData);
      onSuccess();
      handleClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create client');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      contact_person: '',
      phone: '',
      email: '',
      gstin: '',
      address: '',
      credit_limit: 10000,
      price_tier: 'standard'
    });
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <BusinessIcon color="primary" />
        Add B2B Client
      </DialogTitle>
      
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          {/* Business Name */}
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              required
              label="Business Name"
              value={formData.name}
              onChange={handleChange('name')}
              placeholder="e.g., Sharma Tea Stall"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <BusinessIcon color="action" />
                  </InputAdornment>
                )
              }}
            />
          </Grid>

          {/* Contact Person */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Contact Person"
              value={formData.contact_person}
              onChange={handleChange('contact_person')}
              placeholder="e.g., Raju"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PersonIcon color="action" />
                  </InputAdornment>
                )
              }}
            />
          </Grid>

          {/* Phone */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              required
              label="Phone Number"
              value={formData.phone}
              onChange={handleChange('phone')}
              placeholder="9876543210"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PhoneIcon color="action" />
                  </InputAdornment>
                )
              }}
            />
          </Grid>

          {/* Email */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="email"
              label="Email"
              value={formData.email}
              onChange={handleChange('email')}
              placeholder="business@example.com"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailIcon color="action" />
                  </InputAdornment>
                )
              }}
            />
          </Grid>

          {/* GSTIN */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="GSTIN (Optional)"
              value={formData.gstin}
              onChange={handleChange('gstin')}
              placeholder="22AAAAA0000A1Z5"
              inputProps={{ maxLength: 15 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <GstIcon color="action" />
                  </InputAdornment>
                )
              }}
            />
          </Grid>

          {/* Credit Limit */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="number"
              label="Credit Limit"
              value={formData.credit_limit}
              onChange={handleChange('credit_limit')}
              InputProps={{
                startAdornment: <InputAdornment position="start">₹</InputAdornment>
              }}
            />
          </Grid>

          {/* Price Tier */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              select
              label="Price Tier"
              value={formData.price_tier}
              onChange={handleChange('price_tier')}
            >
              <MenuItem value="gold">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#f59e0b' }} />
                  Gold (Best Prices)
                </Box>
              </MenuItem>
              <MenuItem value="silver">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#9ca3af' }} />
                  Silver
                </Box>
              </MenuItem>
              <MenuItem value="standard">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#3b82f6' }} />
                  Standard
                </Box>
              </MenuItem>
            </TextField>
          </Grid>

          {/* Address */}
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Address"
              value={formData.address}
              onChange={handleChange('address')}
              placeholder="Full address..."
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1.5 }}>
                    <AddressIcon color="action" />
                  </InputAdornment>
                )
              }}
            />
          </Grid>
        </Grid>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          * Phone number will be used for WhatsApp communication
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Creating...' : 'Add Client'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddB2BClientDialog;
