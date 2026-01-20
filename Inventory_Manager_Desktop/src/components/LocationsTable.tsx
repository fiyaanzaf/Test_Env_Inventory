import React, { useEffect, useState, useMemo } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert, IconButton,
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
import { getLocations, deleteLocation, type Location } from '../services/catalogService';
import { AddLocationDialog } from './AddLocationDialog';

type Order = 'asc' | 'desc';

const getTypeColor = (typeVal: string | undefined) => {
  if (!typeVal) return 'default';
  const normalized = typeVal.toLowerCase().trim();
  switch (normalized) {
    case 'store': return 'primary';
    case 'warehouse': return 'secondary';
    case 'showroom': return 'info';
    default: return 'default';
  }
};

export const LocationsTable: React.FC = () => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [order, setOrder] = useState<Order>('asc');
  const [orderBy, setOrderBy] = useState<keyof Location>('name');
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [activeCol, setActiveCol] = useState<keyof Location | null>(null);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const fetchLocations = () => {
    setLoading(true);
    getLocations()
      .then(setLocations)
      .catch(() => setError('Failed to load locations.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this location?')) {
      try {
        await deleteLocation(id);
        fetchLocations();
      } catch (err) {
        alert('Failed to delete location');
      }
    }
  };

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>, col: keyof Location) => {
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

  const sortedLocations = useMemo(() => {
    const filtered = locations.filter((loc) =>
      Object.values(loc).some((val) =>
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
  }, [locations, order, orderBy, searchQuery]);

  const getLocationType = (loc: any): string => loc.type || loc.location_type || 'Unknown';

  if (loading) return <LinearProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* --- Page Header with Search --- */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
            📍 Locations Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your stores, warehouses, and physical sites
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            variant="outlined"
            size="small"
            placeholder="Search Name, Type, or Description..."
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
            Add Location
          </Button>
        </Box>
      </Box>

      {/* --- Main Table --- */}
      <Box sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer component={Paper} sx={{ maxHeight: 600, boxShadow: 2, borderRadius: 2 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f8fafc' }}>
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
                    Location Name
                    <IconButton size="small" onClick={(e) => handleOpenMenu(e, 'name')}>
                      <MoreVertIcon fontSize="small" sx={{ opacity: 0.6 }} />
                    </IconButton>
                  </Box>
                </TableCell>

                <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>

                <TableCell sx={{ fontWeight: 'bold' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Description
                    <IconButton size="small" onClick={(e) => handleOpenMenu(e, 'description')}>
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
              {sortedLocations.map((loc, index) => (
                <TableRow key={loc.id || index} hover>
                  <TableCell>{loc.id}</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>{loc.name}</TableCell>
                  <TableCell>
                    <Chip
                      label={getLocationType(loc).toUpperCase()}
                      color={getTypeColor(getLocationType(loc))}
                      size="small"
                      variant="filled"
                      sx={{ borderRadius: 1 }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{loc.description || '-'}</TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => handleDelete(loc.id)} sx={{ color: 'error.main' }}>
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

      <AddLocationDialog
        open={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSuccess={fetchLocations}
      />
    </Box>
  );
};