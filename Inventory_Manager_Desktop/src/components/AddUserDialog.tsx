import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Tabs, Tab, MenuItem, Alert
} from '@mui/material';
import { registerStaff, createCustomer } from '../services/userService';

interface AddUserDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialTab?: number;
  // NEW: Optional callback to return created customer data (for billing page integration)
  onCustomerCreated?: (customer: { id: number; name: string; phone: string; email?: string }) => void;
}

export const AddUserDialog: React.FC<AddUserDialogProps> = ({
  open, onClose, onSuccess, initialTab = 0, onCustomerCreated
}) => {
  const [tabValue, setTabValue] = useState(0); // 0 = Staff, 1 = Customer
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // --- NEW: Sync internal tab state with the prop when the dialog opens ---
  useEffect(() => {
    if (open) {
      setTabValue(initialTab);
      // Optional: Clear form data when reopening if desired
      setFormData({ username: '', email: '', password: '', phone_number: '', role: 'employee' });
      setError('');
    }
  }, [open, initialTab]);

  // Form States
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    phone_number: '',
    role: 'employee'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      if (tabValue === 0) {
        // Register Staff
        await registerStaff({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          phone_number: formData.phone_number
        });
      } else {
        // Create Customer
        const response = await createCustomer({
          name: formData.username, // Reusing username field as 'name' for customer
          phone_number: formData.phone_number,
          email: formData.email
        });

        // NEW: If callback provided, pass the created customer data
        if (onCustomerCreated && response?.customer) {
          onCustomerCreated({
            id: response.customer.id,
            name: response.customer.name,
            phone: response.customer.phone,
            email: response.customer.email
          });
        }
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Add New User
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mt: 1 }}>
          <Tab label="Staff Member" />
          <Tab label="Loyalty Customer" />
        </Tabs>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* Shared Fields */}
          <TextField
            label={tabValue === 0 ? "Username" : "Customer Name"}
            name="username"
            value={formData.username}
            onChange={handleChange}
            fullWidth required
          />

          <TextField
            label="Phone Number"
            name="phone_number"
            value={formData.phone_number}
            onChange={handleChange}
            fullWidth required
          />

          <TextField
            label="Email (Optional)"
            name="email"
            value={formData.email}
            onChange={handleChange}
            fullWidth
          />

          {/* Staff Only Fields */}
          {tabValue === 0 && (
            <>
              <TextField
                label="Password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                fullWidth required
              />
              <TextField
                select
                label="Role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                fullWidth
              >
                <MenuItem value="employee">Employee</MenuItem>
                <MenuItem value="manager">Manager</MenuItem>
                <MenuItem value="it_admin">IT Admin</MenuItem>
              </TextField>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading}>
          {loading ? 'Creating...' : (tabValue === 0 ? 'Register Staff' : 'Add Customer')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};