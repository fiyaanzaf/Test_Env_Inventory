import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, MenuItem, Alert, Box, Typography,
  Chip, RadioGroup, FormControlLabel, Radio, Tooltip 
} from '@mui/material';
import { Delete as DeleteIcon, SwapHoriz, AddCircle } from '@mui/icons-material';
import { assignRole, removeRole, switchRole, type User } from '../services/userService';
import { useAuthStore } from '../store/authStore'; // <--- 1. Import Auth Store

interface AssignRoleDialogProps {
  open: boolean;
  onClose: () => void;
  selectedUser: User | null; 
  onSuccess: () => void;
}

const ALL_ROLES = ['manager', 'employee', 'it_admin', 'customer'];

export const AssignRoleDialog: React.FC<AssignRoleDialogProps> = ({ open, onClose, selectedUser, onSuccess }) => {
  const [role, setRole] = useState('');
  const [mode, setMode] = useState<'add' | 'switch'>('add');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [localRoles, setLocalRoles] = useState<string[]>([]);

  // 2. Get the currently logged-in user to check if they are Owner
  const { user: currentUser } = useAuthStore();
  const isOwner = currentUser?.roles.includes('owner');

  useEffect(() => {
    if (selectedUser) {
      setLocalRoles(selectedUser.roles);
      setRole('');
      setError('');
      
      // If target is manager, force "Add" mode UNLESS you are Owner
      if (selectedUser.roles.includes('manager') && !isOwner) {
        setMode('add');
      }
    }
  }, [selectedUser, open, isOwner]);

  const isTargetManager = localRoles.includes('manager');

  // 3. Logic: Controls are locked if target is Manager AND you are NOT Owner
  const isLocked = isTargetManager && !isOwner;

  const handleSubmit = async () => {
    if (!selectedUser) return;
    setLoading(true);
    setError('');
    try {
      if (mode === 'add') {
        await assignRole(selectedUser.username, role);
      } else {
        await switchRole(selectedUser.username, role);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Action failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRole = async (roleToRemove: string) => {
    if (!selectedUser) return;
    
    // 4. Guard: Allow removal if role is NOT manager, OR if you are Owner
    if (roleToRemove === 'manager' && !isOwner) return; 

    if (!window.confirm(`Are you sure you want to remove '${roleToRemove}' from ${selectedUser.username}?`)) return;

    setLoading(true);
    try {
      await removeRole(selectedUser.username, roleToRemove);
      setLocalRoles(prev => prev.filter(r => r !== roleToRemove));
      onSuccess(); 
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to remove role");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h5" fontWeight="700">
          Manage Roles: {selectedUser?.username}
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
          
          {/* Active Roles Chips */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Current Active Roles
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {localRoles.length === 0 && <Typography variant="body2" color="text.disabled">No roles assigned</Typography>}
              {localRoles.map(r => {
                // Logic: Can delete if NOT manager, OR if I am Owner
                const canDelete = r !== 'manager' || isOwner;
                
                return (
                  <Chip 
                    key={r}
                    label={r}
                    color={r === 'manager' ? 'secondary' : 'default'}
                    // 5. Conditionally show the delete X
                    onDelete={canDelete ? () => handleRemoveRole(r) : undefined}
                    deleteIcon={
                      <Tooltip title="Remove Role">
                        <DeleteIcon />
                      </Tooltip>
                    }
                    sx={{ fontWeight: 600, textTransform: 'capitalize' }}
                  />
                );
              })}
            </Box>
            {isTargetManager && !isOwner && (
              <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
                * Manager role cannot be modified (Owner access required).
              </Typography>
            )}
            {isTargetManager && isOwner && (
                <Typography variant="caption" color="success.main" sx={{ mt: 1, display: 'block', fontWeight: 'bold' }}>
                * Owner Access: You may modify Manager roles.
              </Typography>
            )}
          </Box>

          <Box sx={{ borderTop: '1px solid #e2e8f0' }} />

          {/* Action Mode */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Choose Action
            </Typography>
            <RadioGroup 
              row 
              value={mode} 
              onChange={(e) => setMode(e.target.value as 'add' | 'switch')}
            >
              <FormControlLabel 
                value="add" 
                control={<Radio />} 
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AddCircle fontSize="small" color="primary" />
                    <Typography variant="body2" fontWeight="600">Add Role</Typography>
                  </Box>
                } 
              />
              <FormControlLabel 
                value="switch" 
                disabled={isLocked} // 6. Only locked if Manager AND not Owner
                control={<Radio />} 
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: isLocked ? 0.5 : 1 }}>
                    <SwapHoriz fontSize="small" color={isLocked ? "disabled" : "warning"} />
                    <Typography variant="body2" fontWeight="600">Switch Role</Typography>
                  </Box>
                } 
              />
            </RadioGroup>
            {isLocked && mode === 'switch' && (
              <Alert severity="warning" sx={{ mt: 1, py: 0 }}>Cannot switch roles for Managers.</Alert>
            )}
          </Box>

          {/* Role Selector */}
          <TextField
            select
            label={mode === 'add' ? "Select Role to Add" : "Select New Single Role"}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            fullWidth
            helperText={mode === 'add' ? "This will be added to existing roles." : "WARNING: This will remove all other roles."}
          >
            {ALL_ROLES.map((r) => (
                <MenuItem key={r} value={r} sx={{ textTransform: 'capitalize' }}>
                  {r.replace('_', ' ')}
                </MenuItem>
            ))}
          </TextField>
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          disabled={loading || !role}
          color={mode === 'switch' ? "warning" : "primary"}
          sx={{ px: 4, fontWeight: 600 }}
        >
          {loading ? 'Processing...' : (mode === 'add' ? 'Add Role' : 'Switch Role')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};