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
  Store as StoreIcon,
  Warehouse as WarehouseIcon,
  Storefront as ShowroomIcon
} from '@mui/icons-material';
import { getLocations, deleteLocation, type Location } from '../services/catalogService';
import { AddLocationDialog } from './AddLocationDialog';

// Module-level cache for instant tab switch
let _locationsCache: Location[] | null = null;

const getTypeColor = (typeVal: string | undefined): 'primary' | 'secondary' | 'info' | 'default' => {
  if (!typeVal) return 'default';
  const normalized = typeVal.toLowerCase().trim();
  switch (normalized) {
    case 'store': return 'primary';
    case 'warehouse': return 'secondary';
    case 'showroom': return 'info';
    default: return 'default';
  }
};

const getTypeIcon = (typeVal: string) => {
  const normalized = typeVal.toLowerCase().trim();
  switch (normalized) {
    case 'store': return <StoreIcon sx={{ fontSize: 14 }} />;
    case 'warehouse': return <WarehouseIcon sx={{ fontSize: 14 }} />;
    case 'showroom': return <ShowroomIcon sx={{ fontSize: 14 }} />;
    default: return <StoreIcon sx={{ fontSize: 14 }} />;
  }
};

const getLocationType = (loc: any): string => loc.type || loc.location_type || 'Unknown';

export const LocationsTable: React.FC = () => {
  const [locations, setLocations] = useState<Location[]>(_locationsCache || []);
  const [loading, setLoading] = useState(!_locationsCache);
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
  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLocations();
      _locationsCache = data;
      setLocations(data);
      setError('');
    } catch {
      setError('Failed to load locations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (_locationsCache) {
      setLocations(_locationsCache);
      setLoading(false);
      getLocations()
        .then((data) => { _locationsCache = data; setLocations(data); })
        .catch(() => {});
    } else {
      fetchLocations();
    }
  }, []);

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this location?')) {
      try {
        await deleteLocation(id);
        fetchLocations();
      } catch {
        alert('Failed to delete location');
      }
    }
  };

  // --- Filtered data (targeted fields) ---
  const filteredLocations = useMemo(() => {
    if (!searchQuery) return locations;
    const lower = searchQuery.toLowerCase();
    return locations.filter((loc) =>
      loc.name.toLowerCase().includes(lower) ||
      getLocationType(loc).toLowerCase().includes(lower) ||
      (loc.description || '').toLowerCase().includes(lower)
    );
  }, [locations, searchQuery]);

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
      headerName: 'Location Name',
      flex: 1,
      minWidth: 220,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {params.value}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'type',
      headerName: 'Type',
      width: 150,
      renderCell: (params) => {
        const typeVal = getLocationType(params.row);
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Chip
              icon={getTypeIcon(typeVal)}
              label={typeVal.toUpperCase()}
              color={getTypeColor(typeVal)}
              size="small"
              variant="filled"
              sx={{ borderRadius: 1, fontWeight: 600, height: 26 }}
            />
          </Box>
        );
      },
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 1.5,
      minWidth: 250,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2" color="text.secondary" sx={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {params.value || '—'}
          </Typography>
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
          <Tooltip title="Delete Location">
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
          📍 Locations Management
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage your stores, warehouses, and physical sites
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
                All Locations
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {filteredLocations.length} locations found
              </Typography>
            </Box>

            <TextField
              variant="outlined"
              size="small"
              placeholder="Search Name, Type, or Description..."
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
            Add Location
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
              rows={filteredLocations}
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

      <AddLocationDialog
        open={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSuccess={fetchLocations}
      />
    </Box>
  );
};