import React, { useEffect, useState } from 'react';
import {
  Box, Typography, CircularProgress, Card, CardContent,
  TextField, MenuItem, Chip, Divider, IconButton,
  Snackbar, Alert,
} from '@mui/material';
import {
  TrendingUp, AttachMoney, Inventory as InventoryIcon,
  EmojiEvents as TrophyIcon, DeleteSweep as WriteOffIcon,
  Refresh as RefreshIcon, BarChart as ChartIcon,
  ShoppingCart,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  getInventoryValuation, getTopSellers, getWriteOffSummary,
  getSalesSummary, getSalesTrends,
  type InventoryValuation, type TopSeller,
  type WriteOffSummary, type SalesSummary, type SalesTrend,
} from '../services/analyticsService';

const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom' },
];

export const AnalyticsPage: React.FC = () => {
  const [inventoryValuation, setInventoryValuation] = useState<InventoryValuation | null>(null);
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [writeOffs, setWriteOffs] = useState<WriteOffSummary[]>([]);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [trendData, setTrendData] = useState<SalesTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeOption, setRangeOption] = useState('30');
  const [startDate, setStartDate] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });

  const applyRange = (opt: string) => {
    setRangeOption(opt);
    if (opt !== 'custom') {
      setStartDate(dayjs().subtract(Number(opt), 'day').format('YYYY-MM-DD'));
      setEndDate(dayjs().format('YYYY-MM-DD'));
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [val, sales, wo, ts, trends] = await Promise.all([
        getInventoryValuation(),
        getSalesSummary(startDate, endDate),
        getWriteOffSummary(startDate, endDate),
        getTopSellers(startDate, endDate),
        getSalesTrends(startDate, endDate),
      ]);
      setInventoryValuation(val);
      setSalesSummary(sales);
      setWriteOffs(wo);
      setTopSellers(ts);
      setTrendData(trends);
    } catch (e: any) {
      setSnack({ open: true, msg: e?.message || 'Failed to load analytics', sev: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [startDate, endDate]);

  const fmt = (n?: number) => n != null ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—';

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 10 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>Analytics</Typography>
        <IconButton onClick={fetchAll}><RefreshIcon /></IconButton>
      </Box>

      {/* Date filter */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          select size="small" label="Range" value={rangeOption}
          onChange={e => applyRange(e.target.value)} sx={{ minWidth: 130 }}
        >
          {RANGE_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
        {rangeOption === 'custom' && (
          <>
            <TextField size="small" type="date" label="From" value={startDate}
              onChange={e => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField size="small" type="date" label="To" value={endDate}
              onChange={e => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          </>
        )}
      </Box>

      {/* Stat summary cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1.5, mb: 3 }}>
        <StatCard icon={<AttachMoney />} label="Inventory Value" value={fmt(inventoryValuation?.total_valuation)} color="#6366f1" />
        <StatCard icon={<InventoryIcon />} label="Total Items" value={inventoryValuation?.total_items?.toLocaleString() ?? '—'} color="#10b981" />
        <StatCard icon={<ShoppingCart />} label="Products" value={inventoryValuation?.distinct_products?.toLocaleString() ?? '—'} color="#f59e0b" />
      </Box>

      {/* Sales Summary */}
      <SectionTitle icon={<TrendingUp />} title="Sales Summary" />
      <Card sx={{ mb: 2, borderRadius: 3 }}>
        <CardContent sx={{ display: 'flex', justifyContent: 'space-around', py: 2 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">Total Sales</Typography>
            <Typography variant="h6" fontWeight={700}>{fmt(salesSummary?.total_sales_value)}</Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">Orders</Typography>
            <Typography variant="h6" fontWeight={700}>{salesSummary?.total_orders ?? '—'}</Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Sales Trends */}
      {trendData.length > 0 && (
        <>
          <SectionTitle icon={<ChartIcon />} title="Sales Trends" />
          <Card sx={{ mb: 2, borderRadius: 3, p: 1 }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => dayjs(d).format('DD/MM')} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Bar dataKey="total_sales" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      {/* Top Sellers */}
      <SectionTitle icon={<TrophyIcon />} title="Top Sellers" />
      {topSellers.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>No sales data in this period.</Typography>
      ) : (
        topSellers.map((s, i) => (
          <Card key={s.product_id} sx={{ mb: 1.5, borderRadius: 3, borderLeft: `4px solid ${i < 3 ? '#f59e0b' : '#94a3b8'}` }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip label={`#${i + 1}`} size="small" color={i < 3 ? 'warning' : 'default'} sx={{ fontWeight: 700 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>{s.product_name}</Typography>
                  <Typography variant="caption" color="text.secondary">SKU: {s.sku}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="body2" fontWeight={700}>{fmt(s.total_revenue)}</Typography>
                  <Typography variant="caption" color="text.secondary">{s.total_units_sold} sold</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))
      )}

      {/* Write-offs */}
      <SectionTitle icon={<WriteOffIcon />} title="Write-off Summary" />
      {writeOffs.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>No write-offs in this period.</Typography>
      ) : (
        writeOffs.map((w, i) => (
          <Card key={i} sx={{ mb: 1.5, borderRadius: 3 }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 }, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="body2" fontWeight={600}>{w.reason}</Typography>
                <Typography variant="caption" color="text.secondary">{w.total_count} items</Typography>
              </Box>
              <Typography variant="body2" fontWeight={700} color="error.main">{fmt(w.total_value_lost)}</Typography>
            </CardContent>
          </Card>
        ))
      )}

      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack(s => ({ ...s, open: false }))}>
        <Alert severity={snack.sev} variant="filled" sx={{ width: '100%' }}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

/* ── Util components ────────────────────────────────────────────────────── */
const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string }> = ({ icon, label, value, color }) => (
  <Card sx={{ borderRadius: 3, background: `linear-gradient(135deg, ${color}15, ${color}08)` }}>
    <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
      <Box sx={{ color, mb: 0.5 }}>{icon}</Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body1" fontWeight={700}>{value}</Typography>
    </CardContent>
  </Card>
);

const SectionTitle: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, mt: 2 }}>
    {icon}
    <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
  </Box>
);
