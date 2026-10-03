# Bookstore Server (API)

REST API for the online bookstore, built with **Node.js, Express and MongoDB (Mongoose)**.
It serves the catalogue, accounts, cart, and payments to the React app in `../client`.

> **Status:** Step 5 of 6 - everything a customer needs (catalogue, cart, Paystack checkout, library, password
> reset) plus a marketplace admin area: sellers upload books, the owner takes a commission, and earnings,
> statements and payouts are tracked. Final polish and hand-off come next.

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
| `PAYMENT_PROVIDER` | no | `paystack` (default). See "Payments" |
| `PAYSTACK_SECRET_KEY` | for checkout | Paystack secret key. `sk_test_...` for testing, `sk_live_...` only on the live server |
| `STORE_CURRENCY` | no | Currency for new books and the seed data, e.g. `NGN` or `USD`. Default `USD` |
| `STORAGE_DIR` | no | Private folder for book files, default `storage/books` |
| `COVERS_DIR` | no | Public cover images, default `storage/covers` (served at `/api/covers`) |
| `TMP_DIR` | no | Where uploads wait while being checked, default `storage/tmp` |
| `MAX_BOOK_FILE_MB` | no | Largest book file an admin can upload, default `50`, max `500` |
| `COMMISSION_PERCENT` | no | The store's starting cut of each seller's list price, default `10`. Changed later in Admin > Earnings |
| `PASS_FEES_TO_CUSTOMER` | no | `true` (default): the payment fee is added on top of the price (Naira only) |
| `FEE_PERCENT`, `FEE_FIXED`, `FEE_FIXED_WAIVED_BELOW`, `FEE_CAP` | no | Paystack's local-card pricing used to work out that fee (defaults 1.5, 100, 2500, 2000 Naira) |
| `STORE_UTC_OFFSET_HOURS` | no | Statement months follow this clock, default `1` (Nigeria) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | for password reset in production | Any SMTP provider. Leave `SMTP_HOST` empty in development and the reset link prints in the server console |
| `DNS_SERVERS` | no | e.g. `8.8.8.8,1.1.1.1`. Only if your network blocks Atlas (`mongodb+srv`) DNS lookups |

The server refuses to start if a required value is missing, and tells you which one.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-restart on file changes |
| `npm start` | Start normally (use this in production) |
| `npm run seed` | Add or update sample data (safe to re-run) |
| `npm run seed:fresh` | Delete categories and books, then seed again |
| `npm run make-admin -- someone@example.com` | Make an existing customer an admin. Add `--remove` to undo, or `--owner` to transfer ownership |

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
│   │   ├── Order.js         checkout records and payment status
│   │   ├── AdminRequest.js  applications to become an admin
│   │   ├── ShelfRequest.js  admins asking the owner for a new shelf
│   │   ├── Payout.js        record of money paid to a seller
│   │   └── Setting.js       owner-editable settings (default commission)
│   ├── routes/
│   │   ├── auth.js          signup, login, logout, me
│   │   ├── books.js         browse, keyword search, book detail
│   │   ├── categories.js    shelves with book counts
│   │   ├── cart.js          shopping cart (signed-in customers)
│   │   ├── orders.js        checkout, payment verification, order history
│   │   ├── payments.js      payment provider webhook
│   │   ├── library.js       purchased books and download links
│   │   ├── downloads.js     expiring file downloads
│   │   ├── admin.js         admin guard, dashboard stats, orders
│   │   ├── adminBooks.js    add/edit/delete books, upload files and covers
│   │   ├── adminCategories.js  add/edit/delete shelves
│   │   ├── adminTeam.js     owner-only: approve/decline applications, remove admins
│   │   ├── adminRequests.js customers apply to become an admin
│   │   ├── adminShelfRequests.js  admins request shelves, the owner decides
│   │   └── adminEarnings.js sales, statements, payouts, commission settings
│   ├── payments/            gateway adapters (paystack.js): swap providers here
│   ├── services/
│   │   ├── orders.js        turns confirmed payments into owned books
│   │   ├── fees.js          the payment fee added on top of the price
│   │   ├── commission.js    the store's cut and each order line's split
│   │   ├── mailer.js        sends email (SMTP)
│   │   └── emails.js        the wording of the emails
│   ├── storage/
│   │   ├── index.js         private book-file storage (swap for S3 later)
│   │   ├── fileTypes.js     checks uploads really are PDF/EPUB/JPEG/PNG/WebP
│   │   └── bookMetadata.js  reads title/author/description/cover from EPUB and PDF, file fingerprints
│   ├── scripts/makeAdmin.js promote a customer to admin
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

## Cart, checkout and library API

All of these need a signed-in customer (401 otherwise).

| Request | Purpose |
|---|---|
| `GET /api/cart` | Current cart: `{ cart: { items, totalCents, currency, mixedCurrencies } }` |
| `POST /api/cart` | Add `{ bookId }`, or merge `{ bookIds: [...] }` (used when a guest logs in) |
| `DELETE /api/cart/:bookId` | Remove a book |
| `POST /api/orders/checkout` | Create an order from the cart and start payment. Returns `{ url }` (payment page) or `{ free: true }` |
| `GET /api/orders/verify?reference=` | Confirm a payment when the customer returns. Returns `{ status }` |
| `GET /api/orders` | The customer's paid orders |
| `GET /api/library` | Books the customer owns |
| `POST /api/library/:bookId/link` | A download link valid for 5 minutes: `{ url }` |
| `GET /api/downloads/:token` | The file itself (the token is the credential) |

The browser never sends prices. Checkout rebuilds the order from the database, skips books the
customer already owns, and refuses a cart that mixes currencies (one payment = one currency).

## Payments (Paystack)

Customers pay on Paystack's hosted page, so card details never touch this server.

**The flow**
1. `POST /api/orders/checkout` creates a `pending` order and asks Paystack for a payment page.
2. The customer pays, and Paystack sends them back to `/checkout/complete`.
3. The site calls `GET /api/orders/verify`, and the server asks Paystack whether it really succeeded.
4. In parallel, Paystack calls `POST /api/payments/webhook` with a signed message.
5. Whichever arrives first completes the order. The order is marked `paid` only if the **amount and
   currency match**, then the books go into the customer's library. Doing it twice is harmless.

**Set it up**
1. Create a Paystack account and copy the **test** secret key from *Settings > API Keys & Webhooks*.
2. Put it in `.env` as `PAYSTACK_SECRET_KEY=sk_test_...` and restart the server.
3. Make sure `STORE_CURRENCY` is a currency your Paystack account supports. A Nigerian account uses
   `NGN` by default (USD must be enabled by Paystack). Then run `npm run seed` to update the sample
   books' currency and prices.
4. Try a purchase using one of Paystack's test cards (see their docs; at the time of writing
   `4084 0840 8408 4081`, any future expiry, CVV `408`, PIN `0000`, OTP `123456`).

**Webhook (needed on the live site)**
In the Paystack dashboard set the webhook URL to `https://YOUR-API-DOMAIN/api/payments/webhook`.
Paystack cannot reach `localhost`, so on your own computer purchases are confirmed by the
return-page check instead, which works fine for testing. The webhook matters in production
because it delivers the books even if a customer closes the tab right after paying.

**Going live:** switch `PAYSTACK_SECRET_KEY` to the live key on the live server only, and never put
either key in the client or in Git.

**Using another gateway:** copy `src/payments/paystack.js`, implement the same four members
(`name`, `createCheckout`, `verifyPayment`, `parseWebhook`), register it in `src/payments/index.js`
and set `PAYMENT_PROVIDER`. Nothing else changes.

## Roles: owner, admins, customers

| Role | Can do |
|---|---|
| **owner** (exactly one) | Everything. Has the final say. Approves or removes admins, and is the only one who can **delete** books and shelves |
| **admin** (a seller) | Add and edit **their own** books (files, covers, publish/unpublish). See every shelf (read-only) and request new ones. See their own sales, statements and payouts |
| **user** | Shop, and apply to become an admin |

**Who sees what.** Every book remembers who created it (`createdBy`). The owner sees and manages everything.
An admin only sees and manages the **books** they created: someone else's book answers "not found" for every
action, so its existence isn't even revealed. **Shelves** are public on the storefront anyway, so every admin
can see every shelf with its details (to know what exists and which fits their book), but **only the owner
creates, edits and deletes shelves**; an admin asks for a new one with a shelf request. Orders, customers and
store-wide revenue are owner-only; a seller sees only their own sales (never who bought). Books that existed
before this rule (such as the sample data) belong to the owner.

**How someone becomes an admin:** a customer clicks *Apply to be an admin* on their Account page
(`POST /api/admin-requests`). Nothing is granted by applying. The owner sees the application on the
**Team** screen and approves or declines it. Approved applicants get access on their very next
request, and removed admins lose it just as quickly, because the role is read from the database on
every request.

Guard rails: one pending application per person, a 7-day wait after a decline, and at most 5 attempts
per hour per IP. The owner cannot be removed through the website, there is only ever one owner, and
an approval only ever promotes a plain customer (it can never change the owner's or an admin's role).

**Creating the owner:** `npm run seed` creates the account from `ADMIN_EMAIL` / `ADMIN_PASSWORD` as the
owner. An account created before roles existed can be upgraded with
`npm run make-admin -- email --owner`. To hand the store to its real owner at delivery, have them
sign up and run the same command with their email: they become the owner and the previous owner
becomes a regular admin. Role changes outside the approval flow can only be made on the server.

## Admin API

Everything under `/api/admin` needs a signed-in **admin or owner** (visitors get 401, customers 403).

| Request | Purpose |
|---|---|
| `GET /api/admin/stats` | Dashboard numbers. Owner: whole store, revenue per currency. Admin: their own books and shelves only |
| `GET /api/admin/orders` | **Owner only.** Orders, newest first. `?status=` `?page=` |
| `GET /api/admin/books` | Books you manage (owner: all, admin: only their own), drafts included. `?search=` `?status=published\|draft` `?page=` |
| `GET /api/admin/categories` | **Every** shelf with its details. `canEdit` is true only for the owner |
| `GET/POST /api/admin/shelf-requests`, `DELETE .../:id` | Admins ask for a shelf, list their requests, withdraw. The owner gets the queue |
| `POST /api/admin/shelf-requests/:id/approve` or `/reject` | **Owner only.** Approving creates the shelf |
| `GET /api/admin/earnings/summary` | Owner: every seller, commission income, fee reconciliation. Admin: just themselves |
| `GET /api/admin/earnings/sales`, `/statement`, `/payouts` | A seller's totals, a month's statement (`?month=2026-10`, add `&format=csv`), payout history. Owner adds `?seller=` |
| `POST /api/admin/earnings/payouts` | **Owner only.** Record a payout |
| `PUT /api/admin/earnings/settings`, `PATCH /api/admin/earnings/sellers/:id` | **Owner only.** Default commission; one seller's own rate |
| `POST /api/auth/forgot-password`, `/api/auth/reset-password` | Password reset (public) |
| `POST /api/admin/books/from-file` | Start a book from its file: reads title, author, description and cover, creates a draft (form field `file`) |
| `GET /api/admin/books/:id/file-details` | What the stored file itself says (title, author, description, cover preview) |
| `POST /api/admin/books/:id/apply-file-details` | Copy chosen details (`fields`: title, authors, description, cover) from the file into the book |
| `GET /api/admin/books/:id` | One book with every field |
| `POST /api/admin/books` | Create a book. It always starts as a **draft** |
| `PATCH /api/admin/books/:id` | Change a book (only known fields are accepted) |
| `DELETE /api/admin/books/:id` | Delete a book nobody has bought |
| `POST /api/admin/books/:id/file` | Upload the book file (form field `file`, PDF or EPUB) |
| `POST /api/admin/books/:id/cover` | Upload the cover (form field `cover`, JPEG/PNG/WebP, up to 2 MB) |
| `POST/PATCH /api/admin/categories[/:id]` | **Owner only.** Add and edit shelves |
| `DELETE /api/admin/books/:id`, `DELETE /api/admin/categories/:id` | **Owner only** |
| `GET /api/admin/team` | **Owner only.** Pending applications, the team, recent decisions |
| `POST /api/admin/team/requests/:id/approve` or `/reject` | **Owner only** |
| `POST /api/admin/team/admins/:userId/remove` | **Owner only.** Take admin access away |
| `POST /api/admin-requests`, `GET/DELETE /api/admin-requests/mine` | Any signed-in customer: apply, check status, withdraw |

**Rules that protect customers**
- A book cannot be published until its file is uploaded, so nobody pays for something they can't receive.
- Only the owner can delete a book, and a book that has been bought cannot be deleted by anyone (unpublish it instead). Owners keep their download
  even after it is unpublished.
- A shelf that still holds books cannot be deleted.

**How uploads are checked:** the file's real contents are inspected, not its name or the type the
browser claims. A renamed program or a script disguised as `.pdf` is rejected. SVG covers are refused
because they can contain scripts. Book files go to the private folder; only covers are public, and the
public path can never reach a book file.

## Money: price, fee, commission, earnings and payouts

Admins are **sellers**. This is how one sale is split, with a worked example for a N10,000 book by a seller at
the default 10% commission:

1. **List price: N10,000.** The price on the book.
2. **Payment fee on top: about N254.** Paystack charges roughly 1.5% + N100 (the N100 is waived under N2,500, and
   the fee is capped at N2,000). The server works this out *backwards* (`src/services/fees.js`) so that after
   Paystack takes its cut, exactly the list price is left. The customer pays **N10,254**. This is tested
   against Paystack's pricing across 20,000 amounts: the customer is never charged a naira more than needed and
   the store is never short.
3. **Commission: N1,000** = 10% of the *list price* (never of the fee). The store keeps it.
4. **Seller earns: N9,000.**

The split is frozen on each order line at the moment of purchase (`seller`, `commissionBps`, `commissionCents`,
`sellerShareCents`), so changing the rate later never rewrites history. The owner's own books carry no seller, so
the owner keeps the whole price. The rate is the store default (Admin > Earnings, starting from `COMMISSION_PERCENT`),
or a seller's own rate.

**Earnings and payouts.** A seller's *balance* is what they earned (from paid orders) minus the payouts the owner
has recorded. A payout is a **ledger entry**: the owner makes the bank transfer, then records the amount and the
transfer reference. The server refuses a payout larger than the balance and the same bank reference twice. Pending
and refunded orders are not counted. Monthly **statements** show every sale, the store's commission, payouts,
and opening and closing balances (months follow `STORE_UTC_OFFSET_HOURS`), and download as CSV. In the CSV, any
text that looks like a spreadsheet formula (a book titled `=SUM(1)`) is defused with a leading apostrophe.

**Limits worth knowing.**
- The fee model covers *local cards in Naira*. Bank transfers, USSD and international cards cost different
  amounts, so on those the real fee can be higher or lower. The difference belongs to the store, never the
  seller: the real fee Paystack took is saved on each order and Admin > Earnings compares it with what customers
  were charged. For currencies other than NGN no fee is added.
- Sales are totalled in code from the orders. That's fine for a store with thousands of orders; at tens of
  thousands, move the totals into database aggregation.
- Payouts are not automatic. Paystack **split payments** (sub-accounts) can send each seller's share
  automatically, but it needs sellers' bank details and a verification flow, so it's a separate step.
- Refunds: orders marked `refunded` are excluded from earnings. If a seller was already paid, their balance will
  go negative, which is the owner's cue to settle it.

## Shelf requests

Only the owner creates shelves. An admin sees all shelves (name, type, colour, description, book count) and, if
one is missing, sends a request (`name`, `type`, what goes on it, why). Near-duplicates ("Sci Fi" vs "Sci-Fi") of an
existing or already-requested shelf are refused with a pointer to the existing one. The owner approves (which
creates the shelf, with a chosen colour) or declines with a note. Limits: 5 waiting requests per admin, 10 per hour.

## Password reset

`POST /api/auth/forgot-password` always answers the same way, whether or not the email has an account, so it can't
be used to find out who has an account. If one exists, a one-time link (valid 30 minutes) is emailed; only a hash
of the token is stored. `POST /api/auth/reset-password` sets the new password, uses the link up, and **signs out
every other device** (sessions from before the change stop working). A second request within a minute sends nothing
new, and attempts are limited to 8 per hour per IP.

**Email setup.** Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` to any SMTP provider
(Brevo, Resend, Mailgun, Zoho, your host's mail...). In development leave `SMTP_HOST` empty: the email, including
the link, prints in the server console. In production with no SMTP nothing is sent and the link is never logged.
Use a sender address on your own domain and set up its SPF/DKIM records, or reset emails will land in spam.

## Reading book files, and one book = one listing

When a file is uploaded the server reads what is inside it (`src/storage/bookMetadata.js`):

| | EPUB | PDF |
|---|---|---|
| Title, author(s) | yes | only if the PDF's creator filled them in |
| Description, language, year | yes | description (from the subject line) and year only |
| Cover image | yes (JPEG/PNG/WebP, up to 2 MB; SVG is ignored) | no, upload the cover separately |

"Add book" starts from the file (`POST /api/admin/books/from-file`): the server reads the file and creates a
**draft** with whatever it found, and the admin adds the price and shelves. For an existing book, the admin can
pull the file's own title, author, description or cover into the listing from a pop-up.

**Duplicate protection.** The same book can't be sold twice under different titles. A file is refused if
- its bytes are identical to a file already in the store (SHA-256 fingerprint), or
- it is an EPUB with the same built-in identifier as one already in the store (catches a re-zipped copy), or
- a book with the same title and first author already exists (any capitalisation).

An admin isn't told the name of another admin's unpublished book ("already in the store as another book"); the
owner, and anyone for a published book, is. The title found inside each file is also remembered, and the edit screen
warns when a book is sold under a different title than its file. Fingerprints are recorded from now on, so books
uploaded before this feature (such as the sample data) aren't checked against new uploads.

Reading is defensive: only a few small entries are opened, sizes are capped, nothing is written to disk by a path
found inside the file, and a damaged file just yields no details instead of an error.

## Book files and downloads

**What is stored where.** MongoDB stores only *information about* a file (its name, size, fingerprint, the book it
belongs to), never the file itself. Putting book files inside the database (GridFS) is possible but slows queries,
bloats backups and costs more than file storage. The files themselves go on disk, as described below.

Files live in `STORAGE_DIR` (default `server/storage/books`), a **private** folder that is not served
publicly and is excluded from Git. A customer downloads by asking for a link, which works for
5 minutes, only for books they own, and is checked again when used.

`npm run seed` creates a small **placeholder PDF** for each sample book so you can test downloads.
Real files are uploaded through the admin area (Books > Edit). For production, keep this folder on
persistent storage (a mounted disk or volume). Free hosting tiers often wipe local files on every
deploy, so cloud storage such as S3 or Cloudflare R2 is a better long-term fit: only
`src/storage/index.js` and `src/routes/downloads.js` would change.

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
