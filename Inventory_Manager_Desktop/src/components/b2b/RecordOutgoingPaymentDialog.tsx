import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Button, Box, Typography, Alert,
    MenuItem, InputAdornment
} from '@mui/material';
import { Payment as PaymentIcon } from '@mui/icons-material';
import { b2bService } from '../../services/b2bService';
import type { B2BClient, RecordPaymentOutRequest } from '../../services/b2bService';

interface RecordOutgoingPaymentDialogProps {
    open: boolean;
    client: B2BClient | null;
    onClose: () => void;
    onSuccess: () => void;
}

export const RecordOutgoingPaymentDialog: React.FC<RecordOutgoingPaymentDialogProps> = ({
    open,
    client,
    onClose,
    onSuccess
}) => {
    const [amount, setAmount] = useState('');
    const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'cheque' | 'bank_transfer'>('cash');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!client || !amount) return;

        setLoading(true);
        setError(null);

        try {
            const paymentData: RecordPaymentOutRequest = {
                client_id: client.id,
                amount: parseFloat(amount),
                payment_mode: paymentMode,
                payment_reference: reference || undefined,
                notes: notes || undefined
            };

            await b2bService.recordOutgoingPayment(paymentData);
            onSuccess();
            handleClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to record payment');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setAmount('');
        setPaymentMode('cash');
        setReference('');
        setNotes('');
        setError(null);
        onClose();
    };

    if (!client) return null;

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PaymentIcon color="primary" />
                Pay {client.name}
            </DialogTitle>

            <DialogContent>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <Box sx={{ mb: 3, p: 2, bgcolor: 'primary.50', borderRadius: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        Current Balance (They Owe Us):
                    </Typography>
                    <Typography
                        variant="h6"
                        fontWeight="bold"
                        color={client.current_balance >= 0 ? 'success.main' : 'error.main'}
                    >
                        ₹{client.current_balance.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Making a payment will increase this balance (reducing your debt to them).
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                        label="Amount to Pay"
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        fullWidth
                        required
                        InputProps={{
                            startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                        }}
                    />

                    <TextField
                        select
                        label="Payment Mode"
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value as any)}
                        fullWidth
                    >
                        <MenuItem value="cash">Cash</MenuItem>
                        <MenuItem value="upi">UPI</MenuItem>
                        <MenuItem value="cheque">Cheque</MenuItem>
                        <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                    </TextField>

                    <TextField
                        label="Reference (Optional)"
                        placeholder="Transaction ID / Cheque No."
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        fullWidth
                    />

                    <TextField
                        label="Notes"
                        multiline
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        fullWidth
                    />
                </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={handleClose} disabled={loading}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={loading || !amount}
                    startIcon={<PaymentIcon />}
                >
                    {loading ? 'Processing...' : 'Record Payment'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default RecordOutgoingPaymentDialog;
