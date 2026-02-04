import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, InputAdornment, IconButton, Chip, Typography, Avatar,
  Tooltip, CircularProgress, TableSortLabel, Button
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Visibility as ViewIcon,
  Phone as PhoneIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { b2bService } from '../../services/b2bService';
import type { B2BClient } from '../../services/b2bService';

interface B2BClientListProps {
  onClientSelect: (client: B2BClient) => void;
  onAddClient: () => void;
  refreshTrigger?: number;
}

const getBalanceColor = (status: string): string => {
  switch (status) {
    case 'clear': return '#22c55e';
    case 'normal': return '#f59e0b';
    case 'warning': return '#f97316';
    case 'over_limit': return '#ef4444';
    default: return '#6b7280';
  }
};

const getTierColor = (tier: string): 'warning' | 'default' | 'primary' => {
  switch (tier) {
    case 'gold': return 'warning';
    case 'silver': return 'default';
    default: return 'primary';
  }
};

export const B2BClientList: React.FC<B2BClientListProps> = ({
  onClientSelect,
  onAddClient,
  refreshTrigger
}) => {
  const [clients, setClients] = useState<B2BClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'balance' | 'created'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    loadClients();
  }, [refreshTrigger]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await b2bService.getClients(search || undefined, true, sortBy);
      // Apply local sorting direction
      const sorted = [...data].sort((a, b) => {
        let compare = 0;
        if (sortBy === 'name') {
          compare = a.name.localeCompare(b.name);
        } else if (sortBy === 'balance') {
          compare = b.current_balance - a.current_balance;
        } else {
          compare = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        return sortDirection === 'asc' ? compare : -compare;
      });
      setClients(sorted);
    } catch (error) {
      console.error('Failed to load clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadClients();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleSort = (field: 'name' | 'balance' | 'created') => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  useEffect(() => {
    loadClients();
  }, [sortBy, sortDirection]);

  return (
    <Box>
      {/* Search & Actions Bar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search by name, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyPress={handleKeyPress}
          sx={{ flexGrow: 1, minWidth: 250 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: search && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => { setSearch(''); loadClients(); }}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            )
          }}
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onAddClient}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Add Client
        </Button>
      </Box>

      {/* Clients Table */}
      <TableContainer component={Paper} sx={{ maxHeight: 'calc(100vh - 350px)' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={sortBy === 'name'}
                  direction={sortBy === 'name' ? sortDirection : 'asc'}
                  onClick={() => handleSort('name')}
                >
                  Business Name
                </TableSortLabel>
              </TableCell>
              <TableCell>Contact</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell align="right">Credit Limit</TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortBy === 'balance'}
                  direction={sortBy === 'balance' ? sortDirection : 'asc'}
                  onClick={() => handleSort('balance')}
                >
                  Balance
                </TableSortLabel>
              </TableCell>
              <TableCell>Tier</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={30} />
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    No B2B clients found. Add your first client!
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <TableRow
                  key={client.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => onClientSelect(client)}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar
                        sx={{
                          width: 36,
                          height: 36,
                          bgcolor: getBalanceColor(client.balance_status),
                          fontSize: '0.9rem'
                        }}
                      >
                        {client.name.charAt(0).toUpperCase()}
                      </Avatar>
                      <Typography fontWeight={500}>{client.name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {client.contact_person || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <PhoneIcon fontSize="small" color="action" />
                      <Typography variant="body2">{client.phone}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      ₹{client.credit_limit.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      label={`₹${client.current_balance.toLocaleString()}`}
                      sx={{
                        bgcolor: `${getBalanceColor(client.balance_status)}15`,
                        color: getBalanceColor(client.balance_status),
                        fontWeight: 600,
                        minWidth: 80
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={client.price_tier}
                      color={getTierColor(client.price_tier)}
                      variant="outlined"
                      sx={{ textTransform: 'capitalize' }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="View Details">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClientSelect(client);
                        }}
                      >
                        <ViewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default B2BClientList;
