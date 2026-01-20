import React, { useEffect, useState } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, Box, Typography, Chip, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper
} from '@mui/material';
import { getWriteOffHistory, type WriteOffEvent } from '../services/inventoryService';
import { History as HistoryIcon } from '@mui/icons-material';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const WriteOffHistoryDialog: React.FC<Props> = ({ open, onClose }) => {
  const [history, setHistory] = useState<WriteOffEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      getWriteOffHistory()
        .then(setHistory)
        .catch(err => console.error("Failed to load history", err))
        .finally(() => setLoading(false));
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <HistoryIcon color="error" />
        <Typography variant="h6" fontWeight="bold">Write-off History</Typography>
      </DialogTitle>
      
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : history.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">No write-off records found.</Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', mt: 1 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Date</strong></TableCell>
                  <TableCell><strong>Product</strong></TableCell>
                  <TableCell><strong>Location</strong></TableCell>
                  <TableCell><strong>Reason</strong></TableCell>
                  <TableCell align="right"><strong>Loss Qty</strong></TableCell>
                  <TableCell align="right"><strong>By</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                      {new Date(row.write_off_date).toLocaleDateString()}<br/>
                      {new Date(row.write_off_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="600">{row.product_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{row.sku}</Typography>
                    </TableCell>
                    <TableCell>
                      {row.location_name}
                      <Typography variant="caption" display="block" color="text.secondary">{row.batch_code}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={row.reason} size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#ef4444', fontWeight: 'bold' }}>
                      -{row.quantity_removed}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.85rem' }}>
                      {row.performed_by}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};