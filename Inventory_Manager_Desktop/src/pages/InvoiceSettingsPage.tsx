import React, { useEffect, useState, useRef } from 'react';
import {
  Box, Typography, Paper, Button, Alert, CircularProgress,
  Card, CardContent, Tabs, Tab, TextField, Grid, Switch,
  FormControlLabel, Divider, Chip, Snackbar, IconButton
} from '@mui/material';
import {
  Save as SaveIcon,
  Business as BusinessIcon,
  AccountBalance as BankIcon,
  Receipt as InvoiceIcon,
  Palette as TemplateIcon,
  QrCode as QRIcon,
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  Draw as SignatureIcon
} from '@mui/icons-material';
import client from '../api/client';
import {
  getBusinessSettings,
  updateBusinessSettings,
  getInvoiceTemplates,
  type BusinessSettings,
  type BusinessSettingsUpdate,
  type InvoiceTemplate
} from '../services/invoiceService';

// Tab Panel component
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

// Template preview card
interface TemplateCardProps {
  template: InvoiceTemplate;
  isSelected: boolean;
  onSelect: () => void;
}

function TemplateCard({ template, isSelected, onSelect }: TemplateCardProps) {
  return (
    <Card
      onClick={onSelect}
      sx={{
        cursor: 'pointer',
        border: isSelected ? '2px solid' : '1px solid',
        borderColor: isSelected ? template.primary_color : '#e2e8f0',
        transition: 'all 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }
      }}
    >
      <Box
        sx={{
          height: 8,
          background: `linear-gradient(90deg, ${template.primary_color} 0%, ${template.secondary_color} 100%)`
        }}
      />
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {template.name}
          </Typography>
          {isSelected && (
            <Chip size="small" label="Selected" color="primary" />
          )}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {template.description}
        </Typography>
        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
          <Box
            sx={{
              width: 24, height: 24, borderRadius: '50%',
              bgcolor: template.primary_color, border: '2px solid white',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }}
          />
          <Box
            sx={{
              width: 24, height: 24, borderRadius: '50%',
              bgcolor: template.secondary_color, border: '2px solid white',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}

export default function InvoiceSettingsPage() {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [settingsData, templatesData] = await Promise.all([
        getBusinessSettings(),
        getInvoiceTemplates()
      ]);
      setSettings(settingsData);
      setTemplates(templatesData);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setSnackbar({ open: true, message: 'Failed to load settings', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    
    try {
      setSaving(true);
      // Convert null values to undefined for the update
      const updateData: BusinessSettingsUpdate = Object.fromEntries(
        Object.entries(settings).map(([key, value]) => [key, value === null ? undefined : value])
      ) as BusinessSettingsUpdate;
      await updateBusinessSettings(updateData);
      setSnackbar({ open: true, message: 'Settings saved successfully!', severity: 'success' });
    } catch (err) {
      console.error('Failed to save settings:', err);
      setSnackbar({ open: true, message: 'Failed to save settings', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof BusinessSettings, value: string | boolean) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  const handleBoolChange = (field: keyof BusinessSettings) => {
    if (!settings) return;
    const current = settings[field];
    const newValue = current === 'true' || current === true ? false : true;
    setSettings({ ...settings, [field]: newValue });
  };

  const getBoolValue = (value: string | boolean | undefined): boolean => {
    return value === 'true' || value === true;
  };

  // Signature upload handlers
  const handleSignatureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/gif'].includes(file.type)) {
      setSnackbar({ open: true, message: 'Please upload a PNG, JPG, or GIF image', severity: 'error' });
      return;
    }

    // Validate file size (500KB max)
    if (file.size > 500 * 1024) {
      setSnackbar({ open: true, message: 'Image must be less than 500KB', severity: 'error' });
      return;
    }

    try {
      setUploadingSignature(true);
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('user_token');
      await client.post('/api/v1/invoices/settings/signature', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      });

      // Reload settings to get the new signature
      await loadData();
      setSnackbar({ open: true, message: 'Signature uploaded successfully!', severity: 'success' });
    } catch (err) {
      console.error('Failed to upload signature:', err);
      setSnackbar({ open: true, message: 'Failed to upload signature', severity: 'error' });
    } finally {
      setUploadingSignature(false);
      if (signatureInputRef.current) {
        signatureInputRef.current.value = '';
      }
    }
  };

  const handleDeleteSignature = async () => {
    try {
      setUploadingSignature(true);
      const token = localStorage.getItem('user_token');
      await client.delete('/api/v1/invoices/settings/signature', {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Update local state
      if (settings) {
        setSettings({ ...settings, signature_image: undefined });
      }
      setSnackbar({ open: true, message: 'Signature deleted', severity: 'success' });
    } catch (err) {
      console.error('Failed to delete signature:', err);
      setSnackbar({ open: true, message: 'Failed to delete signature', severity: 'error' });
    } finally {
      setUploadingSignature(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} color="#1e293b">
            Invoice Settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure your business details, invoice templates, and preferences
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving}
          sx={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            px: 4, py: 1.5,
            '&:hover': { background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }
          }}
        >
          Save Changes
        </Button>
      </Box>

      {/* Tabs */}
      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Tabs
          value={tabValue}
          onChange={(_, v) => setTabValue(v)}
          sx={{
            borderBottom: '1px solid #e2e8f0',
            bgcolor: '#f8fafc',
            '& .MuiTab-root': { py: 2, fontWeight: 600 }
          }}
        >
          <Tab icon={<BusinessIcon />} iconPosition="start" label="Business Info" />
          <Tab icon={<BankIcon />} iconPosition="start" label="Bank Details" />
          <Tab icon={<TemplateIcon />} iconPosition="start" label="Templates" />
          <Tab icon={<InvoiceIcon />} iconPosition="start" label="Invoice Options" />
        </Tabs>

        {/* Tab 0: Business Info */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            <Grid size={12}>
              <Typography variant="h6" fontWeight={600} mb={2}>
                Business Information
              </Typography>
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Business Name"
                value={settings?.business_name || ''}
                onChange={(e) => handleChange('business_name', e.target.value)}
                placeholder="Enter your business name"
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="GSTIN"
                value={settings?.gstin || ''}
                onChange={(e) => handleChange('gstin', e.target.value)}
                placeholder="22AAAAA0000A1Z5"
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Phone"
                value={settings?.business_phone || ''}
                onChange={(e) => handleChange('business_phone', e.target.value)}
                placeholder="+91 9876543210"
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Email"
                value={settings?.business_email || ''}
                onChange={(e) => handleChange('business_email', e.target.value)}
                placeholder="contact@business.com"
              />
            </Grid>
            
            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Business Address"
                value={settings?.business_address || ''}
                onChange={(e) => handleChange('business_address', e.target.value)}
                placeholder="Full business address for invoices"
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="State"
                value={settings?.business_state || ''}
                onChange={(e) => handleChange('business_state', e.target.value)}
                placeholder="Maharashtra"
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="State Code (for GST)"
                value={settings?.business_state_code || ''}
                onChange={(e) => handleChange('business_state_code', e.target.value)}
                placeholder="27"
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* Tab 1: Bank Details */}
        <TabPanel value={tabValue} index={1}>
          <Grid container spacing={3}>
            <Grid size={12}>
              <Typography variant="h6" fontWeight={600} mb={2}>
                Bank Account Details
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                These details will appear on your invoices for payment reference
              </Typography>
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Bank Name"
                value={settings?.bank_name || ''}
                onChange={(e) => handleChange('bank_name', e.target.value)}
                placeholder="State Bank of India"
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Account Number"
                value={settings?.bank_account || ''}
                onChange={(e) => handleChange('bank_account', e.target.value)}
                placeholder="1234567890123"
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="IFSC Code"
                value={settings?.bank_ifsc || ''}
                onChange={(e) => handleChange('bank_ifsc', e.target.value)}
                placeholder="SBIN0001234"
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Branch"
                value={settings?.bank_branch || ''}
                onChange={(e) => handleChange('bank_branch', e.target.value)}
                placeholder="Main Branch, Mumbai"
              />
            </Grid>

            <Grid size={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" fontWeight={600} mb={2}>
                UPI Payment
              </Typography>
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="UPI ID"
                value={settings?.upi_id || ''}
                onChange={(e) => handleChange('upi_id', e.target.value)}
                placeholder="business@upi"
                InputProps={{
                  startAdornment: <QRIcon sx={{ mr: 1, color: '#64748b' }} />
                }}
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="UPI Payee Name"
                value={settings?.upi_payee_name || ''}
                onChange={(e) => handleChange('upi_payee_name', e.target.value)}
                placeholder="Business Name for UPI"
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* Tab 2: Templates */}
        <TabPanel value={tabValue} index={2}>
          <Typography variant="h6" fontWeight={600} mb={1}>
            Invoice Templates
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Select a template style for your invoices. This affects how PDFs are generated.
          </Typography>
          
          <Grid container spacing={3}>
            {templates.map((template) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={template.id}>
                <TemplateCard
                  template={template}
                  isSelected={settings?.default_template?.toLowerCase() === template.name.toLowerCase().replace(' ', '_').split(' ')[0] ||
                             settings?.default_template === 'classic' && template.name === 'Classic Red'}
                  onSelect={() => {
                    const templateKey = template.name.toLowerCase().split(' ')[0];
                    handleChange('default_template', templateKey);
                  }}
                />
              </Grid>
            ))}
          </Grid>

          <Box sx={{ mt: 4 }}>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>
              Template Preview
            </Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
              Preview how your invoices will look with the selected template by downloading a sample PDF.
            </Alert>
          </Box>
        </TabPanel>

        {/* Tab 3: Invoice Options */}
        <TabPanel value={tabValue} index={3}>
          <Grid container spacing={3}>
            <Grid size={12}>
              <Typography variant="h6" fontWeight={600} mb={2}>
                Invoice Customization
              </Typography>
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Invoice Prefix"
                value={settings?.invoice_prefix || 'INV'}
                onChange={(e) => handleChange('invoice_prefix', e.target.value)}
                placeholder="INV"
                helperText="Invoices will be numbered like INV-2026-0001"
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Signatory Name"
                value={settings?.signature_name || ''}
                onChange={(e) => handleChange('signature_name', e.target.value)}
                placeholder="Authorized Signatory Name"
                helperText="Name to display below signature"
              />
            </Grid>
            
            {/* GST Rate Configuration */}
            <Grid size={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 2, mb: 1 }}>
                GST Rate Configuration
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Set the CGST and SGST percentages for your invoices. Total GST = CGST + SGST.
              </Typography>
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="CGST Rate (%)"
                value={settings?.cgst_rate || '9'}
                onChange={(e) => handleChange('cgst_rate', e.target.value)}
                placeholder="9"
                helperText="Central GST percentage (default: 9%)"
                slotProps={{
                  input: {
                    inputProps: { min: 0, max: 50, step: 0.5 }
                  }
                }}
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="SGST Rate (%)"
                value={settings?.sgst_rate || '9'}
                onChange={(e) => handleChange('sgst_rate', e.target.value)}
                placeholder="9"
                helperText="State GST percentage (default: 9%)"
                slotProps={{
                  input: {
                    inputProps: { min: 0, max: 50, step: 0.5 }
                  }
                }}
              />
            </Grid>
            
            <Grid size={12}>
              <Alert severity="info" sx={{ mt: 1 }}>
                <strong>Total GST:</strong> {(parseFloat(String(settings?.cgst_rate || 9)) + parseFloat(String(settings?.sgst_rate || 9))).toFixed(1)}%
                (CGST {settings?.cgst_rate || 9}% + SGST {settings?.sgst_rate || 9}%)
              </Alert>
            </Grid>
            
            <Grid size={12}>
              <Divider sx={{ my: 1 }} />
            </Grid>
            
            {/* Signature Image Upload */}
            <Grid size={12}>
              <Paper sx={{ p: 2, bgcolor: '#fafafa', border: '1px dashed #ccc', borderRadius: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3 }}>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <SignatureIcon color="primary" />
                      <Typography variant="subtitle1" fontWeight={600}>
                        Signature Image
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Upload your signature image (PNG, JPG, or GIF). Max size: 500KB.
                      This will appear on your invoices.
                    </Typography>
                    
                    <input
                      ref={signatureInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif"
                      onChange={handleSignatureUpload}
                      style={{ display: 'none' }}
                      id="signature-upload"
                    />
                    
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        variant="outlined"
                        component="label"
                        htmlFor="signature-upload"
                        startIcon={uploadingSignature ? <CircularProgress size={16} /> : <UploadIcon />}
                        disabled={uploadingSignature}
                      >
                        {settings?.signature_image ? 'Change Signature' : 'Upload Signature'}
                      </Button>
                      
                      {settings?.signature_image && (
                        <IconButton 
                          color="error" 
                          onClick={handleDeleteSignature}
                          disabled={uploadingSignature}
                          title="Delete signature"
                        >
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </Box>
                  </Box>
                  
                  {/* Signature Preview */}
                  <Box sx={{ 
                    width: 150, 
                    height: 80, 
                    border: '1px solid #ddd', 
                    borderRadius: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'white'
                  }}>
                    {settings?.signature_image ? (
                      <img 
                        src={settings.signature_image} 
                        alt="Signature" 
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.disabled">
                        No signature
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Paper>
            </Grid>
            
            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Terms & Conditions"
                value={settings?.invoice_terms || ''}
                onChange={(e) => handleChange('invoice_terms', e.target.value)}
                placeholder="Thank you for your business! Payment is due within 30 days."
              />
            </Grid>
            
            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Invoice Footer"
                value={settings?.invoice_footer || ''}
                onChange={(e) => handleChange('invoice_footer', e.target.value)}
                placeholder="Additional footer text for invoices"
              />
            </Grid>

            <Grid size={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight={600} mb={2}>
                Display Options
              </Typography>
            </Grid>
            
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={getBoolValue(settings?.show_bank_details)}
                    onChange={() => handleBoolChange('show_bank_details')}
                    color="primary"
                  />
                }
                label="Show Bank Details"
              />
            </Grid>
            
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={getBoolValue(settings?.show_upi_qr)}
                    onChange={() => handleBoolChange('show_upi_qr')}
                    color="primary"
                  />
                }
                label="Show UPI QR Code"
              />
            </Grid>
            
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={getBoolValue(settings?.show_signature)}
                    onChange={() => handleBoolChange('show_signature')}
                    color="primary"
                  />
                }
                label="Show Signature Section"
              />
            </Grid>
            
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={getBoolValue(settings?.show_logo)}
                    onChange={() => handleBoolChange('show_logo')}
                    color="primary"
                  />
                }
                label="Show Logo"
              />
            </Grid>
          </Grid>
        </TabPanel>
      </Paper>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
