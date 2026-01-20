// @ts-nocheck
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { 
  Paper, Typography, CircularProgress, Box, Alert, 
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Chip,
  FormControl, Select, MenuItem, IconButton, Popover, TextField, Grid, InputLabel,
  Stack
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
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

import { 
  getMarketBasketAnalysis, getABCAnalysis, getCustomerSegments,
  type MarketBasketRule, type ABCItem, type CustomerSegment 
} from '../services/analyticsService';

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
        <Grid container spacing={2} alignItems="center">
          {/* MONTH CONTROLS */}
          <Grid item xs={6}>
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
          </Grid>
          
          <Box sx={{ position: 'absolute', left: '50%', top: '20%', bottom: '20%', width: '1px', bgcolor: 'divider' }} />

          {/* YEAR CONTROLS */}
          <Grid item xs={6}>
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
          </Grid>
        </Grid>
      </Popover>

      <IconButton onClick={selectNextMonth} size="small">
        <ChevronRight />
      </IconButton>
    </Box>
  );
}

// --- Helper: Date Filter Component ---
interface FilterProps {
  onFilterChange: (start: string | undefined, end: string | undefined, label: string) => void;
  defaultRange?: '7d' | '30d' | '90d' | 'year' | 'all';
}

const DateRangeFilter: React.FC<FilterProps> = ({ onFilterChange, defaultRange = 'year' }) => {
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'year' | 'all' | 'custom'>(defaultRange); 
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
    
    // Logic: If user selects 'custom' (even if already selected), open the popover
    if (newVal === 'custom') {
      setRange('custom'); // Ensure state is set
      setAnchorEl(filterRef.current); // Open popover
    } else {
      setRange(newVal); // Just set the new range for presets
    }
  };

  useEffect(() => {
    if (range === 'custom') return;
    const end = new Date();
    const start = new Date();
    let label = '';

    if (range === '7d') { start.setDate(end.getDate() - 7); label = 'Last 7 Days'; }
    if (range === '30d') { start.setDate(end.getDate() - 30); label = 'Last 30 Days'; }
    if (range === '90d') { start.setDate(end.getDate() - 90); label = 'Last 3 Months'; }
    if (range === 'year') { start.setFullYear(end.getFullYear(), 0, 1); label = 'This Year'; }
    if (range === 'all') { start.setFullYear(2020, 0, 1); label = 'All Time'; }

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
        bgcolor: 'white', 
        p: 0.5, 
        borderRadius: 2, 
        border: '1px solid #e2e8f0', 
        display: 'flex', 
        alignItems: 'center',
        position: 'relative' 
      }}
    >
      <FormControl size="small" sx={{ minWidth: 110 }}>
        <Select
          value={range}
          // Changed onChange to accept the event directly to intercept 'custom' clicks
          onChange={handleRangeChange}
          // IMPORTANT: This onClick ensures that even if 'custom' is ALREADY selected, clicking it again triggers the logic
          // However, Select's onChange only fires on value *change*. 
          // To catch clicks on the *same* value, we can rely on the MenuItems' onClick, but Select doesn't propagate that easily.
          // A common workaround for "re-selecting" the same value in MUI Select is to use `renderValue` or handle `onOpen` but simple state checks are easier.
          // Since we want the *option* in the dropdown to trigger it, we can just leave it as is:
          // If the user clicks the dropdown arrow and clicks "Custom Range...", onChange fires if it wasn't custom.
          // If it WAS custom, onChange won't fire.
          // To fix this, we can add `onClick` to the MenuItem itself.
          variant="standard"
          disableUnderline
          sx={{ fontSize: '0.8rem', fontWeight: 600, px: 1 }}
          MenuProps={{ PaperProps: { sx: { borderRadius: 2, mt: 1 } } }}
        >
          <MenuItem value="7d">Last 7 Days</MenuItem>
          <MenuItem value="30d">Last 30 Days</MenuItem>
          <MenuItem value="90d">3 Months</MenuItem>
          <MenuItem value="year">This Year</MenuItem>
          <MenuItem value="all">All Time</MenuItem>
          {/* Added onClick here to force open even if value doesn't change */}
          <MenuItem 
            value="custom" 
            sx={{ fontWeight: 'bold', color: 'primary.main' }}
            onClick={() => {
                setRange('custom'); // Redundant but safe
                setAnchorEl(filterRef.current);
            }}
          >
            Custom Range...
          </MenuItem>
        </Select>
      </FormControl>
      
      {/* ADDED: Edit button appears when Custom is selected, allowing re-opening */}
      {range === 'custom' && (
        <IconButton 
            size="small" 
            onClick={() => setAnchorEl(filterRef.current)}
            sx={{ ml: 0.5, color: 'primary.main' }}
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

// --- Helpers ---
const aggregateSegments = (data: CustomerSegment[]) => {
  const counts: Record<string, number> = {};
  data.forEach(d => { counts[d.segment_name] = (counts[d.segment_name] || 0) + 1; });
  return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
};

const aggregateABC = (data: ABCItem[]) => {
  const counts = { A: 0, B: 0, C: 0 };
  data.forEach(d => { if(d.category_rank in counts) counts[d.category_rank as 'A'|'B'|'C']++ });
  return [
    { name: 'Class A (High Value)', value: counts.A, rank: 'A' },
    { name: 'Class B (Medium)', value: counts.B, rank: 'B' },
    { name: 'Class C (Low)', value: counts.C, rank: 'C' },
  ];
};

const getClassDescription = (rank: 'A' | 'B' | 'C' | null) => {
  switch (rank) {
    case 'A': return "These are your most vital products, generating ~80% of revenue. Zero-tolerance for stockouts is recommended.";
    case 'B': return "These products generate ~15% of revenue. They are important but require less intensive management than Class A.";
    case 'C': return "These products generate only ~5% of revenue. They are often numerous but contribute little value. Bulk ordering is common.";
    default: return "";
  }
};

export const DataSciencePage: React.FC = () => {
  // --- State ---
  const [mbaRules, setMbaRules] = useState<MarketBasketRule[]>([]);
  const [abcItems, setAbcItems] = useState<ABCItem[]>([]);
  const [segments, setSegments] = useState<CustomerSegment[]>([]);
  
  // Independent Loading States
  const [loadingRFM, setLoadingRFM] = useState(true);
  const [loadingABC, setLoadingABC] = useState(true);
  const [loadingMBA, setLoadingMBA] = useState(true);
  
  // Independent Error States
  const [error, setError] = useState('');
  
  const [abcDialogOpen, setAbcDialogOpen] = useState(false);
  const [selectedClassRank, setSelectedClassRank] = useState<'A' | 'B' | 'C' | null>(null);
  
  // --- Loaders ---

  const loadRFM = useCallback(async (start?: string, end?: string) => {
    setLoadingRFM(true);
    try {
      const data = await getCustomerSegments(start, end);
      setSegments(data);
    } catch (err) {
      console.error(err);
      setError('Failed to load RFM data');
    } finally {
      setLoadingRFM(false);
    }
  }, []);

  const loadABC = useCallback(async (start?: string, end?: string) => {
    setLoadingABC(true);
    try {
      const data = await getABCAnalysis(start, end);
      setAbcItems(data);
    } catch (err) {
      console.error(err);
      setError('Failed to load ABC data');
    } finally {
      setLoadingABC(false);
    }
  }, []);

  const loadMBA = useCallback(async (start?: string, end?: string) => {
    setLoadingMBA(true);
    try {
      const data = await getMarketBasketAnalysis(start, end);
      setMbaRules(data);
    } catch (err) {
      console.error(err);
      setError('Failed to load Market Basket data');
    } finally {
      setLoadingMBA(false);
    }
  }, []);

  // --- Interaction Handlers ---

  const handlePieClick = (data: any) => {
    if (data && data.rank) {
      setSelectedClassRank(data.rank);
      setAbcDialogOpen(true);
    }
  };

  const filteredABCItems = abcItems
    .filter(item => item.category_rank === selectedClassRank)
    .sort((a, b) => b.revenue - a.revenue);

  // --- Columns Definitions ---

  const mbaColumns: GridColDef[] = [
    { field: 'id', headerName: '#', width: 70, align: 'center', headerAlign: 'center', renderCell: (params) => <Box sx={{ fontWeight: 600, color: '#64748b' }}>{params.value + 1}</Box> },
    { field: 'if_buy', headerName: '🛍️ If Customer Buys...', flex: 1, minWidth: 280, renderCell: (params) => (<Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', py: 1.5 }}>{(params.value || []).map((item: string, idx: number) => (<Chip key={idx} label={item} size="small" sx={{ bgcolor: '#eef2ff', color: '#4338ca', fontWeight: 600, borderRadius: 1 }} />))}</Box>) },
    { field: 'likely_to_buy', headerName: '✨ They Likely Buy...', flex: 1, minWidth: 280, renderCell: (params) => (<Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', py: 1.5 }}>{(params.value || []).map((item: string, idx: number) => (<Chip key={idx} label={item} size="small" sx={{ bgcolor: '#f0fdf4', color: '#15803d', fontWeight: 600, borderRadius: 1 }} />))}</Box>) },
    { field: 'confidence', headerName: 'Confidence', width: 120, type: 'number', renderCell: (params) => (<Typography variant="body2" fontWeight="bold" color={(params.value >= 0.7) ? 'success.main' : 'text.secondary'}>{(params.value * 100).toFixed(1)}%</Typography>) },
    { field: 'lift', headerName: 'Lift', width: 100, type: 'number', renderCell: (params) => (<Typography variant="body2" fontWeight="bold" color={(params.value >= 3) ? 'secondary.main' : 'text.secondary'}>{params.value?.toFixed(2)}x</Typography>) },
  ];

  const abcDetailsColumns: GridColDef[] = [
    { field: 'sku', headerName: 'SKU', width: 130, renderCell: (params) => (<Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}><Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary', fontWeight: 500 }}>{params.value}</Typography></Box>) },
    { field: 'product_name', headerName: 'Product Name', flex: 1, renderCell: (params) => (<Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}><Typography fontWeight="500">{params.value}</Typography></Box>) },
    { field: 'revenue', headerName: 'Revenue Contrib.', width: 160, align: 'right', headerAlign: 'right', renderCell: (params) => (<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%', width: '100%' }}><Typography fontWeight="bold" color="primary">₹{params.value.toLocaleString(undefined, {minimumFractionDigits: 2})}</Typography></Box>) }
  ];

  const segmentData = aggregateSegments(segments);
  const abcData = aggregateABC(abcItems);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Page Header */}
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
            🤖 AI & Data Insights
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Machine learning powered analytics for smarter business decisions
          </Typography>
        </Box>

        {error && <Alert severity="warning" sx={{ borderRadius: 3 }}>{error}</Alert>}

        {/* Row 1: RFM and ABC */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
          
          {/* RFM Chart */}
          <Paper sx={{ p: 3, height: 450, display: 'flex', flexDirection: 'column', borderRadius: 3, boxShadow: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                👥 Customer Segmentation (RFM)
              </Typography>
              {/* Filter 1 */}
              <DateRangeFilter onFilterChange={loadRFM} defaultRange="year" />
            </Box>

            {loadingRFM ? (
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><CircularProgress /></Box>
            ) : segmentData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={segmentData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Typography color="text.secondary">No data for this period.</Typography></Box>
            )}
          </Paper>

          {/* ABC Chart */}
          <Paper sx={{ p: 3, height: 450, display: 'flex', flexDirection: 'column', borderRadius: 3, boxShadow: 2, bgcolor: '#fffbeb' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#92400e' }}>
                📦 ABC Inventory Class
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Chip label="Interactive" size="small" color="warning" variant="outlined" />
                {/* Filter 2 */}
                <DateRangeFilter onFilterChange={loadABC} defaultRange="year" />
              </Box>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>Tap a slice to view products.</Typography>
            
            {loadingABC ? (
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><CircularProgress /></Box>
            ) : abcData.some(d => d.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={abcData.filter(d => d.value > 0)} cx="50%" cy="45%" labelLine={{ stroke: '#94a3b8' }} label={({ name, percent }: any) => `${name.split(' ')[1]} ${(percent * 100).toFixed(0)}%`} outerRadius={80} dataKey="value" onClick={handlePieClick} style={{ cursor: 'pointer' }}>
                    {abcData.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} style={{ cursor: 'pointer', outline: 'none' }} />))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Typography color="text.secondary">No sales data for this period.</Typography></Box>
            )}
          </Paper>
        </Box>

        {/* Market Basket Table */}
        <Paper sx={{ p: 3, borderRadius: 3, boxShadow: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>🛒 Market Basket Analysis</Typography>
              <Typography variant="caption" color="text.secondary">Frequent associations</Typography>
            </Box>
            {/* Filter 3 */}
            <DateRangeFilter onFilterChange={loadMBA} defaultRange="year" />
          </Box>

          {loadingMBA ? (
            <Box sx={{ height: 300, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><CircularProgress /></Box>
          ) : mbaRules.length > 0 ? (
            <Box sx={{ height: 500 }}>
              <DataGrid rows={mbaRules.map((r, i) => ({ id: i, ...r }))} columns={mbaColumns} initialState={{ pagination: { paginationModel: { pageSize: 10 } } }} disableRowSelectionOnClick getRowHeight={() => 'auto'} sx={{ border: 'none', '& .MuiDataGrid-cell': { py: 1 } }} />
            </Box>
          ) : (
            <Box sx={{ p: 4, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 2 }}><Typography color="text.secondary">Need more transactions in this period to find patterns.</Typography></Box>
          )}
        </Paper>

        {/* ABC Dialog */}
        <Dialog open={abcDialogOpen} onClose={() => setAbcDialogOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            Class {selectedClassRank} Products
            <Chip label={selectedClassRank === 'A' ? 'High Value (Top 80%)' : selectedClassRank === 'B' ? 'Medium Value (Next 15%)' : 'Low Value (Bottom 5%)'} color={selectedClassRank === 'A' ? 'primary' : selectedClassRank === 'B' ? 'secondary' : 'default'} size="small" />
          </DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 2, mt: 1, fontSize: '0.9rem' }}>{getClassDescription(selectedClassRank)}</Alert>
            <Box sx={{ height: 400, width: '100%' }}>
              <DataGrid rows={filteredABCItems} columns={abcDetailsColumns} getRowId={(row) => row.sku} initialState={{ pagination: { paginationModel: { pageSize: 5 } } }} disableRowSelectionOnClick rowHeight={52} sx={{ border: '1px solid #e2e8f0', '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' } }} />
            </Box>
          </DialogContent>
          <DialogActions><Button onClick={() => setAbcDialogOpen(false)}>Close</Button></DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};