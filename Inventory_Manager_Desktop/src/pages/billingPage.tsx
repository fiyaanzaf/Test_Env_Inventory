import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box, Paper, Typography, TextField, Button,
  Card, CardActionArea, Divider, IconButton,
  List, ListItem, ListItemText, Chip, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, ToggleButtonGroup, ToggleButton, Badge,
  Tooltip, Snackbar, Alert
} from '@mui/material';
import {
  Search as SearchIcon,
  ShoppingCart as CartIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Person as PersonIcon,
  ReceiptLong as ReceiptIcon,
  PauseCircle as HoldIcon,
  PlayCircle as ResumeIcon,
  Clear as ClearIcon,
  Star as StarIcon,
  Category as CategoryIcon
} from '@mui/icons-material';

// Service Imports (Note the explicit 'type' usage here)
import { getPOSProducts, createSalesOrder, type POSProduct, type CartItem } from '../services/posService';

// Component Imports
import ActiveOrdersPane, { type HeldOrder as ActiveHeldOrder } from '../components/ActiveOrdersPane';
import { CheckoutDialog } from '../components/CheckoutDialog'; 
import { ReceiptTemplate, type ReceiptData } from '../components/ReceiptTemplate'; // <--- FIXED HERE

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
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'info' | 'warning' }>({
    open: false,
    message: '',
    severity: 'info'
  });

  // --- Effect: Load Data ---
  useEffect(() => {
    loadInventory();
  }, []);

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

  const frequentProducts = useMemo(() => {
    return products.filter(p => p.stock_quantity > 0).slice(0, 8);
  }, [products]);

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
  const handleFinalizeSale = async (method: string, reference: string, shouldPrint: boolean) => {
    setProcessing(true);
    try {
        const payload = {
            customer_name: customerName || "Walk-in Customer",
            customer_phone: customerPhone || undefined,
            sales_channel: 'in-store' as const,
            // Cast string to union type for TypeScript
            payment_method: method as 'cash' | 'card' | 'upi', 
            payment_reference: reference || null,
            items: cart.map(item => ({
                product_id: item.id,
                quantity: item.cartQty,
                unit_price: item.price
            }))
        };

        const res = await createSalesOrder(payload);
        
        // 1. Setup Print Data (if needed)
        if (shouldPrint) {
            setReceiptData({
                orderId: res.id,
                date: new Date().toLocaleString(),
                customerName: customerName || "Walk-in Customer",
                items: cart.map(c => ({ name: c.name, qty: c.cartQty, price: c.price })),
                total: cartTotal,
                paymentMethod: method,
                reference: reference
            });
            // Small timeout to allow React to render the hidden receipt before printing
            setTimeout(() => window.print(), 100);
        }

        // 2. Update UI
        setLastOrderId(res.id);
        setLastPaymentMethod(method);
        setSuccessOpen(true); // Show the Big Bill Number screen
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
              startAdornment: <InputAdornment position="start"><SearchIcon color="primary"/></InputAdornment>,
              endAdornment: searchTerm && <IconButton size="small" onClick={() => setSearchTerm('')}><ClearIcon fontSize="small" /></IconButton>
            }}
            variant="outlined"
            size="small"
            autoFocus
          />
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
              {filteredProducts.map(product => {
                const inStock = product.stock_quantity > 0;
                const inCart = cart.find(c => c.id === product.id);
                return (
                  <Card key={product.id} sx={{ height: '100%', display: 'flex', flexDirection: 'column', opacity: inStock ? 1 : 0.6, border: inCart ? '2px solid #667eea' : '1px solid #e0e0e0', position: 'relative' }}>
                    {inCart && <Chip label={`×${inCart.cartQty}`} size="small" color="primary" sx={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }} />}
                    <CardActionArea onClick={() => addToCart(product)} disabled={!inStock} sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">{product.sku}</Typography>
                        <Typography fontWeight="bold" sx={{ lineHeight: 1.2 }}>{product.name}</Typography>
                      </Box>
                      <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                         <Chip label={inStock ? `${product.stock_quantity}` : "Out"} color={inStock ? (product.stock_quantity < 5 ? "warning" : "default") : "error"} size="small" />
                         <Typography color="primary" fontWeight="bold">₹{product.price}</Typography>
                      </Box>
                    </CardActionArea>
                  </Card>
                );
              })}
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
                      <TextField value={item.cartQty} onChange={(e) => setItemQty(item.id, parseInt(e.target.value)||1)} size="small" variant="standard" inputProps={{ style: { textAlign: 'center', width: 30 } }} sx={{ '& .MuiInput-underline:before': {display:'none'}, '& .MuiInput-underline:after': {display:'none'} }} />
                      <IconButton size="small" onClick={() => updateQty(item.id, 1)}><AddIcon fontSize="small" /></IconButton>
                    </Box>
                    <Typography fontWeight="bold">₹{item.price * item.cartQty}</Typography>
                  </Box>
                </ListItem>
                <Divider />
              </React.Fragment>
            ))}
        </List>
        
        {/* Customer Info Input */}
        <Box sx={{ p: 1.5, bgcolor: '#f0f9ff', borderTop: '1px solid #e0e0e0' }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
                 <PersonIcon sx={{ color: '#667eea' }} />
                 <Typography variant="caption" color="text.secondary">Customer (Optional)</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <TextField size="small" placeholder="Phone" value={customerPhone} onChange={(e)=>setCustomerPhone(e.target.value)} fullWidth sx={{ bgcolor: 'white' }} />
                <TextField size="small" placeholder="Name" value={customerName} onChange={(e)=>setCustomerName(e.target.value)} fullWidth sx={{ bgcolor: 'white' }} />
            </Box>
        </Box>

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
        <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
            <Button variant="contained" onClick={() => setSuccessOpen(false)}>Start New Sale (Enter)</Button>
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
                                <IconButton color="primary" onClick={()=>resumeHeldOrder(order.id)}><ResumeIcon/></IconButton>
                                <IconButton color="error" onClick={()=>deleteHeldOrder(order.id)}><DeleteIcon/></IconButton>
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
        <DialogActions><Button onClick={()=>setHeldOrdersDialogOpen(false)}>Close</Button></DialogActions>
      </Dialog>

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