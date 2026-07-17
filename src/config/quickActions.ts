import React from 'react';
import { Ionicons } from '@expo/vector-icons';

export type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

/** A tab name navigates straight to that tab's default screen (e.g.
 * `navigation.navigate('Billing')` lands on BillingMain); `{ tab, screen }`
 * drills into a specific screen inside a tab that hosts more than one (the
 * `More` tab's MenuStack). */
export type QuickActionTarget = string | { tab: string; screen: string };

export interface QuickActionDef {
  key: string;
  label: string;
  icon: IoniconsName;
  target: QuickActionTarget;
}

export function navigateToQuickAction(navigation: any, target: QuickActionTarget) {
  if (typeof target === 'string') {
    navigation.navigate(target);
  } else {
    navigation.navigate(target.tab, { screen: target.screen });
  }
}

/**
 * Every screen a shopkeeper can pin to Home's Quick Actions row — a superset
 * of MenuScreen's own SECTIONS (same target screens, same labels), so the
 * "reorder/toggle" editor is really just "pick a subset + order of what's
 * already in More". `t` is `useTranslation()`'s translator, passed in
 * because this needs to live outside a hook to be usable from both the
 * catalog and the default-order fallback.
 */
export function getQuickActionCatalog(t: (key: any) => string): QuickActionDef[] {
  return [
    { key: 'newBill', label: t('newBill'), icon: 'cart-outline', target: 'Billing' },
    { key: 'addProduct', label: t('addProduct'), icon: 'add-circle-outline', target: 'Inventory' },
    { key: 'askAi', label: 'Ask AI', icon: 'sparkles-outline', target: 'AskAi' },
    { key: 'analytics', label: t('analytics'), icon: 'bar-chart-outline', target: { tab: 'More', screen: 'Analytics' } },
    { key: 'expenses', label: t('expenses'), icon: 'wallet-outline', target: { tab: 'More', screen: 'Expenses' } },
    { key: 'udhaar', label: 'Udhaar', icon: 'book-outline', target: { tab: 'More', screen: 'Udhaar' } },
    { key: 'dayClose', label: t('dayClose'), icon: 'lock-closed-outline', target: { tab: 'More', screen: 'DayClose' } },
    { key: 'suppliers', label: t('suppliers'), icon: 'business-outline', target: { tab: 'More', screen: 'Supplier' } },
    { key: 'billHistory', label: 'Bill History', icon: 'receipt-outline', target: { tab: 'More', screen: 'RecordsMain' } },
    { key: 'purchases', label: 'Purchases', icon: 'document-text-outline', target: { tab: 'More', screen: 'Purchases' } },
    { key: 'reorder', label: 'Reorder Stock', icon: 'refresh-outline', target: { tab: 'More', screen: 'Reorder' } },
    { key: 'stockTake', label: 'Stock Take', icon: 'checkmark-circle-outline', target: { tab: 'More', screen: 'StockTake' } },
    { key: 'stockTakeHistory', label: 'Past Stock Takes', icon: 'time-outline', target: { tab: 'More', screen: 'StockTakeHistory' } },
    { key: 'quickEdit', label: t('quickEdit'), icon: 'albums-outline', target: { tab: 'More', screen: 'QuickEdit' } },
    { key: 'exports', label: t('exportReports'), icon: 'share-outline', target: { tab: 'More', screen: 'Exports' } },
    { key: 'backupRestore', label: t('backupRestore'), icon: 'cloud-upload-outline', target: { tab: 'More', screen: 'BackupRestore' } },
    { key: 'shopInfo', label: 'Shop Information', icon: 'storefront-outline', target: { tab: 'More', screen: 'ShopInfo' } },
    { key: 'manageOptions', label: t('preferences'), icon: 'options-outline', target: { tab: 'More', screen: 'ManageOptions' } },
    { key: 'reminderSettings', label: t('whatsappMessages'), icon: 'logo-whatsapp', target: { tab: 'More', screen: 'ReminderSettings' } },
    { key: 'settings', label: t('settings'), icon: 'settings-outline', target: { tab: 'More', screen: 'Settings' } },
  ];
}

/** Every pinnable screen must stay reachable without opening the editor —
 * enforced both here (UI blocks unchecking below this) and defensively in
 * `reconcileQuickActionPrefs`/`defaultQuickActionPrefs` output shape. */
export const MIN_ENABLED_QUICK_ACTIONS = 3;

/** Default pinned order — the 7 actions the row already shipped with,
 * everything else in the catalog starts unpinned (available in the editor,
 * off by default). */
export const DEFAULT_QUICK_ACTION_ORDER = [
  'newBill', 'addProduct', 'analytics', 'expenses', 'udhaar', 'dayClose', 'suppliers',
];

export interface QuickActionPref {
  key: string;
  enabled: boolean;
}

export function defaultQuickActionPrefs(catalog: QuickActionDef[]): QuickActionPref[] {
  const ordered = DEFAULT_QUICK_ACTION_ORDER
    .map(key => catalog.find(c => c.key === key))
    .filter((c): c is QuickActionDef => !!c)
    .map(c => ({ key: c.key, enabled: true }));
  const rest = catalog
    .filter(c => !DEFAULT_QUICK_ACTION_ORDER.includes(c.key))
    .map(c => ({ key: c.key, enabled: false }));
  return [...ordered, ...rest];
}

/** Merges a saved (possibly stale — catalog can grow over app updates)
 * pref list with the current catalog: known keys keep their saved
 * position/enabled state, catalog entries with no saved pref (new since the
 * user last edited) are appended at the end, disabled by default. */
export function reconcileQuickActionPrefs(saved: QuickActionPref[], catalog: QuickActionDef[]): QuickActionPref[] {
  const savedKeys = new Set(saved.map(p => p.key));
  const known = saved.filter(p => catalog.some(c => c.key === p.key));
  const added = catalog.filter(c => !savedKeys.has(c.key)).map(c => ({ key: c.key, enabled: false }));
  return [...known, ...added];
}
