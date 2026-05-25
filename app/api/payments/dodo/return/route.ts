import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

/**
 * GET /api/payments/dodo/return
 * Handles redirect from Dodo checkout after user completes/cancels payment.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const sessionId = searchParams.get('session_id');
    const status = searchParams.get('status');

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    // Load the order
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Update order status based on Dodo callback (optional)
    if (status === 'success' || status === 'completed') {
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
      });
    } else if (status === 'failed' || status === 'cancelled') {
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'FAILED', status: 'FAILED' },
      });
    }

    // Redirect to the app via deep link. If the app is not installed,
    // show a fallback page with instructions.
    const deepLink = `aniilsweets://order-success?orderId=${encodeURIComponent(orderId)}`;
    return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Return to App</title></head><body style="font-family: sans-serif; text-align: center; padding: 2rem;">
      <h1>Returning to Anil Sweets Corner</h1>
      <p>If you are not redirected automatically, <a href="${deepLink}">tap here to open the app</a>.</p>
      <script>
        window.location = '${deepLink}';
        setTimeout(function() {
          document.body.innerHTML = '<h1>Open the app to complete your order</h1><p>If nothing happened, please open the Anil Sweets Corner app manually.</p>';
        }, 1500);
      </script>
    </body></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('[DODO RETURN] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/payments/dodo/return
 * Handles webhook from Dodo (server-to-server verification)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { session_id, status, order_id } = body;

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    // Find order by session ID (stored in razorpayOrderId field)
    const order = await prisma.order.findFirst({
      where: { razorpayOrderId: session_id },
    });

    if (!order) {
      console.warn('[DODO WEBHOOK] Order not found for session:', session_id);
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Update order status
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
