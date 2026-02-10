-- Rename Offensive Products and Update SKUs (Robust Matching)
UPDATE products
SET name = 'Premium Wheat Flour (5kg)', sku = 'GRO-WHEAT-5KG'
WHERE name ILIKE '%Goaman%';

UPDATE products
SET name = 'Soft Baby Diapers (L)', sku = 'BABY-DIAP-L'
WHERE name ILIKE '%child%marraige%';

UPDATE products
SET name = 'Fresh Basil Leaves', sku = 'VEG-BASIL-100G'
WHERE name ILIKE '%GAANJA%';

UPDATE products
SET name = 'Active Laundry Detergent', sku = 'HH-DET-1L'
WHERE name ILIKE '%Dhobi%';

-- Rename Offensive Suppliers (Robust Matching)
UPDATE suppliers
SET name = 'Global Provisions Ltd'
WHERE name ILIKE '%Goaman%Supplier%';

UPDATE suppliers
SET name = 'Joyful Wholesalers'
WHERE name ILIKE '%Joy%chomu%';

UPDATE suppliers
SET name = 'Green Leaf Traders'
WHERE name ILIKE '%Gaanja%';

-- Rename Offensive Locations and Clear Descriptions (Robust Matching)
UPDATE locations 
SET name = 'Main Warehouse Aisle 1', description = '' 
WHERE name ILIKE '%Goaman%shemdu%';

UPDATE locations 
SET name = 'Store Aisle 4', description = '' 
WHERE name ILIKE '%Goaman%aisle%';

UPDATE locations 
SET name = 'Beverage Section', description = '' 
WHERE name ILIKE '%Joy%island%';

UPDATE locations 
SET name = 'Garden Center', description = '' 
WHERE name ILIKE '%Weed%store%';
