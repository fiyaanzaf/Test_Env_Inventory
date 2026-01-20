import React, { useEffect, useState, useMemo } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, LinearProgress, Alert, Chip, Typography,
  IconButton, Menu, MenuItem, ListItemIcon, ListItemText,
  TextField, InputAdornment, Button
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  ArrowUpward as AscIcon,
  ArrowDownward as DescIcon,
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

type Order = 'asc' | 'desc';

export const ProductSuppliersTable: React.FC = () => {
  const [links, setLinks] = useState<ProductSupplierLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [order, setOrder] = useState<Order>('asc');
  const [orderBy, setOrderBy] = useState<keyof ProductSupplierLink>('product_name');
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [activeCol, setActiveCol] = useState<keyof ProductSupplierLink | null>(null);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSetPreferredOpen, setIsSetPreferredOpen] = useState(false);

  const fetchLinks = () => {
    setLoading(true);
    getProductSupplierLinks()
      .then(setLinks)
      .catch(() => setError('Failed to load sourcing data.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this link?')) {
      try {
        await deleteProductSupplierLink(id);
        fetchLinks();
      } catch (err) {
        alert('Failed to delete source link.');
      }
    }
  };

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>, col: keyof ProductSupplierLink) => {
    setMenuAnchorEl(event.currentTarget);
    setActiveCol(col);
  };

  const handleCloseMenu = () => {
    setMenuAnchorEl(null);
    setActiveCol(null);
  };

  const handleSort = (direction: Order) => {
    if (activeCol) {
      setOrderBy(activeCol);
      setOrder(direction);
    }
    handleCloseMenu();
  };

  const sortedLinks = useMemo(() => {
    const filtered = links.filter((link) =>
      Object.values(link).some((val) =>
        String(val || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    );

    return filtered.sort((a, b) => {
      if (orderBy === 'supply_price') {
        const priceA = Number(a.supply_price);
        const priceB = Number(b.supply_price);
        return order === 'asc' ? priceA - priceB : priceB - priceA;
      }
      const aVal = (a[orderBy] || '').toString().toLowerCase();
      const bVal = (b[orderBy] || '').toString().toLowerCase();
      if (bVal < aVal) return order === 'asc' ? 1 : -1;
      if (bVal > aVal) return order === 'asc' ? -1 : 1;
      return 0;
    });
  }, [links, order, orderBy, searchQuery]);

  if (loading) return <LinearProgress />;
  if (error) return <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>;

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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
              color: '#d97706', // Amber-600
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

      {/* --- Main Table --- */}
      <Box sx={{ width: '100%' }}>
        <TableContainer component={Paper} sx={{ maxHeight: 600, boxShadow: 2, borderRadius: 2 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Product
                    <IconButton size="small" onClick={(e) => handleOpenMenu(e, 'product_name')}>
                      <MoreVertIcon fontSize="small" sx={{ opacity: 0.6 }} />
                    </IconButton>
                  </Box>
                </TableCell>

                <TableCell sx={{ fontWeight: 'bold' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Supplier
                    <IconButton size="small" onClick={(e) => handleOpenMenu(e, 'supplier_name')}>
                      <MoreVertIcon fontSize="small" sx={{ opacity: 0.6 }} />
                    </IconButton>
                  </Box>
                </TableCell>

                <TableCell sx={{ fontWeight: 'bold' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Supply Cost
                    <IconButton size="small" onClick={(e) => handleOpenMenu(e, 'supply_price')}>
                      <MoreVertIcon fontSize="small" sx={{ opacity: 0.6 }} />
                    </IconButton>
                  </Box>
                </TableCell>

                <TableCell sx={{ fontWeight: 'bold' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Supplier SKU
                    <IconButton size="small" onClick={(e) => handleOpenMenu(e, 'supplier_sku')}>
                      <MoreVertIcon fontSize="small" sx={{ opacity: 0.6 }} />
                    </IconButton>
                  </Box>
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 50 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedLinks.map((link, index) => (
                <TableRow key={link.id || index} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{link.product_name}</TableCell>
                  <TableCell>{link.supplier_name}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#059669' }}>
                      ₹{Number(link.supply_price).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell>{link.supplier_sku || '-'}</TableCell>
                  <TableCell>
                    {link.is_preferred ? (
                      <Chip label="Preferred" color="success" size="small" variant="filled" />
                    ) : (
                      <Chip label="Backup" size="small" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => handleDelete(link.id)} sx={{ color: 'error.main' }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Menu anchorEl={menuAnchorEl} open={Boolean(menuAnchorEl)} onClose={handleCloseMenu}>
          <MenuItem onClick={() => handleSort('asc')}>
            <ListItemIcon><AscIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Sort Ascending</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleSort('desc')}>
            <ListItemIcon><DescIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Sort Descending</ListItemText>
          </MenuItem>
        </Menu>
      </Box>

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