import React, { useEffect, useState, useMemo } from 'react';
import {
    Box, Typography, Paper, Chip, CircularProgress, Button,
    Tabs, Tab, Badge
} from '@mui/material';
import { DataGrid, type GridColDef, type GridRenderCellParams } from '@mui/x-data-grid';
import {
    ErrorOutline as ErrorIcon,
    CheckCircle as SuccessIcon,
    DoneAll as DoneIcon,
    NotificationsActive as AlertIcon,
    Inventory as ShelfIcon,
    SwapHoriz as TransferIcon,
    ShoppingCart as CartIcon
} from '@mui/icons-material';
import client from '../api/client';
import { BulkRestockDialog, type RestockItem } from '../components/BulkRestockDialog';
import { TransferStockDialog } from '../components/InventoryDialogs';

// Styling constants
const styles = {
    pageContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        pb: 4
    },
    headerTitle: {
        fontWeight: 800,
        color: '#1e293b',
        mb: 0.5,
        letterSpacing: '-0.5px'
    },
    tableContainer: {
        border: 'none',
        borderRadius: 4,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        overflow: 'hidden',
        bgcolor: 'white'
    },
    tabs: {
        px: 2,
        borderBottom: '1px solid #f1f5f9',
        '& .MuiTab-root': {
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.95rem',
            minHeight: 56,
            color: '#94a3b8',
        }
    },
    dataGrid: {
        border: 'none',
        fontFamily: 'inherit',
        '& .MuiDataGrid-columnHeaders': {
            backgroundColor: '#f8fafc',
            color: '#475569',
            fontWeight: 700,
            textTransform: 'uppercase',
            fontSize: '0.75rem',
            letterSpacing: '0.5px',
            borderBottom: '1px solid #e2e8f0'
        },
        '& .MuiDataGrid-cell': {
            borderColor: '#f1f5f9',
            py: 1.5,
        },
        '& .MuiDataGrid-row:hover': {
            backgroundColor: '#f8fafc',
        }
    }
};

interface StockAlert {
    id: number;
    severity: string;
    message: string;
    is_resolved: boolean;
    status: string;
    created_at: string;
}

// Helper to get alert type
const getAlertType = (message: string): 'shelf_restock' | 'low_stock' | 'added_to_order' | 'other' => {
    if (message.includes('ADDED TO ORDER')) return 'added_to_order';
    if (message.includes('SHELF RESTOCK NEEDED')) return 'shelf_restock';
    if (message.includes('LOW STOCK')) return 'low_stock';
    return 'other';
};

const getAlertTypeColor = (type: string) => {
    if (type === 'shelf_restock') return { bg: '#fef3c7', color: '#92400e', border: '#fde68a' };
    if (type === 'low_stock') return { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' };
    if (type === 'added_to_order') return { bg: '#dcfce7', color: '#166534', border: '#86efac' };
    return { bg: '#e0f2fe', color: '#075985', border: '#bae6fd' };
};

export const StockAlertsPage: React.FC = () => {
    const [alerts, setAlerts] = useState<StockAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [tabValue, setTabValue] = useState(0);
    const [typeFilter, setTypeFilter] = useState<string>('all');

    // Bulk Restock Dialog state
    const [restockDialogOpen, setRestockDialogOpen] = useState(false);
    const [selectedRestockItem, setSelectedRestockItem] = useState<RestockItem | null>(null);

    // Transfer Stock Dialog state
    const [transferDialogOpen, setTransferDialogOpen] = useState(false);
    const [selectedTransferProduct, setSelectedTransferProduct] = useState<{ id: number; name: string; sku: string } | null>(null);

    // Load operational alerts (only shelf restock and low stock)
    const loadAlerts = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('user_token');
            const res = await client.get('/api/v1/system/alerts/operational', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setAlerts(res.data);
        } catch (err) {
            console.error('Failed to fetch stock alerts', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAlerts();
    }, []);

    // Filter alerts
    const filteredAlerts = useMemo(() => {
        return alerts.filter(a => {
            // Status tab filter
            let matchesTab = false;
            if (tabValue === 0) matchesTab = a.status === 'active' || !a.status;
            else if (tabValue === 1) matchesTab = a.status === 'resolved' || a.is_resolved;

            if (!matchesTab) return false;

            // Type filter
            if (typeFilter !== 'all') {
                const alertType = getAlertType(a.message);
                if (alertType !== typeFilter) return false;
            }

            return true;
        });
    }, [alerts, tabValue, typeFilter]);

    // Count alerts by type for current tab
    const typeCounts = useMemo(() => {
        return alerts.reduce((acc, a) => {
            let matchesTab = false;
            if (tabValue === 0) matchesTab = a.status === 'active' || !a.status;
            else if (tabValue === 1) matchesTab = a.status === 'resolved' || a.is_resolved;

            if (matchesTab) {
                const type = getAlertType(a.message);
                acc[type] = (acc[type] || 0) + 1;
                acc.all = (acc.all || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);
    }, [alerts, tabValue]);

    // Extract product name from message
    const extractProductName = (message: string): string => {
        // Handle 'ADDED TO ORDER: ProductName has been added...' format
        if (message.includes('ADDED TO ORDER:')) {
            const match = message.match(/ADDED TO ORDER:\s*(.+?)\s*has been added/);
            return match ? match[1].trim() : 'Unknown Product';
        }
        // Handle quoted product names like 'Product Name'
        const match = message.match(/'([^']+)'/);
        return match ? match[1] : 'Unknown Product';
    };

    // Handle action button click
    const handleAction = (alert: StockAlert) => {
        const alertType = getAlertType(alert.message);
        if (alertType === 'shelf_restock') {
            // Open Transfer dialog with this product
            const productName = extractProductName(alert.message);

            // Fetch product details by name
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
        } else if (alertType === 'low_stock') {
            // Open BulkRestockDialog with this product
            const productName = extractProductName(alert.message);

            // Create a RestockItem from the alert
            const restockItem: RestockItem = {
                product_id: 0, // Will be fetched
                product_name: productName,
                current_stock: extractCurrentStock(alert.message)
            };

            // Fetch product ID by name
            fetchProductByName(productName).then(product => {
                if (product) {
                    setSelectedRestockItem({
                        ...restockItem,
                        product_id: product.id,
                        reorder_level: product.reorder_level || 20,
                        average_cost: product.average_cost
                    });
                    setRestockDialogOpen(true);
                }
            });
        }
    };

    // Extract current stock from message
    const extractCurrentStock = (message: string): number => {
        const match = message.match(/has only (\d+) units/);
        return match ? parseInt(match[1]) : 0;
    };

    // Fetch product by name
    const fetchProductByName = async (name: string) => {
        try {
            const token = localStorage.getItem('user_token');
            const res = await client.get('/api/v1/products', {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data.find((p: any) => p.name === name);
        } catch (err) {
            console.error('Failed to fetch product', err);
            return null;
        }
    };

    // Columns definition
    const columns: GridColDef[] = [
        {
            field: 'type', headerName: 'Type', width: 140,
            valueGetter: (_value: any, row: any) => getAlertType(row.message),
            renderCell: (params: GridRenderCellParams) => {
                const colors = getAlertTypeColor(params.value);
                const labels: Record<string, string> = {
                    shelf_restock: 'Shelf Restock',
                    low_stock: 'Low Stock',
                    added_to_order: 'Added to Order',
                    other: 'Other'
                };
                const getIcon = () => {
                    if (params.value === 'shelf_restock') return <ShelfIcon sx={{ fontSize: '16px !important' }} />;
                    if (params.value === 'added_to_order') return <SuccessIcon sx={{ fontSize: '16px !important' }} />;
                    return <ErrorIcon sx={{ fontSize: '16px !important' }} />;
                };
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                        <Chip
                            label={labels[params.value] || 'Other'}
                            size="small"
                            icon={getIcon()}
                            sx={{
                                fontWeight: 600,
                                fontSize: '0.75rem',
                                bgcolor: colors.bg,
                                color: colors.color,
                                border: `1px solid ${colors.border}`,
                                '& .MuiChip-icon': { color: colors.color }
                            }}
                        />
                    </Box>
                );
            }
        },
        {
            field: 'product', headerName: 'Product', width: 200,
            valueGetter: (_value: any, row: any) => extractProductName(row.message),
            renderCell: (params: GridRenderCellParams) => (
                <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                    <Typography variant="body2" fontWeight={600}>{params.value}</Typography>
                </Box>
            )
        },
        {
            field: 'message', headerName: 'Details', flex: 1,
            renderCell: (params: GridRenderCellParams) => (
                <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', py: 1 }}>
                    <Typography variant="body2" sx={{ color: '#64748b', whiteSpace: 'normal', lineHeight: 1.5 }}>
                        {params.value}
                    </Typography>
                </Box>
            )
        },
        {
            field: 'created_at', headerName: 'Time', width: 180,
            valueFormatter: (value: any) => value ? new Date(value).toLocaleString() : ''
        },
        {
            field: 'actions', headerName: 'Action', width: 150,
            renderCell: (params: GridRenderCellParams) => {
                if (tabValue === 1) {
                    return (
                        <Chip
                            label="Resolved"
                            size="small"
                            icon={<SuccessIcon fontSize="small" />}
                            sx={{
                                fontWeight: 600,
                                bgcolor: '#ecfdf5',
                                color: '#059669',
                                border: '1px solid #6ee7b7',
                                '& .MuiChip-icon': { color: '#059669' }
                            }}
                        />
                    );
                }

                const alertType = getAlertType(params.row.message);

                // For 'Added to Order' alerts, show a status chip instead of action button
                if (alertType === 'added_to_order') {
                    return (
                        <Chip
                            label="Ordered"
                            size="small"
                            icon={<SuccessIcon fontSize="small" />}
                            sx={{
                                fontWeight: 600,
                                bgcolor: '#dcfce7',
                                color: '#166534',
                                border: '1px solid #86efac',
                                '& .MuiChip-icon': { color: '#166534' }
                            }}
                        />
                    );
                }

                return (
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={alertType === 'shelf_restock' ? <TransferIcon /> : <CartIcon />}
                        onClick={() => handleAction(params.row)}
                        sx={{
                            textTransform: 'none',
                            fontWeight: 600,
                            borderRadius: 2,
                            background: alertType === 'shelf_restock'
                                ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                                : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                            boxShadow: alertType === 'shelf_restock'
                                ? '0 2px 8px rgba(245, 158, 11, 0.3)'
                                : '0 2px 8px rgba(239, 68, 68, 0.3)',
                            '&:hover': {
                                transform: 'translateY(-1px)',
                                boxShadow: alertType === 'shelf_restock'
                                    ? '0 4px 12px rgba(245, 158, 11, 0.4)'
                                    : '0 4px 12px rgba(239, 68, 68, 0.4)',
                            }
                        }}
                    >
                        {alertType === 'shelf_restock' ? 'Transfer' : 'Order'}
                    </Button>
                );
            }
        }
    ];

    const activeCount = alerts.filter(a => a.status === 'active' || !a.status).length;

    return (
        <Box sx={styles.pageContainer}>
            {/* Header */}
            <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <AlertIcon sx={{ fontSize: 32, color: '#f59e0b' }} />
                    <Typography variant="h4" sx={styles.headerTitle}>
                        Stock Alerts
                    </Typography>
                    {activeCount > 0 && (
                        <Chip
                            label={`${activeCount} Active`}
                            size="small"
                            sx={{
                                fontWeight: 700,
                                bgcolor: '#fee2e2',
                                color: '#dc2626',
                                border: '1px solid #fecaca'
                            }}
                        />
                    )}
                </Box>
                <Typography variant="body1" sx={{ color: '#64748b' }}>
                    Items that need restocking or reordering from suppliers.
                </Typography>
            </Box>

            {/* Alert Summary Cards */}
            <Box sx={{ display: 'flex', gap: 2 }}>
                <Paper sx={{ p: 2.5, flex: 1, borderRadius: 3, border: '1px solid #fde68a', background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#fef3c7' }}>
                            <ShelfIcon sx={{ color: '#d97706', fontSize: 28 }} />
                        </Box>
                        <Box>
                            <Typography variant="h4" fontWeight={800} color="#92400e">
                                {alerts.filter(a => getAlertType(a.message) === 'shelf_restock' && (a.status === 'active' || !a.status)).length}
                            </Typography>
                            <Typography variant="body2" color="#b45309" fontWeight={600}>
                                Shelf Restock Needed
                            </Typography>
                        </Box>
                    </Box>
                </Paper>

                <Paper sx={{ p: 2.5, flex: 1, borderRadius: 3, border: '1px solid #fecaca', background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#fee2e2' }}>
                            <ErrorIcon sx={{ color: '#dc2626', fontSize: 28 }} />
                        </Box>
                        <Box>
                            <Typography variant="h4" fontWeight={800} color="#991b1b">
                                {alerts.filter(a => getAlertType(a.message) === 'low_stock' && (a.status === 'active' || !a.status)).length}
                            </Typography>
                            <Typography variant="body2" color="#b91c1c" fontWeight={600}>
                                Low Stock - Order Needed
                            </Typography>
                        </Box>
                    </Box>
                </Paper>
            </Box>

            {/* Alerts Table */}
            <Paper sx={styles.tableContainer}>
                <Box sx={{ borderBottom: '1px solid #f1f5f9' }}>
                    <Tabs
                        value={tabValue}
                        onChange={(_, v) => setTabValue(v)}
                        sx={{
                            ...styles.tabs,
                            '& .Mui-selected': { color: tabValue === 0 ? '#f59e0b' : '#10b981' },
                            '& .MuiTabs-indicator': { backgroundColor: tabValue === 0 ? '#f59e0b' : '#10b981', height: 3 }
                        }}
                    >
                        <Tab
                            label={`Active Alerts (${alerts.filter(a => a.status === 'active' || !a.status).length})`}
                            icon={<Badge badgeContent={activeCount} color="warning"><AlertIcon /></Badge>}
                            iconPosition="start"
                        />
                        <Tab
                            label="Resolved"
                            icon={<DoneIcon sx={{ color: tabValue === 1 ? '#10b981' : 'inherit' }} />}
                            iconPosition="start"
                        />
                    </Tabs>
                </Box>

                {/* Type Filter Chips */}
                <Box sx={{ px: 2, py: 1.5, display: 'flex', gap: 1, alignItems: 'center', borderBottom: '1px solid #f1f5f9', bgcolor: '#fafbfc' }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: '#64748b', mr: 1 }}>
                        Filter:
                    </Typography>
                    {[
                        { key: 'all', label: 'All' },
                        { key: 'shelf_restock', label: 'Shelf Restock' },
                        { key: 'low_stock', label: 'Low Stock' },
                        { key: 'added_to_order', label: 'Added to Order' }
                    ].map(({ key, label }) => {
                        const colors = getAlertTypeColor(key);
                        const count = typeCounts[key] || 0;
                        const isActive = typeFilter === key;

                        return (
                            <Chip
                                key={key}
                                label={`${label} (${count})`}
                                size="small"
                                onClick={() => setTypeFilter(key)}
                                sx={{
                                    fontWeight: 600,
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    bgcolor: isActive ? colors.bg : 'white',
                                    color: isActive ? colors.color : '#64748b',
                                    border: '1px solid',
                                    borderColor: isActive ? colors.border : '#e2e8f0',
                                    '&:hover': {
                                        bgcolor: colors.bg,
                                        borderColor: colors.border
                                    }
                                }}
                            />
                        );
                    })}
                </Box>

                {loading ? (
                    <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
                ) : (
                    <Box sx={{ width: '100%', height: 400 }}>
                        {filteredAlerts.length === 0 ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.6 }}>
                                <SuccessIcon sx={{ fontSize: 60, color: '#10b981', mb: 2 }} />
                                <Typography variant="h6" color="text.secondary">
                                    {tabValue === 0 ? "No active stock alerts. All good!" : "No resolved alerts found."}
                                </Typography>
                            </Box>
                        ) : (
                            <DataGrid
                                rows={filteredAlerts}
                                columns={columns}
                                getRowHeight={() => 'auto'}
                                initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                                pageSizeOptions={[10, 20]}
                                disableRowSelectionOnClick
                                sx={styles.dataGrid}
                            />
                        )}
                    </Box>
                )}
            </Paper>

            {/* Bulk Restock Dialog */}
            <BulkRestockDialog
                open={restockDialogOpen}
                onClose={() => {
                    setRestockDialogOpen(false);
                    setSelectedRestockItem(null);
                }}
                selectedItems={selectedRestockItem ? [selectedRestockItem] : []}
                onSuccess={() => {
                    loadAlerts();
                    setRestockDialogOpen(false);
                    setSelectedRestockItem(null);
                }}
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
                    loadAlerts();
                    setTransferDialogOpen(false);
                    setSelectedTransferProduct(null);
                }}
            />
        </Box>
    );
};
