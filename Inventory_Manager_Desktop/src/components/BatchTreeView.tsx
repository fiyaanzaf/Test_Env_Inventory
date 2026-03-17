import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Chip, IconButton, Tooltip, Collapse, Menu, MenuItem, ListItemIcon, ListItemText,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import {
    Print as PrintIcon,
    SwapHoriz as TransferIcon,
    LocalOffer as TagIcon,
    WarningAmber as ExpireIcon,
    KeyboardArrowDown,
    KeyboardArrowRight,
    KeyboardArrowLeft,
    Inventory as ProductIcon,
    Label as VariantIcon,
} from '@mui/icons-material';
import { type BatchTracking, type BatchTreeProduct, getBatchBarcodeUrl } from '../services/batchService';

interface BatchTreeViewProps {
    treeData?: BatchTreeProduct[];
    batches?: BatchTracking[];
    flat?: boolean;
    onBatchClick?: (batch: BatchTracking) => void;
    onTransfer?: (batch: BatchTracking) => void;
    onSetTag?: (batchId: number, tag: string, reason?: string) => void;
    onPrintBarcode?: (batch: BatchTracking) => void;
}

/* ── Helpers ──────────────────────────── */

const formatExpiry = (d: string | null) => {
    if (!d) return { text: '—', color: '#94a3b8', urgent: false };
    const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
    const dateStr = new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    if (days < 0) return { text: `Expired (${dateStr})`, color: '#dc2626', urgent: true };
    if (days <= 15) return { text: `${days}d — ${dateStr}`, color: '#dc2626', urgent: true };
    if (days <= 30) return { text: `${days}d — ${dateStr}`, color: '#d97706', urgent: true };
    if (days <= 60) return { text: `${days}d — ${dateStr}`, color: '#d97706', urgent: false };
    return { text: `${days}d — ${dateStr}`, color: '#16a34a', urgent: false };
};

const tagInfo: Record<string, { label: string; bg: string; color: string }> = {
    clearance: { label: 'Clearance', bg: '#fef2f2', color: '#dc2626' },
    promotional: { label: 'Promotional', bg: '#f0fdf4', color: '#16a34a' },
    priority: { label: 'Priority', bg: '#fffbeb', color: '#d97706' },
    normal: { label: 'Normal', bg: '#f8fafc', color: '#94a3b8' },
};

/* ── Tag Menu ────────────────────────── */

const TagMenu: React.FC<{ anchorEl: HTMLElement | null; onClose: () => void; onSelect: (t: string) => void }> = ({ anchorEl, onClose, onSelect }) => (
    <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={onClose} slotProps={{ paper: { sx: { borderRadius: 2 } } }}>
        {['clearance', 'promotional', 'priority', 'normal'].map(t => (
            <MenuItem key={t} onClick={() => { onSelect(t); onClose(); }} dense>
                <ListItemIcon sx={{ minWidth: 24 }}>
                    {t === 'clearance' ? <ExpireIcon sx={{ fontSize: 16, color: '#dc2626' }} /> :
                        <TagIcon sx={{ fontSize: 16, color: tagInfo[t].color }} />}
                </ListItemIcon>
                <ListItemText primaryTypographyProps={{ fontSize: '0.82rem', textTransform: 'capitalize' }}>{t}</ListItemText>
            </MenuItem>
        ))}
    </Menu>
);

/* ════════════════════════════════════════
   LAYER 2 — Compact Batch Row
   Only essentials: Code, Stock, Expiry, Tag
   Click → opens Layer 3 (detail drawer)
   ════════════════════════════════════════ */

const BatchRow: React.FC<{
    batch: BatchTracking;
    showProduct?: boolean;
    onBatchClick?: (batch: BatchTracking) => void;
    onTransfer?: (batch: BatchTracking) => void;
    onSetTag?: (batchId: number, tag: string) => void;
    onPrintBarcode?: (batch: BatchTracking) => void;
}> = ({ batch, showProduct, onBatchClick, onTransfer, onSetTag, onPrintBarcode }) => {
    const [tagEl, setTagEl] = useState<HTMLElement | null>(null);
    const exp = formatExpiry(batch.expiry_date);
    const tag = tagInfo[batch.batch_tag] || tagInfo.normal;

    return (
        <TableRow
            hover
            onClick={() => onBatchClick?.(batch)}
            sx={{
                cursor: onBatchClick ? 'pointer' : 'default',
                '&:hover': { bgcolor: '#f8fafc' },
                bgcolor: exp.urgent ? 'rgba(254,242,242,0.25)' : 'transparent',
            }}
        >
            {showProduct && (
                <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    {batch.product_name || '—'}
                    {batch.variant_name && (
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                            {batch.variant_name}
                        </Typography>
                    )}
                </TableCell>
            )}
            <TableCell>
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#4f46e5', fontWeight: 600 }}>
                    {batch.batch_code}
                </Typography>
            </TableCell>
            <TableCell>
                <Typography sx={{
                    fontWeight: 700, fontSize: '0.85rem',
                    color: batch.stock_quantity > 0 ? '#166534' : '#dc2626',
                }}>
                    {batch.stock_quantity}
                </Typography>
            </TableCell>
            <TableCell>
                <Typography sx={{ fontSize: '0.8rem', color: exp.color, fontWeight: exp.urgent ? 600 : 400 }}>
                    {exp.text}
                </Typography>
            </TableCell>
            <TableCell>
                {batch.batch_tag !== 'normal' ? (
                    <Chip label={tag.label} size="small" sx={{ fontSize: '0.7rem', height: 20, bgcolor: tag.bg, color: tag.color, fontWeight: 600 }} />
                ) : (
                    <Typography variant="caption" color="text.disabled">Normal</Typography>
                )}
            </TableCell>
            <TableCell align="right" onClick={e => e.stopPropagation()}>
                <Box sx={{ display: 'flex', gap: 0.3, justifyContent: 'flex-end' }}>
                    <Tooltip title="Print Barcode"><IconButton size="small" onClick={() => {
                        onPrintBarcode ? onPrintBarcode(batch) : window.open(`${getBatchBarcodeUrl(batch.id)}?token=${localStorage.getItem('user_token')}`, '_blank');
                    }}><PrintIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                    {onTransfer && (
                        <Tooltip title="Transfer"><IconButton size="small" onClick={() => onTransfer(batch)}><TransferIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                    )}
                    {onSetTag && (
                        <>
                            <Tooltip title="Set Tag"><IconButton size="small" onClick={e => setTagEl(e.currentTarget)}><TagIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                            <TagMenu anchorEl={tagEl} onClose={() => setTagEl(null)} onSelect={t => onSetTag(batch.id, t)} />
                        </>
                    )}
                </Box>
            </TableCell>
        </TableRow>
    );
};

/* ════════════════════════════════════════
   LAYER 1 — Variant Summary Row
   Shows: Variant name, stock, batch count
   Expand → shows Layer 2 batch table
   ════════════════════════════════════════ */

const VariantSection: React.FC<{
    variant: { variant_id: number | null; variant_name: string; batches: BatchTracking[]; total_quantity: number };
    defaultOpen?: boolean;
    onBatchClick?: (batch: BatchTracking) => void;
    onTransfer?: (batch: BatchTracking) => void;
    onSetTag?: (batchId: number, tag: string) => void;
    onPrintBarcode?: (batch: BatchTracking) => void;
}> = ({ variant, defaultOpen, onBatchClick, onTransfer, onSetTag, onPrintBarcode }) => {
    const [open, setOpen] = useState(defaultOpen ?? false);

    const nearExpiry = variant.batches.filter(b => {
        if (!b.expiry_date) return false;
        return Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / 86400000) <= 30;
    }).length;

    return (
        <Box>
            {/* Variant header */}
            <Box
                onClick={() => setOpen(!open)}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 1, py: 0.8, px: 2.5,
                    cursor: 'pointer', transition: 'all 0.15s',
                    bgcolor: open ? 'rgba(139,92,246,0.04)' : 'transparent',
                    '&:hover': { bgcolor: 'rgba(139,92,246,0.06)' },
                    borderLeft: '3px solid',
                    borderLeftColor: open ? '#8b5cf6' : 'transparent',
                }}
            >
                {open ? <KeyboardArrowDown sx={{ fontSize: 18, color: '#8b5cf6' }} /> : <KeyboardArrowRight sx={{ fontSize: 18, color: '#94a3b8' }} />}
                <Box sx={{
                    width: 24, height: 24, borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: open ? '#f5f3ff' : '#f1f5f9', transition: 'all 0.2s',
                }}>
                    <VariantIcon sx={{ fontSize: 14, color: open ? '#8b5cf6' : '#94a3b8' }} />
                </Box>
                <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem', color: open ? '#4c1d95' : '#334155' }}>
                    {variant.variant_name}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8', mx: 0.3 }}>·</Typography>
                <Typography variant="caption" sx={{ color: '#7c3aed', fontWeight: 600, fontSize: '0.75rem' }}>
                    {variant.total_quantity} units
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8', mx: 0.3 }}>·</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                    {variant.batches.length} batch{variant.batches.length !== 1 ? 'es' : ''}
                </Typography>
                {nearExpiry > 0 && (
                    <Chip label={`${nearExpiry} expiring`} size="small"
                        sx={{ fontSize: '0.63rem', height: 18, bgcolor: '#fef2f2', color: '#dc2626', fontWeight: 600, ml: 0.5 }} />
                )}
            </Box>

            {/* Layer 2: Batch table */}
            <Collapse in={open} timeout="auto">
                <Box sx={{ pl: 5, pr: 1.5, pb: 1.5, pt: 0.5 }}>
                    <TableContainer sx={{ borderRadius: 2, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ '& th': { fontWeight: 600, fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, py: 0.6, bgcolor: '#fafbfc', borderBottom: '1px solid #e2e8f0' } }}>
                                    <TableCell>Batch Code</TableCell>
                                    <TableCell>Stock</TableCell>
                                    <TableCell>Expiry</TableCell>
                                    <TableCell>Tag</TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {variant.batches.map(b => (
                                    <BatchRow key={b.id} batch={b} onBatchClick={onBatchClick} onTransfer={onTransfer} onSetTag={onSetTag} onPrintBarcode={onPrintBarcode} />
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            </Collapse>
        </Box>
    );
};

/* ════════════════════════════════════════
   LAYER 1 — Product Group Card
   Shows: Product name, total stock, badges
   Expand → shows variant sections
   ════════════════════════════════════════ */

const ProductGroup: React.FC<{
    product: BatchTreeProduct;
    defaultOpen?: boolean;
    onBatchClick?: (batch: BatchTracking) => void;
    onTransfer?: (batch: BatchTracking) => void;
    onSetTag?: (batchId: number, tag: string) => void;
    onPrintBarcode?: (batch: BatchTracking) => void;
}> = ({ product, defaultOpen, onBatchClick, onTransfer, onSetTag, onPrintBarcode }) => {
    const [open, setOpen] = useState(defaultOpen ?? false);

    const urgentCount = product.variants.reduce((s, v) =>
        s + v.batches.filter(b => b.expiry_date && Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / 86400000) <= 30).length, 0);

    const totalValue = product.variants.reduce((s, v) =>
        s + v.batches.reduce((vs, b) => vs + (b.procurement_price || 0) * b.stock_quantity, 0), 0);

    return (
        <Box sx={{
            borderRadius: 3, overflow: 'hidden', transition: 'all 0.25s ease',
            border: '1px solid', borderColor: open ? '#c7d2fe' : '#e5e7eb',
            boxShadow: open ? '0 4px 16px rgba(99,102,241,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
            '&:hover': {
                borderColor: open ? '#c7d2fe' : '#a5b4fc',
                boxShadow: '0 2px 8px rgba(99,102,241,0.08)',
            },
        }}>
            {/* Product header card */}
            <Box
                onClick={() => setOpen(!open)}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 2, py: 1.5, px: 2,
                    cursor: 'pointer', transition: 'all 0.2s',
                    bgcolor: open ? '#fafaff' : 'white',
                    '&:hover': { bgcolor: open ? '#fafaff' : '#fafbff' },
                    borderLeft: '4px solid',
                    borderLeftColor: open ? '#6366f1' : urgentCount > 0 ? '#f87171' : '#e5e7eb',
                }}
            >
                {/* Product icon */}
                <Box sx={{
                    width: 40, height: 40, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: open
                        ? 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)'
                        : '#f8fafc',
                    transition: 'all 0.2s',
                    border: '1px solid',
                    borderColor: open ? '#c7d2fe' : '#e2e8f0',
                }}>
                    <ProductIcon sx={{ fontSize: 20, color: open ? '#4f46e5' : '#94a3b8', transition: 'color 0.2s' }} />
                </Box>

                {/* Product info */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={700} sx={{
                        fontSize: '0.95rem', color: '#1e293b', lineHeight: 1.3,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {product.product_name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'center', mt: 0.3 }}>
                        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.72rem' }}>
                            {product.variants.length} variant{product.variants.length !== 1 ? 's' : ''}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#cbd5e1' }}>·</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.72rem' }}>
                            {product.total_batches} batch{product.total_batches !== 1 ? 'es' : ''}
                        </Typography>
                        {totalValue > 0 && (<>
                            <Typography variant="caption" sx={{ color: '#cbd5e1' }}>·</Typography>
                            <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.72rem' }}>
                                ₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </Typography>
                        </>)}
                    </Box>
                </Box>

                {/* Right badges */}
                <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'center', flexShrink: 0 }}>
                    {urgentCount > 0 && (
                        <Chip
                            icon={<ExpireIcon sx={{ fontSize: 14 }} />}
                            label={`${urgentCount} expiring`}
                            size="small"
                            sx={{
                                fontWeight: 600, fontSize: '0.7rem', height: 24,
                                bgcolor: '#fef2f2', color: '#dc2626',
                                '& .MuiChip-icon': { color: '#dc2626' },
                                border: '1px solid #fecaca',
                            }}
                        />
                    )}
                    <Chip
                        label={`${product.total_quantity} units`}
                        size="small"
                        sx={{
                            fontWeight: 700, fontSize: '0.75rem', height: 26,
                            bgcolor: open ? '#eef2ff' : '#f1f5f9',
                            color: open ? '#4f46e5' : '#475569',
                            border: '1px solid',
                            borderColor: open ? '#c7d2fe' : '#e2e8f0',
                            transition: 'all 0.2s',
                        }}
                    />
                    {/* Expand arrow */}
                    <Box sx={{
                        width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: open ? '#eef2ff' : '#f8fafc', transition: 'all 0.2s',
                    }}>
                        {open ? <KeyboardArrowDown sx={{ fontSize: 20, color: '#6366f1' }} /> : <KeyboardArrowRight sx={{ fontSize: 20, color: '#94a3b8' }} />}
                    </Box>
                </Box>
            </Box>

            {/* Variant sections */}
            <Collapse in={open} timeout="auto">
                <Box sx={{ borderTop: '1px solid #eef2ff', bgcolor: '#fcfcff' }}>
                    {product.variants.map((v, i) => (
                        <VariantSection
                            key={v.variant_id ?? 0}
                            variant={v}
                            defaultOpen={i === 0 && product.variants.length <= 3}
                            onBatchClick={onBatchClick}
                            onTransfer={onTransfer}
                            onSetTag={onSetTag}
                            onPrintBarcode={onPrintBarcode}
                        />
                    ))}
                </Box>
            </Collapse>
        </Box>
    );
};

/* ════════════════════════════════════════
   FLAT MODE — For Clearance / Promotional / Priority
   Simple table with product name column
   ════════════════════════════════════════ */

const flatHeaders = ['Product', 'Batch Code', 'Stock', 'Expiry', 'Tag', 'Actions'];

/* ════════════════════════════════════════
   MAIN EXPORT
   ════════════════════════════════════════ */

export const BatchTreeView: React.FC<BatchTreeViewProps> = ({ treeData, batches, flat, onBatchClick, onTransfer, onSetTag, onPrintBarcode }) => {

    // Flat mode: simple table (Clearance/Promotional/Priority tabs)
    if (flat && batches) {
        return (
            <TableContainer>
                <Table size="small">
                    <TableHead>
                        <TableRow sx={{ '& th': { fontWeight: 700, fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, bgcolor: '#f8fafc', borderBottom: '2px solid #e2e8f0' } }}>
                            {flatHeaders.map(h => <TableCell key={h} align={h === 'Actions' ? 'right' : 'left'}>{h}</TableCell>)}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {batches.map(b => (
                            <BatchRow key={b.id} batch={b} showProduct onBatchClick={onBatchClick} onTransfer={onTransfer} onSetTag={onSetTag} onPrintBarcode={onPrintBarcode} />
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        );
    }

    // Tree mode: Product → Variant → Batch (3 layers)
    // Pagination — show 20 products per page
    const PAGE_SIZE = 20;
    const [page, setPage] = useState(0);

    useEffect(() => {
        setPage(0); // reset to first page on data change
    }, [treeData]);

    if (!treeData || treeData.length === 0) return null;

    const totalPages = Math.ceil(treeData.length / PAGE_SIZE);
    const startIdx = page * PAGE_SIZE;
    const pageItems = treeData.slice(startIdx, startIdx + PAGE_SIZE);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {pageItems.map((product, i) => (
                <ProductGroup
                    key={product.product_id}
                    product={product}
                    defaultOpen={i === 0 && page === 0}
                    onBatchClick={onBatchClick}
                    onTransfer={onTransfer}
                    onSetTag={onSetTag}
                    onPrintBarcode={onPrintBarcode}
                />
            ))}

            {/* Pagination controls */}
            {totalPages > 1 && (
                <Box sx={{
                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5,
                    pt: 2, pb: 0.5, borderTop: '1px solid #f1f5f9',
                }}>
                    <IconButton
                        size="small" disabled={page === 0}
                        onClick={() => setPage(0)}
                        sx={{ color: '#4f46e5', '&:disabled': { color: '#cbd5e1' } }}
                    ><KeyboardArrowLeft sx={{ fontSize: 20 }} /><KeyboardArrowLeft sx={{ fontSize: 20, ml: -1.2 }} /></IconButton>
                    <IconButton
                        size="small" disabled={page === 0}
                        onClick={() => setPage(p => p - 1)}
                        sx={{ color: '#4f46e5', '&:disabled': { color: '#cbd5e1' } }}
                    ><KeyboardArrowLeft sx={{ fontSize: 20 }} /></IconButton>

                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', minWidth: 120, textAlign: 'center' }}>
                        {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, treeData.length)} of {treeData.length} products
                    </Typography>

                    <IconButton
                        size="small" disabled={page >= totalPages - 1}
                        onClick={() => setPage(p => p + 1)}
                        sx={{ color: '#4f46e5', '&:disabled': { color: '#cbd5e1' } }}
                    ><KeyboardArrowRight sx={{ fontSize: 20 }} /></IconButton>
                    <IconButton
                        size="small" disabled={page >= totalPages - 1}
                        onClick={() => setPage(totalPages - 1)}
                        sx={{ color: '#4f46e5', '&:disabled': { color: '#cbd5e1' } }}
                    ><KeyboardArrowRight sx={{ fontSize: 20 }} /><KeyboardArrowRight sx={{ fontSize: 20, ml: -1.2 }} /></IconButton>
                </Box>
            )}
        </Box>
    );
};
