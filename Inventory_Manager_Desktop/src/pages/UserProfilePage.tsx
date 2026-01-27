import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    TextField,
    Button,
    Grid,
    Alert,
    Snackbar,
    Divider,
    InputAdornment,
    CircularProgress
} from '@mui/material';
import {
    Person as PersonIcon,
    Email as EmailIcon,
    Phone as PhoneIcon,
    Lock as LockIcon,
    Save as SaveIcon
} from '@mui/icons-material';
import { useAuthStore } from '../store/authStore';
import { updateProfile } from '../services/userService';

// Helper to fetch current user details if not fully available in store
import client from '../api/client';

export const UserProfilePage: React.FC = () => {
    const { user, checkAuth } = useAuthStore();

    // Form State
    const [email, setEmail] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // UI State
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [securityError, setSecurityError] = useState('');

    // Load initial data
    useEffect(() => {
        if (user) {
            setEmail(user.email || '');
            // Phone number might not be in the initial user object if it wasn't there before
            // We can try to fetch the latest "me" or just rely on what we have.
            // Since we just added phone_number to backend response of /me, let's fetch it to be sure.
            fetchLatestProfile();
        }
    }, [user]);

    const fetchLatestProfile = async () => {
        try {
            const token = localStorage.getItem('user_token');
            const res = await client.get('/api/v1/users/me', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data) {
                setEmail(res.data.email || '');
                setPhoneNumber(res.data.phone_number || '');
            }
        } catch (err) {
            console.error("Failed to fetch latest profile", err);
        }
    };

    const handleSave = async () => {
        setErrorMsg('');
        setSuccessMsg('');
        setSecurityError('');

        // Basic Validation
        if (password && password !== confirmPassword) {
            setSecurityError("New passwords do not match.");
            return;
        }

        if (password && !currentPassword) {
            setSecurityError("Current password is required to set a new password.");
            return;
        }

        setLoading(true);
        try {
            const updateData: any = {};
            if (email !== user?.email) updateData.email = email;
            if (phoneNumber) updateData.phone_number = phoneNumber;

            if (password) {
                updateData.password = password;
                updateData.current_password = currentPassword;
            }

            if (Object.keys(updateData).length === 0) {
                setLoading(false);
                return;
            }

            await updateProfile(updateData);

            setSuccessMsg("Profile updated successfully!");
            // Clear security fields
            setPassword('');
            setConfirmPassword('');
            setCurrentPassword('');

            // Refresh auth store to update UI context
            await checkAuth();

        } catch (err: any) {
            console.error(err);
            // Check if it's a security error (401/400 related to password)
            if (err.response?.status === 401 && err.response?.data?.detail?.includes("password")) {
                setSecurityError(err.response.data.detail);
            } else {
                setErrorMsg(err.response?.data?.detail || "Failed to update profile.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
            <Typography variant="h4" sx={{ mb: 4, fontWeight: 700, color: '#1e293b' }}>
                My Profile
            </Typography>

            <Grid container spacing={3}>
                {/* Left Column: Public Info */}
                <Grid size={{ xs: 12, md: 6 }}>
                    <Card sx={{ height: '100%', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                <PersonIcon sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                                <Box>
                                    <Typography variant="h6" fontWeight={600}>
                                        {user?.username}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                                        {user?.roles?.join(', ') || 'Staff'}
                                    </Typography>
                                </Box>
                            </Box>

                            <Divider sx={{ my: 2 }} />

                            <TextField
                                fullWidth
                                label="Email Address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                sx={{ mb: 3 }}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <EmailIcon color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                            />

                            <TextField
                                fullWidth
                                label="Phone Number"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <PhoneIcon color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </CardContent>
                    </Card>
                </Grid>

                {/* Right Column: Security */}
                <Grid size={{ xs: 12, md: 6 }}>
                    <Card sx={{ height: '100%', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                <LockIcon sx={{ fontSize: 30, color: 'warning.main', mr: 2 }} />
                                <Typography variant="h6" fontWeight={600}>
                                    Update Password
                                </Typography>
                            </Box>

                            {securityError && (
                                <Alert severity="error" sx={{ mb: 2 }}>
                                    {securityError}
                                </Alert>
                            )}

                            <Alert severity="info" sx={{ mb: 3 }}>
                                To change password, enter your current password first.
                            </Alert>

                            <TextField
                                fullWidth
                                type="password"
                                label="Current Password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                sx={{ mb: 3 }}
                            />

                            <TextField
                                fullWidth
                                type="password"
                                label="New Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                sx={{ mb: 3 }}
                            />

                            <TextField
                                fullWidth
                                type="password"
                                label="Confirm Password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                        </CardContent>
                    </Card>
                </Grid>

                {/* Bottom Actions */}
                <Grid size={{ xs: 12 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button
                            variant="contained"
                            size="large"
                            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                            onClick={handleSave}
                            disabled={loading}
                            sx={{
                                px: 4,
                                py: 1.5,
                                borderRadius: 2,
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            }}
                        >
                            {loading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </Box>
                </Grid>

            </Grid>

            <Snackbar open={!!successMsg} autoHideDuration={6000} onClose={() => setSuccessMsg('')}>
                <Alert onClose={() => setSuccessMsg('')} severity="success" sx={{ width: '100%' }}>
                    {successMsg}
                </Alert>
            </Snackbar>

            <Snackbar open={!!errorMsg} autoHideDuration={6000} onClose={() => setErrorMsg('')}>
                <Alert onClose={() => setErrorMsg('')} severity="error" sx={{ width: '100%' }}>
                    {errorMsg}
                </Alert>
            </Snackbar>
        </Box>
    );
};
