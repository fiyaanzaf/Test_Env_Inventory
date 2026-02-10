import React, { useEffect, useState } from 'react';
import {
  Box, Typography, CircularProgress, Card, CardContent,
  Button, Chip, IconButton, Divider, List, ListItem,
  ListItemIcon, ListItemText, Skeleton
} from '@mui/material';
import {
  ShoppingCart,
  SyncAlt as TransferIcon,
  NotificationsActive as AlertIcon,
  Refresh as RefreshIcon,
  AttachMoney,
  Inventory as InventoryIcon,
  SwapHoriz,
  CallReceived,
  Receipt,
  Delete as DeleteIcon, WarningAmber
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

import { useAuthStore } from '../store/authStore';
import { getShiftSummary, getMyActivity } from '../services/employeeService';
import type { ShiftSummary, ActivityItem } from '../services/employeeService';
import { getOperationalAlerts } from '../services/systemService';

interface OperationalAlert {
  id: number;
  severity: string;
  message: string;
  status: string;
  created_at: string;
}

export const EmployeeDashboardHome: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [shiftSummary, setShiftSummary] = useState<ShiftSummary | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [summaryData, activityData, alertsData] = await Promise.all([
        getShiftSummary(),
        getMyActivity(10),
        getOperationalAlerts()
      ]);

      setShiftSummary(summaryData);
      setActivities(activityData);
      setAlerts(alertsData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to load employee dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => fetchData(true);

  // Filter out "Added to Order" alerts
  const actionableAlerts = alerts.filter(a => {
    const isActive = a.status === 'active' || !a.status;
    const isAddedToOrder = a.message.includes('ADDED TO ORDER');
    return isActive && !isAddedToOrder;
  });

  const activeAlertCount = actionableAlerts.length;

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'sale': return <ShoppingCart sx={{ color: '#6366f1', fontSize: 20 }} />;
      case 'transfer': return <SwapHoriz sx={{ color: '#f59e0b', fontSize: 20 }} />;
      case 'receive': case 'bulk_receive': return <CallReceived sx={{ color: '#10b981', fontSize: 20 }} />;
      case 'write_off': return <DeleteIcon sx={{ color: '#ef4444', fontSize: 20 }} />;
      default: return <Receipt sx={{ color: '#64748b', fontSize: 20 }} />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'error';
      case 'warning': return 'warning';
      default: return 'info';
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Skeleton variant="rounded" height={60} />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} variant="rounded" height={100} />)}
        </Box>
        <Skeleton variant="rounded" height={200} />
        <Skeleton variant="rounded" height={200} />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 10, px: 2, pt: 2, maxWidth: 800, mx: 'auto', width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          Welcome, {user?.username}! 👋
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            {dayjs().format('ddd, MMM D, YYYY')}
          </Typography>
          {lastUpdated && (
            <>
              <Divider orientation="vertical" flexItem />
              <Typography variant="caption" color="text.disabled">
                {lastUpdated.toLocaleTimeString()}
              </Typography>
            </>
          )}
          <IconButton
            size="small"
            onClick={handleRefresh}
            disabled={refreshing}
            sx={{ ml: 'auto' }}
          >
            <RefreshIcon sx={{ fontSize: 20, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </IconButton>
        </Box>
        {activeAlertCount > 0 && (
          <Chip
            icon={<AlertIcon sx={{ fontSize: 16 }} />}
            label={`${activeAlertCount} Pending Tasks`}
            color="warning"
            size="small"
            sx={{ fontWeight: 600, mt: 1 }}
            onClick={() => navigate('/stock-alerts')}
          />
        )}
      </Box>

      {/* Shift Summary Cards - 2x2 grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
        {/* Sales Count */}
        <Card sx={{
          borderRadius: 3, overflow: 'hidden',
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          color: 'white', minHeight: 100
        }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <ShoppingCart sx={{ fontSize: 20, opacity: 0.9 }} />
              <Typography variant="caption" sx={{ opacity: 0.9 }}>Sales Today</Typography>
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {shiftSummary?.sales_count ?? 0}
            </Typography>
          </CardContent>
        </Card>

        {/* Revenue */}
        <Card sx={{
          borderRadius: 3, overflow: 'hidden',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: 'white', minHeight: 100
        }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <AttachMoney sx={{ fontSize: 20, opacity: 0.9 }} />
              <Typography variant="caption" sx={{ opacity: 0.9 }}>Revenue</Typography>
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              ₹{(shiftSummary?.revenue_today ?? 0).toLocaleString()}
            </Typography>
          </CardContent>
        </Card>

        {/* Products Processed */}
        <Card sx={{
          borderRadius: 3, overflow: 'hidden',
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: 'white', minHeight: 100
        }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <InventoryIcon sx={{ fontSize: 20, opacity: 0.9 }} />
              <Typography variant="caption" sx={{ opacity: 0.9 }}>Processed</Typography>
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {shiftSummary?.products_processed ?? 0}
            </Typography>
          </CardContent>
        </Card>

        {/* Transfers */}
        <Card sx={{
          borderRadius: 3, overflow: 'hidden',
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          color: 'white', minHeight: 100
        }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TransferIcon sx={{ fontSize: 20, opacity: 0.9 }} />
              <Typography variant="caption" sx={{ opacity: 0.9 }}>Transfers</Typography>
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {shiftSummary?.transfers_done ?? 0}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Quick Actions */}
      <Card sx={{ borderRadius: 3, mb: 2, boxShadow: 2 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            ⚡ Quick Actions
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <Button
              variant="contained"
              startIcon={<ShoppingCart />}
              fullWidth
              onClick={() => navigate('/sales')}
              sx={{
                py: 1.5, minHeight: 48, borderRadius: 2,
                textTransform: 'none', fontWeight: 600, fontSize: '0.85rem',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                '&:hover': { background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }
              }}
            >
              Start Sale
            </Button>
            <Button
              variant="outlined"
              startIcon={<TransferIcon />}
              fullWidth
              onClick={() => navigate('/inventory')}
              color="warning"
              sx={{
                py: 1.5, minHeight: 48, borderRadius: 2,
                textTransform: 'none', fontWeight: 600, fontSize: '0.85rem'
              }}
            >
              Transfer
            </Button>
            <Button
              variant="outlined"
              startIcon={<InventoryIcon />}
              fullWidth
              onClick={() => navigate('/inventory')}
              sx={{
                py: 1.5, minHeight: 48, borderRadius: 2,
                textTransform: 'none', fontWeight: 600, fontSize: '0.85rem'
              }}
            >
              Inventory
            </Button>
            <Button
              variant="outlined"
              startIcon={<AlertIcon />}
              fullWidth
              onClick={() => navigate('/stock-alerts')}
              color="info"
              sx={{
                py: 1.5, minHeight: 48, borderRadius: 2,
                textTransform: 'none', fontWeight: 600, fontSize: '0.85rem'
              }}
            >
              Alerts
              {activeAlertCount > 0 && (
                <Chip label={activeAlertCount} size="small" color="error"
                  sx={{ ml: 1, height: 20, minWidth: 20, fontSize: '0.65rem' }} />
              )}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Pending Alerts */}
      {actionableAlerts.length > 0 && (
        <Card sx={{ borderRadius: 3, mb: 2, boxShadow: 2 }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <WarningAmber sx={{ color: '#f59e0b', fontSize: 24 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
                Pending Alerts
              </Typography>
              <Chip label={actionableAlerts.length} size="small" color="warning" sx={{ fontWeight: 700 }} />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {actionableAlerts.slice(0, 5).map((alert) => (
                <Card
                  key={alert.id}
                  variant="outlined"
                  sx={{
                    borderRadius: 2,
                    borderColor: alert.severity === 'critical' ? '#fca5a5' : '#fde68a',
                    bgcolor: alert.severity === 'critical' ? '#fef2f2' : '#fffbeb'
                  }}
                >
                  <CardContent sx={{
                    p: 1.5, '&:last-child': { pb: 1.5 },
                    display: 'flex', flexDirection: 'column', gap: 1
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <Chip
                        label={alert.severity}
                        size="small"
                        color={getSeverityColor(alert.severity) as any}
                        sx={{ fontWeight: 600, textTransform: 'capitalize', height: 22, fontSize: '0.65rem' }}
                      />
                      <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                        {dayjs(alert.created_at).format('MMM D, h:mm A')}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.4 }}>
                      {alert.message}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        startIcon={<TransferIcon sx={{ fontSize: 14 }} />}
                        onClick={() => navigate('/inventory')}
                        sx={{
                          minHeight: 36, borderRadius: 2,
                          textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', flex: 1
                        }}
                      >
                        Transfer
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        startIcon={<ShoppingCart sx={{ fontSize: 14 }} />}
                        onClick={() => navigate('/inventory')}
                        sx={{
                          minHeight: 36, borderRadius: 2,
                          textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', flex: 1
                        }}
                      >
                        Restock
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              ))}
              {actionableAlerts.length > 5 && (
                <Button
                  fullWidth
                  size="small"
                  onClick={() => navigate('/stock-alerts')}
                  sx={{ textTransform: 'none', fontWeight: 600, minHeight: 40 }}
                >
                  View All {actionableAlerts.length} Alerts
                </Button>
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* My Recent Activity */}
      <Card sx={{ borderRadius: 3, mb: 2, boxShadow: 2 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            My Recent Activity
          </Typography>

          {activities.length > 0 ? (
            <List disablePadding dense>
              {activities.map((activity, idx) => (
                <React.Fragment key={activity.id}>
                  <ListItem disablePadding sx={{ py: 1, alignItems: 'flex-start' }}>
                    <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                      {getActivityIcon(activity.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
                          {activity.description}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" color="text.disabled">
                          {dayjs(activity.timestamp).format('MMM D, h:mm A')}
                        </Typography>
                      }
                    />
                  </ListItem>
                  {idx < activities.length - 1 && <Divider component="li" />}
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Box sx={{ py: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No recent activity
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Spin animation keyframe */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Box>
  );
};
