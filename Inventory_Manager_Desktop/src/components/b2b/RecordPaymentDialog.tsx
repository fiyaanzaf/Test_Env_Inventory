import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Grid, MenuItem, Box, Typography,
  InputAdornment, Alert
} from '@mui/material';
import {
  Payment as PaymentIcon,
  AccountBalance as BankIcon
} from '@mui/icons-material';
import { b2bService } from '../../services/b2bService';
import type { RecordPaymentRequest, B2BClient } from '../../services/b2bService';

interface RecordPaymentDialogProps {
  open: boolean;
  client: B2BClient | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const RecordPaymentDialog: React.FC<RecordPaymentDialogProps> = ({
  open,
  client,
  onClose,
  onSuccess
}) => {
  const [amount, setAmount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'cheque' | 'bank_transfer'>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!client) return;

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const paymentData: RecordPaymentRequest = {
        client_id: client.id,
        amount: amountNum,
        payment_mode: paymentMode,
        payment_reference: reference || undefined,
        notes: notes || undefined
      };

      await b2bService.recordPayment(paymentData);
      onSuccess();
      handleClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAmount('');
    setPaymentMode('cash');
    setReference('');
    setNotes('');
    setError(null);
    onClose();
  };

  const handleFullPayment = () => {
    if (client && client.current_balance > 0) {
      setAmount(client.current_balance.toString());
    }
  };

  if (!client) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PaymentIcon color="success" />
        Record Payment
      </DialogTitle>
      
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Client Info */}
        <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 1, mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Receiving payment from
          </Typography>
          <Typography variant="h6">{client.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            Current Balance: <strong style={{ color: client.current_balance > 0 ? '#ef4444' : '#22c55e' }}>
              ₹{client.current_balance.toLocaleString()}
            </strong>
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {/* Amount */}
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              required
              type="number"
              label="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount received"
              InputProps={{
                startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                endAdornment: client.current_balance > 0 && (
                  <InputAdornment position="end">
                    <Button size="small" onClick={handleFullPayment}>
                      Full: ₹{client.current_balance.toLocaleString()}
                    </Button>
                  </InputAdornment>
                )
              }}
            />
          </Grid>

          {/* Payment Mode */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              select
              label="Payment Mode"
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as any)}
            >
              <MenuItem value="cash">💵 Cash</MenuItem>
              <MenuItem value="upi">📱 UPI</MenuItem>
              <MenuItem value="cheque">📝 Cheque</MenuItem>
              <MenuItem value="bank_transfer">🏦 Bank Transfer</MenuItem>
            </TextField>
          </Grid>

          {/* Reference */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label={paymentMode === 'cheque' ? 'Cheque Number' : 'Reference / Transaction ID'}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={paymentMode === 'cheque' ? 'CHQ-123456' : 'UPI-REF-123'}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <BankIcon color="action" fontSize="small" />
                  </InputAdornment>
                )
              }}
            />
          </Grid>

          {/* Notes */}
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Notes (Optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
            />
          </Grid>
        </Grid>

        {/* Preview */}
        {amount && parseFloat(amount) > 0 && (
          <Box sx={{ mt: 2, p: 2, bgcolor: '#f0fdf4', borderRadius: 1 }}>
            <Typography variant="body2" color="success.main">
              New balance after payment: <strong>
                ₹{(client.current_balance - parseFloat(amount)).toLocaleString()}
              </strong>
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={handleSubmit}
          disabled={loading || !amount}
        >
          {loading ? 'Recording...' : 'Record Payment'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RecordPaymentDialog;
