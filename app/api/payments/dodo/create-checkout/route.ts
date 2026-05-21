import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { z } from 'zod';

/**
 * POST /api/payments/dodo/create-checkout
 * 
 * Creates a Dodo checkout session from an order.
 * Handles two cases:
 * 1. Existing SQL Order (CUID format): Load from DB
 * 2. Create Order if Missing: Create from client payload
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // ── 1. Try to load existing order if orderId is provided ───────────────
    let order: any = null;
    const { orderId } = body;

    // Only try to load if orderId looks like a CUID
    if (orderId && typeof orderId === 'string' && /^c[a-z0-9]{24}$/.test(orderId)) {
      order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          user: {
            select: { email: true, firstName: true, lastName: true },
          },
          items: true,
        },
      });
    }

    // If order doesn't exist, attempt to create it from client-provided payload
    if (!order) {
      const createOrderSchema = z.object({
        items: z
          .array(
            z.object({
              productId: z.string().min(1),
              productName: z.string().optional(),
              quantity: z.number().int().min(1),
              price: z.number().min(0),
            }),
          )
          .min(1),
        total: z.number().min(0),
        subtotal: z.number().min(0).optional(),
        shippingCost: z.number().min(0).optional(),
        tax: z.number().min(0).optional(),
        userId: z.string().optional(),
        userEmail: z.string().email().optional(),
        userName: z.string().optional(),
        orderNumber: z.string().optional(),
        address: z
          .object({
            fullName: z.string(),
            phone: z.string(),
            addressLine1: z.string(),
            addressLine2: z.string().optional(),
            city: z.string(),
            state: z.string(),
            zipCode: z.string(),
            country: z.string().optional(),
            isDefault: z.boolean().optional(),
          })
          .optional(),
      });

      try {
        const createData = createOrderSchema.parse(body);

        // Transactionally create address (if provided) and order + items
        const created = await prisma.$transaction(async (tx) => {
          let addressId: string | undefined;

          // Ensure user exists in PostgreSQL before creating address
          let userId = createData.userId;
          if (userId) {
            const user = await tx.user.upsert({
              where: { id: userId },
              update: {
                email: createData.userEmail || '',
              },
              create: {
                id: userId,
                email: createData.userEmail || '',
              },
            });
            userId = user.id;
          }

          if (createData.address) {
            if (!userId) {
              throw new Error('Missing userId for provided address');
            }
            const addr = await tx.address.create({
              data: {
                userId,
                fullName: createData.address.fullName,
                phone: createData.address.phone,
                addressLine1: createData.address.addressLine1,
                addressLine2: createData.address.addressLine2 ?? null,
                city: createData.address.city,
                state: createData.address.state,
                zipCode: createData.address.zipCode,
                country: createData.address.country ?? 'India',
                isDefault: createData.address.isDefault ?? false,
              },
            });
            addressId = addr.id;
          } else if (userId) {
            // try to find a default address for the user
            const existing = await tx.address.findFirst({
              where: { userId, isDefault: true },
            });
            if (existing) addressId = existing.id;
          }

          if (!addressId) {
            // address is required by schema; fail with clear message
            throw new Error('Missing shipping address. Provide `address` or ensure user has a default address.');
          }

          const createdOrder = await tx.order.create({
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
              items: {
                create: createData.items.map((it) => ({
                  productId: it.productId,
                  productName: it.productName,
                  quantity: it.quantity,
                  price: it.price,
                })),
              },
            },
            include: { items: true },
          });

          return createdOrder;
        });

        // reload order with user info
        order = await prisma.order.findUnique({
          where: { id: created.id },
          include: { user: { select: { email: true, firstName: true, lastName: true } } },
        });
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return NextResponse.json({ error: 'Order creation validation failed', details: err.errors }, { status: 400 });
        }
        console.error('[ORDER CREATE] error:', err?.message ?? err);
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
    }

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.paymentStatus === 'PAID') {
      return NextResponse.json({ error: 'Order already paid', orderId }, { status: 400 });
    }
    if (order.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Order is cancelled', orderId }, { status: 400 });
    }

    // ── 2. Derive total from DB (never trust the client) ─────────────────────
    const totalNumber =
      typeof order.total === 'object' && order.total !== null && 'toNumber' in order.total
        ? (order.total as { toNumber(): number }).toNumber()
        : Number(order.total);

    const amountCents = Math.round(totalNumber * 100);
    if (!amountCents || amountCents <= 0) {
      return NextResponse.json({ error: 'Invalid order amount' }, { status: 400 });
    }

    // ── 3. Config ─────────────────────────────────────────────────────────
    const DODO_ENVIRONMENT = (process.env.DODO_ENVIRONMENT || 'test').toLowerCase();
    const DODO_PRODUCT_ID = process.env.DODO_PRODUCT_ID || 'pdt_0NXgG1Abo7Esjd8sBznXB';
    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    const DODO_LIVE_SECRET = process.env.DODO_LIVE_SECRET;
    const DODO_TEST_SECRET = process.env.DODO_TEST_SECRET;

    const DODO_API_KEY = DODO_ENVIRONMENT === 'live' ? DODO_LIVE_SECRET : DODO_TEST_SECRET;

    if (DODO_ENVIRONMENT === 'live' && !DODO_LIVE_SECRET) {
      return NextResponse.json({ error: 'DODO_LIVE_SECRET must be configured for live environment' }, { status: 500 });
    }
    if (DODO_ENVIRONMENT === 'test' && !DODO_TEST_SECRET) {
      return NextResponse.json({ error: 'DODO_TEST_SECRET must be configured for test environment' }, { status: 500 });
    }
    if (!DODO_API_KEY) {
      return NextResponse.json({ error: `DODO API key not configured for environment: ${DODO_ENVIRONMENT}` }, { status: 500 });
    }

    if (DODO_ENVIRONMENT !== 'live' && DODO_ENVIRONMENT !== 'test') {
      return NextResponse.json({ error: `Unsupported DODO_ENVIRONMENT: ${DODO_ENVIRONMENT}. Use 'live' or 'test'.` }, { status: 500 });
    }

    const DODO_API_BASE = DODO_ENVIRONMENT === 'live' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';

    // ── 4. Build checkout session payload ─────────────────────────────────
    const customerEmail = order.userEmail ?? order.user?.email ?? '';
    const customerName =
      (order.userName ?? `${order.user?.firstName ?? ''} ${order.user?.lastName ?? ''}`.trim()) || 'Customer';

    const returnUrl = `${BASE_URL}/api/payments/dodo/return?orderId=${order.id}`;

    const payload = {
      product_cart: [
        {
          product_id: DODO_PRODUCT_ID,
          quantity: 1,
          amount: amountCents,
        },
      ],
      customer: {
        email: customerEmail,
        name: customerName,
      },
      return_url: returnUrl,
      metadata: {
        order_id: order.id,
        order_number: order.orderNumber ?? '',
        user_id: order.userId ?? '',
        amount_cents: amountCents.toString(),
      },
    };

    // ── 5. Create checkout session ───────────────────────────────────────
    const apiUrl = `${DODO_API_BASE}/checkouts`;
    const maskedKey = `${DODO_API_KEY?.slice(0, 4)}...${DODO_API_KEY?.slice(-4)}`;
    console.log('[DODO] Creating checkout session', { apiUrl, environment: DODO_ENVIRONMENT, productId: DODO_PRODUCT_ID, keyHint: maskedKey, amountCents });

    let dodoResponse: Response;
    try {
      dodoResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DODO_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (fetchError) {
      console.error('[DODO] Network error:', fetchError);
      return NextResponse.json(
        {
          error: 'Failed to reach Dodo API',
          details: fetchError instanceof Error ? fetchError.message : 'Unknown',
        },
        { status: 502 },
      );
    }

    console.log('[DODO] Response status:', dodoResponse.status);

    if (!dodoResponse.ok) {
      const errorBody = await dodoResponse.text().catch(() => '(unreadable)');
      console.error('[DODO] Error body:', errorBody.substring(0, 1000));
      return NextResponse.json(
        {
          error: 'Dodo API rejected the request',
          status: dodoResponse.status,
          details: errorBody.substring(0, 500),
        },
        { status: dodoResponse.status >= 400 && dodoResponse.status < 500 ? 400 : 502 },
      );
    }

    const dodoData = await dodoResponse.json();
    console.log('[DODO] Session created:', JSON.stringify(dodoData, null, 2));

    const checkoutUrl = dodoData?.checkout_url ?? dodoData?.url ?? dodoData?.payment_link ?? dodoData?.checkoutUrl;

    if (!checkoutUrl) {
      console.error('[DODO] No checkout URL in response:', dodoData);
      return NextResponse.json({ error: 'No checkout URL in Dodo response', response: dodoData }, { status: 502 });
    }

    // Persist session id on the order (best-effort)
    const sessionId = dodoData?.session_id ?? dodoData?.id;
    if (sessionId) {
      await prisma.order.update({ where: { id: order.id }, data: { razorpayOrderId: sessionId } }).catch((e) =>
        console.warn('[DODO] Could not persist session ID:', e),
      );
    }

    return NextResponse.json({
      success: true,
      checkoutUrl,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: totalNumber,
      amountCents,
      currency: 'INR',
      sessionId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('[DODO] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}
