import React, { useEffect, useState } from 'react';
import {
  Paper, Typography, CircularProgress, Box, Card, CardContent,
  Button, CardActionArea, Chip, Select, MenuItem, FormControl,
  IconButton, Popover, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Divider, Tooltip
} from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';
import {
  TrendingUp, TrendingDown, ShoppingCart, AddBox, LocalShipping,
  WarningAmber, ArrowForward,
  Close as CloseIcon,
  EventBusy as ExpiryIcon,
  EmojiEvents as TrophyIcon,
  Inventory as InventoryIcon,
  Today as TodayIcon,
  DeleteSweep as WriteOffIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';

import client from '../api/client';
import { getAllProducts } from '../services/productService';
import { getSalesTrends, getTopSellers, getInventoryValuation, getSalesSummary, getWriteOffSummary, type SalesTrend, type TopSeller, type InventoryValuation, type SalesSummary as SalesSummaryType, type WriteOffSummary } from '../services/analyticsService';
import { getExpiryReport } from '../services/inventoryService';
import { getShelfRestockAlerts } from '../services/systemService';
import { WriteOffHistoryDialog } from '../components/WriteOffHistoryDialog';
import { QuickStockLookupDialog } from '../components/QuickStockLookupDialog';

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
  const [writeOffHistoryOpen, setWriteOffHistoryOpen] = useState(false);
  const [stockLookupOpen, setStockLookupOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // --- Chart & Filter State ---
  const [trendData, setTrendData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [timeRange, setTimeRange] = useState('7d'); // Default: Last 7 Days

  // Custom Range State
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [customStart, setCustomStart] = useState<Dayjs | null>(null);
  const [customEnd, setCustomEnd] = useState<Dayjs | null>(null);

  // --- Initial Data Load ---
  useEffect(() => {
    const fetchBaseData = async () => {
      try {
        const token = localStorage.getItem('user_token');
        const summaryRes = await client.get('/api/v1/analytics/sales_summary', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSummary(summaryRes.data);

        const products = await getAllProducts();
        const lowStock = products.filter(p => p.total_quantity < 20).length;
        setLowStockCount(lowStock);

        // Fetch expiry data (items expiring within 30 days)
        const expiryData = await getExpiryReport(30);
        const expiryCount = Array.isArray(expiryData) ? expiryData.length : 0;
        setExpiryAlertCount(expiryCount);

        // Fetch top 5 sellers for last 7 days
        const sevenDaysAgo = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
        const today = dayjs().format('YYYY-MM-DD');
        const topSellersData = await getTopSellers(sevenDaysAgo, today);
        setTopSellers(topSellersData.slice(0, 5));

        // Fetch inventory valuation
        const valuationData = await getInventoryValuation();
        setInventoryValuation(valuationData);

        // Fetch today's and yesterday's stats for comparison
        const todayDate = dayjs().format('YYYY-MM-DD');
        const yesterdayDate = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

        const [todayData, yesterdayData] = await Promise.all([
          getSalesSummary(todayDate, todayDate),
          getSalesSummary(yesterdayDate, yesterdayDate)
        ]);
        setTodayStats(todayData);
        setYesterdayStats(yesterdayData);

        // Fetch shelf restock alerts from system alerts
        try {
          const restockAlerts = await getShelfRestockAlerts();
          setShelfRestockCount(restockAlerts.length);
        } catch (e) {
          console.warn('Could not fetch shelf restock alerts', e);
        }

        // Fetch write-off summary for last 30 days
        try {
          const thirtyDaysAgo = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
          const today = dayjs().format('YYYY-MM-DD');
          const writeOffs = await getWriteOffSummary(thirtyDaysAgo, today);
          const totalCount = writeOffs.reduce((acc, w) => acc + (w.total_count || 0), 0);
          const totalValue = writeOffs.reduce((acc, w) => acc + (w.total_value_lost || 0), 0);
          setWriteOffData({ total: totalCount, totalValue });
        } catch (e) {
          console.warn('Could not fetch write-off summary', e);
        }
        setLastUpdated(new Date());
      } catch (err) {
        console.error("Failed to load dashboard base data", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };
    fetchBaseData();
  }, []);

  // --- Fetch Chart Data when Filter Changes ---
  useEffect(() => {
    // If custom is selected but dates aren't set yet, don't fetch
    if (timeRange === 'custom' && (!customStart || !customEnd)) return;

    const fetchTrends = async () => {
      setChartLoading(true);
      try {
        let start = dayjs();
        let end = dayjs();

        // Calculate Dates based on Dropdown
        switch (timeRange) {
          case '7d': start = start.subtract(6, 'day'); break;
          case '30d': start = start.subtract(29, 'day'); break;
          case '90d': start = start.subtract(89, 'day'); break;
          case '180d': start = start.subtract(179, 'day'); break;
          case 'year': start = start.startOf('year'); break;
          case 'all': start = dayjs('2020-01-01'); break;
          case 'custom':
            if (customStart && customEnd) {
              start = customStart;
              end = customEnd;
            }
            break;
        }

        const startDateStr = start.format('YYYY-MM-DD');
        const endDateStr = end.format('YYYY-MM-DD');

        const trends = await getSalesTrends(startDateStr, endDateStr);

        const formattedTrends = trends.map((t: SalesTrend) => {
          const dateObj = new Date(t.date);
          return {
            name: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), // "Dec 10"
            fullDate: dateObj.toLocaleDateString(),
            sales: t.total_sales
          };
        });
        setTrendData(formattedTrends);
      } catch (err) {
        console.error("Failed to load sales trends", err);
      } finally {
        setChartLoading(false);
      }
    };

    fetchTrends();
  }, [timeRange, customStart, customEnd]);

  // --- Handlers ---
  const handleRangeChange = (event: any) => {
    const val = event.target.value;
    if (val === 'custom') {
      setAnchorEl(document.getElementById('filter-select')); // Anchor to the select box
    } else {
      setTimeRange(val);
    }
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      setTimeRange('custom');
      setAnchorEl(null);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress size={48} />
      </Box>
    );
  }

  // --- Refresh Handler ---
  const handleRefresh = async () => {
    setRefreshing(true);
    // Re-run the initial data load
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
      } catch (e) { }

      try {
        const thirtyDaysAgo = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
        const writeOffs = await getWriteOffSummary(thirtyDaysAgo, today);
        const totalCount = writeOffs.reduce((acc, w) => acc + (w.total_count || 0), 0);
        const totalValue = writeOffs.reduce((acc, w) => acc + (w.total_value_lost || 0), 0);
        setWriteOffData({ total: totalCount, totalValue });
      } catch (e) { }

      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to refresh dashboard", err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
              Dashboard Overview
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="body2" color="text.secondary">
                {dayjs().format('dddd, MMMM D, YYYY')}
              </Typography>
              {lastUpdated && (
                <>
                  <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                  <Typography variant="caption" color="text.disabled">
                    Updated {lastUpdated.toLocaleTimeString()}
                  </Typography>
                </>)}
              <Tooltip title="Refresh all data">
                <IconButton
                  size="small"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  sx={{ ml: 0.5 }}
                >
                  <RefreshIcon sx={{ fontSize: 18, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            {expiryAlertCount > 0 && (
              <Chip
                icon={<ExpiryIcon />}
                label={`${expiryAlertCount} Nearing Expiry`}
                color="error"
                onClick={() => navigate('/inventory', { state: { openExpiryAlert: true } })}
                sx={{ fontWeight: 'bold', cursor: 'pointer' }}
              />
            )}
            <Chip
              icon={<WarningAmber />}
              label={`${lowStockCount} Items Low Stock`}
              color="warning"
              onClick={() => navigate('/inventory', { state: { openLowStock: true } })}
              sx={{ fontWeight: 'bold', cursor: 'pointer' }}
            />
            {shelfRestockCount > 0 && (
              <Chip
                icon={<LocalShipping />}
                label={`${shelfRestockCount} Shelf Restock`}
                color="info"
                onClick={() => navigate('/inventory', { state: { openShelfRestock: true } })}
                sx={{ fontWeight: 'bold', cursor: 'pointer' }}
              />
            )}
          </Box>
        </Box>

        {/* KPI Cards Grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' }, gap: 3 }}>
          {/* Revenue */}
          <Card sx={{ borderRadius: 3, boxShadow: 3, overflow: 'hidden' }}>
            <CardActionArea
              onClick={() => navigate('/analytics')}
              sx={{ height: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
            >
              <CardContent sx={{ position: 'relative', zIndex: 1, color: 'white', p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Box>
                    <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>Total Revenue</Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      ₹{summary?.total_sales_value.toLocaleString()}
                    </Typography>
                  </Box>
                  <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', borderRadius: '12px', p: 1 }}>
                    <TrendingUp sx={{ fontSize: 32 }} />
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ opacity: 0.8, display: 'flex', alignItems: 'center', gap: 1 }}>
                  View detailed analytics <ArrowForward fontSize="small" />
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>

          {/* Orders */}
          <Card sx={{ borderRadius: 3, boxShadow: 3, overflow: 'hidden' }}>
            <CardActionArea
              onClick={() => navigate('/orders')}
              sx={{ height: '100%', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}
            >
              <CardContent sx={{ position: 'relative', zIndex: 1, color: 'white', p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Box>
                    <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>Total Orders</Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      {summary?.total_orders}
                    </Typography>
                  </Box>
                  <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', borderRadius: '12px', p: 1 }}>
                    <ShoppingCart sx={{ fontSize: 32 }} />
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ opacity: 0.8, display: 'flex', alignItems: 'center', gap: 1 }}>
                  Manage Sales Orders <ArrowForward fontSize="small" />
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>

          {/* Inventory Valuation */}
          <Card sx={{ borderRadius: 3, boxShadow: 3, overflow: 'hidden' }}>
            <CardActionArea
              onClick={() => navigate('/inventory')}
              sx={{ height: '100%', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
            >
              <CardContent sx={{ position: 'relative', zIndex: 1, color: 'white', p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Box>
                    <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>Stock Value</Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      ₹{inventoryValuation?.total_valuation.toLocaleString() ?? '0'}
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.8 }}>
                      {inventoryValuation?.total_items.toLocaleString() ?? 0} items • {inventoryValuation?.distinct_products ?? 0} products
                    </Typography>
                  </Box>
                  <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', borderRadius: '12px', p: 1 }}>
                    <InventoryIcon sx={{ fontSize: 32 }} />
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ opacity: 0.8, display: 'flex', alignItems: 'center', gap: 1 }}>
                  View Inventory <ArrowForward fontSize="small" />
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>

          {/* Quick Actions */}
          <Card sx={{ borderRadius: 3, boxShadow: 3, bgcolor: 'white' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                ⚡ Quick Actions
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 2 }}>
                <Button
                  variant="contained"
                  startIcon={<ShoppingCart />}
                  fullWidth
                  onClick={() => navigate('/sales')}
                  sx={{
                    justifyContent: 'flex-start',
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 600,
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    '&:hover': { background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }
                  }}
                >
                  Start New Sale
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<AddBox />}
                  fullWidth
                  onClick={() => navigate('/products', { state: { openCreateDialog: true } })}
                  sx={{ justifyContent: 'flex-start', borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                >
                  Add New Product
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<SearchIcon />}
                  fullWidth
                  onClick={() => setStockLookupOpen(true)}
                  color="secondary"
                  sx={{ justifyContent: 'flex-start', borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                >
                  Search Products
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<AddBox />}
                  fullWidth
                  onClick={() => navigate('/orders', { state: { openCreateDialog: true } })}
                  color="info"
                  sx={{ justifyContent: 'flex-start', borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                >
                  Create Purchase Order
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Today's Activity */}
        <Paper sx={{ p: 3, boxShadow: 2, borderRadius: 3, background: 'linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <TodayIcon sx={{ color: '#6366f1', fontSize: 28 }} />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                Today's Activity
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {dayjs().format('dddd, MMMM D, YYYY')}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 3 }}>
            {/* Today's Orders */}
            <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>No of Sales Today</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h4" fontWeight={700} color="primary.main">
                  {todayStats?.total_orders ?? 0}
                </Typography>
                {yesterdayStats && yesterdayStats.total_orders > 0 && (
                  <Chip
                    size="small"
                    icon={todayStats && todayStats.total_orders >= yesterdayStats.total_orders ? <TrendingUp sx={{ fontSize: 16 }} /> : <TrendingDown sx={{ fontSize: 16 }} />}
                    label={`${todayStats && yesterdayStats.total_orders > 0
                      ? Math.round(((todayStats.total_orders - yesterdayStats.total_orders) / yesterdayStats.total_orders) * 100)
                      : 0}%`}
                    sx={{
                      bgcolor: todayStats && todayStats.total_orders >= yesterdayStats.total_orders ? '#dcfce7' : '#fee2e2',
                      color: todayStats && todayStats.total_orders >= yesterdayStats.total_orders ? '#15803d' : '#dc2626',
                      fontWeight: 600,
                      fontSize: '0.7rem'
                    }}
                  />
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                vs {yesterdayStats?.total_orders ?? 0} yesterday
              </Typography>
            </Box>

            {/* Today's Revenue */}
            <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Revenue Today</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h4" fontWeight={700} color="success.main">
                  ₹{(todayStats?.total_sales_value ?? 0).toLocaleString()}
                </Typography>
                {yesterdayStats && yesterdayStats.total_sales_value > 0 && (
                  <Chip
                    size="small"
                    icon={todayStats && todayStats.total_sales_value >= yesterdayStats.total_sales_value ? <TrendingUp sx={{ fontSize: 16 }} /> : <TrendingDown sx={{ fontSize: 16 }} />}
                    label={`${todayStats && yesterdayStats.total_sales_value > 0
                      ? Math.round(((todayStats.total_sales_value - yesterdayStats.total_sales_value) / yesterdayStats.total_sales_value) * 100)
                      : 0}%`}
                    sx={{
                      bgcolor: todayStats && todayStats.total_sales_value >= yesterdayStats.total_sales_value ? '#dcfce7' : '#fee2e2',
                      color: todayStats && todayStats.total_sales_value >= yesterdayStats.total_sales_value ? '#15803d' : '#dc2626',
                      fontWeight: 600,
                      fontSize: '0.7rem'
                    }}
                  />
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                vs ₹{(yesterdayStats?.total_sales_value ?? 0).toLocaleString()} yesterday
              </Typography>
            </Box>

            {/* Average Order Value */}
            <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Avg Sale Value</Typography>
              <Typography variant="h4" fontWeight={700} color="text.primary">
                ₹{todayStats && todayStats.total_orders > 0
                  ? Math.round(todayStats.total_sales_value / todayStats.total_orders).toLocaleString()
                  : 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                vs ₹{yesterdayStats && yesterdayStats.total_orders > 0
                  ? Math.round(yesterdayStats.total_sales_value / yesterdayStats.total_orders).toLocaleString()
                  : 0} yesterday
              </Typography>
            </Box>
          </Box>
        </Paper>

        {/* Write-Off Summary - Warning Card */}
        {writeOffData.total > 0 && (
          <Paper
            sx={{
              p: 3,
              boxShadow: 2,
              borderRadius: 3,
              background: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)',
              border: '1px solid #fca5a5'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <WriteOffIcon sx={{ color: '#dc2626', fontSize: 28 }} />
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#991b1b' }}>
                    Write-Off Alert
                  </Typography>
                  <Typography variant="caption" color="#b91c1c">
                    Last 30 days inventory losses
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="h4" fontWeight={700} color="#dc2626">
                  {writeOffData.total} items
                </Typography>
                <Typography variant="body2" color="#b91c1c" fontWeight={500}>
                  ₹{writeOffData.totalValue.toLocaleString()} value lost
                </Typography>
              </Box>
            </Box>
            <Box sx={{ mt: 2 }}>
              <Button
                size="small"
                variant="contained"
                onClick={() => setWriteOffHistoryOpen(true)}
                sx={{
                  bgcolor: '#dc2626',
                  '&:hover': { bgcolor: '#b91c1c' },
                  textTransform: 'none',
                  fontWeight: 600
                }}
              >
                View Write-Off History
              </Button>
            </Box>
          </Paper>
        )}

        {/* Top Selling Products - Last 7 Days */}
        <Paper sx={{ p: 3, boxShadow: 2, borderRadius: 3, background: 'linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <TrophyIcon sx={{ color: '#f59e0b', fontSize: 28 }} />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                Top Performers
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Best selling products in the last 7 days
              </Typography>
            </Box>
          </Box>

          {topSellers.length > 0 ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 700, color: '#64748b', width: 50 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: '#64748b' }}>Product</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: '#64748b' }}>SKU</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#64748b' }}>Units Sold</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#64748b' }}>Revenue</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {topSellers.map((product, index) => (
                    <TableRow
                      key={product.product_id}
                      sx={{
                        '&:hover': { bgcolor: '#f1f5f9' },
                        '&:last-child td': { borderBottom: 0 }
                      }}
                    >
                      <TableCell>
                        <Chip
                          label={index + 1}
                          size="small"
                          sx={{
                            fontWeight: 700,
                            minWidth: 28,
                            bgcolor: index === 0 ? '#fef3c7' : index === 1 ? '#e5e7eb' : index === 2 ? '#fed7aa' : '#f1f5f9',
                            color: index === 0 ? '#92400e' : index === 1 ? '#4b5563' : index === 2 ? '#9a3412' : '#64748b'
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{product.product_name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">{product.sku}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={product.total_units_sold}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600} color="success.main">
                          ₹{product.total_revenue.toLocaleString()}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
              <Typography variant="body2">No sales data for the past 7 days</Typography>
            </Box>
          )}
        </Paper>

        {/* Real Data Chart Section */}
        <Paper sx={{ p: 3, boxShadow: 2, borderRadius: 3, background: 'linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%)' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                📊 Sales Trends
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {timeRange === 'custom' && customStart && customEnd
                  ? `${customStart.format('MMM D')} - ${customEnd.format('MMM D')}`
                  : 'Revenue over time'}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FormControl size="small">
                <Select
                  id="filter-select"
                  value={timeRange === 'custom' ? 'custom' : timeRange}
                  onChange={handleRangeChange}
                  sx={{ minWidth: 150, bgcolor: 'white', borderRadius: 2 }}
                >
                  <MenuItem value="7d">Last 7 Days</MenuItem>
                  <MenuItem value="30d">Last 30 Days</MenuItem>
                  <MenuItem value="90d">Last 3 Months</MenuItem>
                  <MenuItem value="180d">Last 6 Months</MenuItem>
                  <MenuItem value="year">This Year</MenuItem>
                  <MenuItem value="all">All Time</MenuItem>
                  <MenuItem value="custom" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                    Custom Range...
                  </MenuItem>
                </Select>
              </FormControl>

              {/* Custom Date Range Popover */}
              <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                PaperProps={{ sx: { p: 2, width: 300, mt: 1, borderRadius: 3 } }}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle2" fontWeight="bold">Select Range</Typography>
                    <IconButton size="small" onClick={() => setAnchorEl(null)}><CloseIcon fontSize="small" /></IconButton>
                  </Box>
                  <DatePicker
                    label="Start Date"
                    value={customStart}
                    onChange={(n) => setCustomStart(n)}
                    slotProps={{ textField: { size: 'small' } }}
                  />
                  <DatePicker
                    label="End Date"
                    value={customEnd}
                    onChange={(n) => setCustomEnd(n)}
                    slotProps={{ textField: { size: 'small' } }}
                  />
                  <Button
                    variant="contained"
                    onClick={handleCustomApply}
                    disabled={!customStart || !customEnd}
                    fullWidth
                  >
                    Apply Filter
                  </Button>
                </Box>
              </Popover>
            </Box>
          </Box>

          <Box sx={{ height: 300, position: 'relative' }}>
            {chartLoading && (
              <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.7)', zIndex: 2 }}>
                <CircularProgress />
              </Box>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  stroke="#64748b"
                  style={{ fontSize: '12px', fontWeight: 500 }}
                  minTickGap={30} // Prevents label overlap on long ranges
                />
                <YAxis
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                  tickFormatter={(val) => `₹${val.toLocaleString()}`}
                />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [`₹${value.toLocaleString()}`, "Sales"]}
                  labelFormatter={(label: string, payload: readonly any[]) => {
                    if (payload && payload.length > 0) return payload[0].payload.fullDate;
                    return label;
                  }}
                />
                <Bar
                  dataKey="sales"
                  fill="url(#colorSales)"
                  radius={[4, 4, 0, 0]}
                  name="Revenue"
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      </Box>

      {/* Write-Off History Dialog */}
      <WriteOffHistoryDialog
        open={writeOffHistoryOpen}
        onClose={() => setWriteOffHistoryOpen(false)}
      />

      {/* Quick Stock Lookup Dialog */}
      <QuickStockLookupDialog
        open={stockLookupOpen}
        onClose={() => setStockLookupOpen(false)}
      />
    </LocalizationProvider>
  );
};