import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Grid, MenuItem,
  InputAdornment, Alert, CircularProgress
} from '@mui/material';
import {
  Edit as EditIcon,
  Business as BusinessIcon,
  Person as PersonIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Receipt as GstIcon,
  LocationOn as AddressIcon
} from '@mui/icons-material';
import { b2bService } from '../../services/b2bService';
import type { B2BClient, B2BClientUpdate } from '../../services/b2bService';

interface EditB2BClientDialogProps {
  open: boolean;
  client: B2BClient | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditB2BClientDialog: React.FC<EditB2BClientDialogProps> = ({
  open,
  client,
  onClose,
  onSuccess
}) => {
  const [formData, setFormData] = useState<B2BClientUpdate>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client && open) {
      setFormData({
        name: client.name,
        contact_person: client.contact_person || '',
        phone: client.phone,
        email: client.email || '',
        gstin: client.gstin || '',
        address: client.address || '',
        credit_limit: client.credit_limit,
        price_tier: client.price_tier
      });
      setError(null);
    }
  }, [client, open]);

  const handleChange = (field: keyof B2BClientUpdate) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData({ ...formData, [field]: e.target.value });
    setError(null);
  };

  const validateForm = (): boolean => {
    if (!formData.name?.trim()) {
      setError('Business name is required');
      return false;
    }
    if (!formData.phone?.trim()) {
      setError('Phone number is required');
      return false;
    }
    if (formData.phone && formData.phone.length < 10) {
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
    if (!validateForm() || !client) return;

    setLoading(true);
    setError(null);

    try {
      await b2bService.updateClient(client.id, formData);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update client');
    } finally {
      setLoading(false);
    }
  };

  if (!client) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <EditIcon color="primary" />
        Edit Client Info
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
              value={formData.name || ''}
              onChange={handleChange('name')}
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
              value={formData.contact_person || ''}
              onChange={handleChange('contact_person')}
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
              label="Phone"
              value={formData.phone || ''}
              onChange={handleChange('phone')}
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
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={formData.email || ''}
              onChange={handleChange('email')}
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
              label="GSTIN"
              value={formData.gstin || ''}
              onChange={handleChange('gstin')}
              placeholder="e.g. 22AAAAA0000A1Z5"
              inputProps={{ maxLength: 15, style: { textTransform: 'uppercase' } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <GstIcon color="action" />
                  </InputAdornment>
                )
              }}
            />
          </Grid>

          {/* Price Tier */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              select
              label="Price Tier"
              value={formData.price_tier || 'standard'}
              onChange={handleChange('price_tier')}
            >
              <MenuItem value="gold">🥇 Gold (Best Prices)</MenuItem>
              <MenuItem value="silver">🥈 Silver</MenuItem>
              <MenuItem value="standard">📦 Standard</MenuItem>
            </TextField>
          </Grid>

          {/* Credit Limit */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Credit Limit"
              type="number"
              value={formData.credit_limit || 0}
              onChange={(e) => setFormData({ ...formData, credit_limit: Number(e.target.value) })}
              InputProps={{
                startAdornment: <InputAdornment position="start">₹</InputAdornment>
              }}
            />
          </Grid>

          {/* Address */}
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Address"
              value={formData.address || ''}
              onChange={handleChange('address')}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AddressIcon color="action" />
                  </InputAdornment>
                )
              }}
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <EditIcon />}
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditB2BClientDialog;
