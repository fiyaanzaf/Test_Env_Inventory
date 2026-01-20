import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, List, ListItem, ListItemText,
    Typography, Chip, Box, IconButton, CircularProgress, Alert
} from '@mui/material';
import {
    LocalShipping as ShippingIcon,
    Close as CloseIcon,
    SwapHoriz as TransferIcon,
    Inventory as ShelfIcon
} from '@mui/icons-material';
import { getShelfRestockAlerts, type SystemAlert } from '../services/systemService';

interface ShelfRestockDialogProps {
    open: boolean;
    onClose: () => void;
    onTransfer: (productName: string) => void;
}

export const ShelfRestockDialog: React.FC<ShelfRestockDialogProps> = ({ open, onClose, onTransfer }) => {
    const [alerts, setAlerts] = useState<SystemAlert[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            fetchAlerts();
        }
    }, [open]);

    const fetchAlerts = async () => {
        setLoading(true);
        try {
            const data = await getShelfRestockAlerts();
            setAlerts(data);
        } catch (error) {
            console.error('Failed to fetch shelf restock alerts', error);
        } finally {
            setLoading(false);
        }
    };

    // Extract product name from alert message
    // Message format: "SHELF RESTOCK NEEDED: 'Product Name' has only X units on shelf..."
    const extractProductName = (message: string): string => {
        const match = message.match(/SHELF RESTOCK NEEDED: '([^']+)'/);
        return match ? match[1] : 'Unknown Product';
    };

    const extractShelfCount = (message: string): number => {
        const match = message.match(/has only (\d+) units on shelf/);
        return match ? parseInt(match[1]) : 0;
    };

    const handleTransfer = (alert: SystemAlert) => {
        const productName = extractProductName(alert.message);
        onClose();
        onTransfer(productName);
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#0288d1', fontWeight: 'bold', pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <ShelfIcon />
                    Shelf Restock Needed
                </Box>
                <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
            </DialogTitle>

            <Alert severity="info" sx={{ mx: 2 }}>
                These products need to be transferred from warehouse to store shelf.
            </Alert>

            <DialogContent sx={{ p: 0 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
                ) : alerts.length === 0 ? (
                    <Box sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
                        <Typography variant="h6">All shelves are stocked! 🎉</Typography>
                        <Typography variant="body2">No products need restocking at the moment.</Typography>
                    </Box>
                ) : (
                    <List>
                        {alerts.map((alert) => {
                            const productName = extractProductName(alert.message);
                            const shelfCount = extractShelfCount(alert.message);

                            return (
                                <ListItem
                                    key={alert.id}
                                    sx={{
                                        px: 2, py: 1.5,
                                        borderBottom: '1px solid #eee',
                                        '&:hover': { bgcolor: '#f5f5f5' }
                                    }}
                                >
                                    <ListItemText
                                        primary={
                                            <Typography fontWeight="600" color="text.primary">
                                                {productName}
                                            </Typography>
                                        }
                                        secondary={
                                            <Typography variant="caption" color="text.secondary">
                                                {new Date(alert.created_at).toLocaleString()}
                                            </Typography>
                                        }
                                    />
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Chip
                                            icon={<ShelfIcon sx={{ fontSize: 16 }} />}
                                            label={`${shelfCount} on shelf`}
                                            size="small"
                                            color={shelfCount === 0 ? "error" : "warning"}
                                            variant="outlined"
                                        />
                                        <Button
                                            size="small"
                                            variant="contained"
                                            color="primary"
                                            startIcon={<TransferIcon />}
                                            onClick={() => handleTransfer(alert)}
                                            sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
                                        >
                                            Transfer
                                        </Button>
                                    </Box>
                                </ListItem>
                            );
                        })}
                    </List>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2, borderTop: '1px solid #eee' }}>
                <Button onClick={onClose} color="inherit">Close</Button>
            </DialogActions>
        </Dialog>
    );
};
