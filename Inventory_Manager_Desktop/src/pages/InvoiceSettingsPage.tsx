import React, { useEffect, useState, useRef } from 'react';
import {
    Box, Typography, Paper, Button, Alert, CircularProgress,
    Card, CardContent, TextField, Grid, IconButton,
    Tooltip
} from '@mui/material';
import {
    Save as SaveIcon,
    CloudUpload as UploadIcon,
    Business as BusinessIcon,
    AccountBalance as BankIcon,
    Palette as PaletteIcon,
    Description as TermsIcon,
    Draw as SignatureIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material';
import { getInvoiceSettings, updateInvoiceSettings, type InvoiceSettings } from '../services/invoiceService';

// ============================================================================
// STYLING CONSTANTS
// ============================================================================

const styles = {
    pageContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        pb: 4
    },
    headerTitle: {
        fontWeight: 800,
        color: '#1e293b',
        mb: 1,
        letterSpacing: '-0.5px'
    },
    gradientCard: {
        background: 'linear-gradient(135deg, #1a56db 0%, #1e40af 100%)',
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 10px 30px -10px rgba(26, 86, 219, 0.5)',
        borderRadius: 4,
    },
    glassIconBox: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: '16px',
        p: 1.5,
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)'
    },
    sectionCard: {
        borderRadius: 3,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        overflow: 'hidden'
    },
    sectionHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        mb: 2,
        pb: 1.5,
        borderBottom: '1px solid #e2e8f0'
    },
    sectionIcon: {
        p: 1,
        borderRadius: 2,
        display: 'flex'
    },
    uploadBox: {
        border: '2px dashed #cbd5e1',
        borderRadius: 2,
        p: 3,
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s',
        '&:hover': {
            borderColor: '#1a56db',
            backgroundColor: '#f8fafc'
        }
    },
    previewImage: {
        maxWidth: '100%',
        maxHeight: 100,
        objectFit: 'contain' as const,
        borderRadius: 1,
        border: '1px solid #e2e8f0'
    },
    colorInput: {
        width: 60,
        height: 40,
        padding: 0,
        border: 'none',
        borderRadius: 1,
        cursor: 'pointer'
    },
    saveButton: {
        bgcolor: '#1a56db',
        color: 'white',
        px: 4,
        py: 1.5,
        borderRadius: 2,
        fontWeight: 600,
        textTransform: 'none',
        '&:hover': {
            bgcolor: '#1e40af',
            transform: 'translateY(-1px)',
            boxShadow: '0 4px 12px rgba(26, 86, 219, 0.3)'
        },
        transition: 'all 0.2s'
    }
};

// ============================================================================
// COMPONENT
// ============================================================================

export const InvoiceSettingsPage: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [settings, setSettings] = useState<InvoiceSettings>({
        invoice_company_name: '',
        invoice_address: '',
        invoice_phone: '',
        invoice_email: '',
        invoice_website: '',
        invoice_gstin: '',
        invoice_pan: '',
        invoice_bank_name: '',
        invoice_account_no: '',
        invoice_ifsc: '',
        invoice_signatory_name: '',
        invoice_primary_color: '#1a56db',
        invoice_accent_color: '#f97316',
        invoice_cgst_rate: '9',
        invoice_sgst_rate: '9',
        invoice_discount_enabled: 'false',
        invoice_discount_percent: '0',
        invoice_show_ship_to: 'true',
        invoice_show_due_date: 'true',
        invoice_prefix: 'INV-',
        invoice_place_of_supply: '',
        invoice_notes: 'Thank you for your business!',
        invoice_terms: 'Payment due within 7 days.',
        invoice_logo: '',
        invoice_signature: ''
    });

    const logoInputRef = useRef<HTMLInputElement>(null);
    const signatureInputRef = useRef<HTMLInputElement>(null);

    // Load settings on mount
    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const data = await getInvoiceSettings();
            setSettings(prev => ({
                ...prev,
                ...data,
                // Use business_name as fallback for invoice_company_name
                invoice_company_name: data.invoice_company_name || data.business_name || '',
                invoice_phone: data.invoice_phone || data.business_phone || '',
                invoice_email: data.invoice_email || data.business_email || ''
            }));
        } catch (err) {
            console.error('Failed to load settings:', err);
            setMessage({ type: 'error', text: 'Failed to load invoice settings' });
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field: keyof InvoiceSettings) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        setSettings(prev => ({
            ...prev,
            [field]: e.target.value
        }));
    };

    const handleImageUpload = (field: 'invoice_logo' | 'invoice_signature', maxWidth: number, maxHeight: number) => (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setMessage({ type: 'error', text: 'Please upload an image file' });
            return;
        }

        if (file.size > 1024 * 1024) {
            setMessage({ type: 'error', text: 'Image must be less than 1MB' });
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // Resize if needed
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);

                const resizedDataUrl = canvas.toDataURL('image/png');
                setSettings(prev => ({
                    ...prev,
                    [field]: resizedDataUrl
                }));
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveImage = (field: 'invoice_logo' | 'invoice_signature') => {
        setSettings(prev => ({
            ...prev,
            [field]: ''
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);

        try {
            // Prepare settings object (only non-empty values)
            const settingsToSave: Record<string, string> = {};
            Object.entries(settings).forEach(([key, value]) => {
                if (key.startsWith('invoice_') && value !== undefined) {
                    settingsToSave[key] = value;
                }
            });

            await updateInvoiceSettings(settingsToSave);
            setMessage({ type: 'success', text: 'Invoice settings saved successfully!' });
        } catch (err) {
            console.error('Failed to save settings:', err);
            setMessage({ type: 'error', text: 'Failed to save invoice settings' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={styles.pageContainer}>
            {/* Header */}
            <Box>
                <Typography variant="h4" sx={styles.headerTitle}>
                    📄 Invoice Settings
                </Typography>
                <Typography variant="body1" sx={{ color: '#64748b', maxWidth: 700 }}>
                    Customize your invoice appearance, company details, and payment information.
                </Typography>
            </Box>

            {/* Hero Card */}
            <Card sx={styles.gradientCard}>
                <CardContent sx={{ p: 4 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
                                <Box sx={styles.glassIconBox}>
                                    <BusinessIcon fontSize="large" sx={{ color: 'white' }} />
                                </Box>
                                <Typography variant="h5" fontWeight="800" sx={{ textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                                    Professional GST Invoice
                                </Typography>
                            </Box>
                            <Typography variant="body1" sx={{ opacity: 0.9, maxWidth: 500, lineHeight: 1.6 }}>
                                Configure your company logo, contact details, bank information, and signature for professional A4 invoices.
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <Tooltip title="Reload settings">
                                <IconButton onClick={loadSettings} sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.15)' }}>
                                    <RefreshIcon />
                                </IconButton>
                            </Tooltip>
                            <Button
                                variant="contained"
                                size="large"
                                startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                                onClick={handleSave}
                                disabled={saving}
                                sx={{
                                    bgcolor: 'white',
                                    color: '#1a56db',
                                    '&:hover': { bgcolor: '#f8fafc' },
                                    fontWeight: 700,
                                    px: 4,
                                    py: 1.5,
                                    borderRadius: 50,
                                    textTransform: 'none'
                                }}
                            >
                                {saving ? 'Saving...' : 'Save Settings'}
                            </Button>
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            {/* Alert Messages */}
            {message && (
                <Alert severity={message.type} onClose={() => setMessage(null)} sx={{ borderRadius: 2 }}>
                    {message.text}
                </Alert>
            )}

            {/* Company Information Section */}
            <Paper sx={styles.sectionCard}>
                <CardContent sx={{ p: 3 }}>
                    <Box sx={styles.sectionHeader}>
                        <Box sx={{ ...styles.sectionIcon, bgcolor: '#dbeafe' }}>
                            <BusinessIcon sx={{ color: '#1a56db' }} />
                        </Box>
                        <Typography variant="h6" fontWeight={700} color="#1e293b">
                            Company Information
                        </Typography>
                    </Box>

                    <Grid container spacing={3}>
                        {/* Logo Upload */}
                        <Grid size={{ xs: 12, md: 4 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, color: '#475569', fontWeight: 600 }}>
                                Company Logo
                            </Typography>
                            <input
                                type="file"
                                ref={logoInputRef}
                                onChange={handleImageUpload('invoice_logo', 200, 80)}
                                accept="image/*"
                                style={{ display: 'none' }}
                            />
                            {settings.invoice_logo ? (
                                <Box sx={{ position: 'relative', display: 'inline-block' }}>
                                    <img src={settings.invoice_logo} alt="Logo" style={styles.previewImage} />
                                    <IconButton
                                        size="small"
                                        onClick={() => handleRemoveImage('invoice_logo')}
                                        sx={{
                                            position: 'absolute',
                                            top: -8,
                                            right: -8,
                                            bgcolor: '#ef4444',
                                            color: 'white',
                                            '&:hover': { bgcolor: '#dc2626' }
                                        }}
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            ) : (
                                <Box sx={styles.uploadBox} onClick={() => logoInputRef.current?.click()}>
                                    <UploadIcon sx={{ fontSize: 40, color: '#94a3b8', mb: 1 }} />
                                    <Typography variant="body2" color="text.secondary">
                                        Click to upload logo
                                    </Typography>
                                    <Typography variant="caption" color="text.disabled">
                                        Max 200×80px, PNG/JPG
                                    </Typography>
                                </Box>
                            )}
                        </Grid>

                        {/* Company Details */}
                        <Grid size={{ xs: 12, md: 8 }}>
                            <Grid container spacing={2}>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <TextField
                                        fullWidth
                                        label="Company Name"
                                        value={settings.invoice_company_name}
                                        onChange={handleChange('invoice_company_name')}
                                        size="small"
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <TextField
                                        fullWidth
                                        label="GSTIN"
                                        value={settings.invoice_gstin}
                                        onChange={handleChange('invoice_gstin')}
                                        size="small"
                                        placeholder="22AAAAA0000A1Z5"
                                    />
                                </Grid>
                                <Grid size={{ xs: 12 }}>
                                    <TextField
                                        fullWidth
                                        label="Address"
                                        value={settings.invoice_address}
                                        onChange={handleChange('invoice_address')}
                                        size="small"
                                        multiline
                                        rows={2}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, md: 4 }}>
                                    <TextField
                                        fullWidth
                                        label="Phone"
                                        value={settings.invoice_phone}
                                        onChange={handleChange('invoice_phone')}
                                        size="small"
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, md: 4 }}>
                                    <TextField
                                        fullWidth
                                        label="Email"
                                        value={settings.invoice_email}
                                        onChange={handleChange('invoice_email')}
                                        size="small"
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, md: 4 }}>
                                    <TextField
                                        fullWidth
                                        label="Website"
                                        value={settings.invoice_website}
                                        onChange={handleChange('invoice_website')}
                                        size="small"
                                        placeholder="www.company.com"
                                    />
                                </Grid>
                            </Grid>
                        </Grid>
                    </Grid>
                </CardContent>
            </Paper>

            {/* Bank Details Section */}
            <Paper sx={styles.sectionCard}>
                <CardContent sx={{ p: 3 }}>
                    <Box sx={styles.sectionHeader}>
                        <Box sx={{ ...styles.sectionIcon, bgcolor: '#dcfce7' }}>
                            <BankIcon sx={{ color: '#16a34a' }} />
                        </Box>
                        <Typography variant="h6" fontWeight={700} color="#1e293b">
                            Bank / Payment Details
                        </Typography>
                    </Box>

                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <TextField
                                fullWidth
                                label="Bank Name"
                                value={settings.invoice_bank_name}
                                onChange={handleChange('invoice_bank_name')}
                                size="small"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <TextField
                                fullWidth
                                label="Account Number"
                                value={settings.invoice_account_no}
                                onChange={handleChange('invoice_account_no')}
                                size="small"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <TextField
                                fullWidth
                                label="IFSC Code"
                                value={settings.invoice_ifsc}
                                onChange={handleChange('invoice_ifsc')}
                                size="small"
                            />
                        </Grid>
                    </Grid>
                </CardContent>
            </Paper>

            {/* Tax Settings Section (India GST) */}
            <Paper sx={styles.sectionCard}>
                <CardContent sx={{ p: 3 }}>
                    <Box sx={styles.sectionHeader}>
                        <Box sx={{ ...styles.sectionIcon, bgcolor: '#fef3c7' }}>
                            <TermsIcon sx={{ color: '#d97706' }} />
                        </Box>
                        <Typography variant="h6" fontWeight={700} color="#1e293b">
                            Tax Settings (GST India)
                        </Typography>
                    </Box>

                    <Grid container spacing={3}>
                        <Grid size={{ xs: 12, md: 3 }}>
                            <TextField
                                fullWidth
                                label="CGST Rate (%)"
                                type="number"
                                value={settings.invoice_cgst_rate}
                                onChange={handleChange('invoice_cgst_rate')}
                                size="small"
                                inputProps={{ min: 0, max: 50, step: 0.5 }}
                                helperText="Central GST"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 3 }}>
                            <TextField
                                fullWidth
                                label="SGST Rate (%)"
                                type="number"
                                value={settings.invoice_sgst_rate}
                                onChange={handleChange('invoice_sgst_rate')}
                                size="small"
                                inputProps={{ min: 0, max: 50, step: 0.5 }}
                                helperText="State GST"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                                <input
                                    type="checkbox"
                                    id="discount-toggle"
                                    checked={settings.invoice_discount_enabled === 'true'}
                                    onChange={(e) => setSettings(prev => ({
                                        ...prev,
                                        invoice_discount_enabled: e.target.checked ? 'true' : 'false'
                                    }))}
                                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                                />
                                <label htmlFor="discount-toggle" style={{ cursor: 'pointer', fontSize: '0.9rem', color: '#475569' }}>
                                    Enable Discount
                                </label>
                            </Box>
                        </Grid>
                        <Grid size={{ xs: 12, md: 3 }}>
                            <TextField
                                fullWidth
                                label="Discount (%)"
                                type="number"
                                value={settings.invoice_discount_percent}
                                onChange={handleChange('invoice_discount_percent')}
                                size="small"
                                disabled={settings.invoice_discount_enabled !== 'true'}
                                inputProps={{ min: 0, max: 100, step: 1 }}
                                helperText="Applied before GST"
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mt: 2, pt: 2, borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <input
                                        type="checkbox"
                                        id="ship-to-toggle"
                                        checked={settings.invoice_show_ship_to === 'true'}
                                        onChange={(e) => setSettings(prev => ({
                                            ...prev,
                                            invoice_show_ship_to: e.target.checked ? 'true' : 'false'
                                        }))}
                                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                                    />
                                    <label htmlFor="ship-to-toggle" style={{ cursor: 'pointer', fontSize: '0.9rem', color: '#475569' }}>
                                        Show "Ship To"
                                    </label>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <input
                                        type="checkbox"
                                        id="due-date-toggle"
                                        checked={settings.invoice_show_due_date === 'true'}
                                        onChange={(e) => setSettings(prev => ({
                                            ...prev,
                                            invoice_show_due_date: e.target.checked ? 'true' : 'false'
                                        }))}
                                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                                    />
                                    <label htmlFor="due-date-toggle" style={{ cursor: 'pointer', fontSize: '0.9rem', color: '#475569' }}>
                                        Show "Due Date"
                                    </label>
                                </Box>
                            </Box>
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <TextField
                                fullWidth
                                label="Invoice Prefix"
                                value={settings.invoice_prefix}
                                onChange={handleChange('invoice_prefix')}
                                size="small"
                                placeholder="e.g., INV-, ABC/, TAX-"
                                helperText="Prefix for invoice numbers"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 8 }}>
                            <TextField
                                fullWidth
                                label="Place of Supply"
                                value={settings.invoice_place_of_supply}
                                onChange={handleChange('invoice_place_of_supply')}
                                size="small"
                                placeholder="e.g., Maharashtra, Delhi, Karnataka"
                                helperText="State name for GST compliance"
                            />
                        </Grid>
                    </Grid>
                </CardContent>
            </Paper>

            {/* Signature Section */}
            <Paper sx={styles.sectionCard}>
                <CardContent sx={{ p: 3 }}>
                    <Box sx={styles.sectionHeader}>
                        <Box sx={{ ...styles.sectionIcon, bgcolor: '#fef3c7' }}>
                            <SignatureIcon sx={{ color: '#d97706' }} />
                        </Box>
                        <Typography variant="h6" fontWeight={700} color="#1e293b">
                            Authorized Signature
                        </Typography>
                    </Box>

                    <Grid container spacing={3}>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, color: '#475569', fontWeight: 600 }}>
                                Signature Image
                            </Typography>
                            <input
                                type="file"
                                ref={signatureInputRef}
                                onChange={handleImageUpload('invoice_signature', 150, 60)}
                                accept="image/*"
                                style={{ display: 'none' }}
                            />
                            {settings.invoice_signature ? (
                                <Box sx={{ position: 'relative', display: 'inline-block' }}>
                                    <img src={settings.invoice_signature} alt="Signature" style={{ ...styles.previewImage, maxHeight: 60 }} />
                                    <IconButton
                                        size="small"
                                        onClick={() => handleRemoveImage('invoice_signature')}
                                        sx={{
                                            position: 'absolute',
                                            top: -8,
                                            right: -8,
                                            bgcolor: '#ef4444',
                                            color: 'white',
                                            '&:hover': { bgcolor: '#dc2626' }
                                        }}
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            ) : (
                                <Box sx={styles.uploadBox} onClick={() => signatureInputRef.current?.click()}>
                                    <SignatureIcon sx={{ fontSize: 32, color: '#94a3b8', mb: 1 }} />
                                    <Typography variant="body2" color="text.secondary">
                                        Upload signature
                                    </Typography>
                                    <Typography variant="caption" color="text.disabled">
                                        Max 150×60px
                                    </Typography>
                                </Box>
                            )}
                        </Grid>
                        <Grid size={{ xs: 12, md: 8 }}>
                            <TextField
                                fullWidth
                                label="Signatory Name"
                                value={settings.invoice_signatory_name}
                                onChange={handleChange('invoice_signatory_name')}
                                size="small"
                                helperText="Name displayed below signature"
                            />
                        </Grid>
                    </Grid>
                </CardContent>
            </Paper>

            {/* Appearance Section */}
            <Paper sx={styles.sectionCard}>
                <CardContent sx={{ p: 3 }}>
                    <Box sx={styles.sectionHeader}>
                        <Box sx={{ ...styles.sectionIcon, bgcolor: '#fae8ff' }}>
                            <PaletteIcon sx={{ color: '#a855f7' }} />
                        </Box>
                        <Typography variant="h6" fontWeight={700} color="#1e293b">
                            Appearance
                        </Typography>
                    </Box>

                    <Grid container spacing={3}>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, color: '#475569', fontWeight: 600 }}>
                                Primary Color (Headers)
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <input
                                    type="color"
                                    value={settings.invoice_primary_color}
                                    onChange={(e) => setSettings(prev => ({ ...prev, invoice_primary_color: e.target.value }))}
                                    style={styles.colorInput}
                                />
                                <TextField
                                    size="small"
                                    value={settings.invoice_primary_color}
                                    onChange={handleChange('invoice_primary_color')}
                                    sx={{ width: 120 }}
                                />
                            </Box>
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, color: '#475569', fontWeight: 600 }}>
                                Accent Color (Total Box)
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <input
                                    type="color"
                                    value={settings.invoice_accent_color}
                                    onChange={(e) => setSettings(prev => ({ ...prev, invoice_accent_color: e.target.value }))}
                                    style={styles.colorInput}
                                />
                                <TextField
                                    size="small"
                                    value={settings.invoice_accent_color}
                                    onChange={handleChange('invoice_accent_color')}
                                    sx={{ width: 120 }}
                                />
                            </Box>
                        </Grid>
                    </Grid>
                </CardContent>
            </Paper>

            {/* Terms & Notes Section */}
            <Paper sx={styles.sectionCard}>
                <CardContent sx={{ p: 3 }}>
                    <Box sx={styles.sectionHeader}>
                        <Box sx={{ ...styles.sectionIcon, bgcolor: '#e0f2fe' }}>
                            <TermsIcon sx={{ color: '#0284c7' }} />
                        </Box>
                        <Typography variant="h6" fontWeight={700} color="#1e293b">
                            Terms & Notes
                        </Typography>
                    </Box>

                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="Default Notes"
                                value={settings.invoice_notes}
                                onChange={handleChange('invoice_notes')}
                                size="small"
                                multiline
                                rows={3}
                                helperText="Displayed in Notes section"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="Terms & Conditions"
                                value={settings.invoice_terms}
                                onChange={handleChange('invoice_terms')}
                                size="small"
                                multiline
                                rows={3}
                                helperText="Payment terms and conditions"
                            />
                        </Grid>
                    </Grid>
                </CardContent>
            </Paper>

            {/* Bottom Save Button */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 2 }}>
                <Button
                    variant="contained"
                    size="large"
                    startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                    onClick={handleSave}
                    disabled={saving}
                    sx={styles.saveButton}
                >
                    {saving ? 'Saving...' : 'Save All Settings'}
                </Button>
            </Box>
        </Box>
    );
};

export default InvoiceSettingsPage;
