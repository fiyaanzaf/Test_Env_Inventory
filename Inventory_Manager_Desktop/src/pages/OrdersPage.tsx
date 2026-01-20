import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  Tabs,
  Tab,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Fade,
  TextField,
  InputAdornment
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  LocalShipping as ShippingIcon,
  CheckCircle as ReceivedIcon,
  Drafts as DraftIcon,
  CalendarMonth as DateIcon,
  Search as SearchIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import { useLocation, useSearchParams } from 'react-router-dom';

import client from '../api/client';
import { CreateOrderDialog } from '../components/CreateOrderDialog';
import { PurchaseOrderDetailsDialog } from '../components/PurchaseOrderDetailsDialog';

interface Order {
  id: number;
  supplier_name: string;
  status: string;
  total_amount: number;
  expected_date: string;
  created_at: string;
  item_count: number;
}

export const OrdersPage: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Read initial tab from URL query param ?tab=0,1,2,3
  const initialTab = parseInt(searchParams.get('tab') || '0', 10);

  const [tabValue, setTabValue] = useState(initialTab >= 0 && initialTab <= 3 ? initialTab : 0);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);

  // --- Search States ---
  const [searchTerm, setSearchTerm] = useState('');           // Immediate (Input)
  const [debouncedSearch, setDebouncedSearch] = useState(''); // Delayed (API Trigger)

  // Dialog State
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [initialOrderData, setInitialOrderData] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  useEffect(() => {
    if (location.state && location.state.openCreateDialog) {
      setInitialOrderData(location.state.initialData);
      setCreateDialogOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // --- 1. Debounce Logic ---
  // Updates 'debouncedSearch' 500ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // --- 2. Single Source of Truth for Fetching ---
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('user_token');

      const statusMap = ['draft', 'placed', 'received', 'cancelled'];
      const status = statusMap[tabValue] || 'draft';

      const params = new URLSearchParams();
      params.append('status', status);
      // Use debouncedSearch here, not the raw searchTerm
      if (debouncedSearch) params.append('search', debouncedSearch);

      const response = await client.get(`/api/v1/purchases?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrders(response.data);
    } catch (error) {
      console.error("Failed to load orders", error);
    } finally {
      setLoading(false);
    }
  }, [tabValue, debouncedSearch]);

  // --- 3. Trigger Fetch ---
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);


  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleViewOrder = (orderId: number) => {
    setSelectedOrderId(orderId);
    setDetailsOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'default';
      case 'placed': return 'primary';
      case 'received': return 'success';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  const getTabTheme = (index: number) => {
    switch (index) {
      case 0: return { bg: '#f1f5f9', color: '#64748b' };
      case 1: return { bg: '#e0f2fe', color: '#0369a1' };
      case 2: return { bg: '#dcfce7', color: '#15803d' };
      case 3: return { bg: '#fee2e2', color: '#b91c1c' };
      default: return { bg: '#f1f5f9', color: '#64748b' };
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1600, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <ShippingIcon fontSize="large" color="primary" /> Purchase Orders
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage supplier orders. Drafts for the same supplier are automatically merged.
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          startIcon={<AddIcon />}
          onClick={() => {
            setInitialOrderData(null);
            setCreateDialogOpen(true);
          }}
          sx={{ borderRadius: 2, px: 4, textTransform: 'none', fontWeight: 600 }}
        >
          Create New Order
        </Button>
      </Box>

      {/* Tabs & Content */}
      <Paper elevation={0} sx={{ borderRadius: 3, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.02)' }}>
        <Box sx={{
          borderBottom: '1px solid #f1f5f9',
          bgcolor: 'white',
          px: 3,
          py: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap'
        }}>

          {/* Tabs */}
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            indicatorColor="primary"
            textColor="primary"
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 48,
              '& .MuiTab-root': { fontWeight: 600, textTransform: 'none', fontSize: '0.95rem' }
            }}
          >
            <Tab icon={<DraftIcon />} iconPosition="start" label="Drafts" sx={{ minHeight: 48 }} />
            <Tab icon={<ShippingIcon />} iconPosition="start" label="Ordered" sx={{ minHeight: 48 }} />
            <Tab icon={<ReceivedIcon />} iconPosition="start" label="Received" sx={{ minHeight: 48 }} />
            <Tab icon={<CancelIcon />} iconPosition="start" label="Cancelled" sx={{ color: '#d32f2f', minHeight: 48 }} />
          </Tabs>

          {/* Search Bar */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField
              placeholder="Search by Supplier or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              variant="outlined"
              size="small"
              sx={{
                width: 320,
                '& .MuiOutlinedInput-root': {
                  borderRadius: '20px',
                  backgroundColor: '#f8fafc',
                  transition: 'all 0.2s ease-in-out',
                  '& fieldset': { border: '1px solid transparent' },
                  '&:hover': { backgroundColor: '#f1f5f9' },
                  '&.Mui-focused': {
                    backgroundColor: 'white',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    '& fieldset': { border: '1px solid #e2e8f0' }
                  },
                },
                '& input': { paddingLeft: 1 }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" fontSize="small" sx={{ ml: 1 }} />
                  </InputAdornment>
                ),
              }}
            />

            <Tooltip title="Refresh List">
              <IconButton
                onClick={fetchOrders}
                sx={{
                  bgcolor: '#f8fafc',
                  '&:hover': { bgcolor: '#f1f5f9' },
                  width: 40, height: 40
                }}
              >
                <RefreshIcon color="action" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Box sx={{ p: 0 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
              <CircularProgress />
            </Box>
          ) : orders.length === 0 ? (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                {searchTerm ? 'No orders match your search.' : 'No orders found in this section.'}
              </Typography>
            </Box>
          ) : (
            // Order List
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              {orders.map((order, index) => (
                <Fade in={true} key={order.id} style={{ transitionDelay: `${index * 50}ms` }}>
                  <Box
                    sx={{
                      p: 2.5,
                      borderBottom: '1px solid #f1f5f9',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      '&:hover': { bgcolor: '#f8fafc' },
                      transition: 'background-color 0.2s',
                      cursor: 'default'
                    }}
                  >
                    {/* Left Section: Icon + Supplier info */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, width: '40%' }}>
                      <Box
                        sx={{
                          width: 48, height: 48, borderRadius: 3,
                          bgcolor: getTabTheme(tabValue).bg,
                          color: getTabTheme(tabValue).color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 'bold',
                          fontSize: '0.9rem'
                        }}
                      >
                        #{order.id}
                      </Box>
                      <Box>
                        <Typography fontWeight="600" variant="body1">{order.supplier_name}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          {order.item_count} Item{order.item_count !== 1 ? 's' : ''}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Middle Section: Expected Date */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '30%', color: 'text.secondary' }}>
                      {order.expected_date && (
                        <>
                          <DateIcon fontSize="small" sx={{ opacity: 0.7 }} />
                          <Typography variant="body2">
                            {new Date(order.expected_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </Typography>
                        </>
                      )}
                    </Box>

                    {/* Right Section: Amount + Status + Button */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, width: '30%', justifyContent: 'flex-end' }}>
                      <Typography fontWeight="700" sx={{ minWidth: 80, textAlign: 'right' }}>
                        ₹{order.total_amount.toLocaleString()}
                      </Typography>

                      <Chip
                        label={order.status}
                        color={getStatusColor(order.status) as any}
                        size="small"
                        variant="outlined"
                        sx={{
                          fontWeight: 'bold',
                          minWidth: 90,
                          textTransform: 'capitalize',
                          borderRadius: '8px'
                        }}
                      />

                      <Button
                        variant="text"
                        size="small"
                        onClick={() => handleViewOrder(order.id)}
                        sx={{ minWidth: 'auto', fontWeight: 600 }}
                      >
                        View
                      </Button>
                    </Box>
                  </Box>
                </Fade>
              ))}
            </Box>
          )}
        </Box>
      </Paper>

      <CreateOrderDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSuccess={fetchOrders}
        initialData={initialOrderData}
      />

      <PurchaseOrderDetailsDialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        orderId={selectedOrderId}
        onUpdate={fetchOrders}
      />
    </Box>
  );
};

export default OrdersPage;