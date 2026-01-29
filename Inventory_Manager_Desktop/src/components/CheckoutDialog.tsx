import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, RadioGroup, FormControlLabel, Radio,
  Typography, Box, Divider, Checkbox, List, ListItem, ListItemText, Paper,
  Slider, Chip
} from '@mui/material';
import { Print as PrintIcon, Person as PersonIcon, Star as StarIcon } from '@mui/icons-material';
import { type CartItem } from '../services/posService';

interface CheckoutProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (method: string, reference: string, shouldPrint: boolean, pointsRedeemed: number, customerId: number | null) => void;
  totalAmount: number;
  customerName?: string;
  customerPhone?: string;
  items?: CartItem[];
  // NEW: Loyalty props
  customerId?: number | null;
  customerPoints?: number;
}

export const CheckoutDialog: React.FC<CheckoutProps> = ({
  open, onClose, onConfirm, totalAmount,
  customerName, customerPhone, items = [],
  customerId = null, customerPoints = 0
}) => {
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [shouldPrint, setShouldPrint] = useState(true);

  // NEW: Points redemption state
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [usePoints, setUsePoints] = useState(false);

  // Points value (1 point = 1 rupee)
  const POINT_VALUE = 1;

  // Maximum redeemable (can't exceed bill or available points)
  const maxRedeemablePoints = Math.min(customerPoints, Math.floor(totalAmount / POINT_VALUE));

  // Calculated values
  const discountFromPoints = pointsToRedeem * POINT_VALUE;
  const adjustedTotal = totalAmount - discountFromPoints;

  useEffect(() => {
    if (open) {
      setMethod('cash');
      setReference('');
      setPointsToRedeem(0);
      setUsePoints(false);
    }
  }, [open]);

  const handlePointsToggle = (checked: boolean) => {
    setUsePoints(checked);
    if (!checked) {
      setPointsToRedeem(0);
    }
  };

  const handleComplete = () => {
    const finalPointsRedeemed = usePoints ? pointsToRedeem : 0;
    onConfirm(method, reference, shouldPrint, finalPointsRedeemed, customerId);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Checkout</Typography>
        <FormControlLabel
          control={<Checkbox checked={shouldPrint} onChange={(e) => setShouldPrint(e.target.checked)} />}
          label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><PrintIcon fontSize="small" /> Print Receipt</Box>}
        />
      </DialogTitle>

      <DialogContent>
        {/* Customer & Items Summary */}
        <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Customer Info with Points */}
          {(customerName || customerPhone) && (
            <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: customerId ? '#e8f5e9' : '#f8f9fa' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <PersonIcon color={customerId ? 'success' : 'action'} />
                <Box>
                  <Typography variant="subtitle2">{customerName || 'Walk-in Customer'}</Typography>
                  <Typography variant="caption" color="text.secondary">{customerPhone || 'No Phone'}</Typography>
                </Box>
              </Box>
              {customerPoints > 0 && (
                <Chip
                  icon={<StarIcon sx={{ fontSize: 16 }} />}
                  label={`${customerPoints} pts`}
                  color="warning"
                  size="small"
                />
              )}
            </Paper>
          )}

          {/* Items Preview */}
          {items.length > 0 && (
            <Paper variant="outlined" sx={{ maxHeight: 120, overflowY: 'auto' }}>
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

        {/* LOYALTY POINTS REDEMPTION */}
        {customerId && customerPoints > 0 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: '#fff8e1', border: '1px solid #ffb74d' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StarIcon color="warning" />
                <Typography variant="subtitle2">Redeem Loyalty Points</Typography>
              </Box>
              <Checkbox
                checked={usePoints}
                onChange={(e) => handlePointsToggle(e.target.checked)}
                size="small"
              />
            </Box>

            {usePoints && (
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="caption">Points to redeem:</Typography>
                  <TextField
                    type="number"
                    size="small"
                    value={pointsToRedeem}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setPointsToRedeem(Math.min(Math.max(0, val), maxRedeemablePoints));
                    }}
                    sx={{ width: 100 }}
                    inputProps={{ min: 0, max: maxRedeemablePoints, style: { textAlign: 'center' } }}
                  />
                </Box>
                <Slider
                  value={pointsToRedeem}
                  onChange={(_, value) => setPointsToRedeem(value as number)}
                  max={maxRedeemablePoints}
                  step={1}
                  valueLabelDisplay="auto"
                  sx={{ color: '#ff9800' }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary">
                    Max: {maxRedeemablePoints} (Available: {customerPoints})
                  </Typography>
                  <Typography variant="body2" fontWeight="bold" color="warning.main">
                    = ₹{discountFromPoints} off
                  </Typography>
                </Box>
              </Box>
            )}
          </Paper>
        )}

        {/* Total Amount Banner */}
        <Box sx={{ bgcolor: '#e8f5e9', p: 2, borderRadius: 2, textAlign: 'center', mb: 2 }}>
          {discountFromPoints > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="body2" sx={{ textDecoration: 'line-through', color: 'text.secondary' }}>
                ₹{totalAmount.toLocaleString()}
              </Typography>
              <Chip label={`-₹${discountFromPoints} (${pointsToRedeem} pts)`} size="small" color="warning" />
            </Box>
          )}
          <Typography variant="h4" color="success.main" fontWeight="bold">
            ₹{adjustedTotal.toLocaleString()}
          </Typography>
          {discountFromPoints > 0 && (
            <Typography variant="caption" color="text.secondary">After points discount</Typography>
          )}
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
