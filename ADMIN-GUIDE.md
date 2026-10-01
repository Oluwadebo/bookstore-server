# Store Owner's Guide

How to run your bookstore day to day. No coding needed.

## Signing in

1. Open your website and click **Log in**.
2. Use your admin email and password.
3. An **Admin** link appears in the top menu (on a phone: open **Hi, yourname**, then **Open admin area**).

You are the **site owner**: you have the final say on everything. See *Your team* below to let other people help.

## Adding a book

1. **Admin > Books > Add book.**
2. **Choose the book file** (PDF or EPUB). The store reads the file and fills in what it can find: the title, author,
   description and, for EPUB files, the **cover**. You'll see a note saying what was found and what wasn't.
3. Check the details. Set the **price** (type it normally, for example `1500` or `4.99`) and tick the **shelves**
   (you can use any shelf in the store). Add a few **tags** (words people might search for).
4. If the file had no cover (PDFs usually don't), **upload a cover** (JPEG, PNG or WebP, up to 2 MB, portrait looks best).
5. Tick **Published**, then **Save changes.** The book is now in the store.

No file yet? Use *"I don't have the file yet. Enter the details by hand"* on the first screen.

**One book, one listing.** The store refuses a file that is already in the store, even if you give it a different
title, and it refuses a second book with the same title and author. If you replace a book's file, a pop-up shows the
title, author, description and cover found in the new file so you can tick what to use. If a book's title doesn't match
the title inside its file, the edit screen warns you.

**Free books:** if you publish with the price at 0, the store asks you to confirm, so a forgotten price can't give a book away.

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

Every admin can see **all** shelves, so you can check whether a name already exists before making one. You can only edit the shelves you created; shelves made by others are marked *View only*.

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
| Add and edit books, upload covers and files, publish or unpublish | Their own books only | All books |
| Add and edit shelves | Their own only (they can see all) | All shelves |
| See orders, customers and sales | No | Yes |
| Delete books and shelves | No | Yes |
| Approve, decline or remove admins | No | Yes |

An admin only sees the books and shelves **they added themselves**. Everything already in the store when
they join (and anything you or other admins add) is not visible to them. When they add a book they can
still put it on any shelf, because shelves are shared with the whole store.

Because you are the owner, you can change or undo anything an admin does (for example, republish a
book they unpublished). To take someone's access away, go to **Team** and click **Remove access**.
They are locked out immediately.

Handing the store to its owner: the developer runs `npm run make-admin -- owner@email.com --owner`
after the owner signs up. The previous owner becomes a regular admin.

## Orders and money

**Admin > Orders** (owner only) lists every purchase: who bought, what, how much, and whether it is *paid*,
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
