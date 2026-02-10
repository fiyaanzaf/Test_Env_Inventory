import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, TextField, InputAdornment, Chip, Card, CardContent, CardActionArea,
  Button, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Snackbar, Alert, LinearProgress, Fab,
  FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import {
  Search as SearchIcon, ArrowBack as BackIcon, Add as AddIcon,
  AccountBalance as KhataIcon, Phone as PhoneIcon, WhatsApp as WhatsAppIcon,
  Payment as PaymentIcon, Close as CloseIcon, Clear as ClearIcon,
  ArrowUpward as CreditIcon, ArrowDownward as DebitIcon,
  Warning as WarningIcon, People as PeopleIcon, MoneyOff as MoneyOffIcon,
  Block as BlockIcon, LockOpen as UnblockIcon, TrendingUp as NearLimitIcon,
} from '@mui/icons-material';

import {
  getKhataDashboard, getKhataCustomers, getKhataCustomer, createKhataCustomer,
  getCustomerTransactions, recordPayment, unblockCustomer, getWhatsAppReminder,
  type KhataCustomer, type KhataCustomerCreate, type KhataDashboard,
  type KhataTransaction, type RecordPaymentRequest,
} from '../services/khataService';

// ── Main Component ──────────────────────────────────────────────────────────
const KhataPage: React.FC = () => {
  // Navigation
  const [view, setView] = useState<'dashboard' | 'detail'>('dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);

  // Data
  const [dashboard, setDashboard] = useState<KhataDashboard | null>(null);
  const [customers, setCustomers] = useState<KhataCustomer[]>([]);
  const [customerDetail, setCustomerDetail] = useState<KhataCustomer | null>(null);
  const [transactions, setTransactions] = useState<KhataTransaction[]>([]);

  // Loading
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  // Search & filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'with_balance' | 'over_limit' | 'blocked'>('all');

  // Dialogs
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);

  // Add Customer form
  const [newCustomer, setNewCustomer] = useState<KhataCustomerCreate>({
    name: '', phone: '', email: '', address: '', credit_limit: 5000,
  });
  const [addCustomerLoading, setAddCustomerLoading] = useState(false);

  // Record Payment form
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false, message: '', severity: 'info',
  });

  // ── Load Dashboard ────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [dashData, custData] = await Promise.all([
        getKhataDashboard(),
        getKhataCustomers(undefined, statusFilter),
      ]);
      setDashboard(dashData);
      setCustomers(custData);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load khata data', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // ── Load Customer Detail ──────────────────────────────────────────────────
  const loadCustomerDetail = useCallback(async (customerId: number) => {
    setDetailLoading(true);
    try {
      const [detail, txns] = await Promise.all([
        getKhataCustomer(customerId),
        getCustomerTransactions(customerId, 50),
      ]);
      setCustomerDetail(detail);
      setTransactions(txns);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load customer details', severity: 'error' });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleCustomerClick = (customer: KhataCustomer) => {
    setSelectedCustomerId(customer.id);
    setView('detail');
    loadCustomerDetail(customer.id);
  };

  const handleBack = () => {
    setView('dashboard');
    setSelectedCustomerId(null);
    setCustomerDetail(null);
    setTransactions([]);
    loadDashboard();
  };

  // ── Filtered Customers ────────────────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers;
    const lower = searchTerm.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(lower) || c.phone.includes(lower)
    );
  }, [customers, searchTerm]);

  // ── Add Customer ──────────────────────────────────────────────────────────
  const handleAddCustomer = async () => {
    if (!newCustomer.name || !newCustomer.phone) return;
    setAddCustomerLoading(true);
    try {
      await createKhataCustomer(newCustomer);
      setAddCustomerOpen(false);
      setNewCustomer({ name: '', phone: '', email: '', address: '', credit_limit: 5000 });
      setSnackbar({ open: true, message: 'Customer added successfully', severity: 'success' });
      loadDashboard();
    } catch {
      setSnackbar({ open: true, message: 'Failed to add customer', severity: 'error' });
    } finally {
      setAddCustomerLoading(false);
    }
  };

  // ── Record Payment ────────────────────────────────────────────────────────
  const handleRecordPayment = async () => {
    if (!selectedCustomerId || paymentAmount <= 0) return;
    setPaymentLoading(true);
    try {
      const data: RecordPaymentRequest = {
        customer_id: selectedCustomerId,
        amount: paymentAmount,
        payment_mode: paymentMode,
        payment_reference: paymentRef || undefined,
        notes: paymentNotes || undefined,
      };
      await recordPayment(data);
      setRecordPaymentOpen(false);
      setPaymentAmount(0);
      setPaymentRef('');
      setPaymentNotes('');
      setSnackbar({ open: true, message: 'Payment recorded', severity: 'success' });
      loadCustomerDetail(selectedCustomerId);
    } catch {
      setSnackbar({ open: true, message: 'Failed to record payment', severity: 'error' });
    } finally {
      setPaymentLoading(false);
    }
  };

  // ── WhatsApp Reminder ─────────────────────────────────────────────────────
  const handleWhatsApp = async () => {
    if (!selectedCustomerId) return;
    try {
      const reminder = await getWhatsAppReminder(selectedCustomerId);
      const url = `https://wa.me/${reminder.phone}?text=${encodeURIComponent(reminder.message)}`;
      window.open(url, '_blank');
    } catch {
      setSnackbar({ open: true, message: 'Failed to generate reminder', severity: 'error' });
    }
  };

  // ── Unblock Customer ──────────────────────────────────────────────────────
  const handleUnblock = async () => {
    if (!selectedCustomerId) return;
    try {
      await unblockCustomer(selectedCustomerId);
      setSnackbar({ open: true, message: 'Customer unblocked', severity: 'success' });
      loadCustomerDetail(selectedCustomerId);
    } catch {
      setSnackbar({ open: true, message: 'Failed to unblock customer', severity: 'error' });
    }
  };

  // ── Status helpers ────────────────────────────────────────────────────────
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'clear': return 'success';
      case 'normal': return 'info';
      case 'warning': return 'warning';
      case 'over_limit': return 'error';
      default: return 'default';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'clear': return 'Clear';
      case 'normal': return 'Normal';
      case 'warning': return 'Warning';
      case 'over_limit': return 'Over Limit';
      default: return status;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOMER DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === 'detail') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
        {/* Header */}
        <Box sx={{ px: 2, pt: 2, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={handleBack}><BackIcon /></IconButton>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>Customer Details</Typography>
        </Box>

        {detailLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        ) : customerDetail ? (
          <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pb: 10 }}>
            {/* Customer Info Card */}
            <Card sx={{ mb: 2, borderRadius: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box>
                    <Typography variant="h6" fontWeight={700}>{customerDetail.name}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3 }}>
                      <PhoneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                      <Typography variant="body2" color="text.secondary">{customerDetail.phone}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Chip
                      label={getStatusLabel(customerDetail.balance_status)}
                      color={getStatusColor(customerDetail.balance_status) as any}
                      size="small"
                    />
                    {customerDetail.is_blocked && (
                      <Chip label="Blocked" color="error" size="small" icon={<BlockIcon />} />
                    )}
                  </Box>
                </Box>
                {customerDetail.address && (
                  <Typography variant="caption" color="text.secondary">{customerDetail.address}</Typography>
                )}
              </CardContent>
            </Card>

            {/* Balance Card with Progress */}
            <Card sx={{ mb: 2, borderRadius: 3, bgcolor: customerDetail.balance_status === 'over_limit' ? '#fef2f2' : '#f0fdf4' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>Outstanding Balance</Typography>
                <Typography variant="h4" fontWeight={800} color={customerDetail.current_balance > 0 ? 'error.main' : 'success.main'}>
                  ₹{customerDetail.current_balance.toLocaleString()}
                </Typography>
                <Box sx={{ mt: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">Credit Limit</Typography>
                    <Typography variant="caption" fontWeight={600}>
                      ₹{customerDetail.credit_limit.toLocaleString()}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(customerDetail.limit_used_percent, 100)}
                    color={customerDetail.balance_status === 'over_limit' ? 'error' : customerDetail.balance_status === 'warning' ? 'warning' : 'primary'}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', textAlign: 'right' }}>
                    {customerDetail.limit_used_percent.toFixed(0)}% used
                  </Typography>
                </Box>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <Box sx={{ display: 'grid', gridTemplateColumns: customerDetail.is_blocked ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 1, mb: 2 }}>
              <Button variant="contained" color="success" startIcon={<PaymentIcon />}
                onClick={() => setRecordPaymentOpen(true)}
                sx={{ py: 1.5, borderRadius: 2, fontWeight: 600, fontSize: '0.8rem' }}>
                Payment
              </Button>
              <Button variant="outlined" startIcon={<WhatsAppIcon />} onClick={handleWhatsApp}
                sx={{ py: 1.5, borderRadius: 2, fontWeight: 600, fontSize: '0.8rem', color: '#25d366', borderColor: '#25d366' }}>
                Remind
              </Button>
              {customerDetail.is_blocked && (
                <Button variant="outlined" color="warning" startIcon={<UnblockIcon />}
                  onClick={handleUnblock}
                  sx={{ py: 1.5, borderRadius: 2, fontWeight: 600, fontSize: '0.8rem' }}>
                  Unblock
                </Button>
              )}
            </Box>

            {/* Transactions Timeline */}
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Transactions</Typography>
            {transactions.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                No transactions yet
              </Typography>
            ) : (
              transactions.map((txn) => (
                <Card key={txn.id} variant="outlined" sx={{ mb: 1, borderRadius: 2 }}>
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {txn.type === 'PAYMENT' ? (
                          <CreditIcon sx={{ color: 'success.main', fontSize: 20 }} />
                        ) : txn.type === 'CREDIT_SALE' ? (
                          <DebitIcon sx={{ color: 'error.main', fontSize: 20 }} />
                        ) : (
                          <MoneyOffIcon sx={{ color: 'info.main', fontSize: 20 }} />
                        )}
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {txn.type === 'CREDIT_SALE' ? 'Credit Sale' : txn.type === 'PAYMENT' ? 'Payment' : 'Adjustment'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(txn.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                            {txn.payment_mode && ` · ${txn.payment_mode}`}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" fontWeight={700}
                          color={txn.type === 'PAYMENT' ? 'success.main' : 'error.main'}>
                          {txn.type === 'PAYMENT' ? '-' : '+'}₹{txn.amount.toLocaleString()}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Bal: ₹{txn.running_balance.toLocaleString()}
                        </Typography>
                      </Box>
                    </Box>
                    {txn.notes && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        {txn.notes}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </Box>
        ) : (
          <Typography sx={{ textAlign: 'center', py: 4 }} color="text.secondary">Customer not found</Typography>
        )}

        {/* ── Record Payment Dialog ────────────────────────────────────── */}
        <Dialog open={recordPaymentOpen} onClose={() => setRecordPaymentOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Record Payment
            <IconButton onClick={() => setRecordPaymentOpen(false)}><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ p: 2 }}>
            {customerDetail && (
              <Box sx={{ mb: 2, p: 1.5, bgcolor: '#fef2f2', borderRadius: 2, textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Outstanding</Typography>
                <Typography variant="h5" fontWeight={700} color="error.main">
                  ₹{customerDetail.current_balance.toLocaleString()}
                </Typography>
              </Box>
            )}
            <TextField label="Amount" type="number" fullWidth size="small" value={paymentAmount}
              onChange={e => setPaymentAmount(Number(e.target.value))} sx={{ mb: 2 }}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Payment Mode</InputLabel>
              <Select value={paymentMode} label="Payment Mode"
                onChange={e => setPaymentMode(e.target.value)}>
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="upi">UPI</MenuItem>
                <MenuItem value="cheque">Cheque</MenuItem>
                <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
              </Select>
            </FormControl>
            <TextField label="Reference" fullWidth size="small" value={paymentRef}
              onChange={e => setPaymentRef(e.target.value)} sx={{ mb: 2 }} />
            <TextField label="Notes" fullWidth size="small" multiline rows={2} value={paymentNotes}
              onChange={e => setPaymentNotes(e.target.value)} />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setRecordPaymentOpen(false)} sx={{ flex: 1 }}>Cancel</Button>
            <Button variant="contained" color="success" onClick={handleRecordPayment}
              disabled={paymentAmount <= 0 || paymentLoading} sx={{ flex: 2, py: 1.5, fontWeight: 700, borderRadius: 2 }}>
              {paymentLoading ? <CircularProgress size={24} color="inherit" /> : `Record ₹${paymentAmount.toLocaleString()}`}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Snackbar */}
        <Snackbar open={snackbar.open} autoHideDuration={3000}
          onClose={() => setSnackbar(s => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
          <Alert severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>{snackbar.message}</Alert>
        </Snackbar>
      </Box>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <KhataIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700}>Khata (Credit)</Typography>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : (
        <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pb: 10 }}>
          {/* Stat Cards */}
          {dashboard && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, mb: 2 }}>
              <Card sx={{ borderRadius: 2, bgcolor: '#fef2f2', border: '1px solid #fecaca' }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <MoneyOffIcon sx={{ fontSize: 20, color: '#dc2626', mb: 0.5 }} />
                  <Typography variant="h6" fontWeight={800} color="#991b1b" sx={{ fontSize: '1rem', lineHeight: 1.2 }}>
                    ₹{(dashboard.total_credit_outstanding / 1000).toFixed(1)}k
                  </Typography>
                  <Typography variant="caption" color="#b91c1c" sx={{ fontSize: '0.6rem' }}>Outstanding</Typography>
                </CardContent>
              </Card>
              <Card sx={{ borderRadius: 2, bgcolor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <PeopleIcon sx={{ fontSize: 20, color: '#2563eb', mb: 0.5 }} />
                  <Typography variant="h6" fontWeight={800} color="#1e40af" sx={{ fontSize: '1rem', lineHeight: 1.2 }}>
                    {dashboard.customers_with_balance}
                  </Typography>
                  <Typography variant="caption" color="#1d4ed8" sx={{ fontSize: '0.6rem' }}>With Balance</Typography>
                </CardContent>
              </Card>
              <Card sx={{ borderRadius: 2, bgcolor: '#fffbeb', border: '1px solid #fde68a' }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <WarningIcon sx={{ fontSize: 20, color: '#d97706', mb: 0.5 }} />
                  <Typography variant="h6" fontWeight={800} color="#92400e" sx={{ fontSize: '1rem', lineHeight: 1.2 }}>
                    {dashboard.customers_over_limit}
                  </Typography>
                  <Typography variant="caption" color="#b45309" sx={{ fontSize: '0.6rem' }}>Over Limit</Typography>
                </CardContent>
              </Card>
              <Card sx={{ borderRadius: 2, bgcolor: '#fff7ed', border: '1px solid #fed7aa' }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <NearLimitIcon sx={{ fontSize: 20, color: '#ea580c', mb: 0.5 }} />
                  <Typography variant="h6" fontWeight={800} color="#9a3412" sx={{ fontSize: '1rem', lineHeight: 1.2 }}>
                    {dashboard.customers_near_limit}
                  </Typography>
                  <Typography variant="caption" color="#c2410c" sx={{ fontSize: '0.6rem' }}>Near Limit</Typography>
                </CardContent>
              </Card>
            </Box>
          )}

          {/* Search */}
          <TextField
            fullWidth size="small" placeholder="Search customers..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            sx={{ mb: 1.5, bgcolor: 'white', borderRadius: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>,
              endAdornment: searchTerm ? (
                <IconButton size="small" onClick={() => setSearchTerm('')}><ClearIcon fontSize="small" /></IconButton>
              ) : null,
            }}
          />

          {/* Filter Chips */}
          <Box sx={{ mb: 2, display: 'flex', gap: 0.5, overflowX: 'auto', whiteSpace: 'nowrap',
            '&::-webkit-scrollbar': { display: 'none' }, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
            {(['all', 'with_balance', 'over_limit', 'blocked'] as const).map(status => (
              <Chip
                key={status}
                label={status === 'all' ? 'All' : status === 'with_balance' ? 'With Balance' : status === 'over_limit' ? 'Over Limit' : 'Blocked'}
                size="small"
                onClick={() => setStatusFilter(status)}
                color={statusFilter === status ? 'primary' : 'default'}
                variant={statusFilter === status ? 'filled' : 'outlined'}
                sx={{ fontWeight: 600, fontSize: '0.7rem' }}
              />
            ))}
          </Box>

          {/* Customer List */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
              Customers ({filteredCustomers.length})
            </Typography>
          </Box>

          {filteredCustomers.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              No customers found
            </Typography>
          ) : (
            filteredCustomers.map(customer => (
              <Card key={customer.id} variant="outlined" sx={{ mb: 1, borderRadius: 2 }}>
                <CardActionArea onClick={() => handleCustomerClick(customer)} sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body1" fontWeight={700}>{customer.name}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3 }}>
                        <PhoneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">{customer.phone}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="body2" fontWeight={700}
                        color={customer.current_balance > 0 ? 'error.main' : 'success.main'}>
                        ₹{customer.current_balance.toLocaleString()}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        /{customer.credit_limit.toLocaleString()}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ mt: 1, display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <Chip label={getStatusLabel(customer.balance_status)}
                      color={getStatusColor(customer.balance_status) as any} size="small" sx={{ height: 22, fontSize: '0.65rem' }} />
                    {customer.is_blocked && (
                      <Chip label="Blocked" color="error" size="small" variant="outlined" sx={{ height: 22, fontSize: '0.65rem' }} />
                    )}
                    {customer.current_balance > 0 && (
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(customer.limit_used_percent, 100)}
                        color={customer.balance_status === 'over_limit' ? 'error' : customer.balance_status === 'warning' ? 'warning' : 'primary'}
                        sx={{ flex: 1, height: 4, borderRadius: 2, ml: 1 }}
                      />
                    )}
                  </Box>
                </CardActionArea>
              </Card>
            ))
          )}
        </Box>
      )}

      {/* FAB - Add Customer */}
      <Fab color="primary" onClick={() => setAddCustomerOpen(true)}
        sx={{ position: 'fixed', bottom: 16, right: 16 }}>
        <AddIcon />
      </Fab>

      {/* ── Add Customer Dialog ────────────────────────────────────────── */}
      <Dialog open={addCustomerOpen} onClose={() => setAddCustomerOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Add Customer
          <IconButton onClick={() => setAddCustomerOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2 }}>
          <TextField label="Name *" fullWidth size="small" value={newCustomer.name}
            onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))} sx={{ mb: 1.5 }} />
          <TextField label="Phone *" fullWidth size="small" value={newCustomer.phone}
            onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))} sx={{ mb: 1.5 }} />
          <TextField label="Email" fullWidth size="small" value={newCustomer.email}
            onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))} sx={{ mb: 1.5 }} />
          <TextField label="Address" fullWidth size="small" multiline rows={2} value={newCustomer.address}
            onChange={e => setNewCustomer(p => ({ ...p, address: e.target.value }))} sx={{ mb: 1.5 }} />
          <TextField label="Credit Limit" type="number" fullWidth size="small" value={newCustomer.credit_limit}
            onChange={e => setNewCustomer(p => ({ ...p, credit_limit: Number(e.target.value) }))}
            InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setAddCustomerOpen(false)} sx={{ flex: 1 }}>Cancel</Button>
          <Button variant="contained" onClick={handleAddCustomer}
            disabled={!newCustomer.name || !newCustomer.phone || addCustomerLoading}
            sx={{ flex: 2, py: 1.5, fontWeight: 700, borderRadius: 2 }}>
            {addCustomerLoading ? <CircularProgress size={24} color="inherit" /> : 'Add Customer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default KhataPage;
