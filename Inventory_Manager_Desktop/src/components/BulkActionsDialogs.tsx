import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, MenuItem, Box, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Alert, ListSubheader, Chip, CircularProgress
} from '@mui/material';
import { getLocations, type Location, bulkReceive, bulkTransfer, getProductStock } from '../services/inventoryService';

// Helper to Group Locations (Reused logic)
const groupLocationsByType = (locations: Location[]) => {
  const groups = { warehouse: [] as Location[], store: [] as Location[], external: [] as Location[], other: [] as Location[] };
  locations.forEach(loc => {
    const type = loc.type?.toLowerCase() || 'other';
    if (type === 'warehouse') groups.warehouse.push(loc);
    else if (type === 'store') groups.store.push(loc);
    else if (type === 'external') groups.external.push(loc);
    else groups.other.push(loc);
  });
  return groups;
};

// Extended location type with stock info
interface LocationWithStock extends Location {
  totalStock: number;
  productStocks: Record<number, number>; // product_id -> quantity at this location
}

interface BulkProps {
  open: boolean;
  onClose: () => void;
  selectedProducts: any[]; // List of selected product objects
  mode: 'receive' | 'transfer'; // Only these two modes
  onSuccess: () => void;
}

export const BulkActionsDialog: React.FC<BulkProps> = ({ open, onClose, selectedProducts, mode, onSuccess }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsWithStock, setLocationsWithStock] = useState<LocationWithStock[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);
  
  // Form State - store as strings for TextField compatibility
  const [formData, setFormData] = useState<{ location_id: string; from_id: string; to_id: string }>({ 
    location_id: '', 
    from_id: '', 
    to_id: '' 
  });
  // We store quantity/cost for each product ID
  const [itemsData, setItemsData] = useState<Record<number, { qty: string, cost: string }>>({});
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      // Fetch locations when dialog opens
      setLocationsLoading(true);
      setStockLoading(true);
      
      const fetchData = async () => {
        try {
          // 1. Fetch all locations
          const locs = await getLocations();
          setLocations(locs);
          
          // 2. For transfer mode, fetch stock for all selected products
          if (mode === 'transfer' && selectedProducts.length > 0) {
            // Build a map: location_id -> { totalStock, productStocks: { product_id: qty } }
            const stockMap: Record<number, { totalStock: number; productStocks: Record<number, number> }> = {};
            
            // Initialize all locations with zero stock
            locs.forEach(loc => {
              stockMap[loc.id] = { totalStock: 0, productStocks: {} };
            });
            
            // Fetch stock for each selected product
            const stockPromises = selectedProducts.map(p => 
              getProductStock(p.id)
                .then(stockInfo => ({ productId: p.id, stockInfo }))
                .catch(() => ({ productId: p.id, stockInfo: { batches: [] } }))
            );
            
            const stockResults = await Promise.all(stockPromises);
            
            // Aggregate stock per location
            stockResults.forEach(({ productId, stockInfo }) => {
              stockInfo.batches?.forEach((batch: any) => {
                const locId = batch.location_id;
                if (stockMap[locId]) {
                  stockMap[locId].totalStock += batch.quantity || 0;
                  stockMap[locId].productStocks[productId] = 
                    (stockMap[locId].productStocks[productId] || 0) + (batch.quantity || 0);
                }
              });
            });
            
            // Merge into locations
            const locsWithStock: LocationWithStock[] = locs.map(loc => ({
              ...loc,
              totalStock: stockMap[loc.id]?.totalStock || 0,
              productStocks: stockMap[loc.id]?.productStocks || {}
            }));
            
            setLocationsWithStock(locsWithStock);
            
            // Debug log to verify stock data
            console.log('Locations with stock:', locsWithStock);
          } else {
            // For receive mode, no stock info needed
            setLocationsWithStock(locs.map(loc => ({ 
              ...loc, 
              totalStock: 0, 
              productStocks: {} 
            })));
          }
        } catch (err) {
          setError('Failed to load locations or stock data');
        } finally {
          setLocationsLoading(false);
          setStockLoading(false);
        }
      };
      
      fetchData();
      
      // Initialize empty inputs for all selected products
      const initialData: Record<number, { qty: string, cost: string }> = {};
      selectedProducts.forEach(p => {
        initialData[p.id] = { qty: '', cost: '' };
      });
      setItemsData(initialData);
      
      setFormData({ location_id: '', from_id: '', to_id: '' });
      setError('');
    }
  }, [open, selectedProducts, mode]);

  const handleItemChange = (id: number, field: 'qty' | 'cost', value: string) => {
    setItemsData(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    // Convert state to API payload
    const itemsPayload = selectedProducts.map(p => ({
      product_id: p.id,
      quantity: parseInt(itemsData[p.id]?.qty || '0'),
      cost_price: mode === 'receive' ? parseFloat(itemsData[p.id]?.cost || '0') : 0
    })).filter(i => i.quantity > 0); // Remove items where user left qty blank or 0

    if (itemsPayload.length === 0) {
      setError("Please enter a quantity for at least one item.");
      setLoading(false);
      return;
    }

    try {
      if (mode === 'receive') {
        if (!formData.location_id) throw new Error("Please select a destination.");
        await bulkReceive(parseInt(formData.location_id), itemsPayload);
      } else {
        if (!formData.from_id || !formData.to_id) throw new Error("Please select source and destination.");
        if (formData.from_id === formData.to_id) throw new Error("Source and Destination cannot be the same.");
        await bulkTransfer(parseInt(formData.from_id), parseInt(formData.to_id), itemsPayload);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || err.response?.data?.detail || "Action failed");
    } finally {
      setLoading(false);
    }
  };

  // FIX: Get available stock for a product at the selected source location
  const getAvailableAtSource = (productId: number): number => {
    if (!formData.from_id) return 0;
    
    // Convert from_id to number for comparison
    const fromIdNum = parseInt(formData.from_id);
    
    // Find the location with matching id
    const loc = locationsWithStock.find(l => l.id === fromIdNum);
    
    if (!loc) {
      console.log(`Location not found for from_id: ${formData.from_id}`);
      return 0;
    }
    
    const available = loc.productStocks[productId] || 0;
    return available;
  };

  // Render Grouped Dropdown Options with stock info for transfer mode
  const groupedLocs = groupLocationsByType(locationsWithStock.length > 0 ? locationsWithStock : locations);
  
  const renderLocOptions = (disabledId?: string, showStock: boolean = false) => {
    const options: React.ReactNode[] = [];
    const locsToUse = showStock && locationsWithStock.length > 0 ? 
      groupLocationsByType(locationsWithStock) : groupedLocs;
    
    if (locsToUse.warehouse.length > 0) {
      options.push(
        <ListSubheader key="wh-header" sx={{ fontWeight: 'bold', color: '#6366f1' }}>
          Warehouses
        </ListSubheader>
      );
      locsToUse.warehouse.forEach((l: any) => {
        const hasStock = l.totalStock > 0;
        options.push(
          <MenuItem 
            key={`wh-${l.id}`} 
            value={l.id} 
            disabled={l.id.toString() === disabledId || (showStock && !hasStock)}
            sx={{ display: 'flex', justifyContent: 'space-between' }}
          >
            <span>🏭 {l.name}</span>
            {showStock && (
              <Chip 
                label={`Avail: ${l.totalStock}`} 
                size="small" 
                color={hasStock ? 'primary' : 'default'}
                variant="outlined"
                sx={{ ml: 2, fontWeight: 'bold' }}
              />
            )}
          </MenuItem>
        );
      });
    }
    
    if (locsToUse.store.length > 0) {
      options.push(
        <ListSubheader key="st-header" sx={{ fontWeight: 'bold', color: '#10b981' }}>
          In-Store
        </ListSubheader>
      );
      locsToUse.store.forEach((l: any) => {
        const hasStock = l.totalStock > 0;
        options.push(
          <MenuItem 
            key={`st-${l.id}`} 
            value={l.id} 
            disabled={l.id.toString() === disabledId || (showStock && !hasStock)}
            sx={{ display: 'flex', justifyContent: 'space-between' }}
          >
            <span>🏪 {l.name}</span>
            {showStock && (
              <Chip 
                label={`Avail: ${l.totalStock}`} 
                size="small" 
                color={hasStock ? 'success' : 'default'}
                variant="outlined"
                sx={{ ml: 2, fontWeight: 'bold' }}
              />
            )}
          </MenuItem>
        );
      });
    }
    
    if (locsToUse.external.length > 0) {
      options.push(
        <ListSubheader key="ex-header" sx={{ fontWeight: 'bold', color: '#f59e0b' }}>
          External
        </ListSubheader>
      );
      locsToUse.external.forEach((l: any) => {
        const hasStock = l.totalStock > 0;
        options.push(
          <MenuItem 
            key={`ex-${l.id}`} 
            value={l.id} 
            disabled={l.id.toString() === disabledId || (showStock && !hasStock)}
            sx={{ display: 'flex', justifyContent: 'space-between' }}
          >
            <span>🌐 {l.name}</span>
            {showStock && (
              <Chip 
                label={`Avail: ${l.totalStock}`} 
                size="small" 
                color={hasStock ? 'warning' : 'default'}
                variant="outlined"
                sx={{ ml: 2, fontWeight: 'bold' }}
              />
            )}
          </MenuItem>
        );
      });
    }
    
    if (locsToUse.other.length > 0) {
      options.push(
        <ListSubheader key="ot-header" sx={{ fontWeight: 'bold' }}>
          Other
        </ListSubheader>
      );
      locsToUse.other.forEach((l: any) => {
        const hasStock = l.totalStock > 0;
        options.push(
          <MenuItem 
            key={`ot-${l.id}`} 
            value={l.id} 
            disabled={l.id.toString() === disabledId || (showStock && !hasStock)}
            sx={{ display: 'flex', justifyContent: 'space-between' }}
          >
            <span>📍 {l.name}</span>
            {showStock && (
              <Chip 
                label={`Avail: ${l.totalStock}`} 
                size="small" 
                color={hasStock ? 'default' : 'default'}
                variant="outlined"
                sx={{ ml: 2, fontWeight: 'bold' }}
              />
            )}
          </MenuItem>
        );
      });
    }
    
    return options;
  };

  const getTitle = () => {
    if (mode === 'receive') return '📦 Bulk Receive';
    return '🚚 Bulk Transfer';
  };

  const isDataLoading = locationsLoading || stockLoading;

  // FIX: Get selected source location name for display
  const getSourceLocationName = (): string => {
    if (!formData.from_id) return '';
    const fromIdNum = parseInt(formData.from_id);
    const loc = locationsWithStock.find(l => l.id === fromIdNum);
    return loc?.name || '';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {getTitle()} ({selectedProducts.length} Items)
        {isDataLoading && <CircularProgress size={20} sx={{ ml: 2 }} />}
      </DialogTitle>
      <DialogContent>
        
        {/* Top Controls: Location Selection */}
        <Box sx={{ mt: 2, mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {error && <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert>}
          
          {mode === 'receive' && (
            <TextField 
              select 
              label="Destination Location" 
              fullWidth 
              value={formData.location_id} 
              onChange={e => setFormData({...formData, location_id: e.target.value})}
              disabled={isDataLoading || locations.length === 0}
              helperText={isDataLoading ? "Loading locations..." : (locations.length === 0 ? "No locations available" : "")}
            >
              {renderLocOptions()}
            </TextField>
          )}
          
          {mode === 'transfer' && (
            <>
              <TextField 
                select 
                label="From Source" 
                sx={{ flex: 1 }} 
                value={formData.from_id} 
                onChange={e => setFormData({...formData, from_id: e.target.value})}
                disabled={isDataLoading || locations.length === 0}
                helperText={isDataLoading ? "Loading stock data..." : "Select source with available stock"}
              >
                {renderLocOptions(undefined, true)}
              </TextField>
              <TextField 
                select 
                label="To Destination" 
                sx={{ flex: 1 }} 
                value={formData.to_id} 
                onChange={e => setFormData({...formData, to_id: e.target.value})}
                disabled={isDataLoading || locations.length === 0}
                helperText={isDataLoading ? "Loading..." : ""}
              >
                {renderLocOptions(formData.from_id)}
              </TextField>
            </>
          )}
        </Box>

        {/* Item List Table */}
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f8fafc' }}>
              <TableRow>
                <TableCell>Product Name</TableCell>
                {mode === 'transfer' && (
                  <TableCell width={120}>
                    Available
                    {formData.from_id && (
                      <Typography variant="caption" display="block" color="text.secondary">
                        at {getSourceLocationName()}
                      </Typography>
                    )}
                  </TableCell>
                )}
                <TableCell width={140}>Quantity</TableCell>
                {mode === 'receive' && <TableCell width={140}>Cost Price</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {selectedProducts.map(p => {
                const availableQty = mode === 'transfer' ? getAvailableAtSource(p.id) : 0;
                const enteredQty = parseInt(itemsData[p.id]?.qty || '0');
                // FIX: Ensure boolean result, not empty string
                const exceedsAvailable = mode === 'transfer' && !!formData.from_id && enteredQty > availableQty;
                
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">{p.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{p.sku}</Typography>
                    </TableCell>
                    {mode === 'transfer' && (
                      <TableCell>
                        {formData.from_id ? (
                          <Chip 
                            label={availableQty} 
                            size="small" 
                            color={availableQty > 0 ? 'success' : 'error'}
                            variant={availableQty > 0 ? 'filled' : 'outlined'}
                            sx={{ fontWeight: 'bold', minWidth: 50 }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Select source
                          </Typography>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <TextField 
                        size="small" 
                        type="number" 
                        placeholder="0" 
                        fullWidth
                        value={itemsData[p.id]?.qty || ''}
                        onChange={e => handleItemChange(p.id, 'qty', e.target.value)}
                        error={exceedsAvailable}
                        helperText={exceedsAvailable ? `Max: ${availableQty}` : ''}
                        inputProps={{ 
                          min: 0, 
                          max: mode === 'transfer' && formData.from_id ? availableQty : undefined 
                        }}
                        // FIX: Use !! to ensure boolean
                        disabled={mode === 'transfer' && !!formData.from_id && availableQty === 0}
                      />
                    </TableCell>
                    {mode === 'receive' && (
                      <TableCell>
                        <TextField 
                          size="small" type="number" placeholder="0.00" fullWidth
                          value={itemsData[p.id]?.cost || ''}
                          onChange={e => handleItemChange(p.id, 'cost', e.target.value)}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        
        {/* Summary for Transfer */}
        {mode === 'transfer' && formData.from_id && (
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Transfer Summary:</strong> Moving stock from <strong>{getSourceLocationName()}</strong>. 
              System will use <strong>FIFO</strong> (oldest stock first) for each product.
            </Typography>
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          color={mode === 'transfer' ? 'warning' : 'primary'} 
          disabled={loading || isDataLoading}
        >
          {loading ? 'Processing...' : 'Confirm Bulk Action'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};