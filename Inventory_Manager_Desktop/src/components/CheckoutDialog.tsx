import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, RadioGroup, FormControlLabel, Radio,
  Typography, Box, Divider, Checkbox, List, ListItem, ListItemText, Paper,
  Slider, Chip, Alert, CircularProgress
} from '@mui/material';
import { Print as PrintIcon, Person as PersonIcon, Star as StarIcon, AccountBalance as KhataIcon, PersonAdd as PersonAddIcon } from '@mui/icons-material';
import { type CartItem } from '../services/posService';
import { lookupCustomerByPhone, createKhataCustomer, type CustomerLookupResult } from '../services/khataService';

interface CheckoutProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (method: string, reference: string, shouldPrint: boolean, pointsRedeemed: number, customerId: number | null, khataCustomerId?: number | null) => void;
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

  // NEW: Khata (Credit) state
  const [khataPhone, setKhataPhone] = useState('');
  const [khataCustomer, setKhataCustomer] = useState<CustomerLookupResult | null>(null);
  const [khataLoading, setKhataLoading] = useState(false);
  const [khataError, setKhataError] = useState<string | null>(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerLimit, setNewCustomerLimit] = useState(5000);
  const [creatingCustomer, setCreatingCustomer] = useState(false);

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
      setKhataPhone(customerPhone || '');
      setKhataCustomer(null);
      setKhataError(null);
      setShowCreateCustomer(false);
      setNewCustomerName(customerName || '');
      setNewCustomerLimit(5000);
    }
  }, [open, customerPhone, customerName]);

  // Auto-lookup khata customer when phone changes and credit is selected
  useEffect(() => {
    if (method === 'credit' && khataPhone.length >= 10) {
      handleKhataLookup();
    } else if (method !== 'credit') {
      setKhataCustomer(null);
      setKhataError(null);
    }
  }, [method, khataPhone]);

  const handleKhataLookup = async () => {
    if (!khataPhone || khataPhone.length < 10) return;
    
    setKhataLoading(true);
    setKhataError(null);
    setShowCreateCustomer(false);
    try {
      const result = await lookupCustomerByPhone(khataPhone);
      if (result) {
        setKhataCustomer(result);
        if (!result.can_purchase) {
          setKhataError(result.warning_message || 'Customer cannot make credit purchases');
        } else if (result.available_credit < adjustedTotal) {
          setKhataError(`Insufficient credit. Available: ₹${result.available_credit.toFixed(2)}, Required: ₹${adjustedTotal.toFixed(2)}`);
        }
      } else {
        setKhataCustomer(null);
        setShowCreateCustomer(true);
        setNewCustomerName(customerName || '');
      }
    } catch {
      setKhataError('Failed to lookup customer');
    } finally {
      setKhataLoading(false);
    }
  };

  const handleCreateKhataCustomer = async () => {
    if (!newCustomerName.trim() || !khataPhone) {
      setKhataError('Name and phone are required');
      return;
    }
    
    setCreatingCustomer(true);
    setKhataError(null);
    try {
      const created = await createKhataCustomer({
        name: newCustomerName.trim(),
        phone: khataPhone,
        credit_limit: newCustomerLimit
      });
      
      // Set the customer for sale
      setKhataCustomer({
        id: created.id,
        name: created.name,
        phone: created.phone,
        current_balance: 0,
        credit_limit: created.credit_limit,
        available_credit: created.credit_limit,
        is_blocked: false,
        can_purchase: true,
        warning_message: null
      });
      setShowCreateCustomer(false);
    } catch (err: any) {
      setKhataError(err.response?.data?.detail || 'Failed to create customer');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const handlePointsToggle = (checked: boolean) => {
    setUsePoints(checked);
    if (!checked) {
      setPointsToRedeem(0);
    }
  };

  const handleComplete = () => {
    const finalPointsRedeemed = usePoints ? pointsToRedeem : 0;
    const khataId = method === 'credit' && khataCustomer ? khataCustomer.id : null;
    onConfirm(method, reference, shouldPrint, finalPointsRedeemed, customerId, khataId);
  };

  // Check if credit sale is valid
  const isCreditValid = method !== 'credit' || (khataCustomer && khataCustomer.can_purchase && khataCustomer.available_credit >= adjustedTotal);

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
            <FormControlLabel 
              value="credit" 
              control={<Radio />} 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <KhataIcon fontSize="small" color="success" />
                  Credit (Khata)
                </Box>
              } 
            />
          </RadioGroup>
        </Box>

        {/* KHATA CUSTOMER LOOKUP - Only for Credit */}
        {method === 'credit' && (
          <Paper variant="outlined" sx={{ p: 2, mt: 2, bgcolor: '#e8f5e9', border: '1px solid #4caf50' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <KhataIcon color="success" />
              <Typography variant="subtitle2">Khata Customer</Typography>
            </Box>
            
            <TextField
              fullWidth
              size="small"
              label="Customer Phone"
              value={khataPhone}
              onChange={(e) => setKhataPhone(e.target.value)}
              placeholder="Enter 10-digit phone number"
              sx={{ mb: 1 }}
            />
            
            {khataLoading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="caption">Looking up customer...</Typography>
              </Box>
            )}
            
            {khataCustomer && (
              <Box sx={{ mt: 1, p: 1.5, bgcolor: khataCustomer.can_purchase ? '#c8e6c9' : '#ffcdd2', borderRadius: 1 }}>
                <Typography variant="subtitle2">{khataCustomer.name}</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                  <Typography variant="caption">
                    Balance: <strong>₹{khataCustomer.current_balance.toLocaleString('en-IN')}</strong>
                  </Typography>
                  <Typography variant="caption">
                    Available: <strong style={{ color: khataCustomer.available_credit >= adjustedTotal ? 'green' : 'red' }}>
                      ₹{khataCustomer.available_credit.toLocaleString('en-IN')}
                    </strong>
                  </Typography>
                </Box>
              </Box>
            )}

            {/* CREATE NEW KHATA CUSTOMER - When phone not found */}
            {showCreateCustomer && !khataCustomer && (
              <Box sx={{ mt: 2, p: 2, bgcolor: '#fff3e0', borderRadius: 1, border: '1px solid #ff9800' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <PersonAddIcon color="warning" />
                  <Typography variant="subtitle2">Customer not found - Create New</Typography>
                </Box>
                <TextField
                  fullWidth
                  size="small"
                  label="Customer Name *"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="Enter customer name"
                  sx={{ mb: 1.5 }}
                />
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Credit Limit"
                  value={newCustomerLimit}
                  onChange={(e) => setNewCustomerLimit(Number(e.target.value))}
                  InputProps={{
                    startAdornment: <Typography sx={{ mr: 0.5 }}>₹</Typography>
                  }}
                  sx={{ mb: 1.5 }}
                />
                <Button
                  variant="contained"
                  color="warning"
                  fullWidth
                  startIcon={creatingCustomer ? <CircularProgress size={16} color="inherit" /> : <PersonAddIcon />}
                  onClick={handleCreateKhataCustomer}
                  disabled={creatingCustomer || !newCustomerName.trim()}
                >
                  {creatingCustomer ? 'Creating...' : 'Create & Continue'}
                </Button>
              </Box>
            )}
            
            {khataError && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {khataError}
              </Alert>
            )}
          </Paper>
        )}

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
          disabled={method === 'credit' && !isCreditValid}
        >
          {method === 'credit' 
            ? (isCreditValid ? 'Complete Credit Sale (F9)' : 'Select Valid Khata Customer')
            : 'Complete Sale (F9)'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
