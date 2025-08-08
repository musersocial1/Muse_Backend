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
