import React, { useState, useEffect } from 'react';
import {
  Box, CssBaseline, AppBar, Toolbar, Typography,
  Drawer, List,
  ListItem, ListItemButton, ListItemIcon, ListItemText,
  IconButton, Divider, Avatar, Chip, Badge
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Inventory as CatalogIcon,
  People as PeopleIcon,
  BarChart as AnalyticsIcon,
  Settings as SettingsIcon,
  Menu as MenuIcon,
  Logout as LogoutIcon,
  Psychology as BrainIcon,
  Warehouse as InventoryIcon,
  Assessment as ReportsIcon,
  ShoppingBag as OrdersIcon,
  ReportProblem as ReportIcon,
  PointOfSale as SalesIcon,
  ReceiptLong as ReceiptIcon,
  NotificationsActive as StockAlertIcon
} from '@mui/icons-material';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import client from '../api/client';
import { getUnresolvedAlertCount } from '../services/systemService';
import { NotificationsPane } from './NotificationsPane';

const drawerWidth = 260;

export const Layout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  // State for notifications
  const [userNotificationCount, setUserNotificationCount] = useState(0);
  const [adminAlertCount, setAdminAlertCount] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);
  const [stockAlertsCount, setStockAlertsCount] = useState(0);

  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  // --- NOTIFICATION LOGIC ---
  useEffect(() => {
    const runPolling = async () => {
      if (!user) return;
      const token = localStorage.getItem('user_token');

      // 1. For Regular Users: Check if their reports have updates
      try {
        const res = await client.get('/api/v1/system/alerts/my', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const pending = res.data.filter((alert: any) => alert.status === 'pending_user').length;
        setUserNotificationCount(pending);
      } catch (err) {
        // Silent fail
      }

      // 2. For IT Admins: Check for ANY open issues
      if (user.roles.includes('it_admin')) {
        try {
          const count = await getUnresolvedAlertCount();
          setAdminAlertCount(count);
        } catch (err) {
          console.error("Polling error:", err);
        }
      }

      // 3. For staff: Get draft orders count
      if (user.roles.includes('manager') || user.roles.includes('employee') || user.roles.includes('owner')) {
        try {
          const ordersRes = await client.get('/api/v1/purchases?status=draft', {
            headers: { Authorization: `Bearer ${token}` }
          });
          setOrdersCount(ordersRes.data?.length || 0);
        } catch (err) {
          // Silent fail
        }

        // 4. Get active stock alerts count
        try {
          const alertsRes = await client.get('/api/v1/system/alerts/operational', {
            headers: { Authorization: `Bearer ${token}` }
          });
          const activeAlerts = alertsRes.data?.filter((a: any) => a.status === 'active' || !a.status).length || 0;
          setStockAlertsCount(activeAlerts);
        } catch (err) {
          // Silent fail
        }
      }
    };

    runPolling();
    const intervalId = setInterval(runPolling, 5000);
    return () => clearInterval(intervalId);
  }, [user]);

  // --- MENU CONFIGURATION ---
  const menuItems: Array<{ text: string; icon: React.ReactNode; path: string; roles?: string[]; badgeCount?: number }> = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  ];

  // 1. Catalog
  if (user?.roles.includes('manager') || user?.roles.includes('it_admin')) {
    menuItems.push({
      text: 'Catalog',
      icon: <CatalogIcon />,
      path: '/products'
    });
  }

  // 2. Inventory
  if (
    user?.roles.includes('manager') ||
    user?.roles.includes('employee') ||
    user?.roles.includes('it_admin')
  ) {
    menuItems.push({
      text: 'Inventory',
      icon: <InventoryIcon />,
      path: '/inventory'
    });
  }

  // 3. Orders
  if (
    user?.roles.includes('manager') ||
    user?.roles.includes('employee') ||
    user?.roles.includes('it_admin')
  ) {
    menuItems.push({
      text: 'Orders',
      icon: <OrdersIcon />,
      path: '/orders',
      badgeCount: ordersCount
    });
  }

  // 4. Billing (POS) - For Recording Sales
  if (
    user?.roles.includes('manager') ||
    user?.roles.includes('employee') ||
    user?.roles.includes('it_admin')
  ) {
    menuItems.push({
      text: 'Billing',
      icon: <SalesIcon />,
      path: '/sales'
    });
  }

  // 5. Sales History - For Viewing/Managing Past Sales [NEW]
  if (
    user?.roles.includes('manager') ||
    user?.roles.includes('employee') ||
    user?.roles.includes('it_admin')
  ) {
    menuItems.push({
      text: 'Sales History',
      icon: <ReceiptIcon />, // Using ReceiptLong icon
      path: '/sales/history'
    });
  }

  // 6. Reports Center
  if (
    user?.roles.includes('manager') ||
    user?.roles.includes('employee') ||
    user?.roles.includes('it_admin')
  ) {
    menuItems.push({
      text: 'Reports',
      icon: <ReportsIcon />,
      path: '/reports'
    });
  }

  // 6b. Stock Alerts (for operational staff and owner)
  if (
    user?.roles.includes('manager') ||
    user?.roles.includes('employee') ||
    user?.roles.includes('owner')
  ) {
    menuItems.push({
      text: 'Stock Alerts',
      icon: <StockAlertIcon sx={{ color: '#f59e0b' }} />,
      path: '/stock-alerts',
      badgeCount: stockAlertsCount
    });
  }

  // 7. Analytics & AI
  if (user?.roles.includes('manager')) {
    menuItems.push(
      { text: 'Analytics', icon: <AnalyticsIcon />, path: '/analytics' },
      { text: 'AI Insights', icon: <BrainIcon />, path: '/datascience' }
    );
  }

  // 8. Admin Settings
  if (user?.roles.includes('it_admin')) {
    menuItems.push(
      {
        text: 'System Health',
        icon: (
          <Badge badgeContent={adminAlertCount} color="error" max={99}>
            <SettingsIcon />
          </Badge>
        ),
        path: '/system'
      },
      { text: 'User Management', icon: <PeopleIcon />, path: '/users' }
    );
  }

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Logo Section */}
      <Box
        sx={{
          p: 3,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(10px)',
            }}
          >
            <CatalogIcon />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '-0.5px' }}>
            Store OS
          </Typography>
        </Box>
      </Box>

      {/* Menu Items */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 2 }}>
        <List sx={{ px: 2 }}>
          {menuItems.map((item) => {
            const isSelected = location.pathname === item.path;
            return (
              <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={isSelected}
                  onClick={() => navigate(item.path)}
                  sx={{
                    borderRadius: 2,
                    transition: 'all 0.2s ease',
                    '&.Mui-selected': {
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      boxShadow: '0 4px 10px rgba(102, 126, 234, 0.3)',
                      '& .MuiListItemIcon-root': {
                        color: 'white',
                      },
                      '&:hover': {
                        background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%)',
                      },
                    },
                    '&:hover': {
                      backgroundColor: 'rgba(102, 126, 234, 0.08)',
                      transform: 'translateX(4px)',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 40,
                      color: isSelected ? 'white' : 'primary.main',
                    }}
                  >
                    {item.badgeCount && item.badgeCount > 0 ? (
                      <Badge
                        badgeContent={item.badgeCount}
                        color="error"
                        max={99}
                        sx={{
                          '& .MuiBadge-badge': {
                            fontSize: '0.65rem',
                            minWidth: 18,
                            height: 18,
                            right: -3,
                            top: 3
                          }
                        }}
                      >
                        {item.icon}
                      </Badge>
                    ) : (
                      item.icon
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.text}
                    primaryTypographyProps={{
                      fontWeight: isSelected ? 600 : 500,
                      fontSize: '0.95rem',
                    }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>

      <Divider />

      {/* Bottom Actions */}
      <List sx={{ px: 2, py: 2 }}>
        <ListItem disablePadding sx={{ mb: 1 }}>
          <ListItemButton
            onClick={() => navigate('/support')}
            sx={{
              borderRadius: 2,
              color: '#ed6c02', // Warning Color
              border: '1px dashed rgba(237, 108, 2, 0.3)',
              transition: 'all 0.2s ease',
              '&:hover': {
                backgroundColor: 'rgba(237, 108, 2, 0.08)',
                transform: 'translateX(4px)',
                borderColor: '#ed6c02'
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: '#ed6c02' }}>
              <Badge badgeContent={userNotificationCount} color="error" max={9}>
                <ReportIcon />
              </Badge>
            </ListItemIcon>
            <ListItemText
              primary="Report Issue"
              primaryTypographyProps={{ fontWeight: 600 }}
            />
          </ListItemButton>
        </ListItem>

        <ListItem disablePadding>
          <ListItemButton
            onClick={logout}
            sx={{
              borderRadius: 2,
              color: 'error.main',
              transition: 'all 0.2s ease',
              '&:hover': {
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                transform: 'translateX(4px)',
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: 'error.main' }}>
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText
              primary="Logout"
              primaryTypographyProps={{ fontWeight: 500 }}
            />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          backgroundColor: 'white',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Toolbar>
          <IconButton
            color="primary"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Box sx={{ flexGrow: 1 }}>
            <Typography
              variant="h6"
              noWrap
              component="div"
              sx={{
                color: 'text.primary',
                fontWeight: 600,
              }}
            >
              {menuItems.find(i => i.path === location.pathname)?.text || 'Store OS'}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* Notification Bell */}
            <NotificationsPane userRoles={user?.roles || []} />

            <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'right' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                {user?.username}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                {user?.roles.map((role) => (
                  <Chip
                    key={role}
                    label={role === 'it_admin' ? 'Admin' : role}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      background: role === 'it_admin'
                        ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                        : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      color: 'white',
                    }}
                  />
                ))}
              </Box>
            </Box>
            {/* Avatar - Clickable */}
            <Box
              onClick={() => navigate('/profile')}
              sx={{
                cursor: 'pointer',
                transition: 'transform 0.2s',
                '&:hover': { transform: 'scale(1.05)' }
              }}
            >
              <Avatar
                sx={{
                  bgcolor: 'primary.main',
                  width: 40,
                  height: 40,
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                }}
              >
                {user?.username[0]?.toUpperCase()}
              </Avatar>
            </Box>
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              boxShadow: '4px 0 10px rgba(0, 0, 0, 0.1)',
            },
          }}
        >
          {drawer}
        </Drawer>

        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              borderRight: '1px solid',
              borderColor: 'divider',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          backgroundColor: '#f8fafc',
          minHeight: '100vh',
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
};
