# Subscriptions for Bottly

An express application so that when a subscription has arrived, it is given advantages on the bot

### Installation:

Use PNPM or PNPM and install the pacakges `pnpm install` or `npm install`.

Set the required environment variables 
```env
DATABASE_URL="Your database URL if you want edit data when a user subscribe"
// If you use Railway, define this environment variable for set Node.JS 18
// NIXPACKS_NODE_VERSION=18
PORT=4242
STRIPE_PUBLIC_KEY="Your Stripe public key"
STRIPE_SECRET_KEY="Your Stripe secret key"
STRIPE_ENDPOINT_SECRET="Your Stripe endpoint secret"
```

### Initialize your prisma (if you want use the database)

Use the command `npx prisma db pull` to retrieve your database if you have already created tables

Or create your models and then do `npx prisma db push` to send your changes to the database

Then do `npx prisma generate` to generate your types. 

### Lauch the app

Use `pnpm` or `npm`, `run dev` or `run start`

### Usage

![image](https://user-images.githubusercontent.com/51505384/236888329-a2ffb21b-2597-48b7-bf07-88ecf12c3b54.png)
