// Inventory_Manager_Desktop/src/components/ActiveOrdersPane.tsx
import React from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  List, 
  ListItem, 
  ListItemButton, 
  ListItemText, 
  IconButton, 
  Chip,
  Divider
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

// Define the structure of a Held Order
export interface HeldOrder {
  id: string; // Unique ID (timestamp or uuid)
  name: string; // Customer Name or "Walk-in #X"
  items: any[]; // The cart items
  totalAmount: number;
  timestamp: Date;
}

interface ActiveOrdersPaneProps {
  orders: HeldOrder[];
  currentOrderId: string | null;
  onResume: (orderId: string) => void;
  onDelete: (orderId: string) => void;
}

const ActiveOrdersPane: React.FC<ActiveOrdersPaneProps> = ({ 
  orders, 
  currentOrderId, 
  onResume, 
  onDelete 
}) => {
  return (
    <Paper 
      elevation={3} 
      sx={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        bgcolor: '#f8fafc',
        borderRight: '1px solid #e2e8f0'
      }}
    >
      <Box sx={{ p: 2, bgcolor: '#fff', borderBottom: '1px solid #e2e8f0' }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccessTimeIcon color="primary" />
          Active Orders
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {orders.length} orders on hold
        </Typography>
      </Box>

      <List sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
        {orders.length === 0 ? (
          <Box sx={{ textAlign: 'center', mt: 4, opacity: 0.6 }}>
            <ShoppingCartIcon sx={{ fontSize: 40, color: 'text.secondary' }} />
            <Typography variant="body2" sx={{ mt: 1 }}>No active orders</Typography>
          </Box>
        ) : (
          orders.map((order) => (
            <Paper 
              key={order.id} 
              elevation={currentOrderId === order.id ? 4 : 1}
              sx={{ 
                mb: 1.5, 
                overflow: 'hidden',
                border: currentOrderId === order.id ? '2px solid #6366f1' : '1px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              <ListItem 
                disablePadding 
                secondaryAction={
                  <IconButton edge="end" aria-label="delete" onClick={() => onDelete(order.id)} size="small" color="error">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemButton 
                  selected={currentOrderId === order.id}
                  onClick={() => onResume(order.id)}
                  sx={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'flex-start',
                    py: 1.5
                  }}
                >
                  <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                      {order.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {order.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </Typography>
                  </Box>
                  
                  <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Chip 
                      label={`${order.items.length} Items`} 
                      size="small" 
                      sx={{ height: 20, fontSize: '0.65rem' }} 
                    />
                    <Typography variant="body2" color="primary.main" fontWeight="bold">
                      ₹{order.totalAmount.toLocaleString()}
                    </Typography>
                  </Box>
                </ListItemButton>
              </ListItem>
            </Paper>
          ))
        )}
      </List>
    </Paper>
  );
};

export default ActiveOrdersPane;