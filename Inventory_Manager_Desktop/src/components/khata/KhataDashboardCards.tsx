import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Skeleton,
  Avatar
} from '@mui/material';
import {
  AccountBalance as CreditIcon,
  People as PeopleIcon,
  Warning as WarningIcon,
  Block as BlockIcon
} from '@mui/icons-material';
import { getKhataDashboard, type KhataDashboard } from '../../services/khataService';

const KhataDashboardCards: React.FC = () => {
  const [dashboard, setDashboard] = useState<KhataDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const data = await getKhataDashboard();
      setDashboard(data);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const cards = [
    {
      title: 'Total Outstanding',
      value: dashboard ? `₹${dashboard.total_credit_outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0',
      icon: <CreditIcon />,
      color: '#1976d2',
      bgColor: 'rgba(25, 118, 210, 0.1)'
    },
    {
      title: 'Customers with Balance',
      value: dashboard?.customers_with_balance || 0,
      icon: <PeopleIcon />,
      color: '#2e7d32',
      bgColor: 'rgba(46, 125, 50, 0.1)'
    },
    {
      title: 'Near Limit (80%+)',
      value: dashboard?.customers_near_limit || 0,
      icon: <WarningIcon />,
      color: '#ed6c02',
      bgColor: 'rgba(237, 108, 2, 0.1)'
    },
    {
      title: 'Over Limit / Blocked',
      value: dashboard?.customers_over_limit || 0,
      icon: <BlockIcon />,
      color: '#d32f2f',
      bgColor: 'rgba(211, 47, 47, 0.1)'
    }
  ];

  if (loading) {
    return (
      <Grid container spacing={2}>
        {[1, 2, 3, 4].map((i) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
            <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 2 }} />
          </Grid>
        ))}
      </Grid>
    );
  }

  return (
    <Grid container spacing={2}>
      {cards.map((card, index) => (
        <Grid size={{ xs: 12, sm: 6, md: 3 }} key={index}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {card.title}
                  </Typography>
                  <Typography variant="h5" fontWeight="bold" sx={{ color: card.color }}>
                    {card.value}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: card.bgColor, color: card.color }}>
                  {card.icon}
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

export default KhataDashboardCards;
