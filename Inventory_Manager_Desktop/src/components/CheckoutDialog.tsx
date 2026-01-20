import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, RadioGroup, FormControlLabel, Radio, 
  Typography, Box, Divider, Checkbox, List, ListItem, ListItemText, Paper
} from '@mui/material';
import { Print as PrintIcon, Person as PersonIcon, ShoppingCart as CartIcon } from '@mui/icons-material';
import { type CartItem } from '../services/posService';

interface CheckoutProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (method: string, reference: string, shouldPrint: boolean) => void;
  totalAmount: number;
  customerName?: string;
  customerPhone?: string;
  items?: CartItem[];
}

export const CheckoutDialog: React.FC<CheckoutProps> = ({ 
  open, onClose, onConfirm, totalAmount,
  customerName, customerPhone, items = []
}) => {
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  // Default print to FALSE for manual stores (speed), or TRUE if you prefer.
  const [shouldPrint, setShouldPrint] = useState(true); 

  useEffect(() => {
    if (open) {
      setMethod('cash');
      setReference('');
      // setShouldPrint(true); // Uncomment if you want it checked by default every time
    }
  }, [open]);

  const handleComplete = () => {
    onConfirm(method, reference, shouldPrint);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Checkout</Typography>
        <FormControlLabel
          control={<Checkbox checked={shouldPrint} onChange={(e) => setShouldPrint(e.target.checked)} />}
          label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><PrintIcon fontSize="small"/> Print Receipt</Box>}
        />
      </DialogTitle>
      
      <DialogContent>
        {/* Customer & Items Summary */}
        <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Customer Info */}
            {(customerName || customerPhone) && (
                <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2, bgcolor: '#f8f9fa' }}>
                    <PersonIcon color="action" />
                    <Box>
                        <Typography variant="subtitle2">{customerName || 'Walk-in Customer'}</Typography>
                        <Typography variant="caption" color="text.secondary">{customerPhone || 'No Phone'}</Typography>
                    </Box>
                </Paper>
            )}

            {/* Items Preview */}
            {items.length > 0 && (
                <Paper variant="outlined" sx={{ maxHeight: 150, overflowY: 'auto' }}>
                    <List dense disablePadding>
                        {items.map((item, index) => (
                            <React.Fragment key={item.id}>
                                <ListItem>
                                    <ListItemText 
                                        primary={item.name} 
                                        secondary={`${item.cartQty} x ₹${item.price}`} 
                                    />
                                    <Typography variant="body2" fontWeight="bold">
                                        ₹{item.price * item.cartQty}
                                    </Typography>
                                </ListItem>
                                {index < items.length - 1 && <Divider component="li" />}
                            </React.Fragment>
                        ))}
                    </List>
                </Paper>
            )}
        </Box>

        {/* Total Amount Banner */}
        <Box sx={{ bgcolor: '#e8f5e9', p: 2, borderRadius: 2, textAlign: 'center', mb: 2 }}>
            <Typography variant="h4" color="success.main" fontWeight="bold">
                ₹{totalAmount.toLocaleString()}
            </Typography>
        </Box>

        <Box sx={{ mt: 1 }}>
          <Typography variant="subtitle2" gutterBottom>Payment Method</Typography>
          <RadioGroup row value={method} onChange={(e) => setMethod(e.target.value)}>
            <FormControlLabel value="cash" control={<Radio />} label="Cash" />
            <FormControlLabel value="upi" control={<Radio />} label="UPI / QR" />
            <FormControlLabel value="card" control={<Radio />} label="Card" />
          </RadioGroup>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* PAYMENT REFERENCE - Only for Card/UPI to keep Cash flow fast */}
        {method !== 'cash' && (
            <Box>
                <TextField 
                  label="Payment Reference (Optional)"
                  placeholder="e.g. UPI Transaction ID / Bank Auth Code"
                  fullWidth 
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  helperText="Record the payment proof ID here"
                />
            </Box>
        )}
        
        {method === 'cash' && (
             <Typography variant="body2" color="text.secondary" align="center" sx={{ fontStyle: 'italic' }}>
                Cash Sale selected. Click Complete to generate Bill #.
             </Typography>
        )}

      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} color="inherit" size="large">Cancel</Button>
        <Button 
          onClick={handleComplete} 
          variant="contained" 
          size="large"
          fullWidth
        >
          Complete Sale (F9)
        </Button>
      </DialogActions>
    </Dialog>
  );
};
