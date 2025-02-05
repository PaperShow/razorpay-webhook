/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { onRequest } = require("firebase-functions/v2/https");
// const crypto = require("crypto")
// const logger = require("firebase-functions/logger");
const { validateWebhookSignature } = require("razorpay/dist/utils/razorpay-utils");

const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();
const WEBHOOK_SECRET = "your_webhook_secret"; // Replace with your Razorpay webhook secret

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

exports.razorpayWebhook = onRequest(async (req, res) => {
    const webhookBody = JSON.stringify(req.body);
    const webhookSignature = req.headers["x-razorpay-signature"];

    if (!webhookSignature) {
        return res.status(400).send("Signature missing");
    }

    const isValid = validateWebhookSignature(webhookBody, webhookSignature, WEBHOOK_SECRET);

    if (!isValid) {
        return res.status(400).send("Invalid signature");
    }

    if (
        !req.body.payload ||
        !req.body.payload.payment ||
        !req.body.payload.payment.entity
    ) {
        console.log("Payload does not contain payment data.");
        return res.status(400).send("No payment data in payload");
    }

    console.log("Webhook verified:", req.body);
    const eventName = req.body.event;
    const entity = req.body.payload.payment.entity;

    const amount = entity.amount;
    const paymentId = entity.id;
    const orderId = entity.order_id;
    const method = entity.method;
    const uid = entity.notes.uid;
    const code = entity.notes.code;
    const description = entity.description;

    try {

        await db.collection("payment").add({
            amount: amount / 100,
            credit: true,
            debit: false,
            description: description,
            method: method,
            orderId: orderId,
            paymentId: paymentId,
            userId: uid,
            code: code,
            addedDate: admin.firestore.FieldValue.serverTimestamp()
        });
        if (code == 2) {
            await FirebaseFirestore.instance
                .collection('tutor')
                .doc(uid)
                .update({
                    'verified': true,
                });

            await FirebaseFirestore.instance
                .collection('etp')
                .doc(uid)
                .update({
                    'paymentDone': true,
                    'paymentId': paymentId,
                    'orderId': orderId,
                });
        }
        res.status(200).send("Webhook received and stored in Firestore");

    } catch (error) {
        console.error("Error storing webhook:", error);
        res.status(500).send("Internal Server Error");
    }
});
