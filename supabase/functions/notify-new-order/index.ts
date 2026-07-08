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

Deno.serve(async (req: Request) => {
  // Verify the request comes from Supabase
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 });
  }

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

  // Get the shop's push token
  const { data: shop } = await supabase
    .from('online_shops')
    .select('expo_push_token, shop_name')
    .eq('id', order.shop_id)
    .single();

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

  const result = await response.json();
  console.log('Expo push result:', JSON.stringify(result));

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
