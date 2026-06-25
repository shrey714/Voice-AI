import * as Notifications from 'expo-notifications';
import { Product } from '../types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotifications(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

type ProductWithSupplier = Product & { supplierName?: string; supplierPhone?: string };

export async function sendLowStockAlerts(products: ProductWithSupplier[]): Promise<void> {
  for (const product of products) {
    const supplierNote = product.supplierName ? ` — Reorder from ${product.supplierName}` : '';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Low Stock Alert',
        body: `${product.name}: only ${product.quantity} ${product.unit} left${supplierNote}`,
        data: {
          productId: product.id,
          supplierName: product.supplierName ?? null,
          supplierPhone: product.supplierPhone ?? null,
        },
      },
      trigger: null,
    });
  }
}
