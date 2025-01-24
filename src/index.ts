import express, { Request, Response } from "express";
import axios from "axios";
import { Client, LocalAuth, Message, MessageMedia } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { GoogleGenerativeAI, ChatSession } from "@google/generative-ai";
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.API_KEY!);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = 8080;

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
  qrcode.generate(qr, { small: true });
  console.log("QR Code received, scan with your phone.");
});

whatsappClient.on("ready", () => {
  console.log("WhatsApp Web client is ready!");
});

whatsappClient.on("message", async (msg: Message) => {
  const senderNumber: string = msg.from;

  // Periksa apakah pesan berasal dari grup
  if (senderNumber.includes('@g.us')) {
    console.log("Pesan ini datang dari grup, tidak akan dijawab.");
    return; // Mengabaikan pesan dari grup
  }

  const message: string = msg.body;
  console.log(`Received message from ${senderNumber}: ${message}`);

  let mediaPart = null;

  if (msg.hasMedia) {
    const media = await msg.downloadMedia();
    mediaPart = await mediaToGenerativePart(media);
  }

  // Tandai pesan sebagai "dibaca" oleh bot, bukan kamu
  await whatsappClient.sendSeen(senderNumber);

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

    // Menambahkan sapaan "Xenovia AI siap membantu" dan instruksi untuk bahasa Indonesia
    let prompt: any[] = [];
    prompt.push("Xenovia AI siap membantu! Tolong jawab dalam Bahasa Indonesia: " + message);

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
      await sendWhatsAppMessage("Maaf, ada masalah dalam memproses permintaan ini. Silakan coba lagi nanti.", senderNumber);
    }

  } catch (error) {
    console.error("Error in run function:", error);
    await sendWhatsAppMessage("Oops, terjadi kesalahan. Harap coba lagi nanti.", senderNumber);
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
