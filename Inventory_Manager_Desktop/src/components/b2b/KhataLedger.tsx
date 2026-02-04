import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Chip, CircularProgress,
  Avatar, Tooltip
} from '@mui/material';
import {
  ArrowDownward as DebitIcon,
  ArrowUpward as CreditIcon,
  Receipt as OrderIcon,
  AccountBalanceWallet as PaymentIcon
} from '@mui/icons-material';
import { b2bService } from '../../services/b2bService';
import type { KhataTransaction } from '../../services/b2bService';

interface KhataLedgerProps {
  clientId: number;
  refreshTrigger?: number;
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const KhataLedger: React.FC<KhataLedgerProps> = ({ clientId, refreshTrigger }) => {
  const [transactions, setTransactions] = useState<KhataTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTransactions();
  }, [clientId, refreshTrigger]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const data = await b2bService.getLedger(clientId, 100);
      setTransactions(data);
    } catch (error) {
      console.error('Failed to load ledger:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (transactions.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography color="text.secondary">
          No transactions yet. Create an order to start the khata.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxHeight: 400, overflowY: 'auto', pr: 1 }}>
      {transactions.map((txn) => {
        const isSale = txn.type === 'SALE';
        const color = isSale ? '#ef4444' : '#22c55e';
        const bgColor = isSale ? '#fef2f2' : '#f0fdf4';
        const Icon = isSale ? DebitIcon : CreditIcon;
        const TypeIcon = isSale ? OrderIcon : PaymentIcon;

        return (
          <Box key={txn.id}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                mb: 1,
                bgcolor: bgColor,
                borderLeft: `4px solid ${color}`,
                display: 'flex',
                alignItems: 'center',
                gap: 2
              }}
            >
              {/* Icon */}
              <Avatar sx={{ bgcolor: `${color}20`, color: color, width: 40, height: 40 }}>
                <Icon />
              </Avatar>

              {/* Content */}
              <Box sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Chip
                    size="small"
                    icon={<TypeIcon sx={{ fontSize: 16 }} />}
                    label={isSale ? 'Sale' : 'Payment'}
                    sx={{
                      bgcolor: color,
                      color: 'white',
                      fontWeight: 600,
                      '& .MuiChip-icon': { color: 'white' }
                    }}
                  />
                  {txn.related_order_id && (
                    <Tooltip title="View Order">
                      <Chip
                        size="small"
                        label={`Order #${txn.related_order_id}`}
                        variant="outlined"
                        sx={{ fontSize: '0.7rem' }}
                      />
                    </Tooltip>
                  )}
                  {txn.payment_mode && (
                    <Chip
                      size="small"
                      label={txn.payment_mode.toUpperCase()}
                      variant="outlined"
                      color="primary"
                      sx={{ fontSize: '0.7rem' }}
                    />
                  )}
                </Box>

                <Typography variant="body2" color="text.secondary">
                  {formatDate(txn.created_at)}
                  {txn.created_by_name && ` • by ${txn.created_by_name}`}
                </Typography>

                {txn.notes && (
                  <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                    {txn.notes}
                  </Typography>
                )}

                {txn.payment_reference && (
                  <Typography variant="caption" color="text.secondary">
                    Ref: {txn.payment_reference}
                  </Typography>
                )}
              </Box>

              {/* Amount & Balance */}
              <Box sx={{ textAlign: 'right', minWidth: 120 }}>
                <Typography
                  variant="h6"
                  fontWeight="bold"
                  sx={{ color: color }}
                >
                  {isSale ? '+' : '-'}₹{txn.amount.toLocaleString()}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Bal: ₹{txn.running_balance.toLocaleString()}
                </Typography>
              </Box>
            </Paper>
          </Box>
        );
      })}
    </Box>
  );
};

export default KhataLedger;
