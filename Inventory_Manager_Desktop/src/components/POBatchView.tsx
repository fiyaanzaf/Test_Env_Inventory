import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Chip, Collapse, IconButton, Tooltip,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import {
    KeyboardArrowDown,
    KeyboardArrowRight,
    LocalShipping as ShipmentIcon,
    Print as PrintIcon,
    SwapHoriz as TransferIcon,
    LocalOffer as TagIcon,
    WarningAmber as ExpireIcon,
    Storefront as SupplierIcon,
} from '@mui/icons-material';
import { type POBatchGroup, type BatchTracking } from '../services/batchService';

interface POBatchViewProps {
    poGroups: POBatchGroup[];
    onBatchClick?: (batch: BatchTracking) => void;
    onTransfer?: (batch: BatchTracking) => void;
    onSetTag?: (batchId: number, tag: string) => void;
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
    return { text: `${days}d — ${dateStr}`, color: '#16a34a', urgent: false };
};

const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const tagInfo: Record<string, { label: string; bg: string; color: string }> = {
    clearance: { label: 'Clearance', bg: '#fef2f2', color: '#dc2626' },
    promotional: { label: 'Promotional', bg: '#f0fdf4', color: '#16a34a' },
    priority: { label: 'Priority', bg: '#fffbeb', color: '#d97706' },
    normal: { label: 'Normal', bg: '#f8fafc', color: '#94a3b8' },
};

/* ── PO Card ──────────────────────────── */

const POCard: React.FC<{
    group: POBatchGroup;
    defaultOpen?: boolean;
    onBatchClick?: (batch: BatchTracking) => void;
    onTransfer?: (batch: BatchTracking) => void;
    onSetTag?: (batchId: number, tag: string) => void;
    onPrintBarcode?: (batch: BatchTracking) => void;
}> = ({ group, defaultOpen, onBatchClick, onTransfer, onSetTag, onPrintBarcode }) => {
    const [open, setOpen] = useState(defaultOpen ?? false);

    const nearExpiry = group.batches.filter(b => {
        if (!b.expiry_date) return false;
        return Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / 86400000) <= 30;
    }).length;

    const isUntracked = !group.po_id;

    return (
        <Box sx={{
            border: '1px solid', borderColor: open ? '#c7d2fe' : '#e2e8f0',
            borderRadius: 2.5, overflow: 'hidden', transition: 'all 0.2s',
            '&:hover': { borderColor: '#a5b4fc' },
        }}>
            {/* PO Header */}
            <Box
                onClick={() => setOpen(!open)}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, py: 1.3, px: 2,
                    cursor: 'pointer', transition: 'all 0.15s',
                    bgcolor: open ? '#f8fafc' : 'white',
                    '&:hover': { bgcolor: '#f1f5f9' },
                }}
            >
                {open ? <KeyboardArrowDown sx={{ color: '#6366f1' }} /> : <KeyboardArrowRight sx={{ color: '#94a3b8' }} />}

                {isUntracked ? (
                    <ExpireIcon sx={{ color: '#d97706', fontSize: 22 }} />
                ) : (
                    <ShipmentIcon sx={{ color: '#6366f1', fontSize: 22 }} />
                )}

                <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: '0.95rem' }}>
                            {group.po_number}
                        </Typography>
                        {!isUntracked && (
                            <Chip
                                label={group.status}
                                size="small"
                                sx={{
                                    fontSize: '0.65rem', height: 18, fontWeight: 600, textTransform: 'capitalize',
                                    bgcolor: group.status === 'received' ? '#f0fdf4' : '#fef3c7',
                                    color: group.status === 'received' ? '#16a34a' : '#d97706',
                                }}
                            />
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.2 }}>
                        <SupplierIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                            {group.supplier_name}
                        </Typography>
                        {group.received_date && (
                            <Typography variant="caption" color="text.disabled" sx={{ ml: 1, fontSize: '0.72rem' }}>
                                {formatDate(group.received_date)}
                            </Typography>
                        )}
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    {nearExpiry > 0 && (
                        <Chip label={`${nearExpiry} expiring`} size="small"
                            sx={{ fontWeight: 600, bgcolor: '#fef2f2', color: '#dc2626', fontSize: '0.72rem', height: 22 }} />
                    )}
                    <Chip label={`${group.total_products} product${group.total_products !== 1 ? 's' : ''}`} size="small"
                        sx={{ fontWeight: 600, bgcolor: '#f5f3ff', color: '#7c3aed', fontSize: '0.72rem', height: 22 }} />
                    <Chip label={`${group.total_quantity} units`} size="small"
                        sx={{ fontWeight: 700, bgcolor: '#eef2ff', color: '#4f46e5', fontSize: '0.75rem', height: 24 }} />
                    {group.total_value > 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.78rem', fontWeight: 600 }}>
                            ₹{group.total_value.toLocaleString('en-IN')}
                        </Typography>
                    )}
                </Box>
            </Box>

            {/* Batch table */}
            <Collapse in={open} timeout="auto">
                <Box sx={{ borderTop: '1px solid #e2e8f0', px: 2, pb: 1.5, pt: 0.5 }}>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ '& th': { fontWeight: 600, fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, py: 0.5, borderBottom: '1px solid #e2e8f0' } }}>
                                    <TableCell>Product</TableCell>
                                    <TableCell>Variant</TableCell>
                                    <TableCell>Batch Code</TableCell>
                                    <TableCell>Stock</TableCell>
                                    <TableCell>Expiry</TableCell>
                                    <TableCell>Tag</TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {group.batches.map(batch => {
                                    const exp = formatExpiry(batch.expiry_date);
                                    const tag = tagInfo[batch.batch_tag] || tagInfo.normal;
                                    return (
                                        <TableRow
                                            key={batch.id}
                                            hover
                                            onClick={() => onBatchClick?.(batch)}
                                            sx={{
                                                cursor: onBatchClick ? 'pointer' : 'default',
                                                '&:hover': { bgcolor: '#f8fafc' },
                                                bgcolor: exp.urgent ? 'rgba(254,242,242,0.25)' : 'transparent',
                                            }}
                                        >
                                            <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                                {batch.product_name || '—'}
                                            </TableCell>
                                            <TableCell>
                                                {batch.variant_name ? (
                                                    <Chip label={batch.variant_name} size="small"
                                                        sx={{ fontSize: '0.65rem', height: 18, bgcolor: '#f5f3ff', color: '#7c3aed', fontWeight: 600 }} />
                                                ) : (
                                                    <Typography variant="caption" color="text.disabled">—</Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#4f46e5', fontWeight: 600 }}>
                                                    {batch.batch_code}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: batch.stock_quantity > 0 ? '#166534' : '#dc2626' }}>
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
                                                    {onPrintBarcode && (
                                                        <Tooltip title="Print QR"><IconButton size="small" onClick={() => onPrintBarcode(batch)}>
                                                            <PrintIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                                                    )}
                                                    {onTransfer && (
                                                        <Tooltip title="Transfer"><IconButton size="small" onClick={() => onTransfer(batch)}>
                                                            <TransferIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                                                    )}
                                                    {onSetTag && (
                                                        <Tooltip title="Set Tag"><IconButton size="small" onClick={() => onSetTag(batch.id, batch.batch_tag === 'normal' ? 'priority' : 'normal')}>
                                                            <TagIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                                                    )}
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            </Collapse>

        </Box>
    );
};

/* ── Main Export ──────────────────────── */

export const POBatchView: React.FC<POBatchViewProps> = ({ poGroups, onBatchClick, onTransfer, onSetTag, onPrintBarcode }) => {
    const CHUNK = 6;
    const [visibleCount, setVisibleCount] = useState(CHUNK);

    useEffect(() => {
        setVisibleCount(CHUNK);
    }, [poGroups]);

    useEffect(() => {
        if (!poGroups || visibleCount >= poGroups.length) return;
        const schedule = (window as any).requestIdleCallback || ((cb: () => void) => setTimeout(cb, 30));
        const cancel = (window as any).cancelIdleCallback || clearTimeout;
        const id = schedule(() => {
            setVisibleCount(prev => Math.min(prev + CHUNK, poGroups.length));
        });
        return () => cancel(id);
    }, [visibleCount, poGroups]);

    if (!poGroups || poGroups.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', py: 8 }}>
                <ShipmentIcon sx={{ fontSize: 64, color: '#cbd5e1', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" fontWeight={600}>No supplier batches found</Typography>
                <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
                    Batches are created when purchase orders are received.
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {poGroups.slice(0, visibleCount).map((group, i) => (
                <POCard
                    key={group.po_id ?? 'untracked'}
                    group={group}
                    defaultOpen={i === 0}
                    onBatchClick={onBatchClick}
                    onTransfer={onTransfer}
                    onSetTag={onSetTag}
                    onPrintBarcode={onPrintBarcode}
                />
            ))}
            {visibleCount < poGroups.length && (
                <Box sx={{ textAlign: 'center', py: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                        Rendering {visibleCount}/{poGroups.length} groups...
                    </Typography>
                </Box>
            )}
        </Box>
    );
};
