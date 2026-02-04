import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, Paper, Divider,
  InputAdornment, IconButton, List,
  Alert, CircularProgress, Autocomplete
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  AccountBalance as KhataIcon,
  ShoppingCart as CartIcon
} from '@mui/icons-material';
import { getPOSProducts, createSalesOrder, type POSProduct, type CartItem } from '../../services/posService';
import type { KhataCustomer } from '../../services/khataService';

interface QuickCreditSaleDialogProps {
  open: boolean;
  onClose: () => void;
  customer: KhataCustomer;
  onSuccess: (orderId: number) => void;
}

const QuickCreditSaleDialog: React.FC<QuickCreditSaleDialogProps> = ({
  open, onClose, customer, onSuccess
}) => {
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState<POSProduct | null>(null);
  const [inputValue, setInputValue] = useState('');

  // Load products on open
  useEffect(() => {
    if (open) {
      loadProducts();
      setCart([]);
      setError(null);
    }
  }, [open]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await getPOSProducts();
      setProducts(data.filter(p => p.stock_quantity > 0));
    } catch (err) {
      console.error('Failed to load products:', err);
      setError('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  // Cart calculations
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.price * item.cartQty), 0);
  }, [cart]);

  const availableCredit = customer.credit_limit - customer.current_balance;
  const isOverLimit = cartTotal > availableCredit;

  // Add to cart
  const handleAddToCart = (product: POSProduct) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id
            ? { ...item, cartQty: Math.min(item.cartQty + 1, item.stock_quantity) }
            : item
        );
      }
      return [...prev, { ...product, cartQty: 1 }];
    });
    setSearchValue(null);
    setInputValue('');
  };

  // Update quantity
  const updateQty = (productId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const newQty = item.cartQty + delta;
        if (newQty <= 0) return item;
        if (newQty > item.stock_quantity) return item;
        return { ...item, cartQty: newQty };
      }
      return item;
    }));
  };

  // Remove from cart
  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  // Complete sale
  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      setError('Add at least one product to the cart');
      return;
    }

    if (isOverLimit) {
      setError('Sale amount exceeds available credit');
      return;
    }

    if (customer.is_blocked) {
      setError('Customer is blocked from credit purchases');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        customer_name: customer.name,
        customer_phone: customer.phone,
        sales_channel: 'in-store' as const,
        payment_method: 'credit' as const,
        khata_customer_id: customer.id,
        items: cart.map(item => ({
          product_id: item.id,
          quantity: item.cartQty,
          unit_price: item.price
        }))
      };

      const result = await createSalesOrder(payload);
      onSuccess(result.id);
    } catch (err: any) {
      const message = err.response?.data?.detail || err.message || 'Failed to create sale';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ bgcolor: '#e8f5e9' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <KhataIcon color="success" />
            <Typography variant="h6">Quick Credit Sale</Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="subtitle2" fontWeight="bold">{customer.name}</Typography>
            <Typography variant="caption" color="text.secondary">{customer.phone}</Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 2 }}>
        {/* Credit Info Banner */}
        <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: '#f5f5f5' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Current Balance</Typography>
              <Typography variant="h6" color="error.main" fontWeight="bold">
                ₹{customer.current_balance.toLocaleString('en-IN')}
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem />
            <Box>
              <Typography variant="caption" color="text.secondary">Credit Limit</Typography>
              <Typography variant="h6" fontWeight="bold">
                ₹{customer.credit_limit.toLocaleString('en-IN')}
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem />
            <Box>
              <Typography variant="caption" color="text.secondary">Available Credit</Typography>
              <Typography variant="h6" color="success.main" fontWeight="bold">
                ₹{availableCredit.toLocaleString('en-IN')}
              </Typography>
            </Box>
          </Box>
        </Paper>

        {/* Product Search */}
        <Autocomplete
          value={searchValue}
          onChange={(_, newValue) => {
            if (newValue) handleAddToCart(newValue);
          }}
          inputValue={inputValue}
          onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
          options={products}
          getOptionLabel={(option) => `${option.name} (₹${option.price}) - Stock: ${option.stock_quantity}`}
          filterOptions={(options, { inputValue }) => {
            const lower = inputValue.toLowerCase();
            return options.filter(opt =>
              opt.name.toLowerCase().includes(lower) ||
              opt.sku.toLowerCase().includes(lower)
            );
          }}
          loading={loading}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Search product by name or SKU..."
              size="small"
              InputProps={{
                ...params.InputProps,
                startAdornment: (
                  <>
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                    {params.InputProps.startAdornment}
                  </>
                )
              }}
            />
          )}
          sx={{ mb: 2 }}
        />

        {/* Cart */}
        <Paper variant="outlined" sx={{ minHeight: 200, maxHeight: 300, overflowY: 'auto' }}>
          {cart.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 5, color: 'text.secondary' }}>
              <CartIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
              <Typography variant="body2">Search and add products above</Typography>
            </Box>
          ) : (
            <List disablePadding>
              {cart.map((item, index) => (
                <React.Fragment key={item.id}>
                  <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                    {/* Product Name */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight="medium" noWrap>
                        {item.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        ₹{item.price} each
                      </Typography>
                    </Box>

                    {/* Quantity Controls */}
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 0.5, 
                      bgcolor: '#f0f0f0',
                      borderRadius: 2,
                      p: 0.5,
                      flexShrink: 0
                    }}>
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); updateQty(item.id, -1); }}
                        disabled={item.cartQty <= 1}
                        sx={{ 
                          bgcolor: 'white', 
                          border: '1px solid #ccc',
                          '&:hover': { bgcolor: '#ffebee' },
                          width: 32,
                          height: 32
                        }}
                      >
                        <RemoveIcon fontSize="small" />
                      </IconButton>
                      <Typography 
                        sx={{ 
                          minWidth: 36, 
                          textAlign: 'center', 
                          fontWeight: 'bold',
                          fontSize: '1rem'
                        }}
                      >
                        {item.cartQty}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); updateQty(item.id, 1); }}
                        disabled={item.cartQty >= item.stock_quantity}
                        sx={{ 
                          bgcolor: 'white', 
                          border: '1px solid #ccc',
                          '&:hover': { bgcolor: '#e8f5e9' },
                          width: 32,
                          height: 32
                        }}
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>
                    </Box>

                    {/* Price */}
                    <Typography 
                      variant="body1" 
                      fontWeight="bold" 
                      sx={{ minWidth: 70, textAlign: 'right', flexShrink: 0 }}
                    >
                      ₹{(item.price * item.cartQty).toLocaleString('en-IN')}
                    </Typography>

                    {/* Delete */}
                    <IconButton 
                      size="small" 
                      color="error" 
                      onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }}
                      sx={{ flexShrink: 0 }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  {index < cart.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          )}
        </Paper>

        {/* Total */}
        <Box sx={{ 
          mt: 2, 
          p: 2, 
          bgcolor: isOverLimit ? '#ffebee' : '#e8f5e9', 
          borderRadius: 2, 
          textAlign: 'center',
          border: isOverLimit ? '2px solid #f44336' : '2px solid #4caf50'
        }}>
          <Typography variant="h4" fontWeight="bold" color={isOverLimit ? 'error.main' : 'success.main'}>
            ₹{cartTotal.toLocaleString('en-IN')}
          </Typography>
          {isOverLimit && (
            <Typography variant="caption" color="error.main">
              Exceeds available credit by ₹{(cartTotal - availableCredit).toLocaleString('en-IN')}
            </Typography>
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} color="inherit" size="large">
          Cancel
        </Button>
        <Button
          onClick={handleCompleteSale}
          variant="contained"
          color="success"
          size="large"
          disabled={cart.length === 0 || isOverLimit || customer.is_blocked || submitting}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <KhataIcon />}
        >
          {submitting ? 'Processing...' : 'Complete Credit Sale'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default QuickCreditSaleDialog;
