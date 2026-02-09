import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Tabs, Tab, Button, IconButton, Grid,
  Card, CardContent, Chip, Tooltip, Alert, CircularProgress
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  ShoppingCart as OrderIcon,
  Payment as PaymentIcon,
  WhatsApp as WhatsAppIcon,
  Download as DownloadIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Store as StoreIcon,
  Edit as EditIcon,
  Receipt as ReceiptIcon,
  AccountBalance as AccountIcon
} from '@mui/icons-material';
import { b2bService } from '../../services/b2bService';
import type { B2BClient, B2BOrder } from '../../services/b2bService';
import { openB2BInvoicePDF } from '../../services/invoiceService';
import KhataLedger from './KhataLedger';
import RecordPaymentDialog from './RecordPaymentDialog';
import B2BOrderDialog from './B2BOrderDialog';
import EditB2BClientDialog from './EditB2BClientDialog';
import SendEmailDialog from './SendEmailDialog';

interface B2BClientDetailProps {
  clientId: number;
  onBack: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div hidden={value !== index} style={{ paddingTop: 16 }}>
    {value === index && children}
  </div>
);

export const B2BClientDetail: React.FC<B2BClientDetailProps> = ({
  clientId,
  onBack
}) => {
  const [client, setClient] = useState<B2BClient | null>(null);
  const [orders, setOrders] = useState<B2BOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadClientData();
  }, [clientId, refreshKey]);

  const loadClientData = async () => {
    setLoading(true);
    try {
      const [clientData, ordersData] = await Promise.all([
        b2bService.getClient(clientId),
        b2bService.getClientOrders(clientId)
      ]);
      setClient(clientData);
      setOrders(ordersData);
    } catch (error) {
      console.error('Failed to load client data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleDownloadStatement = async () => {
    try {
      await b2bService.downloadStatement(clientId);
    } catch (error) {
      console.error('Failed to download statement:', error);
    }
  };

  const handleWhatsApp = async () => {
    if (!client) return;
    try {
      const { message, phone } = await b2bService.getWhatsAppMessage(clientId);
      const formattedPhone = phone.replace(/\D/g, '');
      const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
    } catch (error) {
      console.error('Failed to generate WhatsApp message:', error);
    }
  };

  const getBalanceColor = (balance: number, limit: number): string => {
    const ratio = balance / limit;
    if (ratio >= 1) return '#ef4444';
    if (ratio >= 0.8) return '#f59e0b';
    return '#22c55e';
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'completed':
        return <Chip size="small" label="Paid" color="success" />;
      case 'partial':
        return <Chip size="small" label="Partial" color="warning" />;
      default:
        return <Chip size="small" label="Pending" color="error" />;
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!client) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Client not found</Alert>
        <Button startIcon={<BackIcon />} onClick={onBack} sx={{ mt: 2 }}>
          Back to Clients
        </Button>
      </Box>
    );
  }

  const creditUsagePercent = (client.current_balance / client.credit_limit) * 100;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={onBack} sx={{ mr: 2 }}>
          <BackIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight="bold">
            {client.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {client.contact_person || 'B2B Client'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<OrderIcon />}
            onClick={() => setOrderDialogOpen(true)}
          >
            New Order
          </Button>
          <Button
            variant="outlined"
            startIcon={<PaymentIcon />}
            onClick={() => setPaymentDialogOpen(true)}
            disabled={client.current_balance <= 0}
          >
            Record Payment
          </Button>
          <Tooltip title="Send WhatsApp reminder">
            <IconButton color="success" onClick={handleWhatsApp}>
              <WhatsAppIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Send Email reminder">
            <IconButton color="info" onClick={() => setEmailDialogOpen(true)}>
              <EmailIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Download Statement PDF">
            <IconButton color="primary" onClick={handleDownloadStatement}>
              <DownloadIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Balance Card */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Outstanding Balance
                  </Typography>
                  <Typography
                    variant="h4"
                    fontWeight="bold"
                    sx={{ color: getBalanceColor(client.current_balance, client.credit_limit) }}
                  >
                    ₹{client.current_balance.toLocaleString()}
                  </Typography>
                </Box>
                <AccountIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
              </Box>
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Credit Used
                  </Typography>
                  <Typography variant="caption">
                    {creditUsagePercent.toFixed(0)}%
                  </Typography>
                </Box>
                <Box sx={{
                  height: 6,
                  borderRadius: 3,
                  bgcolor: 'action.hover',
                  overflow: 'hidden'
                }}>
                  <Box sx={{
                    height: '100%',
                    width: `${Math.min(creditUsagePercent, 100)}%`,
                    bgcolor: getBalanceColor(client.current_balance, client.credit_limit),
                    borderRadius: 3
                  }} />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Limit: ₹{client.credit_limit.toLocaleString()}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Contact Info */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Contact Information
                </Typography>
                <Tooltip title="Edit Client Info">
                  <IconButton size="small" onClick={() => setEditDialogOpen(true)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PhoneIcon fontSize="small" color="action" />
                  <Typography variant="body2">
                    {client.phone || 'No phone'}
                  </Typography>
                </Box>
                {client.email && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <EmailIcon fontSize="small" color="action" />
                    <Typography variant="body2">
                      {client.email}
                    </Typography>
                  </Box>
                )}
                {client.address && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <StoreIcon fontSize="small" color="action" />
                    <Typography variant="body2" noWrap>
                      {client.address}
                    </Typography>
                  </Box>
                )}
                {client.gstin && (
                  <Chip size="small" label={`GSTIN: ${client.gstin}`} variant="outlined" />
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Order Stats */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Order Summary
              </Typography>
              <Box sx={{ display: 'flex', gap: 3 }}>
                <Box>
                  <Typography variant="h4" fontWeight="bold" color="primary">
                    {orders.length}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Total Orders
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="h4" fontWeight="bold" color="warning.main">
                    {orders.filter(o => o.payment_status === 'pending').length}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Pending
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    ₹{orders.reduce((sum, o) => sum + o.total_amount, 0).toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Total Business
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={tabValue}
          onChange={(_, v) => setTabValue(v)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Khata Ledger" icon={<ReceiptIcon />} iconPosition="start" />
          <Tab label={`Orders (${orders.length})`} icon={<OrderIcon />} iconPosition="start" />
        </Tabs>

        {/* Khata Tab */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ px: 2, pb: 2 }}>
            <KhataLedger clientId={clientId} refreshTrigger={refreshKey} />
          </Box>
        </TabPanel>

        {/* Orders Tab */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ px: 2, pb: 2 }}>
            {orders.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <OrderIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">No orders yet</Typography>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {orders.map((order) => (
                  <Grid size={{ xs: 12, md: 6, lg: 4 }} key={order.id}>
                    <Card variant="outlined">
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="subtitle2">
                            Order #{order.id}
                          </Typography>
                          {getStatusChip(order.payment_status)}
                        </Box>
                        <Typography variant="h6" fontWeight="bold">
                          ₹{order.total_amount.toLocaleString()}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(order.order_date).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </Typography>
                        {order.notes && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }} noWrap>
                            {order.notes}
                          </Typography>
                        )}
                        {order.payment_status !== 'completed' && (
                          <Box sx={{ mt: 1 }}>
                            <Typography variant="caption" color="warning.main">
                              Remaining: ₹{(order.total_amount - order.amount_paid).toLocaleString()}
                            </Typography>
                          </Box>
                        )}
                        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                          <Button
                            size="small"
                            startIcon={<ReceiptIcon />}
                            onClick={() => {
                              console.log("Opening invoice for order:", order.id);
                              if (order.id) openB2BInvoicePDF(order.id);
                            }}
                          >
                            Invoice
                          </Button>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        </TabPanel>
      </Paper>

      {/* Dialogs */}
      <RecordPaymentDialog
        open={paymentDialogOpen}
        client={client}
        onClose={() => setPaymentDialogOpen(false)}
        onSuccess={handleRefresh}
      />

      <B2BOrderDialog
        open={orderDialogOpen}
        client={client}
        onClose={() => setOrderDialogOpen(false)}
        onSuccess={handleRefresh}
      />

      <EditB2BClientDialog
        open={editDialogOpen}
        client={client}
        onClose={() => setEditDialogOpen(false)}
        onSuccess={handleRefresh}
      />

      <SendEmailDialog
        open={emailDialogOpen}
        client={client}
        onClose={() => setEmailDialogOpen(false)}
        onSuccess={handleRefresh}
      />
    </Box>
  );
};

export default B2BClientDetail;
