import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, MenuItem, Alert, Box, Typography,
  ListSubheader, Chip, CircularProgress
} from '@mui/material';
import { 
  receiveStock, 
  transferStock, 
  writeOffStock,
  getLocations, 
  getProductStock,
  type Location,
  type BatchInfo
} from '../services/inventoryService';

// --- Helper to Group Locations for Dropdowns ---
const groupLocationsByType = (locations: any[]) => {
  const groups = {
    warehouse: [] as any[],
    store: [] as any[],
    external: [] as any[],
    other: [] as any[]
  };

  locations.forEach(loc => {
    const type = loc.type?.toLowerCase() || (loc.location_type?.toLowerCase()) || 'other';
    if (type === 'warehouse') groups.warehouse.push(loc);
    else if (type === 'store') groups.store.push(loc);
    else if (type === 'external') groups.external.push(loc);
    else groups.other.push(loc);
  });

  return groups;
};

// ==========================================
// 1. RECEIVE STOCK DIALOG (Inbound)
// ==========================================
interface ReceiveDialogProps {
  open: boolean;
  onClose: () => void;
  product: { id: number; name: string; sku: string; average_cost?: number } | null; // Updated type
  onSuccess: () => void;
}

export const ReceiveStockDialog: React.FC<ReceiveDialogProps> = ({ open, onClose, product, onSuccess }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [formData, setFormData] = useState({
    quantity: '',
    unit_cost: '', // <--- FIX: Renamed from cost_price
    location_id: '',
    expiry_date: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      getLocations()
        .then(setLocations)
        .catch(() => setError('Failed to load locations'));
      
      // FIX: Pre-fill cost from product.average_cost if available
      const defaultCost = product?.average_cost ? String(product.average_cost) : '';
      
      setFormData({ 
          quantity: '', 
          unit_cost: defaultCost, 
          location_id: '', 
          expiry_date: '' 
      });
      setError('');
    }
  }, [open, product]);

  const handleSubmit = async () => {
    if (!product) return;
    if (!formData.quantity || !formData.unit_cost || !formData.location_id) {
        setError("Please fill all required fields.");
        return;
    }

    setLoading(true);
    setError('');

    try {
      await receiveStock({
        product_id: product.id,
        quantity: parseInt(formData.quantity),
        unit_cost: parseFloat(formData.unit_cost), // <--- FIX: Sending correct field
        location_id: parseInt(formData.location_id),
        expiry_date: formData.expiry_date || undefined
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Failed to receive stock");
    } finally {
      setLoading(false);
    }
  };

  const groupedLocs = groupLocationsByType(locations);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        📦 Receive Stock
        <Typography variant="body2" color="text.secondary">
          {product?.name} ({product?.sku})
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          
          <TextField 
            label="Quantity" type="number" fullWidth required
            value={formData.quantity}
            onChange={e => setFormData({...formData, quantity: e.target.value})} 
          />
          
          <TextField 
            label="Unit Cost (Buying Price)" type="number" fullWidth required
            value={formData.unit_cost}
            onChange={e => setFormData({...formData, unit_cost: e.target.value})} 
            helperText="Cost per item from supplier"
          />
          
          <TextField 
            select label="Destination Location" fullWidth required
            value={formData.location_id}
            onChange={e => setFormData({...formData, location_id: e.target.value})}
            helperText="Select where this stock is being unloaded"
          >
            {groupedLocs.warehouse.length > 0 && [<ListSubheader key="wh" sx={{fontWeight:'bold', color:'#6366f1'}}>Warehouses</ListSubheader>, ...groupedLocs.warehouse.map(l => <MenuItem key={l.id} value={l.id}>🏭 {l.name}</MenuItem>)]}
            {groupedLocs.store.length > 0 && [<ListSubheader key="st" sx={{fontWeight:'bold', color:'#10b981'}}>In-Store Locations</ListSubheader>, ...groupedLocs.store.map(l => <MenuItem key={l.id} value={l.id}>🏪 {l.name}</MenuItem>)]}
            {groupedLocs.external.length > 0 && [<ListSubheader key="ex" sx={{fontWeight:'bold', color:'#f59e0b'}}>External / Online</ListSubheader>, ...groupedLocs.external.map(l => <MenuItem key={l.id} value={l.id}>🌐 {l.name}</MenuItem>)]}
            {groupedLocs.other.length > 0 && [<ListSubheader key="ot">Other</ListSubheader>, ...groupedLocs.other.map(l => <MenuItem key={l.id} value={l.id}>📍 {l.name}</MenuItem>)]}
          </TextField>
          
          <TextField 
            label="Expiry Date (Optional)" type="date" fullWidth 
            InputLabelProps={{ shrink: true }}
            value={formData.expiry_date}
            onChange={e => setFormData({...formData, expiry_date: e.target.value})} 
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          disabled={loading}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : 'Confirm Receipt'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ==========================================
// 2. TRANSFER STOCK DIALOG (Internal Move)
// ==========================================
interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  product: { id: number; name: string; sku: string } | null;
  onSuccess: () => void;
}

interface SourceOption extends Location {
  available: number;
}

export const TransferStockDialog: React.FC<TransferDialogProps> = ({ open, onClose, product, onSuccess }) => {
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [sourceOptions, setSourceOptions] = useState<SourceOption[]>([]);
  const [formData, setFormData] = useState({
    quantity: '',
    from_location_id: '',
    to_location_id: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && product) {
      setLoading(true);
      const fetchContext = async () => {
        try {
          const locs = await getLocations();
          setAllLocations(locs);

          const stockInfo = await getProductStock(product.id);
          const stockMap = new Map<number, number>();
          if (stockInfo && stockInfo.batches) {
             stockInfo.batches.forEach(b => {
                const current = stockMap.get(b.location_id) || 0;
                stockMap.set(b.location_id, current + b.quantity);
             });
          }

          const validSources = locs
            .filter(l => stockMap.has(l.id))
            .map(l => ({
              ...l,
              available: stockMap.get(l.id) || 0
            }));
          
          setSourceOptions(validSources);
          if (validSources.length === 1) {
            setFormData(prev => ({ ...prev, from_location_id: validSources[0].id.toString() }));
          }

        } catch (err) {
          setError('Failed to load stock data.');
        } finally {
          setLoading(false);
        }
      };

      fetchContext();
      setFormData({ quantity: '', from_location_id: '', to_location_id: '' });
      setError('');
    }
  }, [open, product]);

  const handleSubmit = async () => {
    if (!product) return;
    setLoading(true);
    setError('');

    if (formData.from_location_id === formData.to_location_id) {
      setError("Source and Destination locations must be different.");
      setLoading(false);
      return;
    }

    try {
      await transferStock({
        product_id: product.id,
        quantity: parseInt(formData.quantity),
        from_location_id: parseInt(formData.from_location_id),
        to_location_id: parseInt(formData.to_location_id)
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Transfer failed. Check stock levels.");
    } finally {
      setLoading(false);
    }
  };

  const groupedSources = groupLocationsByType(sourceOptions);
  const groupedDest = groupLocationsByType(allLocations);

  const renderMenu = (groups: any, isSource: boolean) => [
    groups.warehouse.length > 0 && [<ListSubheader key="wh" sx={{fontWeight:'bold', color:'#6366f1'}}>Warehouses</ListSubheader>, ...groups.warehouse.map((l: any) => (
      <MenuItem key={l.id} value={l.id} disabled={!isSource && l.id.toString() === formData.from_location_id}>
        🏭 {l.name} {isSource && <Typography component="span" fontWeight="bold" color="primary" sx={{ ml: 1 }}>(Avail: {l.available})</Typography>}
      </MenuItem>
    ))],
    groups.store.length > 0 && [<ListSubheader key="st" sx={{fontWeight:'bold', color:'#10b981'}}>In-Store Locations</ListSubheader>, ...groups.store.map((l: any) => (
      <MenuItem key={l.id} value={l.id} disabled={!isSource && l.id.toString() === formData.from_location_id}>
        🏪 {l.name} {isSource && <Typography component="span" fontWeight="bold" color="primary" sx={{ ml: 1 }}>(Avail: {l.available})</Typography>}
      </MenuItem>
    ))],
    groups.external.length > 0 && [<ListSubheader key="ex" sx={{fontWeight:'bold', color:'#f59e0b'}}>External / Online</ListSubheader>, ...groups.external.map((l: any) => (
      <MenuItem key={l.id} value={l.id} disabled={!isSource && l.id.toString() === formData.from_location_id}>
        🌐 {l.name} {isSource && <Typography component="span" fontWeight="bold" color="primary" sx={{ ml: 1 }}>(Avail: {l.available})</Typography>}
      </MenuItem>
    ))],
    groups.other.length > 0 && [<ListSubheader key="ot">Other</ListSubheader>, ...groups.other.map((l: any) => (
      <MenuItem key={l.id} value={l.id} disabled={!isSource && l.id.toString() === formData.from_location_id}>
        📍 {l.name} {isSource && <Typography component="span" fontWeight="bold" color="primary" sx={{ ml: 1 }}>(Avail: {l.available})</Typography>}
      </MenuItem>
    ))]
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        🚚 Transfer Stock
        <Typography variant="body2" color="text.secondary">
          {product?.name} ({product?.sku})
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          
          <Alert severity="info" sx={{ py: 0.5, fontSize: '0.9rem' }}>
            System will automatically move the <b>oldest stock</b> (FIFO) from the selected source.
          </Alert>

          <Box sx={{ display: 'flex', gap: 2 }}>
            {/* FROM: Grouped & Filtered */}
            <TextField 
              select label="From (Source)" fullWidth required
              value={formData.from_location_id}
              onChange={e => setFormData({...formData, from_location_id: e.target.value})}
              disabled={sourceOptions.length === 0}
              helperText={sourceOptions.length === 0 ? "No stock available to transfer" : ""}
            >
              {renderMenu(groupedSources, true)}
            </TextField>

            {/* TO: Grouped All Locations */}
            <TextField 
              select label="To (Destination)" fullWidth required
              value={formData.to_location_id}
              onChange={e => setFormData({...formData, to_location_id: e.target.value})}
            >
              {renderMenu(groupedDest, false)}
            </TextField>
          </Box>

          <TextField 
            label="Quantity to Move" type="number" fullWidth required
            value={formData.quantity}
            onChange={e => setFormData({...formData, quantity: e.target.value})} 
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          color="warning"
          disabled={loading || !formData.quantity || !formData.from_location_id || !formData.to_location_id}
        >
          {loading ? 'Moving...' : 'Execute Transfer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ==========================================
// 3. WRITE-OFF STOCK DIALOG (Remove damaged/lost)
// ==========================================
interface WriteOffDialogProps {
  open: boolean;
  onClose: () => void;
  product: { id: number; name: string; sku: string } | null;
  onSuccess: () => void;
}

const WRITE_OFF_REASONS = [
  'Damaged', 'Expired', 'Lost/Stolen', 'Donation', 'Internal Use', 'Other'
];

export const WriteOffStockDialog: React.FC<WriteOffDialogProps> = ({ open, onClose, product, onSuccess }) => {
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [formData, setFormData] = useState({
    batch_id: '',
    quantity: '',
    reason: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch batches when dialog opens
  useEffect(() => {
    if (open && product) {
      setLoading(true);
      getProductStock(product.id)
        .then(data => {
          // Only show batches that have stock
          setBatches(data.batches ? data.batches.filter(b => b.quantity > 0) : []);
        })
        .catch(() => setError('Failed to load stock details'))
        .finally(() => setLoading(false));
      
      setFormData({ batch_id: '', quantity: '', reason: '' });
      setError('');
    }
  }, [open, product]);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      await writeOffStock({
        batch_id: parseInt(formData.batch_id),
        quantity_to_remove: parseInt(formData.quantity),
        reason: formData.reason
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to write-off stock");
      setLoading(false); // Only stop loading on error, so user can retry
    }
  };

  const selectedBatch = batches.find(b => b.id.toString() === formData.batch_id);

  const groupedBatches = (() => {
    const groups = { warehouse: [] as BatchInfo[], store: [] as BatchInfo[], external: [] as BatchInfo[], other: [] as BatchInfo[] };
    batches.forEach(b => {
      const t = (b as any).location_type?.toLowerCase() || 'other';
      if (t === 'warehouse') groups.warehouse.push(b);
      else if (t === 'store') groups.store.push(b);
      else if (t === 'external') groups.external.push(b);
      else groups.other.push(b);
    });
    return groups;
  })();

  const renderBatchOptions = (title: string, list: BatchInfo[]) => {
    if (list.length === 0) return null;
    return [
      <ListSubheader key={title} sx={{ fontWeight: 'bold', lineHeight: '24px', pt: 1 }}>{title}</ListSubheader>,
      ...list.map(b => (
        <MenuItem key={b.id} value={b.id} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', py: 1, ml: 1, borderLeft: '2px solid #e2e8f0' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <Typography variant="body2" fontWeight="bold">
              {b.location_name}
            </Typography>
            <Chip 
              label={`Qty: ${b.quantity}`} 
              size="small" 
              color={b.quantity < 10 ? "error" : "default"} 
              variant="outlined" 
            />
          </Box>
          <Typography variant="caption" color="text.secondary">
            Code: {b.batch_code} | Exp: {b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : 'N/A'}
          </Typography>
        </MenuItem>
      ))
    ];
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: '#ef4444' }}>
        🗑️ Write-off Stock
        <Typography variant="body2" color="text.secondary">
          Permanently remove stock for {product?.name}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Alert severity="warning" sx={{ py: 0, fontSize: '0.85rem' }}>
            Warning: This action cannot be undone. It will affect inventory valuation.
          </Alert>

          <TextField
            select label="Select Batch to Write-off" fullWidth required
            value={formData.batch_id}
            onChange={e => setFormData({ ...formData, batch_id: e.target.value })}
            disabled={batches.length === 0}
            helperText={batches.length === 0 ? "No stock available to write off" : ""}
            SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 400 } } } }}
          >
             {renderBatchOptions("Warehouses", groupedBatches.warehouse)}
             {renderBatchOptions("In-Store", groupedBatches.store)}
             {renderBatchOptions("External", groupedBatches.external)}
             {renderBatchOptions("Other Locations", groupedBatches.other)}
          </TextField>

          <TextField 
            label="Quantity to Remove" type="number" fullWidth required
            value={formData.quantity}
            onChange={e => setFormData({...formData, quantity: e.target.value})}
            helperText={selectedBatch ? `Max available: ${selectedBatch.quantity}` : ''}
            error={selectedBatch ? parseInt(formData.quantity) > selectedBatch.quantity : false}
          />

          <TextField
            select label="Reason" fullWidth required
            value={formData.reason}
            onChange={e => setFormData({...formData, reason: e.target.value})}
          >
            {WRITE_OFF_REASONS.map(r => (
              <MenuItem key={r} value={r}>{r}</MenuItem>
            ))}
          </TextField>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          color="error" 
          disabled={loading || !formData.batch_id || !formData.quantity || !formData.reason}
        >
          {loading ? 'Processing...' : 'Confirm Write-off'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};