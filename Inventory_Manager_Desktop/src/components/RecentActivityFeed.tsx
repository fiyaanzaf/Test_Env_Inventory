import React from 'react';
import {
    Paper, Typography, Box, List, ListItem, ListItemIcon, ListItemText,
    Skeleton, Chip
} from '@mui/material';
import {
    PointOfSale as SaleIcon,
    SyncAlt as TransferIcon,
    Inventory as ReceiveIcon,
    Delete as WriteOffIcon,
    History as HistoryIcon,
    AddShoppingCart as CreatePoIcon,
    DoneAll as PlacePoIcon,
    PostAdd as AddItemIcon,
    LocalShipping as ReceivePoIcon
} from '@mui/icons-material';
import type { ActivityItem } from '../services/analyticsService';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';

dayjs.extend(relativeTime);
dayjs.extend(utc);

interface RecentActivityFeedProps {
    activities: ActivityItem[];
    loading: boolean;
}

export const RecentActivityFeed: React.FC<RecentActivityFeedProps> = ({ activities, loading }) => {
    if (loading) {
        return (
            <Paper sx={{ p: 3, borderRadius: 3, boxShadow: 2 }}>
                <Skeleton variant="text" width={180} height={32} />
                <Box sx={{ mt: 2 }}>
                    {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} variant="rectangular" height={50} sx={{ mb: 1, borderRadius: 2 }} />
                    ))}
                </Box>
            </Paper>
        );
    }

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'sale':
                return <SaleIcon sx={{ color: '#6366f1' }} />;
            case 'transfer':
                return <TransferIcon sx={{ color: '#f59e0b' }} />;
            case 'receive':
            case 'bulk_receive':
                return <ReceiveIcon sx={{ color: '#10b981' }} />;
            case 'write_off':
                return <WriteOffIcon sx={{ color: '#ef4444' }} />;
            case 'po_create':
                return <CreatePoIcon sx={{ color: '#8b5cf6' }} />;
            case 'po_place':
                return <PlacePoIcon sx={{ color: '#0ea5e9' }} />;
            case 'po_add':
                return <AddItemIcon sx={{ color: '#ec4899' }} />;
            case 'po_receive':
                return <ReceivePoIcon sx={{ color: '#10b981' }} />;
            default:
                return <HistoryIcon sx={{ color: '#6b7280' }} />;
        }
    };

    const getActivityColor = (type: string) => {
        switch (type) {
            case 'sale':
                return { bg: '#eef2ff', text: '#4338ca' };
            case 'transfer':
                return { bg: '#fef3c7', text: '#92400e' };
            case 'receive':
            case 'bulk_receive':
                return { bg: '#d1fae5', text: '#065f46' };
            case 'write_off':
                return { bg: '#fee2e2', text: '#991b1b' };
            case 'po_create':
                return { bg: '#f3e8ff', text: '#6b21a8' };
            case 'po_place':
                return { bg: '#e0f2fe', text: '#0369a1' };
            case 'po_add':
                return { bg: '#fce7f3', text: '#be185d' };
            case 'po_receive':
                return { bg: '#dcfce7', text: '#15803d' };
            default:
                return { bg: '#f3f4f6', text: '#374151' };
        }
    };

    const formatType = (type: string): string => {
        switch (type) {
            case 'sale': return 'Sale';
            case 'transfer': return 'Transfer';
            case 'receive': return 'Receive';
            case 'bulk_receive': return 'Bulk Receive';
            case 'write_off': return 'Write-off';
            case 'po_create': return 'Draft Created';
            case 'po_place': return 'Order Placed';
            case 'po_add': return 'Products Added';
            case 'po_receive': return 'Order Received';
            default: return type;
        }
    };

    return (
        <Paper
            sx={{
                p: 3,
                borderRadius: 3,
                boxShadow: 2,
                background: 'linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%)'
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <HistoryIcon sx={{ color: '#6366f1' }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Recent Activity
                </Typography>
            </Box>

            {activities.length === 0 ? (
                <Box
                    sx={{
                        py: 4,
                        textAlign: 'center',
                        bgcolor: '#f8fafc',
                        borderRadius: 2,
                        border: '1px solid #e2e8f0'
                    }}
                >
                    <HistoryIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                        No recent activity
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Your actions will appear here
                    </Typography>
                </Box>
            ) : (
                <List sx={{ p: 0 }}>
                    {activities.map((activity) => {
                        const color = getActivityColor(activity.type);
                        return (
                            <ListItem
                                key={activity.id}
                                sx={{
                                    bgcolor: color.bg,
                                    borderRadius: 2,
                                    mb: 1,
                                    py: 1,
                                    px: 2
                                }}
                            >
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                    {getActivityIcon(activity.type)}
                                </ListItemIcon>
                                <ListItemText
                                    primary={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="body2" fontWeight={500} sx={{ color: color.text }}>
                                                {activity.description}
                                            </Typography>
                                            {activity.quantity && (
                                                <Chip
                                                    label={`${activity.quantity} units`}
                                                    size="small"
                                                    sx={{
                                                        height: 18,
                                                        fontSize: '0.65rem',
                                                        bgcolor: 'rgba(0,0,0,0.08)'
                                                    }}
                                                />
                                            )}
                                        </Box>
                                    }
                                    secondary={
                                        <Typography variant="caption" color="text.secondary">
                                            {activity.username ? <span style={{ fontWeight: 600, marginRight: 4 }}>{activity.username}</span> : null}
                                            {dayjs.utc(activity.timestamp).fromNow()} • {formatType(activity.type)}
                                        </Typography>
                                    }
                                />
                            </ListItem>
                        );
                    })}
                </List>
            )}
        </Paper>
    );
};
