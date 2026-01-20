import React, { useState } from 'react';
import { 
    Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, Button, MenuItem, Box, Alert, CircularProgress 
} from '@mui/material';
import client from '../api/client';

interface Props {
    open: boolean;
    onClose: () => void;
}

export const ReportIssueDialog: React.FC<Props> = ({ open, onClose }) => {
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState('medium');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async () => {
        if (!message.trim()) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('user_token');
            await client.post('/api/v1/system/alerts/report', 
                { message, severity },
                { headers: { Authorization: `Bearer ${token}` }}
            );
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setMessage('');
                onClose();
            }, 1500);
        } catch (err) {
            console.error(err);
            alert("Failed to submit report");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>📢 Report an Issue</DialogTitle>
            <DialogContent>
                {success ? (
                    <Alert severity="success">Report submitted successfully!</Alert>
                ) : (
                    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField
                            select
                            label="Issue Type"
                            value={severity}
                            onChange={(e) => setSeverity(e.target.value)}
                            fullWidth
                            size="small"
                        >
                            <MenuItem value="low">Suggestion / Low Priority</MenuItem>
                            <MenuItem value="medium">Bug / Glitch</MenuItem>
                            <MenuItem value="critical">System Failure / Critical</MenuItem>
                        </TextField>
                        <TextField
                            label="Describe the issue..."
                            multiline
                            rows={4}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            fullWidth
                            placeholder="e.g., The tabs on the inventory page are not loading..."
                        />
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                {!success && (
                    <>
                        <Button onClick={onClose} color="inherit">Cancel</Button>
                        <Button 
                            onClick={handleSubmit} 
                            variant="contained" 
                            color="error" 
                            disabled={loading || !message}
                        >
                            {loading ? <CircularProgress size={24} /> : "Submit Report"}
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
};