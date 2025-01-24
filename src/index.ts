import express, { Request, Response } from "express";
import { Client, LocalAuth, Message, MessageMedia } from "whatsapp-web.js";
import QRCode from "qrcode";
import { GoogleGenerativeAI, ChatSession } from "@google/generative-ai";
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.API_KEY!);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = 5000;

async function mediaToGenerativePart(media: MessageMedia) {
  return {
    inlineData: { data: media.data, mimeType: media.mimetype },
  };
}

const whatsappClient = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

whatsappClient.on("qr", (qr: string) => {
  // Menghasilkan QR Code dan menyimpannya sebagai gambar PNG
  QRCode.toFile('./qr.png', qr, { width: 200 }, (err) => {
    if (err) throw err;
    console.log("QR code saved to qr.png, scan it.");
  });
});

whatsappClient.on("ready", () => {
  console.log("WhatsApp Web client is ready!");
});

whatsappClient.on("message", async (msg: Message) => {
  const senderNumber: string = msg.from;
  const message: string = msg.body;

  console.log(`Received message from ${senderNumber}: ${message}`);

  let mediaPart = null;

  if (msg.hasMedia) {
    const media = await msg.downloadMedia();
    mediaPart = await mediaToGenerativePart(media);
  }

  await run(message, senderNumber, mediaPart);
});

whatsappClient.initialize();

let chat: ChatSession | null = null;

async function run(message: string, senderNumber: string, mediaPart?: any): Promise<void> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    if (!chat) {
      chat = model.startChat({
        generationConfig: {
          maxOutputTokens: 500,
        },
      });
    }
    let prompt: any[] = [];

    prompt.push(message);

    if (mediaPart) {
      prompt.push(mediaPart);
    }

    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    const text: string = response.text();

    if (text) {
      console.log("Generated Text:", text);
      await sendWhatsAppMessage(text, senderNumber);
    } else {
      console.error("This problem is related to Model Limitations and API Rate Limits");
    }

  } catch (error) {
    console.error("Error in run function:", error);
    await sendWhatsAppMessage("Oops, an error occurred. Please try again later.", senderNumber);
  }
}

async function sendWhatsAppMessage(text: string, toNumber: string): Promise<void> {
  try {
    await whatsappClient.sendMessage(toNumber, text);
  } catch (err) {
    console.error("Failed to send WhatsApp message:");
    console.error("Error details:", err);
  }
}

app.listen(port, () => console.log(`Express app running on port ${port}!`));
