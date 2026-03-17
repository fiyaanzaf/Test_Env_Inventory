import React from 'react';
import {
  Card, CardActionArea, Typography, Box, Chip
} from '@mui/material';
import { type POSProduct } from '../services/posService';

interface ProductCardProps {
  product: POSProduct;
  cartQty: number;        // 0 if not in cart
  onAdd: (product: POSProduct) => void;
}

const ProductCardInner: React.FC<ProductCardProps> = ({ product, cartQty, onAdd }) => {
  const inStock = product.stock_quantity > 0;

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        opacity: inStock ? 1 : 0.6,
        border: cartQty > 0 ? '2px solid #667eea' : '1px solid #e0e0e0',
        position: 'relative'
      }}
    >
      {cartQty > 0 && (
        <Chip
          label={`×${cartQty}`}
          size="small"
          color="primary"
          sx={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}
        />
      )}
      <CardActionArea
        onClick={() => onAdd(product)}
        disabled={!inStock}
        sx={{
          flex: 1, p: 2,
          display: 'flex', flexDirection: 'column',
          alignItems: 'flex-start', justifyContent: 'space-between'
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary">{product.sku}</Typography>
          <Typography fontWeight="bold" sx={{ lineHeight: 1.2 }}>{product.name}</Typography>
        </Box>
        <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
          <Chip
            label={inStock ? `${product.stock_quantity}` : "Out"}
            color={inStock ? (product.stock_quantity < 5 ? "warning" : "default") : "error"}
            size="small"
          />
          <Typography color="primary" fontWeight="bold">₹{product.price}</Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
};

// Custom comparator: only re-render when meaningful props change
export const ProductCard = React.memo(ProductCardInner, (prev, next) => {
  return (
    prev.product.id === next.product.id &&
    prev.product.stock_quantity === next.product.stock_quantity &&
    prev.product.price === next.product.price &&
    prev.product.name === next.product.name &&
    prev.cartQty === next.cartQty &&
    prev.onAdd === next.onAdd
  );
});

export default ProductCard;
