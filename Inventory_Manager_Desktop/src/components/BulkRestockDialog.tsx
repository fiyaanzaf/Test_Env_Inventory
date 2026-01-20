import React, { useState, useMemo, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Box, Typography,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Accordion, AccordionSummary, AccordionDetails, Chip, CircularProgress, Alert,
    TextField, MenuItem
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon, CheckCircle as CheckIcon } from '@mui/icons-material';
import { createPurchaseOrder, type POCreatePayload } from '../services/purchaseService';
import client from '../api/client';

export interface RestockItem {
    product_id: number;
    product_name: string;
    supplier_id?: number;
    supplier_name?: string;
    average_cost?: number | string;  // Can be number or formatted string with ₹
    reorder_level?: number;
    current_stock?: number;
    quantity?: number;
}

// Interface for the linked supplier data
interface LinkedSupplier {
    id: number;
    name: string;
    cost: number;
    is_preferred: boolean;
}

interface Props {
    open: boolean;
    onClose: () => void;
    selectedItems: RestockItem[];
    onSuccess: () => void;
}

export const BulkRestockDialog: React.FC<Props> = ({ open, onClose, selectedItems, onSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<{ success: number, failed: number } | null>(null);

    const [items, setItems] = useState<RestockItem[]>([]);

    // Maps ProductID -> List of Linked Suppliers
    const [productSuppliers, setProductSuppliers] = useState<Record<number, LinkedSupplier[]>>({});
    const [allSuppliers, setAllSuppliers] = useState<any[]>([]); // Fallback list

    // 1. Initialize Data
    useEffect(() => {
        if (open) {
            // Calculate initial quantities
            const initializedItems = selectedItems.map(item => ({
                ...item,
                quantity: Math.max((item.reorder_level || 0) - (item.current_stock || 0) + 5, 10)
            }));

            setItems(initializedItems);
            setResults(null);

            const token = localStorage.getItem('user_token');

            // A. Fetch All Suppliers (Background / Fallback)
            client.get('/api/v1/suppliers', { headers: { Authorization: `Bearer ${token}` } })
                .then(res => setAllSuppliers(res.data))
                .catch(console.error);

            // B. Fetch Specific Suppliers for each selected product AND auto-assign preferred supplier
            const fetchLinked = async () => {
                const map: Record<number, LinkedSupplier[]> = {};

                await Promise.all(selectedItems.map(async (item) => {
                    try {
                        const res = await client.get(`/api/v1/suppliers/product/${item.product_id}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        map[item.product_id] = res.data;
                    } catch (e) {
                        console.warn(`Could not fetch suppliers for product ${item.product_id}`);
                        map[item.product_id] = [];
                    }
                }));
                setProductSuppliers(map);

                // Auto-assign preferred supplier (or first linked supplier) to items that don't have one
                setItems(prevItems => prevItems.map(item => {
                    // If item already has a valid supplier_id, keep it
                    if (item.supplier_id && item.supplier_id > 0) return item;

                    const linkedSups = map[item.product_id] || [];
                    if (linkedSups.length > 0) {
                        // Find preferred supplier, or use first one
                        const preferredSup = linkedSups.find(s => s.is_preferred) || linkedSups[0];
                        return {
                            ...item,
                            supplier_id: preferredSup.id,
                            supplier_name: preferredSup.name,
                            average_cost: preferredSup.cost
                        };
                    }
                    return item;
                }));
            };
            fetchLinked();
        }
    }, [open, selectedItems]);

    // 2. Grouping Logic
    const groupedOrders = useMemo(() => {
        const groups: Record<number, { name: string, items: RestockItem[] }> = {};

        items.forEach(item => {
            const supId = item.supplier_id || -1;

            // Determine Supplier Name
            // 1. Check linked list first
            let supName = productSuppliers[item.product_id]?.find(s => s.id === supId)?.name;
            // 2. Check global list
            if (!supName) supName = allSuppliers.find(s => s.id === supId)?.name;
            // 3. Fallback
            if (!supName) supName = item.supplier_name || 'Unknown Supplier';

            if (!groups[supId]) {
                groups[supId] = { name: supName, items: [] };
            }
            groups[supId].items.push(item);
        });

        return Object.entries(groups).map(([id, group]) => ({
            supplierId: parseInt(id),
            supplierName: group.name,
            items: group.items
        }));
    }, [items, allSuppliers, productSuppliers]);

    // 3. Handlers
    const handleSupplierChange = (productId: number, newSupplierId: number) => {
        // Find the cost for this new supplier if available
        const linkedSup = productSuppliers[productId]?.find(s => s.id === newSupplierId);

        setItems(prevItems => prevItems.map(item => {
            if (item.product_id === productId) {
                return {
                    ...item,
                    supplier_id: newSupplierId,
                    // Auto-update cost if we know it from the linked table
                    average_cost: linkedSup ? linkedSup.cost : item.average_cost
                };
            }
            return item;
        }));
    };

    const handleQuantityChange = (productId: number, newQty: number) => {
        setItems(prevItems => prevItems.map(item => {
            if (item.product_id === productId) {
                return { ...item, quantity: newQty };
            }
            return item;
        }));
    };

    // 4. Create Orders
    const handleConfirm = async () => {
        setLoading(true);
        let successCount = 0;
        let failCount = 0;

        console.log("=== BULK RESTOCK DEBUG ===");
        console.log("groupedOrders:", groupedOrders);
        console.log("items:", items);

        for (const group of groupedOrders) {
            console.log(`Processing group: supplierId=${group.supplierId}, name=${group.supplierName}, items=${group.items.length}`);

            if (group.supplierId === -1) {
                console.log("Skipping group with supplierId -1");
                continue;
            }

            const payload: POCreatePayload = {
                supplier_id: Number(group.supplierId),
                notes: "Auto-generated from Low Stock Report",
                items: group.items.map(i => {
                    // Parse average_cost - remove any ₹ symbol if present
                    let cost = i.average_cost;
                    if (typeof cost === 'string') {
                        cost = parseFloat(cost.replace(/[₹,]/g, '')) || 0;
                    }
                    return {
                        product_id: Number(i.product_id),
                        quantity: Math.floor(Number(i.quantity) || 1),
                        unit_cost: Number(cost) || 0
                    };
                })
            };

            console.log("Sending payload:", payload);

            try {
                await createPurchaseOrder(payload);
                successCount++;
                console.log("Order created successfully");
            } catch (error) {
                console.error(`Failed to create order for ${group.supplierName}`, error);
                failCount++;
            }
        }

        console.log(`Final counts: success=${successCount}, failed=${failCount}`);
        setLoading(false);
        setResults({ success: successCount, failed: failCount });

        if (failCount === 0 && successCount > 0) {
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1500);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle>📦 Bulk Restock Wizard</DialogTitle>

            <DialogContent>
                {results ? (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <CheckIcon color="success" sx={{ fontSize: 60, mb: 2 }} />
                        <Typography variant="h5" gutterBottom>Processing Complete</Typography>
                        <Typography>Successfully processed <b>{results.success}</b> orders.</Typography>
                    </Box>
                ) : (
                    <Box sx={{ mt: 1 }}>
                        <Alert severity="info" sx={{ mb: 2 }}>
                            Items are automatically grouped by Supplier.
                            Change a <b>Target Supplier</b> to move an item to a different group.
                        </Alert>

                        {groupedOrders.length === 0 && (
                            <Typography align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                No items selected.
                            </Typography>
                        )}

                        {groupedOrders.map((group) => (
                            <Accordion key={group.supplierId} defaultExpanded sx={{ mb: 1, border: '1px solid #eee' }} disableGutters elevation={0}>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: '#f8fafc' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                                        <Typography fontWeight="bold" variant="subtitle1">{group.supplierName}</Typography>
                                        <Chip
                                            label={`${group.items.length} Items`}
                                            size="small"
                                            color="primary"
                                            sx={{ fontWeight: 'bold' }}
                                        />
                                        {group.supplierId === -1 && <Chip label="Missing Supplier" color="error" size="small" />}
                                    </Box>
                                </AccordionSummary>
                                <AccordionDetails sx={{ p: 0 }}>
                                    <TableContainer>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>Product</TableCell>
                                                    <TableCell width="35%">Target Supplier</TableCell>
                                                    <TableCell align="right">Current</TableCell>
                                                    <TableCell align="right" width="15%">Order Qty</TableCell>
                                                    <TableCell align="right">Est. Cost</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {group.items.map(item => {
                                                    const linkedSups = productSuppliers[item.product_id] || [];
                                                    const hasLinked = linkedSups.length > 0;

                                                    return (
                                                        <TableRow key={item.product_id} hover>
                                                            <TableCell>
                                                                <Typography variant="body2" fontWeight="500">{item.product_name}</Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <TextField
                                                                    select
                                                                    size="small"
                                                                    fullWidth
                                                                    variant="standard"
                                                                    value={item.supplier_id || ''}
                                                                    onChange={(e) => handleSupplierChange(item.product_id, parseInt(e.target.value))}
                                                                    InputProps={{ disableUnderline: true, sx: { fontSize: '0.875rem' } }}
                                                                    disabled={!hasLinked}
                                                                >
                                                                    {/* Only show Linked Suppliers */}
                                                                    {hasLinked ? (
                                                                        linkedSups.map(s => (
                                                                            <MenuItem key={s.id} value={s.id}>
                                                                                {s.name} {s.is_preferred ? "(Preferred)" : ""} - ₹{s.cost}
                                                                            </MenuItem>
                                                                        ))
                                                                    ) : (
                                                                        <MenuItem disabled value="">
                                                                            No linked suppliers - Link via Catalog tab
                                                                        </MenuItem>
                                                                    )}
                                                                </TextField>
                                                            </TableCell>
                                                            <TableCell align="right">{item.current_stock}</TableCell>
                                                            <TableCell align="right">
                                                                <TextField
                                                                    type="text"
                                                                    size="small"
                                                                    variant="outlined"
                                                                    value={item.quantity}
                                                                    onFocus={(e) => e.target.select()}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        if (/^\d*$/.test(val)) {
                                                                            const cleanVal = val.replace(/^0+/, '') || '0';
                                                                            handleQuantityChange(item.product_id, parseInt(cleanVal, 10));
                                                                        }
                                                                    }}
                                                                    InputProps={{
                                                                        sx: {
                                                                            '& input': {
                                                                                textAlign: 'right',
                                                                                fontWeight: 'bold',
                                                                                py: 0.5,
                                                                                px: 1
                                                                            }
                                                                        }
                                                                    }}
                                                                />
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                {typeof item.average_cost === 'string' && item.average_cost.includes('₹')
                                                                    ? item.average_cost
                                                                    : `₹${item.average_cost || 0}`}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </AccordionDetails>
                            </Accordion>
                        ))}
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2, bgcolor: '#fafafa' }}>
                {!results && (
                    <>
                        <Button onClick={onClose} disabled={loading} color="inherit">Cancel</Button>
                        <Button
                            onClick={handleConfirm}
                            variant="contained"
                            color="primary"
                            disabled={loading || groupedOrders.length === 0}
                            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
                        >
                            {loading ? 'Processing...' : `Create new / Add to existing order (${groupedOrders.length})`}
                        </Button>
                    </>
                )}
                {results && (
                    <Button onClick={() => { onSuccess(); onClose(); }} variant="contained">Done</Button>
                )}
            </DialogActions>
        </Dialog>
    );
};