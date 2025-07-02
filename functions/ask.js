import fetch from "node-fetch";
import fs    from "fs";
import path  from "path";

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };
  try {
    const { question } = JSON.parse(event.body || "{}");
    if (!question) throw new Error("Missing `question`.");

    const KB = fs.readFileSync(path.resolve("knowledge_base.txt"), "utf-8");
    const prompt = `
You are NeurogenAI, a cognitive-health assistant.
Use the following KNOWLEDGE to answer in depth:

${KB}

QUESTION: ${question}
    `.trim();

    const PROJECT  = process.env.GCP_PROJECT;
    const LOCATION = "us-central1";
    const MODEL    = "text-bison-001";
    const KEY      = process.env.GOOGLE_API_KEY;

    const url = `https://vertexai.googleapis.com/v1/projects/${PROJECT}`
              + `/locations/${LOCATION}/publishers/google/models/${MODEL}`
              + `:generateText?key=${KEY}`;

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: { text: prompt },
        temperature: 0.2,
        maxOutputTokens: 512
      })
    });
    const json = await resp.json();
    if (json.error) throw new Error(json.error.message);

    const answer = (json.candidates?.[0]?.generateText || "").trim()
                 || "I’m sorry, I couldn’t generate an answer.";

    return { statusCode: 200, headers, body: JSON.stringify({ answer }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
}
