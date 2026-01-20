import React, { useState } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, Button, 
  Tabs, Tab, Box, Typography, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, Chip, IconButton, 
  Alert, TextField, InputAdornment, CircularProgress 
} from '@mui/material'; // <--- Added Alert here
import { WarningAmber, ErrorOutline, Close as CloseIcon, FilterList, Refresh, DeleteSweep } from '@mui/icons-material';
import { type ExpiryReportItem, writeOffStock } from '../services/inventoryService';

interface Props {
  open: boolean;
  onClose: () => void;
  expiredItems: ExpiryReportItem[];
  nearExpiryItems: ExpiryReportItem[];
  onFilterChange: (days: number) => void; // <--- Fixed type definition
  onRefresh: () => void;
}

export const ExpiryAlertDialog: React.FC<Props> = ({ 
  open, onClose, expiredItems, nearExpiryItems, onFilterChange, onRefresh 
}) => {
  const [tabIndex, setTabIndex] = useState(0);
  const [daysInput, setDaysInput] = useState('30');
  const [processing, setProcessing] = useState(false);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue);
  };

  const handleApplyFilter = () => {
    const days = parseInt(daysInput);
    if (!isNaN(days) && days > 0) {
      onFilterChange(days);
    }
  };

  const handleBulkWriteOff = async () => {
    if (!window.confirm(`Are you sure you want to write off all ${expiredItems.length} expired items? This cannot be undone.`)) {
      return;
    }

    setProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const item of expiredItems) {
      try {
        await writeOffStock({
          batch_id: item.batch_id,
          quantity_to_remove: item.quantity,
          reason: 'Expired'
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to write off ${item.product_name} (Batch: ${item.batch_code})`, error);
        failCount++;
      }
    }

    setProcessing(false);
    onRefresh();

    if (failCount > 0) {
      alert(`Operation completed with warnings.\n\nSuccessfully removed: ${successCount}\nFailed to remove: ${failCount}\n\nCheck the console logs for details.`);
    }
  };

  const renderTable = (items: ExpiryReportItem[], isExpired: boolean) => (
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', maxHeight: 400 }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>Product</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Batch Info</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Expiry</TableCell>
            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Qty</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                No items found.
              </TableCell>
            </TableRow>
          ) : (
            items.map((item, index) => (
              <TableRow key={index} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight="600">{item.product_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.supplier}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{item.batch_code}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.location}</Typography>
                </TableCell>
                <TableCell>
                  <Chip 
                    label={`${new Date(item.expiry_date).toLocaleDateString()} (${Math.abs(item.days_left)}d)`} 
                    size="small" 
                    color={isExpired ? "error" : "warning"} 
                    variant="outlined"
                    icon={isExpired ? <ErrorOutline /> : <WarningAmber />}
                  />
                </TableCell>
                <TableCell align="right">
                  <Typography fontWeight="bold">{item.quantity}</Typography>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 0 }}>
        <Typography variant="h6" fontWeight="bold">Expiry Alerts</Typography>
        <IconButton onClick={onClose} disabled={processing}><CloseIcon /></IconButton>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={tabIndex} onChange={handleTabChange} variant="fullWidth">
            <Tab 
              label={`Expired (${expiredItems.length})`} 
              icon={<ErrorOutline />} 
              iconPosition="start" 
              sx={{ color: '#ef4444', '&.Mui-selected': { color: '#dc2626' } }} 
            />
            <Tab 
              label={`Nearing Expiry (${nearExpiryItems.length})`} 
              icon={<WarningAmber />} 
              iconPosition="start" 
              sx={{ color: '#f59e0b', '&.Mui-selected': { color: '#d97706' } }} 
            />
          </Tabs>
        </Box>

        {tabIndex === 0 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Alert severity="error" sx={{ flex: 1, mr: 2 }}>
                These items are past expiry. 
                </Alert>
                {expiredItems.length > 0 && (
                    <Button 
                        variant="contained" 
                        color="error" 
                        startIcon={processing ? <CircularProgress size={20} color="inherit"/> : <DeleteSweep />}
                        onClick={handleBulkWriteOff}
                        disabled={processing}
                    >
                        {processing ? `Processing (${expiredItems.length})...` : 'Write Off All'}
                    </Button>
                )}
            </Box>
            {renderTable(expiredItems, true)}
          </Box>
        )}

        {tabIndex === 1 && (
          <Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', bgcolor: '#fffbeb', p: 2, borderRadius: 2 }}>
              <FilterList color="action" />
              <Typography variant="body2" fontWeight="500" sx={{ whiteSpace: 'nowrap' }}>
                Show items expiring in:
              </Typography>
              
              <TextField 
                size="small"
                type="number"
                value={daysInput}
                onChange={(e) => setDaysInput(e.target.value)}
                sx={{ width: 160, bgcolor: 'white' }}
                InputProps={{
                  endAdornment: <InputAdornment position="end" sx={{ marginLeft: 1 }}>Days</InputAdornment>,
                }}
              />
              
              <Button 
                variant="contained" 
                size="small" 
                onClick={handleApplyFilter}
                startIcon={<Refresh />}
                sx={{ bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' }, minWidth: 100 }}
              >
                Update
              </Button>
            </Box>

            {renderTable(nearExpiryItems, false)}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={processing}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};