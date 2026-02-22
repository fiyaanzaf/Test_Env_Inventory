import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, CardActions, Button,
  IconButton, CircularProgress, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions, MenuItem, Select, FormControl, InputLabel, Chip,
  useMediaQuery, useTheme, Snackbar, Alert, InputAdornment, Stack
} from '@mui/material';
import {
  Inventory2 as ProductIcon,
  LocationOn as LocationIcon,
  LocalShipping as SupplierIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Close as CloseIcon,
  Phone as PhoneIcon,
  Person as PersonIcon,
  Link as LinkIcon,
  Star as StarIcon,
  ShoppingCart as OrderIcon,
  Refresh as RefreshIcon,
  QrCodeScanner as ScanIcon,
  SwapVert as SortIcon,
  ArrowUpward as AscIcon,
  ArrowDownward as DescIcon,
  Warehouse as WarehouseIcon,
  Storefront as StoreIcon,
  Public as ExternalIcon,
} from '@mui/icons-material';
import { Capacitor } from '@capacitor/core';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';

import { getAllProducts, createProduct, updateProduct, deleteProduct, type Product, type CreateProductData } from '../services/productService';
import {
  getLocations, createLocation, deleteLocation,
  getSuppliers, createSupplier, deleteSupplier,
  getProductSupplierLinks, createProductSupplierLink, deleteProductSupplierLink,
  type Location, type Supplier, type CreateLocationData, type CreateSupplierData,
  type ProductSupplierLink, type CreateProductSupplierLinkData
} from '../services/catalogService';
import {
  getPurchaseOrders, createPurchaseOrder, addItemToPurchaseOrder,
  type PurchaseOrder
} from '../services/purchaseService';

// ─── Tab Panel ───────────────────────────────────────────────────────────────

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div role="tabpanel" hidden={value !== index} style={{ width: '100%' }}>
    {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
  </div>
);

// ─── Add Product Dialog ──────────────────────────────────────────────────────

interface AddProductDialogProps {
  open: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  onSuccess: () => void;
}

const AddProductDialog: React.FC<AddProductDialogProps> = ({ open, onClose, suppliers, onSuccess }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [form, setForm] = useState<CreateProductData>({ sku: '', name: '', selling_price: 0, average_cost: 0, supplier_id: 0, category: '', unit_of_measure: 'pcs', barcode: '', low_stock_threshold: 20, shelf_restock_threshold: 5 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { startScan } = useBarcodeScanner();

  const handleScanSku = async () => {
    const result = await startScan();
    if (result?.hasContent) {
      setForm(f => ({ ...f, sku: result.content }));
    }
  };

  const handleScanBarcode = async () => {
    const result = await startScan();
    if (result?.hasContent) {
      setForm(f => ({ ...f, barcode: result.content }));
    }
  };

  useEffect(() => {
    if (open) {
      setForm({ sku: '', name: '', selling_price: 0, average_cost: 0, supplier_id: 0, category: '', unit_of_measure: 'pcs', barcode: '', low_stock_threshold: 20, shelf_restock_threshold: 5 });
      setError('');
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!form.sku || !form.name || !form.supplier_id) { setError('SKU, Name and Supplier are required'); return; }
    setSubmitting(true);
    try {
      await createProduct(form);
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to create product');
    } finally {
      setSubmitting(false);
    }
  };

  const update = (field: keyof CreateProductData, value: any) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Add Product
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        <TextField label="SKU" fullWidth value={form.sku} onChange={e => update('sku', e.target.value)}
          InputProps={Capacitor.isNativePlatform() ? {
            endAdornment: <InputAdornment position="end"><IconButton onClick={handleScanSku} edge="end" color="primary"><ScanIcon /></IconButton></InputAdornment>
          } : undefined}
        />
        <TextField label="Product Name" fullWidth value={form.name} onChange={e => update('name', e.target.value)} />
        <TextField label="Selling Price (₹)" type="number" fullWidth value={form.selling_price} onChange={e => update('selling_price', Number(e.target.value))} inputProps={{ min: 0, step: 0.01 }} />
        <TextField label="Average Cost (₹)" type="number" fullWidth value={form.average_cost} onChange={e => update('average_cost', Number(e.target.value))} inputProps={{ min: 0, step: 0.01 }} />
        <FormControl fullWidth>
          <InputLabel>Supplier</InputLabel>
          <Select value={form.supplier_id} label="Supplier" onChange={e => update('supplier_id', Number(e.target.value))}>
            {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField label="Category" fullWidth value={form.category} onChange={e => update('category', e.target.value)} />
        <TextField label="Barcode" fullWidth value={form.barcode || ''} onChange={e => update('barcode', e.target.value)}
          helperText="Barcode scanned from physical product label"
          InputProps={Capacitor.isNativePlatform() ? {
            endAdornment: <InputAdornment position="end"><IconButton onClick={handleScanBarcode} edge="end" color="secondary"><ScanIcon /></IconButton></InputAdornment>
          } : undefined}
        />
        <TextField label="Unit of Measure" fullWidth value={form.unit_of_measure} onChange={e => update('unit_of_measure', e.target.value)} />
        <TextField label="Low Stock Threshold" type="number" fullWidth value={form.low_stock_threshold} onChange={e => update('low_stock_threshold', Number(e.target.value))} inputProps={{ min: 0 }} helperText="Alert when total stock falls below this" />
        <TextField label="Shelf Restock Threshold" type="number" fullWidth value={form.shelf_restock_threshold} onChange={e => update('shelf_restock_threshold', Number(e.target.value))} inputProps={{ min: 0 }} helperText="Alert when shelf stock falls below this" />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting} sx={{ minHeight: 48 }}>
          {submitting ? <CircularProgress size={24} /> : 'Add Product'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Edit Product Dialog ─────────────────────────────────────────────────────

interface EditProductDialogProps {
  open: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  onSuccess: () => void;
  product: Product | null;
}

const EditProductDialog: React.FC<EditProductDialogProps> = ({ open, onClose, suppliers, onSuccess, product }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [form, setForm] = useState<CreateProductData>({ sku: '', name: '', selling_price: 0, average_cost: 0, supplier_id: 0, category: '', unit_of_measure: 'pcs', barcode: '', low_stock_threshold: 20, shelf_restock_threshold: 5 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { startScan } = useBarcodeScanner();

  const handleScanSku = async () => {
    const result = await startScan();
    if (result?.hasContent) {
      setForm(f => ({ ...f, sku: result.content }));
    }
  };

  const handleScanBarcode = async () => {
    const result = await startScan();
    if (result?.hasContent) {
      setForm(f => ({ ...f, barcode: result.content }));
    }
  };

  useEffect(() => {
    if (open && product) {
      setForm({
        sku: product.sku,
        name: product.name,
        selling_price: product.selling_price,
        average_cost: product.average_cost,
        supplier_id: product.supplier_id,
        category: product.category || '',
        unit_of_measure: product.unit_of_measure || 'pcs',
        barcode: product.barcode || '',
        low_stock_threshold: product.low_stock_threshold ?? 20,
        shelf_restock_threshold: product.shelf_restock_threshold ?? 5,
      });
      setError('');
    }
  }, [open, product]);

  const handleSubmit = async () => {
    if (!product) return;
    if (!form.sku || !form.name || !form.supplier_id) { setError('SKU, Name and Supplier are required'); return; }
    setSubmitting(true);
    try {
      await updateProduct(product.id, form);
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to update product');
    } finally {
      setSubmitting(false);
    }
  };

  const update = (field: keyof CreateProductData, value: any) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Edit Product
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        <TextField label="SKU" fullWidth value={form.sku} onChange={e => update('sku', e.target.value)}
          InputProps={Capacitor.isNativePlatform() ? {
            endAdornment: <InputAdornment position="end"><IconButton onClick={handleScanSku} edge="end" color="primary"><ScanIcon /></IconButton></InputAdornment>
          } : undefined}
        />
        <TextField label="Product Name" fullWidth value={form.name} onChange={e => update('name', e.target.value)} />
        <TextField label="Selling Price (₹)" type="number" fullWidth value={form.selling_price} onChange={e => update('selling_price', Number(e.target.value))} inputProps={{ min: 0, step: 0.01 }} />
        <TextField label="Average Cost (₹)" type="number" fullWidth value={form.average_cost} onChange={e => update('average_cost', Number(e.target.value))} inputProps={{ min: 0, step: 0.01 }} />
        <FormControl fullWidth>
          <InputLabel>Supplier</InputLabel>
          <Select value={form.supplier_id} label="Supplier" onChange={e => update('supplier_id', Number(e.target.value))}>
            {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField label="Category" fullWidth value={form.category} onChange={e => update('category', e.target.value)} />
        <TextField label="Barcode" fullWidth value={form.barcode || ''} onChange={e => update('barcode', e.target.value)}
          helperText="Barcode scanned from physical product label"
          InputProps={Capacitor.isNativePlatform() ? {
            endAdornment: <InputAdornment position="end"><IconButton onClick={handleScanBarcode} edge="end" color="secondary"><ScanIcon /></IconButton></InputAdornment>
          } : undefined}
        />
        <TextField label="Unit of Measure" fullWidth value={form.unit_of_measure} onChange={e => update('unit_of_measure', e.target.value)} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#6366f1', mt: 1 }}>Alert Thresholds</Typography>
        <TextField label="Low Stock Threshold" type="number" fullWidth value={form.low_stock_threshold} onChange={e => update('low_stock_threshold', Number(e.target.value))} inputProps={{ min: 0 }} helperText="Alert when total stock falls below this" />
        <TextField label="Shelf Restock Threshold" type="number" fullWidth value={form.shelf_restock_threshold} onChange={e => update('shelf_restock_threshold', Number(e.target.value))} inputProps={{ min: 0 }} helperText="Alert when shelf stock falls below this" />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting} sx={{ minHeight: 48 }}>
          {submitting ? <CircularProgress size={24} /> : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Add Location Dialog ─────────────────────────────────────────────────────

interface AddLocationDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AddLocationDialog: React.FC<AddLocationDialogProps> = ({ open, onClose, onSuccess }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [name, setName] = useState('');
  const [type, setType] = useState('warehouse');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setName(''); setType('warehouse'); setDescription(''); setError(''); }
  }, [open]);

  const handleSubmit = async () => {
    if (!name) { setError('Name is required'); return; }
    setSubmitting(true);
    try {
      await createLocation({ name, type, description } as CreateLocationData);
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to create location');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Add Location
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        <TextField label="Name" fullWidth value={name} onChange={e => setName(e.target.value)} />
        <FormControl fullWidth>
          <InputLabel>Type</InputLabel>
          <Select value={type} label="Type" onChange={e => setType(e.target.value)}>
            <MenuItem value="warehouse">Warehouse</MenuItem>
            <MenuItem value="store">Store</MenuItem>
            <MenuItem value="external">External</MenuItem>
          </Select>
        </FormControl>
        <TextField label="Description (optional)" fullWidth multiline minRows={2} value={description} onChange={e => setDescription(e.target.value)} />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting} sx={{ minHeight: 48 }}>
          {submitting ? <CircularProgress size={24} /> : 'Add Location'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Add Supplier Dialog ─────────────────────────────────────────────────────

interface AddSupplierDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AddSupplierDialog: React.FC<AddSupplierDialogProps> = ({ open, onClose, onSuccess }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [form, setForm] = useState<CreateSupplierData>({ name: '', contact_person: '', phone_number: '', email: '', location: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setForm({ name: '', contact_person: '', phone_number: '', email: '', location: '' }); setError(''); }
  }, [open]);

  const handleSubmit = async () => {
    if (!form.name) { setError('Name is required'); return; }
    setSubmitting(true);
    try {
      await createSupplier(form);
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to create supplier');
    } finally {
      setSubmitting(false);
    }
  };

  const update = (field: keyof CreateSupplierData, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Add Supplier
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        <TextField label="Supplier Name" fullWidth value={form.name} onChange={e => update('name', e.target.value)} />
        <TextField label="Contact Person" fullWidth value={form.contact_person} onChange={e => update('contact_person', e.target.value)} />
        <TextField label="Phone Number" fullWidth value={form.phone_number} onChange={e => update('phone_number', e.target.value)} />
        <TextField label="Email" fullWidth type="email" value={form.email} onChange={e => update('email', e.target.value)} />
        <TextField label="Location / Address" fullWidth value={form.location} onChange={e => update('location', e.target.value)} />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting} sx={{ minHeight: 48 }}>
          {submitting ? <CircularProgress size={24} /> : 'Add Supplier'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Add Product-Supplier Link Dialog ────────────────────────────────────────

interface AddLinkDialogProps {
  open: boolean;
  onClose: () => void;
  products: Product[];
  suppliers: Supplier[];
  onSuccess: () => void;
}

const AddLinkDialog: React.FC<AddLinkDialogProps> = ({ open, onClose, products, suppliers, onSuccess }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [form, setForm] = useState<CreateProductSupplierLinkData>({
    product_id: 0, supplier_id: 0, supply_price: 0, supplier_sku: '', is_preferred: false
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ product_id: 0, supplier_id: 0, supply_price: 0, supplier_sku: '', is_preferred: false });
      setError('');
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!form.product_id || !form.supplier_id) { setError('Product and Supplier are required'); return; }
    setSubmitting(true);
    try {
      await createProductSupplierLink(form);
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to create link');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Link Product to Supplier
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        <FormControl fullWidth>
          <InputLabel>Product *</InputLabel>
          <Select value={form.product_id} label="Product *" onChange={e => setForm(f => ({ ...f, product_id: Number(e.target.value) }))}>
            {products.map(p => <MenuItem key={p.id} value={p.id}>{p.name} ({p.sku})</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>Supplier *</InputLabel>
          <Select value={form.supplier_id} label="Supplier *" onChange={e => setForm(f => ({ ...f, supplier_id: Number(e.target.value) }))}>
            {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField
          label="Supply Price (₹)" type="number" fullWidth
          value={form.supply_price} onChange={e => setForm(f => ({ ...f, supply_price: Number(e.target.value) }))}
          inputProps={{ min: 0, step: 0.01 }}
        />
        <TextField
          label="Supplier SKU (optional)" fullWidth
          value={form.supplier_sku} onChange={e => setForm(f => ({ ...f, supplier_sku: e.target.value }))}
        />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting} sx={{ minHeight: 48 }}>
          {submitting ? <CircularProgress size={24} /> : 'Link Product'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Add to Purchase Order Dialog ────────────────────────────────────────────

interface AddToOrderProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  onSuccess: (msg: string) => void;
}

const AddToOrderMobileDialog: React.FC<AddToOrderProps> = ({ open, onClose, product, onSuccess }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [activeDraft, setActiveDraft] = useState<PurchaseOrder | null>(null);
  const [checkingDraft, setCheckingDraft] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && product) {
      setQuantity(1);
      const p = product as any;
      setUnitCost(parseFloat(p.average_cost || p.last_cost || p.cost_price || p.price || 0));
      setError('');
      setActiveDraft(null);
      if (product.supplier_id) {
        setCheckingDraft(true);
        getPurchaseOrders()
          .then(orders => {
            const draft = orders.find(o => o.status === 'draft' && o.supplier_id === product.supplier_id);
            setActiveDraft(draft || null);
          })
          .catch(() => { })
          .finally(() => setCheckingDraft(false));
      }
    }
  }, [open, product]);

  const handleConfirm = async () => {
    if (!product) return;
    if (quantity <= 0) { setError('Quantity must be > 0'); return; }
    if (unitCost <= 0) { setError('Cost must be > 0'); return; }
    setLoading(true);
    setError('');
    try {
      if (activeDraft) {
        await addItemToPurchaseOrder(activeDraft.id, {
          items: [{ product_id: product.id, quantity, unit_cost: unitCost }]
        });
      } else {
        await createPurchaseOrder({
          supplier_id: product.supplier_id,
          items: [{ product_id: product.id, quantity, unit_cost: unitCost }]
        });
      }
      onSuccess(activeDraft ? `Added to Draft #${activeDraft.id}` : 'New Purchase Order created');
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add item to order.');
    } finally {
      setLoading(false);
    }
  };

  if (!product) return null;

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Add to Purchase Order
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        {/* Product Info */}
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">Product</Typography>
          <Typography variant="h6" fontWeight={700}>{product.name}</Typography>
          <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
            <Typography variant="body2">SKU: <b>{product.sku}</b></Typography>
            <Typography variant="body2">Supplier: <b>{product.supplier_id || 'N/A'}</b></Typography>
          </Box>
        </Box>

        {/* Draft Status */}
        {checkingDraft ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="caption">Checking for active drafts...</Typography>
          </Box>
        ) : activeDraft ? (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Found <b>Draft Order #{activeDraft.id}</b> for this supplier. Item will be added there.
          </Alert>
        ) : (
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            No active draft for this supplier. A <b>new Purchase Order</b> will be created.
          </Alert>
        )}

        {/* Input Fields */}
        <TextField
          label="Quantity" type="number" fullWidth
          value={quantity}
          onChange={e => setQuantity(parseInt(e.target.value) || 0)}
          inputProps={{ min: 1 }}
        />
        <TextField
          label="Unit Cost (₹)" type="number" fullWidth
          value={unitCost}
          onChange={e => setUnitCost(parseFloat(e.target.value) || 0)}
          helperText="Buying price per unit"
        />

        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>Cancel</Button>
        <Button
          variant="contained" color="primary"
          onClick={handleConfirm}
          disabled={loading || checkingDraft}
          sx={{ minHeight: 48 }}
        >
          {loading ? <CircularProgress size={24} /> : activeDraft ? 'Add to Draft' : 'Create & Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Main Catalog Page ───────────────────────────────────────────────────────

export const CatalogPage: React.FC = () => {
  const catalogScanner = useBarcodeScanner();
  const [tabValue, setTabValue] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [links, setLinks] = useState<ProductSupplierLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'name' | 'price' | 'stock' | 'category'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Dialog states
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [editProductOpen, setEditProductOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [orderProduct, setOrderProduct] = useState<Product | null>(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  // Navigation state for opening create dialog from Dashboard
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.state?.openCreateDialog) {
      setAddProductOpen(true);
      // Clear the navigation state so it doesn't re-trigger
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [productsData, locationsData, suppliersData, linksData] = await Promise.all([
        getAllProducts(),
        getLocations(),
        getSuppliers(),
        getProductSupplierLinks().catch(() => []),
      ]);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setLocations(Array.isArray(locationsData) ? locationsData : []);
      setSuppliers(Array.isArray(suppliersData) ? suppliersData : []);
      setLinks(Array.isArray(linksData) ? linksData : []);
    } catch (err) {
      console.error('Failed to load catalog data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSuccess = (msg: string) => {
    setSnackbar({ open: true, message: msg, severity: 'success' });
    loadData();
  };

  const handleDelete = async (type: 'location' | 'supplier' | 'link' | 'product', id: number, name: string) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      if (type === 'location') await deleteLocation(id);
      else if (type === 'supplier') await deleteSupplier(id);
      else if (type === 'product') await deleteProduct(id);
      else await deleteProductSupplierLink(id);
      handleSuccess(`${name} deleted`);
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.detail || 'Delete failed. It may be linked to inventory or sales.', severity: 'error' });
    }
  };

  // Filtering + Sorting
  const filteredProducts = products.filter(p => {
    const q = searchQuery.toLowerCase();
    return (p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
  }).sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'name': cmp = (a.name || '').localeCompare(b.name || ''); break;
      case 'price': cmp = Number(a.selling_price) - Number(b.selling_price); break;
      case 'stock': cmp = (a.total_quantity || 0) - (b.total_quantity || 0); break;
      case 'category': cmp = (a.category || '').localeCompare(b.category || ''); break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });
  const filteredLocations = locations.filter(l => l.name?.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredSuppliers = suppliers.filter(s => {
    const q = searchQuery.toLowerCase();
    return (s.name?.toLowerCase().includes(q) || s.contact_person?.toLowerCase().includes(q));
  });
  const filteredLinks = links.filter(l => {
    const q = searchQuery.toLowerCase();
    return (l.product_name?.toLowerCase().includes(q) || l.supplier_name?.toLowerCase().includes(q) || l.supplier_sku?.toLowerCase().includes(q));
  });

  // Which FAB to show
  const handleFabClick = () => {
    if (tabValue === 0) setAddProductOpen(true);
    else if (tabValue === 1) setAddLocationOpen(true);
    else if (tabValue === 2) setAddSupplierOpen(true);
    else setAddLinkOpen(true);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 10, px: { xs: 1, sm: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ pt: { xs: 1, sm: 2 }, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h5" fontWeight={700} color="text.primary">Catalog</Typography>
          <Typography variant="body2" color="text.secondary">Manage products, locations & suppliers</Typography>
        </Box>
        <IconButton onClick={loadData} sx={{ mt: 0.5 }}><RefreshIcon /></IconButton>
      </Box>

      {/* Tabs - chip/pill style */}
      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5, '&::-webkit-scrollbar': { display: 'none' } }}>
        {[
          { icon: <ProductIcon sx={{ fontSize: 18 }} />, label: 'Products' },
          { icon: <LocationIcon sx={{ fontSize: 18 }} />, label: 'Locations' },
          { icon: <SupplierIcon sx={{ fontSize: 18 }} />, label: 'Suppliers' },
          { icon: <LinkIcon sx={{ fontSize: 18 }} />, label: 'Links' },
        ].map((tab, idx) => (
          <Chip
            key={idx}
            icon={tab.icon}
            label={tab.label}
            onClick={() => setTabValue(idx)}
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              height: 36,
              borderRadius: '18px',
              px: 0.5,
              ...(tabValue === idx
                ? {
                  bgcolor: '#1e3a5f',
                  color: 'white',
                  '& .MuiChip-icon': { color: 'white' },
                }
                : {
                  bgcolor: 'white',
                  color: 'text.primary',
                  border: '1px solid',
                  borderColor: 'divider',
                  '& .MuiChip-icon': { color: 'text.secondary' },
                }),
            }}
          />
        ))}
      </Box>

      {/* Search + Add */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField
          variant="outlined"
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          sx={{ flex: 1, bgcolor: 'white', borderRadius: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>,
            endAdornment: Capacitor.isNativePlatform() ? (
              <InputAdornment position="end">
                <IconButton onClick={async () => { const r = await catalogScanner.startScan(); if (r?.hasContent) setSearchQuery(r.content); }} edge="end" color="primary">
                  <ScanIcon />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleFabClick}
          sx={{
            bgcolor: '#1e3a5f',
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 700,
            minHeight: 40,
            px: 2.5,
            whiteSpace: 'nowrap',
            '&:hover': { bgcolor: '#16304f' },
          }}
        >
          Add
        </Button>
      </Box>

      {/* Sort bar — products tab only */}
      {tabValue === 0 && (
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', overflowX: 'auto', pb: 0.5, '&::-webkit-scrollbar': { display: 'none' } }}>
          <SortIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
          {[
            { key: 'name' as const, label: 'Name' },
            { key: 'price' as const, label: 'Price' },
            { key: 'stock' as const, label: 'Stock' },
            { key: 'category' as const, label: 'Category' },
          ].map(opt => {
            const isActive = sortField === opt.key;
            return (
              <Chip
                key={opt.key}
                label={opt.label}
                size="small"
                icon={isActive ? (sortDir === 'asc' ? <AscIcon sx={{ fontSize: 14 }} /> : <DescIcon sx={{ fontSize: 14 }} />) : undefined}
                onClick={() => {
                  if (isActive) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                  else { setSortField(opt.key); setSortDir('asc'); }
                }}
                sx={{
                  fontWeight: 600, fontSize: '0.75rem', height: 30, borderRadius: '15px',
                  ...(isActive
                    ? { bgcolor: '#e0e7ff', color: '#4338ca', border: '1px solid #a5b4fc', '& .MuiChip-icon': { color: '#4338ca' } }
                    : { bgcolor: 'white', color: 'text.secondary', border: '1px solid', borderColor: 'divider' }),
                }}
              />
            );
          })}
        </Box>
      )}

      {/* Count */}
      <Typography variant="body2" color="text.secondary" sx={{ mt: -0.5 }}>
        {tabValue === 0 && `${filteredProducts.length} products found`}
        {tabValue === 1 && `${filteredLocations.length} locations found`}
        {tabValue === 2 && `${filteredSuppliers.length} suppliers found`}
        {tabValue === 3 && `${filteredLinks.length} links found`}
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <>
          {/* ── Products Tab ── */}
          <TabPanel value={tabValue} index={0}>
            {filteredProducts.length === 0 ? (
              <Typography color="text.secondary" align="center" sx={{ py: 4 }}>No products found.</Typography>
            ) : (
              <Stack spacing={1.5}>
                {filteredProducts.map(product => {
                  const qty = product.total_quantity || 0;
                  const lowThreshold = product.low_stock_threshold ?? 20;
                  const isLow = qty > 0 && qty < lowThreshold;
                  const isOut = qty === 0;
                  const stockColor = isOut ? '#ef4444' : isLow ? '#f59e0b' : '#0d9488';
                  const stockLabel = isOut ? 'Out of Stock' : isLow ? 'Low' : 'In Stock';
                  const supplierName = product.supplier_name || '';

                  return (
                    <Card key={product.id} variant="outlined" sx={{ borderRadius: 3, overflow: 'visible' }}>
                      <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
                        <Box sx={{ display: 'flex', gap: 1.5 }}>
                          {/* Icon square */}
                          <Box sx={{
                            width: 44, height: 44, borderRadius: 2, flexShrink: 0, mt: 0.5,
                            bgcolor: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            <ProductIcon sx={{ color: '#4f46e5', fontSize: 22 }} />
                          </Box>

                          {/* Middle: name, sku, price, supplier */}
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle1" fontWeight={700} noWrap>{product.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {product.sku} · {product.category || 'General'}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                              <Typography variant="body2" fontWeight={700} sx={{ color: '#0d9488' }}>
                                ₹{Number(product.selling_price).toLocaleString()}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Cost: ₹{Number(product.average_cost).toLocaleString()}
                              </Typography>
                            </Box>
                            {supplierName && (
                              <Chip
                                label={supplierName}
                                size="small"
                                sx={{
                                  mt: 0.5, height: 24, fontSize: '0.7rem', fontWeight: 600,
                                  bgcolor: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
                                }}
                              />
                            )}
                            {/* Threshold indicators */}
                            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                              <Chip
                                label={`Low: ${product.low_stock_threshold ?? 20}`}
                                size="small"
                                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600, bgcolor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}
                              />
                              <Chip
                                label={`Shelf: ${product.shelf_restock_threshold ?? 5}`}
                                size="small"
                                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600, bgcolor: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe' }}
                              />
                            </Box>
                          </Box>

                          {/* Right: quantity + status */}
                          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                            <Typography variant="h5" fontWeight={700} sx={{ color: stockColor, lineHeight: 1.2 }}>
                              {qty}
                            </Typography>
                            <Typography variant="caption" sx={{ color: stockColor, fontWeight: 600 }}>
                              {stockLabel}
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>

                      {/* Action buttons */}
                      <Box sx={{ display: 'flex', borderTop: '1px solid', borderColor: 'divider' }}>
                        <Button
                          startIcon={<EditIcon />}
                          onClick={() => {
                            setEditProduct(product);
                            setEditProductOpen(true);
                          }}
                          sx={{
                            flex: 1, py: 1, borderRadius: 0, textTransform: 'none',
                            color: '#6366f1', fontWeight: 600, fontSize: '0.85rem',
                          }}
                        >
                          Edit
                        </Button>
                        <Box sx={{ width: '1px', bgcolor: 'divider' }} />
                        <Button
                          startIcon={<OrderIcon />}
                          onClick={() => {
                            setOrderProduct(product);
                            setOrderDialogOpen(true);
                          }}
                          sx={{
                            flex: 1, py: 1, borderRadius: 0, textTransform: 'none',
                            color: '#0d9488', fontWeight: 600, fontSize: '0.85rem',
                          }}
                        >
                          Order
                        </Button>
                        <Box sx={{ width: '1px', bgcolor: 'divider' }} />
                        <Button
                          startIcon={<DeleteIcon />}
                          onClick={() => handleDelete('product', product.id, product.name)}
                          sx={{
                            flex: 1, py: 1, borderRadius: 0, textTransform: 'none',
                            color: '#ef4444', fontWeight: 600, fontSize: '0.85rem',
                          }}
                        >
                          Delete
                        </Button>
                      </Box>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </TabPanel>

          {/* ── Locations Tab ── */}
          <TabPanel value={tabValue} index={1}>
            {filteredLocations.length === 0 ? (
              <Typography color="text.secondary" align="center" sx={{ py: 4 }}>No locations found.</Typography>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
                {filteredLocations.map(location => {
                  const typeColor = location.type === 'warehouse'
                    ? { bg: '#dbeafe', icon: '#2563eb', border: '#93c5fd' }
                    : location.type === 'store'
                      ? { bg: '#dcfce7', icon: '#16a34a', border: '#86efac' }
                      : { bg: '#f3e8ff', icon: '#7c3aed', border: '#c4b5fd' };
                  const TypeIconComp = location.type === 'warehouse'
                    ? WarehouseIcon
                    : location.type === 'store'
                      ? StoreIcon
                      : ExternalIcon;

                  return (
                    <Card key={location.id} variant="outlined" sx={{ borderRadius: 3, borderColor: typeColor.border, borderWidth: 1.5 }}>
                      <CardContent sx={{ pb: 1 }}>
                        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                          {/* Type icon */}
                          <Box sx={{
                            width: 42, height: 42, borderRadius: 2, flexShrink: 0,
                            bgcolor: typeColor.bg, display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            <TypeIconComp sx={{ color: typeColor.icon, fontSize: 22 }} />
                          </Box>

                          {/* Info */}
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle1" fontWeight={700} noWrap>{location.name}</Typography>
                            {location.type && (
                              <Chip
                                label={location.type}
                                size="small"
                                sx={{
                                  mt: 0.5, height: 22, fontSize: '0.7rem', fontWeight: 700,
                                  bgcolor: typeColor.bg, color: typeColor.icon,
                                  border: `1px solid ${typeColor.border}`, textTransform: 'capitalize',
                                }}
                              />
                            )}
                            {location.description && (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.4 }}>
                                {location.description}
                              </Typography>
                            )}
                            {!location.description && (
                              <Typography variant="body2" color="text.disabled" sx={{ mt: 0.75, fontStyle: 'italic', fontSize: '0.8rem' }}>
                                No description
                              </Typography>
                            )}
                          </Box>

                          {/* Delete */}
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDelete('location', location.id, location.name)}
                            sx={{ minWidth: 36, minHeight: 36, border: '1px solid', borderColor: 'error.light', borderRadius: 2, flexShrink: 0 }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            )}
          </TabPanel>

          {/* ── Suppliers Tab ── */}
          <TabPanel value={tabValue} index={2}>
            {filteredSuppliers.length === 0 ? (
              <Typography color="text.secondary" align="center" sx={{ py: 4 }}>No suppliers found.</Typography>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
                {filteredSuppliers.map(supplier => (
                  <Card key={supplier.id} variant="outlined" sx={{ borderRadius: 3 }}>
                    <CardContent sx={{ pb: 1 }}>
                      <Typography variant="subtitle1" fontWeight={700} noWrap>{supplier.name}</Typography>
                      <Stack spacing={0.5} sx={{ mt: 1 }}>
                        {supplier.contact_person && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <PersonIcon fontSize="small" color="action" />
                            <Typography variant="body2" color="text.secondary">{supplier.contact_person}</Typography>
                          </Box>
                        )}
                        {supplier.phone_number && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <PhoneIcon fontSize="small" color="action" />
                            <Typography variant="body2" color="text.secondary">{supplier.phone_number}</Typography>
                          </Box>
                        )}
                      </Stack>
                    </CardContent>
                    <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: 'flex-end' }}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDelete('supplier', supplier.id, supplier.name)}
                        sx={{ minWidth: 40, minHeight: 40, border: '1px solid', borderColor: 'error.light', borderRadius: 2 }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </CardActions>
                  </Card>
                ))}
              </Box>
            )}
          </TabPanel>

          {/* ── Links (Product Suppliers) Tab ── */}
          <TabPanel value={tabValue} index={3}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {filteredLinks.length} product-supplier link{filteredLinks.length !== 1 ? 's' : ''}
            </Typography>
            {filteredLinks.length === 0 ? (
              <Typography color="text.secondary" align="center" sx={{ py: 4 }}>No links found. Tap + to link a product to a supplier.</Typography>
            ) : (
              <Stack spacing={1.5}>
                {filteredLinks.map(link => (
                  <Card key={link.id} variant="outlined" sx={{ borderRadius: 3 }}>
                    <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle1" fontWeight={700} noWrap>{link.product_name}</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                            <SupplierIcon fontSize="small" color="action" />
                            <Typography variant="body2" color="text.secondary">{link.supplier_name}</Typography>
                          </Box>
                        </Box>
                        <Box sx={{ textAlign: 'right', ml: 1 }}>
                          <Typography fontWeight={700} color="success.main">
                            ₹{Number(link.supply_price).toLocaleString()}
                          </Typography>
                          {link.is_preferred && (
                            <Chip
                              icon={<StarIcon sx={{ fontSize: 14 }} />}
                              label="Preferred"
                              size="small"
                              color="warning"
                              variant="outlined"
                              sx={{ fontSize: '0.65rem', height: 22, mt: 0.5, fontWeight: 600 }}
                            />
                          )}
                        </Box>
                      </Box>
                      {link.supplier_sku && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                          Supplier SKU: {link.supplier_sku}
                        </Typography>
                      )}
                    </CardContent>
                    <CardActions sx={{ px: 2, py: 1, justifyContent: 'flex-end' }}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDelete('link', link.id, `${link.product_name} ↔ ${link.supplier_name}`)}
                        sx={{ minWidth: 40, minHeight: 40, border: '1px solid', borderColor: 'error.light', borderRadius: 2 }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </CardActions>
                  </Card>
                ))}
              </Stack>
            )}
          </TabPanel>
        </>
      )}



      {/* ── Dialogs ── */}
      <AddProductDialog
        open={addProductOpen}
        onClose={() => setAddProductOpen(false)}
        suppliers={suppliers}
        onSuccess={() => handleSuccess('Product created')}
      />
      <EditProductDialog
        open={editProductOpen}
        onClose={() => setEditProductOpen(false)}
        suppliers={suppliers}
        product={editProduct}
        onSuccess={() => handleSuccess('Product updated')}
      />
      <AddLocationDialog
        open={addLocationOpen}
        onClose={() => setAddLocationOpen(false)}
        onSuccess={() => handleSuccess('Location created')}
      />
      <AddSupplierDialog
        open={addSupplierOpen}
        onClose={() => setAddSupplierOpen(false)}
        onSuccess={() => handleSuccess('Supplier created')}
      />
      <AddLinkDialog
        open={addLinkOpen}
        onClose={() => setAddLinkOpen(false)}
        products={products}
        suppliers={suppliers}
        onSuccess={() => handleSuccess('Link created')}
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
      <AddToOrderMobileDialog
        open={orderDialogOpen}
        onClose={() => setOrderDialogOpen(false)}
        product={orderProduct}
        onSuccess={handleSuccess}
      />
    </Box>
  );
};
