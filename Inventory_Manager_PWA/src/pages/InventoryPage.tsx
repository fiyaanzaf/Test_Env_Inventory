import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Button, CircularProgress, TextField, InputAdornment,
  Chip, Card, CardContent, CardActions, Dialog, DialogTitle, DialogContent,
  DialogActions, MenuItem, Select, FormControl, InputLabel, IconButton,
  useMediaQuery, useTheme, Snackbar, Alert, Divider, Stack
} from '@mui/material';
import {
  AddBox as ReceiveIcon,
  LocalShipping as TransferIcon,
  Inventory as InventoryIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  DeleteSweep as WriteOffIcon,
  Search as SearchIcon,
  Close as CloseIcon
} from '@mui/icons-material';

import { getAllProducts, type Product } from '../services/productService';
import {
  getExpiryReport, getLocations, receiveStock, transferStock, writeOffStock, getProductStock,
  type ExpiryReportItem, type Location, type BatchInfo, type ProductStockInfo
} from '../services/inventoryService';

// ─── Receive Stock Dialog ────────────────────────────────────────────────────

interface ReceiveDialogProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  products: Product[];
  onSuccess: () => void;
}

const ReceiveStockMobileDialog: React.FC<ReceiveDialogProps> = ({ open, onClose, product, products, onSuccess }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [locations, setLocations] = useState<Location[]>([]);
  const [productId, setProductId] = useState<number>(product?.id ?? 0);
  const [quantity, setQuantity] = useState('');
  const [locationId, setLocationId] = useState<number>(0);
  const [unitCost, setUnitCost] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      getLocations().then(setLocations).catch(() => {});
      setProductId(product?.id ?? 0);
      setQuantity('');
      setLocationId(0);
      setUnitCost('');
      setExpiryDate('');
      setError('');
    }
  }, [open, product]);

  const handleSubmit = async () => {
    if (!productId || !quantity || !locationId || !unitCost) { setError('Fill all required fields'); return; }
    setSubmitting(true);
    try {
      await receiveStock({
        product_id: productId,
        quantity: Number(quantity),
        location_id: locationId,
        unit_cost: Number(unitCost),
        expiry_date: expiryDate || undefined,
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to receive stock');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Receive Stock
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        <FormControl fullWidth>
          <InputLabel>Product</InputLabel>
          <Select value={productId} label="Product" onChange={(e) => setProductId(Number(e.target.value))}>
            {products.map(p => <MenuItem key={p.id} value={p.id}>{p.name} ({p.sku})</MenuItem>)}
          </Select>
        </FormControl>
        <TextField label="Quantity" type="number" fullWidth value={quantity} onChange={(e) => setQuantity(e.target.value)} inputProps={{ min: 1 }} />
        <FormControl fullWidth>
          <InputLabel>Location</InputLabel>
          <Select value={locationId} label="Location" onChange={(e) => setLocationId(Number(e.target.value))}>
            {locations.map(l => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField label="Unit Cost (₹)" type="number" fullWidth value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputProps={{ min: 0, step: 0.01 }} />
        <TextField label="Expiry Date (optional)" type="date" fullWidth value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} InputLabelProps={{ shrink: true }} />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>Cancel</Button>
        <Button variant="contained" color="success" onClick={handleSubmit} disabled={submitting} sx={{ minHeight: 48 }}>
          {submitting ? <CircularProgress size={24} /> : 'Receive'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Transfer Stock Dialog ───────────────────────────────────────────────────

interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  onSuccess: () => void;
}

const TransferStockMobileDialog: React.FC<TransferDialogProps> = ({ open, onClose, product, onSuccess }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [locations, setLocations] = useState<Location[]>([]);
  const [fromLocationId, setFromLocationId] = useState<number>(0);
  const [toLocationId, setToLocationId] = useState<number>(0);
  const [quantity, setQuantity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      getLocations().then(setLocations).catch(() => {});
      setFromLocationId(0);
      setToLocationId(0);
      setQuantity('');
      setError('');
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!product || !fromLocationId || !toLocationId || !quantity) { setError('Fill all required fields'); return; }
    if (fromLocationId === toLocationId) { setError('Source and destination must differ'); return; }
    setSubmitting(true);
    try {
      await transferStock({
        product_id: product.id,
        quantity: Number(quantity),
        from_location_id: fromLocationId,
        to_location_id: toLocationId,
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Transfer failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Transfer: {product?.name ?? ''}
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        <FormControl fullWidth>
          <InputLabel>From Location</InputLabel>
          <Select value={fromLocationId} label="From Location" onChange={(e) => setFromLocationId(Number(e.target.value))}>
            {locations.map(l => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>To Location</InputLabel>
          <Select value={toLocationId} label="To Location" onChange={(e) => setToLocationId(Number(e.target.value))}>
            {locations.map(l => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField label="Quantity" type="number" fullWidth value={quantity} onChange={(e) => setQuantity(e.target.value)} inputProps={{ min: 1 }} />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={handleSubmit} disabled={submitting} sx={{ minHeight: 48 }}>
          {submitting ? <CircularProgress size={24} /> : 'Transfer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Write-Off Dialog ────────────────────────────────────────────────────────

interface WriteOffDialogProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  onSuccess: () => void;
}

const WriteOffMobileDialog: React.FC<WriteOffDialogProps> = ({ open, onClose, product, onSuccess }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [batchId, setBatchId] = useState<number>(0);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadingBatches, setLoadingBatches] = useState(false);

  useEffect(() => {
    if (open && product) {
      setLoadingBatches(true);
      getProductStock(product.id)
        .then((info) => setBatches(info.batches || []))
        .catch(() => setBatches([]))
        .finally(() => setLoadingBatches(false));
      setBatchId(0);
      setQuantity('');
      setReason('');
      setError('');
    }
  }, [open, product]);

  const handleSubmit = async () => {
    if (!batchId || !quantity || !reason) { setError('Fill all required fields'); return; }
    setSubmitting(true);
    try {
      await writeOffStock({ batch_id: batchId, quantity_to_remove: Number(quantity), reason });
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Write-off failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'error.main' }}>
        Write-Off: {product?.name ?? ''}
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {loadingBatches ? <CircularProgress sx={{ alignSelf: 'center' }} /> : (
          <FormControl fullWidth>
            <InputLabel>Select Batch</InputLabel>
            <Select value={batchId} label="Select Batch" onChange={(e) => setBatchId(Number(e.target.value))}>
              {batches.map(b => (
                <MenuItem key={b.id} value={b.id}>
                  {b.batch_code || `Batch #${b.id}`} — {b.location_name} — Qty: {b.quantity}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <TextField label="Quantity to Remove" type="number" fullWidth value={quantity} onChange={(e) => setQuantity(e.target.value)} inputProps={{ min: 1 }} />
        <TextField label="Reason" fullWidth multiline minRows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>Cancel</Button>
        <Button variant="contained" color="error" onClick={handleSubmit} disabled={submitting} sx={{ minHeight: 48 }}>
          {submitting ? <CircularProgress size={24} /> : 'Write Off'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Stock Details Dialog ────────────────────────────────────────────────────

interface StockDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  productId: number | null;
}

const StockDetailsMobileDialog: React.FC<StockDetailsDialogProps> = ({ open, onClose, productId }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [stockInfo, setStockInfo] = useState<ProductStockInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && productId) {
      setLoading(true);
      getProductStock(productId)
        .then(setStockInfo)
        .catch(() => setStockInfo(null))
        .finally(() => setLoading(false));
    }
  }, [open, productId]);

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Stock Details
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : stockInfo ? (
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6" fontWeight={700}>{stockInfo.product_name}</Typography>
              <Typography variant="body2" color="text.secondary">SKU: {stockInfo.sku}</Typography>
              <Chip
                label={`Total: ${stockInfo.total_quantity}`}
                color={stockInfo.total_quantity < 10 ? 'error' : 'success'}
                size="small"
                sx={{ mt: 1, fontWeight: 700 }}
              />
            </Box>
            <Divider />
            <Typography variant="subtitle2" color="text.secondary">Batches</Typography>
            {stockInfo.batches.length === 0 ? (
              <Typography color="text.secondary" variant="body2">No batches found.</Typography>
            ) : (
              stockInfo.batches.map(b => (
                <Card key={b.id} variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ pb: '8px !important' }}>
                    <Typography variant="subtitle2" fontWeight={700}>{b.batch_code || `Batch #${b.id}`}</Typography>
                    <Typography variant="body2" color="text.secondary">Location: {b.location_name}</Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                      <Chip label={`Qty: ${b.quantity}`} size="small" variant="outlined" />
                      {b.expiry_date && (
                        <Typography variant="caption" color="text.secondary">Exp: {new Date(b.expiry_date).toLocaleDateString()}</Typography>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              ))
            )}
          </Stack>
        ) : (
          <Typography color="text.secondary">No data available.</Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Main Inventory Page ─────────────────────────────────────────────────────

export const InventoryPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Expiry data
  const [expiredCount, setExpiredCount] = useState(0);
  const [nearExpiryCount, setNearExpiryCount] = useState(0);

  // Dialog states
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  const fetchExpiryData = async (days: number) => {
    try {
      const reportData = await getExpiryReport(days);
      if (Array.isArray(reportData)) {
        setExpiredCount(reportData.filter(item => item.days_left < 0).length);
        setNearExpiryCount(reportData.filter(item => item.days_left >= 0).length);
      }
    } catch (err) {
      console.error('Failed to fetch expiry data', err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [productsData] = await Promise.all([
        getAllProducts(),
        fetchExpiryData(30),
      ]);
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (err) {
      console.error('Failed to load inventory data', err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSuccess = () => {
    setSnackbar({ open: true, message: 'Operation successful!', severity: 'success' });
    loadData();
  };

  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  });

  const lowStockCount = products.filter(p => (p.total_quantity || 0) < 10).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 4, px: { xs: 1, sm: 2, md: 3 } }}>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          borderRadius: 3,
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          color: 'white',
          boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <InventoryIcon />
          <Typography variant="h5" fontWeight={700}>Inventory</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
          <Chip label={`${products.length} Products`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.25)', color: '#fff', fontWeight: 600 }} />
          {lowStockCount > 0 && (
            <Chip label={`${lowStockCount} Low Stock`} size="small" sx={{ bgcolor: '#fbbf24', color: '#78350f', fontWeight: 600 }} />
          )}
          {(expiredCount + nearExpiryCount) > 0 && (
            <Chip label={`${expiredCount + nearExpiryCount} Expiry Alerts`} size="small" sx={{ bgcolor: '#ef4444', color: '#fff', fontWeight: 600 }} />
          )}
        </Box>
      </Paper>

      {/* Search + Refresh */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField
          variant="outlined"
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>
            ),
          }}
          sx={{ bgcolor: 'white', borderRadius: 1 }}
        />
        <IconButton onClick={loadData} color="primary" sx={{ minWidth: 48, minHeight: 48, bgcolor: 'primary.main', color: '#fff', borderRadius: 2, '&:hover': { bgcolor: 'primary.dark' } }}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Add Receive Stock button (general) */}
      <Button
        variant="contained"
        color="success"
        startIcon={<ReceiveIcon />}
        onClick={() => { setSelectedProduct(null); setReceiveOpen(true); }}
        fullWidth
        sx={{ minHeight: 48, fontWeight: 600, borderRadius: 2, textTransform: 'none', fontSize: '1rem' }}
      >
        Receive New Stock
      </Button>

      {/* Product Cards */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : filteredProducts.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
          <Typography color="text.secondary">No products found.</Typography>
        </Paper>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
            gap: 2,
          }}
        >
          {filteredProducts.map((product) => {
            const qty = product.total_quantity || 0;
            const isLowStock = qty < 10;
            return (
              <Card
                key={product.id}
                variant="outlined"
                sx={{
                  borderRadius: 3,
                  borderColor: isLowStock ? 'error.main' : 'divider',
                  borderWidth: isLowStock ? 2 : 1,
                  transition: 'box-shadow 0.2s',
                  '&:active': { boxShadow: '0 0 0 2px rgba(59,130,246,0.3)' },
                }}
              >
                <CardContent sx={{ pb: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" fontWeight={700} noWrap>{product.name}</Typography>
                      <Typography variant="caption" color="text.secondary">SKU: {product.sku}</Typography>
                    </Box>
                    <Chip
                      label={qty}
                      size="small"
                      color={qty === 0 ? 'error' : isLowStock ? 'warning' : 'success'}
                      variant={qty === 0 ? 'filled' : 'outlined'}
                      sx={{ fontWeight: 700, minWidth: 48, ml: 1 }}
                    />
                  </Box>
                  {product.category && (
                    <Chip label={product.category} size="small" sx={{ mt: 1, fontSize: '0.7rem', height: 22 }} variant="outlined" />
                  )}
                </CardContent>
                <CardActions sx={{ px: 2, pb: 2, pt: 0, flexWrap: 'wrap', gap: 0.5 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    color="success"
                    startIcon={<ReceiveIcon />}
                    onClick={() => { setSelectedProduct(product); setReceiveOpen(true); }}
                    sx={{ minHeight: 40, textTransform: 'none', fontWeight: 600, flex: { xs: '1 1 auto', sm: '0 1 auto' } }}
                  >
                    Receive
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    startIcon={<TransferIcon />}
                    onClick={() => { setSelectedProduct(product); setTransferOpen(true); }}
                    sx={{ minHeight: 40, textTransform: 'none', fontWeight: 600, flex: { xs: '1 1 auto', sm: '0 1 auto' } }}
                  >
                    Transfer
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<WriteOffIcon />}
                    onClick={() => { setSelectedProduct(product); setWriteOffOpen(true); }}
                    sx={{ minHeight: 40, textTransform: 'none', fontWeight: 600, flex: { xs: '1 1 auto', sm: '0 1 auto' } }}
                  >
                    Write-Off
                  </Button>
                  <IconButton
                    size="small"
                    color="info"
                    onClick={() => { setSelectedProductId(product.id); setDetailsOpen(true); }}
                    sx={{ minWidth: 40, minHeight: 40, border: '1px solid', borderColor: 'info.main', borderRadius: 2 }}
                  >
                    <ViewIcon fontSize="small" />
                  </IconButton>
                </CardActions>
              </Card>
            );
          })}
        </Box>
      )}

      {/* ── Dialogs ── */}
      <ReceiveStockMobileDialog
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        product={selectedProduct}
        products={products}
        onSuccess={handleSuccess}
      />
      <TransferStockMobileDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        product={selectedProduct}
        onSuccess={handleSuccess}
      />
      <WriteOffMobileDialog
        open={writeOffOpen}
        onClose={() => setWriteOffOpen(false)}
        product={selectedProduct}
        onSuccess={handleSuccess}
      />
      <StockDetailsMobileDialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        productId={selectedProductId}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};
