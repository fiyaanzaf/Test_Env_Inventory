import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import {
  Paper,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Button,
  Chip,
  Tooltip,
  IconButton,
  TextField,
  InputAdornment
} from '@mui/material';
import {
  Add as AddIcon,
  ShoppingCart as OrderIcon,
  Search as SearchIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  AccountTree as VariantsIcon,
  Inventory as BatchIcon
} from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import { getAllProducts, deleteProduct, type Product } from '../services/productService';
import { CreateProductDialog } from './CreateProductDialog';
import { EditProductDialog } from './EditProductDialog';
import { AddToOrderDialog } from './AddToOrderDialog';
import { VariantsDialog } from './VariantsDialog';

// Module-level cache for instant tab switch
let _productsCache: Product[] | null = null;


export const ProductTable: React.FC = () => {
  // --- State Management ---
  const [products, setProducts] = useState<Product[]>(_productsCache || []);
  const [loading, setLoading] = useState(!_productsCache);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // --- Dialog States ---
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddToOrderOpen, setIsAddToOrderOpen] = useState(false);
  const [isVariantsOpen, setIsVariantsOpen] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // --- Navigation Logic (Deep Linking) ---
  const location = useLocation();
  useEffect(() => {
    if (location.state && (location.state as any).openCreateDialog) {
      setIsCreateDialogOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllProducts();
      _productsCache = data;
      setProducts(data);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to load products. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (_productsCache) {
      setProducts(_productsCache);
      setLoading(false);
      // Background refresh
      getAllProducts()
        .then((data) => { _productsCache = data; setProducts(data); })
        .catch(() => {});
    } else {
      loadProducts();
    }
  }, []);

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await deleteProduct(id);
        loadProducts();
      } catch (err) {
        alert('Failed to delete product. It may be linked to inventory or sales.');
      }
    }
  };

  // --- Debounced Search ---
  // Local state for instant typing feedback; debounced value drives actual filtering
  const [localSearch, setLocalSearch] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value);                     // instant UI update
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setSearchQuery(value);                   // triggers filtered recomputation
    }, 200);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, []);

  // --- Optimized Search Filter (memoized + targeted fields) ---
  const filteredProducts = useMemo(() => {
    if (!searchQuery) return products;
    const lower = searchQuery.toLowerCase();
    return products.filter((p) =>
      p.name.toLowerCase().includes(lower) ||
      p.sku.toLowerCase().includes(lower) ||
      (p.barcode || '').toLowerCase().includes(lower) ||
      (p.category || '').toLowerCase().includes(lower) ||
      (p.supplier_name || '').toLowerCase().includes(lower)
    );
  }, [products, searchQuery]);

  // --- Table Columns Definition ---
  const columns: GridColDef[] = [
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
      )
    },
    {
      field: 'sku',
      headerName: 'SKU',
      width: 130,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Chip
            label={params.value}
            size="small"
            sx={{
              fontWeight: 600,
              backgroundColor: '#e0e7ff',
              color: '#4338ca',
              borderRadius: 1,
              height: 24
            }}
          />
        </Box>
      ),
    },
    {
      field: 'name',
      headerName: 'Product Name',
      width: 220,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {params.value}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'category',
      headerName: 'Category',
      width: 130,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Chip
            label={params.value || 'Uncategorized'}
            size="small"
            variant="outlined"
            sx={{
              borderColor: '#8b5cf6',
              color: '#8b5cf6',
              fontWeight: 500,
              borderRadius: 4
            }}
          />
        </Box>
      ),
    },
    {
      field: 'selling_price',
      headerName: 'Sell Price',
      width: 110,
      headerAlign: 'right',
      align: 'right',
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#059669' }}>
            ₹{Number(params.value).toLocaleString()}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'average_cost',
      headerName: 'Avg Cost',
      width: 110,
      headerAlign: 'right',
      align: 'right',
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
          <Typography variant="caption" sx={{ color: '#64748b' }}>
            ₹{Number(params.value).toLocaleString()}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'total_quantity',
      headerName: 'Stock',
      width: 100,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Chip
            label={params.value}
            size="small"
            color={params.value === 0 ? 'error' : params.value < (params.row.low_stock_threshold ?? 20) ? 'warning' : 'success'}
            variant={params.value === 0 ? "filled" : "outlined"}
            sx={{ fontWeight: 'bold' }}
          />
        </Box>
      ),
    },
    {
      field: 'low_stock_threshold',
      headerName: 'Low Thresh',
      width: 100,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Chip
            label={params.value ?? 20}
            size="small"
            sx={{ fontWeight: 600, bgcolor: '#fef3c7', color: '#92400e', borderRadius: 1 }}
          />
        </Box>
      ),
    },
    {
      field: 'shelf_restock_threshold',
      headerName: 'Shelf Thresh',
      width: 100,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Chip
            label={params.value ?? 5}
            size="small"
            sx={{ fontWeight: 600, bgcolor: '#e0e7ff', color: '#4338ca', borderRadius: 1 }}
          />
        </Box>
      ),
    },
    {
      field: 'supplier_name',
      headerName: 'Supplier',
      width: 180,
      renderCell: (params) => {
        const label = params.value || (params.row.supplier_id ? `ID: ${params.row.supplier_id}` : 'None');
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Tooltip title="Primary Supplier">
              <Chip
                label={label}
                size="small"
                sx={{
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  fontWeight: 600,
                  borderRadius: 1,
                  height: 24,
                  maxWidth: '100%'
                }}
              />
            </Tooltip>
          </Box>
        );
      },
    },
    {
      field: 'variant_count',
      headerName: 'Variants',
      width: 90,
      align: 'center' as const,
      headerAlign: 'center' as const,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Chip
            label={params.value || 0}
            size="small"
            sx={{
              fontWeight: 600,
              bgcolor: params.value > 0 ? '#dbeafe' : '#f1f5f9',
              color: params.value > 0 ? '#1d4ed8' : '#94a3b8',
              borderRadius: 1
            }}
          />
        </Box>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 230,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', height: '100%' }}>
          <Tooltip title="Edit Product">
            <IconButton
              size="small"
              onClick={() => {
                setSelectedProduct(params.row);
                setIsEditDialogOpen(true);
              }}
              sx={{
                color: '#6366f1',
                border: '1px solid',
                borderColor: 'rgba(99, 102, 241, 0.5)',
                borderRadius: 1,
                '&:hover': { backgroundColor: '#eef2ff' }
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Manage Variants">
            <IconButton
              size="small"
              onClick={() => {
                setSelectedProduct(params.row);
                setIsVariantsOpen(true);
              }}
              sx={{
                color: '#1d4ed8',
                border: '1px solid',
                borderColor: 'rgba(29, 78, 216, 0.5)',
                borderRadius: 1,
                '&:hover': { backgroundColor: '#dbeafe' }
              }}
            >
              <VariantsIcon fontSize="small" />
            </IconButton>
          </Tooltip>


          <Tooltip title="Add to Purchase Order">
            <IconButton
              size="small"
              onClick={() => {
                setSelectedProduct(params.row);
                setIsAddToOrderOpen(true);
              }}
              sx={{
                color: '#f59e0b',
                border: '1px solid',
                borderColor: 'rgba(245, 158, 11, 0.5)',
                borderRadius: 1,
                '&:hover': { backgroundColor: '#fffbeb' }
              }}
            >
              <OrderIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Delete Product">
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
      )
    }
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* --- Page Header --- */}
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
          📦 Product Catalog
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage your inventory, prices, and suppliers
        </Typography>
      </Box>

      {/* --- Error Handling --- */}
      {error && (
        <Alert
          severity="error"
          sx={{ borderRadius: 3 }}
          onClose={() => setError('')}
        >
          {error}
        </Alert>
      )}

      {/* --- Main Data Table Card --- */}
      <Paper
        sx={{
          width: '100%',
          borderRadius: 3,
          boxShadow: 2,
          overflow: 'hidden',
        }}
      >
        {/* Table Toolbar */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            p: 3,
            borderBottom: '1px solid',
            borderColor: 'divider',
            background: 'linear-gradient(to right, #ffffff 0%, #f8fafc 100%)',
          }}
        >
          {/* Left Side: Title + Search */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                All Products
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {filteredProducts.length} items found
              </Typography>
            </Box>

            {/* --- SEARCH BAR --- */}
            <TextField
              variant="outlined"
              size="small"
              placeholder="Search Name, SKU, Category, or Supplier..."
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
            onClick={() => setIsCreateDialogOpen(true)}
            sx={{
              borderRadius: 2,
              px: 3,
              py: 1.2,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              boxShadow: '0 4px 10px rgba(102, 126, 234, 0.3)',
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': {
                background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%)',
                boxShadow: '0 6px 15px rgba(102, 126, 234, 0.4)',
                transform: 'translateY(-2px)',
              },
              transition: 'all 0.2s ease',
            }}
          >
            Add Product
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
              rows={filteredProducts}
              columns={columns}
              initialState={{
                pagination: { paginationModel: { page: 0, pageSize: 10 } },
              }}
              pageSizeOptions={[5, 10, 25]}
              checkboxSelection
              disableRowSelectionOnClick
              rowHeight={60}
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
                  color: '#64748b'
                },
                '& .MuiDataGrid-row': {
                  '&:hover': {
                    backgroundColor: '#f8fafc',
                  },
                  '&.Mui-selected': {
                    backgroundColor: '#ede9fe',
                    '&:hover': {
                      backgroundColor: '#ddd6fe',
                    },
                  },
                },
                '& .MuiDataGrid-footerContainer': {
                  borderTop: '1px solid #e2e8f0',
                  backgroundColor: '#f8fafc',
                },
                '& .MuiCheckbox-root': {
                  color: '#cbd5e1',
                  '&.Mui-checked': {
                    color: '#6366f1',
                  },
                },
              }}
            />
          </Box>
        )}
      </Paper>

      {/* --- Action Dialogs --- */}
      <CreateProductDialog
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSuccess={loadProducts}
      />

      <EditProductDialog
        open={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        product={selectedProduct}
        onSuccess={loadProducts}
      />

      <AddToOrderDialog
        open={isAddToOrderOpen}
        onClose={() => setIsAddToOrderOpen(false)}
        product={selectedProduct}
        onSuccess={() => {
          console.log("Item added to order");
        }}
      />

      <VariantsDialog
        open={isVariantsOpen}
        onClose={() => setIsVariantsOpen(false)}
        productId={selectedProduct?.id ?? null}
        productName={selectedProduct?.name ?? ''}
        onUpdate={loadProducts}
      />

    </Box>
  );
};