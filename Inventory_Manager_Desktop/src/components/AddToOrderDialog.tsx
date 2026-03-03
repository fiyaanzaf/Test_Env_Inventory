import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Chip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { type Product } from '../services/productService';
import { getVariantsForProduct, type Variant } from '../services/variantService';
import {
  getPurchaseOrders,
  createPurchaseOrder,
  addItemToPurchaseOrder,
  type PurchaseOrder
} from '../services/purchaseService';

interface Props {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  onSuccess: () => void;
}

export const AddToOrderDialog: React.FC<Props> = ({ open, onClose, product, onSuccess }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState(0);

  // Logic State
  const [activeDraft, setActiveDraft] = useState<PurchaseOrder | null>(null);
  const [checkingDraft, setCheckingDraft] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState('');

  // 1. Reset form and check for drafts when product changes
  useEffect(() => {
    if (open && product) {
      setQuantity(1);

      // Robust Cost Fetching
      const p = product as any;
      const detectedCost = p.average_cost || p.last_cost || p.cost_price || p.price || 0;

      setUnitCost(parseFloat(detectedCost));
      setError('');
      setSelectedVariantId('');

      // Fetch variants for this product
      getVariantsForProduct(product.id)
        .then(v => setVariants(v.filter(x => x.is_active)))
        .catch(() => setVariants([]));

      if (product.supplier_id) {
        checkActiveDraft(product.supplier_id);
      }
    }
  }, [open, product]);

  // 2. Check if we already have a DRAFT order for this supplier
  const checkActiveDraft = async (supplierId: number) => {
    setCheckingDraft(true);
    try {
      const orders = await getPurchaseOrders();
      // Find a draft order for THIS supplier
      const draft = orders.find(o => o.status === 'draft' && o.supplier_id === supplierId);
      setActiveDraft(draft || null);
    } catch (err) {
      console.error(err);
      // Don't block the UI, just assume no draft
    } finally {
      setCheckingDraft(false);
    }
  };

  const handleConfirm = async () => {
    if (!product) return;
    if (quantity <= 0) {
      setError("Quantity must be greater than 0");
      return;
    }
    if (unitCost <= 0) {
      setError("Cost must be greater than 0");
      return;
    }

    setLoading(true);
    setError('');

    try {
      const itemPayload = {
        product_id: product.id,
        quantity: quantity,
        unit_cost: unitCost,
        variant_id: selectedVariantId ? parseInt(selectedVariantId) : undefined
      };

      if (activeDraft) {
        await addItemToPurchaseOrder(activeDraft.id, {
          items: [itemPayload]
        });
      } else {
        await createPurchaseOrder({
          supplier_id: product.supplier_id,
          items: [itemPayload]
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Failed to add item to order.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewManual = () => {
    // Redirect user to the full Order Page to create a specific new order
    navigate('/orders', {
      state: {
        create_mode: true,
        initialData: {
          supplier_id: product?.supplier_id,
          items: [{
            product_id: product?.id,
            quantity: quantity,
            unit_cost: unitCost
          }]
        }
      }
    });
  };

  if (!product) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        Add to Purchase Order
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>

          {/* Product Info Summary */}
          <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" color="text.secondary">Product</Typography>
            <Typography variant="h6">{product.name}</Typography>
            <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
              <Typography variant="body2">SKU: <b>{product.sku}</b></Typography>
              <Typography variant="body2">Supplier ID: <b>{product.supplier_id || 'N/A'}</b></Typography>
            </Box>
          </Box>

          {/* Variant Selector */}
          {variants.length > 0 && (
            <TextField
              select
              label="Select Variant"
              fullWidth
              value={selectedVariantId}
              onChange={(e) => {
                setSelectedVariantId(e.target.value);
                // Auto-fill cost from variant
                if (e.target.value) {
                  const v = variants.find(v => v.id === parseInt(e.target.value));
                  if (v?.average_cost != null) {
                    setUnitCost(v.average_cost);
                  }
                } else {
                  // Reset to product cost
                  const p = product as any;
                  setUnitCost(parseFloat(p.average_cost || p.price || 0));
                }
              }}
              helperText="This product has variants — select one for accurate pricing"
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: 2 },
                bgcolor: '#f0f4ff'
              }}
            >
              <MenuItem value="">Base Product (no variant)</MenuItem>
              {variants.map(v => (
                <MenuItem key={v.id} value={v.id}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <span>{v.variant_name}</span>
                    {v.average_cost != null && (
                      <Chip label={`₹${v.average_cost}`} size="small" sx={{ ml: 1, fontWeight: 600, bgcolor: '#dcfce7', color: '#166534' }} />
                    )}
                  </Box>
                </MenuItem>
              ))}
            </TextField>
          )}

          {/* Draft Status Indicator */}
          {checkingDraft ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="caption">Checking for active drafts...</Typography>
            </Box>
          ) : activeDraft ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              Found an active <b>Draft Order #{activeDraft.id}</b> for this supplier.
              Item will be added there.
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              No active draft found for this supplier. A <b>New Purchase Order</b> will be created automatically.
            </Alert>
          )}

          {/* Input Fields */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Quantity"
              type="number"
              fullWidth
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
              InputProps={{ inputProps: { min: 1 } }}
            />
            <TextField
              label="Unit Cost (₹)"
              type="number"
              fullWidth
              value={unitCost}
              onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)}
              helperText="Buying Price"
            />
          </Box>

          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>

        {!activeDraft && (
          <Button onClick={handleCreateNewManual} color="primary">
            Advanced Create
          </Button>
        )}

        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={loading || checkingDraft}
        >
          {loading ? 'Adding...' : activeDraft ? 'Add to Draft' : 'Create & Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};