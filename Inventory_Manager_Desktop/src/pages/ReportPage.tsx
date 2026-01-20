import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Box, Typography, Button, TextField, 
  CircularProgress, Alert, Card, CardContent,
  Paper, Autocomplete, Stack, IconButton, Collapse, 
  MenuItem, Select, FormControl, InputLabel,
  InputAdornment, Popover
} from '@mui/material';
import { 
  FilterList as FilterIcon, 
  BarChart, 
  Warning as AlertTriangle, 
  TrendingUp, 
  AccessTime as Clock,
  Inventory2 as Package, 
  Search as SearchIcon, 
  AttachMoney as DollarSign,
  Assessment as ReportIcon,
  PictureAsPdf as PdfIcon,
  TableChart as CsvIcon,
  KeyboardArrowUp,
  KeyboardArrowDown,
  CalendarToday,
  Cached as ReloadIcon, 
  ChevronLeft,
  ChevronRight,
  ArrowDropDown,
  ArrowDropUp,
  OpenInNew as OpenInNewIcon 
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';

// --- DATE PICKER IMPORTS ---
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

// FIX 1: Import type specifically to satisfy verbatimModuleSyntax
import type { PickersCalendarHeaderProps } from '@mui/x-date-pickers/PickersCalendarHeader';

// FIX 2: Split value import from type import
import dayjs from 'dayjs';
import type { ManipulateType } from 'dayjs';

import client from '../api/client'; 

// --- TYPES ---
interface ReportDefinition {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  endpoint: string;
  needsTimeFilter?: boolean;
  supportsCategoryFilter?: boolean;
  supportsLocationFilter?: boolean;
  supportsSupplierFilter?: boolean;
  supportsStockStatusFilter?: boolean;
  supportsSkuFilter?: boolean;
  needsParams?: boolean;
  paramLabel?: string;
  paramKey?: string;
  defaultParamValue?: string;
}

interface FilterOption {
  id: number;
  name: string;
}

interface ProductOption {
  id: number;
  name: string;
  sku: string;
  category?: string;
}

// --- 1. CUSTOM HEADER COMPONENT (Spinner + Scroll) ---
// FIX 3: Removed generic <unknown> as it causes TS2315 in newer MUI versions
function CustomCalendarHeader(props: PickersCalendarHeaderProps) {
  const { currentMonth, onMonthChange } = props;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  const adjustDate = (unit: ManipulateType, amount: number) => {
    // FIX 4: Cast currentMonth to any/Date so dayjs accepts it
    const newDate = dayjs(currentMonth as any).add(amount, unit);
    // FIX 5: onMonthChange only accepts one argument (the new date)
    onMonthChange(newDate as any);
  };

  const handleWheel = (unit: ManipulateType, e: React.WheelEvent) => {
    if (e.deltaY < 0) {
      adjustDate(unit, 1);
    } else {
      adjustDate(unit, -1);
    }
  };

  const selectPreviousMonth = () => adjustDate('month' as ManipulateType, -1);
  const selectNextMonth = () => adjustDate('month' as ManipulateType, 1);

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
        {dayjs(currentMonth as any).format('MMMM YYYY')}
      </Button>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        PaperProps={{ 
          sx: { 
            p: 2, mt: 1, width: 280, borderRadius: 3, 
            boxShadow: '0px 4px 20px rgba(0,0,0,0.15)'
          } 
        }}
      >
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          
          {/* MONTH CONTROLS */}
          <Box 
            sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, cursor: 'ns-resize', p: 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' }}}
            onWheel={(e) => handleWheel('month' as ManipulateType, e)}
          >
            <Typography variant="caption" color="text.secondary" fontWeight="bold">MONTH</Typography>
            <IconButton size="small" onClick={() => adjustDate('month' as ManipulateType, 1)}><KeyboardArrowUp /></IconButton>
            <Typography variant="body1" fontWeight="bold" sx={{ minWidth: 80, textAlign: 'center' }}>{dayjs(currentMonth as any).format('MMM')}</Typography>
            <IconButton size="small" onClick={() => adjustDate('month' as ManipulateType, -1)}><KeyboardArrowDown /></IconButton>
          </Box>

          {/* YEAR CONTROLS */}
          <Box 
            sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, cursor: 'ns-resize', p: 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' }}}
            onWheel={(e) => handleWheel('year' as ManipulateType, e)}
          >
            <Typography variant="caption" color="text.secondary" fontWeight="bold">YEAR</Typography>
            <IconButton size="small" onClick={() => adjustDate('year' as ManipulateType, 1)}><KeyboardArrowUp /></IconButton>
            <Typography variant="body1" fontWeight="bold">{dayjs(currentMonth as any).format('YYYY')}</Typography>
            <IconButton size="small" onClick={() => adjustDate('year' as ManipulateType, -1)}><KeyboardArrowDown /></IconButton>
          </Box>

        </Box>
      </Popover>

      <IconButton onClick={selectNextMonth} size="small">
        <ChevronRight />
      </IconButton>
    </Box>
  );
}

// --- CONFIGURATION ---
const REPORT_CATEGORIES: Record<string, ReportDefinition[]> = {
  stock: [
    {
      id: 'stock_summary',
      title: 'Stock Valuation',
      description: 'Complete inventory valuation with cost and selling prices',
      icon: <BarChart fontSize="medium" />,
      endpoint: 'reports/stock_summary',
      needsTimeFilter: true,
      supportsCategoryFilter: true,
      supportsSupplierFilter: true,
      supportsStockStatusFilter: true
    },
    {
      id: 'location_summary',
      title: 'Location Summary',
      description: 'Stock distribution across warehouses and stores',
      icon: <Package fontSize="medium" />,
      endpoint: 'reports/location_summary',
      needsTimeFilter: true,
      supportsLocationFilter: true
    },
    {
      id: 'batch_wise',
      title: 'Batch History',
      description: 'Detailed batch-wise stock levels and expiry dates',
      icon: <Clock fontSize="medium" />,
      endpoint: 'reports/batch_wise_stock',
      needsTimeFilter: true,
      supportsSupplierFilter: true
    },
    {
      id: 'physical_audit',
      title: 'Physical Stock Register',
      description: 'Audit sheet for physical stock taking',
      icon: <ReportIcon fontSize="medium" />,
      endpoint: 'reports/physical_stock_register',
      needsTimeFilter: true,
      supportsLocationFilter: true,
      supportsCategoryFilter: true,
      needsParams: true,
      paramLabel: 'Blind Mode (true/false)', 
      paramKey: 'blind_mode',
      defaultParamValue: 'false'
    }
  ],
  health: [
    {
      id: 'near_expiry',
      title: 'Near Expiry',
      description: 'Products expiring within specified timeframe',
      icon: <AlertTriangle fontSize="medium" />,
      endpoint: 'reports/near_expiry',
      needsParams: true,
      paramLabel: 'Days Threshold',
      paramKey: 'days_threshold',
      defaultParamValue: '30',
      needsTimeFilter: true,
      supportsCategoryFilter: true,
      supportsLocationFilter: true
    },
    {
      id: 'stock_ageing',
      title: 'Stock Ageing',
      description: 'Ageing analysis (<30, 30-60, >60 days)',
      icon: <Clock fontSize="medium" />,
      endpoint: 'reports/stock_ageing',
      needsTimeFilter: false, 
      supportsCategoryFilter: true,
      supportsLocationFilter: true,
      supportsSupplierFilter: true
    },
    {
      id: 'overstock_dormant',
      title: 'Dormant Stock',
      description: 'Slow-moving items with no recent activity',
      icon: <Package fontSize="medium" />,
      endpoint: 'reports/overstock_dormant',
      needsParams: true,
      paramLabel: 'Days Inactive',
      paramKey: 'days_inactive',
      defaultParamValue: '90',
      needsTimeFilter: true,
      supportsCategoryFilter: true,
      supportsLocationFilter: true
    },
    {
      id: 'low_stock',
      title: 'Low Stock & Reorder',
      description: 'Items below reorder point',
      icon: <AlertTriangle fontSize="medium" />,
      endpoint: 'reports/low_stock_reorder',
      needsParams: true,
      paramLabel: 'Reorder Threshold',
      paramKey: 'reorder_threshold',
      defaultParamValue: '20',
      needsTimeFilter: false, 
      supportsLocationFilter: true,
      supportsSupplierFilter: true
    }
  ],
  financial: [
    {
      id: 'item_profitability',
      title: 'Profitability',
      description: 'Profit margins and revenue analysis per product',
      icon: <DollarSign fontSize="medium" />,
      endpoint: 'reports/item_profitability',
      needsTimeFilter: true,
      supportsCategoryFilter: true,
      supportsSupplierFilter: true
    },
    {
      id: 'supplier_performance',
      title: 'Supplier Performance',
      description: 'Purchase volume and reliability by supplier',
      icon: <TrendingUp fontSize="medium" />,
      endpoint: 'reports/supplier_performance',
      needsTimeFilter: true,
      supportsCategoryFilter: true
    },
    {
      id: 'daily_transactions',
      title: 'Daily Register',
      description: 'Complete audit trail of all stock transactions',
      icon: <ReportIcon fontSize="medium" />,
      endpoint: 'reports/daily_transactions',
      needsTimeFilter: true,
      needsParams: true,
      paramLabel: 'User',
      paramKey: 'username',
      defaultParamValue: '',
      supportsSkuFilter: true
    },
    {
      id: 'top_selling',
      title: 'Stock Movement',
      description: 'Fast vs Slow moving analysis',
      icon: <TrendingUp fontSize="medium" />,
      endpoint: 'reports/stock_movement',
      needsTimeFilter: true, 
      supportsCategoryFilter: true
    }
  ]
};

const ReportPage = () => {
  // --- STATE ---
  const [selectedCategory, setSelectedCategory] = useState('stock');
  const [selectedReport, setSelectedReport] = useState<ReportDefinition>(REPORT_CATEGORIES.stock[0]);
  
  // Time Period State
  const [timePreset, setTimePreset] = useState('all'); 
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  
  // DATE PICKER OPEN STATES
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);

  // Filter States
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [categoryInputValue, setCategoryInputValue] = useState(''); 
  const [locationFilter, setLocationFilter] = useState<FilterOption | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<FilterOption | null>(null);
  const [skuFilter, setSkuFilter] = useState<ProductOption | null>(null);
  const [stockStatusFilter, setStockStatusFilter] = useState('all');
  const [customParam, setCustomParam] = useState('');
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  // Data Sources
  const [locationOptions, setLocationOptions] = useState<FilterOption[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<FilterOption[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);

  // UI States
  const [previewData, setPreviewData] = useState<Record<string, unknown>[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  // --- REF FOR SCROLLING ---
  const previewRef = useRef<HTMLDivElement>(null);

  const scrollToPreview = () => {
    if (previewRef.current) {
      previewRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // --- 1. FETCH OPTIONS ON MOUNT ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('user_token');
        const headers = { Authorization: `Bearer ${token}` };
        
        // Parallel fetch for options
        const [locRes, supRes, prodRes] = await Promise.allSettled([
          client.get('/api/v1/inventory/locations', { headers }),
          client.get('/api/v1/suppliers', { headers }),
          client.get('/api/v1/products', { headers })
        ]);

        if (locRes.status === 'fulfilled') setLocationOptions(locRes.value.data || []);
        if (supRes.status === 'fulfilled') setSupplierOptions(supRes.value.data || []);
        if (prodRes.status === 'fulfilled') setProductOptions(prodRes.value.data || []);
      } catch (err) {
        console.warn("Failed to fetch filter options", err);
      }
    };
    fetchData();
  }, []);

  const categoryOptions = useMemo(() => {
    const uniqueCats = new Set(productOptions.map(p => p.category).filter(Boolean));
    return Array.from(uniqueCats).sort() as string[];
  }, [productOptions]);

  // --- 2. CORE FETCH FUNCTION ---
  const executeFetch = async (params: Record<string, unknown>) => {
    setLoadingPreview(true);
    setError(null);
    try {
      const token = localStorage.getItem('user_token');
      const response = await client.get(`/api/v1/${selectedReport.endpoint}`, { 
        params,
        headers: { Authorization: `Bearer ${token}` } 
      });

      if (Array.isArray(response.data)) {
        setPreviewData(response.data);
      } else if (response.data && Array.isArray(response.data.data)) {
        setPreviewData(response.data.data);
      } else {
        setPreviewData([]);
      }
    } catch (err) {
      console.error("Fetch failed:", err);
      setError("Failed to load report data. Please check connection.");
      setPreviewData([]);
    } finally {
      setLoadingPreview(false);
    }
  };

  // --- FILTER LOGIC (CLIENT SIDE) ---
  const filteredData = useMemo(() => {
    if (!searchTerm) return previewData;
    const lowerTerm = searchTerm.toLowerCase();
    
    return previewData.filter(row => {
      return Object.values(row).some(value => {
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(lowerTerm);
      });
    });
  }, [previewData, searchTerm]);

  // --- 3. HELPER: BUILD PARAMS ---
  const getQueryParams = (formatType: string) => {
    const params: Record<string, unknown> = { format: formatType };
    const filterParts: string[] = [];

    // Time Filters
    if (selectedReport.needsTimeFilter) {
      if (timePreset !== 'all') {
        params.start_date = dateRange.start;
        params.end_date = dateRange.end;
        
        if (timePreset === 'custom') {
            filterParts.push(`Date Range: ${dateRange.start} to ${dateRange.end}`);
        } else {
             const presetMap: Record<string, string> = { '1w': 'Last 1 Week', '2w': 'Last 2 Weeks', '1m': 'Last 1 Month', '3m': 'Last 3 Months', '6m': 'Last 6 Months', '12m': 'Last 1 Year' };
             filterParts.push(`Time Period: ${presetMap[timePreset] || timePreset}`);
        }
        
        if (dateRange.start && selectedReport.paramKey === 'days_back') {
          const start = dayjs(dateRange.start);
          const now = dayjs();
          const daysDiff = now.diff(start, 'day');
          params.days_back = daysDiff; 
        }
      } else if (timePreset === 'all') {
        if (selectedReport.paramKey === 'days_back') params.days_back = 3650; 
      }
    }

    // Other Filters
    if (selectedReport.supportsCategoryFilter && categoryFilter) {
        params.category = categoryFilter;
        filterParts.push(`Category: ${categoryFilter}`);
    }
    if (selectedReport.supportsLocationFilter && locationFilter) {
        params.location = locationFilter.name;
        filterParts.push(`Location: ${locationFilter.name}`);
    }
    if (selectedReport.supportsSupplierFilter && supplierFilter) {
        params.supplier = supplierFilter.name;
        filterParts.push(`Supplier: ${supplierFilter.name}`);
    }
    if (selectedReport.supportsSkuFilter && skuFilter) {
        // skuFilter is now guaranteed to be an object due to onChange logic, but we handle safe access
        params.sku = skuFilter.sku;
        filterParts.push(`SKU: ${skuFilter.sku}`);
    }
    if (selectedReport.supportsStockStatusFilter && stockStatusFilter !== 'all') {
        params.stock_status = stockStatusFilter;
        filterParts.push(`Status: ${stockStatusFilter === 'in_stock' ? 'In Stock' : 'Out of Stock'}`);
    }
    
    // Custom Param
    if (selectedReport.needsParams && customParam && selectedReport.paramKey !== 'days_back') {
      if (selectedReport.paramKey) {
          params[selectedReport.paramKey] = customParam;
          if (customParam !== selectedReport.defaultParamValue) {
               filterParts.push(`${selectedReport.paramLabel}: ${customParam}`);
          }
      }
    }
    
    if (filterParts.length > 0) {
        params.filter_summary = filterParts.join(' | ');
    }

    return params;
  };

  const handleApplyFilters = () => {
    const params = getQueryParams('json');
    executeFetch(params);
    setTimeout(() => {
      scrollToPreview();
    }, 100);
  };

  // --- SMART CELL FORMATTER ---
  // --- SMART CELL FORMATTER (FIXED) ---
  const formatCellValue = (key: string, value: any) => {
    if (value === null || value === undefined) return '-';
    
    const stringVal = String(value);
    const keyLower = key.toLowerCase();

    // 1. Currency
    if (keyLower.includes('price') || keyLower.includes('cost') || keyLower.includes('value') || keyLower.includes('valuation') || keyLower.includes('amount') || keyLower.includes('revenue')) {
       if (!keyLower.includes('id') && !isNaN(Number(value))) {
           return `₹${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
       }
    }

    // 2. Percentages
    if ((keyLower.includes('percent') || keyLower.includes('margin percent')) && !keyLower.includes('amount')) {
        if (!isNaN(Number(value))) return `${value}%`;
    }

    // 3. Dates (FIXED LOGIC)
    // Only treat as date if it has 'date' or ENDS with '_at' (like created_at)
    // This prevents 'Location' or 'Batch' from being treated as dates.
    const isDateCol = keyLower.includes('date') || keyLower.endsWith('_at') || keyLower === 'timestamp';
    
    if (isDateCol && !keyLower.includes('update')) {
        // Extra check: Value must look like a date (long enough, contains delimiters)
        if (stringVal.length >= 10 && (stringVal.includes('-') || stringVal.includes('/'))) {
            const date = new Date(stringVal);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString();
            }
        }
    }

    return stringVal;
  };

  // --- EXPAND VIEW FUNCTION ---
  const handleExpandView = () => {
    const newWindow = window.open('', '_blank');
    if (!newWindow) {
      alert('Please allow popups to view the expanded report.');
      return;
    }

    const title = selectedReport.title;
    const date = new Date().toLocaleString();
    const params = getQueryParams('json');
    const filterSummary = params.filter_summary ? `<div class="filters"><strong>Active Filters:</strong> ${params.filter_summary}</div>` : '';

    let tableHtml = '<table style="width:100%; border-collapse: collapse; font-family: sans-serif; font-size: 14px;">';
    
    // Header
    tableHtml += '<thead><tr style="background-color: #f1f5f9; color: #475569; text-align: left;">';
    if (filteredData.length > 0) {
        Object.keys(filteredData[0]).forEach(key => {
            tableHtml += `<th style="padding: 12px; border-bottom: 2px solid #e2e8f0; text-transform: capitalize;">${key.replace(/_/g, ' ')}</th>`;
        });
    }
    tableHtml += '</tr></thead>';

    // Body
    tableHtml += '<tbody>';
    filteredData.forEach((row, idx) => {
        tableHtml += `<tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0;">`;
        Object.keys(row).forEach(key => {
             const displayVal = formatCellValue(key, row[key]); 
             tableHtml += `<td style="padding: 12px; color: #334155;">${displayVal}</td>`;
        });
        tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table>';

    const content = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title} - Expanded View</title>
            <style>
                body { font-family: 'Inter', system-ui, -apple-system, sans-serif; padding: 40px; color: #1e293b; max-width: 1200px; margin: 0 auto; }
                h1 { margin-bottom: 8px; font-size: 24px; font-weight: 700; }
                .meta { color: #64748b; margin-bottom: 8px; font-size: 14px; }
                .filters { color: #334155; margin-bottom: 32px; font-size: 14px; padding: 8px 12px; background: #f1f5f9; border-radius: 4px; display: inline-block; }
                @media print {
                    body { padding: 0; max-width: none; }
                    table { page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                }
            </style>
        </head>
        <body>
            <h1>${title}</h1>
            <div class="meta">Generated on: ${date}</div>
            ${filterSummary}
            ${tableHtml}
        </body>
        </html>
    `;

    newWindow.document.write(content);
    newWindow.document.close();
  };

  // --- 4. AUTO-FETCH & RESET ON REPORT CHANGE ---
  useEffect(() => {
    if (selectedReport.needsParams) {
      setCustomParam(selectedReport.defaultParamValue || '');
    } else {
      setCustomParam('');
    }
    setSearchTerm(''); 
    clearFilters(false); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedReport]);


  // --- 5. HANDLE TIME PRESET CHANGE ---
  const handleTimePresetChange = (preset: string) => {
    setTimePreset(preset);
    
    if (preset === 'custom' || preset === 'all') {
      if (preset === 'all') setDateRange({ start: '', end: '' });
      return;
    }

    const today = dayjs();
    let startDate = dayjs();

    switch (preset) {
      case '1w': startDate = today.subtract(1, 'week'); break;
      case '2w': startDate = today.subtract(2, 'week'); break;
      case '1m': startDate = today.subtract(1, 'month'); break;
      case '3m': startDate = today.subtract(3, 'month'); break;
      case '6m': startDate = today.subtract(6, 'month'); break;
      case '12m': startDate = today.subtract(1, 'year'); break;
    }

    setDateRange({
      start: startDate.format('YYYY-MM-DD'),
      end: today.format('YYYY-MM-DD')
    });
  };

  // --- 6. DOWNLOAD ---
  const handleDownload = async (format: string) => {
    setDownloading(true);
    try {
      const params = getQueryParams(format);
      const token = localStorage.getItem('user_token');
      
      const response = await client.get(`/api/v1/${selectedReport.endpoint}`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const dateStr = format === 'pdf' ? new Date().toISOString().split('T')[0] : '';
      link.setAttribute('download', `${selectedReport.id}_${dateStr}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      setError("Failed to download file.");
    } finally {
      setDownloading(false);
    }
  };

  // --- 7. CLEAR FILTERS & AUTO-REFETCH ---
  const clearFilters = (shouldScroll = true) => {
    setTimePreset('all');
    setDateRange({ start: '', end: '' });
    
    setCategoryFilter(null);
    setCategoryInputValue(''); 

    setLocationFilter(null);
    setSupplierFilter(null);
    setSkuFilter(null);
    setStockStatusFilter('all');
    setCustomParam(selectedReport.defaultParamValue || '');
    setSearchTerm(''); 

    const defaultParams: Record<string, unknown> = { format: 'json' };

    if (selectedReport.needsTimeFilter) {
      if (selectedReport.paramKey === 'days_back') defaultParams.days_back = 3650;
    }

    if (selectedReport.needsParams && selectedReport.defaultParamValue) {
      if (selectedReport.paramKey && selectedReport.paramKey !== 'days_back') {
        defaultParams[selectedReport.paramKey] = selectedReport.defaultParamValue;
      }
    }

    executeFetch(defaultParams);
    
    if (shouldScroll) {
      setTimeout(() => {
        scrollToPreview();
      }, 100);
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ p: 2, bgcolor: '#f8fafc', minHeight: '100vh' }}>
        
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" alignItems="center" spacing={2}>
             <Box sx={{
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              borderRadius: '16px',
              p: 1.5,
              color: 'white',
              boxShadow: '0 8px 16px rgba(99, 102, 241, 0.25)'
            }}>
              <ReportIcon sx={{ fontSize: 32 }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#1e293b' }}>
                Reports & Analytics
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Generate comprehensive insights and export data
              </Typography>
            </Box>
          </Stack>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '320px 1fr' }, gap: 2 }}>
          
          {/* SIDEBAR */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Paper sx={{ p: 2, borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
              <Box sx={{ display: 'flex', gap: 1, mb: 2, bgcolor: '#f1f5f9', p: 0.75, borderRadius: 2 }}>
                {(Object.keys(REPORT_CATEGORIES)).map((cat) => (
                  <Button
                    key={cat}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setSelectedReport(REPORT_CATEGORIES[cat][0]);
                    }}
                    fullWidth
                    size="small"
                    sx={{
                      borderRadius: 1.5,
                      textTransform: 'capitalize',
                      fontWeight: 600,
                      bgcolor: selectedCategory === cat ? 'white' : 'transparent',
                      color: selectedCategory === cat ? 'primary.main' : 'text.secondary',
                      boxShadow: selectedCategory === cat ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                  >
                    {cat}
                  </Button>
                ))}
              </Box>

              <Stack spacing={1}>
                {REPORT_CATEGORIES[selectedCategory].map((report: ReportDefinition) => (
                  <Card
                    key={report.id}
                    onClick={() => setSelectedReport(report)}
                    elevation={0}
                    sx={{
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: selectedReport.id === report.id ? 'primary.main' : 'transparent',
                      bgcolor: selectedReport.id === report.id ? alpha('#6366f1', 0.04) : 'transparent',
                      transition: 'all 0.2s',
                      '&:hover': { bgcolor: alpha('#6366f1', 0.04) }
                    }}
                  >
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Box sx={{ color: selectedReport.id === report.id ? 'primary.main' : 'text.secondary', display: 'flex' }}>
                          {report.icon}
                        </Box>
                        <Box>
                          <Typography variant="subtitle2" fontWeight="bold" color={selectedReport.id === report.id ? 'primary.main' : 'text.primary'}>
                            {report.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, mt: 0.5 }}>
                            {report.description}
                          </Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            </Paper>
          </Box>

          {/* FILTERS & PREVIEW */}
          <Stack spacing={2}>
            <Paper sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none', overflow: 'hidden' }}>
              <Box sx={{ p: 2, pb: showFilters ? 0 : 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <FilterIcon color="primary" />
                    <Typography variant="h6" fontWeight="700">Filter Data</Typography>
                  </Stack>
                  <IconButton onClick={() => setShowFilters(!showFilters)} size="small">
                    {showFilters ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                  </IconButton>
                </Stack>
              </Box>
              
              <Collapse in={showFilters}>
                <Box sx={{ p: 2, pt: 3 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 2 }}>
                    
                    {/* TIME PERIOD */}
                    {selectedReport.needsTimeFilter && (
                      <FormControl size="small" fullWidth>
                        <InputLabel>Time Period</InputLabel>
                        <Select
                          value={timePreset}
                          label="Time Period"
                          onChange={(e) => handleTimePresetChange(e.target.value)}
                          startAdornment={<InputAdornment position="start"><CalendarToday fontSize="small" /></InputAdornment>}
                        >
                          <MenuItem value="all">Full History (Default)</MenuItem>
                          <MenuItem value="1w">Last 1 Week</MenuItem>
                          <MenuItem value="2w">Last 2 Weeks</MenuItem>
                          <MenuItem value="1m">Last 1 Month</MenuItem>
                          <MenuItem value="3m">Last 3 Months</MenuItem>
                          <MenuItem value="6m">Last 6 Months</MenuItem>
                          <MenuItem value="12m">Last 1 Year</MenuItem>
                          <MenuItem value="custom">Custom Date Range</MenuItem>
                        </Select>
                      </FormControl>
                    )}

                    {/* CUSTOM DATES */}
                    {selectedReport.needsTimeFilter && timePreset === 'custom' && (
                      <>
                        <DatePicker
                          label="Start Date"
                          value={dateRange.start ? dayjs(dateRange.start) : null}
                          onChange={(newValue) => setDateRange({
                            ...dateRange, 
                            start: newValue ? newValue.format('YYYY-MM-DD') : ''
                          })}
                          open={startPickerOpen}
                          onClose={() => setStartPickerOpen(false)}
                          onOpen={() => setStartPickerOpen(true)}
                          slots={{ calendarHeader: CustomCalendarHeader }} 
                          slotProps={{ textField: { size: 'small', fullWidth: true, onClick: () => setStartPickerOpen(true) }}}
                        />
                        <DatePicker
                          label="End Date"
                          value={dateRange.end ? dayjs(dateRange.end) : null}
                          onChange={(newValue) => setDateRange({
                            ...dateRange, 
                            end: newValue ? newValue.format('YYYY-MM-DD') : ''
                          })}
                          open={endPickerOpen}
                          onClose={() => setEndPickerOpen(false)}
                          onOpen={() => setEndPickerOpen(true)}
                          slots={{ calendarHeader: CustomCalendarHeader }} 
                          slotProps={{ textField: { size: 'small', fullWidth: true, onClick: () => setEndPickerOpen(true) }}}
                        />
                      </>
                    )}

                    {/* CUSTOM PARAM */}
                    {selectedReport.needsParams && selectedReport.paramKey !== 'days_back' && (
                      <TextField
                        label={selectedReport.paramLabel}
                        size="small"
                        value={customParam}
                        onChange={e => setCustomParam(e.target.value)}
                        placeholder={selectedReport.defaultParamValue}
                      />
                    )}

                    {selectedReport.supportsCategoryFilter && (
                      <Autocomplete
                        options={categoryOptions}
                        value={categoryFilter}
                        onChange={(_, newValue) => setCategoryFilter(newValue)}
                        inputValue={categoryInputValue}
                        onInputChange={(_, newInputValue) => setCategoryInputValue(newInputValue)}
                        freeSolo 
                        renderInput={(params) => (
                          <TextField {...params} label="Category" size="small" placeholder="All Categories" />
                        )}
                      />
                    )}

                    {selectedReport.supportsLocationFilter && (
                      <Autocomplete
                        options={locationOptions}
                        getOptionLabel={(option) => option.name || ''}
                        value={locationFilter}
                        onChange={(_, newValue) => setLocationFilter(newValue)}
                        renderInput={(params) => (
                          <TextField {...params} label="Location" size="small" placeholder="All Locations" />
                        )}
                      />
                    )}

                    {selectedReport.supportsSupplierFilter && (
                      <Autocomplete
                        options={supplierOptions}
                        getOptionLabel={(option) => option.name || ''}
                        value={supplierFilter}
                        onChange={(_, newValue) => setSupplierFilter(newValue)}
                        renderInput={(params) => (
                          <TextField {...params} label="Supplier" size="small" placeholder="All Suppliers" />
                        )}
                      />
                    )}

                    {/* FIX 6: Updated SKU Filter with logic to handle string vs object */}
                    {selectedReport.supportsSkuFilter && (
                      <Autocomplete
                        options={productOptions}
                        getOptionLabel={(option) => typeof option === 'string' ? option : `${option.name} (${option.sku})`}
                        value={skuFilter}
                        onChange={(_, newValue) => {
                            // Logic: If user types random string (freeSolo), set null. If they pick an option, set it.
                            if (typeof newValue === 'string') {
                                setSkuFilter(null);
                            } else {
                                setSkuFilter(newValue);
                            }
                        }}
                        freeSolo
                        renderInput={(params) => (
                          <TextField {...params} label="Search Product / SKU" size="small" />
                        )}
                      />
                    )}

                    {selectedReport.supportsStockStatusFilter && (
                      <FormControl size="small">
                        <InputLabel>Stock Status</InputLabel>
                        <Select
                          value={stockStatusFilter}
                          label="Stock Status"
                          onChange={(e) => setStockStatusFilter(e.target.value)}
                        >
                          <MenuItem value="all">All Items</MenuItem>
                          <MenuItem value="in_stock">In Stock (&gt; 0)</MenuItem>
                          <MenuItem value="out_of_stock">Out of Stock (= 0)</MenuItem>
                        </Select>
                      </FormControl>
                    )}
                  </Box>

                  <Stack direction="row" justifyContent="flex-end" spacing={2}>
                    <Button onClick={() => clearFilters(true)} color="inherit">Clear Filters</Button>
                    <Button 
                      variant="contained" 
                      onClick={handleApplyFilters} 
                      disabled={loadingPreview}
                      startIcon={loadingPreview ? <ReloadIcon className="animate-spin" /> : <SearchIcon />}
                      sx={{ px: 4, bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
                    >
                      Apply Filters
                    </Button>
                  </Stack>
                </Box>
              </Collapse>
            </Paper>

            {/* PREVIEW PANEL */}
            <Paper 
              ref={previewRef}
              sx={{ p: 2, borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none', minHeight: 400 }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={2}>
                <Box>
                  <Typography variant="h6" fontWeight="700">Report Preview</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {loadingPreview 
                      ? 'Updating data...' 
                      : previewData.length > 0 
                        ? `Showing ${filteredData.length} records` 
                        : 'No data found for current filters'
                    }
                  </Typography>
                </Box>

                <TextField
                  placeholder="Search items..."
                  size="small"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" color="action" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ bgcolor: 'white', minWidth: 220 }}
                />

                <Stack direction="row" spacing={2}>
                  <Button 
                    variant="outlined"
                    onClick={handleExpandView}
                    disabled={filteredData.length === 0}
                    startIcon={<OpenInNewIcon />}
                    sx={{ borderColor: '#e2e8f0', color: '#64748b', '&:hover': { borderColor: '#cbd5e1', bgcolor: '#f8fafc' } }}
                  >
                    Expand
                  </Button>

                  <Button 
                    variant="outlined"
                    onClick={handleApplyFilters}
                    disabled={loadingPreview}
                    startIcon={<ReloadIcon className={loadingPreview ? "animate-spin" : ""} />}
                    sx={{ borderColor: '#e2e8f0', color: '#64748b', '&:hover': { borderColor: '#cbd5e1', bgcolor: '#f8fafc' } }}
                  >
                    Refresh
                  </Button>

                  <Button 
                    variant="contained"
                    onClick={() => handleDownload('csv')} 
                    disabled={downloading || previewData.length === 0}
                    startIcon={<CsvIcon />}
                    sx={{ bgcolor: '#3b82f6', color: 'white', '&:hover': { bgcolor: '#2563eb' } }}
                  >
                    Export CSV
                  </Button>
                  <Button 
                    variant="contained" 
                    onClick={() => handleDownload('pdf')}
                    disabled={downloading || previewData.length === 0} 
                    startIcon={downloading ? <CircularProgress size={20} color="inherit" /> : <PdfIcon />}
                    sx={{ bgcolor: '#1e293b', '&:hover': { bgcolor: '#0f172a' } }}
                  >
                    Download PDF
                  </Button>
                </Stack>
              </Stack>

              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

              <Box sx={{ 
                  overflow: 'auto', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: 2, 
                  maxHeight: '350px' 
              }}>
                {loadingPreview ? (
                  <Stack alignItems="center" justifyContent="center" sx={{ height: 300, gap: 2 }}>
                    <CircularProgress size={40} />
                    <Typography variant="body2" color="text.secondary">Fetching {selectedReport.title}...</Typography>
                  </Stack>
                ) : previewData.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr>
                        {Object.keys(previewData[0]).map((key) => (
                          <th key={key} style={{ 
                              padding: '12px 16px', 
                              textAlign: 'left', 
                              borderBottom: '2px solid #e2e8f0', 
                              backgroundColor: '#f8fafc', 
                              color: '#64748b', 
                              textTransform: 'capitalize', 
                              position: 'sticky', 
                              top: 0,
                              zIndex: 1
                          }}>
                            {key.replace(/_/g, ' ')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.length > 0 ? (
                        filteredData.map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            {Object.keys(row).map((key, i) => (
                              <td key={i} style={{ padding: '12px 16px', color: '#334155' }}>
                                {/* Use smart formatter logic here */}
                                {formatCellValue(key, row[key])}
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={Object.keys(previewData[0]).length} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                            No matching records found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <Stack alignItems="center" justifyContent="center" sx={{ height: 300, gap: 2, opacity: 0.5 }}>
                    <ReportIcon sx={{ fontSize: 64, color: '#94a3b8' }} />
                    <Typography variant="body1" color="text.secondary">No data found. Try adjusting your filters.</Typography>
                  </Stack>
                )}
              </Box>
            </Paper>

          </Stack>
        </Box>
      </Box>
    </LocalizationProvider>
  );
};

export default ReportPage;