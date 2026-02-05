import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, CircularProgress, Divider, Pagination, Menu, MenuItem, ListItemIcon, ListItemText,
  TableSortLabel, FormControl, Select, InputLabel
} from '@mui/material';
import {
  Search as SearchIcon,
  Visibility as ViewIcon,
  Print as PrintIcon,
  ReceiptLong as ReceiptIcon,
  Refresh as RefreshIcon,
  PictureAsPdf as PdfIcon,
  MoreVert as MoreVertIcon,
  ArrowUpward as ArrowUp,
  ArrowDownward as ArrowDown,
  FilterList as FilterIcon,
  Check as CheckIcon
} from '@mui/icons-material';
import { salesService, type OrderSummary, type OrderDetail } from '../services/salesService';
import { ReceiptTemplate, type ReceiptData } from '../components/ReceiptTemplate';

// Invoice template options
// invoice template options removed as requested by user

export const SalesHistoryPage: React.FC = () => {
  // --- STATE MANAGEMENT ---
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Sorting (Stable Sort)
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Menus (3-Dots)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);

  // Dialog & Printing
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // --- EFFECT: FETCH DATA ---
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrders();
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, paymentFilter, page, sortBy, sortOrder]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const pMethod = paymentFilter === 'all' ? '' : paymentFilter;

      const data = await salesService.getHistory(
        searchTerm,
        page,
        50,
        sortBy,
        sortOrder,
        pMethod
      );

      setOrders(data.items);
      setTotalPages(data.total_pages);
    } catch (err) {
      console.error("Failed to fetch history", err);
    } finally {
      setLoading(false);
    }
  };

  // --- HANDLERS: SORTING & FILTERING ---
  const handleSortRequest = (property: string) => {
    const isAsc = sortBy === property && sortOrder === 'asc';
    setSortOrder(isAsc ? 'desc' : 'asc');
    setSortBy(property);
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, columnId: string) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setActiveColumn(columnId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setActiveColumn(null);
  };

  const handleSortFromMenu = (order: 'asc' | 'desc') => {
    if (activeColumn) {
      setSortBy(activeColumn);
      setSortOrder(order);
    }
    handleMenuClose();
  };

  const handleFilterFromMenu = (method: string) => {
    setPaymentFilter(method);
    setPage(1);
    handleMenuClose();
  };

  // --- HANDLERS: EXPORT & PRINT ---
  const handleExportList = async () => {
    try {
      await salesService.exportPdf(
        searchTerm,
        sortBy,
        sortOrder,
        paymentFilter === 'all' ? '' : paymentFilter
      );
    } catch (e) {
      alert("Failed to download List PDF");
    }
  };

  const handleViewDetails = async (orderId: number) => {
    setDetailsOpen(true);
    setLoadingDetails(true);
    try {
      const details = await salesService.getOrderDetails(orderId);
      setSelectedOrder(details);
    } catch (err) {
      alert("Failed to load details");
      setDetailsOpen(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handlePrint = (order: OrderDetail) => {
    const rData: ReceiptData = {
      orderId: order.id,
      date: new Date(order.order_timestamp).toLocaleString(),
      customerName: order.customer_name,
      items: order.items.map(i => ({
        name: i.product_name,
        qty: i.quantity,
        price: parseFloat(i.unit_price)
      })),
      total: parseFloat(order.total_amount),
      paymentMethod: order.payment_method || 'CASH',
      reference: order.payment_reference
    };
    setReceiptData(rData);
    setTimeout(() => window.print(), 100);
  };

  // --- RENDER HELPERS ---
  const renderMenuContent = () => {
    if (!activeColumn) return null;

    if (activeColumn === 'payment') {
      const methods = ['all', 'cash', 'card', 'upi'];
      return (
        <Box>
          <MenuItem disabled sx={{ opacity: 1, fontWeight: 'bold', fontSize: '0.75rem', pb: 0 }}>
            SORTING
          </MenuItem>
          <MenuItem onClick={() => handleSortFromMenu('asc')}>
            <ListItemIcon><ArrowUp fontSize="small" /></ListItemIcon>
            <ListItemText>Sort A-Z</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleSortFromMenu('desc')}>
            <ListItemIcon><ArrowDown fontSize="small" /></ListItemIcon>
            <ListItemText>Sort Z-A</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem disabled sx={{ opacity: 1, fontWeight: 'bold', fontSize: '0.75rem', pb: 0 }}>
            FILTER BY
          </MenuItem>
          {methods.map((method) => (
            <MenuItem key={method} onClick={() => handleFilterFromMenu(method)}>
              <ListItemIcon>
                {paymentFilter === method ? <CheckIcon fontSize="small" /> : <FilterIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemText>{method === 'all' ? 'Show All' : method.toUpperCase()}</ListItemText>
            </MenuItem>
          ))}
        </Box>
      );
    }

    return (
      <Box>
        <MenuItem onClick={() => handleSortFromMenu('asc')}>
          <ListItemIcon>
            {sortBy === activeColumn && sortOrder === 'asc' ? <CheckIcon fontSize="small" /> : <ArrowUp fontSize="small" />}
          </ListItemIcon>
          <ListItemText>Sort Ascending</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleSortFromMenu('desc')}>
          <ListItemIcon>
            {sortBy === activeColumn && sortOrder === 'desc' ? <CheckIcon fontSize="small" /> : <ArrowDown fontSize="small" />}
          </ListItemIcon>
          <ListItemText>Sort Descending</ListItemText>
        </MenuItem>
      </Box>
    );
  };

  const renderHeaderCell = (id: string, label: string, sortable: boolean) => (
    <TableCell
      sortDirection={sortBy === id ? sortOrder : false}
      sx={{ fontWeight: 'bold' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {sortable ? (
          <TableSortLabel
            active={sortBy === id}
            direction={sortBy === id ? sortOrder : 'asc'}
            onClick={() => handleSortRequest(id)}
          >
            {label}
          </TableSortLabel>
        ) : (
          label
        )}
        {sortable && (
          <IconButton
            size="small"
            onClick={(e) => handleMenuClick(e, id)}
            color={sortBy === id || (id === 'payment' && paymentFilter !== 'all') ? 'primary' : 'default'}
            sx={{ ml: 1 }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </TableCell>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, height: 'calc(100vh - 64px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* --- TOP TOOLBAR --- */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ReceiptIcon fontSize="large" color="primary" />
          <Typography variant="h5" fontWeight="bold">Sales History</Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Button
            startIcon={<PdfIcon />}
            variant="outlined"
            color="secondary"
            onClick={handleExportList}
          >
            Export List PDF
          </Button>

          <Button
            startIcon={<RefreshIcon />}
            onClick={fetchOrders}
          >
            Refresh
          </Button>

          <FormControl size="small" sx={{ minWidth: 150, bgcolor: 'white' }}>
            <InputLabel>Payment Method</InputLabel>
            <Select
              value={paymentFilter}
              label="Payment Method"
              onChange={(e) => { setPaymentFilter(e.target.value); setPage(1); }}
            >
              <MenuItem value="all">All Methods</MenuItem>
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="card">Card</MenuItem>
              <MenuItem value="upi">UPI</MenuItem>
            </Select>
          </FormControl>

          <TextField
            placeholder="Search..."
            size="small"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>,
            }}
            sx={{ width: 250, bgcolor: 'white' }}
          />
        </Box>
      </Box>

      {/* --- DATA TABLE --- */}
      <TableContainer component={Paper} elevation={2} sx={{ flex: 1, overflow: 'auto' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {renderHeaderCell('id', 'Bill #', true)}
              {renderHeaderCell('date', 'Date', true)}
              {renderHeaderCell('customer', 'Customer', true)}
              {renderHeaderCell('payment', 'Payment', true)}
              {renderHeaderCell('amount', 'Amount', true)}
              <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} align="center"><CircularProgress sx={{ my: 4 }} /></TableCell></TableRow>
            ) : orders.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>No orders found</TableCell></TableRow>
            ) : (
              orders.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <Chip label={`#${row.id}`} size="small" sx={{ fontWeight: 'bold', borderRadius: 1 }} />
                  </TableCell>
                  <TableCell>
                    {new Date(row.order_timestamp).toLocaleDateString()}
                    <Typography variant="caption" display="block" color="text.secondary">
                      {new Date(row.order_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="500">{row.customer_name}</Typography>
                    {row.customer_phone && <Typography variant="caption" color="text.secondary">{row.customer_phone}</Typography>}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={row.payment_method?.toUpperCase() || 'CASH'}
                      size="small"
                      color={row.payment_method === 'upi' ? 'info' : row.payment_method === 'card' ? 'secondary' : 'default'}
                      variant="outlined"
                    />
                    {row.payment_reference && (
                      <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        Ref: {row.payment_reference}
                      </Typography>
                    )}
                  </TableCell>
                  {/* FIXED CURRENCY SYMBOL HERE */}
                  <TableCell>
                    <Typography fontWeight="bold" color="success.main">
                      ₹{parseFloat(row.total_amount).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <IconButton color="primary" size="small" onClick={() => handleViewDetails(row.id)} title="View Details">
                      <ViewIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* --- PAGINATION --- */}
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
        <Pagination
          count={totalPages}
          page={page}
          onChange={(_, value) => setPage(value)}
          color="primary"
          showFirstButton
          showLastButton
        />
      </Box>

      {/* --- MENU POPUP --- */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{ sx: { minWidth: 180 } }}
      >
        {renderMenuContent()}
      </Menu>

      {/* --- ORDER DETAILS DIALOG --- */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#f8f9fa' }}>
          <Box>Order #{selectedOrder?.id}</Box>
          {selectedOrder && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                startIcon={<PrintIcon />}
                variant="contained"
                size="small"
                onClick={() => handlePrint(selectedOrder)}
              >
                Print Receipt
              </Button>
            </Box>
          )}
        </DialogTitle>
        <DialogContent dividers>
          {loadingDetails || !selectedOrder ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
              {/* LEFT: Customer Info */}
              <Box sx={{ flex: { xs: '1 1 auto', md: '0 0 35%' } }}>
                <Paper sx={{ p: 2, bgcolor: '#f5f5f5', height: '100%' }} elevation={0}>
                  <Typography variant="subtitle2" color="text.secondary">CUSTOMER</Typography>
                  <Typography variant="h6">{selectedOrder.customer_name}</Typography>
                  <Typography variant="body2">{selectedOrder.customer_phone}</Typography>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" color="text.secondary">PAYMENT</Typography>
                  <Chip label={selectedOrder.payment_method?.toUpperCase()} size="small" />
                  {selectedOrder.payment_reference && (
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      Ref: {selectedOrder.payment_reference}
                    </Typography>
                  )}
                </Paper>
              </Box>

              {/* RIGHT: Items Table */}
              <Box sx={{ flex: 1 }}>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: '#eee' }}>
                      <TableRow>
                        <TableCell>Item</TableCell>
                        <TableCell align="right">Qty</TableCell>
                        <TableCell align="right">Price</TableCell>
                        <TableCell align="right">Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedOrder.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Typography variant="body2" fontWeight="500">{item.product_name}</Typography>
                            <Typography variant="caption" color="text.secondary">{item.sku}</Typography>
                          </TableCell>
                          <TableCell align="right">{item.quantity}</TableCell>
                          {/* FIXED CURRENCY SYMBOLS HERE */}
                          <TableCell align="right">₹{parseFloat(item.unit_price).toLocaleString()}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                            ₹{(item.quantity * parseFloat(item.unit_price)).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow sx={{ bgcolor: '#f8f9fa' }}>
                        <TableCell colSpan={3} align="right"><Typography fontWeight="bold">TOTAL</Typography></TableCell>
                        <TableCell align="right">
                          {/* FIXED CURRENCY SYMBOL HERE */}
                          <Typography variant="h6" color="primary">
                            ₹{parseFloat(selectedOrder.total_amount).toLocaleString()}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* --- HIDDEN PRINT TEMPLATE --- */}
      <Box sx={{ display: 'none', '@media print': { display: 'block' } }}>
        <ReceiptTemplate data={receiptData} />
      </Box>
      <style>{`
        @media print { 
            body * { visibility: hidden; } 
            .printable-receipt, .printable-receipt * { visibility: visible; display: block !important; } 
            .printable-receipt { position: absolute; left: 0; top: 0; width: 100%; } 
        }
      `}</style>

    </Box>
  );
};

export default SalesHistoryPage;