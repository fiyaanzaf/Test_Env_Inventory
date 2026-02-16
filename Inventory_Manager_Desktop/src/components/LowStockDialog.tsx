import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, List, ListItem, ListItemText,
    Typography, Chip, Box, Divider, IconButton, CircularProgress, Checkbox, Tooltip,
    Tabs, Tab, Badge, Alert, Paper, Collapse
} from '@mui/material';
import {
    Warning as WarningIcon, Close as CloseIcon, FileDownload as DownloadIcon,
    AddShoppingCart as AddShoppingCartIcon, Checklist as BulkIcon,
    LocalShipping as ShippingIcon, PendingActions as PendingIcon,
    ErrorOutline as CriticalIcon, ExpandMore as ExpandIcon,
    ExpandLess as CollapseIcon, PostAdd as AddToOrderIcon
} from '@mui/icons-material';
import client from '../api/client';
import { BulkRestockDialog, type RestockItem } from './BulkRestockDialog';
import { AddToDraftDialog } from './AddToDraftDialog'; // <--- Import the new dialog

interface LowStockItem extends RestockItem {
    product_id: number;
    product_name: string;
    current_stock: number;
    reorder_level: number;
    supplier_name?: string;
    supplier_id?: number;
    average_cost?: number;
    quantity_on_order?: number;
    quantity_in_draft?: number;
    draft_order_id?: number | null;
    draft_supplier_name?: string;  // Actual supplier from the draft order
    placed_supplier_name?: string; // Actual supplier from placed order
}

interface GroupedDraft {
    orderId: number;
    supplierName: string;
    items: LowStockItem[];
    totalItems: number;
}

interface LowStockDialogProps {
    open: boolean;
    onClose: () => void;
}

export const LowStockDialog: React.FC<LowStockDialogProps> = ({ open, onClose }) => {
    const navigate = useNavigate();
    const [items, setItems] = useState<LowStockItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());

    const [tabValue, setTabValue] = useState(0);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // Dialog States
    const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
    const [addToDraftOpen, setAddToDraftOpen] = useState(false);
    const [selectedItemForDraft, setSelectedItemForDraft] = useState<LowStockItem | null>(null);

    useEffect(() => {
        if (open) fetchLowStock();
    }, [open]);

    const fetchLowStock = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('user_token');
            const response = await client.get('/api/v1/reports/low_stock_reorder', {
                headers: { 'Authorization': `Bearer ${token}` },
                params: { format: 'json' }
            });
            setItems(response.data);
        } catch (error) {
            console.error('Failed to fetch low stock items', error);
        } finally {
            setLoading(false);
        }
    };

    // Group items by draft_order_id for Pending tab
    const groupedDrafts = useMemo((): GroupedDraft[] => {
        const groups = new Map<number, LowStockItem[]>();

        items.forEach(item => {
            if (item.draft_order_id && item.quantity_in_draft && item.quantity_in_draft > 0) {
                if (!groups.has(item.draft_order_id)) {
                    groups.set(item.draft_order_id, []);
                }
                groups.get(item.draft_order_id)!.push(item);
            }
        });

        return Array.from(groups.entries()).map(([orderId, groupItems]) => ({
            orderId,
            // Use draft_supplier_name (actual order supplier) instead of supplier_name (product default)
            supplierName: groupItems[0]?.draft_supplier_name || groupItems[0]?.supplier_name || 'Unknown',
            items: groupItems,
            totalItems: groupItems.length
        }));
    }, [items]);

    // Filtering Logic for Tabs
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const reorderLvl = Number(item.reorder_level) || 0;
            const currentStk = Number(item.current_stock) || 0;
            const incoming = Number(item.quantity_on_order) || 0;
            const draft = Number(item.quantity_in_draft) || 0;

            const shortfall = Math.max(reorderLvl - currentStk, 0);
            const totalIncoming = incoming + draft;

            if (tabValue === 0) return true;
            if (tabValue === 1) return totalIncoming < shortfall;
            if (tabValue === 2) return draft > 0;
            if (tabValue === 3) return incoming > 0;
            return true;
        });
    }, [items, tabValue]);

    // Counts for Badges
    const counts = useMemo(() => {
        let critical = 0;
        let pending = 0;
        let incoming = 0;

        items.forEach(item => {
            const reorderLvl = Number(item.reorder_level) || 0;
            const currentStk = Number(item.current_stock) || 0;
            const inc = Number(item.quantity_on_order) || 0;
            const draft = Number(item.quantity_in_draft) || 0;
            const shortfall = Math.max(reorderLvl - currentStk, 0);

            if ((inc + draft) < shortfall) critical++;
            if (draft > 0) pending++;
            if (inc > 0) incoming++;
        });

        return { critical, pending, incoming };
    }, [items]);

    const handleToggle = (id: number) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleSelectAll = () => {
        if (selectedIds.size > 0 && selectedIds.size === filteredItems.length) {
            setSelectedIds(new Set());
        } else {
            const newSet = new Set(selectedIds);
            filteredItems.forEach(i => newSet.add(i.product_id));
            setSelectedIds(newSet);
        }
    };

    const toggleOrderExpansion = (orderId: number) => {
        const newSet = new Set(expandedOrders);
        if (newSet.has(orderId)) {
            newSet.delete(orderId);
        } else {
            newSet.add(orderId);
        }
        setExpandedOrders(newSet);
    };

    // --- Logic Change Here: Use Dialog instead of Navigate ---
    const handleRestockAction = (item: LowStockItem) => {
        if (item.draft_order_id) {
            // Open the "Add to Order" dialog
            setSelectedItemForDraft(item);
            setAddToDraftOpen(true);
        } else {
            // Default "Quick Order" behavior: Navigate to create new order
            onClose();
            navigate('/orders', {
                state: {
                    openCreateDialog: true,
                    initialData: {
                        supplierId: item.supplier_id,
                        items: [{
                            product_id: item.product_id,
                            productName: item.product_name,
                            unit_cost: item.average_cost || 0,
                            quantity: Math.max((item.reorder_level || 0) - (item.current_stock || 0), 10)
                        }],
                        notes: 'Auto-generated from Low Stock Report'
                    }
                }
            });
        }
    };

    const handleDownloadPdf = async () => {
        setDownloading(true);
        try {
            const token = localStorage.getItem('user_token');
            const response = await client.get('/api/v1/reports/low_stock_reorder', {
                headers: { 'Authorization': `Bearer ${token}` },
                params: { format: 'pdf' },
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `low_stock_list_${new Date().toISOString().split('T')[0]}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Download failed', error);
        } finally {
            setDownloading(false);
        }
    };

    const getSelectedItems = () => items.filter(i => selectedIds.has(i.product_id));

    return (
        <>
            <Dialog
                open={open}
                onClose={onClose}
                maxWidth="md"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3, p: 1, height: '85vh', display: 'flex', flexDirection: 'column' } }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#d32f2f', fontWeight: 'bold', pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <WarningIcon /> Critical Stock Alerts
                    </Box>
                    <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
                </DialogTitle>

                <Box sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs
                        value={tabValue}
                        onChange={(_, val) => setTabValue(val)}
                        variant="scrollable"
                        scrollButtons="auto"
                        textColor="primary"
                        indicatorColor="primary"
                    >
                        <Tab label="All Alerts" />
                        <Tab
                            icon={<Badge badgeContent={counts.critical} color="error"><CriticalIcon fontSize="small" /></Badge>}
                            iconPosition="start"
                            label="Action Required"
                        />
                        <Tab
                            icon={<Badge badgeContent={counts.pending} color="warning"><PendingIcon fontSize="small" /></Badge>}
                            iconPosition="start"
                            label="Pending Restock"
                        />
                        <Tab
                            icon={<Badge badgeContent={counts.incoming} color="primary"><ShippingIcon fontSize="small" /></Badge>}
                            iconPosition="start"
                            label="Incoming"
                        />
                    </Tabs>
                </Box>

                {tabValue === 2 && groupedDrafts.length > 0 && (
                    <Alert severity="info" sx={{ mx: 2, mt: 2 }}>
                        {groupedDrafts.length} draft order(s) ready. Go to Orders to review and confirm.
                    </Alert>
                )}

                {tabValue === 1 && (
                    <Box sx={{ px: 2, py: 1, bgcolor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee' }}>
                        <Button size="small" onClick={handleSelectAll} disabled={filteredItems.length === 0}>
                            {selectedIds.size > 0 && selectedIds.size === filteredItems.length ? "Deselect All" : "Select All"}
                        </Button>
                        <Typography variant="caption" color="text.secondary" fontWeight="bold">
                            {selectedIds.size} selected
                        </Typography>
                    </Box>
                )}

                <DialogContent sx={{ p: 0, flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
                    ) : tabValue === 2 ? (
                        // PENDING TAB
                        groupedDrafts.length === 0 ? (
                            <Box sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
                                <Typography variant="h6">No pending draft orders</Typography>
                                <Typography variant="body2">Create orders from "Action Required" tab.</Typography>
                            </Box>
                        ) : (
                            <List sx={{ p: 2 }}>
                                {groupedDrafts.map((group) => {
                                    const isExpanded = expandedOrders.has(group.orderId);
                                    return (
                                        <Paper key={group.orderId} elevation={2} sx={{ mb: 2, overflow: 'hidden' }}>
                                            <Box sx={{ p: 2, bgcolor: '#fff9e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                                onClick={() => toggleOrderExpansion(group.orderId)}
                                            >
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                    <IconButton size="small">
                                                        {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                                                    </IconButton>
                                                    <Box>
                                                        <Typography fontWeight="bold">Draft Order #{group.orderId}</Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            Supplier: {group.supplierName} • {group.totalItems} item(s)
                                                        </Typography>
                                                    </Box>
                                                </Box>
                                                <Button
                                                    variant="contained"
                                                    color="primary"
                                                    size="small"
                                                    startIcon={<PendingIcon />}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onClose();
                                                        navigate('/orders');
                                                    }}
                                                >
                                                    Go to Orders
                                                </Button>
                                            </Box>
                                            <Collapse in={isExpanded}>
                                                <List disablePadding>
                                                    {group.items.map((item) => (
                                                        <ListItem key={item.product_id} sx={{ borderTop: '1px solid #eee', bgcolor: 'white' }}>
                                                            <ListItemText
                                                                primary={<Typography fontWeight="500">{item.product_name}</Typography>}
                                                                secondary={<Typography variant="caption" color="text.secondary">Cost: {item.average_cost} • Draft Qty: {item.quantity_in_draft}</Typography>}
                                                            />
                                                            <Chip label={`${item.current_stock} / ${item.reorder_level}`} size="small" color="warning" variant="outlined" />
                                                        </ListItem>
                                                    ))}
                                                </List>
                                            </Collapse>
                                        </Paper>
                                    );
                                })}
                            </List>
                        )
                    ) : filteredItems.length === 0 ? (
                        <Box sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
                            <Typography variant="h6">No items found in this tab.</Typography>
                            <Typography variant="body2">Try switching to "All Alerts".</Typography>
                        </Box>
                    ) : (
                        // OTHER TABS
                        <List>
                            {filteredItems.map((item) => {
                                const reorderLvl = Number(item.reorder_level) || 0;
                                const currentStk = Number(item.current_stock) || 0;
                                const incoming = Number(item.quantity_on_order) || 0;
                                const draft = Number(item.quantity_in_draft) || 0;
                                const shortfall = Math.max(reorderLvl - currentStk, 0);
                                const totalIncoming = incoming + draft;
                                const isCovered = totalIncoming >= shortfall;
                                const hasDraftOrder = !!item.draft_order_id;

                                return (
                                    <ListItem
                                        key={item.product_id}
                                        disablePadding
                                        sx={{
                                            px: 2, py: 1.5,
                                            borderBottom: '1px solid #eee',
                                            bgcolor: selectedIds.has(item.product_id) ? '#fff1f0' : isCovered ? '#f0fdf4' : 'white',
                                            transition: 'background-color 0.2s'
                                        }}
                                    >
                                        {tabValue === 1 && (
                                            <Checkbox
                                                checked={selectedIds.has(item.product_id)}
                                                onChange={() => handleToggle(item.product_id)}
                                                color="error"
                                                sx={{ mr: 1 }}
                                            />
                                        )}
                                        <ListItemText
                                            primary={
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                    <Typography fontWeight="600" color={isCovered ? "success.dark" : "#c62828"}>{item.product_name}</Typography>
                                                    {incoming > 0 && <Tooltip title="Stock on the way"><Chip icon={<ShippingIcon sx={{ fontSize: '14px !important' }} />} label={`Incoming: ${incoming}`} size="small" color="primary" variant="filled" sx={{ height: 20, fontSize: '0.7rem' }} /></Tooltip>}
                                                    {draft > 0 && <Tooltip title={hasDraftOrder ? "Auto-generated draft ready" : "In Draft Order"}><Chip icon={<PendingIcon sx={{ fontSize: '14px !important' }} />} label={`Pending: ${draft}`} size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: '0.7rem', borderColor: '#ed6c02', color: '#ed6c02' }} /></Tooltip>}
                                                </Box>
                                            }
                                            secondary={<Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>Supplier: {tabValue === 3 ? (item.placed_supplier_name || item.supplier_name || 'N/A') : (item.supplier_name || 'N/A')} • Cost: {item.average_cost}</Typography>}
                                        />
                                        <Box sx={{ textAlign: 'right', minWidth: 110, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                                            <Chip label={`${item.current_stock} / ${item.reorder_level}`} size="small" color={isCovered ? "success" : "error"} variant={isCovered ? "filled" : "outlined"} sx={{ fontWeight: 'bold' }} />
                                            {tabValue === 3 ? (
                                                <Button size="small" variant="text" sx={{ fontSize: '0.7rem', textTransform: 'none', color: 'text.secondary' }} onClick={() => navigate('/orders?tab=1')}>View Order</Button>
                                            ) : (
                                                <Button
                                                    size="small"
                                                    variant="text"
                                                    // --- Change: Dynamic Icon and Label ---
                                                    startIcon={hasDraftOrder ? <AddToOrderIcon sx={{ fontSize: 16 }} /> : <AddShoppingCartIcon sx={{ fontSize: 16 }} />}
                                                    sx={{ fontSize: '0.7rem', textTransform: 'none', color: isCovered ? 'text.secondary' : 'primary.main' }}
                                                    onClick={() => handleRestockAction(item)}
                                                >
                                                    {hasDraftOrder ? 'Add to Order' : isCovered ? 'Add More' : 'Quick Order'}
                                                </Button>
                                            )}
                                        </Box>
                                    </ListItem>
                                );
                            })}
                        </List>
                    )}
                </DialogContent>
                <Divider />
                <DialogActions sx={{ p: 2, display: 'flex', justifyContent: 'space-between' }}>
                    <Button variant="outlined" color="inherit" startIcon={downloading ? <CircularProgress size={20} color="inherit" /> : <DownloadIcon />} onClick={handleDownloadPdf} disabled={downloading || items.length === 0}>Report</Button>
                    {tabValue === 1 && (
                        <Button variant="contained" color="primary" startIcon={<BulkIcon />} disabled={selectedIds.size === 0} onClick={() => setBulkDialogOpen(true)} sx={{ px: 3 }}>
                            Restock Selected ({selectedIds.size})
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

            {/* Bulk Restock Dialog */}
            <BulkRestockDialog
                open={bulkDialogOpen}
                onClose={() => setBulkDialogOpen(false)}
                selectedItems={getSelectedItems()}
                onSuccess={() => { fetchLowStock(); setSelectedIds(new Set()); }}
            />

            {/* New Add To Draft Dialog */}
            <AddToDraftDialog
                open={addToDraftOpen}
                onClose={() => {
                    setAddToDraftOpen(false);
                    setSelectedItemForDraft(null);
                }}
                item={selectedItemForDraft}
                onSuccess={() => {
                    fetchLowStock(); // Refresh list to show updated draft count
                }}
            />
        </>
    );
};