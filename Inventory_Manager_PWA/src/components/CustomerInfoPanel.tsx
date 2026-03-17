import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, TextField, Typography, Chip, CircularProgress
} from '@mui/material';
import {
  Person as PersonIcon,
  Star as StarIcon
} from '@mui/icons-material';

interface CustomerInfoPanelProps {
  customerPhone: string;
  customerName: string;
  customerId: number | null;
  customerPoints: number;
  customerLookupLoading: boolean;

  onPhoneChange: (phone: string) => void;
  onNameChange: (name: string) => void;
  onPhoneLookup: (phone: string) => void;
}

const CustomerInfoPanelInner: React.FC<CustomerInfoPanelProps> = ({
  customerPhone,
  customerName,
  customerId,
  customerPoints,
  customerLookupLoading,
  onPhoneChange,
  onNameChange,
  onPhoneLookup
}) => {
  const [localPhone, setLocalPhone] = useState(customerPhone);
  const [localName, setLocalName] = useState(customerName);

  useEffect(() => {
    setLocalPhone(customerPhone);
  }, [customerPhone]);

  useEffect(() => {
    setLocalName(customerName);
  }, [customerName]);

  const handlePhoneBlur = useCallback(() => {
    if (localPhone !== customerPhone) {
      onPhoneChange(localPhone);
    }
    onPhoneLookup(localPhone);
  }, [localPhone, customerPhone, onPhoneChange, onPhoneLookup]);

  const handleNameBlur = useCallback(() => {
    if (localName !== customerName) {
      onNameChange(localName);
    }
  }, [localName, customerName, onNameChange]);

  return (
    <Box sx={{ mt: 2, p: 1.5, bgcolor: customerId ? '#e8f5e9' : '#f0f9ff', borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <PersonIcon fontSize="small" color={customerId ? 'success' : 'primary'} />
        <Typography variant="caption" fontWeight={500}>
          {customerId ? 'Loyalty Customer' : 'Customer (Optional)'}
        </Typography>
        {customerPoints > 0 && (
          <Chip
            icon={<StarIcon sx={{ fontSize: 12 }} />}
            label={`${customerPoints} pts`}
            size="small"
            color="warning"
            sx={{ height: 20, fontSize: '0.65rem' }}
          />
        )}
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          size="small"
          placeholder="Phone"
          value={localPhone}
          onChange={e => setLocalPhone(e.target.value)}
          onBlur={handlePhoneBlur}
          fullWidth
          sx={{ bgcolor: 'white' }}
          InputProps={{ endAdornment: customerLookupLoading ? <CircularProgress size={14} /> : null }}
        />
        <TextField
          size="small"
          placeholder="Name"
          value={localName}
          onChange={e => setLocalName(e.target.value)}
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
