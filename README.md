# 💸 AhorroAR — Smart Savings App for Argentina

A mobile app that helps Argentinians maximize their bank promotions, 
compare supermarket prices in real time, and make smarter purchasing 
decisions in a high-inflation context.

> 🚧 Actively in development — Phase 2 currently underway.

---

## 🇦🇷 The Problem

In Argentina, every bank offers different discounts on different days, 
at different stores, with different caps. Tracking all of them manually 
is impossible. Meanwhile, the same product can vary 40%+ in price 
across supermarket chains.

AhorroAR centralizes all of that into one app.

---

## ✨ Features by Phase

### ✅ Phase 1 — MVP (Completed)
- 🔐 User authentication via Supabase Auth
- 🏷️ **Promotions module** — bank discounts with category and 
  bank filtering
- 💳 **Card wallet** — load your cards, see only your relevant promos
- 🤖 **Bank scraper v1** — automated daily scraping of Galicia, 
  Naranja X and BBVA using Playwright + cron jobs
- 🎟️ **Coupon module** — manual loading, categories, expiration dates

### 🔄 Phase 2 — Price Comparator (In Progress)
- 📊 **Precios Claros API** integration — official government 
  price database
- 🔍 **Price comparator** — search by name or EAN barcode, 
  compare prices across supermarket chains
- 📍 **Nearest branch** — geolocation + branch finder
- 📈 **Price history** — daily EAN snapshots to visualize 
  price trends over time
- 📷 **Scanner mode** — camera → barcode → instant price comparison 
  (ZXing)
- 🛒 **Smart list** — build your shopping list, app calculates 
  which supermarket minimizes total cost

### 📋 Phase 3 — Alerts & Community (Planned)
- 🔔 Price drop alerts — follow a product, get push notification 
  when it hits your target price (FCM + BullMQ)
- 📬 Weekly digest — best price drops in your personal basket
- 👥 Community reports — users submit prices, earn points and badges
- 🏦 Best bank combo — given a store + amount, calculates which 
  card gives the best deal

### 📋 Phase 4 — Personal Inflation & Monetization (Planned)
- 📉 Personal inflation curve vs official CPI (INDEC API)
- 🏪 Expanded scrapers — Farmacity, Jumbo, Mercado Libre
- 🏆 Reputation system — contributor ranking and moderation
- 📱 PWA → native app via Capacitor (Play Store + App Store)

---

## 🛠️ Tech Stack

**Frontend & Mobile**
- Ionic + Angular · TypeScript

**Backend**
- NestJS · Node.js

**Database & Auth**
- Supabase (PostgreSQL + Auth)

**Automation & Data**
- Playwright (web scraping)
- BullMQ (job queues)
- ZXing (barcode scanning)
- Firebase Cloud Messaging (push notifications)

**External APIs**
- Precios Claros (official Argentine government price API)
- Google Maps (geolocation + branch finder)
- INDEC API (CPI / inflation data)

---

## 📸 Screenshots

| Promotions Feed | Price Comparator |
|----------------|-----------------|
| ![Promotions](./screenshots/promotions.png) | ![Comparator](./screenshots/comparator.png) |

---

## 🚀 Getting Started
```bash
git clone https://github.com/kfernandezlopetegui/ahorroar.git

# Frontend
cd frontend
npm install
ionic serve

# Backend
cd backend
npm install
npm run start:dev
```

> ⚠️ Requires Supabase credentials and API keys. 
> Contact me for access to the development environment.

---

## 👩‍💻 Author

**Karen Fernandez** —
[LinkedIn](https://linkedin.com/in/karenfernandez-056936341) ·
[GitHub](https://github.com/kfernandezlopetegui)
