/**
 * Item Type Helper Functions
 * Utility functions for item and unit type lookups
 * 
 * Core Catalog Item Types (Mandatory) - Must match invoice line item types exactly:
 * - service: Consulting, maintenance, professional work (💼)
 * - product: Retail goods, inventory items (📦)
 * - labor: Construction, repair work (👨‍🔧)
 * - material: Construction, manufacturing materials (🧱)
 * - expense: Business expenses, reimbursements (💸)
 */

const ITEM_TYPES = [
  { value: 'service', label: 'Service', icon: '💼', description: 'Consulting, maintenance, professional work' },
  { value: 'product', label: 'Product', icon: '📦', description: 'Retail goods, inventory items' },
  { value: 'labor', label: 'Labor', icon: '👨‍🔧', description: 'Construction, repair work' },
  { value: 'material', label: 'Material', icon: '🧱', description: 'Construction, manufacturing materials' },
  { value: 'expense', label: 'Expense', icon: '💸', description: 'Business expenses, reimbursements' }
];

const UNIT_TYPES = {
  service: [
    { value: 'unit', label: 'Unit' },
    { value: 'hour', label: 'Hour' },
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' }
  ],
  product: [
    { value: 'piece', label: 'Piece' },
    { value: 'box', label: 'Box' },
    { value: 'set', label: 'Set' },
    { value: 'unit', label: 'Unit' }
  ],
  labor: [
    { value: 'hour', label: 'Hour' },
    { value: 'day', label: 'Day' },
    { value: 'unit', label: 'Unit' }
  ],
  material: [
    { value: 'kilogram', label: 'Kilogram (kg)' },
    { value: 'pound', label: 'Pound (lb)' },
    { value: 'meter', label: 'Meter (m)' },
    { value: 'sqmeter', label: 'Square Meter (m²)' },
    { value: 'liter', label: 'Liter (L)' },
    { value: 'gallon', label: 'Gallon (gal)' },
    { value: 'unit', label: 'Unit' }
  ],
  expense: [
    { value: 'unit', label: 'Unit' },
    { value: 'day', label: 'Day' },
    { value: 'month', label: 'Month' }
  ]
};

export function getItemTypeIcon(itemType) {
  const type = ITEM_TYPES.find(t => t.value === itemType);
  return type ? type.icon : '📋';
}

export function getItemTypeLabel(itemType) {
  const type = ITEM_TYPES.find(t => t.value === itemType);
  return type ? type.label : itemType;
}

export function getUnitLabel(itemType, unit) {
  const units = UNIT_TYPES[itemType] || UNIT_TYPES.service;
  const unitObj = units.find(u => u.value === unit);
  return unitObj ? unitObj.label : unit;
}

export { ITEM_TYPES, UNIT_TYPES };
