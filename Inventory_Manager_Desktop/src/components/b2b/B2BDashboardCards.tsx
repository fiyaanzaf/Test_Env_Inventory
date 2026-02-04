import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, Chip, Skeleton,
  Avatar, List, ListItem, ListItemAvatar, ListItemText, Divider
} from '@mui/material';
import {
  AccountBalance as CollectIcon,
  Warning as WarningIcon,
  People as PeopleIcon,
  TrendingUp as TrendingIcon
} from '@mui/icons-material';
import { b2bService } from '../../services/b2bService';
import type { B2BDashboard, B2BClient } from '../../services/b2bService';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, subtitle }) => (
  <Card sx={{ height: '100%', borderLeft: `4px solid ${color}` }}>
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {title}
          </Typography>
          <Typography variant="h4" fontWeight="bold" color={color}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <Avatar sx={{ bgcolor: `${color}20`, color: color }}>
          {icon}
        </Avatar>
      </Box>
    </CardContent>
  </Card>
);

const getBalanceColor = (status: string): string => {
  switch (status) {
    case 'clear': return '#22c55e';
    case 'normal': return '#f59e0b';
    case 'warning': return '#f97316';
    case 'over_limit': return '#ef4444';
    default: return '#6b7280';
  }
};

interface B2BDashboardCardsProps {
  onClientClick?: (client: B2BClient) => void;
}

export const B2BDashboardCards: React.FC<B2BDashboardCardsProps> = ({ onClientClick }) => {
  const [dashboard, setDashboard] = useState<B2BDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const data = await b2bService.getDashboard();
      setDashboard(data);
    } catch (error) {
      console.error('Failed to load B2B dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Grid container spacing={3}>
        {[1, 2, 3, 4].map((i) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
            <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
          </Grid>
        ))}
      </Grid>
    );
  }

  if (!dashboard) {
    return <Typography color="error">Failed to load dashboard</Typography>;
  }

  return (
    <Box>
      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="To Collect"
            value={`₹${dashboard.total_to_collect.toLocaleString()}`}
            icon={<CollectIcon />}
            color="#3b82f6"
            subtitle="Total outstanding"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Over Credit Limit"
            value={dashboard.clients_over_limit}
            icon={<WarningIcon />}
            color="#ef4444"
            subtitle="Clients need attention"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Active Clients"
            value={dashboard.active_clients}
            icon={<PeopleIcon />}
            color="#22c55e"
            subtitle="B2B customers"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Net Outstanding"
            value={`₹${dashboard.net_outstanding.toLocaleString()}`}
            icon={<TrendingIcon />}
            color="#8b5cf6"
            subtitle="Including advances"
          />
        </Grid>
      </Grid>

      {/* Top Debtors */}
      {dashboard.top_debtors.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <WarningIcon color="warning" />
              Top Debtors
            </Typography>
            <List dense>
              {dashboard.top_debtors.map((client, index) => (
                <React.Fragment key={client.id}>
                  {index > 0 && <Divider />}
                  <ListItem
                    sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                    onClick={() => onClientClick?.(client)}
                  >
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: getBalanceColor(client.balance_status) }}>
                        {client.name.charAt(0).toUpperCase()}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={client.name}
                      secondary={client.contact_person || client.phone}
                    />
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="subtitle1" fontWeight="bold" color="error">
                        ₹{client.current_balance.toLocaleString()}
                      </Typography>
                      <Chip
                        size="small"
                        label={client.balance_status.replace('_', ' ')}
                        sx={{
                          bgcolor: `${getBalanceColor(client.balance_status)}20`,
                          color: getBalanceColor(client.balance_status),
                          fontWeight: 500,
                          textTransform: 'capitalize'
                        }}
                      />
                    </Box>
                  </ListItem>
                </React.Fragment>
              ))}
            </List>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default B2BDashboardCards;
