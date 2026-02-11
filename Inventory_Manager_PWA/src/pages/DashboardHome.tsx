import React, { useEffect, useState } from 'react';
import {
  Box, Typography, CircularProgress, Card, CardContent,
  Button, Chip, IconButton, Divider, List, ListItem,
  ListItemIcon, ListItemText, Skeleton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, InputAdornment, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import {
  TrendingUp, TrendingDown, ShoppingCart,
  WarningAmber, ArrowForward,
  EmojiEvents as TrophyIcon,
  Inventory as InventoryIcon,
  DeleteSweep as WriteOffIcon,
  Refresh as RefreshIcon,
  LocalShipping,
  AttachMoney,
  Receipt,
  SwapHoriz,
  CallReceived,
  Delete as DeleteIcon,
  AddCircle as AddCircleIcon,
  Search as SearchIcon,
  Close as CloseIcon,
  Store as StoreIcon,
  Warehouse as WarehouseIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

import client from '../api/client';
import { getAllProducts } from '../services/productService';
import {
  getTopSellers, getInventoryValuation, getSalesSummary,
  getWriteOffSummary, getGlobalActivity,
  type TopSeller, type InventoryValuation,
  type SalesSummary as SalesSummaryType, type ActivityItem
} from '../services/analyticsService';
import { getExpiryReport, getProductStock, type ProductStockInfo } from '../services/inventoryService';
import { getShelfRestockAlerts } from '../services/systemService';
import { LowStockDialog } from '../components/LowStockDialog';

interface SalesSummary {
  total_sales_value: number;
  total_orders: number;
}

export const DashboardHome: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [expiryAlertCount, setExpiryAlertCount] = useState(0);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [inventoryValuation, setInventoryValuation] = useState<InventoryValuation | null>(null);
  const [todayStats, setTodayStats] = useState<SalesSummaryType | null>(null);
  const [yesterdayStats, setYesterdayStats] = useState<SalesSummaryType | null>(null);
  const [shelfRestockCount, setShelfRestockCount] = useState(0);
  const [writeOffData, setWriteOffData] = useState<{ total: number; totalValue: number }>({ total: 0, totalValue: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  // Low Stock Dialog
  const [lowStockDialogOpen, setLowStockDialogOpen] = useState(false);

  // Quick Stock Lookup
  const [stockLookupOpen, setStockLookupOpen] = useState(false);
  const [lookupSearch, setLookupSearch] = useState('');
  const [lookupProducts, setLookupProducts] = useState<Awaited<ReturnType<typeof getAllProducts>>>([]);
  const [lookupFiltered, setLookupFiltered] = useState<Awaited<ReturnType<typeof getAllProducts>>>([]);
  const [lookupSelectedProduct, setLookupSelectedProduct] = useState<Awaited<ReturnType<typeof getAllProducts>>[0] | null>(null);
  const [lookupStockInfo, setLookupStockInfo] = useState<ProductStockInfo | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupStockLoading, setLookupStockLoading] = useState(false);

  const fetchAllData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const token = localStorage.getItem('user_token');
      const summaryRes = await client.get('/api/v1/analytics/sales_summary', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSummary(summaryRes.data);

      const products = await getAllProducts();
      const lowStock = products.filter(p => p.total_quantity < 20).length;
      setLowStockCount(lowStock);

      const expiryData = await getExpiryReport(30);
      const expiryCount = Array.isArray(expiryData) ? expiryData.length : 0;
      setExpiryAlertCount(expiryCount);

      const sevenDaysAgo = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
      const today = dayjs().format('YYYY-MM-DD');
      const topSellersData = await getTopSellers(sevenDaysAgo, today);
      setTopSellers(topSellersData.slice(0, 5));

      const valuationData = await getInventoryValuation();
      setInventoryValuation(valuationData);

      const todayDate = dayjs().format('YYYY-MM-DD');
      const yesterdayDate = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
      const [todayData, yesterdayData] = await Promise.all([
        getSalesSummary(todayDate, todayDate),
        getSalesSummary(yesterdayDate, yesterdayDate)
      ]);
      setTodayStats(todayData);
      setYesterdayStats(yesterdayData);

      try {
        const restockAlerts = await getShelfRestockAlerts();
        setShelfRestockCount(restockAlerts.length);
      } catch (e) {
        console.warn('Could not fetch shelf restock alerts', e);
      }

      try {
        const thirtyDaysAgo = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
        const writeOffs = await getWriteOffSummary(thirtyDaysAgo, today);
        const totalCount = writeOffs.reduce((acc, w) => acc + (w.total_count || 0), 0);
        const totalValue = writeOffs.reduce((acc, w) => acc + (w.total_value_lost || 0), 0);
        setWriteOffData({ total: totalCount, totalValue });
      } catch (e) {
        console.warn('Could not fetch write-off summary', e);
      }

      try {
        const recentActivity = await getGlobalActivity(10);
        setActivities(recentActivity);
      } catch (e) {
        console.warn('Could not fetch recent activity', e);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleRefresh = () => fetchAllData(true);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'sale': return <ShoppingCart sx={{ color: '#6366f1', fontSize: 20 }} />;
      case 'transfer': return <SwapHoriz sx={{ color: '#f59e0b', fontSize: 20 }} />;
      case 'receive': case 'bulk_receive': return <CallReceived sx={{ color: '#10b981', fontSize: 20 }} />;
      case 'write_off': return <DeleteIcon sx={{ color: '#ef4444', fontSize: 20 }} />;
      default: return <Receipt sx={{ color: '#64748b', fontSize: 20 }} />;
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Skeleton variant="rounded" height={60} />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} variant="rounded" height={120} />)}
        </Box>
        <Skeleton variant="rounded" height={200} />
        <Skeleton variant="rounded" height={200} />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 10, px: 2, pt: 2, maxWidth: 800, mx: 'auto', width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          Dashboard Overview
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            {dayjs().format('ddd, MMM D, YYYY')}
          </Typography>
          {lastUpdated && (
            <>
              <Divider orientation="vertical" flexItem />
              <Typography variant="caption" color="text.disabled">
                {lastUpdated.toLocaleTimeString()}
              </Typography>
            </>
          )}
          <IconButton
            size="small"
            onClick={handleRefresh}
            disabled={refreshing}
            sx={{ ml: 'auto' }}
          >
            <RefreshIcon sx={{ fontSize: 20, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </IconButton>
        </Box>
      </Box>

      {/* Alert Chips */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {expiryAlertCount > 0 && (
          <Chip
            label={`${expiryAlertCount} Expiring`}
            color="error"
            size="small"
            sx={{ fontWeight: 600 }}
            onClick={() => navigate('/inventory', { state: { openExpiryAlert: true } })}
          />
        )}
        <Chip
          icon={<WarningAmber sx={{ fontSize: 16 }} />}
          label={`${lowStockCount} Low Stock`}
          color="warning"
          size="small"
          sx={{ fontWeight: 600 }}
          onClick={() => setLowStockDialogOpen(true)}
        />
        {shelfRestockCount > 0 && (
          <Chip
            icon={<LocalShipping sx={{ fontSize: 16 }} />}
            label={`${shelfRestockCount} Restock`}
            color="info"
            size="small"
            sx={{ fontWeight: 600 }}
            onClick={() => navigate('/inventory', { state: { openShelfRestock: true } })}
          />
        )}
      </Box>

      {/* Stat Cards Grid - 2 columns on mobile */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
        {/* Revenue Card */}
        <Card sx={{
          borderRadius: 3, overflow: 'hidden',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white', minHeight: 100
        }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <AttachMoney sx={{ fontSize: 20, opacity: 0.9 }} />
              <Typography variant="caption" sx={{ opacity: 0.9 }}>Revenue</Typography>
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              ₹{summary?.total_sales_value?.toLocaleString() ?? '0'}
            </Typography>
          </CardContent>
        </Card>

        {/* Orders Card */}
        <Card sx={{
          borderRadius: 3, overflow: 'hidden',
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          color: 'white', minHeight: 100
        }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <ShoppingCart sx={{ fontSize: 20, opacity: 0.9 }} />
              <Typography variant="caption" sx={{ opacity: 0.9 }}>Orders</Typography>
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {summary?.total_orders ?? 0}
            </Typography>
          </CardContent>
        </Card>

        {/* Stock Value Card */}
        <Card sx={{
          borderRadius: 3, overflow: 'hidden',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: 'white', minHeight: 100
        }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <InventoryIcon sx={{ fontSize: 20, opacity: 0.9 }} />
              <Typography variant="caption" sx={{ opacity: 0.9 }}>Stock Value</Typography>
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              ₹{inventoryValuation?.total_valuation?.toLocaleString() ?? '0'}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.65rem' }}>
              {inventoryValuation?.total_items?.toLocaleString() ?? 0} items
            </Typography>
          </CardContent>
        </Card>

        {/* Today's Sales Card */}
        <Card sx={{
          borderRadius: 3, overflow: 'hidden',
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: 'white', minHeight: 100
        }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Receipt sx={{ fontSize: 20, opacity: 0.9 }} />
              <Typography variant="caption" sx={{ opacity: 0.9 }}>Today</Typography>
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              ₹{(todayStats?.total_sales_value ?? 0).toLocaleString()}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
              <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.65rem' }}>
                {todayStats?.total_orders ?? 0} sales
              </Typography>
              {yesterdayStats && yesterdayStats.total_sales_value > 0 && (
                <Chip
                  size="small"
                  icon={todayStats && todayStats.total_sales_value >= yesterdayStats.total_sales_value
                    ? <TrendingUp sx={{ fontSize: 12, color: 'inherit' }} />
                    : <TrendingDown sx={{ fontSize: 12, color: 'inherit' }} />}
                  label={`${todayStats && yesterdayStats.total_sales_value > 0
                    ? Math.round(((todayStats.total_sales_value - yesterdayStats.total_sales_value) / yesterdayStats.total_sales_value) * 100)
                    : 0}%`}
                  sx={{
                    height: 18, fontSize: '0.6rem', fontWeight: 700,
                    bgcolor: 'rgba(255,255,255,0.25)', color: 'white',
                    '& .MuiChip-icon': { color: 'white' }
                  }}
                />
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Write-Off Alert */}
      {writeOffData.total > 0 && (
        <Card sx={{
          borderRadius: 3, mb: 2,
          background: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)',
          border: '1px solid #fca5a5'
        }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <WriteOffIcon sx={{ color: '#dc2626', fontSize: 24 }} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#991b1b' }}>
                    Write-Off Alert (30d)
                  </Typography>
                  <Typography variant="caption" color="#b91c1c">
                    {writeOffData.total} items • ₹{writeOffData.totalValue.toLocaleString()} lost
                  </Typography>
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Top Sellers */}
      <Card sx={{ borderRadius: 3, mb: 2, boxShadow: 2 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <TrophyIcon sx={{ color: '#f59e0b', fontSize: 24 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Top Performers
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Last 7 days
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => navigate('/analytics')}>
              <ArrowForward sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>

          {topSellers.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {topSellers.map((product, index) => (
                <Card
                  key={product.product_id}
                  variant="outlined"
                  sx={{
                    borderRadius: 2,
                    bgcolor: index === 0 ? '#fffbeb' : 'transparent',
                    borderColor: index === 0 ? '#fbbf24' : 'divider'
                  }}
                >
                  <CardContent sx={{
                    p: 1.5, '&:last-child': { pb: 1.5 },
                    display: 'flex', alignItems: 'center', gap: 1.5
                  }}>
                    <Chip
                      label={index + 1}
                      size="small"
                      sx={{
                        fontWeight: 700, minWidth: 28, height: 28,
                        bgcolor: index === 0 ? '#fef3c7' : index === 1 ? '#e5e7eb' : index === 2 ? '#fed7aa' : '#f1f5f9',
                        color: index === 0 ? '#92400e' : index === 1 ? '#4b5563' : index === 2 ? '#9a3412' : '#64748b'
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {product.product_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {product.sku}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                      <Typography variant="body2" fontWeight={700} color="success.main">
                        ₹{product.total_revenue.toLocaleString()}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {product.total_units_sold} sold
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          ) : (
            <Box sx={{ py: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No sales data for the past 7 days
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card sx={{ borderRadius: 3, mb: 2, boxShadow: 2 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            Recent Activity
          </Typography>

          {activities.length > 0 ? (
            <List disablePadding dense>
              {activities.map((activity, idx) => (
                <React.Fragment key={activity.id}>
                  <ListItem disablePadding sx={{ py: 1, alignItems: 'flex-start' }}>
                    <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                      {getActivityIcon(activity.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
                          {activity.description}
                        </Typography>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                          <Typography variant="caption" color="text.disabled">
                            {dayjs(activity.timestamp).format('MMM D, h:mm A')}
                          </Typography>
                          {activity.username && (
                            <Chip label={activity.username} size="small" variant="outlined"
                              sx={{ height: 18, fontSize: '0.6rem' }} />
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                  {idx < activities.length - 1 && <Divider component="li" />}
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Box sx={{ py: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No recent activity
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card sx={{ borderRadius: 3, mb: 2, boxShadow: 2 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            ⚡ Quick Actions
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <Button
              variant="contained"
              startIcon={<AddCircleIcon />}
              fullWidth
              onClick={() => navigate('/products', { state: { openCreateDialog: true } })}
              sx={{
                py: 1.5, minHeight: 48, borderRadius: 2,
                textTransform: 'none', fontWeight: 600, fontSize: '0.85rem',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                '&:hover': { background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }
              }}
            >
              Add Product
            </Button>
            <Button
              variant="contained"
              startIcon={<SearchIcon />}
              fullWidth
              onClick={() => {
                setStockLookupOpen(true);
                setLookupSearch('');
                setLookupSelectedProduct(null);
                setLookupStockInfo(null);
                setLookupFiltered([]);
                setLookupLoading(true);
                getAllProducts()
                  .then(data => setLookupProducts(data))
                  .catch(err => console.error('Failed to load products', err))
                  .finally(() => setLookupLoading(false));
              }}
              sx={{
                py: 1.5, minHeight: 48, borderRadius: 2,
                textTransform: 'none', fontWeight: 600, fontSize: '0.85rem',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                '&:hover': { background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }
              }}
            >
              Search Product
            </Button>
            <Button
              variant="contained"
              startIcon={<Receipt />}
              fullWidth
              onClick={() => navigate('/orders', { state: { openCreateDialog: true } })}
              sx={{
                py: 1.5, minHeight: 48, borderRadius: 2,
                textTransform: 'none', fontWeight: 600, fontSize: '0.85rem',
                gridColumn: '1 / -1',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                '&:hover': { background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' }
              }}
            >
              Create Purchase Order
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Quick Stock Lookup Dialog */}
      <Dialog open={stockLookupOpen} onClose={() => setStockLookupOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white',
          py: 1.5, px: 2
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SearchIcon />
            <Typography variant="h6" fontWeight="bold" fontSize="1.1rem">Quick Stock Lookup</Typography>
          </Box>
          <IconButton size="small" onClick={() => setStockLookupOpen(false)} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <TextField
            fullWidth autoFocus
            placeholder="Search by product name or SKU..."
            value={lookupSearch}
            onChange={e => {
              const val = e.target.value;
              setLookupSearch(val);
              setLookupSelectedProduct(null);
              setLookupStockInfo(null);
              if (val.length >= 2) {
                const q = val.toLowerCase();
                setLookupFiltered(lookupProducts.filter(p =>
                  p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
                ).slice(0, 8));
              } else {
                setLookupFiltered([]);
              }
            }}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>,
                endAdornment: lookupSearch ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => {
                      setLookupSearch(''); setLookupSelectedProduct(null); setLookupStockInfo(null); setLookupFiltered([]);
                    }}><CloseIcon fontSize="small" /></IconButton>
                  </InputAdornment>
                ) : undefined
              }
            }}
            sx={{ mb: 2 }}
          />

          {lookupLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={32} /></Box>
          )}

          {!lookupLoading && lookupFiltered.length > 0 && !lookupSelectedProduct && (
            <Paper elevation={2} sx={{ mb: 2, maxHeight: 250, overflow: 'auto' }}>
              {lookupFiltered.map(product => (
                <Box key={product.id} onClick={async () => {
                  setLookupSelectedProduct(product);
                  setLookupFiltered([]);
                  setLookupSearch(product.name);
                  setLookupStockLoading(true);
                  try {
                    const info = await getProductStock(product.id);
                    setLookupStockInfo(info);
                  } catch (err) { console.error('Failed to load stock info', err); }
                  finally { setLookupStockLoading(false); }
                }} sx={{
                  p: 1.5, cursor: 'pointer', borderBottom: '1px solid #e2e8f0',
                  '&:hover': { bgcolor: '#f1f5f9' }, '&:last-child': { borderBottom: 'none' }
                }}>
                  <Typography variant="body2" fontWeight={600}>{product.name}</Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">{product.sku}</Typography>
                    <Chip label={`Total: ${product.total_quantity || 0}`} size="small"
                      color={product.total_quantity === 0 ? 'error' : (product.total_quantity || 0) < 10 ? 'warning' : 'success'}
                      variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                  </Box>
                </Box>
              ))}
            </Paper>
          )}

          {lookupSelectedProduct && (
            <Box>
              <Paper sx={{ p: 2, mb: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <Typography variant="h6" fontWeight={700}>{lookupSelectedProduct.name}</Typography>
                <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">SKU: <strong>{lookupSelectedProduct.sku}</strong></Typography>
                  <Chip label={`Total Stock: ${lookupSelectedProduct.total_quantity || 0}`} size="small"
                    color={lookupSelectedProduct.total_quantity === 0 ? 'error' : (lookupSelectedProduct.total_quantity || 0) < 10 ? 'warning' : 'success'}
                    sx={{ fontWeight: 600 }} />
                </Box>
              </Paper>

              {lookupStockLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
              ) : lookupStockInfo && lookupStockInfo.batches && lookupStockInfo.batches.length > 0 ? (
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f8fafc' }}>
                        <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Stock</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(() => {
                        const locationMap = new Map<string, { type: string; qty: number }>();
                        lookupStockInfo.batches.forEach(batch => {
                          const key = batch.location_name || 'Unknown';
                          const existing = locationMap.get(key);
                          if (existing) { existing.qty += batch.quantity; }
                          else { locationMap.set(key, { type: (batch as any).location_type || 'other', qty: batch.quantity }); }
                        });
                        return Array.from(locationMap.entries()).map(([name, info]) => (
                          <TableRow key={name} hover>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {info.type?.toLowerCase() === 'store'
                                  ? <StoreIcon sx={{ color: '#10b981', fontSize: 18 }} />
                                  : info.type?.toLowerCase() === 'warehouse'
                                    ? <WarehouseIcon sx={{ color: '#6366f1', fontSize: 18 }} />
                                    : <InventoryIcon sx={{ color: '#64748b', fontSize: 18 }} />}
                                <Typography variant="body2" fontWeight={500}>{name}</Typography>
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Chip label={info.type || 'Other'} size="small" variant="outlined"
                                sx={{ textTransform: 'capitalize', fontSize: '0.7rem', height: 22 }} />
                            </TableCell>
                            <TableCell align="right">
                              <Chip label={info.qty} size="small"
                                color={info.qty === 0 ? 'error' : info.qty < 10 ? 'warning' : 'success'}
                                sx={{ fontWeight: 700, minWidth: 40 }} />
                            </TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  <InventoryIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
                  <Typography variant="body2">No stock found for this product</Typography>
                </Box>
              )}
            </Box>
          )}

          {!lookupLoading && lookupSearch.length < 2 && !lookupSelectedProduct && (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              <SearchIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
              <Typography variant="body2">Type at least 2 characters to search</Typography>
            </Box>
          )}

          {!lookupLoading && lookupSearch.length >= 2 && lookupFiltered.length === 0 && !lookupSelectedProduct && (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              <Typography variant="body2">No products found matching "{lookupSearch}"</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setStockLookupOpen(false)} variant="outlined" color="inherit">Close</Button>
        </DialogActions>
      </Dialog>

      {/* Low Stock Dialog */}
      <LowStockDialog
        open={lowStockDialogOpen}
        onClose={() => setLowStockDialogOpen(false)}
      />

      {/* Spin animation keyframe */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Box>
  );
};
