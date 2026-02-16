import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, List, ListItem, ListItemText,
  Typography, Chip, Box, Divider, IconButton, CircularProgress, Tabs, Tab, Badge, Alert, 
  Card, CardContent, Collapse
} from '@mui/material';
import {
  Warning as WarningIcon, Close as CloseIcon,
  AddShoppingCart as AddShoppingCartIcon,
  LocalShipping as ShippingIcon, PendingActions as PendingIcon,
  ErrorOutline as CriticalIcon, ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon
} from '@mui/icons-material';
import client from '../api/client';
import { getProductSupplierLinks, type ProductSupplierLink } from '../services/catalogService';

interface LowStockItem {
  product_id: number;
  product_name: string;
  current_stock: number;
  reorder_level: number;
  supplier_name?: string;
  supplier_id?: number;
  average_cost?: number;
  quantity_on_order?: number;
  quantity_in_draft?: number;
  draft_order_id?: number | null;
  draft_supplier_name?: string;
  placed_supplier_name?: string;
}

interface GroupedDraft {
  orderId: number;
  supplierName: string;
  items: LowStockItem[];
  totalItems: number;
}

interface LowStockDialogProps {
  open: boolean;
  onClose: () => void;
}

export const LowStockDialog: React.FC<LowStockDialogProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());
  const [tabValue, setTabValue] = useState(0);
  const [productSupplierLinks, setProductSupplierLinks] = useState<ProductSupplierLink[]>([]);

  useEffect(() => {
    if (open) {
      fetchLowStock();
      getProductSupplierLinks()
        .then(links => setProductSupplierLinks(Array.isArray(links) ? links : []))
        .catch(() => {});
    }
  }, [open]);

  const fetchLowStock = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('user_token');
      const response = await client.get('/api/v1/reports/low_stock_reorder', {
        headers: { 'Authorization': `Bearer ${token}` },
        params: { format: 'json' }
      });
      setItems(response.data);
    } catch (error) {
      console.error('Failed to fetch low stock items', error);
    } finally {
      setLoading(false);
    }
  };

  // Group items by draft_order_id for Pending tab
  const groupedDrafts = useMemo((): GroupedDraft[] => {
    const groups = new Map<number, LowStockItem[]>();
    items.forEach(item => {
      if (item.draft_order_id && item.quantity_in_draft && item.quantity_in_draft > 0) {
        if (!groups.has(item.draft_order_id)) {
          groups.set(item.draft_order_id, []);
        }
        groups.get(item.draft_order_id)!.push(item);
      }
    });
    return Array.from(groups.entries()).map(([orderId, groupItems]) => ({
      orderId,
      supplierName: groupItems[0]?.draft_supplier_name || groupItems[0]?.supplier_name || 'Unknown',
      items: groupItems,
      totalItems: groupItems.length
    }));
  }, [items]);

  // Filtering Logic for Tabs
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const reorderLvl = Number(item.reorder_level) || 0;
      const currentStk = Number(item.current_stock) || 0;
      const incoming = Number(item.quantity_on_order) || 0;
      const draft = Number(item.quantity_in_draft) || 0;
      const shortfall = Math.max(reorderLvl - currentStk, 0);
      const totalIncoming = incoming + draft;

      if (tabValue === 0) return true;
      if (tabValue === 1) return totalIncoming < shortfall;
      if (tabValue === 2) return draft > 0;
      if (tabValue === 3) return incoming > 0;
      return true;
    });
  }, [items, tabValue]);

  // Counts for Badges
  const counts = useMemo(() => {
    let critical = 0, pending = 0, incoming = 0;
    items.forEach(item => {
      const reorderLvl = Number(item.reorder_level) || 0;
      const currentStk = Number(item.current_stock) || 0;
      const inc = Number(item.quantity_on_order) || 0;
      const draft = Number(item.quantity_in_draft) || 0;
      const shortfall = Math.max(reorderLvl - currentStk, 0);
      if ((inc + draft) < shortfall) critical++;
      if (draft > 0) pending++;
      if (inc > 0) incoming++;
    });
    return { critical, pending, incoming };
  }, [items]);

  const toggleOrderExpansion = (orderId: number) => {
    const newSet = new Set(expandedOrders);
    if (newSet.has(orderId)) newSet.delete(orderId);
    else newSet.add(orderId);
    setExpandedOrders(newSet);
  };

  const handleQuickOrder = (item: LowStockItem) => {
    // Resolve cost: try product-supplier link first, then average_cost
    let unitCost = item.average_cost || 0;
    if (productSupplierLinks.length > 0 && item.product_id) {
      const link = productSupplierLinks.find(
        l => l.product_id === item.product_id &&
          (item.supplier_id ? l.supplier_id === item.supplier_id : l.is_preferred)
      );
      if (link && link.supply_price > 0) {
        unitCost = link.supply_price;
      } else {
        const anyLink = productSupplierLinks.find(l => l.product_id === item.product_id && l.supply_price > 0);
        if (anyLink) unitCost = anyLink.supply_price;
      }
    }

    onClose();
    navigate('/orders', {
      state: {
        openCreateDialog: true,
        initialData: {
          supplierId: item.supplier_id,
          items: [{
            product_id: item.product_id,
            productName: item.product_name,
            unit_cost: unitCost,
            quantity: Math.max((item.reorder_level || 0) - (item.current_stock || 0), 10)
          }]
        }
      }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      PaperProps={{ sx: { bgcolor: '#f8fafc' } }}
    >
      <DialogTitle sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        bgcolor: '#dc2626', color: 'white', py: 1.5, px: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon sx={{ fontSize: 24 }} />
          <Typography variant="h6" fontWeight="bold" fontSize="1.1rem">
            Critical Stock Alerts
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: 'white' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Tabs
        value={tabValue}
        onChange={(_, val) => setTabValue(val)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ bgcolor: 'white', borderBottom: 1, borderColor: 'divider', minHeight: 44 }}
      >
        <Tab label="All" sx={{ minHeight: 44, textTransform: 'none', fontSize: '0.8rem', minWidth: 60 }} />
        <Tab
          icon={<Badge badgeContent={counts.critical} color="error" sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 16, minWidth: 16 } }}><CriticalIcon sx={{ fontSize: 18 }} /></Badge>}
          iconPosition="start"
          label="Action"
          sx={{ minHeight: 44, textTransform: 'none', fontSize: '0.8rem', minWidth: 80 }}
        />
        <Tab
          icon={<Badge badgeContent={counts.pending} color="warning" sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 16, minWidth: 16 } }}><PendingIcon sx={{ fontSize: 18 }} /></Badge>}
          iconPosition="start"
          label="Pending"
          sx={{ minHeight: 44, textTransform: 'none', fontSize: '0.8rem', minWidth: 80 }}
        />
        <Tab
          icon={<Badge badgeContent={counts.incoming} color="primary" sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 16, minWidth: 16 } }}><ShippingIcon sx={{ fontSize: 18 }} /></Badge>}
          iconPosition="start"
          label="Incoming"
          sx={{ minHeight: 44, textTransform: 'none', fontSize: '0.8rem', minWidth: 80 }}
        />
      </Tabs>

      {tabValue === 2 && groupedDrafts.length > 0 && (
        <Alert severity="info" sx={{ mx: 1, mt: 1, fontSize: '0.8rem' }}>
          {groupedDrafts.length} draft order(s) ready. Go to Orders to review.
        </Alert>
      )}

      <DialogContent sx={{ p: 1, flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : tabValue === 2 ? (
          // PENDING TAB
          groupedDrafts.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
              <Typography variant="body1" fontWeight={600}>No pending draft orders</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>Create orders from "Action" tab.</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {groupedDrafts.map((group) => {
                const isExpanded = expandedOrders.has(group.orderId);
                return (
                  <Card key={group.orderId} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                    <Box
                      sx={{ p: 1.5, bgcolor: '#fff9e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                      onClick={() => toggleOrderExpansion(group.orderId)}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                        <IconButton size="small" sx={{ p: 0.5 }}>
                          {isExpanded ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
                        </IconButton>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">Draft #{group.orderId}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {group.supplierName} · {group.totalItems} item(s)
                          </Typography>
                        </Box>
                      </Box>
                      <Button
                        variant="contained" color="primary" size="small"
                        sx={{ fontSize: '0.7rem', textTransform: 'none', minWidth: 0, px: 1.5 }}
                        onClick={(e) => { e.stopPropagation(); onClose(); navigate('/orders'); }}
                      >
                        View
                      </Button>
                    </Box>
                    <Collapse in={isExpanded}>
                      <List disablePadding dense>
                        {group.items.map((item) => (
                          <ListItem key={item.product_id} sx={{ borderTop: '1px solid #eee', py: 0.5 }}>
                            <ListItemText
                              primary={<Typography variant="body2" fontWeight={500}>{item.product_name}</Typography>}
                              secondary={<Typography variant="caption" color="text.secondary">Draft Qty: {item.quantity_in_draft}</Typography>}
                            />
                            <Chip label={`${item.current_stock}/${item.reorder_level}`} size="small" color="warning" variant="outlined" sx={{ fontSize: '0.7rem', height: 22 }} />
                          </ListItem>
                        ))}
                      </List>
                    </Collapse>
                  </Card>
                );
              })}
            </Box>
          )
        ) : filteredItems.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body1" fontWeight={600}>No items in this tab</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>Try switching to "All".</Typography>
          </Box>
        ) : (
          // ALL / ACTION / INCOMING TABS
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {filteredItems.map((item) => {
              const reorderLvl = Number(item.reorder_level) || 0;
              const currentStk = Number(item.current_stock) || 0;
              const incoming = Number(item.quantity_on_order) || 0;
              const draft = Number(item.quantity_in_draft) || 0;
              const shortfall = Math.max(reorderLvl - currentStk, 0);
              const totalIncoming = incoming + draft;
              const isCovered = totalIncoming >= shortfall;
              const hasDraftOrder = !!item.draft_order_id;

              return (
                <Card
                  key={item.product_id}
                  variant="outlined"
                  sx={{
                    borderRadius: 2,
                    borderColor: isCovered ? '#86efac' : '#fecaca',
                    bgcolor: isCovered ? '#f0fdf4' : 'white'
                  }}
                >
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={700} color={isCovered ? 'success.dark' : '#c62828'} noWrap>
                          {item.product_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {tabValue === 3 ? (item.placed_supplier_name || item.supplier_name || 'N/A') : (item.supplier_name || 'N/A')}
                          {item.average_cost ? ` · ₹${item.average_cost}` : ''}
                        </Typography>
                      </Box>
                      <Chip
                        label={`${currentStk}/${reorderLvl}`}
                        size="small"
                        color={isCovered ? 'success' : 'error'}
                        variant={isCovered ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 'bold', fontSize: '0.75rem', height: 24, ml: 1, flexShrink: 0 }}
                      />
                    </Box>

                    {/* Status chips */}
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                      {incoming > 0 && (
                        <Chip
                          icon={<ShippingIcon sx={{ fontSize: '12px !important' }} />}
                          label={`Incoming: ${incoming}`}
                          size="small" color="primary" variant="filled"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      )}
                      {draft > 0 && (
                        <Chip
                          icon={<PendingIcon sx={{ fontSize: '12px !important' }} />}
                          label={`Pending: ${draft}`}
                          size="small" color="warning" variant="outlined"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      )}

                      {/* Action button */}
                      <Box sx={{ ml: 'auto' }}>
                        {tabValue === 3 ? (
                          <Button
                            size="small" variant="text"
                            sx={{ fontSize: '0.7rem', textTransform: 'none', p: 0.5, minWidth: 0 }}
                            onClick={() => { onClose(); navigate('/orders'); }}
                          >
                            View Order
                          </Button>
                        ) : (
                          <Button
                            size="small" variant="contained"
                            startIcon={<AddShoppingCartIcon sx={{ fontSize: 14 }} />}
                            sx={{
                              fontSize: '0.7rem', textTransform: 'none', py: 0.3, px: 1.5,
                              borderRadius: 1.5,
                              bgcolor: isCovered ? '#94a3b8' : '#2563eb',
                              '&:hover': { bgcolor: isCovered ? '#64748b' : '#1d4ed8' }
                            }}
                            onClick={() => handleQuickOrder(item)}
                          >
                            {hasDraftOrder ? 'Add More' : isCovered ? 'Add More' : 'Quick Order'}
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ p: 1.5, bgcolor: 'white' }}>
        <Button onClick={onClose} variant="outlined" color="inherit" fullWidth sx={{ textTransform: 'none' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
