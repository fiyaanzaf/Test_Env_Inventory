import React from 'react';
import { Box, Typography, Divider, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';

export interface ReceiptData {
  orderId: number | string;
  date: string;
  customerName: string;
  items: Array<{ name: string; qty: number; price: number }>;
  total: number;
  paymentMethod: string;
  reference?: string | null;
}

interface Props {
  data: ReceiptData | null;
}

export const ReceiptTemplate = React.forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  if (!data) return null;

  return (
    <div ref={ref} className="printable-receipt" style={{ padding: '20px', fontFamily: 'monospace', width: '100%', maxWidth: '80mm', margin: '0 auto', display: 'none' }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight="bold">INVENTORY MANAGER</Typography>
        <Typography variant="caption">Official Receipt</Typography>
      </Box>

      <Divider sx={{ my: 1, borderStyle: 'dashed' }} />

      {/* Meta */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="caption">Order #{data.orderId}</Typography>
        <Typography variant="caption">{data.date}</Typography>
      </Box>
      <Typography variant="caption" display="block">Cust: {data.customerName}</Typography>
      {/* If a manual bill reference exists, print it */}
      {data.reference && (
         <Typography variant="caption" display="block" fontWeight="bold">Ref/Bill #: {data.reference}</Typography>
      )}

      <Divider sx={{ my: 1, borderStyle: 'dashed' }} />

      {/* Items */}
      <TableContainer>
        <Table size="small" sx={{ '& td, & th': { border: 'none', padding: '2px 0' } }}>
          <TableHead>
            <TableRow>
              <TableCell><Typography variant="caption" fontWeight="bold">Item</Typography></TableCell>
              <TableCell align="right"><Typography variant="caption" fontWeight="bold">Qty</Typography></TableCell>
              <TableCell align="right"><Typography variant="caption" fontWeight="bold">Amt</Typography></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.items.map((item, index) => (
              <TableRow key={index}>
                <TableCell><Typography variant="caption">{item.name}</Typography></TableCell>
                <TableCell align="right"><Typography variant="caption">{item.qty}</Typography></TableCell>
                <TableCell align="right"><Typography variant="caption">{(item.qty * item.price).toFixed(2)}</Typography></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Divider sx={{ my: 1, borderStyle: 'dashed' }} />

      {/* Total */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
        <Typography variant="body2" fontWeight="bold">TOTAL</Typography>
        <Typography variant="body2" fontWeight="bold">₹{data.total.toLocaleString()}</Typography>
      </Box>
      
      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography variant="caption">Paid via: {data.paymentMethod.toUpperCase()}</Typography>
        <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>*** Thank You ***</Typography>
      </Box>
    </div>
  );
});