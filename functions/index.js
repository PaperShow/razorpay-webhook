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
const Razorpay = require("razorpay");
require("dotenv").config(); 

const cors = require("cors")({ origin: true });

const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();
const WEBHOOK_SECRET = "your_webhook_secret"; // Replace with your Razorpay webhook secret

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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

    // const amount = entity.amount;
    const paymentId = entity.id;
    const orderId = entity.order_id;
    const method = entity.method;
    const uid = entity.notes.uid;
    const code = entity.notes.code;
    const amount = entity.notes.creditAmount;
    const description = entity.description;

    console.log(code);

    try {

        await db.collection("payment").add({
            amount: parseFloat(amount) / 100,
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
            await db
                .collection('tutor')
                .doc(uid)
                .update({
                    'verified': true,
                });

            // await db
            //     .collection('etp').add({
            //         'uid' : uid,
            //         'paymentDone': true,
            //         'paymentId': paymentId,
            //         'orderId': orderId,
            //     });
                
        }
        res.status(200).send("Webhook received and stored in Firestore");

    } catch (error) {
        console.error("Error storing webhook:", error);
        res.status(500).send("Internal Server Error");
    }
});

exports.razorpayOrderApi = onRequest(async (req, res) => {
    try {
        res.set("Access-Control-Allow-Origin", "*"); // Change this based on your setup
        res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    
        if (req.method === "OPTIONS") {
            return res.status(204).send(""); // Handle preflight requests
        }
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method Not Allowed" });
        }

        const { amount, receipt } = req.body;

        // Validate request body
        if (!amount) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Order data
        const orderData = {
            amount: amount,  // amount will be in paise when api is hit
            currency: "INR",
            receipt: receipt,
        };

        // Create order using Razorpay SDK
        const order = await razorpay.orders.create(orderData);

        return res.status(200).json(order);
    } catch (error) {
        console.error("Error creating Razorpay order:", error.message);
        return res.status(500).json(error);
    }
});
