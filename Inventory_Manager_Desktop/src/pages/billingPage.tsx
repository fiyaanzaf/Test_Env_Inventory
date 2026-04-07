import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box, Paper, Typography, TextField, Button,
  Divider, IconButton,
  List, ListItem, ListItemText, Chip, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, ToggleButtonGroup, ToggleButton, Badge,
  Snackbar, Alert, Popover, Tooltip
} from '@mui/material';
import {
  Search as SearchIcon,
  ShoppingCart as CartIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  ReceiptLong as ReceiptIcon,
  PauseCircle as HoldIcon,
  PlayCircle as ResumeIcon,
  Clear as ClearIcon,
  Category as CategoryIcon,
  FiberManualRecord as DotIcon
} from '@mui/icons-material';

// Service Imports (Note the explicit 'type' usage here)
import { getPOSProducts, createSalesOrder, type POSProduct, type CartItem } from '../services/posService';
import { lookupCustomerByPhone, redeemLoyaltyPoints, addLoyaltyPoints, getLoyaltySettings, calculatePointsLocally } from '../services/loyaltyService';
import { openInvoicePDF } from '../services/invoiceService';

// Component Imports
import ActiveOrdersPane, { type HeldOrder as ActiveHeldOrder } from '../components/ActiveOrdersPane';
import { CheckoutDialog } from '../components/CheckoutDialog';
import { ReceiptTemplate, type ReceiptData } from '../components/ReceiptTemplate';
import { AddUserDialog } from '../components/AddUserDialog';
import { ProductCard } from '../components/ProductCard';
import { CustomerInfoPanel } from '../components/CustomerInfoPanel';
import { QRCodeSVG } from 'qrcode.react';

// --- Types ---
interface HeldOrder {
  id: string;
  cart: CartItem[];
  customerName: string;
  customerPhone: string;
  heldAt: Date;
}

export const BillingPage: React.FC = () => {
  // --- State: Inventory & Cart ---
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  // --- State: UI & Filters ---
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // --- State: Customer Data ---
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerPoints, setCustomerPoints] = useState<number>(0);
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false);
  const [addCustomerDialogOpen, setAddCustomerDialogOpen] = useState(false);

  // --- State: Dialogs & Flow ---
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [heldOrdersDialogOpen, setHeldOrdersDialogOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  // --- State: Post-Sale Data ---
  const [lastOrderId, setLastOrderId] = useState<number | null>(null);
  const [lastPaymentMethod, setLastPaymentMethod] = useState<string>('');
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // --- State: Held Orders & Notifications ---
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>(() => {
    try {
      const saved = localStorage.getItem('held_orders');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((o: any) => ({ ...o, heldAt: new Date(o.heldAt) }));
      }
    } catch { /* ignore */ }
    return [];
  });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'info' | 'warning' }>({
    open: false,
    message: '',
    severity: 'info'
  });

  // --- State: Wireless Scanner WebSocket ---
  const [scannerConnected, setScannerConnected] = useState(false);
  const [qrAnchor, setQrAnchor] = useState<HTMLElement | null>(null);
  const scannerWsRef = useRef<WebSocket | null>(null);
  const scannerReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addToCartRef = useRef<(product: POSProduct, quantity?: number) => void>(() => { });

  // Generate a stable room code for this cashier session — persists across tab navigation
  const [roomCode] = useState(() => {
    const existing = sessionStorage.getItem('billing_room_code');
    if (existing) return existing;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    sessionStorage.setItem('billing_room_code', code);
    return code;
  });

  useEffect(() => {
    loadInventory();
  }, []);

  // Persist held orders to localStorage
  useEffect(() => {
    localStorage.setItem('held_orders', JSON.stringify(heldOrders));
  }, [heldOrders]);

  // --- Effect: Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2: Clear Cart
      if (e.key === 'F2') {
        e.preventDefault();
        clearCart();
        setSnackbar({ open: true, message: 'Cart cleared (F2)', severity: 'info' });
      }
      // F4 or F9: Checkout
      if ((e.key === 'F4' || e.key === 'F9') && cart.length > 0 && !processing) {
        e.preventDefault();
        handleInitiateCheckout();
      }
      // F8: Hold Order
      if (e.key === 'F8' && cart.length > 0) {
        e.preventDefault();
        holdCurrentOrder();
      }
      // Shift+F9: Show Held Orders
      if (e.key === 'F9' && e.shiftKey) {
        e.preventDefault();
        setHeldOrdersDialogOpen(true);
      }
      // Escape: Search Focus or Close Dialog
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isCheckoutOpen) {
          setIsCheckoutOpen(false);
        } else {
          searchInputRef.current?.focus();
          setSearchTerm('');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, processing, isCheckoutOpen]);

  // --- Helper Functions ---
  const loadInventory = async () => {
    setLoading(true);
    try {
      const data = await getPOSProducts();
      setProducts(data);
    } catch (err) {
      console.error("Failed to load POS products", err);
      setSnackbar({ open: true, message: "Failed to load inventory", severity: 'warning' });
    } finally {
      setLoading(false);
    }
  };

  // --- Computed Properties ---
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || 'Other'));
    return ['all', ...Array.from(cats).sort()];
  }, [products]);

  // Pre-compute cart quantities as a Map for O(1) lookups in ProductCard
  const cartMap = useMemo(() => {
    const map = new Map<number, number>();
    cart.forEach(item => map.set(item.id, item.cartQty));
    return map;
  }, [cart]);

  const cartTotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + (item.price * item.cartQty), 0);
  }, [cart]);

  const cartItemCount = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.cartQty, 0);
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

  const activeOrders: ActiveHeldOrder[] = useMemo(() => {
    return heldOrders.map(order => ({
      id: order.id,
      name: order.customerName || 'Walk-in Customer',
      items: order.cart,
      totalAmount: order.cart.reduce((acc, item) => acc + (item.price * item.cartQty), 0),
      timestamp: order.heldAt
    }));
  }, [heldOrders]);

  // --- Cart Actions ---
  const addToCart = useCallback((product: POSProduct, quantity: number = 1) => {
    if (product.stock_quantity <= 0) return;
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        const newQty = Math.min(existing.cartQty + quantity, product.stock_quantity);
        if (newQty === existing.cartQty) return prev;
        return prev.map(item => item.id === product.id ? { ...item, cartQty: newQty } : item);
      } else {
        const qty = Math.min(quantity, product.stock_quantity);
        return [...prev, { ...product, cartQty: qty }];
      }
    });
  }, []);

  // Keep ref in sync with latest addToCart
  addToCartRef.current = addToCart;

  // --- Effect: Wireless Scanner WebSocket ---
  useEffect(() => {
    const connectScanner = () => {
      const wsUrl = `ws://${window.location.hostname}:8001/ws/scanner?role=desktop&room=${roomCode}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[Scanner WS] Desktop connected');
        setScannerConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'scan' && data.product) {
            const p: POSProduct = {
              id: data.product.id,
              name: data.product.name,
              sku: data.product.sku,
              price: data.product.price,
              stock_quantity: data.product.stock_quantity,
              category: data.product.category
            };
            addToCartRef.current(p);
            setSnackbar({
              open: true,
              message: `[Scan] ${p.name} - Rs.${p.price}`,
              severity: 'success'
            });
          } else if (data.type === 'scan_error') {
            setSnackbar({
              open: true,
              message: `[Scan] ${data.message}`,
              severity: 'warning'
            });
          } else if (data.type === 'phone_joined') {
            setSnackbar({
              open: true,
              message: `Scanner joined room ${roomCode}`,
              severity: 'info'
            });
          }
        } catch (err) {
          console.error('[Scanner WS] Parse error:', err);
        }
      };

      ws.onclose = () => {
        console.log('[Scanner WS] Desktop disconnected');
        setScannerConnected(false);
        scannerReconnectRef.current = setTimeout(connectScanner, 5000);
      };

      ws.onerror = () => {
        setScannerConnected(false);
      };

      scannerWsRef.current = ws;
    };

    connectScanner();

    // Instant reconnect after laptop wake from sleep
    const handleVisibility = () => {
      if (!document.hidden) {
        const ws = scannerWsRef.current;
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          console.log('[Scanner WS] Page visible, reconnecting...');
          if (scannerReconnectRef.current) clearTimeout(scannerReconnectRef.current);
          connectScanner();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (scannerReconnectRef.current) clearTimeout(scannerReconnectRef.current);
      if (scannerWsRef.current) {
        scannerWsRef.current.onclose = null;
        scannerWsRef.current.close();
      }
    };
  }, []);

  const updateQty = (productId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id !== productId) return item;
      const newQty = item.cartQty + delta;
      if (newQty < 1 || newQty > item.stock_quantity) return item;
      return { ...item, cartQty: newQty };
    }));
  };

  const setItemQty = (productId: number, newQty: number) => {
    setCart(prev => prev.map(item => {
      if (item.id !== productId) return item;
      if (newQty < 1 || newQty > item.stock_quantity) return item;
      return { ...item, cartQty: newQty };
    }));
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerId(null);
    setCustomerPoints(0);
  };

  // --- Customer Lookup ---
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
        setSnackbar({ open: true, message: `Welcome back, ${customer.name}! (${customer.loyalty_points} points)`, severity: 'success' });
      } else {
        setCustomerId(null);
        setCustomerPoints(0);
      }
    } catch (err) {
      console.error('Customer lookup failed:', err);
      setCustomerId(null);
      setCustomerPoints(0);
    } finally {
      setCustomerLookupLoading(false);
    }
  };

  const handleCustomerCreated = (customer: { id: number; name: string; phone: string; email?: string }) => {
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
    setCustomerPoints(0); // New customer starts with 0 points
    setSnackbar({ open: true, message: `Customer "${customer.name}" registered successfully!`, severity: 'success' });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && filteredProducts.length > 0) {
      const firstInStock = filteredProducts.find(p => p.stock_quantity > 0);
      if (firstInStock) {
        addToCart(firstInStock);
        setSearchTerm('');
      }
    }
  };

  // --- Hold Logic ---
  const holdCurrentOrder = () => {
    if (cart.length === 0) return;
    const heldOrder: HeldOrder = {
      id: `HOLD-${Date.now()}`,
      cart: [...cart],
      customerName,
      customerPhone,
      heldAt: new Date()
    };
    setHeldOrders(prev => [...prev, heldOrder]);
    clearCart();
    setSnackbar({ open: true, message: 'Order parked successfully (F8)', severity: 'success' });
  };

  const resumeHeldOrder = (orderId: string) => {
    const order = heldOrders.find(o => o.id === orderId);
    if (!order) return;
    if (cart.length > 0) holdCurrentOrder();
    setCart(order.cart);
    setCustomerName(order.customerName);
    setCustomerPhone(order.customerPhone);
    setHeldOrders(prev => prev.filter(o => o.id !== orderId));
    setHeldOrdersDialogOpen(false);
    setSnackbar({ open: true, message: 'Order resumed', severity: 'info' });
  };

  const deleteHeldOrder = (orderId: string) => {
    setHeldOrders(prev => prev.filter(o => o.id !== orderId));
  };

  // --- Checkout Logic ---
  const handleInitiateCheckout = () => {
    if (cart.length === 0) {
      alert("Cannot checkout with empty cart");
      return;
    }
    setIsCheckoutOpen(true);
  };

  // --- MAIN SALE HANDLER ---
  const handleFinalizeSale = async (
    method: string,
    reference: string,
    shouldPrint: boolean,
    pointsRedeemed: number,
    saleCustomerId: number | null,
    khataCustomerId?: number | null
  ) => {
    setProcessing(true);
    try {
      // 1. If redeeming points, do that first
      let discountAmount = 0;
      if (pointsRedeemed > 0 && saleCustomerId) {
        try {
          const redeemResult = await redeemLoyaltyPoints(saleCustomerId, pointsRedeemed);
          discountAmount = redeemResult.discount_amount;
        } catch (err) {
          console.error('Failed to redeem points:', err);
          // Continue with sale even if points redemption fails
        }
      }

      // 2. Create the sale
      const adjustedTotal = cartTotal - discountAmount;
      const payload = {
        customer_name: customerName || "Walk-in Customer",
        customer_phone: customerPhone || undefined,
        sales_channel: 'in-store' as const,
        payment_method: method as 'cash' | 'card' | 'upi' | 'credit',
        payment_reference: reference || null,
        khata_customer_id: (method === 'credit' && khataCustomerId) ? khataCustomerId : undefined,
        items: cart.map(item => ({
          product_id: item.id,
          quantity: item.cartQty,
          unit_price: item.price
        }))
      };

      const res = await createSalesOrder(payload);

      // 3. Add loyalty points for the purchase (if registered customer)
      if (saleCustomerId) {
        try {
          const settings = await getLoyaltySettings();
          const pointsEarned = calculatePointsLocally(adjustedTotal, settings.earn_per_rupees);
          if (pointsEarned > 0) {
            await addLoyaltyPoints(saleCustomerId, pointsEarned, res.id);
            setSnackbar({ open: true, message: `Customer earned ${pointsEarned} loyalty points!`, severity: 'success' });
          }
        } catch (err) {
          console.error('Failed to add loyalty points:', err);
        }
      }

      // 4. Setup Print Data (if needed)
      if (shouldPrint) {
        setReceiptData({
          orderId: res.id,
          date: new Date().toLocaleString(),
          customerName: customerName || "Walk-in Customer",
          items: cart.map(c => ({ name: c.name, qty: c.cartQty, price: c.price })),
          total: adjustedTotal,
          paymentMethod: method,
          reference: reference
        });
        setTimeout(() => window.print(), 100);
      }

      // 5. Update UI
      setLastOrderId(res.id);
      setLastPaymentMethod(method);
      setSuccessOpen(true);
      clearCart();
      loadInventory();
      setIsCheckoutOpen(false);

    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || "Transaction Failed.";
      alert(`Transaction Failed: ${errorMessage}`);
    } finally {
      setProcessing(false);
    }
  };

  // --- JSX RENDER ---
  return (
    <Box sx={{
      height: 'calc(100vh - 100px)',
      display: 'flex',
      gap: { xs: 1, md: 2 },
      p: { xs: 1, md: 2 },
      flexDirection: { xs: 'column', lg: 'row' },
      overflow: 'hidden'
    }}>

      {/* 1. LEFT: ACTIVE ORDERS PANE */}
      <Box sx={{ width: { xs: '100%', lg: 220 }, display: { xs: 'none', md: 'block' }, height: '100%' }}>
        <ActiveOrdersPane
          orders={activeOrders}
          currentOrderId={null}
          onResume={resumeHeldOrder}
          onDelete={deleteHeldOrder}
        />
      </Box>

      {/* 2. MIDDLE: PRODUCT CATALOG */}
      <Box sx={{ flex: { lg: 6 }, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>

        {/* Search Bar */}
        <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, borderRadius: 2 }}>
          <TextField
            fullWidth
            placeholder="Scan Barcode or Search Product..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            inputRef={searchInputRef}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon color="primary" /></InputAdornment>,
              endAdornment: searchTerm && <IconButton size="small" onClick={() => setSearchTerm('')}><ClearIcon fontSize="small" /></IconButton>
            }}
            variant="outlined"
            size="small"
            autoFocus
          />

          {/* Wireless Scanner Status + Room Code (click for QR) */}
          <Tooltip title="Click to show QR code for phone pairing" arrow>
            <Chip
              icon={<DotIcon sx={{ fontSize: 10, color: scannerConnected ? '#22c55e' : '#94a3b8' }} />}
              label={scannerConnected ? `Room: ${roomCode}` : 'Scanner Off'}
              size="small"
              variant="outlined"
              onClick={(e) => setQrAnchor(e.currentTarget)}
              sx={{
                borderColor: scannerConnected ? '#22c55e' : '#ddd',
                color: scannerConnected ? '#22c55e' : '#94a3b8',
                fontWeight: 700,
                fontSize: '0.75rem',
                height: 28,
                letterSpacing: 0.5,
                cursor: 'pointer',
              }}
            />
          </Tooltip>
          <Popover
            open={Boolean(qrAnchor)}
            anchorEl={qrAnchor}
            onClose={() => setQrAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <Box sx={{ p: 3, textAlign: 'center', minWidth: 200 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, color: '#334155' }}>
                Scan to Pair Phone
              </Typography>
              <Box sx={{ p: 1.5, bgcolor: '#fff', borderRadius: 2, border: '2px solid #e2e8f0', display: 'inline-block' }}>
                <QRCodeSVG value={`DESK:${roomCode}`} size={140} />
              </Box>
              <Typography variant="h5" fontWeight={800} sx={{ mt: 1.5, letterSpacing: 4, color: '#1e293b' }}>
                {roomCode}
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mt: 0.5 }}>
                Or enter this code manually on the phone
              </Typography>
            </Box>
          </Popover>
        </Paper>

        {/* Categories */}
        <Paper sx={{ px: 2, py: 1, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <CategoryIcon color="action" />
          <Box sx={{ flex: 1, overflowX: 'auto' }}>
            <ToggleButtonGroup value={selectedCategory} exclusive onChange={(_, value) => value && setSelectedCategory(value)} size="small">
              {categories.map(cat => (
                <ToggleButton key={cat} value={cat} sx={{ px: 2, borderRadius: '16px !important', mx: 0.5, textTransform: 'capitalize' }}>
                  {cat === 'all' ? 'All' : cat}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        </Paper>

        {/* Product Grid (Using CSS Grid via Box) */}
        <Box sx={{ flex: 1, overflowY: 'auto', pr: 0.5 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : filteredProducts.length === 0 ? (
            <Typography align="center" color="text.secondary" py={4}>No products found</Typography>
          ) : (
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
              gap: 2
            }}>
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
      </Box>

      {/* 3. RIGHT: SHOPPING CART */}
      <Paper elevation={3} sx={{ flex: { lg: 3 }, display: 'flex', flexDirection: 'column', borderRadius: 2, minWidth: { lg: 280 }, maxWidth: { lg: 380 } }}>
        <Box sx={{ px: 2, py: 1, bgcolor: '#667eea', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Badge badgeContent={cartItemCount} color="error"><CartIcon /></Badge>
            <Typography fontWeight="bold">Cart</Typography>
          </Box>
          {cart.length > 0 && <Button variant="contained" size="small" onClick={holdCurrentOrder} sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>Hold</Button>}
        </Box>

        <List sx={{ flex: 1, overflowY: 'auto' }}>
          {cart.map(item => (
            <React.Fragment key={item.id}>
              <ListItem sx={{ py: 1, flexDirection: 'column', alignItems: 'stretch' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography fontWeight="500">{item.name}</Typography>
                  <IconButton size="small" color="error" onClick={() => removeFromCart(item.id)}><DeleteIcon fontSize="small" /></IconButton>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                  <Typography variant="caption">₹{item.price}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', border: '1px solid #ddd', borderRadius: 1 }}>
                    <IconButton size="small" onClick={() => updateQty(item.id, -1)}><RemoveIcon fontSize="small" /></IconButton>
                    <TextField value={item.cartQty} onChange={(e) => setItemQty(item.id, parseInt(e.target.value) || 1)} size="small" variant="standard" inputProps={{ style: { textAlign: 'center', width: 30 } }} sx={{ '& .MuiInput-underline:before': { display: 'none' }, '& .MuiInput-underline:after': { display: 'none' } }} />
                    <IconButton size="small" onClick={() => updateQty(item.id, 1)}><AddIcon fontSize="small" /></IconButton>
                  </Box>
                  <Typography fontWeight="bold">₹{item.price * item.cartQty}</Typography>
                </Box>
              </ListItem>
              <Divider />
            </React.Fragment>
          ))}
        </List>

        {/* Customer Info Input - Enhanced with Loyalty */}
        <CustomerInfoPanel
          customerPhone={customerPhone}
          customerName={customerName}
          customerId={customerId}
          customerPoints={customerPoints}
          customerLookupLoading={customerLookupLoading}
          onPhoneChange={setCustomerPhone}
          onNameChange={setCustomerName}
          onPhoneLookup={handlePhoneLookup}
          onAddCustomerClick={() => setAddCustomerDialogOpen(true)}
        />

        {/* Totals & Checkout Button */}
        <Box sx={{ p: 2, bgcolor: '#f8f9fa', borderTop: '1px solid #e0e0e0' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">Total</Typography>
            <Typography variant="h5" color="primary" fontWeight="bold">₹{cartTotal.toLocaleString()}</Typography>
          </Box>
          <Button variant="contained" size="large" fullWidth onClick={handleInitiateCheckout} disabled={cart.length === 0 || processing}>
            Checkout (F9)
          </Button>
        </Box>
      </Paper>

      {/* --- DIALOGS --- */}

      {/* 1. Checkout Dialog (Payment Selection) */}
      <CheckoutDialog
        open={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        onConfirm={handleFinalizeSale}
        totalAmount={cartTotal}
        customerName={customerName}
        customerPhone={customerPhone}
        items={cart}
        customerId={customerId}
        customerPoints={customerPoints}
      />

      {/* 2. Success Dialog (Shows Bill Number) */}
      <Dialog open={successOpen} onClose={() => setSuccessOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ textAlign: 'center' }}><ReceiptIcon color="success" sx={{ fontSize: 50 }} /></DialogTitle>
        <DialogContent sx={{ textAlign: 'center' }}>
          <Typography variant="h3" fontWeight="bold" color="primary">#{lastOrderId}</Typography>
          <Typography variant="caption" display="block" sx={{ mb: 2, letterSpacing: 1 }}>BILL NUMBER</Typography>
          <Chip label={`PAID VIA ${lastPaymentMethod.toUpperCase()}`} />
          <Typography variant="caption" display="block" sx={{ mt: 2, color: 'text.secondary' }}>
            Write this number on the bill.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 3, flexDirection: 'column', gap: 1 }}>
          <Button
            variant="outlined"
            fullWidth
            onClick={() => lastOrderId && openInvoicePDF(lastOrderId)}
            startIcon={<ReceiptIcon />}
          >
            Download Invoice
          </Button>
          <Button variant="contained" fullWidth onClick={() => setSuccessOpen(false)}>Start New Sale (Enter)</Button>
        </DialogActions>
      </Dialog>

      {/* 3. Held Orders Dialog */}
      <Dialog open={heldOrdersDialogOpen} onClose={() => setHeldOrdersDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HoldIcon color="warning" /> Held Orders ({heldOrders.length})
          </Box>
        </DialogTitle>
        <DialogContent>
          {heldOrders.length === 0 ? <Typography align="center" py={4}>No held orders</Typography> : (
            <List>
              {heldOrders.map(order => (
                <ListItem key={order.id} secondaryAction={
                  <Box>
                    <IconButton color="primary" onClick={() => resumeHeldOrder(order.id)}><ResumeIcon /></IconButton>
                    <IconButton color="error" onClick={() => deleteHeldOrder(order.id)}><DeleteIcon /></IconButton>
                  </Box>
                }>
                  <ListItemText
                    primary={order.customerName || 'Walk-in'}
                    secondary={`Items: ${order.cart.length} • ${order.heldAt.toLocaleTimeString()}`}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setHeldOrdersDialogOpen(false)}>Close</Button></DialogActions>
      </Dialog>

      {/* 4. Add Customer Dialog */}
      <AddUserDialog
        open={addCustomerDialogOpen}
        onClose={() => setAddCustomerDialogOpen(false)}
        onSuccess={() => { }}
        initialTab={1}
        initialPhone={customerPhone}
        initialName={customerName}
        onCustomerCreated={handleCustomerCreated}
      />

      {/* --- HIDDEN PRINTABLE RECEIPT --- */}
      <Box sx={{ display: 'none', '@media print': { display: 'block' } }}>
        <ReceiptTemplate data={receiptData} />
      </Box>
      <style>{`
          @media print {
              body * { visibility: hidden; }
              .printable-receipt, .printable-receipt * { visibility: visible; display: block !important; }
              .printable-receipt { position: absolute; left: 0; top: 0; width: 100%; }
          }
      `}</style>

      {/* --- NOTIFICATIONS --- */}
      <Snackbar open={snackbar.open} autoHideDuration={2000} onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}>
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default BillingPage;