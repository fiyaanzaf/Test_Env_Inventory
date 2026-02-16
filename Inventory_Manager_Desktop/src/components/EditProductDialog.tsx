import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Box, Alert, Typography, MenuItem
} from '@mui/material';
import { updateProduct, type Product, type CreateProductData } from '../services/productService';
import client from '../api/client';

interface EditProductDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  product: Product | null;
}

export const EditProductDialog: React.FC<EditProductDialogProps> = ({ open, onClose, onSuccess, product }) => {
  const [formData, setFormData] = useState<CreateProductData>({
    sku: '', name: '', selling_price: 0, average_cost: 0,
    supplier_id: 0, category: '', unit_of_measure: '',
    low_stock_threshold: 20, shelf_restock_threshold: 5
  });

  const [sellingPriceInput, setSellingPriceInput] = useState('');
  const [costPriceInput, setCostPriceInput] = useState('');
  const [lowStockInput, setLowStockInput] = useState('20');
  const [shelfRestockInput, setShelfRestockInput] = useState('5');
  const [supplierId, setSupplierId] = useState('');

  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Populate form when product changes
  useEffect(() => {
    if (open && product) {
      setFormData({
        sku: product.sku,
        name: product.name,
        selling_price: product.selling_price,
        average_cost: product.average_cost,
        supplier_id: product.supplier_id,
        category: product.category || '',
        unit_of_measure: product.unit_of_measure || '',
        low_stock_threshold: product.low_stock_threshold ?? 20,
        shelf_restock_threshold: product.shelf_restock_threshold ?? 5,
      });
      setSellingPriceInput(String(product.selling_price));
      setCostPriceInput(String(product.average_cost));
      setLowStockInput(String(product.low_stock_threshold ?? 20));
      setShelfRestockInput(String(product.shelf_restock_threshold ?? 5));
      setSupplierId(String(product.supplier_id));
      setError('');

      // Load suppliers
      const fetchSuppliers = async () => {
        try {
          const token = localStorage.getItem('user_token');
          const res = await client.get('/api/v1/suppliers', { headers: { Authorization: `Bearer ${token}` } });
          setSuppliers(res.data);
        } catch {
          console.error('Failed to load suppliers');
        }
      };
      fetchSuppliers();
    }
  }, [open, product]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'selling_price') setSellingPriceInput(value);
    else if (name === 'average_cost') setCostPriceInput(value);
    else setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async () => {
    if (!product) return;
    if (!supplierId) { setError('Please select a supplier.'); return; }

    setLoading(true);
    setError('');
    try {
      const payload: CreateProductData = {
        ...formData,
        selling_price: parseFloat(sellingPriceInput),
        average_cost: parseFloat(costPriceInput),
        supplier_id: parseInt(supplierId),
        low_stock_threshold: parseInt(lowStockInput) || 20,
        shelf_restock_threshold: parseInt(shelfRestockInput) || 5,
      };

      if (isNaN(payload.selling_price) || isNaN(payload.average_cost)) {
        throw new Error('Prices must be valid numbers.');
      }

      await updateProduct(product.id, payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      const apiError = err.response?.data?.detail;
      setError(typeof apiError === 'string' ? apiError : (err.message || 'Failed to update product'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h5" fontWeight="700" color="text.primary">
          Edit Product
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Update product details and thresholds
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box component="form" sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

          <TextField
            label="SKU Code" name="sku"
            value={formData.sku} onChange={handleChange}
            required fullWidth placeholder="e.g. LAY-CL-50"
          />
          <TextField
            label="Product Name" name="name"
            value={formData.name} onChange={handleChange}
            required fullWidth
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="Category" name="category" value={formData.category} onChange={handleChange} />
            <TextField label="Unit (e.g. Pkt)" name="unit_of_measure" value={formData.unit_of_measure} onChange={handleChange} />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label="Selling Price (₹)" name="selling_price" type="number"
              value={sellingPriceInput} onChange={handleChange}
              required helperText="Price for customers"
            />
            <TextField
              label="Average Cost (₹)" name="average_cost" type="number"
              value={costPriceInput} onChange={handleChange}
              required helperText="Cost to buy stock"
            />
          </Box>

          <TextField
            select label="Primary Supplier"
            value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
            required fullWidth
          >
            {suppliers.map((sup) => (
              <MenuItem key={sup.id} value={sup.id}>{sup.name}</MenuItem>
            ))}
          </TextField>

          {/* THRESHOLD SETTINGS */}
          <Typography variant="subtitle2" sx={{ mt: 1, fontWeight: 600, color: '#6366f1' }}>
            Alert Thresholds
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label="Low Stock Threshold" type="number"
              value={lowStockInput} onChange={(e) => setLowStockInput(e.target.value)}
              helperText="Alert when total stock falls below"
              inputProps={{ min: 0 }}
            />
            <TextField
              label="Shelf Restock Threshold" type="number"
              value={shelfRestockInput} onChange={(e) => setShelfRestockInput(e.target.value)}
              helperText="Alert when shelf stock falls below"
              inputProps={{ min: 0 }}
            />
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} color="inherit" sx={{ fontWeight: 600 }}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading}
          sx={{
            px: 4, py: 1, borderRadius: 2, textTransform: 'none', fontWeight: 600,
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
            '&:hover': {
              background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
              boxShadow: '0 6px 15px rgba(99, 102, 241, 0.4)',
            }
          }}
        >
          {loading ? 'Updating...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
