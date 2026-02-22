import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Button, CircularProgress, TextField, InputAdornment,
  Chip, Card, CardContent, CardActions, Dialog, DialogTitle, DialogContent,
  DialogActions, MenuItem, Select, FormControl, InputLabel, IconButton,
  useMediaQuery, useTheme, Snackbar, Alert, Divider, Stack, Tab, Tabs,
  List, ListItem, ListItemText, ListItemSecondaryAction
} from '@mui/material';
import {
  AddBox as ReceiveIcon,
  LocalShipping as TransferIcon,
  Inventory as InventoryIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  DeleteSweep as WriteOffIcon,
  Search as SearchIcon,
  Close as CloseIcon,
  ErrorOutline as ExpiredIcon,
  WarningAmber as WarningIcon,
  SwapHoriz as SwapIcon,
  QrCodeScanner as ScanIcon,
} from '@mui/icons-material';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useLocation, useNavigate } from 'react-router-dom';

import { getAllProducts, type Product } from '../services/productService';
import {
  getExpiryReport, getLocations, receiveStock, transferStock, writeOffStock, getProductStock,
  getLowStockItems,
  type ExpiryReportItem, type Location, type BatchInfo, type ProductStockInfo
} from '../services/inventoryService';
import { getShelfRestockAlerts, type SystemAlert } from '../services/systemService';

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
      getLocations().then(setLocations).catch(() => { });
      setProductId(product?.id ?? 0);
      setQuantity('');
      setLocationId(0);
      setUnitCost(product?.average_cost ? String(product.average_cost) : '');
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
          <Select value={productId} label="Product" onChange={(e) => {
            const pid = Number(e.target.value);
            setProductId(pid);
            const p = products.find(pr => pr.id === pid);
            if (p?.average_cost) setUnitCost(String(p.average_cost));
          }}>
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
  const [stockMap, setStockMap] = useState<Map<number, number>>(new Map());
  const [fromLocationId, setFromLocationId] = useState<number>(0);
  const [toLocationId, setToLocationId] = useState<number>(0);
  const [quantity, setQuantity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadingStock, setLoadingStock] = useState(false);

  useEffect(() => {
    if (open && product) {
      setLoadingStock(true);
      setFromLocationId(0);
      setToLocationId(0);
      setQuantity('');
      setError('');

      const fetchData = async () => {
        try {
          const [locs, stockInfo] = await Promise.all([
            getLocations(),
            getProductStock(product.id),
          ]);
          setLocations(locs);

          const map = new Map<number, number>();
          if (stockInfo?.batches) {
            stockInfo.batches.forEach(b => {
              map.set(b.location_id, (map.get(b.location_id) || 0) + b.quantity);
            });
          }
          setStockMap(map);

          // Auto-select source if only one location has stock
          const withStock = locs.filter(l => (map.get(l.id) || 0) > 0);
          if (withStock.length === 1) {
            setFromLocationId(withStock[0].id);
          }
        } catch {
          setError('Failed to load stock data');
        } finally {
          setLoadingStock(false);
        }
      };
      fetchData();
    }
  }, [open, product]);

  const availableAtSource = fromLocationId ? (stockMap.get(fromLocationId) || 0) : 0;

  const handleSubmit = async () => {
    if (!product || !fromLocationId || !toLocationId || !quantity) { setError('Fill all required fields'); return; }
    if (fromLocationId === toLocationId) { setError('Source and destination must differ'); return; }
    if (Number(quantity) > availableAtSource) { setError(`Only ${availableAtSource} available at source`); return; }
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
          <Select
            value={fromLocationId}
            label="From Location"
            onChange={(e) => { setFromLocationId(Number(e.target.value)); setQuantity(''); }}
            disabled={loadingStock}
          >
            {locations.map(l => {
              const avail = stockMap.get(l.id) || 0;
              return (
                <MenuItem key={l.id} value={l.id} disabled={avail === 0}>
                  {l.name}
                  <Typography
                    component="span"
                    sx={{ ml: 'auto', pl: 2, fontWeight: 700, color: avail > 0 ? 'success.main' : 'text.disabled', fontSize: '0.85rem' }}
                  >
                    ({avail})
                  </Typography>
                </MenuItem>
              );
            })}
          </Select>
          {loadingStock && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1 }}>
              Loading stock data...
            </Typography>
          )}
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>To Location</InputLabel>
          <Select value={toLocationId} label="To Location" onChange={(e) => setToLocationId(Number(e.target.value))}>
            {locations.filter(l => l.id !== fromLocationId).map(l => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField
          label="Quantity"
          type="number"
          fullWidth
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          inputProps={{ min: 1, max: availableAtSource || undefined }}
          error={Number(quantity) > availableAtSource && availableAtSource > 0}
          helperText={
            fromLocationId
              ? `Available: ${availableAtSource}${Number(quantity) > availableAtSource ? ' — exceeds stock!' : ''}`
              : 'Select source location first'
          }
        />
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

            {/* Warehouse batches */}
            {(() => {
              const warehouses = stockInfo.batches.filter(b => b.location_type === 'warehouse');
              if (warehouses.length === 0) return null;
              return (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography sx={{ fontSize: 18 }}>🏭</Typography>
                    <Typography variant="subtitle2" fontWeight={700}>Warehouses</Typography>
                    <Chip label={`${warehouses.reduce((s, b) => s + b.quantity, 0)} units`} size="small" sx={{ fontWeight: 600, height: 20 }} />
                  </Box>
                  {warehouses.map(b => (
                    <Card key={b.id} variant="outlined" sx={{ borderRadius: 2, mb: 1 }}>
                      <CardContent sx={{ pb: '8px !important' }}>
                        <Typography variant="subtitle2" fontWeight={700}>{b.batch_code || `Batch #${b.id}`}</Typography>
                        <Typography variant="body2" color="text.secondary">Location: {b.location_name}</Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                          <Chip label={`Qty: ${b.quantity}`} size="small" variant="outlined" />
                          {b.expiry_date && <Typography variant="caption" color="text.secondary">Exp: {new Date(b.expiry_date).toLocaleDateString()}</Typography>}
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              );
            })()}

            {/* In-Store batches */}
            {(() => {
              const stores = stockInfo.batches.filter(b => b.location_type === 'store');
              if (stores.length === 0) return null;
              return (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography sx={{ fontSize: 18 }}>🏪</Typography>
                    <Typography variant="subtitle2" fontWeight={700}>In-Store</Typography>
                    <Chip label={`${stores.reduce((s, b) => s + b.quantity, 0)} units`} size="small" sx={{ fontWeight: 600, height: 20 }} />
                  </Box>
                  {stores.map(b => (
                    <Card key={b.id} variant="outlined" sx={{ borderRadius: 2, mb: 1 }}>
                      <CardContent sx={{ pb: '8px !important' }}>
                        <Typography variant="subtitle2" fontWeight={700}>{b.batch_code || `Batch #${b.id}`}</Typography>
                        <Typography variant="body2" color="text.secondary">Location: {b.location_name}</Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                          <Chip label={`Qty: ${b.quantity}`} size="small" variant="outlined" />
                          {b.expiry_date && <Typography variant="caption" color="text.secondary">Exp: {new Date(b.expiry_date).toLocaleDateString()}</Typography>}
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              );
            })()}

            {/* External batches */}
            {(() => {
              const external = stockInfo.batches.filter(b => b.location_type === 'external');
              if (external.length === 0) return null;
              return (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography sx={{ fontSize: 18 }}>🌐</Typography>
                    <Typography variant="subtitle2" fontWeight={700}>External</Typography>
                    <Chip label={`${external.reduce((s, b) => s + b.quantity, 0)} units`} size="small" sx={{ fontWeight: 600, height: 20 }} />
                  </Box>
                  {external.map(b => (
                    <Card key={b.id} variant="outlined" sx={{ borderRadius: 2, mb: 1 }}>
                      <CardContent sx={{ pb: '8px !important' }}>
                        <Typography variant="subtitle2" fontWeight={700}>{b.batch_code || `Batch #${b.id}`}</Typography>
                        <Typography variant="body2" color="text.secondary">Location: {b.location_name}</Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                          <Chip label={`Qty: ${b.quantity}`} size="small" variant="outlined" />
                          {b.expiry_date && <Typography variant="caption" color="text.secondary">Exp: {new Date(b.expiry_date).toLocaleDateString()}</Typography>}
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              );
            })()}

            {stockInfo.batches.length === 0 && (
              <Typography color="text.secondary" variant="body2">No batches found.</Typography>
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
  const location = useLocation();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Scanner state
  const [scannerOpen, setScannerOpen] = useState(false);
  const { startScan, stopScan, isSupported } = useBarcodeScanner();

  const handleStartScan = async () => {
    setScannerOpen(true);
    const result = await startScan();
    if (result?.hasContent) {
      setSearchQuery(result.content);
      setScannerOpen(false);
    } else {
      setScannerOpen(false);
    }
  };

  const handleStopScan = async () => {
    await stopScan();
    setScannerOpen(false);
  };

  // Expiry data
  const [expiredCount, setExpiredCount] = useState(0);
  const [nearExpiryCount, setNearExpiryCount] = useState(0);
  const [expiredItems, setExpiredItems] = useState<ExpiryReportItem[]>([]);
  const [nearExpiryItems, setNearExpiryItems] = useState<ExpiryReportItem[]>([]);

  // Dialog states
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  // Alert dialog states
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [lowStockOpen, setLowStockOpen] = useState(false);
  const [shelfRestockOpen, setShelfRestockOpen] = useState(false);
  const [expiryTab, setExpiryTab] = useState(0);
  const [expiryDays, setExpiryDays] = useState(30);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [shelfRestockAlerts, setShelfRestockAlerts] = useState<SystemAlert[]>([]);
  const [alertLoading, setAlertLoading] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  // ── Handle navigation state from dashboard ─────────────────────────────
  useEffect(() => {
    const state = location.state as {
      openExpiryAlert?: boolean;
      openLowStock?: boolean;
      openShelfRestock?: boolean;
    } | null;
    if (state?.openExpiryAlert) {
      handleOpenExpiry();
      navigate(location.pathname, { replace: true, state: {} });
    } else if (state?.openLowStock) {
      handleOpenLowStock();
      navigate(location.pathname, { replace: true, state: {} });
    } else if (state?.openShelfRestock) {
      handleOpenShelfRestock();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  // ── Open alert dialogs with data fetching ─────────────────────────────
  const handleOpenExpiry = async () => {
    setExpiryOpen(true);
    setAlertLoading(true);
    try {
      const data = await getExpiryReport(expiryDays);
      if (Array.isArray(data)) {
        setExpiredItems(data.filter(i => i.days_left < 0));
        setNearExpiryItems(data.filter(i => i.days_left >= 0));
      }
    } catch { /* ignore */ }
    finally { setAlertLoading(false); }
  };

  const handleRefreshExpiry = async (days: number) => {
    setAlertLoading(true);
    try {
      const data = await getExpiryReport(days);
      if (Array.isArray(data)) {
        setExpiredItems(data.filter(i => i.days_left < 0));
        setNearExpiryItems(data.filter(i => i.days_left >= 0));
      }
    } catch { /* ignore */ }
    finally { setAlertLoading(false); }
  };

  const handleOpenLowStock = async () => {
    setLowStockOpen(true);
    setAlertLoading(true);
    try {
      const data = await getLowStockItems();
      setLowStockItems(Array.isArray(data) ? data : []);
    } catch { setLowStockItems([]); }
    finally { setAlertLoading(false); }
  };

  const handleOpenShelfRestock = async () => {
    setShelfRestockOpen(true);
    setAlertLoading(true);
    try {
      const data = await getShelfRestockAlerts();
      setShelfRestockAlerts(Array.isArray(data) ? data : []);
    } catch { setShelfRestockAlerts([]); }
    finally { setAlertLoading(false); }
  };

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
            <Chip label={`${lowStockCount} Low Stock`} size="small"
              sx={{ bgcolor: '#fbbf24', color: '#78350f', fontWeight: 600, cursor: 'pointer' }}
              onClick={handleOpenLowStock} />
          )}
          {(expiredCount + nearExpiryCount) > 0 && (
            <Chip label={`${expiredCount + nearExpiryCount} Expiry Alerts`} size="small"
              sx={{ bgcolor: '#ef4444', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
              onClick={handleOpenExpiry} />
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
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={handleStartScan} color="primary">
                  <ScanIcon />
                </IconButton>
              </InputAdornment>
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

      {/* ── Expiry Alert Dialog ────────────────────────────────────────── */}
      <Dialog open={expiryOpen} onClose={() => setExpiryOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Expiry Alerts
          <IconButton onClick={() => setExpiryOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Tabs value={expiryTab} onChange={(_, v) => setExpiryTab(v)} variant="fullWidth">
            <Tab icon={<ExpiredIcon sx={{ fontSize: 18 }} />} iconPosition="start"
              label={`Expired (${expiredItems.length})`} sx={{ textTransform: 'none', fontWeight: 600 }} />
            <Tab icon={<WarningIcon sx={{ fontSize: 18 }} />} iconPosition="start"
              label={`Near Expiry (${nearExpiryItems.length})`} sx={{ textTransform: 'none', fontWeight: 600 }} />
          </Tabs>
          {alertLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : (
            <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
              {expiryTab === 0 ? (
                expiredItems.length === 0 ? (
                  <Typography sx={{ p: 3, textAlign: 'center' }} color="text.secondary">No expired items</Typography>
                ) : (
                  expiredItems.map((item, idx) => (
                    <Card key={idx} variant="outlined" sx={{ m: 1, borderRadius: 2, borderColor: '#fecaca' }}>
                      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="body2" fontWeight={700}>{item.product_name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {item.batch_code} · {item.location}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'right' }}>
                            <Chip label={`${Math.abs(item.days_left)}d ago`} size="small" color="error" sx={{ fontSize: '0.7rem', height: 22 }} />
                            <Typography variant="body2" fontWeight={700} sx={{ mt: 0.5 }}>{item.quantity} units</Typography>
                          </Box>
                        </Box>
                        {item.supplier && (
                          <Typography variant="caption" color="text.secondary">{item.supplier}</Typography>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )
              ) : (
                <>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1.5, bgcolor: '#f8fafc' }}>
                    <TextField label="Days" type="number" size="small" value={expiryDays}
                      onChange={e => setExpiryDays(Number(e.target.value))} sx={{ width: 80 }} />
                    <Button variant="outlined" size="small" onClick={() => handleRefreshExpiry(expiryDays)}>
                      Update
                    </Button>
                  </Box>
                  {nearExpiryItems.length === 0 ? (
                    <Typography sx={{ p: 3, textAlign: 'center' }} color="text.secondary">No items near expiry</Typography>
                  ) : (
                    nearExpiryItems.map((item, idx) => (
                      <Card key={idx} variant="outlined" sx={{ m: 1, borderRadius: 2, borderColor: '#fde68a' }}>
                        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="body2" fontWeight={700}>{item.product_name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {item.batch_code} · {item.location}
                              </Typography>
                            </Box>
                            <Box sx={{ textAlign: 'right' }}>
                              <Chip label={`${item.days_left}d left`} size="small" color="warning" sx={{ fontSize: '0.7rem', height: 22 }} />
                              <Typography variant="body2" fontWeight={700} sx={{ mt: 0.5 }}>{item.quantity} units</Typography>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setExpiryOpen(false)} fullWidth variant="outlined">Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Low Stock Dialog ───────────────────────────────────────────── */}
      <Dialog open={lowStockOpen} onClose={() => setLowStockOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Low Stock Items
          <IconButton onClick={() => setLowStockOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {alertLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : lowStockItems.length === 0 ? (
            <Typography sx={{ p: 3, textAlign: 'center' }} color="text.secondary">No low stock items</Typography>
          ) : (
            <Box sx={{ maxHeight: 450, overflowY: 'auto' }}>
              {lowStockItems.map((item: any, idx: number) => {
                const shortfall = (item.reorder_level || 20) - (item.current_stock || 0);
                return (
                  <Card key={idx} variant="outlined" sx={{ m: 1, borderRadius: 2, borderColor: shortfall > 10 ? '#fecaca' : '#fde68a' }}>
                    <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" fontWeight={700}>{item.product_name}</Typography>
                          {item.supplier_name && (
                            <Typography variant="caption" color="text.secondary">{item.supplier_name}</Typography>
                          )}
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Chip
                            label={`${item.current_stock} in stock`}
                            size="small"
                            color={item.current_stock === 0 ? 'error' : 'warning'}
                            sx={{ fontSize: '0.7rem', height: 22 }}
                          />
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                            Reorder: {item.reorder_level || 20}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                        {(item.quantity_on_order || 0) > 0 && (
                          <Chip label={`${item.quantity_on_order} on order`} size="small" color="info" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                        )}
                        {(item.quantity_in_draft || 0) > 0 && (
                          <Chip label={`${item.quantity_in_draft} in draft`} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                        )}
                        {shortfall > 0 && (
                          <Chip label={`Need ${shortfall}`} size="small" color="error" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => { setLowStockOpen(false); navigate('/orders'); }} variant="outlined" sx={{ flex: 1 }}>
            Go to Orders
          </Button>
          <Button onClick={() => setLowStockOpen(false)} variant="contained" sx={{ flex: 1 }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Shelf Restock Dialog ───────────────────────────────────────── */}
      <Dialog open={shelfRestockOpen} onClose={() => setShelfRestockOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Shelf Restock Needed
          <IconButton onClick={() => setShelfRestockOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {alertLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : shelfRestockAlerts.length === 0 ? (
            <Typography sx={{ p: 3, textAlign: 'center' }} color="text.secondary">No shelf restock alerts</Typography>
          ) : (
            <Box sx={{ maxHeight: 450, overflowY: 'auto' }}>
              {shelfRestockAlerts.map((alert) => {
                const productMatch = alert.message?.match(/SHELF RESTOCK NEEDED: '([^']+)'/);
                const shelfMatch = alert.message?.match(/has only (\d+) units on shelf/);
                const productName = productMatch ? productMatch[1] : 'Unknown Product';
                const shelfCount = shelfMatch ? parseInt(shelfMatch[1]) : 0;
                return (
                  <Card key={alert.id} variant="outlined" sx={{ m: 1, borderRadius: 2 }}>
                    <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" fontWeight={700}>{productName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(alert.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={`${shelfCount} on shelf`}
                            size="small"
                            color={shelfCount === 0 ? 'error' : 'warning'}
                            sx={{ fontSize: '0.7rem', height: 22 }}
                          />
                          <Button
                            size="small" variant="outlined" color="warning"
                            startIcon={<SwapIcon sx={{ fontSize: 16 }} />}
                            onClick={() => {
                              setShelfRestockOpen(false);
                              const p = products.find(pr => pr.name === productName);
                              if (p) { setSelectedProduct(p); setTransferOpen(true); }
                              else { setSnackbar({ open: true, message: `Transfer stock for "${productName}"`, severity: 'success' }); }
                            }}
                            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 32 }}
                          >
                            Transfer
                          </Button>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setShelfRestockOpen(false)} fullWidth variant="outlined">Close</Button>
        </DialogActions>
      </Dialog>

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
