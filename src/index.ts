import { BColors } from "bettercolors";
import express from "express";
import { Stripe } from "stripe";
import { getNumberEnv, getStringEnv } from "./utils/env-variables";
import { getUser, prisma } from "./utils/prisma";
import { DayJS } from "./utils/day-js";

const app = express();
const colors = new BColors({ date: { enabled: true, format: "DD/MM/YYYY - HH:mm:ss", surrounded: "[]" } });
const stripe = new Stripe(getStringEnv("STRIPE_SECRET_KEY"), { apiVersion: "2022-11-15" });

app.post("/webhook", express.raw({ type: "application/json" }), async(request, response) => {
  const sig = request.headers["stripe-signature"] as string;
  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, getStringEnv("STRIPE_ENDPOINT_SECRET"));
  } catch (err: any) {
    response.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  let discordIdField;
  let discordId;
  let user;

  switch (event.type) {
    case "checkout.session.completed":
      event = event.data.object as Stripe.Checkout.Session;
      discordIdField = event.custom_fields.find(field => field.key == "discordid");
      if (!discordIdField) return;
      discordId = discordIdField.numeric?.value;
      if (!discordId) return;
      user = await getUser(discordId);
      if (!user) return;

      await prisma.user.update({
        where: { userId: user.userId },
        data: {
          isPremium: true,
          usages: { update: { max: "PREMIUM", usage: 50 } },
          subscription: {
            create: {
              firstPayment: DayJS().unix(),
              lastPayment: DayJS().unix(),
              nextPayment: DayJS().add(1, "month").unix(),
              email: event.customer_details?.email ?? "Unknown",
              subscriptionId: event.subscription?.toString() ?? "Unknown",
              paymentMethod: event.payment_method_types[0] ?? "card"
            }
          }
        }
      }).catch(err => {
        colors.error(err);
        response.status(500).send();
      });

      colors.info(`User ${user.userId} (${user.username}) has been upgraded to premium.`);
      break;
    case "invoice.payment_failed":
      event = event.data.object as Stripe.Invoice;
      user = await prisma.user.findFirst({ where: { subscription: { subscriptionId: event.subscription?.toString() } } });
      if (!user) return;

      await prisma.user.update({
        where: { userId: user.userId },
        data: {
          isPremium: false,
          usages: { update: { max: "FREE", usage: 20 } },
          subscription: { delete: true }
        }
      }).catch(err => {
        colors.error(err);
        response.status(500).send();
      });

      colors.info(`User ${user.userId} (${user.username}) has been downgraded to free.`);
      break;
    case "invoice.paid":
      event = event.data.object as Stripe.Invoice;
      user = await prisma.user.findFirst({ where: { subscription: { subscriptionId: event.subscription?.toString() } } });
      if (!user) return;

      await prisma.user.update({
        where: { userId: user.userId },
        data: {
          subscription: {
            update: {
              lastPayment: DayJS().unix(),
              nextPayment: DayJS().add(1, "month").unix()
            }
          }
        }
      }).catch(err => {
        colors.error(err);
        response.status(500).send();
      });

      colors.info(`User ${user.userId} (${user.username}) has paid their subscription.`);
      break;
    case "customer.subscription.deleted":
      event = event.data.object as Stripe.Subscription;
      user = await prisma.user.findFirst({ where: { subscription: { subscriptionId: event.id } } });
      if (!user) return;

      await prisma.user.update({
        where: { userId: user.userId },
        data: {
          isPremium: false,
          usages: { update: { max: "FREE", usage: 20 } },
          subscription: { delete: true }
        }
      }).catch(err => {
        colors.error(err);
        response.status(500).send();
      });

      colors.info(`User ${user.userId} (${user.username}) has cancelled their subscription.`);
      break;
    default:
      return;
  }
  response.send();
});

app.listen(getNumberEnv("PORT") ?? 4242);
colors.info("Server is running on port " + (getNumberEnv("PORT") ?? 4242));