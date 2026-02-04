import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Snackbar
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Phone as PhoneIcon,
  WhatsApp as WhatsAppIcon,
  Payment as PaymentIcon,
  Block as BlockIcon,
  LockOpen as UnblockIcon,
  Add as AddIcon,
  Remove as RemoveIcon
} from '@mui/icons-material';
import {
  getKhataCustomer,
  getCustomerTransactions,
  recordPayment,
  unblockCustomer,
  getWhatsAppReminder,
  type KhataCustomer,
  type KhataTransaction
} from '../../services/khataService';

interface KhataCustomerDetailProps {
  customerId: number;
  onBack: () => void;
}

const KhataCustomerDetail: React.FC<KhataCustomerDetailProps> = ({ customerId, onBack }) => {
  const [customer, setCustomer] = useState<KhataCustomer | null>(null);
  const [transactions, setTransactions] = useState<KhataTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  useEffect(() => {
    loadData();
  }, [customerId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [cust, txns] = await Promise.all([
        getKhataCustomer(customerId),
        getCustomerTransactions(customerId)
      ]);
      setCustomer(cust);
      setTransactions(txns);
    } catch (error) {
      console.error('Error loading customer:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!paymentAmount || Number(paymentAmount) <= 0) return;
    
    try {
      setPaymentLoading(true);
      await recordPayment({
        customer_id: customerId,
        amount: Number(paymentAmount),
        payment_mode: paymentMode,
        payment_reference: paymentRef || undefined
      });
      setPaymentDialogOpen(false);
      setPaymentAmount('');
      setPaymentRef('');
      setSnackbar({ open: true, message: 'Payment recorded successfully', severity: 'success' });
      loadData();
    } catch {
      setSnackbar({ open: true, message: 'Failed to record payment', severity: 'error' });
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleUnblock = async () => {
    try {
      await unblockCustomer(customerId);
      setSnackbar({ open: true, message: 'Customer unblocked', severity: 'success' });
      loadData();
    } catch {
      setSnackbar({ open: true, message: 'Failed to unblock', severity: 'error' });
    }
  };

  const handleWhatsApp = async () => {
    try {
      const reminder = await getWhatsAppReminder(customerId);
      const url = `https://wa.me/91${reminder.phone}?text=${encodeURIComponent(reminder.message)}`;
      window.open(url, '_blank');
    } catch {
      setSnackbar({ open: true, message: 'Failed to generate reminder', severity: 'error' });
    }
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={200} sx={{ mb: 2, borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  if (!customer) {
    return (
      <Box>
        <Button startIcon={<BackIcon />} onClick={onBack}>Back</Button>
        <Alert severity="error" sx={{ mt: 2 }}>Customer not found</Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Button startIcon={<BackIcon />} onClick={onBack}>
          Back to List
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {customer.is_blocked && (
            <Button
              variant="outlined"
              color="success"
              startIcon={<UnblockIcon />}
              onClick={handleUnblock}
            >
              Unblock
            </Button>
          )}
          <Button
            variant="outlined"
            color="success"
            startIcon={<WhatsAppIcon />}
            onClick={handleWhatsApp}
          >
            WhatsApp
          </Button>
          <Button
            variant="contained"
            startIcon={<PaymentIcon />}
            onClick={() => setPaymentDialogOpen(true)}
          >
            Record Payment
          </Button>
        </Box>
      </Box>

      {/* Customer Info Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="h5" fontWeight="bold" gutterBottom>
                {customer.name}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <PhoneIcon fontSize="small" color="action" />
                <Typography>{customer.phone}</Typography>
              </Box>
              {customer.email && (
                <Typography variant="body2" color="text.secondary">
                  {customer.email}
                </Typography>
              )}
              {customer.address && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {customer.address}
                </Typography>
              )}
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Current Balance
              </Typography>
              <Typography
                variant="h4"
                fontWeight="bold"
                color={customer.current_balance > 0 ? 'error.main' : 'success.main'}
              >
                ₹{customer.current_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </Typography>
              <Box sx={{ mt: 1 }}>
                {customer.is_blocked ? (
                  <Chip icon={<BlockIcon />} label="BLOCKED" color="error" />
                ) : customer.balance_status === 'warning' ? (
                  <Chip label="Near Limit" color="warning" />
                ) : customer.balance_status === 'over_limit' ? (
                  <Chip label="Over Limit" color="error" />
                ) : customer.current_balance === 0 ? (
                  <Chip label="Clear" color="success" />
                ) : (
                  <Chip label="Active" color="info" />
                )}
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Credit Limit
              </Typography>
              <Typography variant="h4" fontWeight="bold">
                ₹{customer.credit_limit.toLocaleString('en-IN')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Used: {customer.limit_used_percent}%
              </Typography>
              <Box sx={{ 
                mt: 1, 
                height: 8, 
                bgcolor: 'grey.200', 
                borderRadius: 1,
                overflow: 'hidden'
              }}>
                <Box sx={{ 
                  height: '100%', 
                  width: `${Math.min(customer.limit_used_percent, 100)}%`,
                  bgcolor: customer.limit_used_percent >= 100 ? 'error.main' : 
                           customer.limit_used_percent >= 80 ? 'warning.main' : 'success.main',
                  borderRadius: 1
                }} />
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Transaction History (Ledger)
          </Typography>
          
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Debit</TableCell>
                  <TableCell align="right">Credit</TableCell>
                  <TableCell align="right">Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography color="text.secondary" sx={{ py: 3 }}>
                        No transactions yet
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((txn) => (
                    <TableRow key={txn.id}>
                      <TableCell>
                        {new Date(txn.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: '2-digit'
                        })}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          icon={txn.type === 'PAYMENT' ? <RemoveIcon /> : <AddIcon />}
                          label={txn.type === 'CREDIT_SALE' ? 'Sale' : txn.type === 'PAYMENT' ? 'Payment' : 'Adj'}
                          color={txn.type === 'PAYMENT' ? 'success' : 'error'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {txn.notes || (txn.sales_order_id ? `Order #${txn.sales_order_id}` : '-')}
                        {txn.payment_mode && ` (${txn.payment_mode})`}
                      </TableCell>
                      <TableCell align="right">
                        {txn.amount > 0 && (
                          <Typography color="error.main" fontWeight="medium">
                            ₹{Math.abs(txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {txn.amount < 0 && (
                          <Typography color="success.main" fontWeight="medium">
                            ₹{Math.abs(txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography fontWeight="bold">
                          ₹{txn.running_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onClose={() => setPaymentDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Record Payment</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="Amount"
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start">₹</InputAdornment>
              }}
              sx={{ mb: 2 }}
              autoFocus
            />
            
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Payment Mode</InputLabel>
              <Select
                value={paymentMode}
                label="Payment Mode"
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="upi">UPI</MenuItem>
                <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                <MenuItem value="cheque">Cheque</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              fullWidth
              label="Reference / Transaction ID (Optional)"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentDialogOpen(false)} disabled={paymentLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleRecordPayment}
            disabled={paymentLoading || !paymentAmount}
          >
            {paymentLoading ? 'Recording...' : 'Record Payment'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
      >
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default KhataCustomerDetail;
