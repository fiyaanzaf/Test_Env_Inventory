import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Grid, Box, Typography, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, Alert, Autocomplete, InputAdornment,
  Card, CardActionArea, Tooltip, CircularProgress
} from '@mui/material';
import {
  ShoppingCart as CartIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Delete as DeleteIcon,
  LocalOffer as PriceIcon,
  Inventory as StockIcon,
  Star as FrequentIcon
} from '@mui/icons-material';
import { b2bService } from '../../services/b2bService';
import type { B2BClient, FrequentItem, B2BOrderCreate } from '../../services/b2bService';
import { getAllProducts } from '../../services/productService';
import type { Product } from '../../services/productService';

interface B2BOrderDialogProps {
  open: boolean;
  client: B2BClient | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  lastSoldPrice: number | null;
}

export const B2BOrderDialog: React.FC<B2BOrderDialogProps> = ({
  open,
  client,
  onClose,
  onSuccess
}) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [frequentItems, setFrequentItems] = useState<FrequentItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && client) {
      loadData();
    }
  }, [open, client]);

  const loadData = async () => {
    if (!client) return;

    setProductsLoading(true);
    try {
      // Load products and frequent items in parallel
      const [productsData, frequentData] = await Promise.all([
        getAllProducts(),
        b2bService.getFrequentItems(client.id, 5)
      ]);
      setProducts(productsData);
      setFrequentItems(frequentData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setProductsLoading(false);
    }
  };

  const addToCart = async (product: Product, fromFrequent?: FrequentItem) => {
    // Check if already in cart
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      setCart(cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
      return;
    }

    // Get last price for this client
    let lastPrice: number | null = null;
    let unitPrice = product.selling_price;

    if (fromFrequent) {
      lastPrice = fromFrequent.last_sold_price;
      unitPrice = fromFrequent.last_sold_price;
    } else if (client) {
      try {
        const priceInfo = await b2bService.getLastPrice(client.id, product.id);
        lastPrice = priceInfo.last_sold_price;
        if (lastPrice) {
          unitPrice = lastPrice;
        }
      } catch {
        // No price history, use standard price
      }
    }

    setCart([...cart, {
      product,
      quantity: 1,
      unit_price: unitPrice,
      lastSoldPrice: lastPrice
    }]);
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const updatePrice = (productId: number, price: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        return { ...item, unit_price: price };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const calculateMargin = (item: CartItem): number | null => {
    if (!item.product.average_cost || item.product.average_cost === 0) return null;
    return ((item.unit_price - item.product.average_cost) / item.product.average_cost) * 100;
  };

  const getMarginColor = (margin: number | null): string => {
    if (margin === null) return 'text.secondary';
    if (margin < 0) return '#ef4444';
    if (margin < 10) return '#f59e0b';
    return '#22c55e';
  };

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const totalCost = cart.reduce((sum, item) => sum + (item.quantity * (item.product.average_cost || 0)), 0);
    const profit = subtotal - totalCost;
    const marginPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    return { subtotal, totalCost, profit, marginPercent };
  }, [cart]);

  const handleSubmit = async () => {
    if (!client || cart.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const orderData: B2BOrderCreate = {
        client_id: client.id,
        items: cart.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.unit_price
        })),
        notes: notes || undefined
      };

      await b2bService.createOrder(orderData);
      onSuccess();
      handleClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCart([]);
    setSelectedProduct(null);
    setNotes('');
    setError(null);
    onClose();
  };

  if (!client) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CartIcon color="primary" />
        New B2B Order - {client.name}
      </DialogTitle>
      
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Left Side: Product Selection */}
          <Grid size={{ xs: 12, md: 5 }}>
            {/* Frequent Items */}
            {frequentItems.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FrequentIcon fontSize="small" color="warning" />
                  Frequent Items
                </Typography>
                <Grid container spacing={1}>
                  {frequentItems.map((item) => {
                    const product = products.find(p => p.id === item.product_id);
                    if (!product) return null;
                    
                    return (
                      <Grid size={{ xs: 6 }} key={item.product_id}>
                        <Card variant="outlined">
                          <CardActionArea 
                            onClick={() => addToCart(product, item)}
                            sx={{ p: 1.5 }}
                          >
                            <Typography variant="body2" fontWeight={500} noWrap>
                              {item.product_name}
                            </Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                              <Typography variant="caption" color="text.secondary">
                                Last: ₹{item.last_sold_price}
                              </Typography>
                              <Chip 
                                size="small" 
                                label={`${item.order_count}x`}
                                sx={{ height: 18, fontSize: '0.65rem' }}
                              />
                            </Box>
                          </CardActionArea>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              </Box>
            )}

            {/* Product Search */}
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Add Products
            </Typography>
            <Autocomplete
              options={products}
              getOptionLabel={(option) => `${option.name} (${option.sku})`}
              value={selectedProduct}
              onChange={(_, newValue) => {
                if (newValue) {
                  addToCart(newValue);
                  setSelectedProduct(null);
                }
              }}
              loading={productsLoading}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Search products..."
                  size="small"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {productsLoading ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderOption={(props, option) => (
                <Box component="li" {...props}>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body2">{option.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.sku} • ₹{option.selling_price}
                    </Typography>
                  </Box>
                  <Chip 
                    size="small" 
                    label={`Stock: ${option.total_quantity}`}
                    color={option.total_quantity > 0 ? 'success' : 'error'}
                    variant="outlined"
                  />
                </Box>
              )}
            />
          </Grid>

          {/* Right Side: Cart */}
          <Grid size={{ xs: 12, md: 7 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Order Items ({cart.length})
            </Typography>
            
            {cart.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'action.hover' }}>
                <CartIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">
                  Add products to start the order
                </Typography>
              </Paper>
            ) : (
              <>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Product</TableCell>
                        <TableCell align="center">Qty</TableCell>
                        <TableCell align="right">Price</TableCell>
                        <TableCell align="right">Margin</TableCell>
                        <TableCell align="right">Total</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cart.map((item) => {
                        const margin = calculateMargin(item);
                        const lineTotal = item.quantity * item.unit_price;
                        const stockWarning = item.quantity > item.product.total_quantity;

                        return (
                          <TableRow key={item.product.id}>
                            <TableCell>
                              <Typography variant="body2" fontWeight={500}>
                                {item.product.name}
                              </Typography>
                              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                <Typography variant="caption" color="text.secondary">
                                  {item.product.sku}
                                </Typography>
                                {item.lastSoldPrice && (
                                  <Tooltip title="Last sold price">
                                    <Chip
                                      size="small"
                                      icon={<PriceIcon sx={{ fontSize: 12 }} />}
                                      label={`₹${item.lastSoldPrice}`}
                                      sx={{ height: 18, fontSize: '0.65rem' }}
                                    />
                                  </Tooltip>
                                )}
                                {stockWarning && (
                                  <Tooltip title={`Only ${item.product.total_quantity} in stock`}>
                                    <Chip
                                      size="small"
                                      icon={<StockIcon sx={{ fontSize: 12 }} />}
                                      label="Low Stock"
                                      color="warning"
                                      sx={{ height: 18, fontSize: '0.65rem' }}
                                    />
                                  </Tooltip>
                                )}
                              </Box>
                            </TableCell>
                            <TableCell align="center">
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <IconButton size="small" onClick={() => updateQuantity(item.product.id, -1)}>
                                  <RemoveIcon fontSize="small" />
                                </IconButton>
                                <Typography sx={{ mx: 1, minWidth: 30, textAlign: 'center' }}>
                                  {item.quantity}
                                </Typography>
                                <IconButton size="small" onClick={() => updateQuantity(item.product.id, 1)}>
                                  <AddIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            </TableCell>
                            <TableCell align="right">
                              <TextField
                                size="small"
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => updatePrice(item.product.id, parseFloat(e.target.value) || 0)}
                                InputProps={{
                                  startAdornment: <InputAdornment position="start">₹</InputAdornment>
                                }}
                                sx={{ width: 100 }}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Typography 
                                variant="body2" 
                                sx={{ color: getMarginColor(margin), fontWeight: 500 }}
                              >
                                {margin !== null ? `${margin.toFixed(1)}%` : '-'}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography fontWeight={500}>
                                ₹{lineTotal.toLocaleString()}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <IconButton size="small" color="error" onClick={() => removeFromCart(item.product.id)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Totals */}
                <Paper sx={{ mt: 2, p: 2, bgcolor: 'primary.50' }}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 6 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Order Notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Any special instructions..."
                      />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" color="text.secondary">
                          Profit: <span style={{ color: getMarginColor(totals.marginPercent) }}>
                            ₹{totals.profit.toLocaleString()} ({totals.marginPercent.toFixed(1)}%)
                          </span>
                        </Typography>
                        <Typography variant="h5" fontWeight="bold" color="primary">
                          Total: ₹{totals.subtotal.toLocaleString()}
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>

                {/* Credit Warning */}
                {client.current_balance + totals.subtotal > client.credit_limit && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    This order will exceed the credit limit of ₹{client.credit_limit.toLocaleString()}
                  </Alert>
                )}
              </>
            )}
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading || cart.length === 0}
          startIcon={<CartIcon />}
        >
          {loading ? 'Creating Order...' : `Create Order (₹${totals.subtotal.toLocaleString()})`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default B2BOrderDialog;
