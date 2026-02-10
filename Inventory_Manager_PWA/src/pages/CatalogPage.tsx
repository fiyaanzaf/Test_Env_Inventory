import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Tabs, Tab, Card, CardContent, CardActions, Button,
  IconButton, CircularProgress, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions, MenuItem, Select, FormControl, InputLabel, Fab, Chip,
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
  Person as PersonIcon
} from '@mui/icons-material';

import { getAllProducts, createProduct, type Product, type CreateProductData } from '../services/productService';
import {
  getLocations, createLocation, deleteLocation,
  getSuppliers, createSupplier, deleteSupplier,
  type Location, type Supplier, type CreateLocationData, type CreateSupplierData
} from '../services/catalogService';

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
  const [form, setForm] = useState<CreateProductData>({ sku: '', name: '', selling_price: 0, average_cost: 0, supplier_id: 0, category: '', unit_of_measure: 'pcs' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ sku: '', name: '', selling_price: 0, average_cost: 0, supplier_id: 0, category: '', unit_of_measure: 'pcs' });
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
        <TextField label="SKU" fullWidth value={form.sku} onChange={e => update('sku', e.target.value)} />
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
        <TextField label="Unit of Measure" fullWidth value={form.unit_of_measure} onChange={e => update('unit_of_measure', e.target.value)} />
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

// ─── Main Catalog Page ───────────────────────────────────────────────────────

export const CatalogPage: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  const loadData = async () => {
    setLoading(true);
    try {
      const [productsData, locationsData, suppliersData] = await Promise.all([
        getAllProducts(),
        getLocations(),
        getSuppliers(),
      ]);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setLocations(Array.isArray(locationsData) ? locationsData : []);
      setSuppliers(Array.isArray(suppliersData) ? suppliersData : []);
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

  const handleDelete = async (type: 'location' | 'supplier', id: number, name: string) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      if (type === 'location') await deleteLocation(id);
      else await deleteSupplier(id);
      handleSuccess(`${name} deleted`);
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.detail || 'Delete failed', severity: 'error' });
    }
  };

  // Filtering
  const filteredProducts = products.filter(p => {
    const q = searchQuery.toLowerCase();
    return (p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
  });
  const filteredLocations = locations.filter(l => l.name?.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredSuppliers = suppliers.filter(s => {
    const q = searchQuery.toLowerCase();
    return (s.name?.toLowerCase().includes(q) || s.contact_person?.toLowerCase().includes(q));
  });

  // Which FAB to show
  const handleFabClick = () => {
    if (tabValue === 0) setAddProductOpen(true);
    else if (tabValue === 1) setAddLocationOpen(true);
    else setAddSupplierOpen(true);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 10, px: { xs: 1, sm: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ pt: { xs: 1, sm: 2 } }}>
        <Typography variant="h5" fontWeight={700} color="primary.main">Catalog</Typography>
        <Typography variant="body2" color="text.secondary">Products, Locations & Suppliers</Typography>
      </Box>

      {/* Search */}
      <TextField
        variant="outlined"
        placeholder="Search..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        size="small"
        fullWidth
        InputProps={{
          startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>,
        }}
        sx={{ bgcolor: 'white', borderRadius: 1 }}
      />

      {/* Tabs */}
      <Tabs
        value={tabValue}
        onChange={(_e, v) => setTabValue(v)}
        variant="fullWidth"
        sx={{
          bgcolor: 'background.paper',
          borderRadius: 2,
          minHeight: 48,
          '& .MuiTab-root': { minHeight: 48, textTransform: 'none', fontWeight: 600 },
        }}
      >
        <Tab icon={<ProductIcon />} iconPosition="start" label="Products" />
        <Tab icon={<LocationIcon />} iconPosition="start" label="Locations" />
        <Tab icon={<SupplierIcon />} iconPosition="start" label="Suppliers" />
      </Tabs>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <>
          {/* ── Products Tab ── */}
          <TabPanel value={tabValue} index={0}>
            {filteredProducts.length === 0 ? (
              <Typography color="text.secondary" align="center" sx={{ py: 4 }}>No products found.</Typography>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
                {filteredProducts.map(product => (
                  <Card key={product.id} variant="outlined" sx={{ borderRadius: 3 }}>
                    <CardContent sx={{ pb: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle1" fontWeight={700} noWrap>{product.name}</Typography>
                          <Typography variant="caption" color="text.secondary">SKU: {product.sku}</Typography>
                        </Box>
                        <Chip
                          label={`₹${Number(product.selling_price).toLocaleString()}`}
                          size="small"
                          color="success"
                          variant="outlined"
                          sx={{ fontWeight: 700, ml: 1 }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                        {product.category && (
                          <Chip label={product.category} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 22 }} />
                        )}
                        <Chip
                          label={`Qty: ${product.total_quantity || 0}`}
                          size="small"
                          color={(product.total_quantity || 0) < 10 ? 'error' : 'default'}
                          variant="outlined"
                          sx={{ fontSize: '0.7rem', height: 22, fontWeight: 600 }}
                        />
                      </Box>
                    </CardContent>
                    <CardActions sx={{ px: 2, pb: 2, pt: 0 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                        Cost: ₹{Number(product.average_cost).toLocaleString()}
                      </Typography>
                    </CardActions>
                  </Card>
                ))}
              </Box>
            )}
          </TabPanel>

          {/* ── Locations Tab ── */}
          <TabPanel value={tabValue} index={1}>
            {filteredLocations.length === 0 ? (
              <Typography color="text.secondary" align="center" sx={{ py: 4 }}>No locations found.</Typography>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
                {filteredLocations.map(location => (
                  <Card key={location.id} variant="outlined" sx={{ borderRadius: 3 }}>
                    <CardContent sx={{ pb: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                          <LocationIcon color="primary" />
                          <Typography variant="subtitle1" fontWeight={700} noWrap>{location.name}</Typography>
                        </Box>
                        <Chip
                          label={location.type}
                          size="small"
                          color={location.type === 'warehouse' ? 'primary' : location.type === 'store' ? 'success' : 'default'}
                          variant="outlined"
                          sx={{ fontWeight: 600, textTransform: 'capitalize' }}
                        />
                      </Box>
                      {location.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{location.description}</Typography>
                      )}
                    </CardContent>
                    <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: 'flex-end' }}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDelete('location', location.id, location.name)}
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
        </>
      )}

      {/* FAB */}
      <Fab
        color="primary"
        onClick={handleFabClick}
        sx={{
          position: 'fixed',
          bottom: { xs: 72, sm: 24 },
          right: { xs: 16, sm: 24 },
          width: 56,
          height: 56,
          zIndex: 1200,
        }}
      >
        <AddIcon />
      </Fab>

      {/* ── Dialogs ── */}
      <AddProductDialog
        open={addProductOpen}
        onClose={() => setAddProductOpen(false)}
        suppliers={suppliers}
        onSuccess={() => handleSuccess('Product created')}
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
