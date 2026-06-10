import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { z } from 'zod';

/**
 * GET /api/addresses
 * Fetch all addresses for a user
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    const addresses = await prisma.address.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ addresses }, { status: 200 });
  } catch (err: any) {
    console.error('[ADDRESSES GET] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/addresses
 * Create a new address for a user
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const createAddressSchema = z.object({
      userId: z.string().min(1),
      userEmail: z.string().email().optional(),
      fullName: z.string().min(1),
      phone: z.string().min(1),
      address: z.string().min(1), // addressLine1
      addressLine2: z.string().optional(),
      city: z.string().min(1),
      state: z.string().min(1),
      zipCode: z.string().min(1), // pincode
      country: z.string().default('India'),
      isDefault: z.boolean().default(false),
    });

    const data = createAddressSchema.parse(body);

    // If setting as default, unset other defaults for this user
    if (data.isDefault) {
      await prisma.address.updateMany({
        where: { userId: data.userId },
        data: { isDefault: false },
      });
    }

    if (data.userEmail?.trim()) {
      await prisma.user.upsert({
        where: { id: data.userId },
        update: { email: data.userEmail.trim() },
        create: { id: data.userId, email: data.userEmail.trim() },
      });
    } else {
      const existingUser = await prisma.user.findUnique({
        where: { id: data.userId },
      });
      if (!existingUser) {
        await prisma.user.create({
          data: { id: data.userId, email: `${data.userId}@anilsweet.local` },
        });
      }
    }

    const address = await prisma.address.create({
      data: {
        userId: data.userId,
        fullName: data.fullName,
        phone: data.phone,
        addressLine1: data.address,
        addressLine2: data.addressLine2,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        country: data.country,
        isDefault: data.isDefault,
      },
    });

    return NextResponse.json({ address }, { status: 201 });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: err.errors },
        { status: 400 }
      );
    }
    console.error('[ADDRESSES POST] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
