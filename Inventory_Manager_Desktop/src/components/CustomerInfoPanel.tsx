import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, TextField, Typography, Chip, Button, CircularProgress
} from '@mui/material';
import {
  Person as PersonIcon,
  Star as StarIcon
} from '@mui/icons-material';

interface CustomerInfoPanelProps {
  // Controlled values from parent (used when parent resets or loads a held order)
  customerPhone: string;
  customerName: string;
  customerId: number | null;
  customerPoints: number;
  customerLookupLoading: boolean;

  // Callbacks
  onPhoneChange: (phone: string) => void;
  onNameChange: (name: string) => void;
  onPhoneLookup: (phone: string) => void;
  onAddCustomerClick: () => void;
}

const CustomerInfoPanelInner: React.FC<CustomerInfoPanelProps> = ({
  customerPhone,
  customerName,
  customerId,
  customerPoints,
  customerLookupLoading,
  onPhoneChange,
  onNameChange,
  onPhoneLookup,
  onAddCustomerClick
}) => {
  // Local state for fast typing — synced from parent on external changes
  const [localPhone, setLocalPhone] = useState(customerPhone);
  const [localName, setLocalName] = useState(customerName);

  // Sync local state when parent pushes new values (e.g., held order resume, lookup auto-fill)
  useEffect(() => {
    setLocalPhone(customerPhone);
  }, [customerPhone]);

  useEffect(() => {
    setLocalName(customerName);
  }, [customerName]);

  // Flush local phone to parent on blur
  const handlePhoneBlur = useCallback(() => {
    if (localPhone !== customerPhone) {
      onPhoneChange(localPhone);
    }
    onPhoneLookup(localPhone);
  }, [localPhone, customerPhone, onPhoneChange, onPhoneLookup]);

  // Flush local name to parent on blur
  const handleNameBlur = useCallback(() => {
    if (localName !== customerName) {
      onNameChange(localName);
    }
  }, [localName, customerName, onNameChange]);

  return (
    <Box sx={{ p: 1.5, bgcolor: customerId ? '#e8f5e9' : '#f0f9ff', borderTop: '1px solid #e0e0e0' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <PersonIcon sx={{ color: customerId ? '#4caf50' : '#667eea' }} />
          <Typography variant="caption" color="text.secondary">
            {customerId ? 'Loyalty Customer' : 'Customer (Optional)'}
          </Typography>
          {customerPoints > 0 && (
            <Chip
              icon={<StarIcon sx={{ fontSize: 14 }} />}
              label={`${customerPoints} pts`}
              size="small"
              color="warning"
              sx={{ height: 20, fontSize: 11 }}
            />
          )}
        </Box>
        <Button
          size="small"
          variant="text"
          onClick={onAddCustomerClick}
          sx={{ fontSize: 11, minWidth: 'auto' }}
        >
          + New
        </Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
        <TextField
          size="small"
          placeholder="Phone (lookup)"
          value={localPhone}
          onChange={(e) => setLocalPhone(e.target.value)}
          onBlur={handlePhoneBlur}
          fullWidth
          sx={{ bgcolor: 'white' }}
          InputProps={{
            endAdornment: customerLookupLoading ? <CircularProgress size={16} /> : null
          }}
        />
        <TextField
          size="small"
          placeholder="Name"
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={handleNameBlur}
          fullWidth
          sx={{ bgcolor: 'white' }}
          disabled={!!customerId}
        />
      </Box>
    </Box>
  );
};

export const CustomerInfoPanel = React.memo(CustomerInfoPanelInner);

export default CustomerInfoPanel;
