// @ts-nocheck
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Paper, Typography, CircularProgress, Box, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, MenuItem, TextField, FormControl, Select, Button, IconButton, Popover,
  Stack
} from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
  getInventoryValuation, getTopSellers, getWriteOffSummary, getSalesSummary, getSalesTrends,
  type InventoryValuation, type TopSeller, type WriteOffSummary, type SalesSummary, type SalesTrend
} from '../services/analyticsService';
import {
  TrendingUp as TrendingUpIcon,
  EmojiEvents as TrophyIcon,
  Star as StarIcon,
  AttachMoney as MoneyIcon,
  DateRange as DateRangeIcon,
  ChevronLeft,
  ChevronRight,
  ArrowDropDown,
  ArrowDropUp,
  KeyboardArrowUp,
  KeyboardArrowDown,
  Close as CloseIcon,
  Check as CheckIcon
} from '@mui/icons-material';

// --- DATE PICKER IMPORTS ---
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

// --- 1. CUSTOM CALENDAR HEADER (Themed with Spinners) ---
function CustomCalendarHeader(props) {
  const { currentMonth, onMonthChange } = props;
  const [anchorEl, setAnchorEl] = useState(null);

  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  const adjustDate = (unit, amount) => {
    const newDate = dayjs(currentMonth).add(amount, unit);
    onMonthChange(newDate, amount > 0 ? 'left' : 'right');
  };

  const handleWheel = (unit, e) => {
    if (e.deltaY < 0) adjustDate(unit, 1);
    else adjustDate(unit, -1);
  };

  const selectPreviousMonth = () => adjustDate('month', -1);
  const selectNextMonth = () => adjustDate('month', 1);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, px: 2 }}>
      <IconButton onClick={selectPreviousMonth} size="small">
        <ChevronLeft />
      </IconButton>

      <Button
        onClick={handleOpen}
        endIcon={open ? <ArrowDropUp /> : <ArrowDropDown />}
        sx={{
          color: 'text.primary',
          fontWeight: 'bold',
          textTransform: 'capitalize',
          fontSize: '1rem',
          minWidth: '150px'
        }}
      >
        {dayjs(currentMonth).format('MMMM YYYY')}
      </Button>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        PaperProps={{
          sx: { p: 2, mt: 1, width: 280, borderRadius: 3, boxShadow: '0px 4px 20px rgba(0,0,0,0.15)' }
        }}
      >
        {/* Grid container is needed for the layout inside the popover, but not imported from MUI in this snippet.
            Ideally, we should import Grid. If not, we can use Box with flex. Let's stick to the pattern used in DataSciencePage.
            Assuming Grid is available or we can simulate it. I will import Grid at the top.
        */}
        <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2} alignItems="center">
          {/* MONTH CONTROLS */}
          <Box
            sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              cursor: 'ns-resize', p: 1, borderRadius: 1,
              '&:hover': { bgcolor: 'action.hover' }
            }}
            onWheel={(e) => handleWheel('month', e)}
          >
            <Typography variant="caption" color="text.secondary" fontWeight="bold">MONTH</Typography>
            <IconButton size="small" onClick={() => adjustDate('month', 1)}><KeyboardArrowUp /></IconButton>
            <Typography variant="body1" fontWeight="bold" sx={{ minWidth: 80, textAlign: 'center' }}>
              {dayjs(currentMonth).format('MMM')}
            </Typography>
            <IconButton size="small" onClick={() => adjustDate('month', -1)}><KeyboardArrowDown /></IconButton>
          </Box>

          {/* YEAR CONTROLS */}
          <Box
            sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              cursor: 'ns-resize', p: 1, borderRadius: 1,
              '&:hover': { bgcolor: 'action.hover' }
            }}
            onWheel={(e) => handleWheel('year', e)}
          >
            <Typography variant="caption" color="text.secondary" fontWeight="bold">YEAR</Typography>
            <IconButton size="small" onClick={() => adjustDate('year', 1)}><KeyboardArrowUp /></IconButton>
            <Typography variant="body1" fontWeight="bold">
              {dayjs(currentMonth).format('YYYY')}
            </Typography>
            <IconButton size="small" onClick={() => adjustDate('year', -1)}><KeyboardArrowDown /></IconButton>
          </Box>
        </Box>
      </Popover>

      <IconButton onClick={selectNextMonth} size="small">
        <ChevronRight />
      </IconButton>
    </Box>
  );
}

// --- Helper Component for Card-Level Filtering (UPDATED) ---
interface CardFilterProps {
  onFilterChange: (start: string | undefined, end: string | undefined, label: string) => void;
}

const CardFilter: React.FC<CardFilterProps> = ({ onFilterChange }) => {
  const [range, setRange] = useState('30d');
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [customEnd, setCustomEnd] = useState<string | null>(null);

  // Popover State
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Picker Open States
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);

  // Handle Range Selection from Dropdown
  const handleRangeChange = (event: any) => {
    const newVal = event.target.value;
    setRange(newVal);

    if (newVal === 'custom') {
      setAnchorEl(filterRef.current);
    }
  };

  useEffect(() => {
    if (range === 'custom') return;

    const end = new Date();
    const start = new Date();
    let label = '';

    if (range === '7d') {
      start.setDate(end.getDate() - 7);
      label = 'Last 7 Days';
    } else if (range === '30d') {
      start.setDate(end.getDate() - 30);
      label = 'Last 30 Days';
    } else if (range === '90d') {
      start.setDate(end.getDate() - 90);
      label = 'Last 3 Months';
    } else if (range === 'year') {
      start.setFullYear(end.getFullYear(), 0, 1);
      label = 'This Year';
    } else if (range === 'all') {
      start.setFullYear(2020, 0, 1);
      label = 'All Time';
    }

    onFilterChange(
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0],
      label
    );
  }, [range]);

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      onFilterChange(customStart, customEnd, `${customStart} to ${customEnd}`);
      setAnchorEl(null);
    }
  };

  const handleClosePopover = () => {
    setAnchorEl(null);
  };

  return (
    <Box
      ref={filterRef}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        position: 'relative' // Make sure popover anchors correctly
      }}
    >
      <FormControl size="small" sx={{ minWidth: 120 }}>
        <Select
          value={range}
          onChange={handleRangeChange}
          variant="standard"
          disableUnderline
          sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'inherit' }}
          MenuProps={{ PaperProps: { sx: { borderRadius: 2, mt: 1 } } }}
        >
          <MenuItem value="7d">Last 7 Days</MenuItem>
          <MenuItem value="30d">Last 30 Days</MenuItem>
          <MenuItem value="90d">Last 3 Months</MenuItem>
          <MenuItem value="year">This Year</MenuItem>
          <MenuItem value="all">All Time</MenuItem>
          {/* Added onClick here to force open even if value doesn't change */}
          <MenuItem
            value="custom"
            onClick={() => {
              setRange('custom');
              setAnchorEl(filterRef.current);
            }}
          >
            Custom...
          </MenuItem>
        </Select>
      </FormControl>

      {/* Persistent Calendar Icon for Custom Mode */}
      {range === 'custom' && (
        <IconButton
          size="small"
          onClick={() => setAnchorEl(filterRef.current)}
          sx={{ color: 'inherit', opacity: 0.8 }}
        >
          <DateRangeIcon fontSize="small" />
        </IconButton>
      )}

      {/* Custom Range Popover */}
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClosePopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { p: 3, borderRadius: 3, width: 320, mt: 1, boxShadow: '0px 4px 20px rgba(0,0,0,0.15)' } }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle1" fontWeight="bold" color="text.primary">Select Date Range</Typography>
            <IconButton size="small" onClick={handleClosePopover}><CloseIcon fontSize="small" /></IconButton>
          </Box>

          <DatePicker
            label="Start Date"
            value={customStart ? dayjs(customStart) : null}
            onChange={(newValue) => setCustomStart(newValue ? newValue.format('YYYY-MM-DD') : '')}
            open={startPickerOpen}
            onClose={() => setStartPickerOpen(false)}
            onOpen={() => setStartPickerOpen(true)}
            slots={{ calendarHeader: CustomCalendarHeader }}
            slotProps={{
              textField: {
                size: 'small',
                fullWidth: true,
                onClick: () => setStartPickerOpen(true),
                sx: { '& .MuiInputBase-root': { cursor: 'pointer' }, '& .MuiInputBase-input': { cursor: 'pointer' } }
              }
            }}
          />

          <DatePicker
            label="End Date"
            value={customEnd ? dayjs(customEnd) : null}
            onChange={(newValue) => setCustomEnd(newValue ? newValue.format('YYYY-MM-DD') : '')}
            open={endPickerOpen}
            onClose={() => setEndPickerOpen(false)}
            onOpen={() => setEndPickerOpen(true)}
            slots={{ calendarHeader: CustomCalendarHeader }}
            slotProps={{
              textField: {
                size: 'small',
                fullWidth: true,
                onClick: () => setEndPickerOpen(true),
                sx: { '& .MuiInputBase-root': { cursor: 'pointer' }, '& .MuiInputBase-input': { cursor: 'pointer' } }
              }
            }}
          />

          <Button
            variant="contained"
            fullWidth
            onClick={handleCustomApply}
            disabled={!customStart || !customEnd}
            startIcon={<CheckIcon />}
            sx={{ borderRadius: 2, fontWeight: 600, mt: 1 }}
          >
            Apply Range
          </Button>
        </Box>
      </Popover>
    </Box>
  );
};

export const AnalyticsPage: React.FC = () => {
  const [valuation, setValuation] = useState<InventoryValuation | null>(null);

  // Independent States
  const [salesData, setSalesData] = useState<SalesSummary | null>(null);
  const [salesLabel, setSalesLabel] = useState('Last 30 Days');

  const [writeOffs, setWriteOffs] = useState<WriteOffSummary[]>([]);
  const [woLabel, setWoLabel] = useState('Last 30 Days');

  // Top Sellers State
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [topSellersLabel, setTopSellersLabel] = useState('Last 30 Days');

  // Sales Trends State
  const [trendData, setTrendData] = useState<any[]>([]);
  const [trendLabel, setTrendLabel] = useState('Last 7 Days');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadStaticData = async () => {
      try {
        const valData = await getInventoryValuation();
        setValuation(valData);
        // Load initial trends (Last 7 days default)
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 7);
        const trends = await getSalesTrends(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
        const formattedTrends = trends.map((t: SalesTrend) => {
          const dateObj = new Date(t.date);
          return {
            name: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            fullDate: dateObj.toLocaleDateString(),
            sales: t.total_sales
          };
        });
        setTrendData(formattedTrends);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError('Failed to load base data.');
        setLoading(false);
      }
    };
    loadStaticData();
  }, []);

  const handleSalesFilterChange = useCallback(async (start?: string, end?: string, label?: string) => {
    if (label) setSalesLabel(label);
    try {
      const data = await getSalesSummary(start, end);
      setSalesData(data);
    } catch (err) {
      console.error("Failed to load sales", err);
    }
  }, []);

  const handleWoFilterChange = useCallback(async (start?: string, end?: string, label?: string) => {
    if (label) setWoLabel(label);
    try {
      const data = await getWriteOffSummary(start, end);
      setWriteOffs(data);
    } catch (err) {
      console.error("Failed to load write-offs", err);
    }
  }, []);

  const handleTopSellerFilterChange = useCallback(async (start?: string, end?: string, label?: string) => {
    if (label) setTopSellersLabel(label);
    try {
      const data = await getTopSellers(start, end);
      setTopSellers(data);
    } catch (err) {
      console.error("Failed to load top sellers", err);
    }
  }, []);

  const handleTrendFilterChange = useCallback(async (start?: string, end?: string, label?: string) => {
    if (label) setTrendLabel(label);
    try {
      const trends = await getSalesTrends(start, end);
      const formattedTrends = trends.map((t: SalesTrend) => {
        const dateObj = new Date(t.date);
        return {
          name: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          fullDate: dateObj.toLocaleDateString(),
          sales: t.total_sales
        };
      });
      setTrendData(formattedTrends);
    } catch (err) {
      console.error("Failed to load trends", err);
    }
  }, []);

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress size={48} />
      </Box>
    );
  }

  if (error) return <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>;

  const sortedWriteOffs = [...writeOffs].sort((a, b) => b.total_value_lost - a.total_value_lost);
  const chartHeight = Math.max(sortedWriteOffs.length * 60, 150);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
            📊 Manager Analytics
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Deep insights into your inventory and sales performance
          </Typography>
        </Box>

        {/* Top Cards Grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>

          {/* 1. SALES REVENUE CARD - GREEN (EMERALD) */}
          <Paper
            sx={{
              p: 3,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              borderRadius: 3,
              boxShadow: 3,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, position: 'relative', zIndex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MoneyIcon sx={{ opacity: 0.8 }} />
                <Typography variant="h6" sx={{ opacity: 0.95, fontWeight: 600 }}>
                  Sales Revenue
                </Typography>
              </Box>
              <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', borderRadius: 2, px: 1 }}>
                <CardFilter onFilterChange={handleSalesFilterChange} />
              </Box>
            </Box>

            <Box sx={{ position: 'relative', zIndex: 1 }}>
              <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>
                ₹{salesData?.total_sales_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8, mb: 2 }}>
                Period: {salesLabel}
              </Typography>

              <Box sx={{ display: 'flex', gap: 4, opacity: 0.9, mt: 'auto' }}>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 600 }}>
                    {salesData?.total_orders}
                  </Typography>
                  <Typography variant="body2">Orders</Typography>
                </Box>
              </Box>
            </Box>
            <Box sx={{ position: 'absolute', width: 250, height: 250, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)', top: -100, right: -100 }} />
          </Paper>

          {/* 2. INVENTORY VALUATION CARD - INDIGO */}
          <Paper
            sx={{
              p: 3,
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: 'white',
              borderRadius: 3,
              boxShadow: 3,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <Box sx={{ position: 'relative', zIndex: 1, height: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{ opacity: 0.95, fontWeight: 600 }}>
                  💰 Inventory Value
                </Typography>
                <Chip label="Current Snapshot" size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }} />
              </Box>

              <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>
                ₹{valuation?.total_valuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8, mb: 2 }}>
                Cost value of stock on hand
              </Typography>

              <Box sx={{ display: 'flex', gap: 4, opacity: 0.9 }}>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 600 }}>
                    {valuation?.total_items}
                  </Typography>
                  <Typography variant="body2">Total Items</Typography>
                </Box>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 600 }}>
                    {valuation?.distinct_products}
                  </Typography>
                  <Typography variant="body2">Products</Typography>
                </Box>
              </Box>
            </Box>
            <Box sx={{ position: 'absolute', width: 250, height: 250, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)', top: -100, right: -100 }} />
          </Paper>

          {/* 3. WRITE-OFF SUMMARY CARD */}
          <Paper
            sx={{
              p: 3,
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: 'white',
              borderRadius: 3,
              boxShadow: 3,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, position: 'relative', zIndex: 1 }}>
              <Typography variant="h6" sx={{ opacity: 0.95, fontWeight: 600 }}>
                📉 Total Loss
              </Typography>
              <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', borderRadius: 2, px: 1 }}>
                <CardFilter onFilterChange={handleWoFilterChange} />
              </Box>
            </Box>

            <Box sx={{ position: 'relative', zIndex: 1 }}>
              <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>
                ₹{writeOffs.reduce((sum, wo) => sum + wo.total_value_lost, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8, mb: 2 }}>
                Period: {woLabel}
              </Typography>

              <Box sx={{ display: 'flex', gap: 4, opacity: 0.9 }}>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 600 }}>
                    {writeOffs.reduce((sum, wo) => sum + wo.total_count, 0)}
                  </Typography>
                  <Typography variant="body2">Items Lost</Typography>
                </Box>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 600 }}>
                    {writeOffs.length}
                  </Typography>
                  <Typography variant="body2">Reasons</Typography>
                </Box>
              </Box>
            </Box>
            <Box sx={{ position: 'absolute', width: 250, height: 250, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)', top: -100, right: -100 }} />
          </Paper>
        </Box>

        {/* Sales Trends Chart (Moved from Dashboard) */}
        <Paper sx={{ p: 3, boxShadow: 2, borderRadius: 3, background: 'linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%)' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                📊 Sales Trends
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {trendLabel}
              </Typography>
            </Box>

            <Box sx={{ bgcolor: 'white', borderRadius: 2 }}>
              {/* Reusing CardFilter but we need to ensure it works well here. 
                    The CardFilter component is designed to fit in small headers. 
                */}
              <CardFilter onFilterChange={handleTrendFilterChange} />
            </Box>
          </Box>

          <Box sx={{ height: 350, position: 'relative' }}>
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
                  minTickGap={30}
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

        {/* Main Content Grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>

          {/* Top Selling Products Table */}
          <Paper
            sx={{
              p: 3,
              borderRadius: 3,
              boxShadow: 2,
              background: 'linear-gradient(to bottom, #ffffff 0%, #faf5ff 100%)',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <TrophyIcon sx={{ color: '#f59e0b', fontSize: 32 }} />
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    Top Selling Products
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    By Revenue ({topSellersLabel})
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ bgcolor: '#f1f5f9', borderRadius: 2, px: 1 }}>
                <CardFilter onFilterChange={handleTopSellerFilterChange} />
              </Box>
            </Box>

            {topSellers.length > 0 ? (
              <TableContainer sx={{ maxHeight: 600 }}>
                <Table stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, color: 'primary.main', bgcolor: '#faf5ff' }}>Rank</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'primary.main', bgcolor: '#faf5ff' }}>Product</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'primary.main', bgcolor: '#faf5ff' }}>SKU</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main', bgcolor: '#faf5ff' }}>
                        Units Sold
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main', bgcolor: '#faf5ff' }}>
                        Total Revenue
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topSellers.slice(0, 20).map((product, index) => (
                      <TableRow
                        key={product.product_id}
                        sx={{
                          '&:hover': { backgroundColor: 'rgba(102, 126, 234, 0.05)' },
                          transition: 'background-color 0.2s'
                        }}
                      >
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {index === 0 && <StarIcon sx={{ color: '#f59e0b', fontSize: 20 }} />}
                            {index === 1 && <StarIcon sx={{ color: '#9ca3af', fontSize: 20 }} />}
                            {index === 2 && <StarIcon sx={{ color: '#cd7f32', fontSize: 20 }} />}
                            <Typography sx={{ fontWeight: 600, fontSize: '1rem' }}>
                              #{index + 1}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontWeight: 500 }}>
                            {product.product_name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={product.sku}
                            size="small"
                            sx={{
                              fontFamily: 'monospace',
                              backgroundColor: 'rgba(102, 126, 234, 0.1)',
                              fontWeight: 600
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                            <TrendingUpIcon sx={{ color: '#10b981', fontSize: 18 }} />
                            <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'primary.main' }}>
                              {product.total_units_sold.toLocaleString()}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#10b981' }}>
                            ₹{(product.total_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Box sx={{ py: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">No sales data available for this period.</Typography>
              </Box>
            )}
          </Paper>

          {/* Write-Off Breakdown Chart */}
          <Paper
            sx={{
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 3,
              boxShadow: 2,
              background: 'linear-gradient(to bottom, #ffffff 0%, #fef3c7 100%)',
              height: 'fit-content'
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" fontWeight={600} color="text.primary">
                📉 Loss Breakdown
              </Typography>
              <Chip label={woLabel} size="small" />
            </Box>

            {sortedWriteOffs.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={chartHeight}>
                  <BarChart
                    layout="vertical"
                    data={sortedWriteOffs}
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="reason"
                      type="category"
                      width={100}
                      tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <Box sx={{ bgcolor: 'white', p: 1.5, borderRadius: 2, boxShadow: 3, border: '1px solid #e2e8f0' }}>
                              <Typography variant="subtitle2" fontWeight="bold">{data.reason}</Typography>
                              <Typography variant="body2" color="error.main">
                                Loss: ₹{data.total_value_lost.toLocaleString()}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Count: {data.total_count} items
                              </Typography>
                            </Box>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="total_value_lost" radius={[0, 4, 4, 0]} barSize={32}>
                      {sortedWriteOffs.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <Box sx={{ mt: 2 }}>
                  {sortedWriteOffs.map((wo, idx) => (
                    <Box
                      key={wo.reason}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        py: 1,
                        borderBottom: idx < sortedWriteOffs.length - 1 ? '1px solid' : 'none',
                        borderColor: 'divider'
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            backgroundColor: COLORS[idx % COLORS.length]
                          }}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {wo.reason}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>
                        ₹{wo.total_value_lost.toLocaleString()}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </>
            ) : (
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">No write-offs in this period.</Typography>
              </Box>
            )}
          </Paper>

        </Box>
      </Box>
    </LocalizationProvider>
  );
};