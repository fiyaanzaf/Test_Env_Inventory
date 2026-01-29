import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Paper, Button, Divider, CircularProgress,
    IconButton, Tooltip, Chip
} from '@mui/material';
import {
    ShoppingCart,
    SyncAlt as TransferIcon,
    Search as SearchIcon,
    NotificationsActive as AlertIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

import { useAuthStore } from '../store/authStore';
import { getShiftSummary, getMyActivity } from '../services/employeeService';
import type { ShiftSummary, ActivityItem } from '../services/employeeService';
import { getOperationalAlerts } from '../services/systemService';
import { ShiftSummaryCard } from '../components/ShiftSummaryCard';
import { PendingTasksWidget } from '../components/PendingTasksWidget';
import { RecentActivityFeed } from '../components/RecentActivityFeed';
import { QuickStockLookupDialog } from '../components/QuickStockLookupDialog';

interface OperationalAlert {
    id: number;
    severity: string;
    message: string;
    status: string;
    created_at: string;
}

import { BulkRestockDialog, type RestockItem } from '../components/BulkRestockDialog';
import { TransferStockDialog } from '../components/InventoryDialogs';
import client from '../api/client';

export const EmployeeDashboardHome: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();

    // State
    const [shiftSummary, setShiftSummary] = useState<ShiftSummary | null>(null);
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stockLookupOpen, setStockLookupOpen] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Dialog State
    const [transferDialogOpen, setTransferDialogOpen] = useState(false);
    const [selectedTransferProduct, setSelectedTransferProduct] = useState<{ id: number; name: string; sku: string } | null>(null);
    const [restockDialogOpen, setRestockDialogOpen] = useState(false);
    const [selectedRestockItem, setSelectedRestockItem] = useState<RestockItem | null>(null);

    // Fetch all data
    const fetchData = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            const [summaryData, activityData, alertsData] = await Promise.all([
                getShiftSummary(),
                getMyActivity(10),
                getOperationalAlerts()
            ]);

            setShiftSummary(summaryData);
            setActivities(activityData);
            setAlerts(alertsData);
            setLastUpdated(new Date());
        } catch (error) {
            console.error('Failed to load employee dashboard data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleRefresh = () => {
        fetchData(true);
    };

    // Helper to fetch product by name (used for alerts)
    const fetchProductByName = async (name: string) => {
        try {
            const token = localStorage.getItem('user_token');
            const res = await client.get('/api/v1/products', {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Approximate match or exact match
            return res.data.find((p: any) => p.name === name);
        } catch (err) {
            console.error('Failed to fetch product', err);
            return null;
        }
    };

    const extractProductName = (message: string): string => {
        if (message.includes('ADDED TO ORDER:')) {
            const match = message.match(/ADDED TO ORDER:\s*(.+?)\s*has been added/);
            return match ? match[1].trim() : 'Unknown Product';
        }
        const match = message.match(/'([^']+)'/);
        return match ? match[1] : 'Unknown Product';
    };

    const extractCurrentStock = (message: string): number => {
        const match = message.match(/has only (\d+) units/);
        return match ? parseInt(match[1]) : 0;
    };

    const handleTransferClick = (alert: OperationalAlert) => {
        const productName = extractProductName(alert.message);
        fetchProductByName(productName).then(product => {
            if (product) {
                setSelectedTransferProduct({
                    id: product.id,
                    name: product.name,
                    sku: product.sku
                });
                setTransferDialogOpen(true);
            }
        });
    };

    const handleOrderClick = (alert: OperationalAlert) => {
        const productName = extractProductName(alert.message);
        fetchProductByName(productName).then(product => {
            if (product) {
                const restockItem: RestockItem = {
                    product_id: product.id,
                    product_name: product.name,
                    reorder_level: product.reorder_level || 20,
                    average_cost: product.average_cost,
                    current_stock: product.total_quantity !== undefined ? product.total_quantity : extractCurrentStock(alert.message)
                };
                setSelectedRestockItem(restockItem);
                setRestockDialogOpen(true);
            }
        });
    };

    // Filter out "Added to Order" alerts for the dashboard view (Pending Tasks)
    const actionableAlerts = alerts.filter(a => {
        const isActive = a.status === 'active' || !a.status;
        const isAddedToOrder = a.message.includes('ADDED TO ORDER');
        return isActive && !isAddedToOrder;
    });

    const activeAlertCount = actionableAlerts.length;

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <CircularProgress size={48} />
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
                        Welcome, {user?.username}! 👋
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography variant="body2" color="text.secondary">
                            {dayjs().format('dddd, MMMM D, YYYY')}
                        </Typography>
                        {lastUpdated && (
                            <>
                                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                                <Typography variant="caption" color="text.disabled">
                                    Updated {lastUpdated.toLocaleTimeString()}
                                </Typography>
                            </>
                        )}
                        <Tooltip title="Refresh all data">
                            <IconButton
                                size="small"
                                onClick={handleRefresh}
                                disabled={refreshing}
                                sx={{ ml: 0.5 }}
                            >
                                <RefreshIcon sx={{ fontSize: 18, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {/* Alert Badge */}
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                    {activeAlertCount > 0 && (
                        <Chip
                            icon={<AlertIcon />}
                            label={`${activeAlertCount} Pending Tasks`}
                            color="warning"
                            onClick={() => navigate('/stock-alerts')}
                            sx={{ fontWeight: 'bold', cursor: 'pointer' }}
                        />
                    )}
                </Box>
            </Box>

            {/* Quick Actions */}
            <Paper sx={{ p: 3, borderRadius: 3, boxShadow: 2, bgcolor: 'white' }}>
                <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    ⚡ Quick Actions
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mt: 2 }}>
                    <Button
                        variant="contained"
                        startIcon={<ShoppingCart />}
                        fullWidth
                        onClick={() => navigate('/sales')}
                        sx={{
                            py: 2,
                            borderRadius: 2,
                            textTransform: 'none',
                            fontWeight: 600,
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            '&:hover': { background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }
                        }}
                    >
                        Start Sale
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<TransferIcon />}
                        fullWidth
                        onClick={() => navigate('/inventory')}
                        color="warning"
                        sx={{ py: 2, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                    >
                        Transfer Stock
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<SearchIcon />}
                        fullWidth
                        onClick={() => setStockLookupOpen(true)}
                        color="secondary"
                        sx={{ py: 2, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                    >
                        Search Products
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<AlertIcon />}
                        fullWidth
                        onClick={() => navigate('/stock-alerts')}
                        color="info"
                        sx={{ py: 2, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                    >
                        Stock Alerts
                        {activeAlertCount > 0 && (
                            <Chip
                                label={activeAlertCount}
                                size="small"
                                color="error"
                                sx={{ ml: 1, height: 20, minWidth: 20 }}
                            />
                        )}
                    </Button>
                </Box>
            </Paper>

            {/* Shift Summary */}
            <ShiftSummaryCard
                data={shiftSummary}
                loading={loading}
                onRefresh={handleRefresh}
            />

            {/* Two Column Layout: Tasks and Activity */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
                {/* Pending Tasks */}
                <PendingTasksWidget
                    alerts={actionableAlerts}
                    loading={loading}
                    onTransferClick={handleTransferClick}
                    onOrderClick={handleOrderClick}
                />

                {/* Recent Activity */}
                <RecentActivityFeed
                    activities={activities}
                    loading={loading}
                />
            </Box>

            {/* Quick Stock Lookup Dialog */}
            <QuickStockLookupDialog
                open={stockLookupOpen}
                onClose={() => setStockLookupOpen(false)}
            />

            {/* Transfer Stock Dialog */}
            <TransferStockDialog
                open={transferDialogOpen}
                onClose={() => {
                    setTransferDialogOpen(false);
                    setSelectedTransferProduct(null);
                }}
                product={selectedTransferProduct}
                onSuccess={() => {
                    fetchData(true);
                    setTransferDialogOpen(false);
                    setSelectedTransferProduct(null);
                }}
            />

            {/* Bulk Restock Dialog */}
            <BulkRestockDialog
                open={restockDialogOpen}
                onClose={() => {
                    setRestockDialogOpen(false);
                    setSelectedRestockItem(null);
                }}
                selectedItems={selectedRestockItem ? [selectedRestockItem] : []}
                onSuccess={() => {
                    fetchData(true);
                    setRestockDialogOpen(false);
                    setSelectedRestockItem(null);
                }}
            />
        </Box>
    );
};
