import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useOnlineShopStore } from '../stores/useOnlineShopStore';
import { OnlineOrder } from '../types/online';

function mapRow(row: any): OnlineOrder {
  return {
    id: row.id,
    shopId: row.shop_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone ?? null,
    customerAddress: row.customer_address ?? null,
    items: row.items ?? [],
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee ?? 0,
    total: row.total,
    status: row.status,
    note: row.note ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at ?? null,
    completedAt: row.completed_at ?? null,
  };
}

export function useOrderRealtime(shopId: string | null) {
  const upsertOrder = useOnlineShopStore((s) => s.upsertOrder);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!shopId) return;

    const channel = supabase
      .channel(`orders:${shopId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'online_orders',
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          if (payload.new) {
            upsertOrder(mapRow(payload.new));
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId]);
}
