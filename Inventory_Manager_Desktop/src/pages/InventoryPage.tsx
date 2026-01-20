import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Button, CircularProgress, Tooltip, IconButton, TextField, InputAdornment, Chip, Fade
} from '@mui/material';
import { DataGrid, type GridColDef, type GridRowSelectionModel, type GridRowId } from '@mui/x-data-grid';
import {
  AddBox as ReceiveIcon,
  LocalShipping as TransferIcon,
  Inventory as InventoryIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  DeleteSweep as WriteOffIcon,
  Search as SearchIcon,
  History as HistoryIcon,
  WarningAmber as LowStockIcon,
  Assessment as ReportsIcon,
  EventBusy as ExpiryIcon
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';

// --- IMPORTS ---
import { getAllProducts } from '../services/productService';
import { getExpiryReport, type ExpiryReportItem } from '../services/inventoryService';

import { ReceiveStockDialog, TransferStockDialog, WriteOffStockDialog } from '../components/InventoryDialogs';
import { BulkActionsDialog } from '../components/BulkActionsDialogs';
import { StockDetailsDialog } from '../components/StockDetailsDialog';
import { WriteOffHistoryDialog } from '../components/WriteOffHistoryDialog';
import { LowStockDialog } from '../components/LowStockDialog';
import { ExpiryAlertDialog } from '../components/ExpiryAlertDialog';
import { ShelfRestockDialog } from '../components/ShelfRestockDialog';

export const InventoryPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // --- Expiry Data State ---
  const [expiredItems, setExpiredItems] = useState<ExpiryReportItem[]>([]);
  const [nearExpiryItems, setNearExpiryItems] = useState<ExpiryReportItem[]>([]);
  const [expiryOpen, setExpiryOpen] = useState(false);

  // --- Selection State ---
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>({
    type: 'include',
    ids: new Set<GridRowId>(),
  });
  const [bulkMode, setBulkMode] = useState<'receive' | 'transfer' | null>(null);

  // --- Dialog States ---
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lowStockOpen, setLowStockOpen] = useState(false);
  const [shelfRestockOpen, setShelfRestockOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  // --- FETCH FUNCTIONS ---

  // Helper to fetch expiry data (Used by LoadData AND the Dialog Filter)
  const fetchExpiryData = async (days: number) => {
    try {
      const reportData = await getExpiryReport(days);
      if (Array.isArray(reportData)) {
        const expired = reportData.filter(item => item.days_left < 0);
        const near = reportData.filter(item => item.days_left >= 0);
        setExpiredItems(expired);
        setNearExpiryItems(near);
      }
    } catch (err) {
      console.error("Failed to update expiry alerts", err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Parallel fetch
      const [productsData] = await Promise.all([
        getAllProducts(),
        fetchExpiryData(30) // Default 30 days
      ]);

      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (err) {
      console.error("Failed to load inventory data", err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // --- Handle Navigation State (from Dashboard) ---
  useEffect(() => {
    const state = location.state as { openExpiryAlert?: boolean; openLowStock?: boolean; openShelfRestock?: boolean } | null;
    if (state?.openExpiryAlert) {
      setExpiryOpen(true);
      // Clear state to prevent re-opening on refresh
      navigate(location.pathname, { replace: true, state: {} });
    } else if (state?.openLowStock) {
      setLowStockOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    } else if (state?.openShelfRestock) {
      setShelfRestockOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  // --- Handle Shelf Restock Transfer ---
  const handleShelfTransfer = (productName: string) => {
    // Find the product by name and select it
    const product = products.find(p => p.name === productName);
    if (product) {
      setSelectedProduct(product);
      setTransferOpen(true);
    } else {
      // If product not found, just set search and open transfer
      setSearchQuery(productName);
    }
  };

  // --- FILTER & SELECTION LOGIC ---
  const filteredProducts = products.filter((product) => {
    const query = searchQuery.toLowerCase();
    return (
      (product.name && product.name.toLowerCase().includes(query)) ||
      (product.sku && product.sku.toLowerCase().includes(query)) ||
      (product.category && product.category.toLowerCase().includes(query)) ||
      (product.supplier_name && product.supplier_name.toLowerCase().includes(query))
    );
  });

  const getSelectedItems = (): any[] => {
    if (rowSelectionModel.type === 'include') {
      return filteredProducts.filter(p => rowSelectionModel.ids.has(p.id));
    } else {
      return filteredProducts.filter(p => !rowSelectionModel.ids.has(p.id));
    }
  };

  const selectedBulkItems = getSelectedItems();
  const selectionCount = rowSelectionModel.type === 'include'
    ? rowSelectionModel.ids.size
    : filteredProducts.length - rowSelectionModel.ids.size;

  const handleRowSelectionChange = (newSelection: GridRowSelectionModel) => {
    setRowSelectionModel(newSelection);
  };

  const handleBulkSuccess = () => {
    setBulkMode(null);
    setRowSelectionModel({ type: 'include', ids: new Set() });
    loadData();
  };

  const lowStockItems = products.filter(p => (p.total_quantity || 0) < 20);
  const totalExpiryAlerts = expiredItems.length + nearExpiryItems.length;

  const columns: GridColDef[] = [
    {
      field: 'sku', headerName: 'SKU', width: 120,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2" fontWeight="bold" sx={{ color: 'text.secondary' }}>{params?.value ?? ''}</Typography>
        </Box>
      )
    },
    {
      field: 'name', headerName: 'Product Name', width: 200,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2" fontWeight="500">{params?.value ?? ''}</Typography>
        </Box>
      )
    },
    {
      field: 'total_quantity', headerName: 'Qty', width: 90,
      renderCell: (params: any) => {
        const qty = params.value || 0;
        let color: 'default' | 'success' | 'warning' | 'error' = 'default';
        if (qty === 0) color = 'error';
        else if (qty < 20) color = 'warning';
        else color = 'success';
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Chip label={qty} size="small" color={color} variant={qty === 0 ? "filled" : "outlined"} sx={{ fontWeight: 'bold', minWidth: 50 }} />
          </Box>
        );
      }
    },
    {
      field: 'selling_price', headerName: 'Sell Price', width: 110,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2" fontWeight="bold" color="success.main">₹{Number(params?.value).toLocaleString() ?? '0.00'}</Typography>
        </Box>
      )
    },
    {
      field: 'average_cost', headerName: 'Avg Cost', width: 110,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2" color="text.secondary">₹{Number(params?.value).toLocaleString() ?? '0.00'}</Typography>
        </Box>
      )
    },
    {
      field: 'category', headerName: 'Category', width: 120,
      renderCell: (params: any) => <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>{params?.value || '-'}</Box>
    },
    {
      field: 'supplier_name', headerName: 'Supplier', width: 150,
      valueGetter: (_value: any, row: any) => row?.supplier_name || 'N/A',
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Tooltip title="Primary Supplier">
            <Chip label={params.value} size="small" sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 600, borderRadius: 1 }} />
          </Tooltip>
        </Box>
      )
    },
    {
      field: 'actions', headerName: 'Stock Operations', width: 400, sortable: false, filterable: false,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', height: '100%' }}>
          <Tooltip title="View Stock Details">
            <Button variant="outlined" size="small" onClick={() => { setSelectedProductId(params.row.id); setDetailsOpen(true); }} sx={{ minWidth: 40, px: 1, borderColor: '#6366f1', color: '#6366f1', '&:hover': { borderColor: '#4f46e5', bgcolor: '#eef2ff' } }}><ViewIcon fontSize="small" /></Button>
          </Tooltip>
          <Button variant="outlined" size="small" startIcon={<ReceiveIcon />} onClick={() => { setSelectedProduct(params?.row ?? null); setReceiveOpen(true); }} sx={{ borderColor: '#10b981', color: '#10b981', textTransform: 'none', fontWeight: 600, '&:hover': { borderColor: '#059669', bgcolor: '#ecfdf5' } }}>Receive</Button>
          <Button variant="outlined" size="small" startIcon={<TransferIcon />} color="warning" onClick={() => { setSelectedProduct(params?.row ?? null); setTransferOpen(true); }} sx={{ textTransform: 'none', fontWeight: 600 }}>Transfer</Button>
          <Tooltip title="Write-off Stock">
            <IconButton size="small" color="error" onClick={() => { setSelectedProduct(params?.row ?? null); setWriteOffOpen(true); }} sx={{ border: '1px solid', borderColor: '#ef4444', borderRadius: 1, padding: '4px 8px', '&:hover': { bgcolor: '#fef2f2' } }}><WriteOffIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Box>
      )
    }
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header Section */}
      <Paper elevation={0} sx={{ p: 3, borderRadius: 3, background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)' }}>
        <Box>
          <Typography variant="h4" fontWeight="700" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}><InventoryIcon fontSize="large" /> Inventory Hub</Typography>
          <Typography variant="body1" sx={{ opacity: 0.9, mt: 0.5, fontWeight: 500 }}>Central command for Stock Intake (Inbound) and Store Replenishment (FIFO)</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="contained" startIcon={<ReportsIcon />} onClick={() => navigate('/reports')} sx={{ bgcolor: '#6366f1', color: '#fff', fontWeight: 600, boxShadow: '0 4px 6px rgba(99, 102, 241, 0.3)', '&:hover': { bgcolor: '#4f46e5' } }}>Reports Center</Button>
          <Button variant="contained" startIcon={<LowStockIcon />} onClick={() => setLowStockOpen(true)} sx={{ bgcolor: '#f59e0b', color: '#fff', backdropFilter: 'blur(10px)', fontWeight: 600, boxShadow: '0 4px 6px rgba(245, 158, 11, 0.3)', '&:hover': { bgcolor: '#d97706' } }}>Low Stock Alerts ({lowStockItems.length})</Button>
          <Button variant="contained" startIcon={<HistoryIcon />} onClick={() => setHistoryOpen(true)} sx={{ bgcolor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', fontWeight: 600, '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}>Loss History</Button>
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={loadData} sx={{ bgcolor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', fontWeight: 600, '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}>Refresh Data</Button>
        </Box>
      </Paper>

      {/* Bulk Toolbar */}
      <Fade in={selectionCount > 0}>
        <Paper sx={{ p: 2, borderRadius: 3, bgcolor: '#f0f9ff', border: '1px solid #bae6fd', display: selectionCount > 0 ? 'flex' : 'none', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight="bold" color="#0369a1">{selectionCount} item{selectionCount !== 1 ? 's' : ''} selected</Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="contained" color="primary" startIcon={<ReceiveIcon />} onClick={() => setBulkMode('receive')}>Bulk Receive</Button>
            <Button variant="contained" color="warning" startIcon={<TransferIcon />} onClick={() => setBulkMode('transfer')}>Bulk Transfer</Button>
          </Box>
        </Paper>
      </Fade>

      {/* Main Table */}
      <Paper sx={{ height: 700, width: '100%', borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflow: 'hidden', bgcolor: 'white', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 2, borderBottom: '1px solid #f1f5f9', bgcolor: '#f8fafc', display: 'flex', alignItems: 'center', gap: 2 }}>
          <TextField
            variant="outlined" placeholder="Search by Name, SKU..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} sx={{ flex: 1 }} size="small"
            InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>), sx: { bgcolor: 'white' } }}
          />
          <Button variant="contained" startIcon={<ExpiryIcon />} onClick={() => setExpiryOpen(true)} sx={{ bgcolor: '#ef4444', color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)', '&:hover': { bgcolor: '#dc2626' } }}>Expiry Alerts ({totalExpiryAlerts})</Button>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress /></Box>
        ) : (
          <DataGrid
            rows={filteredProducts} columns={columns} rowHeight={64} disableRowSelectionOnClick getRowId={(row: any) => row.id}
            initialState={{ pagination: { paginationModel: { pageSize: 10 } } }} pageSizeOptions={[10, 25, 50]}
            sx={{ border: 'none', '& .MuiDataGrid-columnHeaders': { bgcolor: '#f8fafc', color: '#64748b', fontWeight: 700, fontSize: '0.9rem' }, '& .MuiDataGrid-row:hover': { bgcolor: '#f8fafc' }, '& .MuiDataGrid-cell': { borderBottom: '1px solid #f1f5f9' } }}
            checkboxSelection rowSelectionModel={rowSelectionModel} onRowSelectionModelChange={handleRowSelectionChange}
          />
        )}
      </Paper>

      {/* --- Dialogs --- */}
      <ExpiryAlertDialog
        open={expiryOpen}
        onClose={() => setExpiryOpen(false)}
        expiredItems={expiredItems}
        nearExpiryItems={nearExpiryItems}
        onFilterChange={(days) => fetchExpiryData(days)}
        onRefresh={loadData}
      />

      {bulkMode && <BulkActionsDialog open={true} onClose={() => setBulkMode(null)} mode={bulkMode} selectedProducts={selectedBulkItems} onSuccess={handleBulkSuccess} />}

      {/* UPDATED: Removed onRestock prop as it's now handled internally in the component */}
      <LowStockDialog
        open={lowStockOpen}
        onClose={() => setLowStockOpen(false)}
      />

      <WriteOffHistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <ReceiveStockDialog open={receiveOpen} onClose={() => setReceiveOpen(false)} product={selectedProduct} onSuccess={loadData} />
      <TransferStockDialog open={transferOpen} onClose={() => setTransferOpen(false)} product={selectedProduct} onSuccess={loadData} />
      <WriteOffStockDialog open={writeOffOpen} onClose={() => setWriteOffOpen(false)} product={selectedProduct} onSuccess={loadData} />
      <StockDetailsDialog open={detailsOpen} onClose={() => setDetailsOpen(false)} productId={selectedProductId} />

      <ShelfRestockDialog
        open={shelfRestockOpen}
        onClose={() => setShelfRestockOpen(false)}
        onTransfer={handleShelfTransfer}
      />
    </Box>
  );
};