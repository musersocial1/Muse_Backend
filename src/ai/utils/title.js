const axios = require("axios");

module.exports.generateChatTitle = async function (text) {
  const fallback = (text || "New chat")
    .replace(/\s+/g, " ")
    .slice(0, 50)
    .trim();

  try {
    const payload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Create a short, clear chat title (max 6 words). No punctuation beyond normal words." },
        { role: "user", content: `Create a concise title for this message: "${text}"` }
      ],
      temperature: 0.2,
      max_tokens: 20
    };

    const resp = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const title = resp.data?.choices?.[0]?.message?.content?.trim();
    return title || fallback;
  } catch {
    return fallback;
  }
};
