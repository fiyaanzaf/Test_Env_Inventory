import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box, Button, TextField, Typography, Paper, Alert,
  InputAdornment, IconButton, CircularProgress, Chip
} from '@mui/material';
import {
  Visibility, VisibilityOff, Person, Lock, Inventory2,
  QrCodeScanner as ScanIcon, Wifi as WifiIcon, Close as CloseIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { setBackendURL, getBackendURL } from '../api/client';

export const LoginScreen: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, error } = useAuthStore();
  const navigate = useNavigate();

  // QR scanning state
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [scanError, setScanError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const currentUrl = getBackendURL();

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => { stopCamera(); };
  }, [stopCamera]);

  const testAndConnect = async (url: string) => {
    setScanStatus('Testing connection...');
    let normalizedURL = url.trim().replace(/\/+$/, '');
    if (!normalizedURL.startsWith('http')) {
      normalizedURL = `http://${normalizedURL}`;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${normalizedURL}/api/v1/system/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        setBackendURL(normalizedURL);
        setScanStatus('Connected!');
        setScanError('');
        setTimeout(() => { setScanning(false); setScanStatus(''); }, 800);
      } else {
        setScanError(`Server responded with status ${res.status}`);
        setScanStatus('');
      }
    } catch (err: any) {
      setScanError(err.name === 'AbortError'
        ? 'Connection timed out. Same WiFi?'
        : 'Cannot reach server. Check if backend is running.');
      setScanStatus('');
    }
  };

  const startScanning = async () => {
    setScanning(true);
    setScanError('');
    setScanStatus('Starting camera...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setScanStatus('Point at QR code on desktop');

      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        scanIntervalRef.current = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState !== 4) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const scannedUrl = barcodes[0].rawValue;
              if (scannedUrl && scannedUrl.startsWith('http')) {
                stopCamera();
                await testAndConnect(scannedUrl);
              }
            }
          } catch { /* frame scan failed, continue */ }
        }, 300);
      } else {
        setScanError('QR scanning not supported. Update Android or enter URL manually.');
        stopCamera();
        setScanning(false);
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setScanError('Camera permission denied.');
      } else {
        setScanError('Could not start camera: ' + err.message);
      }
      setScanning(false);
    }
  };

  const cancelScan = () => {
    stopCamera();
    setScanning(false);
    setScanStatus('');
    setScanError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      console.error("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        px: 2,
        py: 4,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, sm: 4 },
          borderRadius: 4,
          width: '100%',
          maxWidth: 400,
          background: 'rgba(255, 255, 255, 0.97)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Logo */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
          <Box
            sx={{
              width: 64, height: 64, borderRadius: '16px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              mb: 1.5,
              boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)',
            }}
          >
            <Inventory2 sx={{ fontSize: 36, color: 'white' }} />
          </Box>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 800,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Store OS
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            Mobile Portal
          </Typography>
        </Box>

        {/* QR Scanner Overlay */}
        {scanning && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{
              position: 'relative',
              width: '100%',
              paddingTop: '75%',
              borderRadius: 3,
              overflow: 'hidden',
              border: '2px solid #667eea',
              mb: 1.5,
            }}>
              <video
                ref={videoRef}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: '100%', height: '100%', objectFit: 'cover',
                }}
                playsInline muted
              />
              {/* Scan target overlay */}
              <Box sx={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '55%', height: '55%',
                border: '2px solid rgba(255,255,255,0.7)',
                borderRadius: 2,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.25)',
              }} />
              <IconButton
                onClick={cancelScan}
                sx={{
                  position: 'absolute', top: 8, right: 8,
                  backgroundColor: 'rgba(0,0,0,0.5)', color: 'white',
                  '&:hover': { backgroundColor: 'rgba(0,0,0,0.7)' },
                }}
                size="small"
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
            {scanStatus && (
              <Typography variant="body2" sx={{ textAlign: 'center', color: 'text.secondary', fontWeight: 500 }}>
                {scanStatus}
              </Typography>
            )}
            {scanError && (
              <Alert severity="error" sx={{ mt: 1, fontSize: '0.8rem' }} onClose={() => setScanError('')}>
                {scanError}
              </Alert>
            )}
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            sx={{ mb: 2 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Person color="action" />
                  </InputAdornment>
                ),
              },
            }}
          />

          <TextField
            fullWidth
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            sx={{ mb: 3 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Lock color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading || !username || !password}
            sx={{
              py: 1.5,
              fontSize: '1rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: 3,
              '&:hover': {
                background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%)',
              },
            }}
          >
            {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : 'Sign In'}
          </Button>
        </Box>

        {/* Bottom: Server info + Rescan button */}
        <Box sx={{ mt: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          {currentUrl && (
            <Chip
              icon={<WifiIcon sx={{ fontSize: 14 }} />}
              label={currentUrl.replace(/^https?:\/\//, '')}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.7rem', color: 'text.secondary', borderColor: 'divider' }}
            />
          )}
          <Button
            size="small"
            startIcon={<ScanIcon sx={{ fontSize: 16 }} />}
            onClick={startScanning}
            disabled={scanning}
            sx={{
              textTransform: 'none',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#667eea',
            }}
          >
            {currentUrl ? 'Change Server' : 'Scan Server QR'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};
