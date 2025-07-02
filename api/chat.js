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

  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Initialize Pinecone client
  const pinecone = new PineconeClient();
  await pinecone.init({
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENV,
    projectName: process.env.PINECONE_PROJECT_NAME,
  });
  const index = pinecone.Index(process.env.PINECONE_INDEX);

  try {
    // 1) Embed the user question
    const embedRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: question,
    });
    const userVector = embedRes.data[0].embedding;

    // 2) Query Pinecone for the top 3 most similar documents
    const queryResponse = await index.query({
      queryRequest: {
        vector: userVector,
        topK: 3,
        includeMetadata: true,
      },
    });
    const matches = queryResponse.matches || [];

    // 3) Build RAG context from returned matches
    const context = matches
      .map((m, i) => {
        const src = m.metadata.source ?? `doc${i+1}`;
        const text = m.metadata.text ?? "";
        return `Source ${i + 1} (${src}):\n${text}`;
      })
      .join("\n\n");

    // 4) Call OpenAI Chat Completion with context
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a cognitive health assistant. Use the following context to answer the user's question:\n\n" +
            context,
        },
        { role: "user", content: question },
      ],
    });
    const answer = chatResponse.choices[0].message.content;

    // 5) Return answer and source list
    const sources = matches.map((m) => m.metadata.source || "");
    return res.status(200).json({ answer, sources });
  } catch (err) {
    console.error("RAG Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
