import React, { useEffect, useState } from 'react';
import {
  Box, Typography, CircularProgress, Card, CardContent,
  Chip, Tabs, Tab, Button, IconButton, Snackbar, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Fab, Switch,
} from '@mui/material';
import {
  People as PeopleIcon, PersonAdd as AddIcon,
  Refresh as RefreshIcon, Close as CloseIcon,
  AdminPanelSettings as RoleIcon,
} from '@mui/icons-material';
import {
  getAllUsers, toggleUserStatus, registerStaff,
  assignRole, removeRole, switchRole,
  type User,
} from '../services/userService';

const ROLES = ['admin', 'manager', 'billing', 'warehouse', 'viewer'];
const ROLE_COLORS: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'default'> = {
  admin: 'primary', manager: 'secondary', billing: 'success', warehouse: 'warning', viewer: 'info',
};

export const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0); // 0 = Staff, 1 = Customers
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });

  // Add Staff dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', role: 'billing', phone_number: '' });
  const [submitting, setSubmitting] = useState(false);

  // Role dialog
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });
  const [selectedRole, setSelectedRole] = useState('');

  const showSnack = (msg: string, sev: 'success' | 'error' = 'success') => setSnack({ open: true, msg, sev });

  const fetchUsers = async () => {
    setLoading(true);
    try { setUsers(await getAllUsers()); }
    catch { showSnack('Failed to load users', 'error'); }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const staffUsers = users.filter(u => u.roles.some(r => ['admin', 'manager', 'billing', 'warehouse', 'viewer'].includes(r)));
  const customerUsers = users.filter(u => u.roles.includes('customer') && !u.roles.some(r => ['admin', 'manager', 'billing', 'warehouse'].includes(r)));
  const displayedUsers = tab === 0 ? staffUsers : customerUsers;

  const handleToggle = async (username: string) => {
    try { await toggleUserStatus(username); showSnack('Status updated'); fetchUsers(); }
    catch { showSnack('Failed to toggle status', 'error'); }
  };

  const handleAddStaff = async () => {
    if (!newUser.username || !newUser.email || !newUser.password) { showSnack('Fill all required fields', 'error'); return; }
    setSubmitting(true);
    try {
      await registerStaff(newUser);
      showSnack('Staff registered');
      setAddOpen(false);
      setNewUser({ username: '', email: '', password: '', role: 'billing', phone_number: '' });
      fetchUsers();
    } catch (e: any) {
      showSnack(e?.response?.data?.detail || 'Registration failed', 'error');
    }
    setSubmitting(false);
  };

  const handleRemoveRole = async (username: string, role: string) => {
    try { await removeRole(username, role); showSnack('Role removed'); fetchUsers(); }
    catch { showSnack('Failed to remove role', 'error'); }
  };

  const handleAddRole = async () => {
    if (!roleDialog.user || !selectedRole) return;
    try {
      await assignRole(roleDialog.user.username, selectedRole);
      showSnack('Role assigned');
      setRoleDialog({ open: false, user: null });
      fetchUsers();
    } catch { showSnack('Failed to assign role', 'error'); }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 10, position: 'relative' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="h5" fontWeight={700}>Users</Typography>
        <IconButton onClick={fetchUsers}><RefreshIcon /></IconButton>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ mb: 2 }}>
        <Tab icon={<PeopleIcon />} label={`Staff (${staffUsers.length})`} iconPosition="start" sx={{ minHeight: 48, textTransform: 'none' }} />
        <Tab icon={<PeopleIcon />} label={`Customers (${customerUsers.length})`} iconPosition="start" sx={{ minHeight: 48, textTransform: 'none' }} />
      </Tabs>

      {displayedUsers.length === 0 ? (
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 4 }}>
          No {tab === 0 ? 'staff' : 'customers'} found.
        </Typography>
      ) : (
        displayedUsers.map(u => (
          <Card key={u.id} sx={{ mb: 1.5, borderRadius: 3, opacity: u.is_active ? 1 : 0.6 }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body1" fontWeight={600}>{u.username}</Typography>
                  <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                  {u.phone_number && (
                    <Typography variant="caption" display="block" color="text.secondary">{u.phone_number}</Typography>
                  )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label={u.is_active ? 'Active' : 'Inactive'} size="small"
                    color={u.is_active ? 'success' : 'default'} />
                  <Switch size="small" checked={u.is_active} onChange={() => handleToggle(u.username)} />
                </Box>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                {u.roles.map(r => (
                  <Chip key={r} label={r} size="small" color={ROLE_COLORS[r] || 'default'} variant="outlined"
                    onDelete={tab === 0 && u.roles.length > 1 ? () => handleRemoveRole(u.username, r) : undefined}
                    deleteIcon={<CloseIcon sx={{ fontSize: 14 }} />}
                  />
                ))}
                {tab === 0 && (
                  <Chip label="+ Role" size="small" variant="outlined" clickable
                    onClick={() => { setRoleDialog({ open: true, user: u }); setSelectedRole(''); }}
                    icon={<RoleIcon sx={{ fontSize: 14 }} />}
                  />
                )}
              </Box>
            </CardContent>
          </Card>
        ))
      )}

      {/* Add Staff FAB */}
      {tab === 0 && (
        <Fab color="primary" onClick={() => setAddOpen(true)}
          sx={{ position: 'fixed', bottom: 80, right: 20, zIndex: 1000 }}>
          <AddIcon />
        </Fab>
      )}

      {/* Add Staff Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add Staff</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Username" size="small" required value={newUser.username}
              onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))} />
            <TextField label="Email" size="small" type="email" required value={newUser.email}
              onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} />
            <TextField label="Phone" size="small" value={newUser.phone_number}
              onChange={e => setNewUser(u => ({ ...u, phone_number: e.target.value }))} />
            <TextField label="Password" size="small" type="password" required value={newUser.password}
              onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} />
            <TextField select label="Role" size="small" value={newUser.role}
              onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}>
              {ROLES.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddStaff} disabled={submitting}>
            {submitting ? 'Adding…' : 'Add Staff'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Role Assignment Dialog */}
      <Dialog open={roleDialog.open} onClose={() => setRoleDialog({ open: false, user: null })} fullWidth maxWidth="xs">
        <DialogTitle>Assign Role to {roleDialog.user?.username}</DialogTitle>
        <DialogContent>
          <TextField select fullWidth label="Role" size="small" value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)} sx={{ mt: 1 }}>
            {ROLES.filter(r => !roleDialog.user?.roles.includes(r)).map(r => (
              <MenuItem key={r} value={r}>{r}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleDialog({ open: false, user: null })}>Cancel</Button>
          <Button variant="contained" onClick={handleAddRole} disabled={!selectedRole}>Assign</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack(s => ({ ...s, open: false }))}>
        <Alert severity={snack.sev} variant="filled" sx={{ width: '100%' }}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
};
