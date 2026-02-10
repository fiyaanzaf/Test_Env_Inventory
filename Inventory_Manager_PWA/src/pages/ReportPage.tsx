import React, { useState } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button,
  MenuItem, CircularProgress, Snackbar, Alert, Chip,
  CardActionArea, Divider,
} from '@mui/material';
import {
  Assessment as ReportIcon, Download as DownloadIcon,
  Inventory as InvIcon, Warning as WarnIcon,
  EventBusy as ExpiryIcon, LocalShipping as SupplierIcon,
  Category as CatIcon, SwapHoriz as MoveIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import client from '../api/client';

interface ReportCategory {
  key: string;
  label: string;
  icon: React.ReactNode;
  endpoint: string;
  color: string;
}

const REPORT_CATEGORIES: ReportCategory[] = [
  { key: 'inventory_summary', label: 'Inventory Summary', icon: <InvIcon />, endpoint: '/api/v1/reports/inventory_summary', color: '#6366f1' },
  { key: 'low_stock', label: 'Low Stock / Reorder', icon: <WarnIcon />, endpoint: '/api/v1/reports/low_stock', color: '#ef4444' },
  { key: 'near_expiry', label: 'Near Expiry', icon: <ExpiryIcon />, endpoint: '/api/v1/reports/near_expiry', color: '#f59e0b' },
  { key: 'supplier_performance', label: 'Supplier Performance', icon: <SupplierIcon />, endpoint: '/api/v1/reports/supplier_performance', color: '#10b981' },
  { key: 'sales_by_category', label: 'Sales by Category', icon: <CatIcon />, endpoint: '/api/v1/reports/sales_by_category', color: '#ec4899' },
  { key: 'movement_summary', label: 'Movement Summary', icon: <MoveIcon />, endpoint: '/api/v1/reports/movement_summary', color: '#3b82f6' },
];

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('user_token')}` },
});

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<ReportCategory | null>(null);
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [supplier, setSupplier] = useState('');
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });

  const showSnack = (msg: string, sev: 'success' | 'error' = 'success') => setSnack({ open: true, msg, sev });

  const fetchReport = async (report: ReportCategory) => {
    setLoading(true);
    setReportData([]);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (category) params.append('category', category);
      if (location) params.append('location', location);
      if (supplier) params.append('supplier', supplier);
      const res = await client.get(`${report.endpoint}?${params.toString()}`, getAuthHeaders());
      const data = Array.isArray(res.data) ? res.data : res.data.data || res.data.items || [res.data];
      setReportData(data);
    } catch (e: any) {
      showSnack(e?.response?.data?.detail || 'Failed to load report', 'error');
    }
    setLoading(false);
  };

  const handleSelectReport = (report: ReportCategory) => {
    setSelectedReport(report);
    setReportData([]);
    fetchReport(report);
  };

  const handleDownloadPdf = async () => {
    if (!selectedReport) return;
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (category) params.append('category', category);
      if (location) params.append('location', location);
      if (supplier) params.append('supplier', supplier);
      params.append('format', 'pdf');
      const res = await client.get(`${selectedReport.endpoint}?${params.toString()}`, {
        ...getAuthHeaders(),
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedReport.key}_${dayjs().format('YYYYMMDD')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showSnack('PDF download failed', 'error');
    }
  };

  const renderValue = (val: any): string => {
    if (val == null) return '—';
    if (typeof val === 'number') return val.toLocaleString('en-IN');
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return String(val);
  };

  return (
    <Box sx={{ pb: 10 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <ReportIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Reports</Typography>
      </Box>

      {/* Report category selector */}
      {!selectedReport ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1.5 }}>
          {REPORT_CATEGORIES.map(r => (
            <Card key={r.key} sx={{ borderRadius: 3, overflow: 'hidden' }}>
              <CardActionArea onClick={() => handleSelectReport(r)} sx={{ p: 2, textAlign: 'center' }}>
                <Box sx={{ color: r.color, mb: 1 }}>{r.icon}</Box>
                <Typography variant="body2" fontWeight={600}>{r.label}</Typography>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      ) : (
        <>
          {/* Back + title */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Button size="small" onClick={() => { setSelectedReport(null); setReportData([]); }}>← Back</Button>
            <Chip label={selectedReport.label} color="primary" />
          </Box>

          {/* Filters */}
          <Card sx={{ borderRadius: 3, mb: 2 }}>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                <TextField size="small" type="date" label="From" value={startDate}
                  onChange={e => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1, minWidth: 120 }} />
                <TextField size="small" type="date" label="To" value={endDate}
                  onChange={e => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1, minWidth: 120 }} />
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                <TextField size="small" label="Category" value={category}
                  onChange={e => setCategory(e.target.value)} sx={{ flex: 1, minWidth: 100 }} />
                <TextField size="small" label="Location" value={location}
                  onChange={e => setLocation(e.target.value)} sx={{ flex: 1, minWidth: 100 }} />
                <TextField size="small" label="Supplier" value={supplier}
                  onChange={e => setSupplier(e.target.value)} sx={{ flex: 1, minWidth: 100 }} />
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="contained" startIcon={<SearchIcon />} onClick={() => fetchReport(selectedReport)}
                  sx={{ flex: 1, borderRadius: 2 }}>
                  Generate
                </Button>
                <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadPdf}
                  disabled={reportData.length === 0} sx={{ borderRadius: 2 }}>
                  PDF
                </Button>
              </Box>
            </CardContent>
          </Card>

          {/* Results */}
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : reportData.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
              No data found for selected filters.
            </Typography>
          ) : (
            <>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                {reportData.length} result{reportData.length !== 1 ? 's' : ''}
              </Typography>
              {reportData.map((row, i) => (
                <Card key={i} sx={{ mb: 1, borderRadius: 2 }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    {Object.entries(row).map(([key, val]) => (
                      <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.3 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                          {key.replace(/_/g, ' ')}
                        </Typography>
                        <Typography variant="caption" fontWeight={600}>{renderValue(val)}</Typography>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </>
      )}

      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack(s => ({ ...s, open: false }))}>
        <Alert severity={snack.sev} variant="filled" sx={{ width: '100%' }}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
