const axios = require("axios");

exports.OpenAIResponse = async (messages) => {
  // messages = [{ role: "user"|"assistant", content: "..." }, ...]
  const data = {
    // model: "gpt-3.5-turbo",
    model: "gpt-5",
    messages,
    // Optionally: temperature, max_tokens, etc.
  };

  try {
    const openaiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      data,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Return just the AI's message content
    return openaiRes.data.choices[0].message.content; 
  } catch (err) {
    console.log("Open AI error:", err?.response?.data);
    throw err;
  }
};

/**
 * Streaming helper (SSE over HTTP response)
 * @param {Array} messages - chat history for OpenAI
 * @param {(delta: string) => void} onDelta - called for each streamed token/chunk
 * @returns {Promise<string>} full text assembled from the stream
 */
exports.OpenAIStream = async (messages, onDelta) => {
  const payload = {
    model: "gpt-5",
    messages,
    stream: true,
  };

  const resp = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    payload,
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      responseType: "stream",
      // IMPORTANT: don’t set maxContentLength here; streaming is chunked
    }
  );

  let fullText = "";

  // OpenAI streams Server-Sent-Event style lines: "data: {json}\n\n"
  await new Promise((resolve, reject) => {
    resp.data.on("data", (chunk) => {
      const str = chunk.toString("utf8");
      // split on double newlines to get SSE frames
      const parts = str.split(/\n\n/);

      for (const part of parts) {
        const line = part.trim();
        if (!line) continue;
        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim(); // after "data:"
        if (data === "[DONE]") {
          resolve();
          return;
        }

        try {
          const json = JSON.parse(data);
          // Chat Completions stream shape:
          // json.choices[0].delta = { content?: string, role?: string }
          const delta = json?.choices?.[0]?.delta?.content || "";
          if (delta) {
            fullText += delta;
            onDelta?.(delta);
          }
        } catch (e) {
          // ignore malformed keepalive chunks
        }
      }
    });

    resp.data.on("end", resolve);
    resp.data.on("error", reject);
  });

  return fullText;
};