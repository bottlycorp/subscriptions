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
    if (payment.custom_fields.length > 0) {
      const discordIdField = payment.custom_fields.find(field => field.key == "discordid");
      if (discordIdField) {
        discordId = discordIdField.numeric?.value;
      }
    }

    const email = payment.customer_details?.email;

    colors.log("Payment completed for " + email  + " with " + (payment.amount_total ?? 0) / 100 + " " + payment.currency?.toUpperCase());
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
              nextDueDate: DayJS().add(1, "month").unix(),
              paymentMethod: payment.payment_method_types?.[0] ?? "NONE"
            }
          }
        }
      }).catch((err: any) => {
        colors.error("Error while updating user: " + err);
      }).then(() => {
        colors.success("User updated successfully");
      }).finally(() => {
        colors.info("Payment completed and user updated successfully");
      });
    } else {
      colors.error(`This user (${payment.customer_details?.email}) didn't provide a Discord ID (?? wtf why ????)`);
    }
  } else if (event.type == "invoice.paid") {
    const payment = event.data.object as Stripe.Invoice;

    const subscription = await prisma.subscription.findFirst({ where: { subscriptionId: payment.subscription?.toString() ?? "NONE" } });
    if (subscription) {
      const user = await prisma.user.findFirst({ where: { userId: subscription.userId } });
      if (user) {
        await prisma.user.update({
          where: { userId: user.userId },
          data: { subscription: { update: { lastPayment: DayJS().unix(), nextDueDate: DayJS().add(1, "month").unix() } } }
        }).catch((err: any) => {
          colors.error("Error while updating user: " + err);
        }).then(() => {
          colors.success("User updated successfully");
        }).finally(() => {
          colors.info("Payment completed and user updated successfully");
        });
      } else colors.error("User not found");
    } else colors.error("Subscription not found");
  } else if (event.type == "invoice.payment_failed") {
    const payment = event.data.object as Stripe.Invoice;

    const subscription = await prisma.subscription.findFirst({ where: { subscriptionId: payment.subscription?.toString() ?? "NONE" } });
    if (subscription) {
      const user = await prisma.user.findFirst({ where: { userId: subscription.userId } });
      if (user) {
        await prisma.user.update({
          where: { userId: user.userId },
          data: { isPremium: false, subscription: { update: { nextDueDate: DayJS().unix() } } }
        }).catch((err: any) => {
          colors.error("Error while updating user: " + err);
        }).then(() => {
          colors.success("User updated successfully");
        }).finally(() => {
          colors.info("Payment failed and user updated successfully");
        });
      } else colors.error("User not found");
    } else colors.error("Subscription not found");
  } else if (event.type == "customer.subscription.deleted") {
    const payment = event.data.object as Stripe.Subscription;

    const subscription = await prisma.subscription.findFirst({ where: { subscriptionId: payment.id } });
    if (subscription) {
      const user = await prisma.user.findFirst({ where: { userId: subscription.userId } });
      if (user) {
        await prisma.user.update({
          where: { userId: user.userId },
          data: { isPremium: false, usages: { update: { max: "FREE", usage: 20 } }, subscription: { delete: true } }
        }).catch((err: any) => {
          colors.error("Error while updating user: " + err);
        }).then(() => {
          colors.success("User updated successfully");
        }).finally(() => {
          colors.info("Subscription deleted and user updated successfully");
        });
      } else colors.error("User not found");
    }
  }

  response.send();
});

app.listen(getNumberEnv("PORT") ?? 4242);
colors.info("Server is running on port " + (getNumberEnv("PORT") ?? 4242));