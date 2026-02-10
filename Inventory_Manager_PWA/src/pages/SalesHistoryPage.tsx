import React, { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, InputAdornment, Chip, Card, CardContent, CardActions,
  Button, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  Divider, List, ListItem, ListItemText, Stack,
  useMediaQuery, useTheme
} from '@mui/material';
import {
  Search as SearchIcon,
  Visibility as ViewIcon,
  ReceiptLong as ReceiptIcon,
  Refresh as RefreshIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  Close as CloseIcon,
  Description as InvoiceIcon
} from '@mui/icons-material';

import { salesService, type OrderSummary, type OrderDetail } from '../services/salesService';
import { openInvoicePDF } from '../services/invoiceService';

// ── Main Component ──────────────────────────────────────────────────────────
export const SalesHistoryPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Data
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Sort
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Details dialog
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // ── Fetch with debounce ───────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => fetchOrders(), 500);
    return () => clearTimeout(timer);
  }, [searchTerm, paymentFilter, page, sortBy, sortOrder]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const pMethod = paymentFilter === 'all' ? '' : paymentFilter;
      const data = await salesService.getHistory(searchTerm, page, 20, sortBy, sortOrder, pMethod);
      setOrders(data.items);
      setTotalPages(data.total_pages);
    } catch {
      console.error('Failed to fetch sales history');
    } finally {
      setLoading(false);
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleViewDetails = async (orderId: number) => {
    setDetailsOpen(true);
    setLoadingDetails(true);
    try {
      const details = await salesService.getOrderDetails(orderId);
      setSelectedOrder(details);
    } catch {
      setDetailsOpen(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handlePrintInvoice = (orderId: number) => {
    openInvoicePDF(orderId);
  };

  const getPaymentColor = (method: string): 'default' | 'info' | 'secondary' | 'success' => {
    switch (method?.toLowerCase()) {
      case 'upi': return 'info';
      case 'card': return 'secondary';
      case 'cash': return 'success';
      default: return 'default';
    }
  };

  const paymentMethods = ['all', 'cash', 'card', 'upi', 'credit'];

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 2 }}>

      {/* Header */}
      <Box sx={{ px: 2, pt: 2, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ReceiptIcon color="primary" /> Sales
        </Typography>
        <IconButton onClick={fetchOrders}><RefreshIcon /></IconButton>
      </Box>

      {/* Search */}
      <Box sx={{ px: 2, pb: 1 }}>
        <TextField
          fullWidth size="small" placeholder="Search orders..."
          value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>
          }}
          sx={{ bgcolor: 'white', borderRadius: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      </Box>

      {/* Payment filter chips */}
      <Box sx={{ px: 2, pb: 1.5, display: 'flex', gap: 0.75, overflowX: 'auto', whiteSpace: 'nowrap',
        WebkitOverflowScrolling: 'touch',
        '&::-webkit-scrollbar': { display: 'none' }, msOverflowStyle: 'none', scrollbarWidth: 'none'
      }}>
        {paymentMethods.map(method => (
          <Chip
            key={method}
            label={method === 'all' ? 'All' : method.toUpperCase()}
            onClick={() => { setPaymentFilter(method); setPage(1); }}
            color={paymentFilter === method ? 'primary' : 'default'}
            variant={paymentFilter === method ? 'filled' : 'outlined'}
            size="small"
            sx={{ fontWeight: 600, textTransform: 'capitalize' }}
          />
        ))}
      </Box>

      {/* Content */}
      <Box sx={{ px: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : orders.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary">No orders found</Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {orders.map(order => (
              <Card key={order.id} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
                  {/* Top row: ID + Date */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                    <Box>
                      <Chip label={`#${order.id}`} size="small" sx={{ fontWeight: 700, borderRadius: 1, fontSize: '0.75rem' }} />
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        {new Date(order.order_timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        {' '}
                        {new Date(order.order_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                    </Box>
                    <Chip
                      label={order.payment_method?.toUpperCase() || 'CASH'}
                      size="small" variant="outlined"
                      color={getPaymentColor(order.payment_method)}
                      sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                    />
                  </Box>

                  {/* Customer + Amount */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                    <Box>
                      <Typography variant="body2" fontWeight={500}>{order.customer_name}</Typography>
                      {order.customer_phone && (
                        <Typography variant="caption" color="text.secondary">{order.customer_phone}</Typography>
                      )}
                    </Box>
                    <Typography fontWeight={700} color="success.main" fontSize="1rem">
                      ₹{parseFloat(order.total_amount).toLocaleString()}
                    </Typography>
                  </Box>

                  {order.payment_reference && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      Ref: {order.payment_reference}
                    </Typography>
                  )}
                </CardContent>
                <Divider />
                <CardActions sx={{ px: 2, py: 0.75 }}>
                  <Button size="small" startIcon={<ViewIcon />} onClick={() => handleViewDetails(order.id)}>Details</Button>
                  <Button size="small" startIcon={<InvoiceIcon />} onClick={() => handlePrintInvoice(order.id)}>Invoice</Button>
                </CardActions>
              </Card>
            ))}
          </Stack>
        )}
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, py: 2, mt: 1 }}>
          <Button variant="outlined" size="small" startIcon={<PrevIcon />}
            disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            Prev
          </Button>
          <Typography variant="body2" color="text.secondary">
            Page {page} of {totalPages}
          </Typography>
          <Button variant="outlined" size="small" endIcon={<NextIcon />}
            disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </Box>
      )}

      {/* ── Order Detail Dialog ──────────────────────────────────────────── */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Order #{selectedOrder?.id}
          <IconButton onClick={() => setDetailsOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {loadingDetails || !selectedOrder ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : (
            <Stack spacing={2}>
              {/* Customer & Payment info */}
              <Box sx={{ bgcolor: '#f8fafc', p: 2, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">Customer</Typography>
                    <Typography fontWeight={600}>{selectedOrder.customer_name}</Typography>
                    {selectedOrder.customer_phone && (
                      <Typography variant="caption" color="text.secondary">{selectedOrder.customer_phone}</Typography>
                    )}
                  </Box>
                  <Chip label={selectedOrder.payment_method?.toUpperCase() || 'CASH'} size="small"
                    color={getPaymentColor(selectedOrder.payment_method)} variant="outlined" />
                </Box>
                {selectedOrder.payment_reference && (
                  <Typography variant="body2" sx={{ mt: 1 }}>Ref: {selectedOrder.payment_reference}</Typography>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  {new Date(selectedOrder.order_timestamp).toLocaleString()}
                </Typography>
              </Box>

              {/* Items */}
              <Typography variant="subtitle2">Items ({selectedOrder.items.length})</Typography>
              <List disablePadding>
                {selectedOrder.items.map((item, idx) => (
                  <ListItem key={idx} divider sx={{ px: 0, py: 1 }}>
                    <ListItemText
                      primary={<Typography fontWeight={500} variant="body2">{item.product_name}</Typography>}
                      secondary={`SKU: ${item.sku} · Qty: ${item.quantity} × ₹${parseFloat(item.unit_price).toLocaleString()}`}
                    />
                    <Typography fontWeight={600} variant="body2">
                      ₹{(item.quantity * parseFloat(item.unit_price)).toLocaleString()}
                    </Typography>
                  </ListItem>
                ))}
              </List>

              {/* Total */}
              <Box sx={{ textAlign: 'right', pt: 1 }}>
                <Typography variant="h6" fontWeight={700} color="primary">
                  Total: ₹{parseFloat(selectedOrder.total_amount).toLocaleString()}
                </Typography>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, flexDirection: isMobile ? 'column' : 'row', gap: 1 }}>
          {selectedOrder && (
            <Button variant="outlined" startIcon={<InvoiceIcon />} fullWidth={isMobile}
              onClick={() => openInvoicePDF(selectedOrder.id)}>
              Generate Invoice
            </Button>
          )}
          <Button onClick={() => setDetailsOpen(false)} fullWidth={isMobile}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SalesHistoryPage;
