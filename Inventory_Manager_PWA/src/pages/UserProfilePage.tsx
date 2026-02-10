import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button,
  Avatar, Divider, Snackbar, Alert, CircularProgress,
} from '@mui/material';
import {
  Person as PersonIcon, Save as SaveIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { updateProfile } from '../services/userService';
import client from '../api/client';

export const UserProfilePage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });

  const showSnack = (msg: string, sev: 'success' | 'error' = 'success') => setSnack({ open: true, msg, sev });

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('user_token');
      const res = await client.get('/api/v1/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data;
      setUsername(data.username || '');
      setEmail(data.email || '');
      setPhoneNumber(data.phone_number || '');
    } catch {
      showSnack('Failed to load profile', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { fetchProfile(); }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const data: any = {};
      if (email) data.email = email;
      if (phoneNumber) data.phone_number = phoneNumber;
      await updateProfile(data);
      showSnack('Profile updated');
    } catch (e: any) {
      showSnack(e?.response?.data?.detail || 'Update failed', 'error');
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (!currentPassword) { showSnack('Enter current password', 'error'); return; }
    if (!password) { showSnack('Enter new password', 'error'); return; }
    if (password !== confirmPassword) { showSnack('Passwords do not match', 'error'); return; }
    if (password.length < 6) { showSnack('Password must be at least 6 characters', 'error'); return; }
    setSaving(true);
    try {
      await updateProfile({ current_password: currentPassword, password });
      showSnack('Password changed');
      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      showSnack(e?.response?.data?.detail || 'Password change failed', 'error');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>My Profile</Typography>

      {/* Avatar */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
        <Avatar sx={{ width: 80, height: 80, bgcolor: 'primary.main', fontSize: 32 }}>
          {username ? username[0].toUpperCase() : <PersonIcon sx={{ fontSize: 40 }} />}
        </Avatar>
      </Box>
      <Typography variant="h6" fontWeight={600} textAlign="center" sx={{ mb: 3 }}>{username}</Typography>

      {/* Profile Info Card */}
      <Card sx={{ borderRadius: 3, mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>Profile Information</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label="Email" size="small" type="email" fullWidth value={email}
              onChange={e => setEmail(e.target.value)} />
            <TextField label="Phone Number" size="small" fullWidth value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)} />
          </Box>
          <Button fullWidth variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={handleSaveProfile} disabled={saving} sx={{ mt: 2, borderRadius: 2 }}>
            Save Profile
          </Button>
        </CardContent>
      </Card>

      {/* Password Change Card */}
      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <LockIcon color="primary" />
            <Typography variant="subtitle2" fontWeight={700}>Change Password</Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label="Current Password" size="small" type="password" fullWidth
              value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
            <Divider />
            <TextField label="New Password" size="small" type="password" fullWidth
              value={password} onChange={e => setPassword(e.target.value)} />
            <TextField label="Confirm New Password" size="small" type="password" fullWidth
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              error={confirmPassword.length > 0 && password !== confirmPassword}
              helperText={confirmPassword.length > 0 && password !== confirmPassword ? 'Passwords do not match' : ''}
            />
          </Box>
          <Button fullWidth variant="outlined" startIcon={<LockIcon />}
            onClick={handleChangePassword} disabled={saving} sx={{ mt: 2, borderRadius: 2 }}>
            Change Password
          </Button>
        </CardContent>
      </Card>

      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack(s => ({ ...s, open: false }))}>
        <Alert severity={snack.sev} variant="filled" sx={{ width: '100%' }}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
};
