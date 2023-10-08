require("dotenv").config();
const mineflayer = require("mineflayer");
const OpenAI = require("openai");
const openai = new OpenAI();

const getTiny = async (name) => {
  const response = await fetch("https://plugin.tinyai.id/get?name=" + name);
  const json = await response.json();
  return json;
};

const options = {
  host: "localhost", // Change this to the ip you want.
  port: process.env.PORT || 60913, // Change this to the port you want.
  username: `TinyAI.id`, // Change this to the username you want.
};

const bot = mineflayer.createBot(options);

const start = async () => {
  const tiny = await getTiny("tiny");

  bot.once("spawn", () => {
    console.log("I spawned!");
    bot.chat(tiny.systemPrompt);
  });

  bot.on("chat", async (username, message) => {
    if (username === bot.username) return;
    console.log(`${username}: ${message}`);

    const tinyName = message.split(" ")[0];

    let subTiny = await getTiny(tinyName);

    // Fallback to tiny if the AI doesn't exist
    if (!subTiny || !subTiny.name) {
      subTiny = tiny;
    }

    // Prepare messages
    const messages = [
      {
        role: "system",
        content: `Hello ${tinyName}! 😊 ${process.env.SYSTEM_PROMPT}`,
      },
      { role: "system", content: subTiny.systemPrompt },
    ];

    // Add data if available
    if (subTiny.data) {
      messages.push({ role: "system", content: subTiny.data });
    }

    // Add system knowledge if available
    if (tiny.name !== subTiny.name && subTiny.systemKnowledge) {
      messages.push({ role: "assistant", content: subTiny.systemKnowledge });
    }

    // Add user message
    messages.push({ role: "user", content: message });

    // Call OpenAI API
    const completions = await openai.chat.completions.create({
      messages,
      model: "gpt-3.5-turbo-0613",
      functions: [
        {
          name: "create_ai",
          description: "Create a new AI",
          parameters: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "The name of the AI",
              },
              firstMessage: {
                type: "string",
                description: "The first message of the AI",
              },
              secondMessage: {
                type: "string",
                description: "The second message of the AI, optional",
              },
              data: {
                type: "string",
                description: "Define the data of the AI, optional",
              },
            },
            required: ["name", "firstMessage"],
          },
        },
        {
          name: "modify_ai",
          description: "Modify an existing tiny AI",
          parameters: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "The name of the AI",
              },
              firstMessage: {
                type: "string",
                description: "The first message of the AI",
              },
              secondMessage: {
                type: "string",
                description: "The second message of the AI, optional",
              },
              data: {
                type: "string",
                description:
                  "The data for the AI, can be a list of products, services, or anything you want to share with your customers",
              },
              key: {
                type: "string",
                description: "The key of the AI",
              },
            },
            required: ["name", "firstMessage", "secondMessage", "key"],
          },
        },
      ],
    });

    // Handle response from OpenAI API call, if it's a function call, call the TinyAI API
    if (completions.choices[0].finish_reason === "function_call") {
      const functionCall = JSON.parse(
        completions.choices[0].message.function_call.arguments
      );
      // Prepare payload
      const payload = {
        name: functionCall.name,
        systemPrompt: functionCall.firstMessage,
        systemKnowledge: functionCall.secondMessage || "",
        data: functionCall.data || "",
      };
      // Call TinyAI API
      const upsert = await fetch("https://plugin.tinyai.id/upsert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }).then((res) => res.json());

      // Handle response from TinyAI API
      if (upsert.response.includes("tiny updated.")) {
        bot.chat("Your AI has been updated.");
        bot.chat(`Say "${functionCall.name}" to talk to your AI.`);
      } else if (upsert.response.includes("already exists")) {
        bot.chat(
          "This AI already exists. Please try again with a different name or provide a key to modify it."
        );
      } else if (upsert.response.includes("Preview your AI")) {
        bot.chat(
          "Your AI has been created. Preview your AI at https://tinyai.id/" +
            functionCall.name
        );
        bot.chat(`Say "${functionCall.name}" to talk to your AI.`);
      } else {
        bot.chat(upsert.response);
      }
    } else {
      bot.chat(completions.choices[0].message.content);
    }
  });
};

start();
