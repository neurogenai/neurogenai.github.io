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

  // 1) Initialize clients
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const pinecone = new PineconeClient();
  await pinecone.init({
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENV,
  });
  const index = pinecone.Index(process.env.PINECONE_INDEX);

  try {
    // 2) Embed the question
    const embedRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: question,
    });
    const vector = embedRes.data[0].embedding;

    // 3) Query Pinecone for top-3 documents
    const queryResponse = await index.query({
      queryRequest: {
        vector,
        topK: 3,
        includeMetadata: true,
      },
    });
    const docs = queryResponse.matches || [];

    // 4) Build the RAG context
    const context = docs
      .map(
        (m, i) =>
          `Source ${i + 1} (${m.metadata.source}):\n${m.metadata.text}`
      )
      .join("\n\n");

    // 5) Run the Chat Completion
    const chatRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",          // or another chat model
      messages: [
        {
          role: "system",
          content:
            "You are a cognitive health assistant. Use the context to answer the user’s question:\n\n" +
            context,
        },
        { role: "user", content: question },
      ],
    });
    const answer = chatRes.choices[0].message.content;

    // 6) Return answer + sources
    const sources = docs.map((m) => m.metadata.source);
    return res.status(200).json({ answer, sources });
  } catch (err) {
    console.error("RAG Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
