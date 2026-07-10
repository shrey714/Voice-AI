// Supabase Edge Function — triggered by DB webhook on INSERT into online_orders.
// Fetches the shop's Expo push token and sends a push notification via Expo Push API.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: {
    id: string;
    shop_id: string;
    customer_name: string;
    total: number;
    items: { productName: string; quantity: number }[];
    status: string;
  };
}

// Shape of a single entry in Expo's push API response — errors can surface
// either as a top-level request error or per-ticket, so both are checked below.
// https://docs.expo.dev/push-notifications/sending-notifications/#push-ticket-errors
interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

Deno.serve(async (req: Request) => {
  // Auth is already enforced at the platform level (verify_jwt, the default
  // for deployed functions) — it rejects any request without a validly
  // signed Supabase JWT before this code ever runs. A second manual check
  // here comparing against Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') used to
  // live in this spot, but that env var isn't guaranteed to be auto-injected
  // (unlike SUPABASE_URL/SUPABASE_ANON_KEY) — when it's undefined the check
  // becomes `Bearer <token>' !== 'Bearer undefined'`, which is always true,
  // so every request (including Supabase's own Database Webhook calls) was
  // rejected with a 401 regardless of how it was authenticated. Removed.
  try {
    const payload: WebhookPayload = await req.json();

    // Only fire on new pending orders
    if (payload.type !== 'INSERT' || payload.record.status !== 'pending') {
      return new Response('ok', { status: 200 });
    }

    const order = payload.record;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: shop, error: shopError } = await supabase
      .from('online_shops')
      .select('expo_push_token, shop_name')
      .eq('id', order.shop_id)
      .single();

    if (shopError) {
      console.error(`[notify-new-order] failed to look up shop ${order.shop_id}:`, shopError.message);
      // Still 200 — this isn't the webhook's fault, and Supabase Database
      // Webhooks don't retry non-2xx responses in a way that would help here
      // anyway (the shop lookup would just fail identically on retry).
      return new Response('shop lookup failed', { status: 200 });
    }
    if (!shop?.expo_push_token) {
      return new Response('no push token', { status: 200 });
    }

    const itemSummary = order.items
      .slice(0, 2)
      .map((i) => `${i.quantity}× ${i.productName}`)
      .join(', ');
    const moreItems = order.items.length > 2 ? ` +${order.items.length - 2} more` : '';

    const message = {
      to: shop.expo_push_token,
      channelId: 'online-orders',
      title: `New order from ${order.customer_name}`,
      body: `${itemSummary}${moreItems} · ₹${order.total}`,
      data: { orderId: order.id, screen: 'OnlineOrderDetail' },
      sound: 'default',
      priority: 'high',
    };

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(message),
    });

    const result: { data?: ExpoPushTicket; errors?: unknown[] } = await response.json();
    const ticket = result.data;

    // DeviceNotRegistered means the underlying FCM/APNs registration is
    // permanently dead (app uninstalled, data cleared, etc.) — Expo will
    // never be able to deliver to this exact token again. Clearing it stops
    // every future order silently failing against a token that can't
    // recover on its own; the app will register a fresh one and re-save it
    // next time it's opened with a granted permission.
    if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      console.warn(`[notify-new-order] token dead for shop ${order.shop_id}, clearing it`);
      await supabase
        .from('online_shops')
        .update({ expo_push_token: null })
        .eq('id', order.shop_id);
    } else if (ticket?.status === 'error') {
      console.error('[notify-new-order] Expo push ticket error:', ticket.message, ticket.details);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[notify-new-order] unhandled error:', e);
    return new Response('internal error', { status: 500 });
  }
});
