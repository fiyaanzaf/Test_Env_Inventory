import React, { useEffect, useState, useMemo } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, LinearProgress, Alert, IconButton,
  Menu, MenuItem, ListItemIcon, ListItemText, Typography,
  TextField, InputAdornment, Button
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  ArrowUpward as AscIcon,
  ArrowDownward as DescIcon,
  Search as SearchIcon,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { getSuppliers, deleteSupplier, type Supplier } from '../services/catalogService';
import { AddSupplierDialog } from './AddSupplierDialog';

type Order = 'asc' | 'desc';

export const SuppliersTable: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [order, setOrder] = useState<Order>('asc');
  const [orderBy, setOrderBy] = useState<keyof Supplier>('id');
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [activeCol, setActiveCol] = useState<keyof Supplier | null>(null);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const fetchSuppliers = () => {
    setLoading(true);
    getSuppliers()
      .then(setSuppliers)
      .catch(() => setError('Failed to load suppliers.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this supplier?')) {
      try {
        await deleteSupplier(id);
        fetchSuppliers();
      } catch (err) {
        alert('Failed to delete supplier. Ensure it is not linked to any products.');
      }
    }
  };

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>, col: keyof Supplier) => {
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

  const sortedSuppliers = useMemo(() => {
    const filtered = suppliers.filter((s) =>
      Object.values(s).some((val) =>
        String(val || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    );

    return filtered.sort((a, b) => {
      const valA = a[orderBy];
      const valB = b[orderBy];

      if (typeof valA === 'number' && typeof valB === 'number') {
        return order === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA || '').toLowerCase();
      const strB = String(valB || '').toLowerCase();

      if (strB < strA) return order === 'asc' ? 1 : -1;
      if (strB > strA) return order === 'asc' ? -1 : 1;
      return 0;
    });
  }, [suppliers, order, orderBy, searchQuery]);

  if (loading) return <LinearProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* --- Page Header with Search --- */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
            🏭 Supplier Directory
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage vendor relationships and contact details
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            variant="outlined"
            size="small"
            placeholder="Search Name, Email, Contact..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ bgcolor: 'background.paper', width: 350 }}
          />

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setIsAddDialogOpen(true)}
            sx={{
              borderRadius: 2,
              px: 3,
              py: 1.2,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', // Purple/Blue
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
            Add Supplier
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
                    ID
                    <IconButton size="small" onClick={(e) => handleOpenMenu(e, 'id')}>
                      <MoreVertIcon fontSize="small" sx={{ opacity: 0.6 }} />
                    </IconButton>
                  </Box>
                </TableCell>

                <TableCell sx={{ fontWeight: 'bold' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Supplier Name
                    <IconButton size="small" onClick={(e) => handleOpenMenu(e, 'name')}>
                      <MoreVertIcon fontSize="small" sx={{ opacity: 0.6 }} />
                    </IconButton>
                  </Box>
                </TableCell>

                <TableCell sx={{ fontWeight: 'bold' }}>Contact Person</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>

                <TableCell sx={{ fontWeight: 'bold' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Location
                    <IconButton size="small" onClick={(e) => handleOpenMenu(e, 'location')}>
                      <MoreVertIcon fontSize="small" sx={{ opacity: 0.6 }} />
                    </IconButton>
                  </Box>
                </TableCell>

                <TableCell sx={{ fontWeight: 'bold', width: 50 }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedSuppliers.map((supplier) => (
                <TableRow key={supplier.id} hover>
                  <TableCell>{supplier.id}</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: 'primary.main' }}>{supplier.name}</TableCell>
                  <TableCell>{supplier.contact_person || '-'}</TableCell>
                  <TableCell>{supplier.phone_number || '-'}</TableCell>
                  <TableCell>{supplier.email || '-'}</TableCell>
                  <TableCell>{supplier.location || '-'}</TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => handleDelete(supplier.id)} sx={{ color: 'error.main' }}>
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

      <AddSupplierDialog
        open={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSuccess={fetchSuppliers}
      />
    </Box>
  );
};