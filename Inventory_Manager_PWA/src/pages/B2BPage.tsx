import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, TextField, InputAdornment, Chip, Card, CardContent, CardActionArea,
  Button, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Snackbar, Alert, Divider, LinearProgress,
  FormControl, InputLabel, Select, MenuItem, Fab,
} from '@mui/material';
import {
  Search as SearchIcon, ArrowBack as BackIcon, Add as AddIcon,
  Storefront as B2BIcon, Phone as PhoneIcon, WhatsApp as WhatsAppIcon,
  Receipt as StatementIcon, Payment as PaymentIcon, ShoppingCart as OrderIcon,
  AttachMoney as MoneyIcon, Warning as WarningIcon, People as PeopleIcon,
  AccountBalanceWallet as WalletIcon, Close as CloseIcon, Clear as ClearIcon,
  ArrowUpward as CreditIcon, ArrowDownward as DebitIcon,
  Remove as RemoveIcon, Email as EmailIcon, Inventory as ReceiveIcon,
  Send as PayOutIcon, QrCodeScanner as ScanIcon,
} from '@mui/icons-material';
import { Capacitor } from '@capacitor/core';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';

import {
  b2bService,
  type B2BClient, type B2BClientCreate, type B2BDashboard,
  type KhataTransaction, type B2BOrderItemCreate,
  type B2BPurchaseItemCreate, type RecordPaymentOutRequest,
} from '../services/b2bService';
import { getAllProducts, type Product } from '../services/productService';

// ── Main Component ──────────────────────────────────────────────────────────
const B2BPage: React.FC = () => {
  // Scanner
  const { startScan } = useBarcodeScanner();

  const handleScanForOrder = async () => {
    const result = await startScan();
    if (result?.hasContent) {
      const product = products.find(p => p.sku.toLowerCase() === result.content.toLowerCase());
      if (product) {
        setAddItemProductId(product.id);
        setAddItemPrice(product.selling_price);
      } else {
        setSnackbar({ open: true, message: `No product found for barcode: ${result.content}`, severity: 'error' });
      }
    }
  };

  const handleScanForPurchase = async () => {
    const result = await startScan();
    if (result?.hasContent) {
      const product = products.find(p => p.sku.toLowerCase() === result.content.toLowerCase());
      if (product) {
        setAddPurchaseProductId(product.id);
        setAddPurchaseCost((product as any).average_cost ?? (product as any).cost_price ?? 0);
      } else {
        setSnackbar({ open: true, message: `No product found for barcode: ${result.content}`, severity: 'error' });
      }
    }
  };

  // Navigation
  const [view, setView] = useState<'dashboard' | 'detail'>('dashboard');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  // Dashboard
  const [dashboard, setDashboard] = useState<B2BDashboard | null>(null);
  const [clients, setClients] = useState<B2BClient[]>([]);
  const [clientDetail, setClientDetail] = useState<B2BClient | null>(null);
  const [ledger, setLedger] = useState<KhataTransaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Loading
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  // Search
  const [searchTerm, setSearchTerm] = useState('');

  // Dialogs
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [receiveItemsOpen, setReceiveItemsOpen] = useState(false);
  const [payClientOpen, setPayClientOpen] = useState(false);
  const [sendEmailOpen, setSendEmailOpen] = useState(false);

  // Add Client form
  const [newClient, setNewClient] = useState<B2BClientCreate>({
    name: '', phone: '', contact_person: '', email: '', gstin: '', address: '',
    credit_limit: 50000, price_tier: 'standard',
  });
  const [addClientLoading, setAddClientLoading] = useState(false);

  // Create Order form
  const [orderItems, setOrderItems] = useState<(B2BOrderItemCreate & { product_name: string })[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [orderLoading, setOrderLoading] = useState(false);
  const [addItemProductId, setAddItemProductId] = useState<number | ''>('');
  const [addItemQty, setAddItemQty] = useState(1);
  const [addItemPrice, setAddItemPrice] = useState(0);

  // Record Payment form
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'cheque' | 'bank_transfer'>('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Receive Items (Purchase) form
  const [purchaseItems, setPurchaseItems] = useState<(B2BPurchaseItemCreate & { product_name: string })[]>([]);
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [purchaseRef, setPurchaseRef] = useState('');
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [addPurchaseProductId, setAddPurchaseProductId] = useState<number | ''>('');
  const [addPurchaseQty, setAddPurchaseQty] = useState(1);
  const [addPurchaseCost, setAddPurchaseCost] = useState(0);

  // Pay Client (Outgoing Payment) form
  const [payOutAmount, setPayOutAmount] = useState(0);
  const [payOutMode, setPayOutMode] = useState<'cash' | 'upi' | 'cheque' | 'bank_transfer'>('cash');
  const [payOutRef, setPayOutRef] = useState('');
  const [payOutNotes, setPayOutNotes] = useState('');
  const [payOutLoading, setPayOutLoading] = useState(false);

  // Send Email form
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false, message: '', severity: 'info',
  });

  // ── Load Dashboard ────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [dashData, clientsData] = await Promise.all([
        b2bService.getDashboard(),
        b2bService.getClients(),
      ]);
      setDashboard(dashData);
      setClients(clientsData);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load B2B data', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // ── Load Client Detail ────────────────────────────────────────────────────
  const loadClientDetail = useCallback(async (clientId: number) => {
    setDetailLoading(true);
    try {
      const [detail, ledgerData] = await Promise.all([
        b2bService.getClient(clientId),
        b2bService.getLedger(clientId, 50),
      ]);
      setClientDetail(detail);
      setLedger(ledgerData);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load client details', severity: 'error' });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleClientClick = (client: B2BClient) => {
    setSelectedClientId(client.id);
    setView('detail');
    loadClientDetail(client.id);
  };

  const handleBack = () => {
    setView('dashboard');
    setSelectedClientId(null);
    setClientDetail(null);
    setLedger([]);
    loadDashboard();
  };

  // ── Filtered Clients ─────────────────────────────────────────────────────
  const filteredClients = useMemo(() => {
    if (!searchTerm) return clients;
    const lower = searchTerm.toLowerCase();
    return clients.filter(c =>
      c.name.toLowerCase().includes(lower) ||
      c.phone.includes(lower) ||
      (c.contact_person && c.contact_person.toLowerCase().includes(lower))
    );
  }, [clients, searchTerm]);

  // ── Add Client ────────────────────────────────────────────────────────────
  const handleAddClient = async () => {
    if (!newClient.name || !newClient.phone) return;
    setAddClientLoading(true);
    try {
      await b2bService.createClient(newClient);
      setAddClientOpen(false);
      setNewClient({ name: '', phone: '', contact_person: '', email: '', gstin: '', address: '', credit_limit: 50000, price_tier: 'standard' });
      setSnackbar({ open: true, message: 'Client added successfully', severity: 'success' });
      loadDashboard();
    } catch {
      setSnackbar({ open: true, message: 'Failed to add client', severity: 'error' });
    } finally {
      setAddClientLoading(false);
    }
  };

  // ── Create Order ──────────────────────────────────────────────────────────
  const openCreateOrder = async () => {
    if (products.length === 0) {
      try {
        const p = await getAllProducts();
        setProducts(p);
      } catch { /* ignore */ }
    }
    setOrderItems([]);
    setOrderNotes('');
    setAddItemProductId('');
    setAddItemQty(1);
    setAddItemPrice(0);
    setCreateOrderOpen(true);
  };

  const handleAddOrderItem = () => {
    if (!addItemProductId || addItemQty <= 0 || addItemPrice <= 0) return;
    const product = products.find(p => p.id === addItemProductId);
    if (!product) return;
    setOrderItems(prev => [...prev, {
      product_id: product.id,
      quantity: addItemQty,
      unit_price: addItemPrice,
      product_name: product.name,
    }]);
    setAddItemProductId('');
    setAddItemQty(1);
    setAddItemPrice(0);
  };

  const handleRemoveOrderItem = (idx: number) => {
    setOrderItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCreateOrder = async () => {
    if (!selectedClientId || orderItems.length === 0) return;
    setOrderLoading(true);
    try {
      const order = await b2bService.createOrder({
        client_id: selectedClientId,
        items: orderItems.map(({ product_id, quantity, unit_price }) => ({ product_id, quantity, unit_price })),
        notes: orderNotes || undefined,
      });
      setCreateOrderOpen(false);
      setSnackbar({ open: true, message: `Order #${order.id} created!`, severity: 'success' });
      loadClientDetail(selectedClientId);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to create order';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setOrderLoading(false);
    }
  };

  // ── Record Payment ────────────────────────────────────────────────────────
  const handleRecordPayment = async () => {
    if (!selectedClientId || paymentAmount <= 0) return;
    setPaymentLoading(true);
    try {
      await b2bService.recordPayment({
        client_id: selectedClientId,
        amount: paymentAmount,
        payment_mode: paymentMode,
        payment_reference: paymentRef || undefined,
        notes: paymentNotes || undefined,
      });
      setRecordPaymentOpen(false);
      setPaymentAmount(0);
      setPaymentRef('');
      setPaymentNotes('');
      setSnackbar({ open: true, message: 'Payment recorded', severity: 'success' });
      loadClientDetail(selectedClientId);
    } catch {
      setSnackbar({ open: true, message: 'Failed to record payment', severity: 'error' });
    } finally {
      setPaymentLoading(false);
    }
  };

  // ── Receive Items (Purchase) ───────────────────────────────────────────────
  const openReceiveItems = async () => {
    if (products.length === 0) {
      try {
        const p = await getAllProducts();
        setProducts(p);
      } catch { /* ignore */ }
    }
    setPurchaseItems([]);
    setPurchaseNotes('');
    setPurchaseRef('');
    setAddPurchaseProductId('');
    setAddPurchaseQty(1);
    setAddPurchaseCost(0);
    setReceiveItemsOpen(true);
  };

  const handleAddPurchaseItem = () => {
    if (!addPurchaseProductId || addPurchaseQty <= 0 || addPurchaseCost <= 0) return;
    const product = products.find(p => p.id === addPurchaseProductId);
    if (!product) return;
    setPurchaseItems(prev => [...prev, {
      product_id: product.id,
      quantity: addPurchaseQty,
      unit_cost: addPurchaseCost,
      product_name: product.name,
    }]);
    setAddPurchaseProductId('');
    setAddPurchaseQty(1);
    setAddPurchaseCost(0);
  };

  const handleRemovePurchaseItem = (idx: number) => {
    setPurchaseItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleReceiveItems = async () => {
    if (!selectedClientId || purchaseItems.length === 0) return;
    setPurchaseLoading(true);
    try {
      await b2bService.createB2BPurchase({
        client_id: selectedClientId,
        items: purchaseItems.map(({ product_id, quantity, unit_cost }) => ({ product_id, quantity, unit_cost })),
        reference_number: purchaseRef || undefined,
        notes: purchaseNotes || undefined,
      });
      setReceiveItemsOpen(false);
      setSnackbar({ open: true, message: 'Items received successfully!', severity: 'success' });
      loadClientDetail(selectedClientId);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to receive items';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setPurchaseLoading(false);
    }
  };

  // ── Pay Client (Outgoing Payment) ─────────────────────────────────────────
  const handlePayClient = async () => {
    if (!selectedClientId || payOutAmount <= 0) return;
    setPayOutLoading(true);
    try {
      await b2bService.recordOutgoingPayment({
        client_id: selectedClientId,
        amount: payOutAmount,
        payment_mode: payOutMode,
        payment_reference: payOutRef || undefined,
        notes: payOutNotes || undefined,
      });
      setPayClientOpen(false);
      setPayOutAmount(0);
      setPayOutRef('');
      setPayOutNotes('');
      setSnackbar({ open: true, message: 'Payment to client recorded', severity: 'success' });
      loadClientDetail(selectedClientId);
    } catch {
      setSnackbar({ open: true, message: 'Failed to record outgoing payment', severity: 'error' });
    } finally {
      setPayOutLoading(false);
    }
  };

  // ── Send Email ────────────────────────────────────────────────────────────
  const openSendEmail = async () => {
    if (!selectedClientId) return;
    try {
      const data = await b2bService.getEmailReminder(selectedClientId);
      setEmailTo(data.email);
      setEmailSubject(data.subject);
      setEmailBody(data.body);
      setSendEmailOpen(true);
    } catch {
      setSnackbar({ open: true, message: 'Failed to generate email', severity: 'error' });
    }
  };

  const handleSendEmail = async () => {
    if (!selectedClientId || !emailTo) return;
    setEmailLoading(true);
    try {
      await b2bService.sendEmailReminder(selectedClientId, emailTo, emailSubject, emailBody);
      setSendEmailOpen(false);
      setSnackbar({ open: true, message: 'Email sent successfully', severity: 'success' });
    } catch {
      // Fallback to mailto
      const mailtoUrl = `mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
      window.open(mailtoUrl, '_blank');
      setSendEmailOpen(false);
      setSnackbar({ open: true, message: 'Opened in email client', severity: 'info' });
    } finally {
      setEmailLoading(false);
    }
  };

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  const handleWhatsApp = async () => {
    if (!selectedClientId) return;
    try {
      const msg = await b2bService.getWhatsAppMessage(selectedClientId);
      window.open(msg.whatsapp_url, '_blank');
    } catch {
      setSnackbar({ open: true, message: 'Failed to generate WhatsApp message', severity: 'error' });
    }
  };

  // ── Statement ─────────────────────────────────────────────────────────────
  const handleDownloadStatement = async () => {
    if (!selectedClientId) return;
    try {
      await b2bService.downloadStatement(selectedClientId);
      setSnackbar({ open: true, message: 'Statement downloaded', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to download statement', severity: 'error' });
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

  const orderTotal = useMemo(() => orderItems.reduce((s, i) => s + i.quantity * i.unit_price, 0), [orderItems]);
  const purchaseTotal = useMemo(() => purchaseItems.reduce((s, i) => s + i.quantity * i.unit_cost, 0), [purchaseItems]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === 'detail') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
        {/* Header */}
        <Box sx={{ px: 2, pt: 2, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={handleBack}><BackIcon /></IconButton>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>Client Details</Typography>
        </Box>

        {detailLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        ) : clientDetail ? (
          <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pb: 10 }}>
            {/* Client Info Card */}
            <Card sx={{ mb: 2, borderRadius: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box>
                    <Typography variant="h6" fontWeight={700}>{clientDetail.name}</Typography>
                    {clientDetail.contact_person && (
                      <Typography variant="body2" color="text.secondary">{clientDetail.contact_person}</Typography>
                    )}
                  </Box>
                  <Chip
                    label={getStatusLabel(clientDetail.balance_status)}
                    color={getStatusColor(clientDetail.balance_status) as any}
                    size="small"
                  />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <PhoneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">{clientDetail.phone}</Typography>
                </Box>
                {clientDetail.gstin && (
                  <Typography variant="caption" color="text.secondary">GSTIN: {clientDetail.gstin}</Typography>
                )}
                <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                  <Chip label={clientDetail.price_tier.toUpperCase()} size="small" variant="outlined" />
                  <Chip
                    label={clientDetail.is_active ? 'Active' : 'Inactive'}
                    size="small"
                    color={clientDetail.is_active ? 'success' : 'default'}
                  />
                </Box>
              </CardContent>
            </Card>

            {/* Balance Card */}
            <Card sx={{ mb: 2, borderRadius: 3, bgcolor: clientDetail.balance_status === 'over_limit' ? '#fef2f2' : '#f0fdf4' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>Outstanding Balance</Typography>
                <Typography variant="h4" fontWeight={800} color={clientDetail.current_balance > 0 ? 'error.main' : 'success.main'}>
                  ₹{clientDetail.current_balance.toLocaleString()}
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">Credit Limit</Typography>
                    <Typography variant="caption" fontWeight={600}>
                      ₹{clientDetail.credit_limit.toLocaleString()}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min((clientDetail.current_balance / clientDetail.credit_limit) * 100, 100)}
                    color={clientDetail.balance_status === 'over_limit' ? 'error' : clientDetail.balance_status === 'warning' ? 'warning' : 'primary'}
                    sx={{ height: 6, borderRadius: 3 }}
                  />
                </Box>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, mb: 2 }}>
              <Button variant="contained" startIcon={<OrderIcon />} onClick={openCreateOrder}
                sx={{ py: 1.5, borderRadius: 2, fontWeight: 600, fontSize: '0.8rem' }}>
                New Order
              </Button>
              <Button variant="contained" color="success" startIcon={<PaymentIcon />}
                onClick={() => setRecordPaymentOpen(true)}
                sx={{ py: 1.5, borderRadius: 2, fontWeight: 600, fontSize: '0.8rem' }}>
                Receive Pay
              </Button>
              <Button variant="contained" color="secondary" startIcon={<ReceiveIcon />} onClick={openReceiveItems}
                sx={{ py: 1.5, borderRadius: 2, fontWeight: 600, fontSize: '0.8rem' }}>
                Receive Items
              </Button>
              <Button variant="contained" color="warning" startIcon={<PayOutIcon />}
                onClick={() => { setPayOutAmount(0); setPayOutRef(''); setPayOutNotes(''); setPayOutMode('cash'); setPayClientOpen(true); }}
                sx={{ py: 1.5, borderRadius: 2, fontWeight: 600, fontSize: '0.8rem' }}>
                Pay Client
              </Button>
              <Button variant="outlined" startIcon={<EmailIcon />} onClick={openSendEmail}
                sx={{ py: 1.5, borderRadius: 2, fontWeight: 600, fontSize: '0.8rem' }}>
                Send Email
              </Button>
              <Button variant="outlined" startIcon={<WhatsAppIcon />} onClick={handleWhatsApp}
                sx={{ py: 1.5, borderRadius: 2, fontWeight: 600, fontSize: '0.8rem', color: '#25d366', borderColor: '#25d366' }}>
                WhatsApp
              </Button>
              <Button variant="outlined" startIcon={<StatementIcon />} onClick={handleDownloadStatement}
                sx={{ py: 1.5, borderRadius: 2, fontWeight: 600, fontSize: '0.8rem', gridColumn: 'span 2' }}>
                Download Statement
              </Button>
            </Box>

            {/* Ledger Timeline */}
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Transaction History</Typography>
            {ledger.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                No transactions yet
              </Typography>
            ) : (
              ledger.map((txn) => (
                <Card key={txn.id} variant="outlined" sx={{ mb: 1, borderRadius: 2 }}>
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {(txn.type === 'PAYMENT' || txn.type === 'PAYMENT_OUT') ? (
                          <CreditIcon sx={{ color: 'success.main', fontSize: 20 }} />
                        ) : (
                          <DebitIcon sx={{ color: 'error.main', fontSize: 20 }} />
                        )}
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {txn.type === 'SALE' ? 'Sale' : txn.type === 'PAYMENT' ? 'Payment In' : txn.type === 'PURCHASE' ? 'Purchase' : 'Payment Out'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(txn.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                            {txn.payment_mode && ` · ${txn.payment_mode}`}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" fontWeight={700}
                          color={(txn.type === 'PAYMENT' || txn.type === 'PAYMENT_OUT') ? 'success.main' : 'error.main'}>
                          {(txn.type === 'PAYMENT' || txn.type === 'PAYMENT_OUT') ? '-' : '+'}₹{txn.amount.toLocaleString()}
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
          <Typography sx={{ textAlign: 'center', py: 4 }} color="text.secondary">Client not found</Typography>
        )}

        {/* ── Create Order Dialog ──────────────────────────────────────── */}
        <Dialog open={createOrderOpen} onClose={() => setCreateOrderOpen(false)} fullScreen>
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            New Order
            <IconButton onClick={() => setCreateOrderOpen(false)}><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {clientDetail?.name}
            </Typography>

            {/* Add Item */}
            <Card variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: '#f8fafc' }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Add Item</Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Product</InputLabel>
                  <Select value={addItemProductId} label="Product"
                    onChange={e => {
                      const pid = e.target.value as number;
                      setAddItemProductId(pid);
                      const p = products.find(pr => pr.id === pid);
                      if (p) setAddItemPrice(p.selling_price);
                    }}>
                    {products.map(p => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name} (₹{p.selling_price})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {Capacitor.isNativePlatform() && (
                  <IconButton onClick={handleScanForOrder} color="primary" sx={{ border: '1px solid', borderColor: 'primary.main', borderRadius: 1 }}>
                    <ScanIcon />
                  </IconButton>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField label="Qty" type="number" size="small" value={addItemQty}
                  onChange={e => setAddItemQty(Number(e.target.value))} sx={{ flex: 1 }} />
                <TextField label="Price" type="number" size="small" value={addItemPrice}
                  onChange={e => setAddItemPrice(Number(e.target.value))} sx={{ flex: 1 }} />
              </Box>
              <Button variant="outlined" fullWidth startIcon={<AddIcon />} onClick={handleAddOrderItem}
                disabled={!addItemProductId || addItemQty <= 0 || addItemPrice <= 0}>
                Add to Order
              </Button>
            </Card>

            {/* Item List */}
            {orderItems.map((item, idx) => (
              <Card key={idx} variant="outlined" sx={{ mb: 1, borderRadius: 2 }}>
                <CardContent sx={{ py: 1, px: 2, '&:last-child': { pb: 1 }, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{item.product_name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.quantity} × ₹{item.unit_price.toLocaleString()} = ₹{(item.quantity * item.unit_price).toLocaleString()}
                    </Typography>
                  </Box>
                  <IconButton size="small" color="error" onClick={() => handleRemoveOrderItem(idx)}>
                    <RemoveIcon fontSize="small" />
                  </IconButton>
                </CardContent>
              </Card>
            ))}

            {orderItems.length > 0 && (
              <Box sx={{ mt: 2, p: 2, bgcolor: '#f0fdf4', borderRadius: 2, textAlign: 'right' }}>
                <Typography variant="body2" color="text.secondary">Order Total</Typography>
                <Typography variant="h5" fontWeight={800} color="primary.main">
                  ₹{orderTotal.toLocaleString()}
                </Typography>
              </Box>
            )}

            <TextField label="Notes" fullWidth multiline rows={2} size="small" value={orderNotes}
              onChange={e => setOrderNotes(e.target.value)} sx={{ mt: 2 }} />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setCreateOrderOpen(false)} sx={{ flex: 1 }}>Cancel</Button>
            <Button variant="contained" onClick={handleCreateOrder}
              disabled={orderItems.length === 0 || orderLoading} sx={{ flex: 2, py: 1.5, fontWeight: 700, borderRadius: 2 }}>
              {orderLoading ? <CircularProgress size={24} color="inherit" /> : 'Create Order'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Record Payment Dialog ────────────────────────────────────── */}
        <Dialog open={recordPaymentOpen} onClose={() => setRecordPaymentOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Record Payment
            <IconButton onClick={() => setRecordPaymentOpen(false)}><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ p: 2 }}>
            {clientDetail && (
              <Box sx={{ mb: 2, p: 1.5, bgcolor: '#fef2f2', borderRadius: 2, textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Outstanding</Typography>
                <Typography variant="h5" fontWeight={700} color="error.main">
                  ₹{clientDetail.current_balance.toLocaleString()}
                </Typography>
              </Box>
            )}
            <TextField label="Amount" type="number" fullWidth size="small" value={paymentAmount}
              onChange={e => setPaymentAmount(Number(e.target.value))} sx={{ mb: 2 }}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Payment Mode</InputLabel>
              <Select value={paymentMode} label="Payment Mode"
                onChange={e => setPaymentMode(e.target.value as any)}>
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

        {/* ── Receive Items Dialog ──────────────────────────────────── */}
        <Dialog open={receiveItemsOpen} onClose={() => setReceiveItemsOpen(false)} fullScreen>
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Receive Items
            <IconButton onClick={() => setReceiveItemsOpen(false)}><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Receive items from <strong>{clientDetail?.name}</strong> (reverse flow — adds to your stock, reduces client balance)
            </Typography>

            {/* Add Purchase Item */}
            <Card variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: '#f8fafc' }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Add Item</Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Product</InputLabel>
                  <Select value={addPurchaseProductId} label="Product"
                    onChange={e => {
                      const pid = e.target.value as number;
                      setAddPurchaseProductId(pid);
                      const p = products.find(pr => pr.id === pid);
                      if (p) setAddPurchaseCost((p as any).average_cost ?? (p as any).cost_price ?? 0);
                    }}>
                    {products.map(p => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {Capacitor.isNativePlatform() && (
                  <IconButton onClick={handleScanForPurchase} color="primary" sx={{ border: '1px solid', borderColor: 'primary.main', borderRadius: 1 }}>
                    <ScanIcon />
                  </IconButton>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField label="Qty" type="number" size="small" value={addPurchaseQty}
                  onChange={e => setAddPurchaseQty(Number(e.target.value))} sx={{ flex: 1 }} />
                <TextField label="Unit Cost" type="number" size="small" value={addPurchaseCost}
                  onChange={e => setAddPurchaseCost(Number(e.target.value))} sx={{ flex: 1 }}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
              </Box>
              <Button variant="outlined" fullWidth startIcon={<AddIcon />} onClick={handleAddPurchaseItem}
                disabled={!addPurchaseProductId || addPurchaseQty <= 0 || addPurchaseCost <= 0}>
                Add to List
              </Button>
            </Card>

            {/* Purchase Item List */}
            {purchaseItems.map((item, idx) => (
              <Card key={idx} variant="outlined" sx={{ mb: 1, borderRadius: 2 }}>
                <CardContent sx={{ py: 1, px: 2, '&:last-child': { pb: 1 }, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{item.product_name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.quantity} × ₹{item.unit_cost.toLocaleString()} = ₹{(item.quantity * item.unit_cost).toLocaleString()}
                    </Typography>
                  </Box>
                  <IconButton size="small" color="error" onClick={() => handleRemovePurchaseItem(idx)}>
                    <RemoveIcon fontSize="small" />
                  </IconButton>
                </CardContent>
              </Card>
            ))}

            {purchaseItems.length > 0 && (
              <Box sx={{ mt: 2, p: 2, bgcolor: '#fef3c7', borderRadius: 2, textAlign: 'right' }}>
                <Typography variant="body2" color="text.secondary">Purchase Total</Typography>
                <Typography variant="h5" fontWeight={800} color="warning.dark">
                  ₹{purchaseTotal.toLocaleString()}
                </Typography>
              </Box>
            )}

            <TextField label="Reference #" fullWidth size="small" value={purchaseRef}
              onChange={e => setPurchaseRef(e.target.value)} sx={{ mt: 2, mb: 1 }} />
            <TextField label="Notes" fullWidth multiline rows={2} size="small" value={purchaseNotes}
              onChange={e => setPurchaseNotes(e.target.value)} />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setReceiveItemsOpen(false)} sx={{ flex: 1 }}>Cancel</Button>
            <Button variant="contained" color="secondary" onClick={handleReceiveItems}
              disabled={purchaseItems.length === 0 || purchaseLoading} sx={{ flex: 2, py: 1.5, fontWeight: 700, borderRadius: 2 }}>
              {purchaseLoading ? <CircularProgress size={24} color="inherit" /> : 'Receive Items'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Pay Client Dialog ────────────────────────────────────────── */}
        <Dialog open={payClientOpen} onClose={() => setPayClientOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Pay Client
            <IconButton onClick={() => setPayClientOpen(false)}><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ p: 2 }}>
            {clientDetail && (
              <Box sx={{ mb: 2, p: 1.5, bgcolor: '#fef3c7', borderRadius: 2, textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">We Owe (Negative Balance)</Typography>
                <Typography variant="h5" fontWeight={700} color="warning.dark">
                  ₹{clientDetail.current_balance.toLocaleString()}
                </Typography>
              </Box>
            )}
            <TextField label="Amount" type="number" fullWidth size="small" value={payOutAmount}
              onChange={e => setPayOutAmount(Number(e.target.value))} sx={{ mb: 2 }}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Payment Mode</InputLabel>
              <Select value={payOutMode} label="Payment Mode"
                onChange={e => setPayOutMode(e.target.value as any)}>
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="upi">UPI</MenuItem>
                <MenuItem value="cheque">Cheque</MenuItem>
                <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
              </Select>
            </FormControl>
            <TextField label="Reference" fullWidth size="small" value={payOutRef}
              onChange={e => setPayOutRef(e.target.value)} sx={{ mb: 2 }} />
            <TextField label="Notes" fullWidth size="small" multiline rows={2} value={payOutNotes}
              onChange={e => setPayOutNotes(e.target.value)} />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setPayClientOpen(false)} sx={{ flex: 1 }}>Cancel</Button>
            <Button variant="contained" color="warning" onClick={handlePayClient}
              disabled={payOutAmount <= 0 || payOutLoading} sx={{ flex: 2, py: 1.5, fontWeight: 700, borderRadius: 2 }}>
              {payOutLoading ? <CircularProgress size={24} color="inherit" /> : `Pay ₹${payOutAmount.toLocaleString()}`}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Send Email Dialog ────────────────────────────────────────── */}
        <Dialog open={sendEmailOpen} onClose={() => setSendEmailOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Send Email Reminder
            <IconButton onClick={() => setSendEmailOpen(false)}><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ p: 2 }}>
            <TextField label="To Email" fullWidth size="small" type="email" value={emailTo}
              onChange={e => setEmailTo(e.target.value)} sx={{ mb: 2 }} />
            <TextField label="Subject" fullWidth size="small" value={emailSubject}
              onChange={e => setEmailSubject(e.target.value)} sx={{ mb: 2 }} />
            <TextField label="Body" fullWidth multiline rows={8} size="small" value={emailBody}
              onChange={e => setEmailBody(e.target.value)} />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setSendEmailOpen(false)} sx={{ flex: 1 }}>Cancel</Button>
            <Button variant="contained" startIcon={<EmailIcon />} onClick={handleSendEmail}
              disabled={!emailTo || emailLoading} sx={{ flex: 2, py: 1.5, fontWeight: 700, borderRadius: 2 }}>
              {emailLoading ? <CircularProgress size={24} color="inherit" /> : 'Send Email'}
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
          <B2BIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700}>Wholesale / B2B</Typography>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : (
        <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pb: 10 }}>
          {/* Stat Cards */}
          {dashboard && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: 2 }}>
              <Card sx={{ borderRadius: 2, bgcolor: '#fef2f2', border: '1px solid #fecaca' }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <MoneyIcon sx={{ fontSize: 20, color: '#dc2626', mb: 0.5 }} />
                  <Typography variant="h6" fontWeight={800} color="#991b1b" sx={{ fontSize: '1rem', lineHeight: 1.2 }}>
                    ₹{(dashboard.total_to_collect / 1000).toFixed(0)}k
                  </Typography>
                  <Typography variant="caption" color="#b91c1c" sx={{ fontSize: '0.6rem' }}>Outstanding</Typography>
                </CardContent>
              </Card>
              <Card sx={{ borderRadius: 2, bgcolor: '#fffbeb', border: '1px solid #fde68a' }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <WarningIcon sx={{ fontSize: 20, color: '#d97706', mb: 0.5 }} />
                  <Typography variant="h6" fontWeight={800} color="#92400e" sx={{ fontSize: '1rem', lineHeight: 1.2 }}>
                    {dashboard.clients_over_limit}
                  </Typography>
                  <Typography variant="caption" color="#b45309" sx={{ fontSize: '0.6rem' }}>Over Limit</Typography>
                </CardContent>
              </Card>
              <Card sx={{ borderRadius: 2, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <PeopleIcon sx={{ fontSize: 20, color: '#16a34a', mb: 0.5 }} />
                  <Typography variant="h6" fontWeight={800} color="#166534" sx={{ fontSize: '1rem', lineHeight: 1.2 }}>
                    {dashboard.active_clients}
                  </Typography>
                  <Typography variant="caption" color="#15803d" sx={{ fontSize: '0.6rem' }}>Active</Typography>
                </CardContent>
              </Card>
            </Box>
          )}

          {/* Search */}
          <TextField
            fullWidth size="small" placeholder="Search clients..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            sx={{ mb: 2, bgcolor: 'white', borderRadius: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>,
              endAdornment: searchTerm ? (
                <IconButton size="small" onClick={() => setSearchTerm('')}><ClearIcon fontSize="small" /></IconButton>
              ) : null,
            }}
          />

          {/* Client List */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
              Clients ({filteredClients.length})
            </Typography>
          </Box>

          {filteredClients.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              No clients found
            </Typography>
          ) : (
            filteredClients.map(client => (
              <Card key={client.id} variant="outlined" sx={{ mb: 1, borderRadius: 2 }}>
                <CardActionArea onClick={() => handleClientClick(client)} sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body1" fontWeight={700}>{client.name}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3 }}>
                        <PhoneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">{client.phone}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="body2" fontWeight={700}
                        color={client.current_balance > 0 ? 'error.main' : 'success.main'}>
                        ₹{client.current_balance.toLocaleString()}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Limit: ₹{client.credit_limit.toLocaleString()}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ mt: 1, display: 'flex', gap: 0.5 }}>
                    <Chip label={getStatusLabel(client.balance_status)}
                      color={getStatusColor(client.balance_status) as any} size="small" sx={{ height: 22, fontSize: '0.65rem' }} />
                    <Chip label={client.price_tier.toUpperCase()} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.65rem' }} />
                  </Box>
                </CardActionArea>
              </Card>
            ))
          )}
        </Box>
      )}

      {/* FAB - Add Client */}
      <Fab color="primary" onClick={() => setAddClientOpen(true)}
        sx={{ position: 'fixed', bottom: 16, right: 16 }}>
        <AddIcon />
      </Fab>

      {/* ── Add Client Dialog ──────────────────────────────────────────── */}
      <Dialog open={addClientOpen} onClose={() => setAddClientOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Add Client
          <IconButton onClick={() => setAddClientOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2 }}>
          <TextField label="Business Name *" fullWidth size="small" value={newClient.name}
            onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))} sx={{ mb: 1.5 }} />
          <TextField label="Phone *" fullWidth size="small" value={newClient.phone}
            onChange={e => setNewClient(p => ({ ...p, phone: e.target.value }))} sx={{ mb: 1.5 }} />
          <TextField label="Contact Person" fullWidth size="small" value={newClient.contact_person}
            onChange={e => setNewClient(p => ({ ...p, contact_person: e.target.value }))} sx={{ mb: 1.5 }} />
          <TextField label="Email" fullWidth size="small" value={newClient.email}
            onChange={e => setNewClient(p => ({ ...p, email: e.target.value }))} sx={{ mb: 1.5 }} />
          <TextField label="GSTIN" fullWidth size="small" value={newClient.gstin}
            onChange={e => setNewClient(p => ({ ...p, gstin: e.target.value }))} sx={{ mb: 1.5 }} />
          <TextField label="Address" fullWidth size="small" multiline rows={2} value={newClient.address}
            onChange={e => setNewClient(p => ({ ...p, address: e.target.value }))} sx={{ mb: 1.5 }} />
          <TextField label="Credit Limit" type="number" fullWidth size="small" value={newClient.credit_limit}
            onChange={e => setNewClient(p => ({ ...p, credit_limit: Number(e.target.value) }))} sx={{ mb: 1.5 }}
            InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
          <FormControl fullWidth size="small">
            <InputLabel>Price Tier</InputLabel>
            <Select value={newClient.price_tier} label="Price Tier"
              onChange={e => setNewClient(p => ({ ...p, price_tier: e.target.value as any }))}>
              <MenuItem value="standard">Standard</MenuItem>
              <MenuItem value="silver">Silver</MenuItem>
              <MenuItem value="gold">Gold</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setAddClientOpen(false)} sx={{ flex: 1 }}>Cancel</Button>
          <Button variant="contained" onClick={handleAddClient}
            disabled={!newClient.name || !newClient.phone || addClientLoading}
            sx={{ flex: 2, py: 1.5, fontWeight: 700, borderRadius: 2 }}>
            {addClientLoading ? <CircularProgress size={24} color="inherit" /> : 'Add Client'}
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

export default B2BPage;
