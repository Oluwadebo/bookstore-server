# Bookstore Server (API)

REST API for the online bookstore, built with **Node.js, Express and MongoDB (Mongoose)**.
It serves the catalogue, accounts, cart, and payments to the React app in `../client`.

> **Status:** Step 3 of 6 - scaffold, models, seed data, authentication, and the catalogue API.
> Cart/checkout and the admin area are added in the following steps.

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
| `COOKIE_SAMESITE` | no | `lax` (default), `strict` or `none`. See "Authentication" |
| `DNS_SERVERS` | no | e.g. `8.8.8.8,1.1.1.1`. Only if your network blocks Atlas (`mongodb+srv`) DNS lookups |

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
│   ├── routes/
│   │   ├── auth.js          signup, login, logout, me
│   │   ├── books.js         browse, keyword search, book detail
│   │   └── categories.js    shelves with book counts
│   ├── middleware/
│   │   ├── auth.js          requireAuth / requireAdmin guards
│   │   └── errorHandler.js  404 + consistent JSON errors
│   ├── utils/
│   │   ├── ApiError.js      throw errors with an HTTP status
│   │   ├── asyncHandler.js  forwards async errors to the error handler
│   │   └── token.js         sign/verify JWT, set/clear login cookie
│   └── seed/seed.js         starter data
├── .env.example
└── package.json
```

## Authentication

Login uses a signed JWT stored in an **httpOnly cookie** (JavaScript in the browser cannot read it).
The React app never handles the token: the browser attaches the cookie to each request.

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/signup` | public | Create account `{ name, email, password }`, signs in, returns `{ user }` |
| `POST /api/auth/login` | public | Sign in `{ email, password }`, returns `{ user }` |
| `POST /api/auth/logout` | public | Clears the cookie |
| `GET /api/auth/me` | signed in | Returns the current `{ user }`, or 401 |

Protect your own routes with the guards in `src/middleware/auth.js`:

```js
router.get("/orders", requireAuth, handler);                    // any signed-in user
router.post("/books", requireAuth, requireAdmin, handler);      // admins only
```

Built-in protections:
- Passwords: minimum 8 characters, stored as bcrypt hashes (cost 12), never returned.
- Login and signup allow 10 failed attempts per 15 minutes per IP.
- The same error ("Invalid email or password") is returned for unknown emails and wrong passwords.
- Inputs must be strings, which blocks NoSQL operator injection.
- The `role` field can never be set from the signup request. Admins come from the seed script.
- Tokens are verified with a pinned algorithm (HS256) and the user is re-loaded on every request.

**Cookies in production:** deploy the site and API on the same registrable domain
(for example `yourstore.com` and `api.yourstore.com`) and keep `COOKIE_SAMESITE=lax`.
Only use `none` if they must live on unrelated domains (it needs HTTPS and is less safe).

## Catalogue API

Public, read-only. Only published books are returned, and private file details never are.

| Request | Purpose |
|---|---|
| `GET /api/books` | Browse and search (options below) |
| `GET /api/books/:slug` | One book plus up to 4 related titles: `{ book, related }` |
| `GET /api/categories` | All shelves with `bookCount`. Optional `?type=fiction` |
| `GET /api/categories/:slug` | One shelf |

Options for `GET /api/books`:

| Option | Example | Meaning |
|---|---|---|
| `search` | `?search=sherlock` | Keywords, matched against title, author, tags, description |
| `category` | `?category=fantasy` | A shelf slug (its sub-shelves are included) |
| `type` | `?type=fiction` | `fiction`, `non-fiction` or `educational` |
| `featured` | `?featured=true` | Featured books only |
| `sort` | `?sort=price-asc` | `relevance` (search only), `newest`, `price-asc`, `price-desc`, `title` |
| `page`, `limit` | `?page=2&limit=12` | Paging. `limit` is 1-48, default 12 |

The response is `{ books, page, limit, total, totalPages }`.

**How search works:** first MongoDB full-text search (ranked, title matches first). If that finds
nothing, it falls back to partial matching so `holm` still finds "Sherlock Holmes". The text index is
created automatically the first time the server or seed script connects.

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
