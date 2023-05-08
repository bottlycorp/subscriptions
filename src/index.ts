import { BColors } from "bettercolors";
import express from "express";
import { Stripe } from "stripe";
import { getNumberEnv, getStringEnv } from "./utils/env-variables";

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

  if (event.type == "payment_intent.succeeded") {
    const paymentIntentSucceeded = event.data.object as Stripe.PaymentIntent;
    if (!paymentIntentSucceeded.id || !paymentIntentSucceeded.client_secret) {
      colors.error("PaymentIntent id or client_secret is missing!");
      return;
    }

    const payment = await stripe.paymentIntents.retrieve(paymentIntentSucceeded.id, { client_secret: paymentIntentSucceeded.client_secret });
    // TODO: Do something with the payment (e.g. save it in a database or send it to the user)

    if (payment) {
      colors.success(`Payment ${payment.id} succeeded with amount ${payment.amount} and currency ${payment.currency}`);
    }
  }

  response.send();
});

app.listen(getNumberEnv("PORT") ?? 4242);
colors.info("Server is running on port " + (getNumberEnv("PORT") ?? 4242));