import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import {
  Box, Paper, Alert, Chip, Typography, CircularProgress,
  IconButton, TextField, InputAdornment, Button, Tooltip
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Phone as PhoneIcon,
  Email as EmailIcon
} from '@mui/icons-material';
import { getSuppliers, deleteSupplier, type Supplier } from '../services/catalogService';
import { AddSupplierDialog } from './AddSupplierDialog';

// Module-level cache for instant tab switch
let _suppliersCache: Supplier[] | null = null;

export const SuppliersTable: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>(_suppliersCache || []);
  const [loading, setLoading] = useState(!_suppliersCache);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // --- Debounced Search ---
  const [localSearch, setLocalSearch] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => setSearchQuery(value), 150);
  }, []);

  useEffect(() => {
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, []);

  // --- Data Loading (with cache) ---
  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSuppliers();
      _suppliersCache = data;
      setSuppliers(data);
      setError('');
    } catch {
      setError('Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (_suppliersCache) {
      setSuppliers(_suppliersCache);
      setLoading(false);
      getSuppliers()
        .then((data) => { _suppliersCache = data; setSuppliers(data); })
        .catch(() => {});
    } else {
      fetchSuppliers();
    }
  }, []);

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this supplier?')) {
      try {
        await deleteSupplier(id);
        fetchSuppliers();
      } catch {
        alert('Failed to delete supplier. Ensure it is not linked to any products.');
      }
    }
  };

  // --- Filtered data (targeted fields) ---
  const filteredSuppliers = useMemo(() => {
    if (!searchQuery) return suppliers;
    const lower = searchQuery.toLowerCase();
    return suppliers.filter((s) =>
      s.name.toLowerCase().includes(lower) ||
      (s.contact_person || '').toLowerCase().includes(lower) ||
      (s.phone_number || '').toLowerCase().includes(lower) ||
      (s.email || '').toLowerCase().includes(lower) ||
      (s.location || '').toLowerCase().includes(lower)
    );
  }, [suppliers, searchQuery]);

  // --- Column definitions (styled to match ProductTable) ---
  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'id',
      headerName: 'ID',
      width: 70,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          {params.value}
        </Box>
      ),
    },
    {
      field: 'name',
      headerName: 'Supplier Name',
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
            {params.value}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'contact_person',
      headerName: 'Contact Person',
      width: 170,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          {params.value ? (
            <Chip
              label={params.value}
              size="small"
              variant="outlined"
              sx={{
                borderColor: '#8b5cf6', color: '#8b5cf6',
                fontWeight: 500, borderRadius: 4
              }}
            />
          ) : (
            <Typography variant="body2" color="text.disabled">—</Typography>
          )}
        </Box>
      ),
    },
    {
      field: 'phone_number',
      headerName: 'Phone',
      width: 150,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', gap: 0.5 }}>
          {params.value ? (
            <>
              <PhoneIcon sx={{ fontSize: 14, color: '#64748b' }} />
              <Typography variant="body2">{params.value}</Typography>
            </>
          ) : (
            <Typography variant="body2" color="text.disabled">—</Typography>
          )}
        </Box>
      ),
    },
    {
      field: 'email',
      headerName: 'Email',
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', gap: 0.5 }}>
          {params.value ? (
            <>
              <EmailIcon sx={{ fontSize: 14, color: '#64748b' }} />
              <Typography variant="body2" sx={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                {params.value}
              </Typography>
            </>
          ) : (
            <Typography variant="body2" color="text.disabled">—</Typography>
          )}
        </Box>
      ),
    },
    {
      field: 'location',
      headerName: 'Location',
      width: 150,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          {params.value ? (
            <Chip
              label={params.value}
              size="small"
              sx={{
                fontWeight: 600,
                backgroundColor: '#e0e7ff', color: '#4338ca',
                borderRadius: 1, height: 24
              }}
            />
          ) : (
            <Typography variant="body2" color="text.disabled">—</Typography>
          )}
        </Box>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      sortable: false,
      filterable: false,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Tooltip title="Delete Supplier">
            <IconButton
              size="small"
              onClick={() => handleDelete(params.row.id)}
              sx={{
                color: 'error.main',
                border: '1px solid',
                borderColor: 'rgba(239, 68, 68, 0.5)',
                borderRadius: 1,
                '&:hover': { backgroundColor: '#fef2f2' }
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ], []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* --- Page Header --- */}
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
          🏭 Supplier Directory
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage vendor relationships and contact details
        </Typography>
      </Box>

      {/* --- Error Handling --- */}
      {error && (
        <Alert severity="error" sx={{ borderRadius: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* --- Main Data Table Card --- */}
      <Paper sx={{ width: '100%', borderRadius: 3, boxShadow: 2, overflow: 'hidden' }}>
        {/* Table Toolbar */}
        <Box sx={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          p: 3, borderBottom: '1px solid', borderColor: 'divider',
          background: 'linear-gradient(to right, #ffffff 0%, #f8fafc 100%)',
        }}>
          {/* Left Side: Title + Search */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                All Suppliers
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {filteredSuppliers.length} suppliers found
              </Typography>
            </Box>

            <TextField
              variant="outlined"
              size="small"
              placeholder="Search Name, Email, Contact..."
              value={localSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
              sx={{ backgroundColor: 'white', width: 350 }}
            />
          </Box>

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setIsAddDialogOpen(true)}
            sx={{
              borderRadius: 2, px: 3, py: 1.2,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              boxShadow: '0 4px 10px rgba(102, 126, 234, 0.3)',
              textTransform: 'none', fontWeight: 600,
              '&:hover': {
                background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%)',
                boxShadow: '0 6px 15px rgba(102, 126, 234, 0.4)',
                transform: 'translateY(-2px)',
              },
              transition: 'all 0.2s ease',
            }}
          >
            Add Supplier
          </Button>
        </Box>

        {/* Loading State or Data Grid */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 8 }}>
            <CircularProgress size={48} />
          </Box>
        ) : (
          <Box sx={{ height: 550 }}>
            <DataGrid
              rows={filteredSuppliers}
              columns={columns}
              initialState={{
                pagination: { paginationModel: { page: 0, pageSize: 10 } },
                sorting: { sortModel: [{ field: 'name', sort: 'asc' }] },
              }}
              pageSizeOptions={[5, 10, 25]}
              checkboxSelection
              disableRowSelectionOnClick
              rowHeight={60}
              sx={{
                border: 'none',
                '& .MuiDataGrid-cell': { borderColor: '#f1f5f9', px: 2 },
                '& .MuiDataGrid-columnHeaders': {
                  backgroundColor: '#f8fafc', borderColor: '#e2e8f0',
                  fontWeight: 600, fontSize: '0.875rem', color: '#64748b',
                },
                '& .MuiDataGrid-row': {
                  '&:hover': { backgroundColor: '#f8fafc' },
                  '&.Mui-selected': {
                    backgroundColor: '#ede9fe',
                    '&:hover': { backgroundColor: '#ddd6fe' },
                  },
                },
                '& .MuiDataGrid-footerContainer': {
                  borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc',
                },
                '& .MuiCheckbox-root': {
                  color: '#cbd5e1',
                  '&.Mui-checked': { color: '#6366f1' },
                },
              }}
            />
          </Box>
        )}
      </Paper>

      <AddSupplierDialog
        open={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSuccess={fetchSuppliers}
      />
    </Box>
  );
};