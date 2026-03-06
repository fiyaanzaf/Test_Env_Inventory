import React from 'react';
import {
    Drawer, Box, Typography, Chip, IconButton, Divider, Button, Stack
} from '@mui/material';
import {
    Close as CloseIcon,
    Print as PrintIcon,
    SwapHoriz as TransferIcon,
    LocalOffer as TagIcon,
    CalendarToday as CalendarIcon,
    Store as SupplierIcon,
    Inventory as StockIcon,
    QrCode as BarcodeIcon,
} from '@mui/icons-material';
import { type BatchTracking, getBatchBarcodeUrl } from '../services/batchService';

interface Props {
    open: boolean;
    onClose: () => void;
    batch: BatchTracking | null;
    onTransfer?: (batch: BatchTracking) => void;
    onSetTag?: (batchId: number, tag: string) => void;
}

const tagColors: Record<string, { bg: string; color: string; label: string }> = {
    clearance: { bg: '#fef2f2', color: '#dc2626', label: '🔴 Clearance' },
    promotional: { bg: '#f0fdf4', color: '#16a34a', label: '🟢 Promotional' },
    priority: { bg: '#fffbeb', color: '#d97706', label: '🟡 Priority' },
    normal: { bg: '#f1f5f9', color: '#64748b', label: 'Normal' },
};

const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getDaysUntilExpiry = (d: string | null) => {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

export const BatchDetailDrawer: React.FC<Props> = ({ open, onClose, batch, onTransfer, onSetTag }) => {
    if (!batch) return null;

    const daysLeft = getDaysUntilExpiry(batch.expiry_date);
    const tag = tagColors[batch.batch_tag] || tagColors.normal;

    const handlePrint = () => {
        const url = getBatchBarcodeUrl(batch.id);
        const token = localStorage.getItem('user_token');
        window.open(`${url}?token=${token}`, '_blank');
    };

    const InfoRow = ({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.2, px: 0 }}>
            {icon && <Box sx={{ color: '#94a3b8', display: 'flex' }}>{icon}</Box>}
            <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {label}
                </Typography>
                <Typography variant="body2" fontWeight={500}>{value}</Typography>
            </Box>
        </Box>
    );

    return (
        <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 400, borderRadius: '16px 0 0 16px' } }}>
            {/* Header */}
            <Box sx={{
                p: 3, background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                color: 'white', position: 'relative'
            }}>
                <IconButton onClick={onClose} sx={{ position: 'absolute', top: 12, right: 12, color: 'white' }}>
                    <CloseIcon />
                </IconButton>
                <Typography variant="overline" sx={{ opacity: 0.8, letterSpacing: 1 }}>Batch Details</Typography>
                <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5, fontFamily: 'monospace' }}>
                    {batch.batch_code}
                </Typography>
                {batch.product_name && (
                    <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.9 }}>{batch.product_name}</Typography>
                )}
                {batch.variant_name && (
                    <Chip label={batch.variant_name} size="small" sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontSize: '0.75rem' }} />
                )}
            </Box>

            {/* Stock & Tag Section */}
            <Box sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                    <Box sx={{
                        flex: 1, p: 2, borderRadius: 2, textAlign: 'center',
                        bgcolor: batch.stock_quantity > 0 ? '#f0fdf4' : '#fef2f2',
                        border: '1px solid', borderColor: batch.stock_quantity > 0 ? '#bbf7d0' : '#fecaca'
                    }}>
                        <Typography variant="h4" fontWeight={800} color={batch.stock_quantity > 0 ? '#166534' : '#dc2626'}>
                            {batch.stock_quantity}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">Units in Stock</Typography>
                    </Box>
                    <Box sx={{
                        flex: 1, p: 2, borderRadius: 2, textAlign: 'center',
                        bgcolor: tag.bg, border: '1px solid', borderColor: tag.color + '33'
                    }}>
                        <Typography variant="h6" fontWeight={700} color={tag.color}>
                            {tag.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">Batch Tag</Typography>
                    </Box>
                </Box>

                {/* Expiry Health */}
                {daysLeft !== null && (
                    <Box sx={{
                        p: 2, borderRadius: 2, mb: 3, textAlign: 'center',
                        bgcolor: daysLeft < 0 ? '#1e293b' : daysLeft <= 15 ? '#fef2f2' : daysLeft <= 30 ? '#fffbeb' : '#f0fdf4',
                        color: daysLeft < 0 ? 'white' : daysLeft <= 15 ? '#dc2626' : daysLeft <= 30 ? '#92400e' : '#166534',
                    }}>
                        <Typography variant="h5" fontWeight={800}>
                            {daysLeft < 0 ? `Expired ${Math.abs(daysLeft)} days ago` : `${daysLeft} days until expiry`}
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>
                            Expires: {formatDate(batch.expiry_date)}
                        </Typography>
                    </Box>
                )}

                <Divider sx={{ my: 1 }} />

                {/* Details */}
                <InfoRow icon={<SupplierIcon fontSize="small" />} label="Supplier" value={batch.supplier_name || '—'} />
                <InfoRow icon={<CalendarIcon fontSize="small" />} label="Manufacturing Date" value={formatDate(batch.manufacturing_date)} />
                <InfoRow icon={<CalendarIcon fontSize="small" />} label="Expiry Date" value={formatDate(batch.expiry_date)} />
                <InfoRow icon={<StockIcon fontSize="small" />} label="Procurement Price" value={batch.procurement_price != null ? `₹${batch.procurement_price}` : '—'} />
                <InfoRow icon={<StockIcon fontSize="small" />} label="State of Origin" value={batch.state_of_origin || '—'} />
                <InfoRow icon={<BarcodeIcon fontSize="small" />} label="PO Reference" value={batch.po_id ? `PO #${batch.po_id}` : '—'} />
                <InfoRow icon={<CalendarIcon fontSize="small" />} label="Created" value={formatDate(batch.created_at)} />

                {batch.tag_reason && (
                    <>
                        <Divider sx={{ my: 1 }} />
                        <InfoRow icon={<TagIcon fontSize="small" />} label="Tag Reason" value={batch.tag_reason} />
                        {batch.tag_set_by && <InfoRow label="Tagged By" value={batch.tag_set_by} />}
                    </>
                )}

                <Divider sx={{ my: 2 }} />

                {/* Actions */}
                <Stack spacing={1.5}>
                    <Button fullWidth variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint}
                        sx={{ borderColor: '#e2e8f0', color: '#475569', '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' } }}>
                        Print Barcode Label
                    </Button>
                    {onTransfer && (
                        <Button fullWidth variant="outlined" startIcon={<TransferIcon />} onClick={() => onTransfer(batch)}
                            sx={{ borderColor: '#fde68a', color: '#92400e', bgcolor: '#fffbeb', '&:hover': { bgcolor: '#fef3c7' } }}>
                            Transfer Stock
                        </Button>
                    )}
                    {onSetTag && (
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            {(['clearance', 'promotional', 'priority', 'normal'] as const).map(t => (
                                <Button key={t} size="small" variant={batch.batch_tag === t ? 'contained' : 'outlined'}
                                    onClick={() => onSetTag(batch.id, t)}
                                    sx={{
                                        flex: 1, fontSize: '0.7rem', textTransform: 'capitalize', py: 0.8,
                                        bgcolor: batch.batch_tag === t ? tagColors[t].color : 'transparent',
                                        borderColor: tagColors[t].color + '55',
                                        color: batch.batch_tag === t ? 'white' : tagColors[t].color,
                                        '&:hover': { bgcolor: tagColors[t].bg },
                                    }}>
                                    {t}
                                </Button>
                            ))}
                        </Box>
                    )}
                </Stack>
            </Box>
        </Drawer>
    );
};
