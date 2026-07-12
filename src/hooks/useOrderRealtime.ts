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

    // supabase-js keeps an internal registry of channels keyed by topic
    // name — `removeChannel()` (the cleanup below) sends an async
    // unsubscribe that doesn't necessarily finish before a fast remount's
    // effect creates a "new" channel with the same name. `channel()` can
    // then hand back the OLD (already-subscribed) registry entry instead of
    // a fresh one, and calling `.on()` on an already-subscribed channel
    // throws "cannot add postgres_changes callbacks... after subscribe()".
    // Rapidly toggling Local/Online mode (which mounts/unmounts this hook's
    // owning screen repeatedly) hits exactly this race. A unique suffix per
    // mount guarantees this run never collides with a still-tearing-down
    // channel from a previous run.
    const channel = supabase
      .channel(`orders:${shopId}:${Date.now()}:${Math.random().toString(36).slice(2)}`)
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
