import OpenAI from "openai";
import { PineconeClient } from "@pinecone-database/pinecone";

export default async function handler(req, res) {
  console.log({
    OPENAI_API_KEY:    !!process.env.OPENAI_API_KEY,
    PINECONE_API_KEY:  !!process.env.PINECONE_API_KEY,
    PINECONE_BASE_URL: process.env.PINECONE_BASE_URL,
    PINECONE_PROJECT_NAME: process.env.PINECONE_PROJECT_NAME,
    PINECONE_INDEX:    process.env.PINECONE_INDEX,
  });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: "Missing question" });
  }

  // 1) Initialize OpenAI
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // 2) Initialize Pinecone with explicit controller + project
  const pinecone = new PineconeClient();
  await pinecone.init({
    apiKey:   process.env.PINECONE_API_KEY,
    baseUrl:  process.env.PINECONE_BASE_URL,      // e.g. "https://controller.aped-4627-b74a.pinecone.io"
    projectName: process.env.PINECONE_PROJECT_NAME // e.g. "neurogenai"
  });
  const index = pinecone.Index(process.env.PINECONE_INDEX); // e.g. "knowledge"

  try {
    // 3) Embed the question
    const { data: [ embeddingObj ] } = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: question,
    });
    const vector = embeddingObj.embedding;

    // 4) Query Pinecone
    const { matches = [] } = await index.query({
      queryRequest: { vector, topK: 3, includeMetadata: true },
    });

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
            "You are a cognitive health assistant. Use the following context to answer:\n\n" +
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
