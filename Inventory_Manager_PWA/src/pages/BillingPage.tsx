import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, TextField, InputAdornment, Chip,
  Button, IconButton, Badge, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Snackbar, Alert, Divider, List, ListItem, ListItemText,
  ToggleButtonGroup, ToggleButton, Drawer, Slide,
  useMediaQuery, useTheme, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import {
  Search as SearchIcon,
  ShoppingCart as CartIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  ReceiptLong as ReceiptIcon,
  Clear as ClearIcon,
  Category as CategoryIcon,
  Close as CloseIcon,
  KeyboardArrowUp as ExpandIcon
} from '@mui/icons-material';

import { getPOSProducts, createSalesOrder, type POSProduct, type CartItem } from '../services/posService';
import {
  lookupCustomerByPhone, addLoyaltyPoints, redeemLoyaltyPoints,
  getLoyaltySettings, calculatePointsLocally
} from '../services/loyaltyService';
import { openInvoicePDF } from '../services/invoiceService';
import { ProductCard } from '../components/ProductCard';
import { CustomerInfoPanel } from '../components/CustomerInfoPanel';

// ── Main Component ──────────────────────────────────────────────────────────
export const BillingPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md'));

  // Products & Cart
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Customer
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerPoints, setCustomerPoints] = useState<number>(0);
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false);

  // Dialogs
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'credit'>('cash');
  const [paymentReference, setPaymentReference] = useState('');

  // Post-sale
  const [lastOrderId, setLastOrderId] = useState<number | null>(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'info' | 'warning' | 'error' }>({
    open: false, message: '', severity: 'info'
  });

  // ── Load products ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await getPOSProducts();
      setProducts(data);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load products', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // ── Computed ──────────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || 'Other'));
    return ['all', ...Array.from(cats).sort()];
  }, [products]);

  const cartTotal = useMemo(() => cart.reduce((a, i) => a + i.price * i.cartQty, 0), [cart]);
  const cartItemCount = useMemo(() => cart.reduce((a, i) => a + i.cartQty, 0), [cart]);

  // Pre-compute cart quantities as a Map for O(1) lookups in ProductCard
  const cartMap = useMemo(() => {
    const map = new Map<number, number>();
    cart.forEach(item => map.set(item.id, item.cartQty));
    return map;
  }, [cart]);

  const filteredProducts = useMemo(() => {
    let filtered = products;
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(p => (p.category || 'Other') === selectedCategory);
    }
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(lower) || p.sku.toLowerCase().includes(lower));
    }
    return filtered;
  }, [products, searchTerm, selectedCategory]);

  // ── Cart actions ──────────────────────────────────────────────────────────
  const addToCart = useCallback((product: POSProduct) => {
    if (product.stock_quantity <= 0) return;
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        if (existing.cartQty >= product.stock_quantity) return prev;
        return prev.map(i => i.id === product.id ? { ...i, cartQty: i.cartQty + 1 } : i);
      }
      return [...prev, { ...product, cartQty: 1 }];
    });
    setSnackbar({ open: true, message: `${product.name} added`, severity: 'success' });
  }, []);

  const updateQty = (productId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id !== productId) return item;
      const newQty = item.cartQty + delta;
      if (newQty < 1 || newQty > item.stock_quantity) return item;
      return { ...item, cartQty: newQty };
    }));
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(i => i.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerId(null);
    setCustomerPoints(0);
  };

  // ── Customer lookup ───────────────────────────────────────────────────────
  const handlePhoneLookup = async (phone: string) => {
    if (!phone || phone.length < 10) {
      setCustomerId(null);
      setCustomerPoints(0);
      return;
    }
    setCustomerLookupLoading(true);
    try {
      const customer = await lookupCustomerByPhone(phone);
      if (customer) {
        setCustomerId(customer.id);
        setCustomerName(customer.name);
        setCustomerPoints(customer.loyalty_points);
        setSnackbar({ open: true, message: `Welcome back, ${customer.name}!`, severity: 'success' });
      } else {
        setCustomerId(null);
        setCustomerPoints(0);
      }
    } catch {
      setCustomerId(null);
      setCustomerPoints(0);
    } finally {
      setCustomerLookupLoading(false);
    }
  };

  // ── Checkout ──────────────────────────────────────────────────────────────
  const openCheckout = () => {
    if (cart.length === 0) return;
    setCartDrawerOpen(false);
    setPaymentMethod('cash');
    setPaymentReference('');
    setCheckoutOpen(true);
  };

  const handleFinalizeSale = async () => {
    if (cart.length === 0) return;
    setProcessing(true);
    try {
      const payload = {
        customer_name: customerName || 'Walk-in Customer',
        customer_phone: customerPhone || undefined,
        sales_channel: 'in-store' as const,
        payment_method: paymentMethod,
        payment_reference: paymentReference || null,
        items: cart.map(item => ({
          product_id: item.id,
          quantity: item.cartQty,
          unit_price: item.price
        }))
      };

      const res = await createSalesOrder(payload);

      // Add loyalty points if registered customer
      if (customerId) {
        try {
          const settings = await getLoyaltySettings();
          const pointsEarned = calculatePointsLocally(cartTotal, settings.earn_per_rupees);
          if (pointsEarned > 0) {
            await addLoyaltyPoints(customerId, pointsEarned, res.id);
          }
        } catch {
          // loyalty is non-blocking
        }
      }

      setLastOrderId(res.id);
      setCheckoutOpen(false);
      setSuccessOpen(true);
      clearCart();
      loadProducts();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Transaction failed';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  // ── Columns for product grid ──────────────────────────────────────────────
  const gridCols = isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(3, 1fr)' : 'repeat(3, 1fr)';

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>

      {/* ── Top: Search ──────────────────────────────────────────────────── */}
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <TextField
          fullWidth size="small" placeholder="Search products..."
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>,
            endAdornment: searchTerm ? <IconButton size="small" onClick={() => setSearchTerm('')}><ClearIcon fontSize="small" /></IconButton> : null
          }}
          sx={{ bgcolor: 'white', borderRadius: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      </Box>

      {/* ── Category chips (scrollable) ──────────────────────────────────── */}
      <Box sx={{ px: 2, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <CategoryIcon color="action" fontSize="small" />
        <Box sx={{ flex: 1, overflowX: 'auto', whiteSpace: 'nowrap', WebkitOverflowScrolling: 'touch',
          '&::-webkit-scrollbar': { display: 'none' }, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
          <ToggleButtonGroup
            value={selectedCategory} exclusive
            onChange={(_, v) => v && setSelectedCategory(v)} size="small"
          >
            {categories.map(cat => (
              <ToggleButton key={cat} value={cat}
                sx={{ px: 1.5, py: 0.5, borderRadius: '16px !important', mx: 0.3, textTransform: 'capitalize', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                {cat === 'all' ? 'All' : cat}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* ── Product Grid ─────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pb: 10 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : filteredProducts.length === 0 ? (
          <Typography align="center" color="text.secondary" py={4}>No products found</Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: gridCols, gap: 1.5 }}>
            {filteredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                cartQty={cartMap.get(product.id) || 0}
                onAdd={addToCart}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* ── Floating Cart Bar ────────────────────────────────────────────── */}
      {cart.length > 0 && (
        <Slide direction="up" in={cart.length > 0}>
          <Box
            onClick={() => setCartDrawerOpen(true)}
            sx={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1100,
              bgcolor: 'primary.main', color: 'white',
              px: 3, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: 'pointer', boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
              borderTopLeftRadius: 16, borderTopRightRadius: 16,
              minHeight: 56
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Badge badgeContent={cartItemCount} color="error">
                <CartIcon />
              </Badge>
              <Typography fontWeight={600}>{cartItemCount} item{cartItemCount !== 1 ? 's' : ''}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6" fontWeight={700}>₹{cartTotal.toLocaleString()}</Typography>
              <ExpandIcon />
            </Box>
          </Box>
        </Slide>
      )}

      {/* ── Cart Drawer ──────────────────────────────────────────────────── */}
      <Drawer anchor="bottom" open={cartDrawerOpen} onClose={() => setCartDrawerOpen(false)}
        PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85vh' } }}>
        <Box sx={{ p: 2 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" fontWeight={700}>
              <CartIcon sx={{ verticalAlign: 'middle', mr: 1 }} />Cart ({cartItemCount})
            </Typography>
            <Box>
              <Button size="small" color="error" onClick={clearCart} sx={{ mr: 1 }}>Clear</Button>
              <IconButton onClick={() => setCartDrawerOpen(false)}><CloseIcon /></IconButton>
            </Box>
          </Box>

          {/* Items */}
          <List disablePadding sx={{ maxHeight: '40vh', overflowY: 'auto' }}>
            {cart.map(item => (
              <React.Fragment key={item.id}>
                <ListItem sx={{ px: 0, py: 1 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography fontWeight={500} variant="body2">{item.name}</Typography>
                    <Typography variant="caption" color="text.secondary">₹{item.price} each</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <IconButton size="small" onClick={() => updateQty(item.id, -1)}
                      sx={{ border: '1px solid #ddd', width: 32, height: 32 }}><RemoveIcon fontSize="small" /></IconButton>
                    <Typography fontWeight={600} sx={{ minWidth: 28, textAlign: 'center' }}>{item.cartQty}</Typography>
                    <IconButton size="small" onClick={() => updateQty(item.id, 1)}
                      sx={{ border: '1px solid #ddd', width: 32, height: 32 }}><AddIcon fontSize="small" /></IconButton>
                  </Box>
                  <Typography fontWeight={600} sx={{ ml: 1.5, minWidth: 60, textAlign: 'right' }}>
                    ₹{(item.price * item.cartQty).toLocaleString()}
                  </Typography>
                  <IconButton size="small" color="error" onClick={() => removeFromCart(item.id)} sx={{ ml: 0.5 }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItem>
                <Divider />
              </React.Fragment>
            ))}
          </List>

          {/* Customer */}
          <CustomerInfoPanel
            customerPhone={customerPhone}
            customerName={customerName}
            customerId={customerId}
            customerPoints={customerPoints}
            customerLookupLoading={customerLookupLoading}
            onPhoneChange={setCustomerPhone}
            onNameChange={setCustomerName}
            onPhoneLookup={handlePhoneLookup}
          />

          {/* Total & Checkout */}
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" fontWeight={600}>Total</Typography>
            <Typography variant="h5" fontWeight={700} color="primary">₹{cartTotal.toLocaleString()}</Typography>
          </Box>
          <Button variant="contained" fullWidth size="large" sx={{ mt: 2, py: 1.5, borderRadius: 2, fontWeight: 700, fontSize: '1rem' }}
            onClick={openCheckout} disabled={cart.length === 0}>
            Proceed to Checkout
          </Button>
        </Box>
      </Drawer>

      {/* ── Checkout Dialog ──────────────────────────────────────────────── */}
      <Dialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} fullScreen={isMobile} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Checkout
          <IconButton onClick={() => setCheckoutOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Typography variant="caption" color="text.secondary">Total Amount</Typography>
            <Typography variant="h4" fontWeight={700} color="primary">₹{cartTotal.toLocaleString()}</Typography>
          </Box>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Payment Method</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, mb: 2 }}>
            {(['cash', 'card', 'upi', 'credit'] as const).map(method => (
              <Button key={method} variant={paymentMethod === method ? 'contained' : 'outlined'}
                onClick={() => setPaymentMethod(method)}
                sx={{ py: 1.5, textTransform: 'uppercase', fontWeight: 600, borderRadius: 2 }}>
                {method}
              </Button>
            ))}
          </Box>

          {(paymentMethod === 'card' || paymentMethod === 'upi') && (
            <TextField fullWidth size="small" label="Reference / Transaction ID"
              value={paymentReference} onChange={e => setPaymentReference(e.target.value)}
              sx={{ mb: 2 }} />
          )}

          <Divider sx={{ my: 2 }} />
          <Typography variant="caption" color="text.secondary">
            {cart.length} item{cart.length !== 1 ? 's' : ''} · {customerName || 'Walk-in Customer'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCheckoutOpen(false)} sx={{ flex: 1 }}>Cancel</Button>
          <Button variant="contained" onClick={handleFinalizeSale} disabled={processing}
            sx={{ flex: 2, py: 1.5, fontWeight: 700, borderRadius: 2 }}>
            {processing ? <CircularProgress size={24} color="inherit" /> : `Pay ₹${cartTotal.toLocaleString()}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Success Dialog ───────────────────────────────────────────────── */}
      <Dialog open={successOpen} onClose={() => setSuccessOpen(false)} maxWidth="xs" fullWidth>
        <DialogContent sx={{ textAlign: 'center', py: 4 }}>
          <ReceiptIcon color="success" sx={{ fontSize: 56, mb: 1 }} />
          <Typography variant="h3" fontWeight={700} color="primary">#{lastOrderId}</Typography>
          <Typography variant="caption" display="block" sx={{ mb: 2, letterSpacing: 1 }}>BILL NUMBER</Typography>
          <Chip label={`PAID VIA ${paymentMethod.toUpperCase()}`} sx={{ mb: 2 }} />
        </DialogContent>
        <DialogActions sx={{ flexDirection: 'column', gap: 1, p: 2 }}>
          <Button variant="outlined" fullWidth startIcon={<ReceiptIcon />}
            onClick={() => lastOrderId && openInvoicePDF(lastOrderId)}>
            Download Invoice
          </Button>
          <Button variant="contained" fullWidth onClick={() => setSuccessOpen(false)}>
            New Sale
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={1500}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default BillingPage;
