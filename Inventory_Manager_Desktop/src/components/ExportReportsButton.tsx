import React, { useState, useEffect } from 'react';
import { 
  Button, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Box, 
  Typography, 
  CircularProgress, 
  Snackbar, 
  Alert,
  Card,
  CardActionArea,
  Tabs,
  Tab,
  TextField,
  Autocomplete,
  ToggleButton,
  ToggleButtonGroup,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Divider,
  IconButton,
  Switch,            // <--- ADD THIS
  FormControlLabel,  // <--- ADD THIS
  FormGroup          // <--- ADD THIS
} from '@mui/material';
import {
  FileDownload as ExportIcon,
  Inventory2 as StockIcon,
  Warning as AlertIcon,
  TrendingUp as MovementIcon,
  PictureAsPdf as PdfIcon,
  TableChart as CsvIcon,
  Description as ReportIcon,
  DateRange as DateRangeIcon,
  FilterList as FilterIcon,
  Tune as TuneIcon,
  Close as CloseIcon,
   
} from '@mui/icons-material';
import client from '../api/client';

interface ExportReportsButtonProps {
  onExportStart?: () => void;
  onExportComplete?: () => void;
}

interface ReportOption {
  id: string;
  title: string;
  description: string;
  endpoint: string;
  needsParams?: boolean;
  paramLabel?: string;
  paramType?: 'number';
  defaultParamValue?: string;
  paramKey?: string;
  needsTimeFilter?: boolean;
  supportsCategoryFilter?: boolean;
  supportsStockStatusFilter?: boolean; 
  supportsSupplierFilter?: boolean;
  supportsBlindMode?: boolean; 
  supportsLocationFilter?: boolean; 
  supportsSkuFilter?: boolean; 
}

const REPORT_CATEGORIES = {
 stock: [
    { 
      id: 'stock_summary', 
      title: 'Stock Summary', 
      description: 'Master list of all current inventory.', 
      endpoint: 'stock_summary', 
      needsTimeFilter: true,
      supportsCategoryFilter: true, 
      supportsSupplierFilter: true,
      supportsSkuFilter: true 
    },
    { 
      id: 'location_summary', 
      title: 'Location Summary', 
      description: 'Stock breakdown by warehouse/store.', 
      endpoint: 'location_summary', 
      needsTimeFilter: true, 
      supportsLocationFilter: true,
      supportsCategoryFilter: true,
      supportsSkuFilter: true 
    }, 
    { 
      id: 'batch_wise_stock', 
      title: 'Batch Report', 
      description: 'Detailed list of all batches & expiry.', 
      endpoint: 'batch_wise_stock', 
      needsTimeFilter: false, 
      supportsSkuFilter: true,
      supportsSupplierFilter: true  // ✅ Correct New Version
    }, 
    { 
      id: 'physical_stock_register', 
      title: 'Audit Sheet', 
      description: 'Printable sheet for physical counting.', 
      endpoint: 'physical_stock_register', 
      needsTimeFilter: false, 
      supportsLocationFilter: true,
      supportsCategoryFilter: true,
      supportsBlindMode: true       // ✅ Correct New Version
    }
   
  ],
  health: [
   { 
      id: 'low_stock_reorder', 
      title: 'Low Stock', 
      description: 'Items below reorder level.', 
      endpoint: 'low_stock_reorder', 
      needsParams: true, 
      paramLabel: 'Reorder Threshold', 
      paramKey: 'reorder_threshold', 
      defaultParamValue: '20', 
      needsTimeFilter: true, 
      supportsSupplierFilter: true, // You already have this
      supportsCategoryFilter: true, // <--- ADD THIS
      supportsLocationFilter: true  // <--- ADD THIS
    },
    { 
      id: 'near_expiry', 
      title: 'Near Expiry', 
      description: 'Items expiring soon.', 
      endpoint: 'near_expiry', 
      needsParams: true, 
      paramLabel: 'Days Threshold', 
      paramKey: 'days_threshold', 
      defaultParamValue: '30', 
      needsTimeFilter: true,         // Your existing Time Range
      supportsCategoryFilter: true,  // <--- ADD THIS
      supportsLocationFilter: true,  // <--- ADD THIS
      supportsSupplierFilter: true   // <--- ADD THIS
    },
    { 
      id: 'overstock_dormant', 
      title: 'Dormant Stock', 
      description: 'Items with no recent sales.', 
      endpoint: 'overstock_dormant', 
      needsParams: true, 
      paramLabel: 'Inactivity Days', 
      paramKey: 'days_inactive', 
      defaultParamValue: '90', 
      needsTimeFilter: true,         // Your existing Time Range
      supportsCategoryFilter: true,  // <--- ADD THIS
      supportsLocationFilter: true,  // <--- ADD THIS
      supportsSupplierFilter: true   // <--- ADD THIS
    }, 
    { 
      id: 'stock_ageing', 
      title: 'Ageing Analysis', 
      description: 'How long stock has been sitting.', 
      endpoint: 'stock_ageing', 
      needsTimeFilter: true,       // Ageing usually defines its own time buckets
      supportsCategoryFilter: true, // <--- ADD THIS
      supportsLocationFilter: true, // <--- ADD THIS
      supportsSupplierFilter: true  // <--- ADD THIS
    },
  ],
  financial: [
    { 
      id: 'item_profitability', 
      title: 'Profitability', 
      description: 'Margins per product.', 
      endpoint: 'item_profitability', 
      needsTimeFilter: true,       // Usually profitability is a snapshot of current pricing
      supportsCategoryFilter: true, // <--- ADD THIS
      supportsSupplierFilter: true  // <--- ADD THIS
    },
   { 
      id: 'supplier_performance', 
      title: 'Supplier Perf.', 
      description: 'Purchase summary by supplier.', 
      endpoint: 'supplier_performance', 
      needsTimeFilter: true,        // <--- Set to TRUE (Backend now supports start/end date)
      supportsCategoryFilter: true, // <--- ADD THIS
      supportsLocationFilter: true  // <--- ADD THIS
    },
    { 
      id: 'stock_movement', 
      title: 'Movement Analysis', 
      description: 'Fast vs Slow moving items.', 
      endpoint: 'stock_movement', 
      needsParams: true, 
      paramLabel: 'History Days', 
      paramKey: 'days_back', 
      defaultParamValue: '90', 
      needsTimeFilter: true,         // Existing
      supportsCategoryFilter: true,  // <--- ADD THIS
      supportsSupplierFilter: true   // <--- ADD THIS
    },
    { 
      id: 'daily_transactions', 
      title: 'Daily Register', 
      description: 'Audit log of stock changes.', 
      endpoint: 'daily_transactions', 
      needsTimeFilter: true,         // Handles 'days_back'
      supportsSkuFilter: true,       // <--- ADD THIS (Filter by Product)
      needsParams: true,             // <--- Enable Generic Input
      paramLabel: 'Username (Optional)', // <--- Label it for User Search
      paramKey: 'username',          // <--- Key for Backend
      defaultParamValue: '' 
    },
  ]
};

const TIME_RANGES = [
  { label: '1 Week (7 Days)', value: '7' },
  { label: '2 Weeks (14 Days)', value: '14' },
  { label: '1 Month (30 Days)', value: '30' },
  { label: '3 Months (90 Days)', value: '90' },
  { label: '6 Months (180 Days)', value: '180' },
  { label: '12 Months (365 Days)', value: '365' },
  { label: 'Complete History', value: 'all' },
  { label: 'Custom Range', value: 'custom' } 
];

const STOCK_STATUS_OPTIONS = [
  { label: 'All Items', value: 'all' },
  { label: 'In Stock Only (> 0)', value: 'in_stock' },
  { label: 'Out of Stock (= 0)', value: 'out_of_stock' },
];

export const ExportReportsButton: React.FC<ExportReportsButtonProps> = ({
  onExportStart,
  onExportComplete
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tabValue, setTabValue] = useState(0); 
  const [selectedReport, setSelectedReport] = useState<ReportOption | null>(null);
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv');
  
  // Parameters
  const [paramValue, setParamValue] = useState('');
  const [timeRange, setTimeRange] = useState('30'); 
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  // Filter States
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState(''); 
  const [locationFilter, setLocationFilter] = useState(''); 
  const [skuFilter, setSkuFilter] = useState(''); 
  const [blindMode, setBlindMode] = useState(false);
  // Options for Dropdowns
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [skuOptions, setSkuOptions] = useState<{sku: string, name: string}[]>([]); // New SKU Options

  const [snackbar, setSnackbar] = useState({ 
    open: false, 
    message: '', 
    severity: 'success' as 'success' | 'error' 
  });

  // Fetch Data when dialog opens
  useEffect(() => {
    if (open) {
      const fetchData = async () => {
        try {
          const token = localStorage.getItem('user_token');
          const headers = { 'Authorization': `Bearer ${token}` };

          // 1. Fetch Suppliers
          const suppliersRes = await client.get('/api/v1/suppliers', { headers });
          if (Array.isArray(suppliersRes.data)) {
            setSupplierOptions(suppliersRes.data.map((s: any) => s.name));
          }

          // 2. Fetch Locations
          const locationsRes = await client.get('/api/v1/locations', { headers });
          if (Array.isArray(locationsRes.data)) {
            setLocationOptions(locationsRes.data.map((l: any) => l.name));
          }

          // 3. Fetch Products (for Categories and SKUs)
          const productsRes = await client.get('/api/v1/products', { headers });
          if (Array.isArray(productsRes.data)) {
            // Extract unique categories
            const cats = new Set(productsRes.data.map((p: any) => p.category).filter((c: any) => c));
            setCategoryOptions(Array.from(cats) as string[]);

            // Extract SKUs and Names
            const skus = productsRes.data.map((p: any) => ({ sku: p.sku, name: p.name }));
            setSkuOptions(skus);
          }
        } catch (error) {
          console.error("Failed to fetch filter options", error);
        }
      };
      fetchData();
    }
  }, [open]);

  const handleClickOpen = () => {
    setOpen(true);
    setTabValue(0);
    setSelectedReport(null);
    setFormat('csv');
    // Reset all params
    setTimeRange('30');
    setCustomStartDate('');
    setCustomEndDate('');
    setCategoryFilter('');
    setStockStatusFilter('all');
    setSupplierFilter('');
    setLocationFilter('');
    setSkuFilter('');
    setBlindMode(false);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSelectReport = (report: ReportOption) => {
    setSelectedReport(report);
    if (report.needsParams) {
      setParamValue(report.defaultParamValue || '');
    }
    if (report.needsTimeFilter) {
      setTimeRange('30'); 
    }
    setCategoryFilter('');
    setStockStatusFilter('all');
    setSupplierFilter('');
    setLocationFilter('');
    setSkuFilter('');
  };

  const handleExport = async () => {
    if (!selectedReport) return;
    
    setLoading(true);
    onExportStart?.();

    try {
      const token = localStorage.getItem('user_token');
      const params: any = { format };
      
      // 1. Handle Time Filter
      if (selectedReport.needsTimeFilter) {
        let rangeValue = timeRange;

        if (timeRange === 'custom') {
           if (customStartDate && customEndDate) {
             const start = new Date(customStartDate);
             const end = new Date(customEndDate);
             const diffTime = Math.abs(end.getTime() - start.getTime());
             const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
             
             params['start_date'] = customStartDate;
             params['end_date'] = customEndDate;
             rangeValue = diffDays.toString(); 
           }
        } else if (timeRange === 'all') {
           rangeValue = '36500';
        }
        
        if (selectedReport.paramKey === 'days_inactive') params['days_inactive'] = rangeValue;
        else if (selectedReport.paramKey === 'days_threshold') params['days_threshold'] = rangeValue;
        else params['days_back'] = rangeValue;
      }

      // 2. Handle Manual Parameter
      const isTimeParam = ['days_back', 'days_inactive', 'days_threshold'].includes(selectedReport.paramKey || '');
      if (selectedReport.needsParams && selectedReport.paramKey && !isTimeParam) {
         params[selectedReport.paramKey] = paramValue;
      }

      // 3. Handle Filters
      if (selectedReport.supportsCategoryFilter && categoryFilter) params['category'] = categoryFilter;
      if (selectedReport.supportsStockStatusFilter && stockStatusFilter !== 'all') params['stock_status'] = stockStatusFilter;
      if (selectedReport.supportsSupplierFilter && supplierFilter) params['supplier'] = supplierFilter;
      if (selectedReport.supportsLocationFilter && locationFilter) params['location'] = locationFilter;
      if (selectedReport.supportsSkuFilter && skuFilter) params['sku'] = skuFilter; 
      
      const queryParams = new URLSearchParams(params).toString();
      
      const response = await client.get(`/api/v1/reports/${selectedReport.endpoint}?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        responseType: 'blob'
      });

      const contentDisposition = response.headers['content-disposition'];
      let filename = `${selectedReport.id}_${new Date().toISOString().split('T')[0]}.${format}`;
      
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match) filename = match[1];
      }
      if (selectedReport.supportsBlindMode) params['blind_mode'] = blindMode;
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      setSnackbar({ open: true, message: 'Report downloaded successfully!', severity: 'success' });
      handleClose();
    } catch (error) {
      console.error("Export failed", error);
      setSnackbar({ open: true, message: 'Failed to download report.', severity: 'error' });
    } finally {
      setLoading(false);
      onExportComplete?.();
    }
  };

  const getCurrentList = () => {
    if (tabValue === 0) return REPORT_CATEGORIES.stock;
    if (tabValue === 1) return REPORT_CATEGORIES.health;
    return REPORT_CATEGORIES.financial;
  };

  const isParamReplacedByTime = selectedReport 
    ? ['days_back', 'days_inactive', 'days_threshold'].includes(selectedReport.paramKey || '') 
    : false;

  const hasAnyFilter = selectedReport?.supportsCategoryFilter || selectedReport?.supportsStockStatusFilter || selectedReport?.supportsSupplierFilter || selectedReport?.supportsLocationFilter || selectedReport?.supportsSkuFilter;

  return (
    <>
      <Button
        variant="contained"
        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <ExportIcon />}
        onClick={handleClickOpen}
        disabled={loading}
        sx={{
          bgcolor: '#6366f1',
          color: '#fff',
          fontWeight: 600,
          textTransform: 'none',
          boxShadow: '0 4px 6px rgba(99, 102, 241, 0.3)',
          '&:hover': { bgcolor: '#4f46e5' }
        }}
      >
        {loading ? 'Exporting...' : 'Export Reports'}
      </Button>

      {/* Large, Spacious Dialog */}
      <Dialog 
        open={open} 
        onClose={handleClose} 
        maxWidth="lg" 
        fullWidth 
        PaperProps={{ 
          sx: { 
            height: '85vh', 
            maxHeight: 900, 
            borderRadius: 3,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          } 
        }}
      >
        {/* Header */}
        <DialogTitle sx={{ 
          py: 2, px: 3, 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
          bgcolor: 'white', 
          borderBottom: '1px solid #f1f5f9',
          flexShrink: 0 
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ p: 1, bgcolor: '#eef2ff', borderRadius: 2, display: 'flex', color: '#6366f1' }}>
              <ReportIcon fontSize="medium" />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight="800" color="#1e293b">Report Center</Typography>
              <Typography variant="caption" color="text.secondary">Select & Configure Exports</Typography>
            </Box>
          </Box>
          <IconButton onClick={handleClose} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        
        {/* Main Content */}
        <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexGrow: 1 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 4, bgcolor: 'white', flexShrink: 0 }}>
            <Tabs 
              value={tabValue} 
              onChange={(_, v) => { setTabValue(v); setSelectedReport(null); }}
              sx={{ '& .MuiTab-root': { minHeight: 64, fontSize: '1rem', fontWeight: 600 } }}
            >
              <Tab icon={<StockIcon sx={{ mr: 1 }} />} iconPosition="start" label="Current Stock" />
              <Tab icon={<AlertIcon sx={{ mr: 1 }} />} iconPosition="start" label="Health & Alerts" />
              <Tab icon={<MovementIcon sx={{ mr: 1 }} />} iconPosition="start" label="Financials" />
            </Tabs>
          </Box>

          <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
            {/* Left Sidebar */}
            <Box sx={{ 
              width: '320px', flexShrink: 0, borderRight: '1px solid #e2e8f0', 
              overflowY: 'auto', bgcolor: '#f8fafc', p: 2 
            }}>
              <Typography variant="overline" fontWeight="700" color="text.secondary" sx={{ px: 2, mb: 2, display: 'block' }}>
                Available Reports
              </Typography>
              {getCurrentList().map((report) => (
                <Card 
                  key={report.id} 
                  elevation={0} 
                  sx={{ 
                    mb: 2, 
                    border: selectedReport?.id === report.id ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    bgcolor: selectedReport?.id === report.id ? '#ffffff' : 'white',
                    boxShadow: selectedReport?.id === report.id ? '0 4px 12px rgba(99, 102, 241, 0.15)' : 'none',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: '#6366f1', transform: 'translateY(-2px)' }
                  }}
                >
                  <CardActionArea onClick={() => handleSelectReport(report as ReportOption)} sx={{ p: 2.5 }}>
                    <Typography variant="subtitle1" fontWeight="bold" color={selectedReport?.id === report.id ? 'primary.main' : 'text.primary'}>
                      {report.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.3 }}>
                      {report.description}
                    </Typography>
                  </CardActionArea>
                </Card>
              ))}
            </Box>

            {/* Right Configuration Panel */}
            <Box sx={{ flex: 1, p: 5, overflowY: 'auto', display: 'flex', flexDirection: 'column', bgcolor: 'white' }}>
              {!selectedReport ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5 }}>
                  <ReportIcon sx={{ fontSize: 80, mb: 2, color: '#cbd5e1' }} />
                  <Typography variant="h6" color="text.secondary">Select a report from the list to configure</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Box>
                    <Typography variant="h4" fontWeight="bold" gutterBottom color="#1e293b">
                      {selectedReport.title}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                      Configure the parameters below before exporting your data.
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    
                    {/* Format */}
                    <Box>
                      <Typography variant="subtitle2" fontWeight="700" color="text.secondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TuneIcon fontSize="small" /> EXPORT FORMAT
                      </Typography>
                      <ToggleButtonGroup
                        value={format}
                        exclusive
                        onChange={(_, newFormat) => { if (newFormat) setFormat(newFormat); }}
                        fullWidth
                        size="medium"
                        sx={{ mt: 1 }}
                      >
                        <ToggleButton value="csv" sx={{ py: 1.5 }}>
                          <CsvIcon sx={{ mr: 1.5 }} /> CSV (Excel)
                        </ToggleButton>
                        <ToggleButton value="pdf" sx={{ py: 1.5 }}>
                          <PdfIcon sx={{ mr: 1.5 }} /> PDF Document
                        </ToggleButton>
                      </ToggleButtonGroup>
                    </Box>

                    <Divider />

                    {/* Time Filter */}
                    {selectedReport.needsTimeFilter && (
                      <Box>
                        <Typography variant="subtitle2" fontWeight="700" color="text.secondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <DateRangeIcon fontSize="small" /> TIME RANGE
                        </Typography>
                        <TextField
                          select
                          fullWidth
                          value={timeRange}
                          onChange={(e) => setTimeRange(e.target.value)}
                          sx={{ mt: 1 }}
                        >
                          {TIME_RANGES.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </TextField>
                        
                        {timeRange === 'custom' && (
                          <Box sx={{ display: 'flex', gap: 3, mt: 3 }}>
                            <TextField
                              label="Start Date"
                              type="date"
                              fullWidth
                              InputLabelProps={{ shrink: true }}
                              value={customStartDate}
                              onChange={(e) => setCustomStartDate(e.target.value)}
                            />
                            <TextField
                              label="End Date"
                              type="date"
                              fullWidth
                              InputLabelProps={{ shrink: true }}
                              value={customEndDate}
                              onChange={(e) => setCustomEndDate(e.target.value)}
                            />
                          </Box>
                        )}
                      </Box>
                    )}

                    {/* Unified Data Filters Section */}
                    {hasAnyFilter && (
                      <Box>
                        <Typography variant="subtitle2" fontWeight="700" color="text.secondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <FilterIcon fontSize="small" /> DATA FILTERS
                        </Typography>
                        
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 3, mt: 1 }}>
                           {/* SKU Filter as Select */}
                           {selectedReport.supportsSkuFilter && (
                             <Autocomplete
                               disablePortal
                               id="combo-box-sku"
                               options={skuOptions}
                               // What to show in the list and input box
                               getOptionLabel={(option) => `${option.sku} - ${option.name}`} 
                               // How to handle the selection
                               onChange={(_event, newValue) => {
                                 setSkuFilter(newValue ? newValue.sku : '');
                               }}
                               // renderInput is required by MUI Autocomplete
                               renderInput={(params) => (
                                 <TextField {...params} label="Search Product or SKU" />
                               )}
                               // Optional: improved styling to match other inputs
                               sx={{ width: '100%' }}
                             />
                           )}

                           {selectedReport.supportsLocationFilter && (
                              <FormControl fullWidth>
                                <InputLabel>Location</InputLabel>
                                <Select
                                  value={locationFilter}
                                  label="Location"
                                  onChange={(e) => setLocationFilter(e.target.value)}
                                >
                                  <MenuItem value=""><em>All Locations</em></MenuItem>
                                  {locationOptions.map((loc) => (
                                    <MenuItem key={loc} value={loc}>{loc}</MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                           )}

                           {selectedReport.supportsCategoryFilter && (
                              <FormControl fullWidth>
                                <InputLabel>Category</InputLabel>
                                <Select
                                  value={categoryFilter}
                                  label="Category"
                                  onChange={(e) => setCategoryFilter(e.target.value)}
                                >
                                  <MenuItem value=""><em>All Categories</em></MenuItem>
                                  {categoryOptions.map((cat) => (
                                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                           )}
                           
                           {selectedReport.supportsSupplierFilter && (
                              <FormControl fullWidth>
                                <InputLabel>Supplier</InputLabel>
                                <Select
                                  value={supplierFilter}
                                  label="Supplier"
                                  onChange={(e) => setSupplierFilter(e.target.value)}
                                >
                                  <MenuItem value=""><em>All Suppliers</em></MenuItem>
                                  {supplierOptions.map((sup) => (
                                    <MenuItem key={sup} value={sup}>{sup}</MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                           )}

                           {selectedReport.supportsStockStatusFilter && (
                              <FormControl fullWidth>
                                <InputLabel>Stock Status</InputLabel>
                                <Select
                                  value={stockStatusFilter}
                                  label="Stock Status"
                                  onChange={(e) => setStockStatusFilter(e.target.value)}
                                >
                                  {STOCK_STATUS_OPTIONS.map((opt) => (
                                    <MenuItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                           )}
                        </Box>
                      </Box>
                    )}
                    {/* TOGGLES SECTION (Blind Mode) */}
                    {selectedReport.supportsBlindMode && (
                      <Box sx={{ p: 2, bgcolor: '#fff7ed', borderRadius: 2, border: '1px solid #ffedd5' }}>
                        <Typography variant="subtitle2" fontWeight="700" color="#c2410c" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                           <AlertIcon fontSize="small" /> SPECIAL MODES
                        </Typography>
                        <FormGroup>
                          <FormControlLabel 
                            control={
                              <Switch 
                                checked={blindMode} 
                                onChange={(e) => setBlindMode(e.target.checked)} 
                                color="warning"
                              />
                            } 
                            label={
                              <Box>
                                <Typography variant="body2" fontWeight="bold">Enable Blind Count Mode</Typography>
                                <Typography variant="caption" color="text.secondary">Hides system quantities to force manual counting.</Typography>
                              </Box>
                            } 
                          />
                        </FormGroup>
                      </Box>
                    )}
                    {/* Numeric Params */}
                    {selectedReport.needsParams && !isParamReplacedByTime && (
                      <Box>
                        <Typography variant="subtitle2" fontWeight="700" color="text.secondary" gutterBottom>
                          SPECIFIC PARAMETERS
                        </Typography>
                        <TextField
                          label={selectedReport.paramLabel}
                          type="number"
                          value={paramValue}
                          onChange={(e) => setParamValue(e.target.value)}
                          fullWidth
                          helperText={`Default: ${selectedReport.defaultParamValue}`}
                          sx={{ mt: 1 }}
                        />
                      </Box>
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        </DialogContent>
        
        {/* Footer */}
        <DialogActions sx={{ borderTop: '1px solid #e2e8f0', p: 3, bgcolor: '#f8fafc', justifyContent: 'flex-end' }}>
          {selectedReport ? (
            <Button 
              variant="contained" 
              fullWidth 
              size="large"
              onClick={handleExport}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={24} color="inherit"/> : <ExportIcon />}
              sx={{ 
                bgcolor: '#6366f1', 
                fontWeight: 'bold', 
                fontSize: '1.1rem', 
                py: 1.5, 
                maxWidth: '400px',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                '&:hover': { bgcolor: '#4f46e5', boxShadow: '0 6px 20px rgba(99, 102, 241, 0.6)' } 
              }}
            >
              {loading ? 'Generating Report...' : `Download ${format.toUpperCase()} Report`}
            </Button>
          ) : (
            <Button disabled size="large">Select a Report to Download</Button>
          )}
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};