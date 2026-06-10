import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { z } from 'zod';

/**
 * POST /api/orders
 * Creates an order from a client payload. Expects items to include `price`.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

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
      subtotal: z.number().min(0).optional(),
      total: z.number().min(0).optional(),
      shippingCost: z.number().min(0).optional(),
      tax: z.number().min(0).optional(),
      userId: z.string().optional(),
      userEmail: z.string().email().optional(),
      userName: z.string().optional(),
      orderNumber: z.string().optional(),
      addressId: z.string().min(1),
    });

    const data = createOrderSchema.parse(body);

    // Compute pricing server-side if not provided
    const subtotal = typeof data.subtotal === 'number'
      ? data.subtotal
      : data.items.reduce((s, it) => s + it.price * it.quantity, 0);
    const shippingCost = typeof data.shippingCost === 'number' ? data.shippingCost : subtotal > 500 ? 0 : 25;
    const tax = typeof data.tax === 'number' ? data.tax : +(subtotal * 0.08).toFixed(2);
    const total = typeof data.total === 'number' ? data.total : +(subtotal + shippingCost + tax).toFixed(2);


    // Ensure address exists
    const addr = await prisma.address.findUnique({ where: { id: data.addressId } });
    if (!addr) return NextResponse.json({ error: 'Address not found' }, { status: 404 });

    const created = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber: data.orderNumber ?? `ASC-${Date.now()}`,
          userId: data.userId ?? null,
          userEmail: data.userEmail ?? '',
          userName: data.userName ?? '',
          addressId: data.addressId,
          subtotal,
          shippingCost,
          tax,
          total,
          paymentMethod: 'DODO',
          status: 'PLACED',
          items: {
            create: data.items.map((it) => ({
              productId: it.productId,
              productName: it.productName ?? null,
              quantity: it.quantity,
              price: it.price,
            })),
          },
        },
        include: { items: true },
      });

      return order;
    });

    return NextResponse.json({ order: created }, { status: 201 });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 });
    }
    console.error('[ORDERS] Error creating order:', err);
    return NextResponse.json({ error: 'Internal server error', details: err?.message ?? String(err) }, { status: 500 });
  }
}
