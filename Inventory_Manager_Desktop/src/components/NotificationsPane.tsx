import React, { useState, useEffect } from 'react';
import {
    IconButton, Badge, Popover, Box, Typography, List, ListItem, ListItemText,
    ListItemIcon, Divider, Button, CircularProgress, Chip
} from '@mui/material';
import {
    Notifications as NotificationsIcon,
    LocalShipping as RestockIcon,
    Warning as LowStockIcon,
    EventBusy as ExpiryIcon,
    CheckCircle as AllClearIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { getShelfRestockAlerts } from '../services/systemService';
import { getAllProducts } from '../services/productService';
import { getExpiryReport } from '../services/inventoryService';

interface NotificationItem {
    id: string;
    type: 'restock' | 'lowstock' | 'expiry';
    message: string;
    count: number;
    action: () => void;
}

interface NotificationsPaneProps {
    userRoles: string[];
}

export const NotificationsPane: React.FC<NotificationsPaneProps> = ({ userRoles }) => {
    const navigate = useNavigate();
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [totalCount, setTotalCount] = useState(0);

    const isStaff = userRoles.some(r => ['owner', 'manager', 'employee'].includes(r));

    const fetchNotifications = async () => {
        if (!isStaff) return;

        setLoading(true);
        const newNotifications: NotificationItem[] = [];

        try {
            // 1. Shelf Restock Alerts
            try {
                const restockAlerts = await getShelfRestockAlerts();
                if (restockAlerts.length > 0) {
                    newNotifications.push({
                        id: 'restock',
                        type: 'restock',
                        message: `${restockAlerts.length} product(s) need shelf restocking`,
                        count: restockAlerts.length,
                        action: () => {
                            handleClose();
                            navigate('/inventory', { state: { openShelfRestock: true } });
                        }
                    });
                }
            } catch (e) {
                // Silent fail for restock
            }

            // 2. Low Stock Items
            try {
                const products = await getAllProducts();
                const lowStockItems = products.filter(p => (p.total_quantity || 0) < 20);
                if (lowStockItems.length > 0) {
                    newNotifications.push({
                        id: 'lowstock',
                        type: 'lowstock',
                        message: `${lowStockItems.length} item(s) are low on stock`,
                        count: lowStockItems.length,
                        action: () => {
                            handleClose();
                            navigate('/inventory', { state: { openLowStock: true } });
                        }
                    });
                }
            } catch (e) {
                // Silent fail for low stock
            }

            // 3. Expiring Items
            try {
                const expiryData = await getExpiryReport(30);
                const expiryCount = Array.isArray(expiryData) ? expiryData.length : 0;
                if (expiryCount > 0) {
                    newNotifications.push({
                        id: 'expiry',
                        type: 'expiry',
                        message: `${expiryCount} item(s) expiring soon`,
                        count: expiryCount,
                        action: () => {
                            handleClose();
                            navigate('/inventory', { state: { openExpiryAlert: true } });
                        }
                    });
                }
            } catch (e) {
                // Silent fail for expiry
            }

            setNotifications(newNotifications);
            setTotalCount(newNotifications.reduce((acc, n) => acc + n.count, 0));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
        // Refresh every 60 seconds
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [isStaff]);

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
        fetchNotifications(); // Refresh when opening
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const open = Boolean(anchorEl);

    const getIcon = (type: string) => {
        switch (type) {
            case 'restock': return <RestockIcon sx={{ color: '#0288d1' }} />;
            case 'lowstock': return <LowStockIcon sx={{ color: '#ed6c02' }} />;
            case 'expiry': return <ExpiryIcon sx={{ color: '#d32f2f' }} />;
            default: return <NotificationsIcon />;
        }
    };

    const getChipColor = (type: string): 'info' | 'warning' | 'error' => {
        switch (type) {
            case 'restock': return 'info';
            case 'lowstock': return 'warning';
            case 'expiry': return 'error';
            default: return 'info';
        }
    };

    if (!isStaff) return null;

    return (
        <>
            <IconButton
                onClick={handleClick}
                size="large"
                sx={{
                    color: 'text.secondary',
                    '&:hover': { color: 'primary.main' }
                }}
            >
                <Badge badgeContent={totalCount} color="error" max={99}>
                    <NotificationsIcon />
                </Badge>
            </IconButton>

            <Popover
                open={open}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                PaperProps={{
                    sx: {
                        width: 360,
                        maxHeight: 450,
                        borderRadius: 2,
                        boxShadow: '0 10px 40px rgba(0,0,0,0.15)'
                    }
                }}
            >
                {/* Header */}
                <Box sx={{
                    p: 2,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                        Notifications
                    </Typography>
                    {totalCount > 0 && (
                        <Chip
                            label={`${totalCount} alerts`}
                            size="small"
                            sx={{
                                bgcolor: 'rgba(255,255,255,0.2)',
                                color: 'white',
                                fontWeight: 'bold',
                                fontSize: '0.75rem'
                            }}
                        />
                    )}
                </Box>

                <Divider />

                {/* Content */}
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress size={30} />
                    </Box>
                ) : notifications.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
                        <AllClearIcon sx={{ fontSize: 48, color: '#4caf50', mb: 1 }} />
                        <Typography variant="body2" fontWeight="500">All clear!</Typography>
                        <Typography variant="caption">No alerts at the moment</Typography>
                    </Box>
                ) : (
                    <List disablePadding>
                        {notifications.map((notification, index) => (
                            <React.Fragment key={notification.id}>
                                <ListItem
                                    component="div"
                                    onClick={notification.action}
                                    sx={{
                                        cursor: 'pointer',
                                        py: 1.5,
                                        px: 2,
                                        '&:hover': { bgcolor: '#f5f5f5' },
                                        transition: 'background-color 0.2s'
                                    }}
                                >
                                    <ListItemIcon sx={{ minWidth: 40 }}>
                                        {getIcon(notification.type)}
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={
                                            <Typography variant="body2" fontWeight="500">
                                                {notification.message}
                                            </Typography>
                                        }
                                        secondary={
                                            <Typography variant="caption" color="text.secondary">
                                                Click to view details
                                            </Typography>
                                        }
                                    />
                                    <Chip
                                        label={notification.count}
                                        size="small"
                                        color={getChipColor(notification.type)}
                                        sx={{ fontWeight: 'bold', minWidth: 32 }}
                                    />
                                </ListItem>
                                {index < notifications.length - 1 && <Divider />}
                            </React.Fragment>
                        ))}
                    </List>
                )}

                {/* Footer */}
                {notifications.length > 0 && (
                    <>
                        <Divider />
                        <Box sx={{ p: 1.5, textAlign: 'center' }}>
                            <Button
                                size="small"
                                onClick={() => {
                                    handleClose();
                                    navigate('/inventory');
                                }}
                                sx={{ textTransform: 'none' }}
                            >
                                Go to Inventory
                            </Button>
                        </Box>
                    </>
                )}
            </Popover>
        </>
    );
};
