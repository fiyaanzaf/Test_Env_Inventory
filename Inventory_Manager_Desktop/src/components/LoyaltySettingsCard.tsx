import React, { useState, useEffect } from 'react';
import {
    Card, CardContent, Typography, Box, TextField, Button,
    CircularProgress, Alert, Chip, InputAdornment
} from '@mui/material';
import { Star as StarIcon, Save as SaveIcon } from '@mui/icons-material';
import { getLoyaltySettings, updateLoyaltySettings, type LoyaltySettings } from '../services/loyaltyService';

interface LoyaltySettingsCardProps {
    userRole?: string; // 'manager' | 'owner' | 'employee' etc.
}

export const LoyaltySettingsCard: React.FC<LoyaltySettingsCardProps> = ({ userRole }) => {
    const [settings, setSettings] = useState<LoyaltySettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Form state
    const [earnPerRupees, setEarnPerRupees] = useState<number>(50);
    const [redeemValue, setRedeemValue] = useState<number>(1);

    // Check if user can edit (manager or owner)
    const canEdit = userRole === 'manager' || userRole === 'owner';

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const data = await getLoyaltySettings();
            setSettings(data);
            setEarnPerRupees(data.earn_per_rupees);
            setRedeemValue(data.redeem_value);
        } catch (err) {
            console.error('Failed to load loyalty settings:', err);
            setMessage({ type: 'error', text: 'Failed to load settings' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            await updateLoyaltySettings({
                earn_per_rupees: earnPerRupees,
                redeem_value: redeemValue
            });
            setMessage({ type: 'success', text: 'Loyalty settings updated successfully!' });
            // Reload to confirm
            loadSettings();
        } catch (err: any) {
            const errorMsg = err.response?.data?.detail || 'Failed to update settings';
            setMessage({ type: 'error', text: errorMsg });
        } finally {
            setSaving(false);
        }
    };

    const hasChanges = settings && (
        earnPerRupees !== settings.earn_per_rupees ||
        redeemValue !== settings.redeem_value
    );

    if (loading) {
        return (
            <Card sx={{ borderRadius: 3, p: 3, textAlign: 'center' }}>
                <CircularProgress />
            </Card>
        );
    }

    return (
        <Card sx={{
            borderRadius: 3,
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            boxShadow: '0 4px 20px -5px rgba(251, 191, 36, 0.4)'
        }}>
            <CardContent sx={{ p: 3 }}>
                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                    <Box sx={{
                        bgcolor: 'rgba(245, 158, 11, 0.2)',
                        p: 1.5,
                        borderRadius: 2,
                        display: 'flex'
                    }}>
                        <StarIcon sx={{ fontSize: 28, color: '#d97706' }} />
                    </Box>
                    <Box>
                        <Typography variant="h6" fontWeight={700} sx={{ color: '#92400e' }}>
                            Loyalty Program Settings
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#a16207' }}>
                            Configure how customers earn and redeem points
                        </Typography>
                    </Box>
                </Box>

                {/* Settings Form */}
                <Box sx={{
                    bgcolor: 'white',
                    borderRadius: 2,
                    p: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3
                }}>
                    {/* Earn Rate */}
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: '#475569' }}>
                            Points Earning Rate
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Chip label="1 point" size="small" color="warning" variant="outlined" />
                            <Typography variant="body2" color="text.secondary">per every</Typography>
                            <TextField
                                type="number"
                                size="small"
                                value={earnPerRupees}
                                onChange={(e) => setEarnPerRupees(Math.max(1, parseInt(e.target.value) || 1))}
                                disabled={!canEdit}
                                sx={{ width: 100 }}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">₹</InputAdornment>
                                }}
                                inputProps={{ min: 1 }}
                            />
                            <Typography variant="body2" color="text.secondary">spent</Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                            Example: Customer spends ₹500 → earns {Math.floor(500 / earnPerRupees)} points
                        </Typography>
                    </Box>

                    {/* Redeem Rate */}
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: '#475569' }}>
                            Points Redemption Value
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Chip label="1 point" size="small" color="success" variant="outlined" />
                            <Typography variant="body2" color="text.secondary">=</Typography>
                            <TextField
                                type="number"
                                size="small"
                                value={redeemValue}
                                onChange={(e) => setRedeemValue(Math.max(0.1, parseFloat(e.target.value) || 1))}
                                disabled={!canEdit}
                                sx={{ width: 100 }}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">₹</InputAdornment>
                                }}
                                inputProps={{ min: 0.1, step: 0.5 }}
                            />
                            <Typography variant="body2" color="text.secondary">discount</Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                            Example: Customer redeems 100 points → gets ₹{100 * redeemValue} off
                        </Typography>
                    </Box>

                    {/* Save Button */}
                    {canEdit && (
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 1 }}>
                            {hasChanges && (
                                <Button
                                    variant="text"
                                    onClick={loadSettings}
                                    disabled={saving}
                                >
                                    Cancel
                                </Button>
                            )}
                            <Button
                                variant="contained"
                                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                                onClick={handleSave}
                                disabled={saving || !hasChanges}
                                sx={{
                                    bgcolor: '#d97706',
                                    '&:hover': { bgcolor: '#b45309' },
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    px: 3
                                }}
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </Box>
                    )}

                    {!canEdit && (
                        <Alert severity="info" sx={{ mt: 1 }}>
                            Only Managers and Owners can modify loyalty settings.
                        </Alert>
                    )}
                </Box>

                {/* Status Message */}
                {message && (
                    <Alert
                        severity={message.type}
                        onClose={() => setMessage(null)}
                        sx={{ mt: 2, borderRadius: 2 }}
                    >
                        {message.text}
                    </Alert>
                )}
            </CardContent>
        </Card>
    );
};

export default LoyaltySettingsCard;
