# Standalone Backend Setup Guide

This is a complete standalone backend for the Anilsweets Corner payment system. It runs independently from any managed service.

## Architecture

```
Backend (Your Server)
├── Database: PostgreSQL
├── API: Next.js
├── Payments: Dodo Payments integration
└── ORM: Prisma

          ↓
       
Mobile App (Expo)
├── Creates order in Firestore
├── Sends checkout request to backend
└── Opens Dodo checkout URL in WebView
```

---

## Prerequisites

- **Node.js**: v18+ (check with `node --version`)
- **npm**: v9+ (check with `npm --version`)
- **PostgreSQL**: v12+ (local or managed service like Railway, Supabase, PlanetScale)
- **Dodo Account**: https://dodopayments.com (get API keys)

---

## Local Development Setup

### Step 1: Clone & Initialize

```bash
# Navigate to backend folder
cd e:\AniilSweetsCorner\backend

# Install dependencies
npm install
```

### Step 2: Configure Environment

```bash
# Copy example env file
cp .env.example .env.local
```

Edit `.env.local`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/anilsweets_db"
DODO_ENVIRONMENT="test"
DODO_TEST_SECRET="your_test_secret"
DODO_LIVE_SECRET="your_live_secret"
DODO_PRODUCT_ID="pdt_0NXgG1Abo7Esjd8sBznXB"
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
NODE_ENV="development"
```

### Step 3: Setup Database

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database (creates tables)
npm run db:push

# Optional: Open Prisma Studio to view data
npm run db:studio
```

### Step 4: Run Development Server

```bash
npm run dev
```

Backend starts at: **http://localhost:3000**

---

## API Endpoints

### `POST /api/payments/dodo/create-checkout`

Creates a Dodo checkout session from an order.

**Request:**
```json
{
  "orderId": "IlRWSpWqBfWR6aXYjFYt",
  "userId": "firebase-uid",
  "userEmail": "user@example.com",
  "userName": "John Doe",
  "orderNumber": "ORD-123",
  "total": 150.50,
  "subtotal": 140,
  "tax": 10.50,
  "shippingCost": 0,
  "items": [
    {
      "productId": "prod_123",
      "productName": "Sweets Box",
      "quantity": 2,
      "price": 70
    }
  ],
  "address": {
    "fullName": "John Doe",
    "phone": "+91-9876543210",
    "addressLine1": "123 Main St",
    "city": "Bangalore",
    "state": "Karnataka",
    "zipCode": "560001"
  }
}
```

**Response:**
```json
{
  "success": true,
  "checkoutUrl": "https://test.dodopayments.com/checkout/...",
  "orderId": "c1a2b3c4d5e6f7g8h9i0j1k2l3m4n5",
  "orderNumber": "ORD-123",
  "amount": 150.50,
  "amountCents": 15050,
  "currency": "INR",
  "sessionId": "sess_abc123"
}
```

### `GET /api/payments/dodo/return`

Handles redirect after Dodo payment.

**Query Params:**
- `orderId` (required): Order ID
- `status`: Payment status

**Response:** Redirects to frontend success page

---

## Database Setup

### Option 1: Local PostgreSQL

**macOS (Homebrew):**
```bash
brew install postgresql
brew services start postgresql
createdb anilsweets_db
```

**Windows:**
- Download: https://www.postgresql.org/download/windows/
- Or use WSL + Ubuntu PostgreSQL

**Linux (Ubuntu):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo -u postgres createdb anilsweets_db
```

### Option 2: Managed PostgreSQL (Recommended for Production)

#### Railway (Easiest)
1. Go to https://railway.app
2. Create new project → Add PostgreSQL
3. Copy connection string to `.env.local`
4. Deploy backend on Railway

#### Supabase
1. Go to https://supabase.com
2. Create new project
3. Database → Copy connection string
4. Replace in `.env.local`

---

## Deployment

### Option 1: Vercel (Easiest for Next.js)

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

**Setup Env Vars in Vercel Dashboard:**
- Project Settings → Environment Variables
- Add all vars from `.env.local`
- Trigger redeploy

### Option 2: Railway

1. Go to https://railway.app
2. Create new project
3. Add GitHub repository
4. Add PostgreSQL service
5. Set environment variables
6. Deploy

### Option 3: Self-Hosted (VPS)

**On your server (Ubuntu/Debian):**

```bash
# SSH into server
ssh user@your-server-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Clone/upload project
git clone <your-repo> anilsweets-backend
cd anilsweets-backend

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your values

# Setup database
npm run db:push

# Build
npm run build

# Run with PM2 (process manager)
npm install -g pm2
pm2 start "npm start" --name "anilsweets-api"
pm2 save
pm2 startup
```

---

## Environment Variables by Platform

### Vercel
```
DATABASE_URL (PostgreSQL URL)
DODO_ENVIRONMENT (test or live)
DODO_TEST_SECRET
DODO_LIVE_SECRET
DODO_PRODUCT_ID
NEXT_PUBLIC_BASE_URL (your live domain)
NODE_ENV (production)
```

### Railway
Same as Vercel (auto-sets DATABASE_URL)

### VPS
Edit `.env` file directly

---

## Testing

### Test Payment Flow Locally

```bash
# Start backend
npm run dev

# In another terminal, test endpoint
curl -X POST http://localhost:3000/api/payments/dodo/create-checkout \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "userEmail": "test@example.com",
    "total": 100,
    "items": [{"productId": "prod_1", "quantity": 1, "price": 100}],
    "address": {
      "fullName": "Test User",
      "phone": "9876543210",
      "addressLine1": "123 St",
      "city": "City",
      "state": "State",
      "zipCode": "12345"
    }
  }'
```

---

## Troubleshooting

### Database Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution:** Ensure PostgreSQL is running
```bash
# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

### Dodo API Key Error
```
error: DODO_TEST_SECRET must be configured
```
**Solution:** Check `.env.local` has correct keys from Dodo dashboard

### Port 3000 Already in Use
```bash
# macOS/Linux
lsof -i :3000
kill -9 <PID>

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

## Production Checklist

- [ ] Use PostgreSQL (not local SQLite)
- [ ] Set `NODE_ENV=production`
- [ ] Set `DODO_ENVIRONMENT=live` when ready
- [ ] Add `DODO_LIVE_SECRET` to env vars
- [ ] Setup SSL/HTTPS certificate
- [ ] Enable database backups
- [ ] Setup monitoring (e.g., Sentry, New Relic)
- [ ] Set up error logs
- [ ] Configure CORS for frontend domain
- [ ] Use strong database password
- [ ] Enable database firewall rules

---

**Version:** 1.0.0  
**Last Updated:** May 2026
