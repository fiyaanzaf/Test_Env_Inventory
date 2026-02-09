import React, { useState, useEffect, useMemo } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Button, Grid, Box, Typography, IconButton,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, Chip, Alert, Autocomplete, InputAdornment,
    CircularProgress
} from '@mui/material';
import {
    Add as AddIcon,
    Remove as RemoveIcon,
    Delete as DeleteIcon,
    Inventory as StockIcon,
    Download as ReceiveIcon
} from '@mui/icons-material';
import { b2bService } from '../../services/b2bService';
import type { B2BClient, B2BPurchaseCreate } from '../../services/b2bService';
import { getAllProducts } from '../../services/productService';
import type { Product } from '../../services/productService';

interface B2BPurchaseDialogProps {
    open: boolean;
    client: B2BClient | null;
    onClose: () => void;
    onSuccess: () => void;
}

interface CartItem {
    product: Product;
    quantity: number;
    unit_cost: number;
}

export const B2BPurchaseDialog: React.FC<B2BPurchaseDialogProps> = ({
    open,
    client,
    onClose,
    onSuccess
}) => {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [notes, setNotes] = useState('');
    const [referenceNumber, setReferenceNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [productsLoading, setProductsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open && client) {
            loadData();
        }
    }, [open, client]);

    const loadData = async () => {
        setProductsLoading(true);
        try {
            const productsData = await getAllProducts();
            setProducts(productsData);
        } catch (error) {
            console.error('Failed to load products:', error);
        } finally {
            setProductsLoading(false);
        }
    };

    const addToCart = (product: Product) => {
        const existing = cart.find(item => item.product.id === product.id);
        if (existing) {
            setCart(cart.map(item =>
                item.product.id === product.id
                    ? { ...item, quantity: item.quantity + 1 }
                    : item
            ));
            return;
        }

        // Default cost to average cost, or selling price if cost is 0 (fallback)
        const defaultCost = product.average_cost || 0;

        setCart([...cart, {
            product,
            quantity: 1,
            unit_cost: defaultCost
        }]);
    };

    const updateQuantity = (productId: number, delta: number) => {
        setCart(cart.map(item => {
            if (item.product.id === productId) {
                const newQty = Math.max(1, item.quantity + delta);
                return { ...item, quantity: newQty };
            }
            return item;
        }));
    };

    const updateCost = (productId: number, cost: number) => {
        setCart(cart.map(item => {
            if (item.product.id === productId) {
                return { ...item, unit_cost: cost };
            }
            return item;
        }));
    };

    const removeFromCart = (productId: number) => {
        setCart(cart.filter(item => item.product.id !== productId));
    };

    const totals = useMemo(() => {
        const totalAmount = cart.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);
        return { totalAmount };
    }, [cart]);

    const handleSubmit = async () => {
        if (!client || cart.length === 0) return;

        setLoading(true);
        setError(null);

        try {
            const purchaseData: B2BPurchaseCreate = {
                client_id: client.id,
                items: cart.map(item => ({
                    product_id: item.product.id,
                    quantity: item.quantity,
                    unit_cost: item.unit_cost
                })),
                notes: notes || undefined,
                reference_number: referenceNumber || undefined
            };

            await b2bService.createB2BPurchase(purchaseData);
            onSuccess();
            handleClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to create purchase');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setCart([]);
        setSelectedProduct(null);
        setNotes('');
        setReferenceNumber('');
        setError(null);
        onClose();
    };

    if (!client) return null;

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ReceiveIcon color="primary" />
                Receive Items from {client.name}
            </DialogTitle>

            <DialogContent>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <Grid container spacing={3}>
                    {/* Left Side: Product Selection */}
                    <Grid size={{ xs: 12, md: 5 }}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                            Select Products to Receive
                        </Typography>
                        <Autocomplete
                            options={products}
                            getOptionLabel={(option) => `${option.name} (${option.sku})`}
                            value={selectedProduct}
                            onChange={(_, newValue) => {
                                if (newValue) {
                                    addToCart(newValue);
                                    setSelectedProduct(null);
                                }
                            }}
                            loading={productsLoading}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    placeholder="Search products..."
                                    size="small"
                                    InputProps={{
                                        ...params.InputProps,
                                        endAdornment: (
                                            <>
                                                {productsLoading ? <CircularProgress color="inherit" size={20} /> : null}
                                                {params.InputProps.endAdornment}
                                            </>
                                        ),
                                    }}
                                />
                            )}
                            renderOption={(props, option) => (
                                <Box component="li" {...props}>
                                    <Box sx={{ flexGrow: 1 }}>
                                        <Typography variant="body2">{option.name}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {option.sku}
                                        </Typography>
                                    </Box>
                                    <Chip
                                        size="small"
                                        label={`Current Stock: ${option.total_quantity}`}
                                        variant="outlined"
                                    />
                                </Box>
                            )}
                        />

                        <Box sx={{ mt: 3 }}>
                            <TextField
                                fullWidth
                                size="small"
                                label="Client Invoice / Reference No."
                                value={referenceNumber}
                                onChange={(e) => setReferenceNumber(e.target.value)}
                                placeholder="e.g. INV-2024-001"
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth
                                multiline
                                rows={3}
                                size="small"
                                label="Notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Any special instructions..."
                            />
                        </Box>
                    </Grid>

                    {/* Right Side: Cart */}
                    <Grid size={{ xs: 12, md: 7 }}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                            Items to Receive ({cart.length})
                        </Typography>

                        {cart.length === 0 ? (
                            <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'action.hover' }}>
                                <StockIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                                <Typography color="text.secondary">
                                    Add products to the list
                                </Typography>
                            </Paper>
                        ) : (
                            <>
                                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                                    <Table size="small" stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Product</TableCell>
                                                <TableCell align="center">Qty</TableCell>
                                                <TableCell align="right">Unit Cost</TableCell>
                                                <TableCell align="right">Total</TableCell>
                                                <TableCell></TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {cart.map((item) => {
                                                const lineTotal = item.quantity * item.unit_cost;

                                                return (
                                                    <TableRow key={item.product.id}>
                                                        <TableCell>
                                                            <Typography variant="body2" fontWeight={500}>
                                                                {item.product.name}
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary">
                                                                {item.product.sku}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <IconButton size="small" onClick={() => updateQuantity(item.product.id, -1)}>
                                                                    <RemoveIcon fontSize="small" />
                                                                </IconButton>
                                                                <Typography sx={{ mx: 1, minWidth: 30, textAlign: 'center' }}>
                                                                    {item.quantity}
                                                                </Typography>
                                                                <IconButton size="small" onClick={() => updateQuantity(item.product.id, 1)}>
                                                                    <AddIcon fontSize="small" />
                                                                </IconButton>
                                                            </Box>
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <TextField
                                                                size="small"
                                                                type="number"
                                                                value={item.unit_cost}
                                                                onChange={(e) => updateCost(item.product.id, parseFloat(e.target.value) || 0)}
                                                                InputProps={{
                                                                    startAdornment: <InputAdornment position="start">₹</InputAdornment>
                                                                }}
                                                                sx={{ width: 100 }}
                                                            />
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Typography fontWeight={500}>
                                                                ₹{lineTotal.toLocaleString()}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            <IconButton size="small" color="error" onClick={() => removeFromCart(item.product.id)}>
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </TableContainer>

                                <Paper sx={{ mt: 2, p: 2, bgcolor: 'primary.50' }}>
                                    <Box sx={{ textAlign: 'right' }}>
                                        <Typography variant="body2" color="text.secondary">
                                            Items will be added to inventory
                                        </Typography>
                                        <Typography variant="h5" fontWeight="bold" color="primary">
                                            Total Payable: ₹{totals.totalAmount.toLocaleString()}
                                        </Typography>
                                    </Box>
                                </Paper>
                            </>
                        )}
                    </Grid>
                </Grid>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={handleClose} disabled={loading}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={loading || cart.length === 0}
                    startIcon={<ReceiveIcon />}
                >
                    {loading ? 'Processing...' : `Receive Items`}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default B2BPurchaseDialog;
