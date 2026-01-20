import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Box, Typography, CircularProgress,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, Chip, InputAdornment, IconButton
} from '@mui/material';
import {
    Search as SearchIcon,
    Close as CloseIcon,
    Inventory as InventoryIcon,
    Store as StoreIcon,
    Warehouse as WarehouseIcon
} from '@mui/icons-material';
import { getAllProducts, type Product } from '../services/productService';
import { getProductStock, type ProductStockInfo } from '../services/inventoryService';

interface Props {
    open: boolean;
    onClose: () => void;
}

export const QuickStockLookupDialog: React.FC<Props> = ({ open, onClose }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [stockInfo, setStockInfo] = useState<ProductStockInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [stockLoading, setStockLoading] = useState(false);

    // Fetch all products on open
    useEffect(() => {
        if (open) {
            setLoading(true);
            getAllProducts()
                .then(data => {
                    setProducts(data);
                    setFilteredProducts([]);
                })
                .catch(err => console.error('Failed to load products', err))
                .finally(() => setLoading(false));

            // Reset state
            setSearchQuery('');
            setSelectedProduct(null);
            setStockInfo(null);
        }
    }, [open]);

    // Filter products based on search
    useEffect(() => {
        if (searchQuery.length >= 2) {
            const query = searchQuery.toLowerCase();
            const matches = products.filter(p =>
                p.name.toLowerCase().includes(query) ||
                p.sku.toLowerCase().includes(query)
            ).slice(0, 8); // Limit to 8 results
            setFilteredProducts(matches);
        } else {
            setFilteredProducts([]);
        }
    }, [searchQuery, products]);

    // Fetch stock info when product is selected
    const handleSelectProduct = async (product: Product) => {
        setSelectedProduct(product);
        setStockLoading(true);
        setFilteredProducts([]);
        setSearchQuery(product.name);

        try {
            const info = await getProductStock(product.id);
            setStockInfo(info);
        } catch (err) {
            console.error('Failed to load stock info', err);
        } finally {
            setStockLoading(false);
        }
    };

    const getLocationIcon = (type: string) => {
        switch (type?.toLowerCase()) {
            case 'store': return <StoreIcon sx={{ color: '#10b981', fontSize: 18 }} />;
            case 'warehouse': return <WarehouseIcon sx={{ color: '#6366f1', fontSize: 18 }} />;
            default: return <InventoryIcon sx={{ color: '#64748b', fontSize: 18 }} />;
        }
    };

    const getStockColor = (qty: number) => {
        if (qty === 0) return 'error';
        if (qty < 10) return 'warning';
        return 'success';
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SearchIcon />
                    <Typography variant="h6" fontWeight="bold">Quick Stock Lookup</Typography>
                </Box>
                <IconButton size="small" onClick={onClose} sx={{ color: 'white' }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ pt: 3 }}>
                {/* Search Input */}
                <TextField
                    fullWidth
                    autoFocus
                    placeholder="Search by product name or SKU..."
                    value={searchQuery}
                    onChange={e => {
                        setSearchQuery(e.target.value);
                        setSelectedProduct(null);
                        setStockInfo(null);
                    }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon color="action" />
                            </InputAdornment>
                        ),
                        endAdornment: searchQuery && (
                            <InputAdornment position="end">
                                <IconButton size="small" onClick={() => {
                                    setSearchQuery('');
                                    setSelectedProduct(null);
                                    setStockInfo(null);
                                }}>
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </InputAdornment>
                        )
                    }}
                    sx={{ mb: 2 }}
                />

                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress size={32} />
                    </Box>
                )}

                {/* Search Results Dropdown */}
                {!loading && filteredProducts.length > 0 && !selectedProduct && (
                    <Paper elevation={2} sx={{ mb: 2, maxHeight: 250, overflow: 'auto' }}>
                        {filteredProducts.map(product => (
                            <Box
                                key={product.id}
                                onClick={() => handleSelectProduct(product)}
                                sx={{
                                    p: 1.5,
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #e2e8f0',
                                    '&:hover': { bgcolor: '#f1f5f9' },
                                    '&:last-child': { borderBottom: 'none' }
                                }}
                            >
                                <Typography variant="body2" fontWeight={600}>{product.name}</Typography>
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                    <Typography variant="caption" color="text.secondary">{product.sku}</Typography>
                                    <Chip
                                        label={`Total: ${product.total_quantity || 0}`}
                                        size="small"
                                        color={getStockColor(product.total_quantity || 0)}
                                        variant="outlined"
                                        sx={{ height: 20, fontSize: '0.7rem' }}
                                    />
                                </Box>
                            </Box>
                        ))}
                    </Paper>
                )}

                {/* Stock Details by Location */}
                {selectedProduct && (
                    <Box>
                        {/* Product Header */}
                        <Paper sx={{ p: 2, mb: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <Typography variant="h6" fontWeight={700}>{selectedProduct.name}</Typography>
                            <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                                <Typography variant="body2" color="text.secondary">
                                    SKU: <strong>{selectedProduct.sku}</strong>
                                </Typography>
                                <Chip
                                    label={`Total Stock: ${selectedProduct.total_quantity || 0}`}
                                    size="small"
                                    color={getStockColor(selectedProduct.total_quantity || 0)}
                                    sx={{ fontWeight: 600 }}
                                />
                            </Box>
                        </Paper>

                        {/* Location Stock Table */}
                        {stockLoading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                <CircularProgress size={28} />
                            </Box>
                        ) : stockInfo && stockInfo.batches && stockInfo.batches.length > 0 ? (
                            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0' }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: '#f8fafc' }}>
                                            <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>Stock</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {/* Group batches by location */}
                                        {(() => {
                                            const locationMap = new Map<string, { type: string; qty: number }>();
                                            stockInfo.batches.forEach(batch => {
                                                const key = batch.location_name || 'Unknown';
                                                const existing = locationMap.get(key);
                                                if (existing) {
                                                    existing.qty += batch.quantity;
                                                } else {
                                                    locationMap.set(key, {
                                                        type: (batch as any).location_type || 'other',
                                                        qty: batch.quantity
                                                    });
                                                }
                                            });

                                            return Array.from(locationMap.entries()).map(([name, info]) => (
                                                <TableRow key={name} hover>
                                                    <TableCell>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            {getLocationIcon(info.type)}
                                                            <Typography variant="body2" fontWeight={500}>{name}</Typography>
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={info.type || 'Other'}
                                                            size="small"
                                                            variant="outlined"
                                                            sx={{
                                                                textTransform: 'capitalize',
                                                                fontSize: '0.7rem',
                                                                height: 22
                                                            }}
                                                        />
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Chip
                                                            label={info.qty}
                                                            size="small"
                                                            color={getStockColor(info.qty)}
                                                            sx={{ fontWeight: 700, minWidth: 40 }}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ));
                                        })()}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        ) : (
                            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                                <InventoryIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
                                <Typography variant="body2">No stock found for this product</Typography>
                            </Box>
                        )}
                    </Box>
                )}

                {/* Empty State */}
                {!loading && searchQuery.length < 2 && !selectedProduct && (
                    <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                        <SearchIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
                        <Typography variant="body2">Type at least 2 characters to search</Typography>
                    </Box>
                )}

                {/* No Results */}
                {!loading && searchQuery.length >= 2 && filteredProducts.length === 0 && !selectedProduct && (
                    <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                        <Typography variant="body2">No products found matching "{searchQuery}"</Typography>
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose} variant="outlined" color="inherit">Close</Button>
            </DialogActions>
        </Dialog>
    );
};
