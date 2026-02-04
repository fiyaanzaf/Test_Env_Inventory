import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Button,
  Typography, ToggleButtonGroup, ToggleButton, CircularProgress,
  IconButton, Tooltip, Divider, Alert
} from '@mui/material';
import {
  Close as CloseIcon,
  Download as DownloadIcon,
  Email as EmailIcon,
  WhatsApp as WhatsAppIcon,
  Print as PrintIcon,
  PictureAsPdf as PdfIcon
} from '@mui/icons-material';
import { downloadInvoicePDF, type Invoice } from '../../services/invoiceService';

interface InvoicePreviewDialogProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  defaultTemplate?: string;
}

const templates = [
  { key: 'classic', label: 'Classic Red', color: '#dc2626' },
  { key: 'professional', label: 'Professional Blue', color: '#2563eb' },
  { key: 'minimal', label: 'Minimal Clean', color: '#374151' },
];

export default function InvoicePreviewDialog({
  open,
  onClose,
  invoice,
  defaultTemplate = 'classic'
}: InvoicePreviewDialogProps) {
  const [selectedTemplate, setSelectedTemplate] = useState(defaultTemplate);
  const [loading, setLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && invoice) {
      loadPreview();
    }
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [open, invoice, selectedTemplate]);

  const loadPreview = async () => {
    if (!invoice) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const blob = await downloadInvoicePDF(invoice.id, selectedTemplate);
      const url = URL.createObjectURL(blob);
      
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      setPdfUrl(url);
    } catch (err) {
      console.error('Failed to load preview:', err);
      setError('Failed to load invoice preview');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!invoice) return;
    
    try {
      setLoading(true);
      const blob = await downloadInvoicePDF(invoice.id, selectedTemplate);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice.invoice_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      setError('Failed to download invoice');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (pdfUrl) {
      const printWindow = window.open(pdfUrl, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    }
  };

  const handleWhatsApp = () => {
    if (!invoice) return;
    const message = encodeURIComponent(
      `Invoice ${invoice.invoice_number}\n` +
      `Amount: ₹${invoice.grand_total.toLocaleString()}\n` +
      `Status: ${invoice.payment_status}`
    );
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { height: '90vh', display: 'flex', flexDirection: 'column' }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderBottom: '1px solid #e2e8f0',
        pb: 2
      }}>
        <Box>
          <Typography variant="h6" fontWeight={600}>
            Invoice Preview
          </Typography>
          {invoice && (
            <Typography variant="body2" color="text.secondary">
              {invoice.invoice_number} • {invoice.customer_name || 'Walk-in Customer'}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Box sx={{ 
        px: 3, 
        py: 2, 
        bgcolor: '#f8fafc', 
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 2
      }}>
        {/* Template Selection */}
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: 'block' }}>
            SELECT TEMPLATE
          </Typography>
          <ToggleButtonGroup
            value={selectedTemplate}
            exclusive
            onChange={(_, value) => value && setSelectedTemplate(value)}
            size="small"
          >
            {templates.map((t) => (
              <ToggleButton 
                key={t.key} 
                value={t.key}
                sx={{
                  px: 2,
                  '&.Mui-selected': {
                    bgcolor: t.color,
                    color: 'white',
                    '&:hover': { bgcolor: t.color }
                  }
                }}
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: t.color,
                    mr: 1
                  }}
                />
                {t.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Download PDF">
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={handleDownload}
              disabled={loading}
              sx={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              }}
            >
              Download
            </Button>
          </Tooltip>
          
          <Tooltip title="Print">
            <IconButton onClick={handlePrint} disabled={!pdfUrl}>
              <PrintIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Share via WhatsApp">
            <IconButton onClick={handleWhatsApp} sx={{ color: '#25D366' }}>
              <WhatsAppIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <DialogContent sx={{ p: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {error && (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        )}
        
        {loading ? (
          <Box sx={{ 
            flex: 1, 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            flexDirection: 'column',
            gap: 2
          }}>
            <CircularProgress />
            <Typography color="text.secondary">Generating preview...</Typography>
          </Box>
        ) : pdfUrl ? (
          <iframe
            src={pdfUrl}
            style={{ 
              width: '100%', 
              height: '100%', 
              border: 'none',
              flex: 1
            }}
            title="Invoice Preview"
          />
        ) : (
          <Box sx={{ 
            flex: 1, 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            flexDirection: 'column',
            gap: 2,
            color: '#94a3b8'
          }}>
            <PdfIcon sx={{ fontSize: 64 }} />
            <Typography>Select a template to preview the invoice</Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #e2e8f0' }}>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          disabled={loading}
        >
          Download PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
}
