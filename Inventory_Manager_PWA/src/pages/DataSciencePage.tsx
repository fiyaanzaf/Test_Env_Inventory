import React, { useEffect, useState } from 'react';
import {
  Box, Typography, CircularProgress, Card, CardContent,
  Chip, TextField, MenuItem, Accordion, AccordionSummary,
  AccordionDetails, IconButton, Snackbar, Alert,
} from '@mui/material';
import {
  ExpandMore, Science as ScienceIcon, Category as CatIcon,
  ShoppingBasket as BasketIcon, People as PeopleIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import {
  getMarketBasketAnalysis, getABCAnalysis, getCustomerSegments,
  type MarketBasketRule, type ABCItem, type CustomerSegment,
} from '../services/analyticsService';

const RANGE_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
  { value: 'custom', label: 'Custom' },
];

const ABC_COLORS: Record<string, string> = { A: '#10b981', B: '#f59e0b', C: '#ef4444' };

export const DataSciencePage: React.FC = () => {
  const [abcItems, setAbcItems] = useState<ABCItem[]>([]);
  const [mbaRules, setMbaRules] = useState<MarketBasketRule[]>([]);
  const [segments, setSegments] = useState<CustomerSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rangeOption, setRangeOption] = useState('90');
  const [startDate, setStartDate] = useState(dayjs().subtract(90, 'day').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));

  const applyRange = (opt: string) => {
    setRangeOption(opt);
    if (opt !== 'custom') {
      setStartDate(dayjs().subtract(Number(opt), 'day').format('YYYY-MM-DD'));
      setEndDate(dayjs().format('YYYY-MM-DD'));
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [abc, mba, seg] = await Promise.all([
        getABCAnalysis(startDate, endDate),
        getMarketBasketAnalysis(startDate, endDate),
        getCustomerSegments(startDate, endDate),
      ]);
      setAbcItems(abc);
      setMbaRules(mba);
      setSegments(seg);
    } catch (e: any) {
      setError(e?.message || 'Failed to load data science insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [startDate, endDate]);

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScienceIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>Data Science</Typography>
        </Box>
        <IconButton onClick={fetchAll}><RefreshIcon /></IconButton>
      </Box>

      {/* Date filter */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          select size="small" label="Range" value={rangeOption}
          onChange={e => applyRange(e.target.value)} sx={{ minWidth: 140 }}
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

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {/* ABC Classification */}
      <Accordion defaultExpanded sx={{ borderRadius: '12px !important', mb: 2, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CatIcon color="primary" />
            <Typography fontWeight={700}>ABC Classification</Typography>
            <Chip label={abcItems.length} size="small" />
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          {abcItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No ABC data available.</Typography>
          ) : (
            abcItems.map((item, i) => (
              <Card key={i} sx={{ mb: 1, borderRadius: 2, borderLeft: `4px solid ${ABC_COLORS[item.category_rank]}` }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>{item.product_name}</Typography>
                      <Typography variant="caption" color="text.secondary">SKU: {item.sku}</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right', ml: 1 }}>
                      <Chip
                        label={`Cat ${item.category_rank}`} size="small"
                        sx={{ bgcolor: ABC_COLORS[item.category_rank], color: '#fff', fontWeight: 700, mb: 0.5 }}
                      />
                      <Typography variant="caption" display="block" color="text.secondary">
                        ₹{item.revenue.toLocaleString('en-IN')}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))
          )}
        </AccordionDetails>
      </Accordion>

      {/* Market Basket Analysis */}
      <Accordion defaultExpanded sx={{ borderRadius: '12px !important', mb: 2, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BasketIcon color="secondary" />
            <Typography fontWeight={700}>Market Basket</Typography>
            <Chip label={mbaRules.length} size="small" />
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          {mbaRules.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No basket rules found.</Typography>
          ) : (
            mbaRules.map((rule, i) => (
              <Card key={i} sx={{ mb: 1, borderRadius: 2 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="body2" fontWeight={600}>
                    If buy <Chip label={rule.if_buy.join(', ')} size="small" color="primary" sx={{ mx: 0.5 }} />
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    → Likely to buy <Chip label={rule.likely_to_buy.join(', ')} size="small" color="secondary" sx={{ mx: 0.5 }} />
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Confidence: <strong>{(rule.confidence * 100).toFixed(1)}%</strong>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Lift: <strong>{rule.lift.toFixed(2)}</strong>
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            ))
          )}
        </AccordionDetails>
      </Accordion>

      {/* Customer Segments */}
      <Accordion defaultExpanded sx={{ borderRadius: '12px !important', mb: 2, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PeopleIcon sx={{ color: '#6366f1' }} />
            <Typography fontWeight={700}>Customer Segments</Typography>
            <Chip label={segments.length} size="small" />
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          {segments.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No segment data available.</Typography>
          ) : (
            segments.map((seg, i) => (
              <Card key={i} sx={{ mb: 1, borderRadius: 2 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" fontWeight={600}>{seg.customer_name || 'Unknown'}</Typography>
                      <Typography variant="caption" color="text.secondary">{seg.customer_phone}</Typography>
                    </Box>
                    <Chip label={seg.segment_name} size="small" color="primary" variant="outlined" />
                  </Box>
                  <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      R: <strong>{seg.recency_days}d</strong>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      F: <strong>{seg.frequency_count}</strong>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      M: <strong>₹{seg.monetary_value.toLocaleString('en-IN')}</strong>
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            ))
          )}
        </AccordionDetails>
      </Accordion>

      <Snackbar open={!!error} autoHideDuration={4000} onClose={() => setError('')}>
        <Alert severity="error" variant="filled" sx={{ width: '100%' }}>{error}</Alert>
      </Snackbar>
    </Box>
  );
};
