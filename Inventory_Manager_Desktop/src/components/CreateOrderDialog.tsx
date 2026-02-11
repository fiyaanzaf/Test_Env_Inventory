import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Box, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton,
  Alert, CircularProgress, Autocomplete
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ChevronLeft,
  ChevronRight,
  ArrowDropDown,
  ArrowDropUp
} from '@mui/icons-material';

import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';

import client from '../api/client';
import { createPurchaseOrder, type POCreatePayload } from '../services/purchaseService';
import { getAllProducts } from '../services/productService';
import { getProductSupplierLinks, type ProductSupplierLink } from '../services/catalogService';

// --- Custom Calendar Header ---
function CustomCalendarHeader(props: any) {
  const { currentMonth, onMonthChange } = props;
  const selectPreviousMonth = () => onMonthChange(currentMonth.add(-1, 'month'), 'right');
  const selectNextMonth = () => onMonthChange(currentMonth.add(1, 'month'), 'left');
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1 }}>
      <IconButton onClick={selectPreviousMonth}><ChevronLeft /></IconButton>
      <Typography fontWeight="bold">{currentMonth.format('MMMM YYYY')}</Typography>
      <IconButton onClick={selectNextMonth}><ChevronRight /></IconButton>
    </Box>
  );
}

// --- Interfaces ---
interface OrderItem {
  product_id: number;
  productName: string;
  unit_cost: number;
  quantity: number;
  sku?: string;
}

interface InitialData {
  supplierId?: number;
  items?: {
    product_id: number;
    productName: string;
    unit_cost: number;
    quantity: number;
  }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: InitialData | null;
}

export const CreateOrderDialog: React.FC<Props> = ({ open, onClose, onSuccess, initialData }) => {
  // --- Master Data ---
  const [allSuppliers, setAllSuppliers] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [productSupplierLinks, setProductSupplierLinks] = useState<ProductSupplierLink[]>([]);

  // --- Form State ---
  const [supplierId, setSupplierId] = useState<string>('');
  const [expectedDate, setExpectedDate] = useState<Dayjs | null>(null);
  const [notes, setNotes] = useState('');

  // --- Line Item Input State ---
  const [currentItem, setCurrentItem] = useState({
    productId: '',
    qty: '',
    cost: ''
  });

  // --- Order List State ---
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  // --- UI State ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // --- Data Fetching on Mount ---
  useEffect(() => {
    if (open) {
      const fetchData = async () => {
        try {
          const token = localStorage.getItem('user_token');
          // 1. Fetch Suppliers
          const suppliersRes = await client.get('/api/v1/suppliers', { headers: { Authorization: `Bearer ${token}` } });
          setAllSuppliers(suppliersRes.data || []);

          // 2. Fetch All Products
          const productsRes = await getAllProducts();
          setAllProducts(Array.isArray(productsRes) ? productsRes : []);

          // 3. Fetch Product-Supplier Links (all relationships, not just preferred)
          const linksRes = await getProductSupplierLinks();
          setProductSupplierLinks(Array.isArray(linksRes) ? linksRes : []);

        } catch (err) {
          console.error(err);
          setError("Failed to load master data.");
        }
      };

      fetchData();

      // Default Reset (Only if NOT initializing)
      if (!initialData) {
        setSupplierId('');
        setExpectedDate(null);
        setNotes('');
        setOrderItems([]);
        setCurrentItem({ productId: '', qty: '', cost: '' });
        setError('');
      }
    }
  }, [open]);

  // --- Handle Initial Data (From Restock) ---
  useEffect(() => {
    if (open && initialData) {
      console.log("Applying Initial Data:", initialData);

      // 1. Set Supplier
      if (initialData.supplierId) {
        setSupplierId(String(initialData.supplierId));
      }

      // 2. Set Items
      if (initialData.items && initialData.items.length > 0) {
        const item = initialData.items[0];

        if (item) {
          // Deduce supplier from product if missing
          if (!initialData.supplierId && item.product_id && allProducts.length > 0) {
            const p = allProducts.find(prod => prod.id === item.product_id || prod.id === Number(item.product_id));
            if (p && p.supplier_id) {
              setSupplierId(String(p.supplier_id));
            }
          }

          // Set product and qty; cost will be auto-fetched by the cost lookup effect below
          const passedCost = item.unit_cost != null && Number(item.unit_cost) > 0 ? String(item.unit_cost) : '';
          setCurrentItem({
            productId: item.product_id != null ? String(item.product_id) : '',
            qty: item.quantity != null ? String(item.quantity) : '1',
            cost: passedCost
          });
        }
      }
    }
  }, [open, initialData, allProducts]);

  // --- Auto-fetch Unit Cost when product is selected but cost is empty ---
  useEffect(() => {
    if (!currentItem.productId || currentItem.cost) return;
    if (allProducts.length === 0 && productSupplierLinks.length === 0) return;

    const productId = Number(currentItem.productId);
    const sid = supplierId ? Number(supplierId) : null;
    let resolvedCost = 0;

    // Priority 1: supply_price from product-supplier link for the selected supplier
    if (productSupplierLinks.length > 0) {
      // Try exact supplier match first
      let link = sid
        ? productSupplierLinks.find(l => l.product_id === productId && l.supplier_id === sid)
        : null;
      // Fallback to preferred supplier link
      if (!link || !link.supply_price) {
        link = productSupplierLinks.find(l => l.product_id === productId && l.is_preferred) || null;
      }
      // Fallback to any supplier link for this product
      if (!link || !link.supply_price) {
        link = productSupplierLinks.find(l => l.product_id === productId && l.supply_price > 0) || null;
      }
      if (link && link.supply_price > 0) {
        resolvedCost = link.supply_price;
      }
    }

    // Priority 2: average_cost from product master data
    if (!resolvedCost && allProducts.length > 0) {
      const product = allProducts.find(p => p.id === productId);
      if (product) {
        resolvedCost = product.average_cost || (product as any).last_cost || (product as any).cost_price || 0;
      }
    }

    if (resolvedCost > 0) {
      setCurrentItem(prev => ({ ...prev, cost: String(resolvedCost) }));
    }
  }, [currentItem.productId, currentItem.cost, supplierId, allProducts, productSupplierLinks]);


  // --- COMPUTED / FILTERED LISTS ---

  const filteredProducts = useMemo(() => {
    if (!supplierId) return allProducts;
    // Get all product IDs that this supplier provides (from product_suppliers table)
    const supplierProductIds = productSupplierLinks
      .filter(link => link.supplier_id.toString() === supplierId)
      .map(link => link.product_id);
    // Return products that are in the supplier's product list
    return allProducts.filter(p => supplierProductIds.includes(p.id));
  }, [allProducts, supplierId, productSupplierLinks]);

  const filteredSuppliers = useMemo(() => {
    if (orderItems.length > 0 && supplierId) {
      return allSuppliers.filter(s => s.id.toString() === supplierId);
    }
    if (currentItem.productId) {
      const product = allProducts.find(p => p.id.toString() === currentItem.productId);
      if (product && product.supplier_id) {
        return allSuppliers.filter(s => s.id === product.supplier_id);
      }
    }
    return allSuppliers;
  }, [allSuppliers, orderItems, supplierId, currentItem.productId, allProducts]);


  // --- HANDLERS ---

  const handleSupplierChange = (newId: string) => {
    if (orderItems.length > 0 && newId !== supplierId) {
      if (!window.confirm("Changing supplier will clear your current order items. Continue?")) {
        return;
      }
      setOrderItems([]);
    }
    setSupplierId(newId);
    const currentProd = allProducts.find(p => p.id.toString() === currentItem.productId);
    if (currentProd && currentProd.supplier_id?.toString() !== newId) {
      setCurrentItem({ productId: '', qty: '', cost: '' });
    }
  };

  const handleProductChange = (newProductId: string) => {
    const product = allProducts.find(p => p.id.toString() === newProductId);

    let newCost = currentItem.cost;

    if (product) {
      // First, try to get supply_price from product-supplier relationship
      const currentSupplierId = supplierId || (product.supplier_id ? String(product.supplier_id) : '');
      const link = productSupplierLinks.find(
        l => l.product_id === product.id && l.supplier_id.toString() === currentSupplierId
      );
      
      if (link && link.supply_price != null && link.supply_price > 0) {
        // Use the specific supplier's price for this product
        newCost = String(link.supply_price);
      } else {
        // Fallback to product's average_cost or other cost fields
        const costToUse = product.average_cost ?? product.last_cost ?? product.cost_price ?? 0;
        newCost = String(costToUse);
      }
    }

    setCurrentItem({
      ...currentItem,
      productId: newProductId,
      cost: newCost
    });

    if (!supplierId && product && product.supplier_id) {
      setSupplierId(String(product.supplier_id));
    }
  };

  const handleAddItem = () => {
    if (!currentItem.productId || !currentItem.qty || !currentItem.cost) return;

    const productId = parseInt(currentItem.productId);
    const quantity = parseInt(currentItem.qty);
    const cost = parseFloat(currentItem.cost);

    const product = allProducts.find(p => p.id === productId);

    const existingIndex = orderItems.findIndex(item => item.product_id === productId);

    if (existingIndex >= 0) {
      const updatedItems = [...orderItems];
      updatedItems[existingIndex] = {
        ...updatedItems[existingIndex],
        quantity: updatedItems[existingIndex].quantity + quantity,
        unit_cost: cost
      };
      setOrderItems(updatedItems);
    } else {
      const newItem: OrderItem = {
        product_id: productId,
        productName: product?.name || 'Unknown',
        unit_cost: cost,
        quantity: quantity,
        sku: product?.sku || ''
      };
      setOrderItems([...orderItems, newItem]);
    }

    setCurrentItem({ productId: '', qty: '', cost: '' });
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...orderItems];
    newItems.splice(index, 1);
    setOrderItems(newItems);
  };

  const handleSubmit = async () => {
    if (!supplierId) {
      setError("Supplier is required.");
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload: POCreatePayload = {
        supplier_id: parseInt(supplierId),
        expected_date: expectedDate ? expectedDate.format('YYYY-MM-DD') : undefined,
        notes: notes,
        items: orderItems.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_cost: i.unit_cost
        }))
      };

      await createPurchaseOrder(payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Failed to create order");
    } finally {
      setLoading(false);
    }
  };

  const grandTotal = orderItems.reduce((acc, item) => acc + (item.quantity * item.unit_cost), 0);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ borderBottom: '1px solid #eee', mb: 2 }}>
          📝 New Purchase Order
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>

            {error && <Alert severity="error">{error}</Alert>}

            {/* --- TOP SECTION: Supplier & Date --- */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>

              <Autocomplete
                options={filteredSuppliers}
                getOptionLabel={(option) => option.name || ''}
                value={allSuppliers.find(s => s.id.toString() === supplierId) || null}
                onChange={(_event, newValue) => handleSupplierChange(newValue ? String(newValue.id) : '')}
                disabled={orderItems.length > 0}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Select Supplier"
                    required
                    helperText={orderItems.length > 0 ? "Empty list to change supplier" : "Auto-selects if you pick a product"}
                  />
                )}
              />

              <DatePicker
                label="Expected Date"
                value={expectedDate}
                onChange={(newValue) => setExpectedDate(newValue)}
                open={datePickerOpen}
                onClose={() => setDatePickerOpen(false)}
                slots={{ calendarHeader: CustomCalendarHeader }}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    onClick: () => setDatePickerOpen(true)
                  }
                }}
              />
            </Box>

            <TextField
              label="Notes / Instructions"
              fullWidth
              multiline
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            {/* --- MIDDLE SECTION: Input Fields --- */}
            <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f8fafc', borderColor: '#e2e8f0' }}>
              <Typography variant="subtitle2" gutterBottom fontWeight="bold" color="text.secondary">
                Add Items
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>

                <Autocomplete
                  options={filteredProducts}
                  getOptionLabel={(option) => `${option.name} (SKU: ${option.sku})`}
                  value={allProducts.find(p => p.id.toString() === currentItem.productId) || null}
                  onChange={(_event, newValue) => handleProductChange(newValue ? String(newValue.id) : '')}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  sx={{ flex: 2 }}
                  noOptionsText="No products found"
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Product"
                      size="small"
                    />
                  )}
                />

                <TextField
                  label="Qty"
                  type="number"
                  sx={{ flex: 1 }}
                  size="small"
                  value={currentItem.qty}
                  onChange={(e) => setCurrentItem({ ...currentItem, qty: e.target.value })}
                  InputProps={{ inputProps: { min: 1 } }}
                />

                <TextField
                  label="Unit Cost"
                  type="number"
                  sx={{ flex: 1 }}
                  size="small"
                  value={currentItem.cost}
                  onChange={(e) => setCurrentItem({ ...currentItem, cost: e.target.value })}
                  InputProps={{ startAdornment: '₹' }}
                  helperText={currentItem.cost ? "Auto-fetched" : ""}
                />

                <Button
                  variant="contained"
                  size="medium"
                  startIcon={<AddIcon />}
                  onClick={handleAddItem}
                  disabled={!currentItem.productId || !currentItem.qty || !currentItem.cost}
                  sx={{ height: 40 }}
                >
                  Add
                </Button>
              </Box>
            </Paper>

            {/* --- BOTTOM SECTION: Order Table --- */}
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>Product</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>Qty</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>Unit Cost</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>Total</TableCell>
                    <TableCell width={50}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orderItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                        No items added yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    orderItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Typography variant="body2" fontWeight="500">{item.productName}</Typography>
                          <Typography variant="caption" color="text.secondary">{item.sku}</Typography>
                        </TableCell>
                        <TableCell align="right">{item.quantity}</TableCell>
                        <TableCell align="right">₹{item.unit_cost.toFixed(2)}</TableCell>
                        <TableCell align="right">₹{(item.quantity * item.unit_cost).toFixed(2)}</TableCell>
                        <TableCell>
                          <IconButton size="small" color="error" onClick={() => handleRemoveItem(idx)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
              <Typography variant="h6" fontWeight="bold">
                Total: <span style={{ color: '#10b981' }}>₹{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </Typography>
            </Box>

          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '1px solid #f1f5f9' }}>
          <Button onClick={onClose} color="inherit" disabled={loading}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            color="primary"
            disabled={loading || orderItems.length === 0}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {loading ? 'Creating...' : 'Create Order'}
          </Button>
        </DialogActions>
      </Dialog>
    </LocalizationProvider>
  );
};