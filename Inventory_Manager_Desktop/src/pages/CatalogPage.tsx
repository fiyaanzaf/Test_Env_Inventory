import React, { useState } from 'react';
import { Box, Typography, Tabs, Tab, Paper } from '@mui/material';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import LinkIcon from '@mui/icons-material/Link'; // You can keep this icon or use another

// Import Tables
import { ProductTable } from '../components/ProductTable'; 
import { LocationsTable } from '../components/LocationsTable';
import { SuppliersTable } from '../components/SuppliersTable';
import { ProductSuppliersTable } from '../components/ProductSuppliersTable';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other} style={{ width: '100%' }}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export const CatalogPage: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Box sx={{ width: '100%', p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight="bold" color="primary.main">
          Catalog Management
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage products, locations, suppliers, and their relationships.
        </Typography>
      </Box>

      <Paper sx={{ width: '100%', bgcolor: 'background.paper', borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#f8fafc' }}>
          <Tabs value={tabValue} onChange={handleChange} aria-label="catalog tabs">
            <Tab icon={<Inventory2Icon />} iconPosition="start" label="All Products" />
            <Tab icon={<LocationOnIcon />} iconPosition="start" label="Locations" />
            <Tab icon={<LocalShippingIcon />} iconPosition="start" label="Suppliers" />
            {/* RENAMED TAB HERE */}
            <Tab icon={<LinkIcon />} iconPosition="start" label="Product Suppliers" />
          </Tabs>
        </Box>

        <Box sx={{ p: 2 }}>
          <CustomTabPanel value={tabValue} index={0}>
            <ProductTable />
          </CustomTabPanel>
          <CustomTabPanel value={tabValue} index={1}>
            <LocationsTable />
          </CustomTabPanel>
          <CustomTabPanel value={tabValue} index={2}>
            <SuppliersTable />
          </CustomTabPanel>
          <CustomTabPanel value={tabValue} index={3}>
            <ProductSuppliersTable />
          </CustomTabPanel>
        </Box>
      </Paper>
    </Box>
  );
};