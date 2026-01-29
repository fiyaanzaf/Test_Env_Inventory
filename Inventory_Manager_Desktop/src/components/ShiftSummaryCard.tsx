import React from 'react';
import { Box, Paper, Typography, Chip, Skeleton, Tooltip, IconButton } from '@mui/material';
import {
    PointOfSale as SalesIcon,
    Inventory as ProductsIcon,
    SyncAlt as TransferIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material';
import type { ShiftSummary } from '../services/employeeService';

interface ShiftSummaryCardProps {
    data: ShiftSummary | null;
    loading: boolean;
    onRefresh?: () => void;
}

export const ShiftSummaryCard: React.FC<ShiftSummaryCardProps> = ({ data, loading, onRefresh }) => {
    if (loading) {
        return (
            <Paper sx={{ p: 3, borderRadius: 3, boxShadow: 2 }}>
                <Skeleton variant="text" width={150} height={32} />
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mt: 2 }}>
                    <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
                    <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
                    <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
                </Box>
            </Paper>
        );
    }

    const stats = [
        {
            label: 'Sales Today',
            value: data?.sales_count || 0,
            subtext: `₹${(data?.revenue_today || 0).toLocaleString()} revenue`,
            icon: <SalesIcon />,
            color: '#6366f1',
            bgGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        },
        {
            label: 'Products Processed',
            value: data?.products_processed || 0,
            subtext: 'Items sold today',
            icon: <ProductsIcon />,
            color: '#10b981',
            bgGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
        },
        {
            label: 'Transfers Done',
            value: data?.transfers_done || 0,
            subtext: 'Stock movements',
            icon: <TransferIcon />,
            color: '#f59e0b',
            bgGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
        }
    ];

    return (
        <Paper
            sx={{
                p: 3,
                borderRadius: 3,
                boxShadow: 2,
                background: 'linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%)'
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        📊 My Shift Summary
                    </Typography>
                    <Chip
                        label="Today"
                        size="small"
                        sx={{
                            bgcolor: '#dbeafe',
                            color: '#1d4ed8',
                            fontWeight: 600,
                            fontSize: '0.7rem'
                        }}
                    />
                </Box>
                {onRefresh && (
                    <Tooltip title="Refresh">
                        <IconButton size="small" onClick={onRefresh}>
                            <RefreshIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
                {stats.map((stat, index) => (
                    <Box
                        key={index}
                        sx={{
                            p: 2.5,
                            borderRadius: 2,
                            background: stat.bgGradient,
                            color: 'white',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                    >
                        <Box sx={{ position: 'relative', zIndex: 1 }}>
                            <Typography variant="body2" sx={{ opacity: 0.9, mb: 0.5 }}>
                                {stat.label}
                            </Typography>
                            <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
                                {stat.value}
                            </Typography>
                            <Typography variant="caption" sx={{ opacity: 0.8 }}>
                                {stat.subtext}
                            </Typography>
                        </Box>
                        <Box
                            sx={{
                                position: 'absolute',
                                right: 10,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                opacity: 0.2,
                                fontSize: 64
                            }}
                        >
                            {React.cloneElement(stat.icon, { sx: { fontSize: 64 } })}
                        </Box>
                    </Box>
                ))}
            </Box>
        </Paper>
    );
};
