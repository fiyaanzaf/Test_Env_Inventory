import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Tabs, Tab, Chip, CircularProgress, TextField, InputAdornment,
  Card, CardContent, CardActions, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, MenuItem, Select, FormControl, InputLabel, IconButton, Fab,
  useMediaQuery, useTheme, Snackbar, Alert, Divider, Stack, List, ListItem,
  ListItemText
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  LocalShipping as ShippingIcon,
  CheckCircle as ReceivedIcon,
  Drafts as DraftIcon,
  Search as SearchIcon,
  Cancel as CancelIcon,
  Close as CloseIcon,
  Remove as RemoveIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';

import {
  getPurchaseOrders, createPurchaseOrder, getPurchaseOrderDetails, updatePOStatus,
  receivePurchaseOrder,
  type PurchaseOrder, type PurchaseOrderDetail, type POCreatePayload
} from '../services/purchaseService';
import { getSuppliers, type Supplier } from '../services/catalogService';
import { getAllProducts, type Product } from '../services/productService';
import { getLocations, type Location } from '../services/inventoryService';

// ── Inline types ────────────────────────────────────────────────────────────
interface OrderItemDraft {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_cost: number;
}

// ── Main Component ──────────────────────────────────────────────────────────
export const OrdersPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Data
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  // Filters
  const [tabValue, setTabValue] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [orderDetail, setOrderDetail] = useState<PurchaseOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create form
  const [newSupplierId, setNewSupplierId] = useState<number>(0);
  const [newNotes, setNewNotes] = useState('');
  const [newExpectedDate, setNewExpectedDate] = useState('');
  const [draftItems, setDraftItems] = useState<OrderItemDraft[]>([]);
  const [addProductId, setAddProductId] = useState<number>(0);
  const [addQty, setAddQty] = useState('');
  const [addCost, setAddCost] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Receive
  const [receiveWarehouseId, setReceiveWarehouseId] = useState<number>(0);
  const [receiveOrderId, setReceiveOrderId] = useState<number | null>(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false, message: '', severity: 'info'
  });

  // ── Debounce ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // ── Fetch orders ──────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getPurchaseOrders();
      const statusMap = ['draft', 'placed', 'received', 'cancelled'];
      const status = statusMap[tabValue];
      let filtered = all.filter(o => o.status === status);
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        filtered = filtered.filter(o =>
          o.supplier_name.toLowerCase().includes(s) || String(o.id).includes(s)
        );
      }
      setOrders(filtered);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load orders', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [tabValue, debouncedSearch]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Load supporting data on mount ────────────────────────────────────────
  useEffect(() => {
    getSuppliers().then(setSuppliers).catch(() => {});
    getAllProducts().then(setProducts).catch(() => {});
    getLocations().then(setLocations).catch(() => {});
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getStatusColor = (status: string): 'default' | 'primary' | 'success' | 'error' => {
    switch (status) {
      case 'draft': return 'default';
      case 'placed': return 'primary';
      case 'received': return 'success';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  // ── View details ──────────────────────────────────────────────────────────
  const handleViewDetails = async (orderId: number) => {
    setSelectedOrderId(orderId);
    setDetailsOpen(true);
    setDetailLoading(true);
    try {
      const detail = await getPurchaseOrderDetails(orderId);
      setOrderDetail(detail);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load order details', severity: 'error' });
      setDetailsOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Status actions ────────────────────────────────────────────────────────
  const handlePlaceOrder = async (orderId: number) => {
    try {
      await updatePOStatus(orderId, 'placed');
      setSnackbar({ open: true, message: 'Order placed successfully', severity: 'success' });
      fetchOrders();
    } catch {
      setSnackbar({ open: true, message: 'Failed to place order', severity: 'error' });
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    try {
      await updatePOStatus(orderId, 'cancelled');
      setSnackbar({ open: true, message: 'Order cancelled', severity: 'info' });
      fetchOrders();
    } catch {
      setSnackbar({ open: true, message: 'Failed to cancel order', severity: 'error' });
    }
  };

  const handleReceiveOrder = (orderId: number) => {
    setReceiveOrderId(orderId);
    setReceiveWarehouseId(locations[0]?.id ?? 0);
    setReceiveDialogOpen(true);
  };

  const confirmReceive = async () => {
    if (!receiveOrderId || !receiveWarehouseId) return;
    try {
      await receivePurchaseOrder(receiveOrderId, receiveWarehouseId);
      setSnackbar({ open: true, message: 'Order received into inventory', severity: 'success' });
      setReceiveDialogOpen(false);
      fetchOrders();
    } catch {
      setSnackbar({ open: true, message: 'Failed to receive order', severity: 'error' });
    }
  };

  // ── Create order ──────────────────────────────────────────────────────────
  const openCreateDialog = () => {
    setNewSupplierId(0);
    setNewNotes('');
    setNewExpectedDate('');
    setDraftItems([]);
    setAddProductId(0);
    setAddQty('');
    setAddCost('');
    setCreateOpen(true);
  };

  const handleAddItem = () => {
    if (!addProductId || !addQty || !addCost) return;
    const prod = products.find(p => p.id === addProductId);
    if (!prod) return;
    setDraftItems(prev => [...prev, {
      product_id: addProductId,
      product_name: prod.name,
      quantity: Number(addQty),
      unit_cost: Number(addCost)
    }]);
    setAddProductId(0);
    setAddQty('');
    setAddCost('');
  };

  const handleRemoveItem = (idx: number) => {
    setDraftItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitOrder = async () => {
    if (!newSupplierId || draftItems.length === 0) {
      setSnackbar({ open: true, message: 'Select supplier and add items', severity: 'error' });
      return;
    }
    setCreateLoading(true);
    try {
      const payload: POCreatePayload = {
        supplier_id: newSupplierId,
        expected_date: newExpectedDate || undefined,
        notes: newNotes || undefined,
        items: draftItems.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_cost: i.unit_cost }))
      };
      await createPurchaseOrder(payload);
      setSnackbar({ open: true, message: 'Order created', severity: 'success' });
      setCreateOpen(false);
      fetchOrders();
    } catch {
      setSnackbar({ open: true, message: 'Failed to create order', severity: 'error' });
    } finally {
      setCreateLoading(false);
    }
  };

  const draftTotal = useMemo(() => draftItems.reduce((s, i) => s + i.quantity * i.unit_cost, 0), [draftItems]);

  // ── Render action buttons per status ──────────────────────────────────────
  const renderActions = (order: PurchaseOrder) => {
    const btns: React.ReactNode[] = [
      <Button key="view" size="small" startIcon={<ViewIcon />} onClick={() => handleViewDetails(order.id)}>View</Button>
    ];
    if (order.status === 'draft') {
      btns.push(
        <Button key="place" size="small" color="primary" variant="contained"
          startIcon={<ShippingIcon />} onClick={() => handlePlaceOrder(order.id)}>Place</Button>
      );
      btns.push(
        <Button key="cancel" size="small" color="error" onClick={() => handleCancelOrder(order.id)}>Cancel</Button>
      );
    }
    if (order.status === 'placed') {
      btns.push(
        <Button key="receive" size="small" color="success" variant="contained"
          startIcon={<ReceivedIcon />} onClick={() => handleReceiveOrder(order.id)}>Receive</Button>
      );
      btns.push(
        <Button key="cancel" size="small" color="error" onClick={() => handleCancelOrder(order.id)}>Cancel</Button>
      );
    }
    return btns;
  };

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ pb: 10, minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h5" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ShippingIcon color="primary" /> Orders
          </Typography>
          <IconButton onClick={fetchOrders}><RefreshIcon /></IconButton>
        </Box>
      </Box>

      {/* Search */}
      <Box sx={{ px: 2, pb: 1 }}>
        <TextField
          fullWidth size="small" placeholder="Search supplier or ID..."
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>
          }}
          sx={{ bgcolor: 'white', borderRadius: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      </Box>

      {/* Tabs */}
      <Tabs
        value={tabValue} onChange={(_, v) => setTabValue(v)}
        variant="fullWidth" sx={{ bgcolor: 'white', borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab icon={<DraftIcon />} label="Draft" iconPosition="start" sx={{ minHeight: 48, textTransform: 'none', fontSize: '0.8rem' }} />
        <Tab icon={<ShippingIcon />} label="Placed" iconPosition="start" sx={{ minHeight: 48, textTransform: 'none', fontSize: '0.8rem' }} />
        <Tab icon={<ReceivedIcon />} label="Received" iconPosition="start" sx={{ minHeight: 48, textTransform: 'none', fontSize: '0.8rem' }} />
        <Tab icon={<CancelIcon />} label="Cancelled" iconPosition="start" sx={{ minHeight: 48, textTransform: 'none', fontSize: '0.8rem' }} />
      </Tabs>

      {/* Content */}
      <Box sx={{ px: 2, pt: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : orders.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary">{searchTerm ? 'No orders match your search.' : 'No orders in this tab.'}</Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {orders.map(order => (
              <Card key={order.id} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                    <Box>
                      <Typography fontWeight={600} variant="body1">{order.supplier_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        PO #{order.id} · {order.item_count} item{order.item_count !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                    <Chip label={order.status} color={getStatusColor(order.status)} size="small"
                      variant="outlined" sx={{ fontWeight: 600, textTransform: 'capitalize', borderRadius: 1 }} />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Typography>
                    <Typography fontWeight={700} color="primary">₹{order.total_amount.toLocaleString()}</Typography>
                  </Box>
                </CardContent>
                <Divider />
                <CardActions sx={{ px: 2, py: 1, flexWrap: 'wrap', gap: 0.5 }}>
                  {renderActions(order)}
                </CardActions>
              </Card>
            ))}
          </Stack>
        )}
      </Box>

      {/* FAB: Create Order */}
      <Fab color="primary" sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1200 }} onClick={openCreateDialog}>
        <AddIcon />
      </Fab>

      {/* ── Create Order Dialog ─────────────────────────────────────────────── */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Create Purchase Order
          <IconButton onClick={() => setCreateOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {/* Supplier */}
            <FormControl fullWidth size="small">
              <InputLabel>Supplier *</InputLabel>
              <Select value={newSupplierId} label="Supplier *" onChange={e => setNewSupplierId(Number(e.target.value))}>
                {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField fullWidth size="small" label="Expected Date" type="date" value={newExpectedDate}
              onChange={e => setNewExpectedDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField fullWidth size="small" label="Notes" multiline rows={2} value={newNotes}
              onChange={e => setNewNotes(e.target.value)} />

            <Divider><Chip label="Add Items" size="small" /></Divider>

            {/* Add item row */}
            <FormControl fullWidth size="small">
              <InputLabel>Product</InputLabel>
              <Select value={addProductId} label="Product" onChange={e => setAddProductId(Number(e.target.value))}>
                {products.map(p => <MenuItem key={p.id} value={p.id}>{p.name} ({p.sku})</MenuItem>)}
              </Select>
            </FormControl>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField size="small" label="Qty" type="number" value={addQty} onChange={e => setAddQty(e.target.value)} sx={{ flex: 1 }} />
              <TextField size="small" label="Unit Cost" type="number" value={addCost} onChange={e => setAddCost(e.target.value)} sx={{ flex: 1 }} />
              <Button variant="outlined" onClick={handleAddItem} sx={{ minWidth: 44 }}><AddIcon /></Button>
            </Box>

            {/* Items list */}
            {draftItems.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Items ({draftItems.length})</Typography>
                {draftItems.map((item, idx) => (
                  <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5, borderBottom: '1px solid #f0f0f0' }}>
                    <Box>
                      <Typography variant="body2" fontWeight={500}>{item.product_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.quantity} × ₹{item.unit_cost} = ₹{(item.quantity * item.unit_cost).toLocaleString()}
                      </Typography>
                    </Box>
                    <IconButton size="small" color="error" onClick={() => handleRemoveItem(idx)}><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                ))}
                <Box sx={{ mt: 1, textAlign: 'right' }}>
                  <Typography fontWeight={700} color="primary">Total: ₹{draftTotal.toLocaleString()}</Typography>
                </Box>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmitOrder} disabled={createLoading || !newSupplierId || draftItems.length === 0}>
            {createLoading ? <CircularProgress size={20} /> : 'Create Order'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Order Details Dialog ────────────────────────────────────────────── */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Order #{selectedOrderId}
          <IconButton onClick={() => setDetailsOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {detailLoading || !orderDetail ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : (
            <Stack spacing={2}>
              <Box sx={{ bgcolor: '#f8fafc', p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">Supplier</Typography>
                <Typography fontWeight={600}>{orderDetail.supplier}</Typography>
                <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Status</Typography>
                    <Chip label={orderDetail.status} size="small" sx={{ ml: 1, textTransform: 'capitalize' }}
                      color={getStatusColor(orderDetail.status)} variant="outlined" />
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Date</Typography>
                    <Typography variant="body2">{new Date(orderDetail.date).toLocaleDateString()}</Typography>
                  </Box>
                </Box>
                {orderDetail.notes && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">Notes</Typography>
                    <Typography variant="body2">{orderDetail.notes}</Typography>
                  </Box>
                )}
              </Box>

              <Typography variant="subtitle2">Items ({orderDetail.items.length})</Typography>
              <List disablePadding>
                {orderDetail.items.map((item, idx) => (
                  <ListItem key={idx} divider sx={{ px: 0 }}>
                    <ListItemText
                      primary={<Typography fontWeight={500} variant="body2">{item.name}</Typography>}
                      secondary={`SKU: ${item.sku} · Qty: ${item.qty} × ₹${item.cost}`}
                    />
                    <Typography fontWeight={600} variant="body2">₹{item.subtotal.toLocaleString()}</Typography>
                  </ListItem>
                ))}
              </List>
              <Box sx={{ textAlign: 'right', pt: 1 }}>
                <Typography variant="h6" fontWeight={700} color="primary">Total: ₹{orderDetail.total.toLocaleString()}</Typography>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setDetailsOpen(false)}>Close</Button></DialogActions>
      </Dialog>

      {/* ── Receive Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={receiveDialogOpen} onClose={() => setReceiveDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Receive Order #{receiveOrderId}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel>Warehouse</InputLabel>
            <Select value={receiveWarehouseId} label="Warehouse" onChange={e => setReceiveWarehouseId(Number(e.target.value))}>
              {locations.map(l => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReceiveDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={confirmReceive} disabled={!receiveWarehouseId}>Receive</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default OrdersPage;
