import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

/**
 * POST /api/payments/dodo/create-checkout
 * 
 * Creates a Dodo checkout session from an order.
 * Handles both existing and new orders.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let order: any = null;
    const { orderId } = body;

    // Try to load existing order if CUID format
    if (orderId && typeof orderId === 'string' && /^c[a-z0-9]{24}$/.test(orderId)) {
      order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
          items: true,
        },
      });
    }

    // If order doesn't exist, create from payload
    if (!order) {
      const createOrderSchema = z.object({
        items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1), price: z.number().min(0) })).min(1),
        total: z.number().min(0),
        subtotal: z.number().min(0).optional(),
        shippingCost: z.number().min(0).optional(),
        tax: z.number().min(0).optional(),
        userId: z.string().optional(),
        userEmail: z.string().email().optional(),
        userName: z.string().optional(),
        orderNumber: z.string().optional(),
        address: z.object({
          fullName: z.string(),
          phone: z.string(),
          addressLine1: z.string(),
          addressLine2: z.string().optional(),
          city: z.string(),
          state: z.string(),
          zipCode: z.string(),
          country: z.string().optional(),
        }).optional(),
      });

      try {
        const createData = createOrderSchema.parse(body);
        const created = await prisma.$transaction(async (tx) => {
          let addressId: string | undefined;

          if (createData.address) {
            if (!createData.userId) throw new Error('Missing userId for address');
            const addr = await tx.address.create({
              data: {
                userId: createData.userId,
                fullName: createData.address.fullName,
                phone: createData.address.phone,
                addressLine1: createData.address.addressLine1,
                addressLine2: createData.address.addressLine2 ?? null,
                city: createData.address.city,
                state: createData.address.state,
                zipCode: createData.address.zipCode,
                country: createData.address.country ?? 'India',
              },
            });
            addressId = addr.id;
          } else if (createData.userId) {
            const existing = await tx.address.findFirst({ where: { userId: createData.userId, isDefault: true } });
            if (existing) addressId = existing.id;
          }

          if (!addressId) throw new Error('Missing shipping address');

          return await tx.order.create({
            data: {
              orderNumber: createData.orderNumber ?? `ASC-${Date.now()}`,
              userId: createData.userId ?? null,
              userEmail: createData.userEmail ?? '',
              userName: createData.userName ?? '',
              addressId,
              subtotal: createData.subtotal ?? createData.total,
              shippingCost: createData.shippingCost ?? 0,
              tax: createData.tax ?? 0,
              total: createData.total,
              paymentMethod: 'DODO',
              status: 'PLACED',
              items: { create: createData.items.map((it) => ({ productId: it.productId, quantity: it.quantity, price: it.price })) },
            },
            include: { items: true },
          });
        });

        order = await prisma.order.findUnique({
          where: { id: created.id },
          include: { user: { select: { email: true, firstName: true, lastName: true } } },
        });
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 });
        }
        console.error('[ORDER CREATE]', err?.message);
        return NextResponse.json({ error: 'Order creation failed' }, { status: 400 });
      }
    }

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    // Dodo config
    const DODO_ENV = (process.env.DODO_ENVIRONMENT || 'test').toLowerCase();
    const DODO_KEY = DODO_ENV === 'live' ? process.env.DODO_LIVE_SECRET : process.env.DODO_TEST_SECRET;
    const DODO_BASE = DODO_ENV === 'live' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';
    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    if (!DODO_KEY) return NextResponse.json({ error: `DODO key not configured` }, { status: 500 });

    // Create Dodo session
    const total = Number(order.total);
    const amountCents = Math.round(total * 100);

    const payload = {
      product_cart: [{ product_id: process.env.DODO_PRODUCT_ID, quantity: 1, amount: amountCents }],
      customer: { email: order.userEmail ?? '', name: order.userName ?? 'Customer' },
      return_url: `${BASE_URL}/api/payments/dodo/return?orderId=${order.id}`,
      metadata: { order_id: order.id, order_number: order.orderNumber ?? '' },
    };

    const dodoResponse = await fetch(`${DODO_BASE}/checkouts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${DODO_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!dodoResponse.ok) {
      const errorBody = await dodoResponse.text();
      return NextResponse.json({ error: 'Dodo API failed', details: errorBody }, { status: dodoResponse.status });
    }

    const dodoData = await dodoResponse.json();
    const checkoutUrl = dodoData?.checkout_url ?? dodoData?.url;

    if (!checkoutUrl) return NextResponse.json({ error: 'No checkout URL' }, { status: 502 });

    return NextResponse.json({ success: true, checkoutUrl, orderId: order.id, orderNumber: order.orderNumber, amount: total, amountCents });
  } catch (error) {
    console.error('[DODO]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
