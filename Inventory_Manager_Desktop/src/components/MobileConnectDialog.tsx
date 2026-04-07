import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogActions,
  Button, Typography, Box, CircularProgress, IconButton,
  Tooltip, Chip, Alert
} from '@mui/material';
import {
  QrCode2 as QrCodeIcon,
  PhoneAndroid as PhoneIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  Wifi as WifiIcon,
  Close as CloseIcon,
} from '@mui/icons-material';

interface MobileConnectDialogProps {
  open: boolean;
  onClose: () => void;
}

export const MobileConnectDialog: React.FC<MobileConnectDialogProps> = ({ open, onClose }) => {
  const [localIP, setLocalIP] = useState<string | null>(null);
  const [backendURL, setBackendURL] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [error, setError] = useState<string>('');

  const detectLocalIP = async () => {
    setLoading(true);
    setError('');
    try {
      // PRIMARY METHOD: Ask the backend for its LAN IP (most reliable)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch('http://127.0.0.1:8001/api/v1/system/health', {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        if (data.lan_ip && data.lan_ip !== '127.0.0.1') {
          setLocalIP(data.lan_ip);
          const url = `http://${data.lan_ip}:8001`;
          setBackendURL(url);
          await generateQR(url);
          setLoading(false);
          return;
        }
      }

      // FALLBACK: If backend returned 127.0.0.1 or didn't have IP
      // Try window.location.hostname (works if desktop app opened via LAN IP)
      const hostname = window.location.hostname;
      if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        setLocalIP(hostname);
        const url = `http://${hostname}:8001`;
        setBackendURL(url);
        await generateQR(url);
        setLoading(false);
        return;
      }

      setError(
        'Could not detect LAN IP automatically. Please open a terminal, run "ipconfig", ' +
        'find your WiFi IPv4 address (e.g. 192.168.1.5), and share it with your phone manually.\n\n' +
        'Your backend IS running — only IP detection failed.'
      );
    } catch (err) {
      console.error('IP detection failed:', err);
      setError(
        'Backend not reachable at localhost:8001. Make sure the FastAPI server is running:\n' +
        'uvicorn main:app --host 0.0.0.0 --port 8001'
      );
    } finally {
      setLoading(false);
    }
  };

  const generateQR = async (text: string) => {
    try {
      // Dynamic import of qrcode library
      const QRCode = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(text, {
        width: 300,
        margin: 2,
        color: {
          dark: '#1a1a2e',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });
      setQrDataUrl(dataUrl);
    } catch (err) {
      console.error('QR generation failed:', err);
      // Fallback: show the URL as text
      setQrDataUrl('');
    }
  };

  useEffect(() => {
    if (open) {
      detectLocalIP();
    }
    return () => {
      setCopied(false);
      setQrDataUrl('');
    };
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(backendURL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy
      const ta = document.createElement('textarea');
      ta.value = backendURL;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: 'hidden',
        }
      }}
    >
      {/* Header */}
      <Box sx={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        p: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PhoneIcon sx={{ fontSize: 28 }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Mobile Connect
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Scan QR from your phone to connect
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} sx={{ color: 'white' }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: 4, textAlign: 'center' }}>
        {loading ? (
          <Box sx={{ py: 6 }}>
            <CircularProgress size={48} />
            <Typography sx={{ mt: 2, color: 'text.secondary' }}>
              Detecting your local IP address...
            </Typography>
          </Box>
        ) : error ? (
          <Box sx={{ py: 4 }}>
            <Alert severity="warning" sx={{ mb: 2, textAlign: 'left' }}>
              {error}
            </Alert>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={detectLocalIP}
            >
              Retry Detection
            </Button>
          </Box>
        ) : (
          <>
            {/* Connection Info */}
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              mb: 3,
            }}>
              <WifiIcon sx={{ color: '#22c55e' }} />
              <Chip
                label={`LAN IP: ${localIP}`}
                color="success"
                variant="outlined"
                sx={{ fontWeight: 600, fontSize: '0.9rem' }}
              />
            </Box>

            {/* QR Code */}
            <Box sx={{
              display: 'inline-flex',
              p: 3,
              borderRadius: 3,
              border: '2px solid #e2e8f0',
              backgroundColor: 'white',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              mb: 3,
            }}>
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR Code"
                  style={{ width: 250, height: 250 }}
                />
              ) : (
                <Box sx={{
                  width: 250,
                  height: 250,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 1,
                }}>
                  <QrCodeIcon sx={{ fontSize: 64, color: '#cbd5e1' }} />
                  <Typography variant="body2" color="text.secondary">
                    QR could not be generated.
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Use the URL below instead.
                  </Typography>
                </Box>
              )}
            </Box>

            {/* URL Display */}
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              p: 1.5,
              borderRadius: 2,
              backgroundColor: '#f1f5f9',
              mb: 2,
            }}>
              <Typography
                variant="body1"
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  color: '#334155',
                  fontSize: '1rem',
                }}
              >
                {backendURL}
              </Typography>
              <Tooltip title={copied ? 'Copied!' : 'Copy URL'}>
                <IconButton size="small" onClick={handleCopy}>
                  <CopyIcon fontSize="small" sx={{ color: copied ? '#22c55e' : '#64748b' }} />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Instructions */}
            <Box sx={{ textAlign: 'left', mt: 3 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#334155' }}>
                How to connect:
              </Typography>
              <Box component="ol" sx={{ pl: 2.5, m: 0, color: '#64748b', fontSize: '0.9rem', lineHeight: 1.8 }}>
                <li>Make sure your phone is on the <strong>same WiFi</strong> network</li>
                <li>Open the <strong>Store OS</strong> app on your phone</li>
                <li>Tap <strong>"Scan QR to Connect"</strong></li>
                <li>Point your camera at the QR code above</li>
              </Box>
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
        {!loading && !error && (
          <Button
            startIcon={<RefreshIcon />}
            onClick={detectLocalIP}
            sx={{ mr: 'auto' }}
          >
            Refresh IP
          </Button>
        )}
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
