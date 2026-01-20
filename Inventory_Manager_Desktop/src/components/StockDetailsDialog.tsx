import React, { useEffect, useState } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, Typography, Box, CircularProgress, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip
} from '@mui/material';
import { 
  Warehouse as WarehouseIcon, 
  Store as StoreIcon, 
  Public as ExternalIcon // Using Globe/Public icon for Online/External
} from '@mui/icons-material';
import { getProductStock, type ProductStockInfo, type BatchInfo } from '../services/inventoryService';

interface StockDetailsProps {
  open: boolean;
  onClose: () => void;
  productId: number | null;
}

export const StockDetailsDialog: React.FC<StockDetailsProps> = ({ open, onClose, productId }) => {
  const [stockInfo, setStockInfo] = useState<ProductStockInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && productId) {
      setLoading(true);
      getProductStock(productId)
        .then(data => setStockInfo(data))
        .catch(err => console.error("Failed to load stock", err))
        .finally(() => setLoading(false));
    } else {
      setStockInfo(null);
    }
  }, [open, productId]);

  // --- Helper to render a table section ---
  const renderBatchTable = (title: string, icon: React.ReactNode, batches: BatchInfo[], color: string) => {
    if (batches.length === 0) return null;

    return (
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: color }}>
          {icon}
          <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'text.primary' }}>
            {title}
          </Typography>
          <Chip label={`${batches.reduce((sum, b) => sum + b.quantity, 0)} units`} size="small" sx={{ fontWeight: 600, height: 20 }} />
        </Box>
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0' }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f8fafc' }}>
              <TableRow>
                <TableCell><strong>Location Name</strong></TableCell>
                <TableCell><strong>Batch Code</strong></TableCell>
                <TableCell><strong>Expiry Date</strong></TableCell>
                <TableCell align="right"><strong>Quantity</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {batches.map((batch) => (
                <TableRow key={batch.id} hover>
                  <TableCell>{batch.location_name}</TableCell>
                  <TableCell>
                    <Chip label={batch.batch_code} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
                  </TableCell>
                  <TableCell>
                    {batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString() : <span style={{ opacity: 0.5 }}>N/A</span>}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {batch.quantity}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  // --- Filter Logic ---
  const warehouses = stockInfo?.batches.filter(b => b.location_type === 'warehouse') || [];
  const external = stockInfo?.batches.filter(b => b.location_type === 'external') || [];
  const stores = stockInfo?.batches.filter(b => b.location_type === 'store') || [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1, borderBottom: '1px solid #f1f5f9' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6" fontWeight="bold">Stock Breakdown</Typography>
            <Typography variant="body2" color="text.secondary">
              {stockInfo?.product_name} ({stockInfo?.sku})
            </Typography>
          </Box>
          {stockInfo && (
            <Chip 
              label={`Total: ${stockInfo.total_quantity}`} 
              color="primary" 
              sx={{ fontWeight: 'bold', fontSize: '1rem' }} 
            />
          )}
        </Box>
      </DialogTitle>

      <DialogContent sx={{ py: 3 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : !stockInfo || stockInfo.batches.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">No stock available for this product.</Typography>
          </Box>
        ) : (
          <Box>
            {/* 1. Warehouses */}
            {renderBatchTable('Warehouses', <WarehouseIcon />, warehouses, '#6366f1')}

            {/* 2. External Locations (e.g., Amazon FBA) */}
            {renderBatchTable('External Platforms', <ExternalIcon />, external, '#f59e0b')}

            {/* 3. In-Store Locations */}
            {renderBatchTable('In-Store Inventory', <StoreIcon />, stores, '#10b981')}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} variant="outlined" color="inherit">Close</Button>
      </DialogActions>
    </Dialog>
  );
};