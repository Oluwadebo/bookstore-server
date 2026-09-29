/**
 * Seed script: fills the database with starter shelves, sample books and an
 * admin account so the store has content while you develop.
 *
 *   npm run seed          add/update the sample data (safe to re-run)
 *   npm run seed:fresh    wipe categories and books first, then seed
 *
 * The sample books are public-domain classics (Project Gutenberg), so they
 * are safe to use in demos. Replace them with your client's real catalogue
 * (only titles they hold the rights to sell) via the admin area in step 5.
 */
import slugify from "slugify";
import { env } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { Category } from "../models/Category.js";
import { Book } from "../models/Book.js";
import { User } from "../models/User.js";

const CATEGORIES = [
  { name: "Fantasy", color: "#8E5CF7", description: "Magic, quests and impossible worlds." },
  { name: "Science Fiction", color: "#12B5B0", description: "Futures, machines and strange frontiers." },
  { name: "Mystery & Thriller", color: "#2B3A67", description: "Clues, crimes and cliffhangers." },
  { name: "Romance", color: "#FF6B8B", description: "Love stories, old and new." },
  { name: "Historical Fiction", color: "#F59E0B", description: "Stories set in times gone by." },
  { name: "Horror", color: "#E0453A", description: "Gothic chills and midnight scares." },
  { name: "Classics", color: "#FF8A3D", description: "Timeless books everyone should meet." },
];

// Prices are in cents (299 = $2.99). `shelves` lists category names.
const BOOKS = [
  { title: "Pride and Prejudice", authors: ["Jane Austen"], year: 1813, priceCents: 299, featured: true,
    shelves: ["Romance", "Classics"], description: "Elizabeth Bennet and the proud Mr. Darcy trade sharp words and slowly learn to see each other clearly." },
  { title: "Frankenstein", authors: ["Mary Shelley"], year: 1818, priceCents: 299,
    shelves: ["Science Fiction", "Horror", "Classics"], description: "A young scientist brings a creature to life, then must face what he has made." },
  { title: "Dracula", authors: ["Bram Stoker"], year: 1897, priceCents: 349, featured: true,
    shelves: ["Horror", "Classics"], description: "Told through letters and diaries, a band of friends hunts a nobleman who feeds on the living." },
  { title: "The Adventures of Sherlock Holmes", authors: ["Arthur Conan Doyle"], year: 1892, priceCents: 349, featured: true,
    shelves: ["Mystery & Thriller", "Classics"], description: "Twelve cases from the world's most famous detective and his loyal friend, Dr. Watson." },
  { title: "Alice's Adventures in Wonderland", authors: ["Lewis Carroll"], year: 1865, priceCents: 199,
    shelves: ["Fantasy", "Classics"], description: "Alice tumbles down a rabbit hole into a world where logic turns delightfully upside down." },
  { title: "The Time Machine", authors: ["H. G. Wells"], year: 1895, priceCents: 249,
    shelves: ["Science Fiction", "Classics"], description: "An inventor travels far into the future and finds humanity split into two very different peoples." },
  { title: "A Tale of Two Cities", authors: ["Charles Dickens"], year: 1859, priceCents: 349,
    shelves: ["Historical Fiction", "Classics"], description: "London and Paris collide during the French Revolution in a story of sacrifice and redemption." },
  { title: "Treasure Island", authors: ["Robert Louis Stevenson"], year: 1883, priceCents: 249,
    shelves: ["Classics"], description: "Young Jim Hawkins finds a pirate's map and sets sail with a crew he should not trust." },
];

async function seed() {
  const fresh = process.argv.includes("--fresh");
  await connectDB();

  if (fresh) {
    await Promise.all([Category.deleteMany({}), Book.deleteMany({})]);
    console.log("Cleared categories and books.");
  }

  // Upserts skip schema hooks, so slugs are generated explicitly here.
  const slug = (text) => slugify(text, { lower: true, strict: true });
  const idByName = {};

  for (const [index, cat] of CATEGORIES.entries()) {
    const doc = await Category.findOneAndUpdate(
      { slug: slug(cat.name) },
      { ...cat, slug: slug(cat.name), type: "fiction", sortOrder: index },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    idByName[cat.name] = doc._id;
  }

  for (const { shelves, year, ...book } of BOOKS) {
    await Book.findOneAndUpdate(
      { slug: slug(book.title) },
      { ...book, slug: slug(book.title), publishedYear: year, categories: shelves.map((s) => idByName[s]) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log(`Seeded ${CATEGORIES.length} categories and ${BOOKS.length} books.`);

  // Create the admin account once, using the values from .env.
  if (env.adminEmail && env.adminPassword) {
    const exists = await User.findOne({ email: env.adminEmail.toLowerCase() });
    if (!exists) {
      const admin = new User({ name: "Store Admin", email: env.adminEmail, role: "admin" });
      await admin.setPassword(env.adminPassword);
      await admin.save();
      console.log(`Created admin account: ${env.adminEmail}`);
    } else {
      console.log("Admin account already exists, left unchanged.");
    }
  }

  await disconnectDB();
}

seed().catch(async (err) => {
  console.error("Seed failed:", err);
  await disconnectDB();
  process.exit(1);
});
