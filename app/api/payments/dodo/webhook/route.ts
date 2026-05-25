import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

const getWebhookKey = () => process.env.DODO_WEBHOOK_KEY;

const verifyWebhook = async (request: NextRequest, body: any) => {
  const expectedKey = getWebhookKey();
  if (!expectedKey) return true;

  const headerKey = request.headers.get('x-dodo-webhook-key') || request.headers.get('x-webhook-key') || request.headers.get('x-signature');
  const bodyKey = body?.webhook_key ?? body?.webhookKey ?? body?.signature;

  if (headerKey && headerKey === expectedKey) return true;
  if (bodyKey && bodyKey === expectedKey) return true;

  return false;
};

export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'Dodo webhook endpoint is live' });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { session_id, status } = body;

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    const isValid = await verifyWebhook(request, body);
    if (!isValid) {
      console.warn('[DODO WEBHOOK] Invalid webhook key');
      return NextResponse.json({ error: 'Unauthorized webhook request' }, { status: 401 });
    }

    const order = await prisma.order.findFirst({
      where: { razorpayOrderId: session_id },
    });

    if (!order) {
      console.warn('[DODO WEBHOOK] Order not found for session:', session_id);
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (status === 'completed' || status === 'success') {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
      });
      console.log('[DODO WEBHOOK] Order marked as paid:', order.id);
    } else if (status === 'failed' || status === 'cancelled') {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'FAILED', status: 'FAILED' },
      });
      console.log('[DODO WEBHOOK] Order marked as failed:', order.id);
    }

    return NextResponse.json({ success: true, orderId: order.id });
  } catch (error) {
    console.error('[DODO WEBHOOK] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
