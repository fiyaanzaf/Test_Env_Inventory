import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Chip, Card, CardContent, CircularProgress,
  Tabs, Tab, Badge, TextField, InputAdornment, Button,
  FormControl, InputLabel, Select, MenuItem, Pagination,
  IconButton, Snackbar, Alert, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack,
} from '@mui/material';
import {
  ErrorOutline as ErrorIcon, CheckCircle as SuccessIcon,
  DoneAll as DoneIcon, NotificationsActive as AlertIcon,
  Inventory as ShelfIcon, ShoppingCart as CartIcon,
  History as HistoryIcon, Search as SearchIcon,
  FilterList as FilterIcon, Delete as WriteOffIcon,
  Backup as BackupIcon, Clear as ClearIcon,
  SwapHoriz as TransferIcon, Close as CloseIcon,
} from '@mui/icons-material';
import client from '../api/client';
import { transferStock, getProductStock, getLocations, type ProductStockInfo, type Location } from '../services/inventoryService';
import { getProductSupplierLinks, type ProductSupplierLink } from '../services/catalogService';

// ── Types ───────────────────────────────────────────────────────────────────
interface StockAlert {
  id: number;
  severity: string;
  message: string;
  is_resolved: boolean;
  status: string;
  created_at: string;
}

interface OperationsLog {
  id: number;
  timestamp: string;
  username: string;
  operation_type: string;
  sub_type: string | null;
  target_id: number | null;
  quantity: number | null;
  reason: string | null;
  file_name: string | null;
  ip_address: string | null;
  details: Record<string, unknown>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const getAlertType = (message: string): 'shelf_restock' | 'low_stock' | 'added_to_order' | 'other' => {
  if (message.includes('ADDED TO ORDER')) return 'added_to_order';
  if (message.includes('SHELF RESTOCK NEEDED')) return 'shelf_restock';
  if (message.includes('LOW STOCK')) return 'low_stock';
  return 'other';
};

const getAlertTypeColor = (type: string) => {
  if (type === 'shelf_restock') return { bg: '#fef3c7', color: '#92400e', border: '#fde68a' };
  if (type === 'low_stock') return { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' };
  if (type === 'added_to_order') return { bg: '#dcfce7', color: '#166534', border: '#86efac' };
  return { bg: '#e0f2fe', color: '#075985', border: '#bae6fd' };
};

const getAlertTypeLabel = (type: string) => {
  switch (type) {
    case 'shelf_restock': return 'Shelf Restock';
    case 'low_stock': return 'Low Stock';
    case 'added_to_order': return 'Added to Order';
    default: return 'Other';
  }
};

const getAlertTypeIcon = (type: string) => {
  switch (type) {
    case 'shelf_restock': return <ShelfIcon sx={{ fontSize: 18 }} />;
    case 'low_stock': return <ErrorIcon sx={{ fontSize: 18 }} />;
    case 'added_to_order': return <SuccessIcon sx={{ fontSize: 18 }} />;
    default: return <AlertIcon sx={{ fontSize: 18 }} />;
  }
};

const extractProductName = (message: string): string => {
  if (message.includes('ADDED TO ORDER:')) {
    const match = message.match(/ADDED TO ORDER:\s*(.+?)\s*has been added/);
    return match ? match[1].trim() : 'Unknown Product';
  }
  const match = message.match(/'([^']+)'/);
  return match ? match[1] : 'Unknown Product';
};

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('user_token')}` },
});

// ── Main Component ──────────────────────────────────────────────────────────
export const StockAlertsPage: React.FC = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [alertPage, setAlertPage] = useState(1);
  const ALERTS_PER_PAGE = 10;

  // Operations Log state
  const [opsLogs, setOpsLogs] = useState<OperationsLog[]>([]);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsPage, setOpsPage] = useState(1);
  const [opsTotal, setOpsTotal] = useState(0);
  const [opsPages, setOpsPages] = useState(0);
  const [opsSearch, setOpsSearch] = useState('');
  const [opsTypeFilter, setOpsTypeFilter] = useState('');
  const [operationTypes, setOperationTypes] = useState<string[]>([]);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false, message: '', severity: 'info',
  });

  // Transfer Dialog state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferProduct, setTransferProduct] = useState<{ id: number; name: string } | null>(null);
  const [transferStockInfo, setTransferStockInfo] = useState<ProductStockInfo | null>(null);
  const [transferFromId, setTransferFromId] = useState<number>(0);
  const [transferToId, setTransferToId] = useState<number>(0);
  const [transferQty, setTransferQty] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [productSupplierLinks, setProductSupplierLinks] = useState<ProductSupplierLink[]>([]);

  // ── Load Alerts ───────────────────────────────────────────────────────────
  const loadAlerts = async () => {
    setLoading(true);
    try {
      const res = await client.get('/api/v1/system/alerts/operational', getAuthHeaders());
      setAlerts(res.data);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load alerts', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // ── Load Ops Logs ─────────────────────────────────────────────────────────
  const fetchOpsLogs = async (page = 1) => {
    setOpsLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (opsSearch) params.search = opsSearch;
      if (opsTypeFilter) params.operation_type = opsTypeFilter;
      const res = await client.get('/api/v1/system/operations-logs', { ...getAuthHeaders(), params });
      setOpsLogs(res.data.data);
      setOpsTotal(res.data.total);
      setOpsPages(res.data.pages);
      setOpsPage(page);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load logs', severity: 'error' });
    } finally {
      setOpsLoading(false);
    }
  };

  const fetchOpTypes = async () => {
    try {
      const res = await client.get('/api/v1/system/operations-logs/types', getAuthHeaders());
      setOperationTypes(res.data.types);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadAlerts();
    fetchOpTypes();
    fetchOpsLogs(1);
    getLocations().then(setLocations).catch(() => {});
    getProductSupplierLinks().then(links => setProductSupplierLinks(Array.isArray(links) ? links : [])).catch(() => {});
  }, []);

  // ── Filtered Alerts ───────────────────────────────────────────────────────
  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      let matchesTab = false;
      if (tabValue === 0) matchesTab = a.status === 'active' || !a.status;
      else if (tabValue === 1) matchesTab = a.status === 'resolved' || a.is_resolved;
      if (!matchesTab) return false;
      if (typeFilter !== 'all') {
        if (getAlertType(a.message) !== typeFilter) return false;
      }
      return true;
    });
  }, [alerts, tabValue, typeFilter]);

  // Reset alert page when tab or filter changes
  useEffect(() => { setAlertPage(1); }, [tabValue, typeFilter]);

  const alertTotalPages = Math.ceil(filteredAlerts.length / ALERTS_PER_PAGE);
  const paginatedAlerts = filteredAlerts.slice((alertPage - 1) * ALERTS_PER_PAGE, alertPage * ALERTS_PER_PAGE);

  // ── Type counts ───────────────────────────────────────────────────────────
  const typeCounts = useMemo(() => {
    return alerts.reduce((acc, a) => {
      let matchesTab = false;
      if (tabValue === 0) matchesTab = a.status === 'active' || !a.status;
      else if (tabValue === 1) matchesTab = a.status === 'resolved' || a.is_resolved;
      if (matchesTab) {
        const type = getAlertType(a.message);
        acc[type] = (acc[type] || 0) + 1;
        acc.all = (acc.all || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
  }, [alerts, tabValue]);

  const activeCount = alerts.filter(a => a.status === 'active' || !a.status).length;

  // ── Extract current stock from message ──────────────────────────────────
  const extractCurrentStock = (message: string): number => {
    const match = message.match(/has only (\d+) units/);
    return match ? parseInt(match[1]) : 0;
  };

  // ── Fetch product by name ───────────────────────────────────────────────
  const fetchProductByName = async (name: string) => {
    try {
      const res = await client.get('/api/v1/products', getAuthHeaders());
      return res.data.find((p: any) => p.name === name);
    } catch {
      return null;
    }
  };

  // ── Handle action button click ──────────────────────────────────────────
  const handleAction = async (alert: StockAlert) => {
    const alertType = getAlertType(alert.message);
    const productName = extractProductName(alert.message);
    setActionLoading(alert.id);

    try {
      const product = await fetchProductByName(productName);
      if (!product) {
        setSnackbar({ open: true, message: `Product "${productName}" not found`, severity: 'error' });
        return;
      }

      if (alertType === 'shelf_restock') {
        // Open Transfer Dialog with product stock info
        setTransferProduct({ id: product.id, name: product.name });
        try {
          const stockInfo = await getProductStock(product.id);
          setTransferStockInfo(stockInfo);
        } catch {
          setTransferStockInfo(null);
        }
        setTransferFromId(0);
        setTransferToId(0);
        setTransferQty('');
        setTransferDialogOpen(true);
      } else if (alertType === 'low_stock') {
        // Navigate to Orders with Quick Order pre-fill
        let unitCost = product.average_cost || 0;
        if (productSupplierLinks.length > 0) {
          const link = productSupplierLinks.find(
            l => l.product_id === product.id &&
              (product.supplier_id ? l.supplier_id === product.supplier_id : l.is_preferred)
          );
          if (link && link.supply_price > 0) {
            unitCost = link.supply_price;
          } else {
            const anyLink = productSupplierLinks.find(l => l.product_id === product.id && l.supply_price > 0);
            if (anyLink) unitCost = anyLink.supply_price;
          }
        }

        const currentStock = extractCurrentStock(alert.message);
        const orderQty = Math.max(20 - currentStock, 10);

        navigate('/orders', {
          state: {
            openCreateDialog: true,
            initialData: {
              supplierId: product.supplier_id,
              items: [{
                product_id: product.id,
                productName: product.name,
                unit_cost: unitCost,
                quantity: orderQty
              }]
            }
          }
        });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to process action', severity: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  // ── Handle transfer submit ──────────────────────────────────────────────
  const handleTransferSubmit = async () => {
    if (!transferProduct || !transferFromId || !transferToId || !transferQty) return;
    if (transferFromId === transferToId) {
      setSnackbar({ open: true, message: 'Source and destination must be different', severity: 'error' });
      return;
    }
    setTransferLoading(true);
    try {
      await transferStock({
        product_id: transferProduct.id,
        quantity: Number(transferQty),
        from_location_id: transferFromId,
        to_location_id: transferToId,
      });
      setSnackbar({ open: true, message: 'Stock transferred successfully!', severity: 'success' });
      setTransferDialogOpen(false);
      loadAlerts();
    } catch {
      setSnackbar({ open: true, message: 'Transfer failed', severity: 'error' });
    } finally {
      setTransferLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // JSX
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <AlertIcon sx={{ color: '#f59e0b' }} />
          <Typography variant="h6" fontWeight={700}>Stock Alerts</Typography>
          {activeCount > 0 && (
            <Chip label={`${activeCount}`} size="small" sx={{ fontWeight: 700, bgcolor: '#fee2e2', color: '#dc2626', height: 22, fontSize: '0.7rem' }} />
          )}
        </Box>
        <Typography variant="caption" color="text.secondary">
          Items needing restock or reorder
        </Typography>
      </Box>

      {/* Summary Cards */}
      <Box sx={{ px: 2, pb: 1, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
        <Card sx={{ borderRadius: 2, bgcolor: '#fffbeb', border: '1px solid #fde68a' }}>
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <ShelfIcon sx={{ color: '#d97706', fontSize: 24 }} />
            <Box>
              <Typography variant="h6" fontWeight={800} color="#92400e" sx={{ fontSize: '1.1rem', lineHeight: 1.2 }}>
                {alerts.filter(a => getAlertType(a.message) === 'shelf_restock' && (a.status === 'active' || !a.status)).length}
              </Typography>
              <Typography variant="caption" color="#b45309" sx={{ fontSize: '0.6rem' }}>Shelf Restock</Typography>
            </Box>
          </CardContent>
        </Card>
        <Card sx={{ borderRadius: 2, bgcolor: '#fef2f2', border: '1px solid #fecaca' }}>
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <ErrorIcon sx={{ color: '#dc2626', fontSize: 24 }} />
            <Box>
              <Typography variant="h6" fontWeight={800} color="#991b1b" sx={{ fontSize: '1.1rem', lineHeight: 1.2 }}>
                {alerts.filter(a => getAlertType(a.message) === 'low_stock' && (a.status === 'active' || !a.status)).length}
              </Typography>
              <Typography variant="caption" color="#b91c1c" sx={{ fontSize: '0.6rem' }}>Low Stock</Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Tabs */}
      <Box sx={{ px: 2 }}>
        <Tabs
          value={tabValue}
          onChange={(_, v) => setTabValue(v)}
          variant="fullWidth"
          sx={{
            bgcolor: 'white', borderRadius: 2, mb: 1,
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', minHeight: 44 },
            '& .Mui-selected': { color: tabValue === 0 ? '#f59e0b' : tabValue === 1 ? '#10b981' : '#8b5cf6' },
            '& .MuiTabs-indicator': { backgroundColor: tabValue === 0 ? '#f59e0b' : tabValue === 1 ? '#10b981' : '#8b5cf6', height: 3 },
          }}
        >
          <Tab label={
            <Badge badgeContent={activeCount} color="warning" sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', minWidth: 16, height: 16 } }}>
              <Box sx={{ pr: 1.5 }}>Active</Box>
            </Badge>
          } />
          <Tab label="Resolved" icon={<DoneIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
          <Tab label="Ops Logs" icon={<HistoryIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pb: 4 }}>

        {/* ── Active / Resolved Tab ──────────────────────────────────────── */}
        {tabValue < 2 && (
          <>
            {/* Type Filter Chips */}
            <Box sx={{ mb: 1.5, display: 'flex', gap: 0.5, overflowX: 'auto', whiteSpace: 'nowrap',
              '&::-webkit-scrollbar': { display: 'none' }, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
              {[
                { key: 'all', label: 'All' },
                { key: 'shelf_restock', label: 'Shelf Restock' },
                { key: 'low_stock', label: 'Low Stock' },
                { key: 'added_to_order', label: 'Ordered' },
              ].map(({ key, label }) => {
                const colors = getAlertTypeColor(key);
                const count = typeCounts[key] || 0;
                const isActive = typeFilter === key;
                return (
                  <Chip
                    key={key}
                    label={`${label} (${count})`}
                    size="small"
                    onClick={() => setTypeFilter(key)}
                    sx={{
                      fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer',
                      bgcolor: isActive ? colors.bg : 'white',
                      color: isActive ? colors.color : '#64748b',
                      border: '1px solid',
                      borderColor: isActive ? colors.border : '#e2e8f0',
                    }}
                  />
                );
              })}
            </Box>

            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : filteredAlerts.length === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, opacity: 0.6 }}>
                <SuccessIcon sx={{ fontSize: 48, color: '#10b981', mb: 1 }} />
                <Typography variant="body1" color="text.secondary">
                  {tabValue === 0 ? 'No active alerts. All good!' : 'No resolved alerts.'}
                </Typography>
              </Box>
            ) : (
              <>
              {paginatedAlerts.map(alert => {
                const alertType = getAlertType(alert.message);
                const colors = getAlertTypeColor(alertType);
                const productName = extractProductName(alert.message);
                const isResolved = tabValue === 1;

                return (
                  <Card key={alert.id} variant="outlined" sx={{ mb: 1, borderRadius: 2, borderLeft: `4px solid ${colors.border}` }}>
                    <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                          <Box sx={{ color: colors.color }}>{getAlertTypeIcon(alertType)}</Box>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="body2" fontWeight={700}>{productName}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(alert.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </Typography>
                          </Box>
                        </Box>
                        <Chip
                          label={getAlertTypeLabel(alertType)}
                          size="small"
                          sx={{
                            fontWeight: 600, fontSize: '0.6rem', height: 22,
                            bgcolor: colors.bg, color: colors.color, border: `1px solid ${colors.border}`,
                          }}
                        />
                      </Box>

                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
                        {alert.message}
                      </Typography>

                      {isResolved ? (
                        <Chip label="Resolved" size="small" icon={<SuccessIcon sx={{ fontSize: 14 }} />}
                          sx={{ mt: 1, fontWeight: 600, fontSize: '0.65rem', bgcolor: '#ecfdf5', color: '#059669',
                            border: '1px solid #6ee7b7', '& .MuiChip-icon': { color: '#059669' }, height: 24 }} />
                      ) : (
                        <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                          {alertType === 'shelf_restock' && (
                            <Chip label={actionLoading === alert.id ? 'Loading...' : 'Transfer'} size="small" icon={<TransferIcon sx={{ fontSize: 14 }} />}
                              onClick={() => handleAction(alert)}
                              disabled={actionLoading === alert.id}
                              sx={{ fontWeight: 600, fontSize: '0.65rem', bgcolor: '#fef3c7', color: '#92400e',
                                border: '1px solid #fde68a', '& .MuiChip-icon': { color: '#92400e' }, height: 24, cursor: 'pointer' }} />
                          )}
                          {alertType === 'low_stock' && (
                            <Chip label={actionLoading === alert.id ? 'Loading...' : 'Order'} size="small" icon={<CartIcon sx={{ fontSize: 14 }} />}
                              onClick={() => handleAction(alert)}
                              disabled={actionLoading === alert.id}
                              sx={{ fontWeight: 600, fontSize: '0.65rem', bgcolor: '#fee2e2', color: '#991b1b',
                                border: '1px solid #fecaca', '& .MuiChip-icon': { color: '#991b1b' }, height: 24, cursor: 'pointer' }} />
                          )}
                          {alertType === 'added_to_order' && (
                            <Chip label="Ordered" size="small" icon={<SuccessIcon sx={{ fontSize: 14 }} />}
                              sx={{ fontWeight: 600, fontSize: '0.65rem', bgcolor: '#dcfce7', color: '#166534',
                                border: '1px solid #86efac', '& .MuiChip-icon': { color: '#166534' }, height: 24 }} />
                          )}
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {alertTotalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                  <Pagination
                    count={alertTotalPages}
                    page={alertPage}
                    onChange={(_, p) => setAlertPage(p)}
                    size="small"
                    color="primary"
                  />
                </Box>
              )}
              </>
            )}
          </>
        )}

        {/* ── Ops Logs Tab ───────────────────────────────────────────────── */}
        {tabValue === 2 && (
          <>
            {/* Search & Filter */}
            <Box sx={{ mb: 1.5, display: 'flex', gap: 1 }}>
              <TextField
                size="small" placeholder="Search..."
                value={opsSearch} onChange={e => setOpsSearch(e.target.value)}
                sx={{ flex: 1, bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} color="action" /></InputAdornment>,
                  endAdornment: opsSearch ? (
                    <IconButton size="small" onClick={() => setOpsSearch('')}><ClearIcon fontSize="small" /></IconButton>
                  ) : null,
                }}
              />
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Type</InputLabel>
                <Select value={opsTypeFilter} label="Type" onChange={e => setOpsTypeFilter(e.target.value)}
                  sx={{ bgcolor: 'white', borderRadius: 2 }}>
                  <MenuItem value="">All</MenuItem>
                  {operationTypes.map(t => (
                    <MenuItem key={t} value={t}>
                      {t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            <Button variant="outlined" size="small" startIcon={<FilterIcon />}
              onClick={() => fetchOpsLogs(1)} sx={{ mb: 1.5 }}>
              Apply
            </Button>

            {opsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : opsLogs.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No operations logs found
              </Typography>
            ) : (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  {opsTotal.toLocaleString()} total records
                </Typography>
                {opsLogs.map(log => {
                  const isWriteOff = log.operation_type === 'write_off';
                  return (
                    <Card key={log.id} variant="outlined" sx={{ mb: 1, borderRadius: 2 }}>
                      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {isWriteOff ? (
                              <WriteOffIcon sx={{ fontSize: 18, color: '#dc2626' }} />
                            ) : (
                              <BackupIcon sx={{ fontSize: 18, color: '#2563eb' }} />
                            )}
                            <Box>
                              <Chip
                                label={log.operation_type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                size="small"
                                sx={{
                                  fontWeight: 600, fontSize: '0.6rem', height: 22,
                                  bgcolor: isWriteOff ? '#fee2e2' : '#e0f2fe',
                                  color: isWriteOff ? '#991b1b' : '#0369a1',
                                }}
                              />
                              {log.sub_type && (
                                <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, textTransform: 'capitalize' }}>
                                  {log.sub_type}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}>
                            {new Date(log.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                          <Box>
                            <Chip label={log.username} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.6rem', mr: 0.5 }} />
                            {log.quantity !== null && (
                              <Typography variant="caption" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
                                Qty: {log.quantity}
                              </Typography>
                            )}
                          </Box>
                        </Box>

                        {(log.reason || log.file_name) && (
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', lineHeight: 1.3 }}>
                            {log.reason || log.file_name}
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}

                {opsPages > 1 && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <Pagination
                      count={opsPages} page={opsPage}
                      onChange={(_, page) => fetchOpsLogs(page)}
                      color="primary" size="small"
                    />
                  </Box>
                )}
              </>
            )}
          </>
        )}
      </Box>

      {/* Transfer Stock Dialog */}
      <Dialog open={transferDialogOpen} onClose={() => setTransferDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TransferIcon sx={{ color: '#d97706' }} />
            <Typography fontWeight={700} fontSize="1rem">Transfer Stock</Typography>
          </Box>
          <IconButton size="small" onClick={() => setTransferDialogOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {transferProduct && (
              <Box sx={{ bgcolor: '#f8fafc', p: 1.5, borderRadius: 2, border: '1px solid #e2e8f0' }}>
                <Typography variant="body2" fontWeight={700}>{transferProduct.name}</Typography>
                {transferStockInfo && transferStockInfo.batches.length > 0 && (
                  <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {(() => {
                      const locMap = new Map<string, number>();
                      transferStockInfo.batches.forEach(b => {
                        const key = b.location_name || 'Unknown';
                        locMap.set(key, (locMap.get(key) || 0) + b.quantity);
                      });
                      return Array.from(locMap.entries()).map(([name, qty]) => (
                        <Chip key={name} label={`${name}: ${qty}`} size="small" variant="outlined"
                          sx={{ fontSize: '0.7rem', height: 22 }} />
                      ));
                    })()}
                  </Box>
                )}
              </Box>
            )}

            <FormControl fullWidth size="small">
              <InputLabel>From Location *</InputLabel>
              <Select value={transferFromId} label="From Location *" onChange={e => setTransferFromId(Number(e.target.value))}>
                {locations.map(l => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.name}
                    {transferStockInfo && (() => {
                      const qty = transferStockInfo.batches
                        .filter(b => b.location_name === l.name)
                        .reduce((s, b) => s + b.quantity, 0);
                      return qty > 0 ? ` (${qty} in stock)` : '';
                    })()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>To Location *</InputLabel>
              <Select value={transferToId} label="To Location *" onChange={e => setTransferToId(Number(e.target.value))}>
                {locations.filter(l => l.id !== transferFromId).map(l => (
                  <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              fullWidth size="small" label="Quantity *" type="number"
              value={transferQty} onChange={e => setTransferQty(e.target.value)}
              inputProps={{ min: 1 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setTransferDialogOpen(false)} variant="outlined" color="inherit">Cancel</Button>
          <Button
            onClick={handleTransferSubmit}
            variant="contained"
            disabled={transferLoading || !transferFromId || !transferToId || !transferQty}
            sx={{ bgcolor: '#d97706', '&:hover': { bgcolor: '#b45309' } }}
          >
            {transferLoading ? <CircularProgress size={20} /> : 'Transfer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default StockAlertsPage;
