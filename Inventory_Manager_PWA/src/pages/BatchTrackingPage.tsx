import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, Chip, CircularProgress, Collapse, Fab, Snackbar, Alert,
    TextField, InputAdornment, IconButton, SwipeableDrawer, Select, MenuItem,
    FormControl, InputLabel,
} from '@mui/material';
import {
    Layers as BatchIcon,
    Category as ProductIcon,
    Label as VariantIcon,
    LocalShipping as POIcon,
    QrCodeScanner as ScanIcon,
    Search as SearchIcon,
    ExpandMore as ExpandIcon,
    ChevronRight as CollapseIcon,
    Warning as ExpiryIcon,
    Close as CloseIcon,
    Inventory as StockIcon,
    CalendarMonth as DateIcon,
    Store as SupplierIcon,
    LocationOn as OriginIcon,
    LocalOffer as TagIcon,
    AccessTime as TimeIcon,
    Receipt as POIdIcon,
    Sell as ClearanceIcon,
    Campaign as PromoIcon,
    PriorityHigh as PriorityIcon,
} from '@mui/icons-material';
import {
    getAllBatchTree, getBatchesByPO, scanBatch, getClearanceBatches, getBatchesByTag,
    type BatchTreeProduct, type BatchTracking, type POBatchGroup,
} from '../services/batchService';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';

// ── Helpers ───────────────────────────
const formatExpiry = (d: string | null) => {
    if (!d) return { text: 'No expiry', color: '#94a3b8', urgent: false };
    const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
    const dateStr = new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
    if (days < 0) return { text: `Expired (${dateStr})`, color: '#dc2626', urgent: true };
    if (days <= 15) return { text: `${days}d left · ${dateStr}`, color: '#dc2626', urgent: true };
    if (days <= 30) return { text: `${days}d left · ${dateStr}`, color: '#d97706', urgent: true };
    if (days <= 60) return { text: `${days}d · ${dateStr}`, color: '#d97706', urgent: false };
    return { text: `${days}d · ${dateStr}`, color: '#16a34a', urgent: false };
};

const tagColors: Record<string, { bg: string; color: string }> = {
    clearance: { bg: '#fef2f2', color: '#dc2626' },
    promotional: { bg: '#f0fdf4', color: '#16a34a' },
    priority: { bg: '#fffbeb', color: '#d97706' },
    normal: { bg: '#f1f5f9', color: '#94a3b8' },
};

// ── Batch Detail Bottom Sheet ─────────
const BatchDetailSheet: React.FC<{
    batch: BatchTracking | null;
    open: boolean;
    onClose: () => void;
}> = ({ batch, open, onClose }) => {
    if (!batch) return null;
    const exp = formatExpiry(batch.expiry_date);
    const tag = tagColors[batch.batch_tag] || tagColors.normal;

    const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: string | number | null; color?: string }> = ({ icon, label, value, color }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, borderBottom: '1px solid #f1f5f9' }}>
            <Box sx={{ color: '#94a3b8', display: 'flex' }}>{icon}</Box>
            <Box sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.88rem', color: color || '#1e293b' }}>{value || '—'}</Typography>
            </Box>
        </Box>
    );

    return (
        <SwipeableDrawer
            anchor="bottom"
            open={open}
            onClose={onClose}
            onOpen={() => { }}
            disableSwipeToOpen
            PaperProps={{
                sx: { borderRadius: '20px 20px 0 0', maxHeight: '85dvh', pb: 'env(safe-area-inset-bottom)' }
            }}
        >
            {/* Drag handle */}
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
                <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: '#d1d5db' }} />
            </Box>

            <Box sx={{ px: 2.5, pb: 3 }}>
                {/* Header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                        <Typography variant="h6" fontWeight={800} sx={{ color: '#1e293b', lineHeight: 1.2 }}>
                            {batch.product_name || 'Unknown Product'}
                        </Typography>
                        {batch.variant_name && (
                            <Chip label={batch.variant_name} size="small" sx={{ mt: 0.5, fontSize: '0.72rem', height: 22, bgcolor: '#f5f3ff', color: '#7c3aed', fontWeight: 600 }} />
                        )}
                    </Box>
                    <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
                </Box>

                {/* Batch code badge */}
                <Box sx={{
                    display: 'flex', alignItems: 'center', gap: 1, mb: 2, p: 1.5,
                    bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0'
                }}>
                    <BatchIcon sx={{ color: '#4f46e5', fontSize: 20 }} />
                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#4f46e5', fontSize: '0.9rem', flex: 1 }}>
                        {batch.batch_code}
                    </Typography>
                    {batch.batch_tag !== 'normal' && (
                        <Chip label={batch.batch_tag} size="small" sx={{ fontSize: '0.65rem', height: 20, bgcolor: tag.bg, color: tag.color, fontWeight: 600, textTransform: 'capitalize' }} />
                    )}
                </Box>

                {/* Info rows */}
                <InfoRow icon={<StockIcon sx={{ fontSize: 18 }} />} label="Stock Quantity" value={batch.stock_quantity} color={batch.stock_quantity > 0 ? '#16a34a' : '#dc2626'} />
                <InfoRow icon={<ExpiryIcon sx={{ fontSize: 18 }} />} label="Expiry" value={exp.text} color={exp.color} />
                <InfoRow icon={<SupplierIcon sx={{ fontSize: 18 }} />} label="Supplier" value={batch.supplier_name} />
                {batch.procurement_price != null && (
                    <InfoRow icon={<TagIcon sx={{ fontSize: 18 }} />} label="Procurement Price" value={`₹${batch.procurement_price.toLocaleString('en-IN')}`} />
                )}
                {batch.state_of_origin && (
                    <InfoRow icon={<OriginIcon sx={{ fontSize: 18 }} />} label="Origin" value={batch.state_of_origin} />
                )}
                {batch.manufacturing_date && (
                    <InfoRow icon={<DateIcon sx={{ fontSize: 18 }} />} label="Manufactured" value={new Date(batch.manufacturing_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
                )}
                {batch.po_id && (
                    <InfoRow icon={<POIdIcon sx={{ fontSize: 18 }} />} label="Purchase Order" value={`PO-${batch.po_id}`} />
                )}
                <InfoRow icon={<TimeIcon sx={{ fontSize: 18 }} />} label="Created" value={new Date(batch.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
                {batch.batch_description && (
                    <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#fafbfc', borderRadius: 2 }}>
                        <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.68rem', textTransform: 'uppercase' }}>Description</Typography>
                        <Typography variant="body2" sx={{ mt: 0.3, fontSize: '0.85rem', color: '#475569' }}>{batch.batch_description}</Typography>
                    </Box>
                )}
            </Box>
        </SwipeableDrawer>
    );
};

// ── Mobile Batch Card ─────────────────
const BatchCard: React.FC<{
    batch: BatchTracking;
    onTap: (b: BatchTracking) => void;
}> = ({ batch, onTap }) => {
    const exp = formatExpiry(batch.expiry_date);
    return (
        <Box
            onClick={() => onTap(batch)}
            sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, py: 1, px: 1.5,
                cursor: 'pointer', '&:hover': { bgcolor: '#f8fafc' },
                borderBottom: '1px solid #f1f5f9',
            }}
        >
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#4f46e5', fontWeight: 600 }}>
                    {batch.batch_code}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mt: 0.2 }}>
                    <Typography variant="caption" sx={{ color: exp.color, fontWeight: exp.urgent ? 600 : 400, fontSize: '0.7rem' }}>{exp.text}</Typography>
                </Box>
            </Box>
            <Chip
                label={`${batch.stock_quantity} qty`}
                size="small"
                sx={{
                    fontWeight: 700, fontSize: '0.72rem', height: 24,
                    bgcolor: batch.stock_quantity > 0 ? '#f0fdf4' : '#fef2f2',
                    color: batch.stock_quantity > 0 ? '#16a34a' : '#dc2626',
                }}
            />
        </Box>
    );
};

// ── Variant Section (Expandable) ──────
const VariantSection: React.FC<{
    variant: { variant_id: number | null; variant_name: string; batches: BatchTracking[]; total_quantity: number };
    onBatchTap: (b: BatchTracking) => void;
}> = ({ variant, onBatchTap }) => {
    const [open, setOpen] = useState(false);
    return (
        <Box>
            <Box onClick={() => setOpen(!open)} sx={{
                display: 'flex', alignItems: 'center', gap: 1, py: 0.8, px: 1.5,
                cursor: 'pointer', bgcolor: open ? 'rgba(139,92,246,0.04)' : 'transparent',
            }}>
                {open ? <ExpandIcon sx={{ fontSize: 18, color: '#8b5cf6' }} /> : <CollapseIcon sx={{ fontSize: 18, color: '#94a3b8' }} />}
                <VariantIcon sx={{ fontSize: 14, color: '#8b5cf6' }} />
                <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.82rem', flex: 1 }}>{variant.variant_name}</Typography>
                <Typography variant="caption" sx={{ color: '#7c3aed', fontWeight: 600, fontSize: '0.72rem' }}>{variant.total_quantity} units</Typography>
            </Box>
            <Collapse in={open}>
                <Box sx={{ pl: 1 }}>
                    {variant.batches.map(b => <BatchCard key={b.id} batch={b} onTap={onBatchTap} />)}
                </Box>
            </Collapse>
        </Box>
    );
};

// ── Product Card (Expandable) ─────────
const ProductCard: React.FC<{
    product: BatchTreeProduct;
    onBatchTap: (b: BatchTracking) => void;
}> = ({ product, onBatchTap }) => {
    const [open, setOpen] = useState(false);
    const urgentCount = product.variants.reduce((s, v) =>
        s + v.batches.filter(b => b.expiry_date && Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / 86400000) <= 30).length, 0);

    return (
        <Box sx={{
            borderRadius: 2.5, overflow: 'hidden', border: '1px solid', transition: 'all 0.2s',
            borderColor: open ? '#c7d2fe' : '#e5e7eb',
            boxShadow: open ? '0 4px 12px rgba(99,102,241,0.08)' : '0 1px 2px rgba(0,0,0,0.04)',
        }}>
            <Box onClick={() => setOpen(!open)} sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, py: 1.2, px: 1.5,
                cursor: 'pointer', bgcolor: open ? '#fafaff' : 'white',
                borderLeft: '4px solid', borderLeftColor: open ? '#6366f1' : urgentCount > 0 ? '#f87171' : '#e5e7eb',
            }}>
                <Box sx={{
                    width: 36, height: 36, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: open ? '#eef2ff' : '#f8fafc', border: '1px solid', borderColor: open ? '#c7d2fe' : '#e2e8f0',
                }}>
                    <ProductIcon sx={{ fontSize: 18, color: open ? '#4f46e5' : '#94a3b8' }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={700} sx={{ fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {product.product_name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem' }}>
                        {product.variants.length} variant{product.variants.length !== 1 ? 's' : ''} · {product.total_batches} batch{product.total_batches !== 1 ? 'es' : ''}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
                    {urgentCount > 0 && <Chip label={`${urgentCount}⚠`} size="small" sx={{ fontSize: '0.65rem', height: 20, bgcolor: '#fef2f2', color: '#dc2626', fontWeight: 600 }} />}
                    <Chip label={`${product.total_quantity}`} size="small" sx={{ fontWeight: 700, fontSize: '0.72rem', height: 24, bgcolor: open ? '#eef2ff' : '#f1f5f9', color: open ? '#4f46e5' : '#475569' }} />
                </Box>
            </Box>
            <Collapse in={open}>
                <Box sx={{ borderTop: '1px solid #eef2ff', bgcolor: '#fcfcff' }}>
                    {product.variants.map(v => (
                        <VariantSection key={v.variant_id ?? 0} variant={v} onBatchTap={onBatchTap} />
                    ))}
                </Box>
            </Collapse>
        </Box>
    );
};

// ── Tag Batch Card (for Clearance / Promotional / Priority tabs) ──
const TagBatchCard: React.FC<{
    batch: BatchTracking;
    onTap: (b: BatchTracking) => void;
}> = ({ batch, onTap }) => {
    const exp = formatExpiry(batch.expiry_date);
    const tag = tagColors[batch.batch_tag] || tagColors.normal;
    return (
        <Box
            onClick={() => onTap(batch)}
            sx={{
                borderRadius: 2.5, overflow: 'hidden', border: '1px solid', borderColor: '#e5e7eb',
                bgcolor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', cursor: 'pointer',
                borderLeft: '4px solid', borderLeftColor: tag.color,
                '&:active': { transform: 'scale(0.99)' }, transition: 'all 0.15s',
            }}
        >
            <Box sx={{ p: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography fontWeight={700} sx={{ fontSize: '0.88rem', color: '#1e293b', lineHeight: 1.2 }}>
                            {batch.product_name || 'Unknown'}
                        </Typography>
                        {batch.variant_name && (
                            <Chip label={batch.variant_name} size="small" sx={{ mt: 0.3, fontSize: '0.65rem', height: 18, bgcolor: '#f5f3ff', color: '#7c3aed', fontWeight: 600 }} />
                        )}
                    </Box>
                    <Chip label={batch.batch_tag} size="small" sx={{ fontSize: '0.6rem', height: 20, bgcolor: tag.bg, color: tag.color, fontWeight: 700, textTransform: 'capitalize' }} />
                </Box>
                <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                    <Box>
                        <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.62rem', textTransform: 'uppercase' }}>Stock</Typography>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: batch.stock_quantity > 0 ? '#16a34a' : '#dc2626' }}>{batch.stock_quantity}</Typography>
                    </Box>
                    <Box>
                        <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.62rem', textTransform: 'uppercase' }}>Expiry</Typography>
                        <Typography sx={{ fontWeight: 600, fontSize: '0.78rem', color: exp.color }}>{exp.text}</Typography>
                    </Box>
                    {batch.supplier_name && (
                        <Box>
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.62rem', textTransform: 'uppercase' }}>Supplier</Typography>
                            <Typography sx={{ fontWeight: 500, fontSize: '0.78rem', color: '#475569' }}>{batch.supplier_name}</Typography>
                        </Box>
                    )}
                </Box>
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#94a3b8', mt: 0.5 }}>
                    {batch.batch_code}
                </Typography>
            </Box>
        </Box>
    );
};

// ── PO Group Card (Expandable) ────────
const POGroupCard: React.FC<{
    group: POBatchGroup;
    onBatchTap: (b: BatchTracking) => void;
}> = ({ group, onBatchTap }) => {
    const [open, setOpen] = useState(false);
    return (
        <Box sx={{
            borderRadius: 2.5, overflow: 'hidden', border: '1px solid',
            borderColor: open ? '#c7d2fe' : '#e5e7eb', transition: 'all 0.2s',
            boxShadow: open ? '0 4px 12px rgba(99,102,241,0.08)' : '0 1px 2px rgba(0,0,0,0.04)',
        }}>
            <Box onClick={() => setOpen(!open)} sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, py: 1.2, px: 1.5,
                cursor: 'pointer', bgcolor: open ? '#fafaff' : 'white',
                borderLeft: '4px solid', borderLeftColor: open ? '#6366f1' : '#e5e7eb',
            }}>
                <Box sx={{
                    width: 36, height: 36, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: open ? '#eef2ff' : '#f8fafc', border: '1px solid', borderColor: open ? '#c7d2fe' : '#e2e8f0',
                }}>
                    <POIcon sx={{ fontSize: 18, color: open ? '#4f46e5' : '#94a3b8' }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={700} sx={{ fontSize: '0.88rem', color: '#1e293b', lineHeight: 1.2 }}>
                        {group.po_number}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem' }}>
                        {group.supplier_name} · {group.total_products} item{group.total_products !== 1 ? 's' : ''}
                    </Typography>
                </Box>
                <Chip label={`${group.total_quantity}`} size="small" sx={{ fontWeight: 700, fontSize: '0.72rem', height: 24, bgcolor: open ? '#eef2ff' : '#f1f5f9', color: open ? '#4f46e5' : '#475569' }} />
            </Box>
            <Collapse in={open}>
                <Box sx={{ borderTop: '1px solid #eef2ff', bgcolor: '#fcfcff' }}>
                    {group.batches.map(b => <BatchCard key={b.id} batch={b} onTap={onBatchTap} />)}
                </Box>
            </Collapse>
        </Box>
    );
};

// ══════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════
export const BatchTrackingPage: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(0);
    const [treeData, setTreeData] = useState<BatchTreeProduct[]>([]);
    const [poData, setPOData] = useState<POBatchGroup[]>([]);
    const [clearanceBatches, setClearanceBatches] = useState<BatchTracking[]>([]);
    const [promoBatches, setPromoBatches] = useState<BatchTracking[]>([]);
    const [priorityBatches, setPriorityBatches] = useState<BatchTracking[]>([]);
    const [selectedBatch, setSelectedBatch] = useState<BatchTracking | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [supplierFilter, setSupplierFilter] = useState<string>('all');
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'warning' }>({ open: false, message: '', severity: 'success' });

    const scanner = useBarcodeScanner();

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [tree, poGroups, clearance, promo, priority] = await Promise.all([
                getAllBatchTree(),
                getBatchesByPO().catch(() => []),
                getClearanceBatches(60).catch(() => ({ total: 0, expired_count: 0, near_expiry_count: 0, batches: [] })),
                getBatchesByTag('promotional').catch(() => []),
                getBatchesByTag('priority').catch(() => []),
            ]);
            setTreeData(tree);
            setPOData(poGroups);
            setClearanceBatches(clearance.batches || []);
            setPromoBatches(promo);
            setPriorityBatches(priority);
        } catch (err) {
            console.error('Failed to load batch data', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Flatten all batches for search
    const allBatches = useMemo(() =>
        treeData.flatMap(p => p.variants.flatMap(v => v.batches)),
        [treeData]
    );

    // Unique suppliers for filter
    const supplierNames = useMemo(() => {
        const names = new Set<string>();
        poData.forEach(g => { if (g.supplier_name) names.add(g.supplier_name); });
        return Array.from(names).sort();
    }, [poData]);

    // Filter PO data by supplier
    const filteredPoData = useMemo(() => {
        if (supplierFilter === 'all') return poData;
        return poData.filter(g => g.supplier_name === supplierFilter);
    }, [poData, supplierFilter]);

    // Stats
    const totalProducts = treeData.length;
    const totalBatches = treeData.reduce((s, p) => s + p.total_batches, 0);
    const totalStock = treeData.reduce((s, p) => s + p.total_quantity, 0);

    // Batch tap → open sheet
    const handleBatchTap = (batch: BatchTracking) => {
        setSelectedBatch(batch);
        setSheetOpen(true);
    };

    // Scan handler
    const handleScan = async () => {
        try {
            const result = await scanner.startScan();
            const code = result?.content;
            if (!code) return;

            setSnackbar({ open: true, message: `Scanning: ${code}...`, severity: 'success' });

            const results = await scanBatch(code);
            if (results.length > 0) {
                setSelectedBatch(results[0]);
                setSheetOpen(true);
                if (navigator.vibrate) navigator.vibrate(100);
            } else {
                setSnackbar({ open: true, message: `No batch found for: ${code}`, severity: 'warning' });
            }
        } catch (err: any) {
            if (err?.message !== 'User cancelled') {
                setSnackbar({ open: true, message: 'Scan failed — try again', severity: 'error' });
            }
        }
    };

    // Manual search
    const handleSearch = async () => {
        const q = searchQuery.trim();
        if (!q) return;

        const local = allBatches.filter(b =>
            (b.batch_code || '').toLowerCase().includes(q.toLowerCase()) ||
            (b.product_name || '').toLowerCase().includes(q.toLowerCase()) ||
            (b.supplier_name || '').toLowerCase().includes(q.toLowerCase())
        );
        if (local.length > 0) {
            handleBatchTap(local[0]);
            return;
        }
        try {
            const results = await scanBatch(q);
            if (results.length > 0) {
                handleBatchTap(results[0]);
            } else {
                setSnackbar({ open: true, message: `No results for "${q}"`, severity: 'warning' });
            }
        } catch {
            setSnackbar({ open: true, message: `Not found: "${q}"`, severity: 'warning' });
        }
    };

    const tabs = [
        { label: 'All', icon: <BatchIcon sx={{ fontSize: 14 }} />, count: totalBatches },
        { label: 'Supplier', icon: <POIcon sx={{ fontSize: 14 }} />, count: poData.length },
        { label: 'Clearance', icon: <ClearanceIcon sx={{ fontSize: 14 }} />, count: clearanceBatches.length },
        { label: 'Promo', icon: <PromoIcon sx={{ fontSize: 14 }} />, count: promoBatches.length },
        { label: 'Priority', icon: <PriorityIcon sx={{ fontSize: 14 }} />, count: priorityBatches.length },
    ];

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50dvh' }}>
                <CircularProgress sx={{ color: '#6366f1' }} />
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 10 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{
                    width: 40, height: 40, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)', boxShadow: '0 4px 14px rgba(79,70,229,0.3)',
                }}>
                    <BatchIcon sx={{ color: 'white', fontSize: 22 }} />
                </Box>
                <Box>
                    <Typography variant="h6" fontWeight={800} sx={{
                        lineHeight: 1.2, fontSize: '1.1rem',
                        background: 'linear-gradient(135deg, #1e1b4b 0%, #4f46e5 100%)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>
                        Batch Tracking
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem' }}>
                        Track batches & scan QR codes
                    </Typography>
                </Box>
            </Box>

            {/* Stats */}
            <Box sx={{ display: 'flex', gap: 1 }}>
                {[
                    { label: 'Products', value: totalProducts, gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' },
                    { label: 'Batches', value: totalBatches, gradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)' },
                    { label: 'Stock', value: totalStock.toLocaleString(), gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
                ].map(s => (
                    <Box key={s.label} sx={{
                        flex: 1, p: 1.2, borderRadius: 2, background: s.gradient, color: 'white',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}>
                        <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</Typography>
                        <Typography fontWeight={800} sx={{ fontSize: '1.1rem', lineHeight: 1.2 }}>{s.value}</Typography>
                    </Box>
                ))}
            </Box>

            {/* Search Bar */}
            <TextField
                fullWidth
                variant="outlined"
                placeholder="Search batch, product, or type code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                size="small"
                autoComplete="off"
                InputProps={{
                    startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#94a3b8', fontSize: 18 }} /></InputAdornment>,
                    endAdornment: searchQuery ? (
                        <InputAdornment position="end">
                            <IconButton size="small" onClick={handleSearch} sx={{ bgcolor: '#4f46e5', color: 'white', width: 26, height: 26, '&:hover': { bgcolor: '#4338ca' } }}>
                                <SearchIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                        </InputAdornment>
                    ) : null,
                    sx: {
                        bgcolor: 'white', borderRadius: 2, fontSize: '0.85rem',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6366f1', borderWidth: 2 },
                    },
                }}
            />

            {/* Pill Tabs — scrollable row */}
            <Box sx={{ display: 'flex', gap: 0.5, p: 0.5, bgcolor: '#f1f5f9', borderRadius: 2.5, overflowX: 'auto', WebkitOverflowScrolling: 'touch', '&::-webkit-scrollbar': { display: 'none' } }}>
                {tabs.map((tab, i) => {
                    const isActive = activeTab === i;
                    return (
                        <Box key={i} onClick={() => setActiveTab(i)} sx={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.4,
                            py: 0.7, px: 1.2, borderRadius: 2, cursor: 'pointer', transition: 'all 0.2s',
                            bgcolor: isActive ? 'white' : 'transparent',
                            boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            color: isActive ? '#4f46e5' : '#64748b',
                            flexShrink: 0, minWidth: 'fit-content',
                        }}>
                            {tab.icon}
                            <Typography sx={{ fontSize: '0.72rem', fontWeight: isActive ? 700 : 500, whiteSpace: 'nowrap' }}>{tab.label}</Typography>
                            {tab.count > 0 && <Chip label={tab.count} size="small" sx={{ height: 16, fontSize: '0.55rem', fontWeight: 700, bgcolor: isActive ? '#eef2ff' : '#e2e8f0', color: isActive ? '#4f46e5' : '#64748b' }} />}
                        </Box>
                    );
                })}
            </Box>

            {/* ── Tab 0: All Batches ───────────────────── */}
            {activeTab === 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {treeData.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 4, color: '#94a3b8' }}>
                            <BatchIcon sx={{ fontSize: 40, mb: 1, opacity: 0.3 }} />
                            <Typography variant="body2">No batches found</Typography>
                        </Box>
                    ) : (
                        treeData.map(p => <ProductCard key={p.product_id} product={p} onBatchTap={handleBatchTap} />)
                    )}
                </Box>
            )}

            {/* ── Tab 1: By Supplier ───────────────────── */}
            {activeTab === 1 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {/* Supplier filter */}
                    {supplierNames.length > 1 && (
                        <FormControl fullWidth size="small">
                            <InputLabel>Filter by Supplier</InputLabel>
                            <Select
                                value={supplierFilter}
                                label="Filter by Supplier"
                                onChange={e => setSupplierFilter(e.target.value)}
                                sx={{ bgcolor: 'white', borderRadius: 2, fontSize: '0.85rem' }}
                            >
                                <MenuItem value="all">All Suppliers ({poData.length})</MenuItem>
                                {supplierNames.map(name => {
                                    const count = poData.filter(g => g.supplier_name === name).length;
                                    return <MenuItem key={name} value={name}>{name} ({count})</MenuItem>;
                                })}
                            </Select>
                        </FormControl>
                    )}
                    {filteredPoData.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 4, color: '#94a3b8' }}>
                            <POIcon sx={{ fontSize: 40, mb: 1, opacity: 0.3 }} />
                            <Typography variant="body2">No purchase orders with batches</Typography>
                        </Box>
                    ) : (
                        filteredPoData.map((g, i) => <POGroupCard key={g.po_id ?? i} group={g} onBatchTap={handleBatchTap} />)
                    )}
                </Box>
            )}

            {/* ── Tab 2: Clearance ─────────────────────── */}
            {activeTab === 2 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {clearanceBatches.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 4, color: '#94a3b8' }}>
                            <ClearanceIcon sx={{ fontSize: 40, mb: 1, opacity: 0.3 }} />
                            <Typography variant="body2">No clearance batches</Typography>
                            <Typography variant="caption" color="text.secondary">Expired or near-expiry batches shown here</Typography>
                        </Box>
                    ) : (
                        clearanceBatches.map(b => <TagBatchCard key={b.id} batch={b} onTap={handleBatchTap} />)
                    )}
                </Box>
            )}

            {/* ── Tab 3: Promotional ───────────────────── */}
            {activeTab === 3 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {promoBatches.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 4, color: '#94a3b8' }}>
                            <PromoIcon sx={{ fontSize: 40, mb: 1, opacity: 0.3 }} />
                            <Typography variant="body2">No promotional batches</Typography>
                            <Typography variant="caption" color="text.secondary">Batches tagged as promotional appear here</Typography>
                        </Box>
                    ) : (
                        promoBatches.map(b => <TagBatchCard key={b.id} batch={b} onTap={handleBatchTap} />)
                    )}
                </Box>
            )}

            {/* ── Tab 4: Priority ──────────────────────── */}
            {activeTab === 4 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {priorityBatches.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 4, color: '#94a3b8' }}>
                            <PriorityIcon sx={{ fontSize: 40, mb: 1, opacity: 0.3 }} />
                            <Typography variant="body2">No priority batches</Typography>
                            <Typography variant="caption" color="text.secondary">Batches tagged as priority appear here</Typography>
                        </Box>
                    ) : (
                        priorityBatches.map(b => <TagBatchCard key={b.id} batch={b} onTap={handleBatchTap} />)
                    )}
                </Box>
            )}

            {/* Floating Scan Button */}
            <Fab
                onClick={handleScan}
                disabled={scanner.isScanning}
                sx={{
                    position: 'fixed', bottom: 'calc(80px + env(safe-area-inset-bottom))', right: 20,
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    color: 'white',
                    boxShadow: '0 6px 20px rgba(99,102,241,0.4)',
                    '&:hover': { background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' },
                    width: 56, height: 56,
                }}
            >
                {scanner.isScanning ? <CircularProgress size={24} sx={{ color: 'white' }} /> : <ScanIcon sx={{ fontSize: 28 }} />}
            </Fab>

            {/* Batch Detail Sheet */}
            <BatchDetailSheet batch={selectedBatch} open={sheetOpen} onClose={() => setSheetOpen(false)} />

            {/* Snackbar */}
            <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(p => ({ ...p, open: false }))} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
                <Alert severity={snackbar.severity} onClose={() => setSnackbar(p => ({ ...p, open: false }))} sx={{ borderRadius: 2, fontWeight: 600 }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default BatchTrackingPage;
