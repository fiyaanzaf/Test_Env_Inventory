import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Box, Alert, CircularProgress, Typography
} from '@mui/material';
import {
  Email as EmailIcon,
  Send as SendIcon
} from '@mui/icons-material';
import { b2bService } from '../../services/b2bService';
import type { B2BClient } from '../../services/b2bService';

interface SendEmailDialogProps {
  open: boolean;
  client: B2BClient | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const SendEmailDialog: React.FC<SendEmailDialogProps> = ({
  open,
  client,
  onClose,
  onSuccess
}) => {
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (client && open) {
      setError(null);
      setSuccess(false);
      
      // Generate email content
      const emailSubject = `Payment Reminder - Outstanding Balance ₹${client.current_balance.toLocaleString()}`;
      const emailBody = `Dear ${client.contact_person || client.name},

This is a friendly reminder regarding your outstanding balance with us.

Current Outstanding: ₹${client.current_balance.toLocaleString()}
Credit Limit: ₹${client.credit_limit.toLocaleString()}
Available Credit: ₹${(client.credit_limit - client.current_balance).toLocaleString()}

Please arrange for the payment at your earliest convenience.

For any queries, feel free to contact us.

Thank you for your business!

Best regards`;

      setToEmail(client.email || '');
      setSubject(emailSubject);
      setBody(emailBody);
    }
  }, [client, open]);

  const handleSend = async () => {
    if (!toEmail.trim()) {
      setError('Email address is required');
      return;
    }
    if (!subject.trim()) {
      setError('Subject is required');
      return;
    }
    if (!client) return;

    setSending(true);
    setError(null);

    try {
      await b2bService.sendEmailReminder(client.id, toEmail, subject, body);
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send email. Please check email settings.');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccess(false);
    onClose();
  };

  if (!client) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <EmailIcon color="info" />
        Send Email Reminder
      </DialogTitle>
      
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Email sent successfully!
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Sending to: <strong>{client.name}</strong>
          </Typography>

          <TextField
            fullWidth
            label="To Email"
            type="email"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            placeholder="Enter recipient email"
            required
            disabled={sending || success}
          />

          <TextField
            fullWidth
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            disabled={sending || success}
          />

          <TextField
            fullWidth
            multiline
            rows={10}
            label="Message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={sending || success}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={handleClose} color="inherit" disabled={sending}>
          Cancel
        </Button>
        <Button
          onClick={handleSend}
          variant="contained"
          color="info"
          disabled={sending || success || !toEmail.trim()}
          startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
        >
          {sending ? 'Sending...' : success ? 'Sent!' : 'Send Email'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SendEmailDialog;
