import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  InputAdornment,
  Chip,
  Button,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Skeleton,
  Tooltip
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Phone as PhoneIcon,
  Warning as WarningIcon,
  Block as BlockIcon,
  WhatsApp as WhatsAppIcon,
  ShoppingCart as SellIcon
} from '@mui/icons-material';
import { getKhataCustomers, type KhataCustomer } from '../../services/khataService';

interface KhataCustomerListProps {
  onCustomerSelect: (customer: KhataCustomer) => void;
  onAddCustomer: () => void;
  onSellToCustomer: (customer: KhataCustomer) => void;
  refreshTrigger?: number;
}

const KhataCustomerList: React.FC<KhataCustomerListProps> = ({
  onCustomerSelect,
  onAddCustomer,
  onSellToCustomer,
  refreshTrigger
}) => {
  const [customers, setCustomers] = useState<KhataCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'with_balance' | 'over_limit' | 'blocked'>('all');

  useEffect(() => {
    loadCustomers();
  }, [search, statusFilter, refreshTrigger]);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const data = await getKhataCustomers(search || undefined, statusFilter);
      setCustomers(data);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusChip = (customer: KhataCustomer) => {
    if (customer.is_blocked) {
      return <Chip size="small" icon={<BlockIcon />} label="Blocked" color="error" />;
    }
    switch (customer.balance_status) {
      case 'clear':
        return <Chip size="small" label="Clear" color="success" />;
      case 'normal':
        return <Chip size="small" label="Active" color="info" />;
      case 'warning':
        return <Chip size="small" icon={<WarningIcon />} label="Near Limit" color="warning" />;
      case 'over_limit':
        return <Chip size="small" label="Over Limit" color="error" />;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardContent>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight="bold">
            Khata Customers
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={onAddCustomer}
          >
            Add Customer
          </Button>
        </Box>

        {/* Filters */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            size="small"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              )
            }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="with_balance">With Balance</MenuItem>
              <MenuItem value="over_limit">Over Limit</MenuItem>
              <MenuItem value="blocked">Blocked</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Table */}
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Customer</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell align="right">Limit</TableCell>
                <TableCell align="center">Used %</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton /></TableCell>
                    <TableCell><Skeleton /></TableCell>
                    <TableCell><Skeleton /></TableCell>
                    <TableCell><Skeleton /></TableCell>
                    <TableCell><Skeleton /></TableCell>
                    <TableCell><Skeleton /></TableCell>
                    <TableCell><Skeleton /></TableCell>
                  </TableRow>
                ))
              ) : customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography color="text.secondary" sx={{ py: 3 }}>
                      No customers found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer) => (
                  <TableRow 
                    key={customer.id} 
                    hover 
                    sx={{ cursor: 'pointer' }}
                    onClick={() => onCustomerSelect(customer)}
                  >
                    <TableCell>
                      <Typography fontWeight="medium">{customer.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <PhoneIcon fontSize="small" color="action" />
                        {customer.phone}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography 
                        fontWeight="bold" 
                        color={customer.current_balance > 0 ? 'error.main' : 'success.main'}
                      >
                        ₹{customer.current_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      ₹{customer.credit_limit.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell align="center">
                      <Chip 
                        size="small" 
                        label={`${customer.limit_used_percent}%`}
                        color={
                          customer.limit_used_percent >= 100 ? 'error' :
                          customer.limit_used_percent >= 80 ? 'warning' : 'default'
                        }
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      {getStatusChip(customer)}
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <Tooltip title="Quick Credit Sale">
                          <span>
                            <IconButton 
                              size="small" 
                              color="primary"
                              disabled={customer.is_blocked || customer.credit_limit - customer.current_balance <= 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSellToCustomer(customer);
                              }}
                            >
                              <SellIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="WhatsApp Reminder">
                          <IconButton 
                            size="small" 
                            color="success"
                            onClick={(e) => {
                              e.stopPropagation();
                              const msg = `Dear ${customer.name}, your pending balance at our store is ₹${customer.current_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}. Please clear your dues at your earliest convenience. Thank you!`;
                              window.open(`https://wa.me/91${customer.phone}?text=${encodeURIComponent(msg)}`, '_blank');
                            }}
                          >
                            <WhatsAppIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
};

export default KhataCustomerList;
