import React, { useState, useEffect } from 'react';
import {
  Box, AppBar, Toolbar, Typography, Avatar, Chip,
  BottomNavigation, BottomNavigationAction, Badge,
  Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Divider, IconButton, SwipeableDrawer
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Inventory as CatalogIcon,
  Warehouse as InventoryIcon,
  Menu as MenuIcon,
  Logout as LogoutIcon,
  ShoppingBag as OrdersIcon,
  ReceiptLong as ReceiptIcon,
  NotificationsActive as StockAlertIcon,
  Storefront as B2BIcon,
  AccountBalance as KhataIcon,
  BarChart as AnalyticsIcon,
  Settings as SettingsIcon,
  ReportProblem as ReportIcon,
  Person as ProfileIcon,
  QrCodeScanner as QrScanIcon,
  Layers as BatchTrackIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import client, { clearBackendURL } from '../api/client';
import { getUnresolvedAlertCount } from '../services/systemService';

export const Layout: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stockAlertsCount, setStockAlertsCount] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);
  const [adminAlertCount, setAdminAlertCount] = useState(0);
  const [userNotificationCount, setUserNotificationCount] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  // Polling for badge counts
  useEffect(() => {
    const runPolling = async () => {
      if (!user) return;
      const token = localStorage.getItem('user_token');

      if (user.roles.includes('manager') || user.roles.includes('employee') || user.roles.includes('owner')) {
        try {
          const ordersRes = await client.get('/api/v1/purchases?status=draft', {
            headers: { Authorization: `Bearer ${token}` }
          });
          setOrdersCount(ordersRes.data?.length || 0);
        } catch (err) { /* silent */ }

        try {
          const alertsRes = await client.get('/api/v1/system/alerts/operational', {
            headers: { Authorization: `Bearer ${token}` }
          });
          const activeAlerts = alertsRes.data?.filter((a: any) => a.status === 'active' || !a.status).length || 0;
          setStockAlertsCount(activeAlerts);
        } catch (err) { /* silent */ }
      }

      // Admin: unresolved system alerts count
      if (user.roles.includes('it_admin') || user.roles.includes('owner')) {
        try {
          const count = await getUnresolvedAlertCount();
          setAdminAlertCount(count);
        } catch { /* silent */ }
      }

      // User: pending_user tickets (fix awaiting confirmation)
      try {
        const myRes = await client.get('/api/v1/system/alerts/my', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const pending = myRes.data?.filter((t: any) => t.status === 'pending_user').length || 0;
        setUserNotificationCount(pending);
      } catch { /* silent */ }
    };

    runPolling();
    const intervalId = setInterval(runPolling, 10000); // 10s on mobile to save battery
    return () => clearInterval(intervalId);
  }, [user]);

  // Role checks
  const isOperational = user?.roles.includes('manager') || user?.roles.includes('employee') || user?.roles.includes('owner');
  const isManagerOrOwner = user?.roles.includes('manager') || user?.roles.includes('owner');
  const isAdmin = user?.roles.includes('it_admin');

  const getBottomNavValue = () => {
    const path = location.pathname;
    if (path === '/') return 0;
    if (path === '/inventory') return 1;
    if (path === '/orders') return 2;
    if (path === '/scanner') return 3;
    return -1; // "More" items
  };

  // Drawer menu items
  const drawerItems: Array<{ text: string; icon: React.ReactNode; path: string; show: boolean; badge?: number }> = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/', show: true },
    { text: 'Inventory', icon: <InventoryIcon />, path: '/inventory', show: !!isOperational },
    { text: 'Batch Tracking', icon: <BatchTrackIcon />, path: '/batch-tracking', show: !!isOperational },
    { text: 'Orders', icon: <OrdersIcon />, path: '/orders', show: !!isOperational, badge: ordersCount },
    { text: 'Catalog', icon: <CatalogIcon />, path: '/products', show: !!isManagerOrOwner },
    { text: 'Sales History', icon: <ReceiptIcon />, path: '/sales/history', show: !!isOperational },
    { text: 'Stock Alerts', icon: <StockAlertIcon />, path: '/stock-alerts', show: !!isOperational, badge: stockAlertsCount },
    { text: 'Wholesale / B2B', icon: <B2BIcon />, path: '/b2b', show: !!isOperational },
    { text: 'Khata (Credit)', icon: <KhataIcon />, path: '/khata', show: !!isOperational },
    { text: 'Analytics', icon: <AnalyticsIcon />, path: '/analytics', show: !!isManagerOrOwner },
    { text: 'System Health', icon: <SettingsIcon />, path: '/system', show: !!(isAdmin || user?.roles.includes('owner')), badge: adminAlertCount },
    { text: 'Report Issue', icon: <ReportIcon />, path: '/support', show: true, badge: userNotificationCount },
    { text: 'Scanner', icon: <QrScanIcon />, path: '/scanner', show: !!isOperational },
    { text: 'My Profile', icon: <ProfileIcon />, path: '/profile', show: true },
  ];

  const visibleDrawerItems = drawerItems.filter(i => i.show);

  const currentPageTitle = visibleDrawerItems.find(i => i.path === location.pathname)?.text || 'Store OS';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', width: '100%', overflow: 'hidden' }}>
      {/* Top App Bar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          backgroundColor: 'white',
          borderBottom: '1px solid',
          borderColor: 'divider',
          zIndex: 1200,
          // Push content below Android status bar / notch
          pt: 'env(safe-area-inset-top)',
        }}
      >
        <Toolbar sx={{ minHeight: '56px !important', px: 1.5 }}>
          <IconButton
            color="primary"
            edge="start"
            onClick={() => setDrawerOpen(true)}
            sx={{ mr: 1 }}
          >
            <MenuIcon />
          </IconButton>

          <Typography
            variant="h6"
            noWrap
            sx={{
              flex: 1,
              color: 'text.primary',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            {currentPageTitle}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ textAlign: 'right', mr: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary', display: 'block', lineHeight: 1.2 }}>
                {user?.username}
              </Typography>
              <Chip
                label={user?.roles[0] === 'it_admin' ? 'Admin' : user?.roles[0]}
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  textTransform: 'capitalize',
                  background: user?.roles.includes('it_admin')
                    ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                    : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  color: 'white',
                }}
              />
            </Box>
            <Avatar
              onClick={() => navigate('/profile')}
              sx={{
                width: 34,
                height: 34,
                fontWeight: 700,
                fontSize: '0.875rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                cursor: 'pointer',
              }}
            >
              {user?.username[0]?.toUpperCase()}
            </Avatar>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Swipeable Side Drawer */}
      <SwipeableDrawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpen={() => setDrawerOpen(true)}
        disableBackdropTransition
        sx={{
          '& .MuiDrawer-paper': {
            width: 280,
            borderRadius: '0 20px 20px 0',
          },
        }}
      >
        {/* Drawer Header */}
        <Box sx={{
          p: 2.5,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          pt: 'calc(env(safe-area-inset-top) + 20px)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 40, height: 40, borderRadius: 2,
              backgroundColor: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CatalogIcon />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Store OS</Typography>
          </Box>
        </Box>

        {/* Menu Items */}
        <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
          <List sx={{ px: 1.5 }}>
            {visibleDrawerItems.map((item) => {
              const isSelected = location.pathname === item.path;
              return (
                <ListItem key={item.text} disablePadding sx={{ mb: 0.3 }}>
                  <ListItemButton
                    selected={isSelected}
                    onClick={() => {
                      navigate(item.path);
                      setDrawerOpen(false);
                    }}
                    sx={{
                      borderRadius: 2,
                      minHeight: 48,
                      transition: 'all 0.15s ease',
                      '&.Mui-selected': {
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        '& .MuiListItemIcon-root': { color: 'white' },
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40, color: isSelected ? 'white' : 'primary.main' }}>
                      {item.badge && item.badge > 0 ? (
                        <Badge badgeContent={item.badge} color="error" max={99}>
                          {item.icon}
                        </Badge>
                      ) : item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.text}
                      primaryTypographyProps={{ fontWeight: isSelected ? 600 : 500, fontSize: '0.9rem' }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>

        <Divider />
        <List sx={{ px: 1.5, py: 1.5 }}>
          {/* Reconnect to Desktop (rescan QR) */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => {
                setDrawerOpen(false);
                clearBackendURL();
                window.location.reload();
              }}
              sx={{
                borderRadius: 2,
                color: '#6366f1',
                border: '1px dashed rgba(99,102,241,0.3)',
                minHeight: 48,
              }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: '#6366f1' }}>
                <QrScanIcon />
              </ListItemIcon>
              <ListItemText primary="Reconnect to Desktop" primaryTypographyProps={{ fontWeight: 600, fontSize: '0.85rem' }} />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton
              onClick={() => { logout(); setDrawerOpen(false); }}
              sx={{
                borderRadius: 2,
                color: 'error.main',
                minHeight: 48,
              }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: 'error.main' }}>
                <LogoutIcon />
              </ListItemIcon>
              <ListItemText primary="Logout" primaryTypographyProps={{ fontWeight: 600 }} />
            </ListItemButton>
          </ListItem>
        </List>
      </SwipeableDrawer>

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flex: 1,
          mt: 'calc(56px + env(safe-area-inset-top))', // AppBar height + status bar
          mb: isOperational ? '64px' : 0, // BottomNav height
          px: { xs: 1.5, sm: 2, md: 3 },
          py: 2,
          backgroundColor: '#f8fafc',
          overflowY: 'auto',
          overflowX: 'hidden',
          width: '100%',
          maxWidth: '100vw',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Outlet />
      </Box>

      {/* Bottom Navigation - Only for operational users */}
      {isOperational && (
        <BottomNavigation
          value={getBottomNavValue()}
          onChange={(_, newValue) => {
            const paths = ['/', '/inventory', '/orders', '/scanner'];
            if (newValue < paths.length) {
              navigate(paths[newValue]);
            }
          }}
          showLabels
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1200,
            height: 'calc(64px + env(safe-area-inset-bottom))',
            pb: 'env(safe-area-inset-bottom)',
            bgcolor: 'white',
            borderTop: '1px solid rgba(0,0,0,0.08)',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
          }}
        >
          <BottomNavigationAction label="Home" icon={<DashboardIcon />} />
          <BottomNavigationAction label="Inventory" icon={<InventoryIcon />} />
          <BottomNavigationAction
            label="Orders"
            icon={
              <Badge badgeContent={ordersCount} color="error" max={99}>
                <OrdersIcon />
              </Badge>
            }
          />
          <BottomNavigationAction label="Scanner" icon={<QrScanIcon />} />
        </BottomNavigation>
      )}
    </Box>
  );
};
