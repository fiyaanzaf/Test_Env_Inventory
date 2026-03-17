import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, Paper, TextField, InputAdornment,
    CircularProgress, Chip, IconButton, Alert,
    MenuItem, Select, FormControl, InputLabel
} from '@mui/material';
import {
    Search as SearchIcon,
    Refresh as RefreshIcon,
    Inventory as InventoryIcon,
    Warning as ClearanceIcon,
    LocalOffer as PromoIcon,
    PriorityHigh as PriorityIcon,
    TrendingUp as ValueIcon,
    Timer as ExpiryIcon,
    Category as ProductsIcon,
    Layers as BatchesIcon,
    FilterList as FilterIcon,
    Sort as SortIcon,
    LocalShipping as ShipmentIcon,
    Close as CloseIcon,
    AccessTime as ClockIcon,
} from '@mui/icons-material';
import { BatchTreeView } from '../components/BatchTreeView';
import { POBatchView } from '../components/POBatchView';
import { BatchTransferDialog } from '../components/BatchTransferDialog';
import { BatchDetailDrawer } from '../components/BatchDetailDrawer';
import { BatchBarcodeDialog } from '../components/BatchBarcodeDialog';
import {
    getHubData, setBatchTag,
    type BatchTreeProduct, type BatchTracking, type ClearanceResponse, type POBatchGroup
} from '../services/batchService';

// Module-level cache — survives tab switches without re-fetching
interface BatchPageCache {
    treeData: BatchTreeProduct[];
    clearanceData: ClearanceResponse | null;
    promoBatches: BatchTracking[];
    priorityBatches: BatchTracking[];
    poData: POBatchGroup[];
}
let _batchCache: BatchPageCache | null = null;

// Dashboard stat card
const StatCard: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string | number;
    subtext?: string;
    gradient: string;
    textColor?: string;
}> = ({ icon, label, value, subtext, gradient, textColor = 'white' }) => (
    <Paper elevation={0} sx={{
        flex: 1, p: 2.5, borderRadius: 3, minWidth: 180,
        background: gradient,
        color: textColor,
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 6px 20px rgba(0,0,0,0.12)' },
    }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.2)', display: 'flex' }}>
                {icon}
            </Box>
            <Box>
                <Typography variant="caption" sx={{ opacity: 0.85, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {label}
                </Typography>
                <Typography variant="h5" fontWeight={800} sx={{ lineHeight: 1.2 }}>{value}</Typography>
                {subtext && (
                    <Typography variant="caption" sx={{ opacity: 0.75, fontSize: '0.65rem' }}>{subtext}</Typography>
                )}
            </Box>
        </Box>
    </Paper>
);

export const BatchTrackingPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState(0);
    const [loading, setLoading] = useState(!_batchCache);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<BatchTracking[] | null>(null);
    const [searchError, setSearchError] = useState('');

    // Data — initialize from cache for instant render
    const [treeData, setTreeData] = useState<BatchTreeProduct[]>(_batchCache?.treeData || []);
    const [clearanceData, setClearanceData] = useState<ClearanceResponse | null>(_batchCache?.clearanceData || null);
    const [promoBatches, setPromoBatches] = useState<BatchTracking[]>(_batchCache?.promoBatches || []);
    const [priorityBatches, setPriorityBatches] = useState<BatchTracking[]>(_batchCache?.priorityBatches || []);
    const [poData, setPOData] = useState<POBatchGroup[]>(_batchCache?.poData || []);


    // Progressive rendering — mount heavy content after initial paint
    const [hydrated, setHydrated] = useState(!!_batchCache);
    useEffect(() => {
        if (!hydrated) {
            const raf = requestAnimationFrame(() => setHydrated(true));
            return () => cancelAnimationFrame(raf);
        }
    }, []);

    // Filters
    const [sortBy, setSortBy] = useState<string>('expiry');
    const [filterSupplier, setFilterSupplier] = useState<string>('all');

    // Detail drawer
    const [selectedBatch, setSelectedBatch] = useState<BatchTracking | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Transfer dialog
    const [transferOpen, setTransferOpen] = useState(false);
    const [transferBatch, setTransferBatchState] = useState<BatchTracking | null>(null);

    // Barcode dialog
    const [barcodeOpen, setBarcodeOpen] = useState(false);
    const [barcodeBatch, setBarcodeBatch] = useState<BatchTracking | null>(null);

    // Last updated timestamp
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [, setTick] = useState(0); // forces re-render for relative time

    // Shared fetch logic — single API call updates all state + cache
    const applyHubData = useCallback((data: { tree_data: BatchTreeProduct[]; clearance: ClearanceResponse; promotional: BatchTracking[]; priority: BatchTracking[]; po_groups: POBatchGroup[] }) => {
        _batchCache = { treeData: data.tree_data, clearanceData: data.clearance, promoBatches: data.promotional, priorityBatches: data.priority, poData: data.po_groups };
        setTreeData(data.tree_data);
        setClearanceData(data.clearance);
        setPromoBatches(data.promotional);
        setPriorityBatches(data.priority);
        setPOData(data.po_groups);
        setLastUpdated(new Date());
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getHubData();
            applyHubData(data);
        } catch (err) {
            console.error('Failed to load batch data', err);
        } finally {
            setLoading(false);
        }
    }, [applyHubData]);

    useEffect(() => {
        if (_batchCache) {
            // Instant render from cache, then silent background refresh
            setLoading(false);
            getHubData()
                .then(applyHubData)
                .catch(() => {});
        } else {
            loadData();
        }
    }, []);


    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 30000);
        return () => clearInterval(interval);
    }, []);

    // Search — client-side multi-parameter search

    const handleSearch = () => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) {
            setSearchResults(null);
            setSearchError('');
            return;
        }
        // Search across all loaded batches
        const matches = allBatchesFlat.filter(b =>
            (b.batch_code || '').toLowerCase().includes(q) ||
            (b.product_name || '').toLowerCase().includes(q) ||
            (b.supplier_name || '').toLowerCase().includes(q) ||
            (b.variant_name || '').toLowerCase().includes(q) ||
            (b.state_of_origin || '').toLowerCase().includes(q) ||
            (b.batch_description || '').toLowerCase().includes(q) ||
            (b.batch_tag || '').toLowerCase().includes(q)
        );

        if (matches.length === 0) {
            setSearchError(`No results for "${searchQuery.trim()}"`);
            setSearchResults([]);
        } else {
            setSearchError('');
            setSearchResults(matches);
            // Auto-open drawer if exactly 1 result
            if (matches.length === 1) {
                setSelectedBatch(matches[0]);
                setDrawerOpen(true);
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSearch();
    };

    // Tag actions
    const handleSetTag = async (batchId: number, tag: string, reason?: string) => {
        try {
            await setBatchTag(batchId, tag, undefined, reason);
            loadData();
        } catch (err) {
            console.error('Failed to set tag', err);
        }
    };

    // Transfer
    const handleTransfer = (batch: BatchTracking) => {
        setTransferBatchState(batch);
        setTransferOpen(true);
    };

    // Batch click → open drawer
    const handleBatchClick = (batch: BatchTracking) => {
        setSelectedBatch(batch);
        setDrawerOpen(true);
    };

    // Print barcode → open barcode dialog
    const handlePrintBarcode = (batch: BatchTracking) => {
        setBarcodeBatch(batch);
        setBarcodeOpen(true);
    };

    // Stats
    const totalBatches = treeData.reduce((s, p) => s + p.total_batches, 0);
    const totalProducts = treeData.length;
    const totalStock = treeData.reduce((s, p) => s + p.total_quantity, 0);

    // Calculate total value and expiring batches
    const allBatchesFlat = useMemo(() => {
        const batches: BatchTracking[] = [];
        treeData.forEach(p => p.variants.forEach(v => v.batches.forEach(b => batches.push(b))));
        return batches;
    }, [treeData]);

    const totalValue = useMemo(() => {
        return allBatchesFlat.reduce((s, b) => s + (b.procurement_price || 0) * b.stock_quantity, 0);
    }, [allBatchesFlat]);

    const expiringThisWeek = useMemo(() => {
        const weekFromNow = new Date();
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        return allBatchesFlat.filter(b => {
            if (!b.expiry_date) return false;
            const exp = new Date(b.expiry_date);
            return exp <= weekFromNow && exp >= new Date();
        }).length;
    }, [allBatchesFlat]);

    // Unique suppliers for filter
    const suppliers = useMemo(() => {
        const set = new Set<string>();
        allBatchesFlat.forEach(b => { if (b.supplier_name) set.add(b.supplier_name); });
        return Array.from(set).sort();
    }, [allBatchesFlat]);

    // Sort helper
    const sortBatches = (batches: BatchTracking[]) => {
        const sorted = [...batches];
        switch (sortBy) {
            case 'expiry': sorted.sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999')); break;
            case 'stock_asc': sorted.sort((a, b) => a.stock_quantity - b.stock_quantity); break;
            case 'stock_desc': sorted.sort((a, b) => b.stock_quantity - a.stock_quantity); break;
            case 'value': sorted.sort((a, b) => ((b.procurement_price || 0) * b.stock_quantity) - ((a.procurement_price || 0) * a.stock_quantity)); break;
            case 'created': sorted.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')); break;
        }
        return sorted;
    };

    // Filter helper
    const filterBatches = (batches: BatchTracking[]) => {
        let filtered = batches;
        if (filterSupplier !== 'all') {
            filtered = filtered.filter(b => b.supplier_name === filterSupplier);
        }
        return sortBatches(filtered);
    };

    // Filtered tree data (respects supplier filter)
    const filteredTreeData = useMemo(() => {
        if (filterSupplier === 'all') return treeData;
        return treeData
            .map(product => ({
                ...product,
                variants: product.variants
                    .map(variant => ({
                        ...variant,
                        batches: variant.batches.filter(b => b.supplier_name === filterSupplier),
                    }))
                    .filter(variant => variant.batches.length > 0)
                    .map(variant => ({
                        ...variant,
                        total_quantity: variant.batches.reduce((s, b) => s + b.stock_quantity, 0),
                    })),
            }))
            .filter(product => product.variants.length > 0)
            .map(product => ({
                ...product,
                total_batches: product.variants.reduce((s, v) => s + v.batches.length, 0),
                total_quantity: product.variants.reduce((s, v) => s + v.total_quantity, 0),
            }));
    }, [treeData, filterSupplier]);

    // Filtered PO data (respects supplier filter)
    const filteredPOData = useMemo(() => {
        if (filterSupplier === 'all') return poData;
        return poData.filter(g => g.supplier_name === filterSupplier);
    }, [poData, filterSupplier]);

    const tabLabels = [
        { label: 'All Batches', icon: <InventoryIcon fontSize="small" />, count: totalBatches },
        { label: 'By Supplier Batch', icon: <ShipmentIcon fontSize="small" />, count: poData.length },
        { label: 'Clearance', icon: <ClearanceIcon fontSize="small" />, count: clearanceData?.total || 0 },
        { label: 'Promotional', icon: <PromoIcon fontSize="small" />, count: promoBatches.length },
        { label: 'Priority', icon: <PriorityIcon fontSize="small" />, count: priorityBatches.length },
    ];

    // Get current data based on active tab
    const getCurrentBatches = (): BatchTracking[] => {
        if (searchResults !== null) return searchResults;
        switch (activeTab) {
            case 2: return filterBatches(clearanceData?.batches || []);
            case 3: return filterBatches(promoBatches);
            case 4: return filterBatches(priorityBatches);
            default: return [];
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Page Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{
                        width: 48, height: 48, borderRadius: 3,
                        background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
                    }}>
                        <InventoryIcon sx={{ color: 'white', fontSize: 26 }} />
                    </Box>
                    <Box>
                        <Typography variant="h5" fontWeight={800} sx={{
                            background: 'linear-gradient(135deg, #1e1b4b 0%, #4f46e5 100%)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            lineHeight: 1.2,
                        }}>
                            Batch Tracking Hub
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.2, fontSize: '0.8rem' }}>
                            Track, tag, and manage inventory batches across all products
                        </Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {lastUpdated && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 0.5 }}>
                            <ClockIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                                {(() => {
                                    const diff = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
                                    if (diff < 10) return 'Just now';
                                    if (diff < 60) return `${diff}s ago`;
                                    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
                                    return lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                })()}
                            </Typography>
                        </Box>
                    )}
                    <IconButton
                        onClick={loadData}
                        disabled={loading}
                        sx={{
                            bgcolor: '#4f46e5', color: 'white', width: 38, height: 38,
                            '&:hover': { bgcolor: '#4338ca' },
                            boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
                            transition: 'all 0.2s',
                        }}
                    >
                        <RefreshIcon sx={{
                            fontSize: 20,
                            animation: loading ? 'spin 1s linear infinite' : 'none',
                            '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } },
                        }} />
                    </IconButton>
                </Box>
            </Box>

            {/* Everything below deferred until after first paint to prevent freeze */}
            {hydrated && (<>

            {/* Dashboard Cards */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <StatCard
                    icon={<ProductsIcon />}
                    label="Products"
                    value={totalProducts}
                    subtext={`${totalBatches} total batches`}
                    gradient="linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
                />
                <StatCard
                    icon={<BatchesIcon />}
                    label="Total Stock"
                    value={totalStock.toLocaleString()}
                    subtext="units across all batches"
                    gradient="linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)"
                />
                <StatCard
                    icon={<ValueIcon />}
                    label="Stock Value"
                    value={`₹${totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                    subtext="total procurement value"
                    gradient="linear-gradient(135deg, #10b981 0%, #059669 100%)"
                />
                <StatCard
                    icon={<ExpiryIcon />}
                    label="Expiring This Week"
                    value={expiringThisWeek}
                    subtext={`${clearanceData?.total || 0} within 30 days`}
                    gradient={expiringThisWeek > 0 ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #64748b 0%, #475569 100%)'}
                />
            </Box>

            {/* Search Bar — Clean & Compact */}
            <TextField
                fullWidth
                variant="outlined"
                placeholder="Search by batch code, product, supplier, variant, or origin..."
                value={searchQuery}
                onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (!e.target.value.trim()) {
                        setSearchResults(null);
                        setSearchError('');
                    }
                }}
                onKeyDown={handleKeyDown}
                size="small"
                autoComplete="off"
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon sx={{ color: '#94a3b8', fontSize: 20 }} />
                        </InputAdornment>
                    ),
                    endAdornment: searchQuery ? (
                        <InputAdornment position="end">
                            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                {searchResults !== null && (
                                    <Chip
                                        label={`${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
                                        size="small"
                                        sx={{
                                            fontSize: '0.7rem', height: 22, fontWeight: 600,
                                            bgcolor: searchResults.length > 0 ? '#f0fdf4' : '#fef2f2',
                                            color: searchResults.length > 0 ? '#16a34a' : '#dc2626',
                                        }}
                                    />
                                )}
                                <IconButton size="small" onClick={handleSearch}
                                    sx={{
                                        bgcolor: '#4f46e5', color: 'white', width: 28, height: 28,
                                        '&:hover': { bgcolor: '#4338ca' },
                                    }}>
                                    <SearchIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                                <IconButton size="small" onClick={() => {
                                    setSearchQuery(''); setSearchResults(null); setSearchError('');
                                }} sx={{ color: '#94a3b8', width: 28, height: 28 }}>
                                    <CloseIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Box>
                        </InputAdornment>
                    ) : null,
                    sx: {
                        bgcolor: 'white', borderRadius: 2.5, fontSize: '0.9rem',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#a5b4fc' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6366f1', borderWidth: 2 },
                    },
                }}
            />

            {/* Search Results */}
            {searchError && <Alert severity="warning" sx={{ borderRadius: 2 }}>{searchError}</Alert>}
            {searchResults !== null && searchResults.length > 0 && (
                <Paper elevation={0} sx={{
                    p: 2.5, borderRadius: 3, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                    <Typography variant="subtitle2" color="success.dark" sx={{ mb: 1.5, fontWeight: 600 }}>
                        🔍 Found {searchResults.length} batch{searchResults.length > 1 ? 'es' : ''}
                    </Typography>
                    <BatchTreeView
                        batches={searchResults}
                        flat
                        onBatchClick={handleBatchClick}
                        onTransfer={handleTransfer}
                        onSetTag={handleSetTag}
                        onPrintBarcode={handlePrintBarcode}
                    />
                </Paper>
            )}

            {/* Sub-Tabs + Content */}
            {searchResults === null && (
                <>
                    {/* Pill-Style Tabs */}
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'stretch' }}>
                        <Box sx={{
                            flex: 1, display: 'flex', gap: 0.5, p: 0.5,
                            bgcolor: '#f1f5f9', borderRadius: 3, alignItems: 'center',
                        }}>
                            {tabLabels.map((tab, i) => {
                                const isActive = activeTab === i;
                                const isClearance = i === 2;
                                return (
                                    <Box
                                        key={i}
                                        onClick={() => setActiveTab(i)}
                                        sx={{
                                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            gap: 0.8, py: 1, px: 1.5, borderRadius: 2.5, cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            bgcolor: isActive ? 'white' : 'transparent',
                                            boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)' : 'none',
                                            color: isActive ? '#4f46e5' : '#64748b',
                                            '&:hover': {
                                                bgcolor: isActive ? 'white' : 'rgba(255,255,255,0.6)',
                                                color: isActive ? '#4f46e5' : '#334155',
                                            },
                                        }}
                                    >
                                        {tab.icon}
                                        <Typography sx={{
                                            fontSize: '0.82rem', fontWeight: isActive ? 700 : 500,
                                            whiteSpace: 'nowrap', lineHeight: 1,
                                        }}>
                                            {tab.label}
                                        </Typography>
                                        <Chip
                                            label={tab.count}
                                            size="small"
                                            sx={{
                                                height: 18, fontSize: '0.65rem', fontWeight: 700,
                                                minWidth: 24,
                                                bgcolor: isClearance && tab.count > 0
                                                    ? '#fef2f2'
                                                    : isActive ? '#eef2ff' : '#e2e8f0',
                                                color: isClearance && tab.count > 0
                                                    ? '#dc2626'
                                                    : isActive ? '#4f46e5' : '#64748b',
                                                transition: 'all 0.2s',
                                            }}
                                        />
                                    </Box>
                                );
                            })}
                        </Box>
                    </Box>

                    {/* Filters (for non-tree tabs) */}
                    {activeTab > 0 && (
                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <FilterIcon sx={{ color: '#94a3b8' }} />
                            <FormControl size="small" sx={{ minWidth: 160 }}>
                                <InputLabel>Supplier</InputLabel>
                                <Select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} label="Supplier"
                                    sx={{ borderRadius: 2, bgcolor: 'white' }}>
                                    <MenuItem value="all">All Suppliers</MenuItem>
                                    {suppliers.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <FormControl size="small" sx={{ minWidth: 150 }}>
                                <InputLabel>Sort By</InputLabel>
                                <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} label="Sort By"
                                    sx={{ borderRadius: 2, bgcolor: 'white' }}
                                    startAdornment={<SortIcon sx={{ mr: 0.5, color: '#94a3b8' }} />}>
                                    <MenuItem value="expiry">Expiry Date</MenuItem>
                                    <MenuItem value="stock_asc">Stock (Low → High)</MenuItem>
                                    <MenuItem value="stock_desc">Stock (High → Low)</MenuItem>
                                    <MenuItem value="value">Value (High → Low)</MenuItem>
                                    <MenuItem value="created">Newest First</MenuItem>
                                </Select>
                            </FormControl>
                        </Box>
                    )}

                    {/* Tab Content */}
                    <Paper elevation={0} sx={{
                        p: 3, borderRadius: 3, minHeight: 400,
                        border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                        {loading ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', py: 10, gap: 2 }}>
                                <CircularProgress sx={{ color: '#4f46e5' }} />
                                <Typography color="text.secondary">Loading batch data...</Typography>
                            </Box>
                        ) : activeTab === 0 ? (
                            filteredTreeData.length === 0 ? (
                                <Box sx={{ textAlign: 'center', py: 8 }}>
                                    <InventoryIcon sx={{ fontSize: 64, color: '#cbd5e1', mb: 2 }} />
                                    <Typography variant="h6" color="text.secondary" fontWeight={600}>No batches found</Typography>
                                    <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
                                        {filterSupplier !== 'all' ? 'No batches from this supplier.' : 'Create batch tracking entries when receiving purchase orders.'}
                                    </Typography>
                                </Box>
                            ) : (
                                <BatchTreeView
                                    treeData={filteredTreeData}
                                    onBatchClick={handleBatchClick}
                                    onTransfer={handleTransfer}
                                    onSetTag={handleSetTag}
                                    onPrintBarcode={handlePrintBarcode}
                                />
                            )
                        ) : activeTab === 1 ? (
                            <POBatchView
                                poGroups={filteredPOData}
                                onBatchClick={handleBatchClick}
                                onTransfer={handleTransfer}
                                onSetTag={handleSetTag}
                                onPrintBarcode={handlePrintBarcode}
                            />
                        ) : (
                            getCurrentBatches().length === 0 ? (
                                <Box sx={{ textAlign: 'center', py: 8 }}>
                                    {activeTab === 2 ? <ClearanceIcon sx={{ fontSize: 64, color: '#cbd5e1', mb: 2 }} /> :
                                        activeTab === 3 ? <PromoIcon sx={{ fontSize: 64, color: '#cbd5e1', mb: 2 }} /> :
                                            <PriorityIcon sx={{ fontSize: 64, color: '#cbd5e1', mb: 2 }} />}
                                    <Typography variant="h6" color="text.secondary" fontWeight={600}>
                                        No {tabLabels[activeTab].label.toLowerCase()} batches
                                    </Typography>
                                    <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
                                        {activeTab === 2
                                            ? 'Batches within 30 days of expiry will appear here automatically.'
                                            : `Tag batches as "${tabLabels[activeTab].label}" from the All Batches tab using the 🏷️ icon.`}
                                    </Typography>
                                </Box>
                            ) : (
                                <BatchTreeView
                                    batches={getCurrentBatches()}
                                    flat
                                    onBatchClick={handleBatchClick}
                                    onTransfer={handleTransfer}
                                    onSetTag={handleSetTag}
                                    onPrintBarcode={handlePrintBarcode}
                                />
                            )
                        )}
                    </Paper>
                </>
            )}

            {/* Batch Detail Drawer */}
            <BatchDetailDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                batch={selectedBatch}
                onTransfer={(b) => { setDrawerOpen(false); handleTransfer(b); }}
                onSetTag={(id, tag) => { handleSetTag(id, tag); setDrawerOpen(false); }}
            />

            {/* Transfer Dialog */}
            <BatchTransferDialog
                open={transferOpen}
                onClose={() => setTransferOpen(false)}
                sourceBatch={transferBatch}
                treeData={treeData}
                onSuccess={() => { setTransferOpen(false); loadData(); }}
            />

            {/* Barcode Dialog */}
            <BatchBarcodeDialog
                open={barcodeOpen}
                onClose={() => setBarcodeOpen(false)}
                batchId={barcodeBatch?.id ?? null}
                batchCode={barcodeBatch?.batch_code ?? ''}
            />

            </>)}
        </Box>
    );
};
