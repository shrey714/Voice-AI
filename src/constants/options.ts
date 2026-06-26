import type React from 'react';
import { Ionicons } from '@expo/vector-icons';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

// Seed lists for a fresh install. Users extend/trim these in Manage Lists.
export const DEFAULT_PRODUCT_CATEGORIES = ['Stationery', 'Books', 'Electronics', 'Food', 'Clothing', 'General', 'Other'];
export const DEFAULT_UNITS = ['pcs', 'kg', 'g', 'L', 'mL', 'box', 'pack', 'dozen'];

// Expense categories that ship with the app. 'supplier' carries special linking
// logic, so the built-ins are fixed; users only add custom ones on top.
export const BUILTIN_EXPENSE_CATEGORIES: { key: string; label: string; icon: IoniconsName }[] = [
  { key: 'rent',        label: 'Rent',        icon: 'home-outline' },
  { key: 'electricity', label: 'Electricity', icon: 'flash-outline' },
  { key: 'supplier',    label: 'Supplier',    icon: 'cube-outline' },
  { key: 'salary',      label: 'Salary',      icon: 'person-outline' },
  { key: 'other',       label: 'Other',       icon: 'ellipsis-horizontal' },
];
export const CUSTOM_EXPENSE_ICON: IoniconsName = 'pricetag-outline';

// Items that must always exist (DB defaults / fallback) and can't be removed.
export const LOCKED_CATEGORIES = ['General'];
export const LOCKED_UNITS = ['pcs'];
