# Bookstore Server (API)

REST API for the online bookstore, built with **Node.js, Express and MongoDB (Mongoose)**.
It serves the catalogue, accounts, cart, and payments to the React app in `../client`.

> **Status:** Step 1 of 6 - scaffold, data models, seed data. Auth, catalogue routes,
> cart/checkout and the admin area are added in the following steps.

## Requirements

- Node.js 20 or newer
- A MongoDB database: local install, or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster

## Quick start

```bash
cd server
npm install
cp .env.example .env      # then edit .env (see "Environment variables")
npm run seed              # sample shelves, books and the admin account
npm run dev               # API on http://localhost:5000
```

Check it works: open <http://localhost:5000/api/health>. You should see
`{"status":"ok","database":"connected", ...}`.

## Environment variables

Set these in `.env` (never commit that file). `.env.example` lists every option.

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | Signs login tokens. 32+ random characters |
| `JWT_EXPIRES_IN` | no | Login lifetime, default `7d` |
| `PORT` | no | Default `5000` |
| `CLIENT_URL` | no | Origin of the React app (CORS), default `http://localhost:5173` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | no | Admin account created by the seed script |
| `NODE_ENV` | no | `development` or `production` |

The server refuses to start if a required value is missing, and tells you which one.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-restart on file changes |
| `npm start` | Start normally (use this in production) |
| `npm run seed` | Add or update sample data (safe to re-run) |
| `npm run seed:fresh` | Delete categories and books, then seed again |

## Project structure

```
server/
├── src/
│   ├── server.js            entry point: connect to DB, start listening
│   ├── app.js               Express setup: security, parsing, routes
│   ├── config/
│   │   ├── env.js           validated environment settings
│   │   └── db.js            MongoDB connect / disconnect
│   ├── models/
│   │   ├── Category.js      shelves (fiction / non-fiction / educational)
│   │   ├── Book.js          digital titles, price in cents, text search index
│   │   ├── User.js          customers and admins, hashed passwords, cart, library
│   │   └── Order.js         checkout records and payment status
│   ├── middleware/
│   │   └── errorHandler.js  404 + consistent JSON errors
│   ├── utils/ApiError.js    throw errors with an HTTP status
│   └── seed/seed.js         starter data
├── .env.example
└── package.json
```

## How the store stays extensible

Every book belongs to one or more **categories**, and each category has a `type`
(`fiction`, `non-fiction`, `educational`). To add a new kind of book later, create
categories of that type. No code or redesign is needed.

## Data notes

- **Prices** are stored in cents (`299` = $2.99) to avoid rounding errors.
- **Book files** are private. The database keeps only a storage key, which is never
  returned by public queries. Buyers get short-lived download links after payment.
- **Passwords** are stored as bcrypt hashes and never returned by the API.
- **Orders** become `paid` only when the payment provider's server-to-server webhook confirms it.

## Security defaults already in place

Helmet security headers, CORS limited to `CLIENT_URL`, request body size limit,
rate limiting, and error messages that hide internals in production.

## Deployment (summary)

1. Create a production MongoDB (Atlas) and set `MONGODB_URI`.
2. On the host (Render, Railway, a VPS...) set the environment variables above with
   `NODE_ENV=production` and a fresh `JWT_SECRET`.
3. Build command: `npm install` - Start command: `npm start`.
4. Set `CLIENT_URL` to the live website address.

Full deployment notes are added once payments and uploads are in place (step 6).
