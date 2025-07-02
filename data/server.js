// server.js
import express from "express";
import fs from "fs";
import { OpenAI } from "openai";

const app = express();
app.use(express.json());

// 1) Load docs once
const docs = JSON.parse(fs.readFileSync("./data/docs.json", "utf8"));

// 2) Init OpenAI with your key
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 3) Endpoint for your chat page
app.post("/api/chat", async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: "Missing question" });

  try {
    // Answers endpoint does retrieval under the hood
    const answerRes = await openai.answers.create({
      // classic “Answers” uses ada for search, curie for answer by default
      search_model: "ada",
      model:        "curie",
      question,
      documents:    docs.map(d => d.text),
      examples:     [],      // optional few-shot Q/A pairs
      max_rerank:   3,       // consider top 3 chunks
      temperature:  0.2
    });

    // send back the top answer
    return res.json({ answer: answerRes.answers[0] });
  } catch (err) {
    console.error("Answers API error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// 4) Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on port ${port}`));
