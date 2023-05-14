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

  if (event.type == "checkout.session.completed") {
    const payment = event.data.object as Stripe.Checkout.Session;

    let discordId = null;
    const email = payment.customer_details?.email;
    colors.log("Payment completed for " + email  + " with " + (payment.amount_total ?? 0) / 100 + " " + payment.currency?.toUpperCase());

    if (payment.custom_fields.length > 0) {
      const discordIdField = payment.custom_fields.find(field => field.key == "discordid");
      if (discordIdField) {
        discordId = discordIdField.numeric?.value;
      }
    }

    if (discordId) {
      colors.log("Discord ID: " + discordId + " | Discord Username: " + (await getUser(discordId))?.username);

      await prisma.user.update({ where: { userId: discordId },
        data: {
          isPremium: true,
          usages: { update: { max: "PREMIUM", usage: 50 } },
          subscription: {
            create: {
              subscriptionId: payment.subscription?.toString() ?? "NONE",
              email: email ?? "NONE",
              firstPayment: DayJS().unix(),
              lastPayment: DayJS().unix(),
              nextPayment: DayJS().add(1, "month").unix(),
              paymentMethod: payment.payment_method_types?.[0] ?? "NONE"
            }
          }
        }
      }).catch((err: any) => {
        colors.error("Error while updating user: " + err);
      }).finally(() => {
        colors.info("Payment completed and user updated successfully");
      });
    } else colors.error(`This user (${payment.customer_details?.email}) didn't provide a Discord ID (?? wtf why ????)`);
  } else if (event.type == "invoice.payment_failed") {
    const payment = event.data.object as Stripe.Invoice;

    const email = payment.customer_email;
    if (!email) return colors.error("No email provided");

    colors.log("Payment failed for " + email  + " with " + (payment.amount_due ?? 0) / 100 + " " + payment.currency?.toUpperCase());
    const subscription = await prisma.subscription.findFirst({ where: { email: email, subscriptionId: payment.subscription?.toString() } });
    if (!subscription) return colors.error("No subscription found");

    await prisma.user.update({ where: { userId: subscription.userId }, data: {
      isPremium: false,
      subscription: { delete: true },
      usages: { update: { max: "FREE", usage: 0 } }
    } }).catch((err: any) => {
      colors.error("Error while updating user: " + err);
    }).finally(() => {
      colors.info("Payment failed and user updated successfully");
    });
  } else if (event.type == "invoice.paid") {
    const payment = event.data.object as Stripe.Invoice;

    const email = payment.customer_email;
    if (!email) return colors.error("No email provided");

    colors.log("Payment paid for " + email  + " with " + (payment.amount_due ?? 0) / 100 + " " + payment.currency?.toUpperCase());
    const subscription = await prisma.subscription.findFirst({ where: { email: email, subscriptionId: payment.subscription?.toString() } });
    if (!subscription) return colors.error("No subscription found");

    await prisma.user.update({ where: { userId: subscription.userId }, data: {
      isPremium: true,
      subscription: { update: { lastPayment: DayJS().unix(), nextPayment: DayJS().add(1, "month").unix() } }
    } }).catch((err: any) => {
      colors.error("Error while updating user: " + err);
    }).finally(() => {
      colors.info("Payment paid and user updated successfully");
    });
  } else if (event.type == "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;

    colors.log("Subscription deleted for id " + subscription.id);
    const subscriptionData = await prisma.subscription.findFirst({ where: { subscriptionId: subscription.id } });
    if (!subscriptionData) return colors.error("No subscription found");

    await prisma.user.update({ where: { userId: subscriptionData.userId }, data: {
      isPremium: false,
      subscription: { delete: true },
      usages: { update: { max: "FREE", usage: 0 } }
    } }).catch((err: any) => {
      colors.error("Error while updating user: " + err);
    }).finally(() => {
      colors.info("Subscription deleted and user updated successfully");
    });
  }

  response.send();
});

app.listen(getNumberEnv("PORT") ?? 4242);
colors.info("Server is running on port " + (getNumberEnv("PORT") ?? 4242));