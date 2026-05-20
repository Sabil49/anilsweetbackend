# Anilsweets Backend - Complete Setup

A **complete standalone backend** for the Anilsweets Corner payment system. Production-ready Next.js application with PostgreSQL, Prisma ORM, and Dodo Payments integration.

## Requirements

- **Node.js** v18+ ([Download](https://nodejs.org))
- **PostgreSQL** v12+ (local or managed service)
- **Dodo Account** ([Register](https://dodopayments.com))
- **npm** v9+

---

## Quick Start

1. **Navigate to backend folder:**
   ```bash
   cd e:\AniilSweetsCorner\backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Setup environment:**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your values
   ```

4. **Setup database:**
   ```bash
   npm run db:generate
   npm run db:push
   ```

5. **Run development server:**
   ```bash
   npm run dev
   ```

   Backend starts at: **http://localhost:3000**

---

## Project Structure

```
e:\AniilSweetsCorner\backend\
├── app/
│   └── api/
│       └── payments/
│           └── dodo/
│               ├── create-checkout/
│               │   └── route.ts        # Main checkout endpoint
│               └── return/
│                   └── route.ts        # Payment return handler
├── lib/
│   └── prisma.ts                       # Database client
├── prisma/
│   └── schema.prisma                   # Database schema
├── package.json                        # Dependencies
├── .env.example                        # Environment template
├── SETUP_GUIDE.md                      # This file
└── README.md                           # API documentation
```

---

## API Endpoints

### Create Checkout
```
POST /api/payments/dodo/create-checkout
```

Handles two cases:
- **Existing order (CUID):** Loads from database
- **New order:** Creates from client payload

**Request:**
```json
{
  "orderId": "firestore-id-or-cuid",
  "userId": "firebase-uid",
  "userEmail": "user@example.com",
  "userName": "John Doe",
  "total": 150.50,
  "items": [{"productId": "prod_1", "quantity": 2, "price": 75}],
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
  "orderId": "c1a2b3...",
  "orderNumber": "ORD-123"
}
```

---

## Common Commands

```bash
# Development
npm run dev                # Start dev server

# Database
npm run db:generate        # Generate Prisma client
npm run db:push            # Push schema to database
npm run db:migrate         # Create & run migration
npm run db:studio          # Open Prisma GUI

# Production
npm run build              # Build for production
npm start                  # Start production server
```

---

## Environment Variables

### Required
```
DATABASE_URL               # PostgreSQL connection string
DODO_ENVIRONMENT          # 'test' or 'live'
DODO_TEST_SECRET          # Dodo test API key
DODO_LIVE_SECRET          # Dodo live API key
DODO_PRODUCT_ID           # Dodo product ID
NEXT_PUBLIC_BASE_URL      # Your backend domain
```

### Optional
```
NODE_ENV                  # 'development' or 'production'
```

---

## Database

### Local Setup (macOS)
```bash
brew install postgresql
brew services start postgresql
createdb anilsweets_db
```

### Local Setup (Ubuntu)
```bash
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo -u postgres createdb anilsweets_db
```

### Managed Services
- **Railway**: https://railway.app (Recommended)
- **Supabase**: https://supabase.com (Free tier)
- **PlanetScale**: https://planetscale.com

---

## Deployment

### Vercel
```bash
npm i -g vercel
vercel --prod
```

### Railway
1. Go to https://railway.app
2. Create project → Add GitHub repo
3. Add PostgreSQL service
4. Set env vars
5. Deploy

### Self-Hosted VPS
See SETUP_GUIDE.md for detailed instructions

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| `ECONNREFUSED 127.0.0.1:5432` | Start PostgreSQL |
| `DODO_TEST_SECRET must be configured` | Check `.env.local` |
| `Port 3000 in use` | Kill process: `lsof -i :3000; kill -9 <PID>` |
| `Prisma error` | Run `npm run db:generate` |

---

**Version:** 1.0.0
