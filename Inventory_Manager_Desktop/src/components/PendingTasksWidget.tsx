import React from 'react';
import {
    Paper, Typography, Box, List, ListItem, ListItemIcon, ListItemText,
    Button, Chip, Skeleton
} from '@mui/material';
import {
    Warning as WarningIcon,
    LocalShipping as RestockIcon,
    Inventory as LowStockIcon,
    ArrowForward,
    CheckCircle as DoneIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface Alert {
    id: number;
    severity: string;
    message: string;
    status: string;
    created_at: string;
}

interface PendingTasksWidgetProps {
    alerts: Alert[];
    loading: boolean;
    onTransferClick?: (alert: Alert) => void;
    onOrderClick?: (alert: Alert) => void;
}

export const PendingTasksWidget: React.FC<PendingTasksWidgetProps> = ({
    alerts,
    loading,
    onTransferClick,
    onOrderClick
}) => {
    const navigate = useNavigate();

    if (loading) {
        return (
            <Paper sx={{ p: 3, borderRadius: 3, boxShadow: 2 }}>
                <Skeleton variant="text" width={180} height={32} />
                <Box sx={{ mt: 2 }}>
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} variant="rectangular" height={60} sx={{ mb: 1, borderRadius: 2 }} />
                    ))}
                </Box>
            </Paper>
        );
    }

    const getAlertIcon = (message: string) => {
        if (message.includes('SHELF RESTOCK')) return <RestockIcon sx={{ color: '#f59e0b' }} />;
        if (message.includes('LOW STOCK')) return <LowStockIcon sx={{ color: '#ef4444' }} />;
        return <WarningIcon sx={{ color: '#6b7280' }} />;
    };

    const getAlertType = (message: string) => {
        if (message.includes('SHELF RESTOCK')) return 'Shelf Restock';
        if (message.includes('LOW STOCK')) return 'Low Stock';
        return 'Alert';
    };

    const getAlertColor = (message: string) => {
        if (message.includes('SHELF RESTOCK')) return { bg: '#fef3c7', text: '#92400e' };
        if (message.includes('LOW STOCK')) return { bg: '#fee2e2', text: '#991b1b' };
        return { bg: '#f3f4f6', text: '#374151' };
    };

    const extractProductName = (message: string): string => {
        if (message.includes('ADDED TO ORDER:')) {
            const match = message.match(/ADDED TO ORDER:\s*(.+?)\s*has been added/);
            return match ? match[1].trim() : 'Unknown Product';
        }
        const match = message.match(/'([^']+)'/);
        return match ? match[1] : 'Unknown Product';
    };

    const activeAlerts = alerts.filter(a => a.status === 'active' || !a.status);

    return (
        <Paper
            sx={{
                p: 3,
                borderRadius: 3,
                boxShadow: 2,
                background: 'linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%)'
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        📋 Pending Tasks
                    </Typography>
                    {activeAlerts.length > 0 && (
                        <Chip
                            label={activeAlerts.length}
                            size="small"
                            color="error"
                            sx={{ fontWeight: 700 }}
                        />
                    )}
                </Box>
                <Button
                    size="small"
                    endIcon={<ArrowForward />}
                    onClick={() => navigate('/stock-alerts')}
                    sx={{ textTransform: 'none' }}
                >
                    View All
                </Button>
            </Box>

            {activeAlerts.length === 0 ? (
                <Box
                    sx={{
                        py: 4,
                        textAlign: 'center',
                        bgcolor: '#f0fdf4',
                        borderRadius: 2,
                        border: '1px solid #bbf7d0'
                    }}
                >
                    <DoneIcon sx={{ fontSize: 48, color: '#22c55e', mb: 1 }} />
                    <Typography variant="body1" color="text.secondary">
                        All tasks completed! 🎉
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        No pending stock alerts at the moment
                    </Typography>
                </Box>
            ) : (
                <List sx={{ p: 0 }}>
                    {activeAlerts.slice(0, 5).map((alert) => {
                        const color = getAlertColor(alert.message);
                        const productName = extractProductName(alert.message);
                        const alertType = getAlertType(alert.message);
                        const isShelfRestock = alert.message.includes('SHELF RESTOCK');

                        return (
                            <React.Fragment key={alert.id}>
                                <ListItem
                                    sx={{
                                        bgcolor: color.bg,
                                        borderRadius: 2,
                                        mb: 1,
                                        py: 1.5,
                                        px: 2
                                    }}
                                    secondaryAction={
                                        isShelfRestock ? (
                                            <Button
                                                size="small"
                                                variant="contained"
                                                onClick={() => onTransferClick?.(alert)}
                                                sx={{
                                                    textTransform: 'none',
                                                    fontWeight: 600,
                                                    bgcolor: '#f59e0b',
                                                    '&:hover': { bgcolor: '#d97706' }
                                                }}
                                            >
                                                Transfer
                                            </Button>
                                        ) : (
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() => onOrderClick?.(alert)}
                                                sx={{ textTransform: 'none', fontWeight: 600 }}
                                            >
                                                Order
                                            </Button>
                                        )
                                    }
                                >
                                    <ListItemIcon sx={{ minWidth: 40 }}>
                                        {getAlertIcon(alert.message)}
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={
                                            <Typography variant="body2" fontWeight={600} sx={{ color: color.text }}>
                                                {productName}
                                            </Typography>
                                        }
                                        secondary={
                                            <Chip
                                                label={alertType}
                                                size="small"
                                                sx={{
                                                    mt: 0.5,
                                                    height: 20,
                                                    fontSize: '0.65rem',
                                                    bgcolor: 'rgba(0,0,0,0.08)'
                                                }}
                                            />
                                        }
                                    />
                                </ListItem>
                            </React.Fragment>
                        );
                    })}
                </List>
            )}
        </Paper>
    );
};
