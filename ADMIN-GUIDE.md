# Store Owner's Guide

How to run your bookstore day to day. No coding needed.

## Signing in

1. Open your website and click **Log in**.
2. Use your admin email and password.
3. An **Admin** link appears in the top menu (on a phone: open **Hi, yourname**, then **Open admin area**).

You are the **site owner**: you have the final say on everything. See *Your team* below to let other people help.

## Adding a book

1. **Admin > Books > Add book.**
2. Fill in the title, author(s), description and price. Type the price normally (for example `1500` or `4.99`).
   Leave *Currency* blank to use the store's currency.
3. Tick the **shelves** the book belongs to, and add a few **tags** (words people might search for).
4. Click **Create book.** It is saved as a **draft**, so customers can't see it yet.
5. On the page that opens, **upload the cover** (JPEG, PNG or WebP, up to 2 MB, portrait shape looks best)
   and **upload the book file** (PDF or EPUB).
6. Tick **Published**, then **Save changes.** The book is now in the store.

Why a file is needed first: a customer who pays must be able to download what they bought, so the
store won't let you publish a book that has no file.

## Changing a book

**Admin > Books**, click the book, change what you need, **Save changes.**
- To hide a book from the store, untick **Published**. People who already bought it keep their copy.
- To fix the book's file, use **Replace the file.** Past customers get the new version.
- **Feature on the home page** puts it in the "Featured reads" row.
- Only the owner can delete a book, and a book that customers have bought **cannot be deleted**. Unpublish it instead.

## Shelves (categories)

**Admin > Shelves.** Each shelf has a name, a **type** (Fiction, Non-fiction or Educational), a colour and
a short description. To start selling non-fiction or educational books, add a shelf with that type, then
tick it on the books. It appears across the store automatically. No redesign is needed.

- A shelf can sit **inside** another shelf (for example *Cookery* inside *Non-fiction*).
- Only the owner can delete shelves, and a shelf that still has books can't be deleted. Move the books first.

## Your team (owner only)

**Letting someone help:**
1. They sign up on your website like any customer.
2. On their **Account** page they click **Apply to be an admin** and can add a short message.
3. You see a badge on the **Team** tab (and a banner on the Dashboard). Open **Admin > Team**.
4. Read the application, then **Approve** or **Decline**. You are asked to confirm first.
5. Approved people can use the admin area straight away. Declined people can apply again after 7 days.

**What admins can and can't do**

| | Admin | You (owner) |
|---|---|---|
| Add and edit books, upload covers and files, publish or unpublish | Yes | Yes |
| Add and edit shelves, view orders | Yes | Yes |
| Delete books and shelves | No | Yes |
| Approve, decline or remove admins | No | Yes |

Because you are the owner, you can change or undo anything an admin does (for example, republish a
book they unpublished). To take someone's access away, go to **Team** and click **Remove access**.
They are locked out immediately.

Handing the store to its owner: the developer runs `npm run make-admin -- owner@email.com --owner`
after the owner signs up. The previous owner becomes a regular admin.

## Orders and money

**Admin > Orders** lists every purchase: who bought, what, how much, and whether it is *paid*,
*pending*, *failed* or *refunded*. **Dashboard** shows totals; revenue is shown separately for each
currency. Payments are received in your Paystack account, so use Paystack's dashboard for payouts and refunds.

## If a customer says "I paid but have no book"

1. Ask for the email they used. Find their order under **Admin > Orders.**
2. If it says **pending**, ask them to wait a few minutes (bank transfers can be slow). It completes automatically.
3. If it says **paid**, the book is in their **My library.** Ask them to log out and back in.
4. If Paystack shows the payment but the store shows nothing after an hour, contact your developer with the order details.

## Things to avoid

- Don't share the admin password. Everyone who manages the store should have their own admin account.
- Don't upload books you don't have the right to sell.
