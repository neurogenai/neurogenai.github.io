// api/chat.js
import { OpenAIEmbeddings }    from "langchain/embeddings/openai.js";
import { PineconeStore }       from "langchain/vectorstores/pinecone.js";
import { ChatOpenAI }          from "langchain/chat_models/openai.js";
import { RetrievalQAChain }    from "langchain/chains/retrieval_qa.js";
console.log("== /api/chat invoked ==");
console.log("OPENAI_API_KEY:", !!process.env.OPENAI_API_KEY);
console.log("PINECONE_API_KEY:", !!process.env.PINECONE_API_KEY);
console.log("PINECONE_ENV:", process.env.PINECONE_ENV);
console.log("PINECONE_INDEX:", process.env.PINECONE_INDEX);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { question } = req.body;
  if (!question) return res.status(400).json({ error: "Missing question" });

  // 1) Connect to Pinecone
  const pinecone = new PineconeClient();
  await pinecone.init({
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENV,
  });
  const index = pinecone.Index(process.env.PINECONE_INDEX);

  // 2) Build vector store
  const vectorStore = await PineconeStore.fromExistingIndex(
    new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY }),
    { pineconeIndex: index, textKey: "text" }
  );

  // 3) Instantiate LLM & RAG chain
  const model = new ChatOpenAI({
    temperature: 0.2,
    openAIApiKey: process.env.OPENAI_API_KEY
  });
  const chain = RetrievalQAChain.fromLLM(model, vectorStore.asRetriever(3));

  // 4) Query + respond
  try {
    const result = await chain.call({ query: question });
    res.status(200).json({
      answer: result.text,
      sources: result.sourceDocuments.map(d => d.metadata.source)
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
