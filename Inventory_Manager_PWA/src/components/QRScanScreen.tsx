import React, { useState, useRef, useEffect } from 'react';
import {
  Box, Typography, Button, TextField,
  Paper, Alert, CircularProgress, IconButton
} from '@mui/material';
import {
  QrCodeScanner as ScanIcon,
  Wifi as WifiIcon,
  Edit as EditIcon,
  CheckCircle as CheckIcon,
  Refresh as RefreshIcon,
  CameraAlt as CameraIcon,
} from '@mui/icons-material';
import { setBackendURL } from '../api/client';

interface QRScanScreenProps {
  onConnected: () => void;
}

export const QRScanScreen: React.FC<QRScanScreenProps> = ({ onConnected }) => {
  const [mode, setMode] = useState<'home' | 'scanning' | 'manual'>('home');
  const [manualURL, setManualURL] = useState('');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  // Clean up camera on unmount or mode change
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const startScanning = async () => {
    setMode('scanning');
    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }  // Use back camera
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Start scanning frames using BarcodeDetector API (available in Chrome/Android)
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });

        scanIntervalRef.current = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState !== 4) return;

          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const url = barcodes[0].rawValue;
              if (url && url.startsWith('http')) {
                stopCamera();
                await testAndConnect(url);
              }
            }
          } catch {
            // Frame scan failed, continue
          }
        }, 300);
      } else {
        // BarcodeDetector not available — fallback
        // Try using canvas + manual frame capture
        // For APK, BarcodeDetector is supported on Android Chrome/WebView
        setError(
          'QR scanning is not supported in this browser. ' +
          'Please use the manual entry option or update to a newer Android version.'
        );
        stopCamera();
        setMode('manual');
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access and try again.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found. Please use manual URL entry.');
      } else {
        setError('Could not start camera: ' + err.message);
      }
      setMode('home');
    }
  };

  const testAndConnect = async (url: string) => {
    setTesting(true);
    setError('');

    // Normalize URL
    let normalizedURL = url.trim().replace(/\/+$/, '');
    if (!normalizedURL.startsWith('http')) {
      normalizedURL = `http://${normalizedURL}`;
    }

    try {
      // Test connection to backend
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${normalizedURL}/api/v1/system/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        // Save and connect
        setBackendURL(normalizedURL);
        onConnected();
      } else {
        setError(`Server responded with status ${res.status}. Make sure the backend is running.`);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Connection timed out. Make sure you are on the same WiFi network as the desktop.');
      } else {
        setError(
          'Cannot reach backend at: ' + normalizedURL + '\n' +
          'Make sure: (1) Backend is running on desktop, (2) Same WiFi network, (3) Firewall allows port 8000'
        );
      }
    } finally {
      setTesting(false);
    }
  };

  const handleManualConnect = () => {
    if (!manualURL.trim()) {
      setError('Please enter the backend URL');
      return;
    }
    testAndConnect(manualURL);
  };

  return (
    <Box sx={{
      minHeight: '100dvh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      p: 3,
    }}>
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 400,
          borderRadius: 4,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <Box sx={{
          p: 3,
          textAlign: 'center',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          color: 'white',
        }}>
          <Box sx={{
            width: 64,
            height: 64,
            borderRadius: 3,
            backgroundColor: 'rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
          }}>
            <WifiIcon sx={{ fontSize: 32 }} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Store OS
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8, mt: 0.5 }}>
            Connect to your desktop server
          </Typography>
        </Box>

        {/* Content */}
        <Box sx={{ p: 3 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem' }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {mode === 'home' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Button
                variant="contained"
                size="large"
                startIcon={<ScanIcon />}
                onClick={startScanning}
                sx={{
                  py: 2,
                  borderRadius: 3,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  fontWeight: 700,
                  fontSize: '1rem',
                }}
              >
                Scan QR to Connect
              </Button>

              <Button
                variant="outlined"
                size="large"
                startIcon={<EditIcon />}
                onClick={() => setMode('manual')}
                sx={{
                  py: 1.5,
                  borderRadius: 3,
                  fontWeight: 600,
                }}
              >
                Enter URL Manually
              </Button>

              <Typography variant="body2" sx={{ textAlign: 'center', color: 'text.secondary', mt: 1 }}>
                Open <strong>Store OS</strong> on your desktop and click the{' '}
                <strong>Mobile Connect</strong> button to get QR code.
              </Typography>
            </Box>
          )}

          {mode === 'scanning' && (
            <Box sx={{ textAlign: 'center' }}>
              <Box sx={{
                position: 'relative',
                width: '100%',
                paddingTop: '100%', // 1:1 aspect ratio
                borderRadius: 3,
                overflow: 'hidden',
                border: '3px solid #667eea',
                mb: 2,
              }}>
                <video
                  ref={videoRef}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                  playsInline
                  muted
                />
                {/* Scan overlay */}
                <Box sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '60%',
                  height: '60%',
                  border: '2px solid rgba(255,255,255,0.8)',
                  borderRadius: 2,
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.3)',
                }} />
              </Box>
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                Point camera at the QR code on your desktop
              </Typography>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  onClick={() => { stopCamera(); setMode('home'); }}
                  sx={{ flex: 1 }}
                >
                  Cancel
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => { stopCamera(); setMode('manual'); }}
                  sx={{ flex: 1 }}
                >
                  Enter Manually
                </Button>
              </Box>
            </Box>
          )}

          {mode === 'manual' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Enter the backend URL shown on your desktop:
              </Typography>

              <TextField
                fullWidth
                label="Backend URL"
                placeholder="http://192.168.1.5:8001"
                value={manualURL}
                onChange={(e) => setManualURL(e.target.value)}
                variant="outlined"
                autoFocus
                disabled={testing}
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: 2 },
                }}
              />

              <Button
                variant="contained"
                size="large"
                startIcon={testing ? <CircularProgress size={20} color="inherit" /> : <CheckIcon />}
                onClick={handleManualConnect}
                disabled={testing || !manualURL.trim()}
                sx={{
                  py: 1.5,
                  borderRadius: 3,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  fontWeight: 700,
                }}
              >
                {testing ? 'Testing Connection...' : 'Connect'}
              </Button>

              <Button
                variant="text"
                onClick={() => { setMode('home'); setError(''); }}
                disabled={testing}
              >
                Back
              </Button>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
};
