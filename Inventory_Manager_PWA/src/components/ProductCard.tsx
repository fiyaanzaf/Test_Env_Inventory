import React from 'react';
import {
  Card, CardActionArea, Typography, Box, Chip
} from '@mui/material';
import { type POSProduct } from '../services/posService';

interface ProductCardProps {
  product: POSProduct;
  cartQty: number;
  onAdd: (product: POSProduct) => void;
}

const ProductCardInner: React.FC<ProductCardProps> = ({ product, cartQty, onAdd }) => {
  const inStock = product.stock_quantity > 0;

  return (
    <Card
      variant="outlined"
      sx={{
        opacity: inStock ? 1 : 0.5,
        border: cartQty > 0 ? '2px solid' : '1px solid',
        borderColor: cartQty > 0 ? 'primary.main' : 'divider',
        borderRadius: 2,
        position: 'relative'
      }}
    >
      {cartQty > 0 && (
        <Chip
          label={`×${cartQty}`}
          size="small"
          color="primary"
          sx={{ position: 'absolute', top: 4, right: 4, zIndex: 1, height: 22, fontSize: '0.7rem' }}
        />
      )}
      <CardActionArea
        onClick={() => onAdd(product)}
        disabled={!inStock}
        sx={{ p: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minHeight: 100 }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>{product.sku}</Typography>
        <Typography fontWeight={600} sx={{ lineHeight: 1.2, fontSize: '0.85rem', mb: 'auto' }}>{product.name}</Typography>
        <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
          <Chip
            label={inStock ? product.stock_quantity : 'Out'}
            color={inStock ? (product.stock_quantity < 5 ? 'warning' : 'default') : 'error'}
            size="small"
            sx={{ height: 20, fontSize: '0.65rem' }}
          />
          <Typography color="primary" fontWeight={700} fontSize="0.9rem">₹{product.price}</Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
};

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
