// functions/ask.js
import { Configuration, OpenAIApi } from "openai";
import fs from "fs";
import path from "path";

const KB = fs.readFileSync(path.resolve("knowledge_base.txt"), "utf-8");
const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(config);

export async function handler(event) {
  try {
    const { question } = JSON.parse(event.body);
    if (!question) throw new Error("No question");

    // Build a simple RAG prompt by pasting the entire KB.
    // (If your KB grows >4k tokens you can split it later.)
    const prompt = `
You are NeurogenAI, an expert cognitive‐health assistant.
Use the following KNOWLEDGE to answer as fully as possible:

${KB}

QUESTION: ${question}
    `.trim();

    const chat = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "system", content: prompt }]
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ answer: chat.data.choices[0].message.content })
    };
  } catch (err) {
    return { statusCode: 500, body: String(err) };
  }
}
