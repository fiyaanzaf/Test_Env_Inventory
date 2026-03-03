import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Alert, TextField, MenuItem, IconButton, Autocomplete, Tooltip
} from '@mui/material';
import {
  getPurchaseOrderDetails,
  updatePOStatus,
  receivePurchaseOrder,
  addItemToPurchaseOrder,
  removeItemFromPO,
  getProductsBySupplier,
  type PurchaseOrderDetail,
  type BatchInfoItem
} from '../services/purchaseService';
import { getLocations } from '../services/inventoryService';
import { openPurchaseInvoicePDF } from '../services/invoiceService';
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { useAuthStore } from '../store/authStore';
import { BatchTrackingDialog, type CreatedBatchInfo } from './BatchTrackingDialog';
import { getVariantsForProduct, type Variant } from '../services/variantService';

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: number | null;
  onUpdate: () => void;
}

export const PurchaseOrderDetailsDialog: React.FC<Props> = ({ open, onClose, orderId, onUpdate }) => {
  const [details, setDetails] = useState<PurchaseOrderDetail | null>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');

  // --- State for Adding Items ---
  const [supplierProducts, setSupplierProducts] = useState<any[]>([]);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItem, setNewItem] = useState({ productId: '', qty: '', cost: '', variantId: '' });
  const [productVariants, setProductVariants] = useState<Variant[]>([]);

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showBatchTracking, setShowBatchTracking] = useState(false);

  // Role check - only manager/owner can place orders
  const { user } = useAuthStore();
  const canPlaceOrder = user?.roles.includes('manager') || user?.roles.includes('owner');

  useEffect(() => {
    if (open && orderId) {
      loadDetails();
    }
  }, [open, orderId]);

  const loadDetails = () => {
    if (!orderId) return;
    setLoading(true);

    Promise.all([
      getPurchaseOrderDetails(orderId),
      getLocations()
    ]).then(([poData, locData]) => {
      setDetails(poData);

      const whs = locData.filter(l => l.type === 'warehouse');
      setWarehouses(whs);
      if (whs.length === 1) setSelectedWarehouse(whs[0].id.toString());

      // If Draft, fetch products for this supplier so we can add more
      if (poData.status === 'draft') {
        getProductsBySupplier(poData.supplier_id)
          .then(res => {
            setSupplierProducts(res || []);
          })
          .catch(console.error);
      }
    })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!orderId) return;
    const action = newStatus === 'cancelled' ? 'CANCEL' : newStatus.toUpperCase();
    if (!window.confirm(`Are you sure you want to ${action} this order?`)) return;

    setActionLoading(true);
    try {
      await updatePOStatus(orderId, newStatus);
      onUpdate();
      onClose();
    } catch (err) {
      alert("Failed to update status");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReceiveOrder = async () => {
    if (!orderId || !selectedWarehouse) return;
    // Show batch tracking dialog first
    setShowBatchTracking(true);
  };

  const handleConfirmReceive = async (batchResults?: CreatedBatchInfo[]) => {
    if (!orderId || !selectedWarehouse) return;
    setActionLoading(true);
    try {
      // Convert batch results to BatchInfoItem format for the API
      let batchInfo: BatchInfoItem[] | undefined;
      if (batchResults && batchResults.length > 0) {
        batchInfo = batchResults.map(br => ({
          product_id: br.product_id,
          variant_id: br.variant_id ?? undefined,
          tracking_batch_id: br.tracking_batch_id
        }));
      }
      await receivePurchaseOrder(orderId, parseInt(selectedWarehouse), batchInfo);
      onUpdate();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.detail;
      alert(typeof msg === 'object' ? JSON.stringify(msg) : msg || "Failed to receive order");
    } finally {
      setActionLoading(false);
    }
  };

  // --- Add Item Logic ---
  const handleAddItem = async () => {
    if (!orderId || !newItem.productId || !newItem.qty || !newItem.cost) return;

    setActionLoading(true);
    try {
      await addItemToPurchaseOrder(orderId, {
        items: [{
          product_id: parseInt(newItem.productId),
          quantity: parseInt(newItem.qty),
          unit_cost: parseFloat(newItem.cost),
          variant_id: newItem.variantId ? parseInt(newItem.variantId) : undefined
        }]
      });

      // Reset and Reload
      setNewItem({ productId: '', qty: '', cost: '', variantId: '' });
      setProductVariants([]);
      setIsAddingItem(false);
      loadDetails();
      onUpdate();
    } catch (err: any) {
      const msg = err.response?.data?.detail;
      alert(typeof msg === 'object' ? JSON.stringify(msg) : msg || "Failed to add item");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveItem = async (itemId: number) => {
    if (!orderId) return;
    if (!window.confirm("Remove this item from the order?")) return;

    setActionLoading(true);
    try {
      await removeItemFromPO(orderId, itemId);
      loadDetails();
      onUpdate();
    } catch (err: any) {
      const msg = err.response?.data?.detail;
      alert(typeof msg === 'object' ? JSON.stringify(msg) : msg || "Failed to remove item");
    } finally {
      setActionLoading(false);
    }
  };

  // --- Helper to Handle Product Selection ---
  const onProductSelect = async (product: any) => {
    if (!product) {
      setNewItem({ ...newItem, productId: '', cost: '', variantId: '' });
      setProductVariants([]);
      return;
    }

    // Robust Cost Fetching Logic
    const rawCost = product.average_cost || product.last_cost || product.cost_price || product.price || 0;

    setNewItem({
      productId: product.id.toString(),
      qty: '1',
      cost: String(rawCost),
      variantId: ''
    });

    // Fetch variants for this product
    try {
      const variants = await getVariantsForProduct(product.id);
      setProductVariants(variants.filter(v => v.is_active));
    } catch {
      setProductVariants([]);
    }
  };

  const onVariantSelect = (variantId: string) => {
    setNewItem(prev => {
      const updated = { ...prev, variantId };
      // Auto-fill cost from variant if it has one
      if (variantId) {
        const variant = productVariants.find(v => v.id === parseInt(variantId));
        if (variant?.average_cost != null) {
          updated.cost = String(variant.average_cost);
        }
      }
      return updated;
    });
  };

  if (!open) return null;

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            Purchase Order #{orderId}
            {details && (
              <Chip
                label={details.status.toUpperCase()}
                size="small"
                color={details.status === 'draft' ? 'warning' : details.status === 'placed' ? 'info' : 'success'}
                sx={{ ml: 2, fontWeight: 'bold' }}
              />
            )}
          </Box>
        </DialogTitle>

        <DialogContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
          ) : details ? (
            <Box sx={{ mt: 1 }}>
              {/* Header Info */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Supplier</Typography>
                  <Typography variant="h6">{details.supplier}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Created Date</Typography>
                  <Typography variant="h6">{new Date(details.date).toLocaleDateString()}</Typography>
                </Box>
                <Box sx={{ gridColumn: 'span 2' }}>
                  <Typography variant="caption" color="text.secondary">Notes</Typography>
                  <Typography variant="body1">{details.notes || "No notes provided."}</Typography>
                </Box>
              </Box>

              {/* Items Table */}
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead sx={{ bgcolor: '#f8fafc' }}>
                    <TableRow>
                      <TableCell>Product</TableCell>
                      <TableCell>SKU</TableCell>
                      <TableCell>Variant</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Cost</TableCell>
                      <TableCell align="right">Subtotal</TableCell>
                      {details.status === 'draft' && <TableCell width={50}></TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {details.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.sku}</TableCell>
                        <TableCell>
                          {item.variant_name ? (
                            <Chip label={item.variant_name} size="small" sx={{ bgcolor: '#dbeafe', color: '#1d4ed8', fontWeight: 500, fontSize: '0.7rem' }} />
                          ) : (
                            <Typography variant="caption" color="text.secondary">—</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">{item.qty}</TableCell>
                        <TableCell align="right">₹{item.cost}</TableCell>
                        <TableCell align="right">₹{item.subtotal}</TableCell>

                        {details.status === 'draft' && (
                          <TableCell>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleRemoveItem(item.id)}
                              disabled={actionLoading}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={5} align="right" sx={{ fontWeight: 'bold' }}>Total</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>₹{details.total.toLocaleString()}</TableCell>
                      {details.status === 'draft' && <TableCell />}
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>

              {/* --- ADD ITEM SECTION (Draft Only) --- */}
              {details.status === 'draft' && (
                <Box sx={{ mt: 2 }}>
                  {!isAddingItem ? (
                    <Button startIcon={<AddIcon />} onClick={() => setIsAddingItem(true)}>
                      Add Item
                    </Button>
                  ) : (
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f8fafc', display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                      {/* Autocomplete for easier selection */}
                      <Autocomplete
                        options={supplierProducts}
                        getOptionLabel={(option) => `${option.name} (${option.sku})`}
                        sx={{ flex: 2 }}
                        size="small"
                        onChange={(_e, value) => onProductSelect(value)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Select Product"
                            placeholder="Search..."
                          />
                        )}
                      />

                      <TextField
                        label="Qty"
                        type="number"
                        size="small"
                        sx={{ width: 100 }}
                        value={newItem.qty}
                        onChange={e => setNewItem({ ...newItem, qty: e.target.value })}
                      />
                      <TextField
                        label="Cost"
                        type="number"
                        size="small"
                        sx={{ width: 120 }}
                        value={newItem.cost}
                        onChange={e => setNewItem({ ...newItem, cost: e.target.value })}
                        helperText="Per Unit"
                      />

                      {/* Variant Selector — only shows when product has variants */}
                      {productVariants.length > 0 && (
                        <TextField
                          select
                          label="Variant"
                          size="small"
                          sx={{ minWidth: 160 }}
                          value={newItem.variantId}
                          onChange={e => onVariantSelect(e.target.value)}
                          helperText="Select pack/size"
                        >
                          <MenuItem value="">Base Product</MenuItem>
                          {productVariants.map(v => (
                            <MenuItem key={v.id} value={v.id}>
                              {v.variant_name} {v.average_cost != null ? `(₹${v.average_cost})` : ''}
                            </MenuItem>
                          ))}
                        </TextField>
                      )}
                      <Button
                        variant="contained"
                        onClick={handleAddItem}
                        disabled={actionLoading || !newItem.productId || !newItem.qty || !newItem.cost}
                        sx={{ mt: 0.5 }}
                      >
                        Add
                      </Button>
                      <Button
                        color="inherit"
                        onClick={() => {
                          setIsAddingItem(false);
                          setProductVariants([]);
                          setNewItem({ productId: '', qty: '', cost: '', variantId: '' });
                        }}
                        sx={{ mt: 0.5 }}
                      >
                        Cancel
                      </Button>
                    </Paper>
                  )}
                </Box>
              )}

              {details.status === 'draft' && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  This order is a <b>Draft</b>. Review the items above and click "Place Order" to finalize it.
                </Alert>
              )}

              {/* Warehouse Selection for PLACED orders */}
              {details.status === 'placed' && (
                <Box sx={{ mt: 3, p: 2, bgcolor: '#f0fdf4', borderRadius: 2, border: '1px solid #bbf7d0' }}>
                  <Typography variant="subtitle2" gutterBottom color="success.dark" fontWeight="bold">
                    Ready to Receive Stock?
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField
                      select
                      label="Select Receiving Warehouse"
                      size="small"
                      sx={{ minWidth: 250, bgcolor: 'white' }}
                      value={selectedWarehouse}
                      onChange={(e) => setSelectedWarehouse(e.target.value)}
                      disabled={warehouses.length === 0}
                      helperText={warehouses.length === 0 ? "No warehouses defined in system" : ""}
                    >
                      {warehouses.map(w => (
                        <MenuItem key={w.id} value={w.id}>🏭 {w.name}</MenuItem>
                      ))}
                    </TextField>
                    <Button
                      variant="contained"
                      color="success"
                      onClick={handleReceiveOrder}
                      disabled={!selectedWarehouse || actionLoading}
                    >
                      {actionLoading ? 'Receiving...' : 'Mark Received & Update Inventory'}
                    </Button>
                  </Box>
                </Box>
              )}

            </Box>
          ) : (
            <Typography>Failed to load details.</Typography>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={onClose} disabled={actionLoading}>Close</Button>

          {details?.status === 'draft' && (
            <>
              <Button
                onClick={() => handleStatusChange('cancelled')}
                color="error"
                disabled={actionLoading}
              >
                Cancel Draft
              </Button>
              {canPlaceOrder ? (
                <Button
                  onClick={() => handleStatusChange('placed')}
                  variant="contained"
                  color="primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Processing...' : 'Place Order'}
                </Button>
              ) : (
                <Tooltip title="Only Managers can place orders">
                  <span>
                    <Button
                      variant="contained"
                      disabled
                    >
                      Place Order (Manager Only)
                    </Button>
                  </span>
                </Tooltip>
              )}
            </>
          )}

          {/* --- ADDED: Cancel Button & Download Invoice for Placed/Received Orders --- */}
          {(details?.status === 'placed' || details?.status === 'received') && (
            <>
              <Button
                onClick={() => orderId && openPurchaseInvoicePDF(orderId)}
                variant="outlined"
                color="primary"
              >
                {details.status === 'placed' ? 'View Purchase Order' : 'View GRN'}
              </Button>
              {details.status === 'placed' && (
                <Button
                  onClick={() => handleStatusChange('cancelled')}
                  color="error"
                  disabled={actionLoading}
                >
                  Cancel Order
                </Button>
              )}
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Batch Tracking Dialog for PO Receive Flow */}
      {
        details && (
          <BatchTrackingDialog
            open={showBatchTracking}
            onClose={() => setShowBatchTracking(false)}
            poId={orderId || 0}
            supplierId={details.supplier_id}
            items={details.items.map(item => ({
              product_id: item.product_id,
              product_name: item.name,
              variant_id: item.variant_id ?? null,
              variant_name: item.variant_name ?? null,
              quantity: item.qty
            }))}
            onSuccess={handleConfirmReceive}
          />
        )
      }
    </>
  );
};
