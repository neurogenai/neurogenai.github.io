// api/chat.js

import OpenAI from "openai";
import { PineconeClient } from "@pinecone-database/pinecone";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: "Missing question" });
  }

  // 1) Initialize OpenAI
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // 2) Initialize Pinecone with explicit controller URL
  const pinecone = new PineconeClient();
  await pinecone.init({
    apiKey: process.env.PINECONE_API_KEY,
    baseUrl: process.env.PINECONE_BASE_URL
  });
  const index = pinecone.Index(process.env.PINECONE_INDEX);

  try {
    // 3) Embed the question
    const embedRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: question,
    });
    const vector = embedRes.data[0].embedding;

    // 4) Query Pinecone
    const queryRes = await index.query({
      queryRequest: { vector, topK: 3, includeMetadata: true },
    });
    const matches = queryRes.matches || [];

    // 5) Build RAG context
    const context = matches
      .map((m, i) => {
        const src = m.metadata.source || `doc${i+1}`;
        const txt = m.metadata.text    || "";
        return `Source ${i+1} (${src}):\n${txt}`;
      })
      .join("\n\n");

    // 6) Chat completion
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a cognitive health assistant. Use the following context:\n\n" +
            context,
        },
        { role: "user", content: question },
      ],
    });
    const answer = chat.choices[0].message.content;

    // 7) Return
    return res.status(200).json({
      answer,
      sources: matches.map((m) => m.metadata.source || ""),
    });
  } catch (err) {
    console.error("RAG Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
