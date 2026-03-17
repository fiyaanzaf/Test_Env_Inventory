import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import {
  Box, Paper, Alert, Chip, Typography,
  IconButton, TextField, InputAdornment, Button, Tooltip
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Star as StarIcon
} from '@mui/icons-material';
import {
  getProductSupplierLinks,
  deleteProductSupplierLink,
  type ProductSupplierLink
} from '../services/catalogService';
import { AddProductSupplierDialog } from './AddProductSupplierDialog';
import { SetPreferredSupplierDialog } from './SetPreferredSupplierDialog';

// Module-level cache to survive tab switches without re-fetching
let _linksCache: ProductSupplierLink[] | null = null;

export const ProductSuppliersTable: React.FC = () => {
  const [links, setLinks] = useState<ProductSupplierLink[]>(_linksCache || []);
  const [loading, setLoading] = useState(!_linksCache);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSetPreferredOpen, setIsSetPreferredOpen] = useState(false);

  // --- Debounced Search ---
  const [localSearch, setLocalSearch] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 150);
  }, []);

  useEffect(() => {
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, []);

  // --- Data Loading (with cache) ---
  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProductSupplierLinks();
      _linksCache = data;
      setLinks(data);
      setError('');
    } catch {
      setError('Failed to load sourcing data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (_linksCache) {
      // Already have cached data — show it instantly, refresh in background
      setLinks(_linksCache);
      setLoading(false);
      getProductSupplierLinks()
        .then((data) => { _linksCache = data; setLinks(data); })
        .catch(() => {});
    } else {
      fetchLinks();
    }
  }, []);

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this link?')) {
      try {
        await deleteProductSupplierLink(id);
        fetchLinks();
      } catch {
        alert('Failed to delete source link.');
      }
    }
  };

  // --- Optimized filtered rows (targeted fields, memoized) ---
  const filteredLinks = useMemo(() => {
    if (!searchQuery) return links;
    const lower = searchQuery.toLowerCase();
    return links.filter((link) =>
      link.product_name.toLowerCase().includes(lower) ||
      link.supplier_name.toLowerCase().includes(lower) ||
      (link.supplier_sku || '').toLowerCase().includes(lower)
    );
  }, [links, searchQuery]);

  // --- Column definitions (stable reference via useMemo) ---
  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'product_name',
      headerName: 'Product',
      flex: 1,
      minWidth: 180,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2" fontWeight={500}>{params.value}</Typography>
        </Box>
      ),
    },
    {
      field: 'supplier_name',
      headerName: 'Supplier',
      flex: 1,
      minWidth: 180,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2">{params.value}</Typography>
        </Box>
      ),
    },
    {
      field: 'supply_price',
      headerName: 'Supply Cost',
      width: 120,
      headerAlign: 'right',
      align: 'right',
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#059669' }}>
            ₹{Number(params.value).toFixed(2)}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'supplier_sku',
      headerName: 'Supplier SKU',
      width: 140,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2" color="text.secondary">{params.value || '-'}</Typography>
        </Box>
      ),
    },
    {
      field: 'is_preferred',
      headerName: 'Status',
      width: 120,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          {params.value ? (
            <Chip label="Preferred" color="success" size="small" variant="filled" />
          ) : (
            <Chip label="Backup" size="small" variant="outlined" />
          )}
        </Box>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 80,
      sortable: false,
      filterable: false,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Tooltip title="Delete Link">
            <IconButton size="small" onClick={() => handleDelete(params.row.id)} sx={{ color: 'error.main' }}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ], []);

  if (error && links.length === 0) {
    return <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* --- Page Header with Search --- */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
            🏷️ Product Sourcing
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage item costs, SKUs, and preferred vendors
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            variant="outlined"
            size="small"
            placeholder="Search..."
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ bgcolor: 'background.paper', width: 300 }}
          />

          <Button
            variant="outlined"
            startIcon={<StarIcon />}
            onClick={() => setIsSetPreferredOpen(true)}
            sx={{
              borderRadius: 2,
              px: 2,
              textTransform: 'none',
              fontWeight: 600,
              borderColor: '#fbbf24',
              color: '#d97706',
              '&:hover': {
                borderColor: '#f59e0b',
                backgroundColor: '#fffbeb',
              }
            }}
          >
            Set Preferred Supplier
          </Button>

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setIsAddDialogOpen(true)}
            sx={{
              borderRadius: 2,
              px: 3,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              boxShadow: '0 4px 10px rgba(102, 126, 234, 0.3)',
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': {
                background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%)',
              }
            }}
          >
            Link Product
          </Button>
        </Box>
      </Box>

      {/* --- DataGrid (virtualized rows) --- */}
      <Paper sx={{ width: '100%', borderRadius: 3, boxShadow: 2, overflow: 'hidden' }}>
        <Box sx={{ height: 550 }}>
          <DataGrid
            rows={filteredLinks}
            columns={columns}
            loading={loading}
            initialState={{
              pagination: { paginationModel: { page: 0, pageSize: 25 } },
              sorting: { sortModel: [{ field: 'product_name', sort: 'asc' }] },
            }}
            pageSizeOptions={[10, 25, 50]}
            disableRowSelectionOnClick
            rowHeight={52}
            sx={{
              border: 'none',
              '& .MuiDataGrid-cell': {
                borderColor: '#f1f5f9',
                px: 2,
              },
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: '#f8fafc',
                borderColor: '#e2e8f0',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#64748b',
              },
              '& .MuiDataGrid-row': {
                '&:hover': { backgroundColor: '#f8fafc' },
              },
              '& .MuiDataGrid-footerContainer': {
                borderTop: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
              },
            }}
          />
        </Box>
      </Paper>

      <AddProductSupplierDialog
        open={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSuccess={fetchLinks}
      />

      <SetPreferredSupplierDialog
        open={isSetPreferredOpen}
        onClose={() => setIsSetPreferredOpen(false)}
        onSuccess={fetchLinks}
      />
    </Box>
  );
};