import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button,
  CircularProgress, Snackbar, Alert, Accordion, AccordionSummary,
  AccordionDetails, Divider,
} from '@mui/material';
import {
  ExpandMore, Business as CompanyIcon, AccountBalance as BankIcon,
  Receipt as TaxIcon, TextFields as CustomIcon,
  Palette as PaletteIcon, Save as SaveIcon,
  Visibility as PreviewIcon,
} from '@mui/icons-material';
import {
  getInvoiceSettings, updateInvoiceSettings, previewInvoiceSettings,
  type InvoiceSettings,
} from '../services/invoiceService';

export const InvoiceSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<InvoiceSettings>({});
  const [originalSettings, setOriginalSettings] = useState<InvoiceSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });

  const showSnack = (msg: string, sev: 'success' | 'error' = 'success') => setSnack({ open: true, msg, sev });

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await getInvoiceSettings();
      setSettings(data);
      setOriginalSettings(data);
    } catch {
      showSnack('Failed to load settings', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { fetchSettings(); }, []);

  const update = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const changed: Record<string, string> = {};
      Object.keys(settings).forEach(k => {
        if (settings[k] !== originalSettings[k] && settings[k] != null) {
          changed[k] = settings[k]!;
        }
      });
      if (Object.keys(changed).length === 0) { showSnack('No changes to save'); setSaving(false); return; }
      await updateInvoiceSettings(changed);
      showSnack('Settings saved');
      setOriginalSettings({ ...settings });
    } catch (e: any) {
      showSnack(e?.response?.data?.detail || 'Save failed', 'error');
    }
    setSaving(false);
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const url = await previewInvoiceSettings(settings);
      window.open(url, '_blank');
    } catch {
      showSnack('Preview failed', 'error');
    }
    setPreviewing(false);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 12 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>Invoice Settings</Typography>

      {/* Company Info */}
      <SettingsSection icon={<CompanyIcon />} title="Company Info" defaultExpanded>
        <FieldGrid>
          <Field label="Company Name" value={settings.invoice_company_name} onChange={v => update('invoice_company_name', v)} />
          <Field label="Address" value={settings.invoice_address} onChange={v => update('invoice_address', v)} multiline />
          <Field label="Phone" value={settings.invoice_phone} onChange={v => update('invoice_phone', v)} />
          <Field label="Email" value={settings.invoice_email} onChange={v => update('invoice_email', v)} />
          <Field label="Website" value={settings.invoice_website} onChange={v => update('invoice_website', v)} />
          <Field label="GSTIN" value={settings.invoice_gstin} onChange={v => update('invoice_gstin', v)} />
          <Field label="PAN" value={settings.invoice_pan} onChange={v => update('invoice_pan', v)} />
        </FieldGrid>
      </SettingsSection>

      {/* Bank Details */}
      <SettingsSection icon={<BankIcon />} title="Bank Details">
        <FieldGrid>
          <Field label="Bank Name" value={settings.invoice_bank_name} onChange={v => update('invoice_bank_name', v)} />
          <Field label="Account Number" value={settings.invoice_account_no} onChange={v => update('invoice_account_no', v)} />
          <Field label="IFSC Code" value={settings.invoice_ifsc} onChange={v => update('invoice_ifsc', v)} />
        </FieldGrid>
      </SettingsSection>

      {/* Tax Settings */}
      <SettingsSection icon={<TaxIcon />} title="Tax Settings">
        <FieldGrid>
          <Field label="CGST Rate (%)" value={settings.invoice_cgst_rate} onChange={v => update('invoice_cgst_rate', v)} />
          <Field label="SGST Rate (%)" value={settings.invoice_sgst_rate} onChange={v => update('invoice_sgst_rate', v)} />
        </FieldGrid>
      </SettingsSection>

      {/* Invoice Customization */}
      <SettingsSection icon={<CustomIcon />} title="Invoice Customization">
        <FieldGrid>
          <Field label="Invoice Prefix" value={settings.invoice_prefix} onChange={v => update('invoice_prefix', v)} />
          <Field label="Place of Supply" value={settings.invoice_place_of_supply} onChange={v => update('invoice_place_of_supply', v)} />
          <Field label="Notes" value={settings.invoice_notes} onChange={v => update('invoice_notes', v)} multiline />
          <Field label="Terms & Conditions" value={settings.invoice_terms} onChange={v => update('invoice_terms', v)} multiline />
        </FieldGrid>
      </SettingsSection>

      {/* Appearance */}
      <SettingsSection icon={<PaletteIcon />} title="Appearance">
        <FieldGrid>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField size="small" label="Primary Color" fullWidth
              value={settings.invoice_primary_color || '#6366f1'}
              onChange={e => update('invoice_primary_color', e.target.value)} />
            <Box sx={{
              width: 40, height: 40, borderRadius: 1, flexShrink: 0,
              bgcolor: settings.invoice_primary_color || '#6366f1', border: '1px solid #ccc',
            }} />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField size="small" label="Accent Color" fullWidth
              value={settings.invoice_accent_color || '#ec4899'}
              onChange={e => update('invoice_accent_color', e.target.value)} />
            <Box sx={{
              width: 40, height: 40, borderRadius: 1, flexShrink: 0,
              bgcolor: settings.invoice_accent_color || '#ec4899', border: '1px solid #ccc',
            }} />
          </Box>
        </FieldGrid>
      </SettingsSection>

      {/* Sticky Save */}
      <Box sx={{
        position: 'fixed', bottom: 64, left: 0, right: 0,
        px: 2, py: 1.5, bgcolor: 'background.paper',
        borderTop: '1px solid', borderColor: 'divider',
        display: 'flex', gap: 1, zIndex: 1000,
      }}>
        <Button fullWidth variant="outlined" startIcon={previewing ? <CircularProgress size={16} /> : <PreviewIcon />}
          onClick={handlePreview} disabled={previewing} sx={{ borderRadius: 2 }}>
          Preview
        </Button>
        <Button fullWidth variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={handleSave} disabled={saving} sx={{ borderRadius: 2 }}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </Box>

      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack(s => ({ ...s, open: false }))}>
        <Alert severity={snack.sev} variant="filled" sx={{ width: '100%' }}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

/* ── Helper components ──────────────────────────────────────────────────── */

const SettingsSection: React.FC<{
  icon: React.ReactNode; title: string; defaultExpanded?: boolean; children: React.ReactNode;
}> = ({ icon, title, defaultExpanded, children }) => (
  <Accordion defaultExpanded={defaultExpanded} sx={{ borderRadius: '12px !important', mb: 2, '&:before': { display: 'none' } }}>
    <AccordionSummary expandIcon={<ExpandMore />}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {icon}
        <Typography fontWeight={700}>{title}</Typography>
      </Box>
    </AccordionSummary>
    <AccordionDetails sx={{ pt: 0 }}>{children}</AccordionDetails>
  </Accordion>
);

const FieldGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</Box>
);

const Field: React.FC<{
  label: string; value?: string; onChange: (v: string) => void; multiline?: boolean;
}> = ({ label, value, onChange, multiline }) => (
  <TextField size="small" label={label} fullWidth value={value || ''}
    onChange={e => onChange(e.target.value)} multiline={multiline} rows={multiline ? 3 : undefined} />
);
