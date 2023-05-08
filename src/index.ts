import { BColors } from "bettercolors";
import express from "express";
import { Stripe } from "stripe";
import { getNumberEnv, getStringEnv } from "./utils/env-variables";
import { getUser } from "./utils/prisma";

const app = express();
const colors = new BColors({ date: { enabled: true, format: "DD/MM/YYYY - HH:mm:ss", surrounded: "[]" } });
const stripe = new Stripe(getStringEnv("STRIPE_SECRET_KEY"), { apiVersion: "2022-11-15" });

app.post('/webhook', express.raw({type: 'application/json'}), async(request, response) => {
  const sig = request.headers['stripe-signature'] as string;
  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, getStringEnv("STRIPE_ENDPOINT_SECRET"));
  } catch (err: any) {
    response.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type == "checkout.session.completed") {
    const payment = event.data.object as Stripe.Checkout.Session;

    let discordId = null;
    if (payment.custom_fields.length > 0) {
      const discordIdField = payment.custom_fields.find(field => field.key == "discordid");
      if (discordIdField) {
        discordId = discordIdField.numeric?.value;
      }
    }

    if (!discordId) {
      colors.error("No discordId found for " + payment.customer_details?.email);
      return;
    }

    colors.log("Payment completed for " + payment.customer_details?.email + " with " + (payment.amount_total ?? 0) / 100 + " " + payment.currency?.toUpperCase());
    colors.log("Discord ID: " + discordId + " | Discord Username: " + (await getUser(discordId))?.username);
  }

  response.send();
});

app.listen(getNumberEnv("PORT") ?? 4242);
colors.info("Server is running on port " + (getNumberEnv("PORT") ?? 4242));