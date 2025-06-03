import { config } from "dotenv";
import readline from "readline/promises";
import { GoogleGenAI } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

config();
let tools = [];
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const mcpClient = new Client({
  name: "example-client",
  version: "1.0.0",
});

const chatHistory = [];
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

mcpClient
  .connect(new SSEClientTransport(new URL("http://localhost:3001/sse")))
  .then(async () => {
    console.log("Connected to MCP server");
    tools = (await mcpClient.listTools()).tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: tool.inputSchema.type,
        properties: tool.inputSchema.properties,
        required: tool.inputSchema.required,
      },
    }));
    await chatLoop();
  })
  .catch((err) => {
    console.error("Connection error:", err);
    process.exit(1);
  });

async function chatLoop(toolCall) {
  if (toolCall) {
    console.log("Calling tool", toolCall.name);
    chatHistory.push({
      role: "model",
      parts: [{ text: `calling tool ${toolCall.name}`, type: "text" }],
    });
    const toolResult = await mcpClient.callTool({
      name: toolCall.name,
      arguments: toolCall.args,
    });
    chatHistory.push({
      role: "user",
      parts: [
        { text: "Tool result: " + toolResult.content[0].text, type: "text" },
      ],
    });
  } else {
    const question = await rl.question("You: ");
    chatHistory.push({
      role: "user",
      parts: [{ text: question, type: "text" }],
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: chatHistory,
    config: {
      tools: [{ functionDeclarations: tools }],
    },
  });

  const candidate = response.candidates[0].content.parts[0];
  const functionCall = candidate.functionCall;
  const responseText = candidate.text;

  if (functionCall) {
    return chatLoop(functionCall);
  }

  chatHistory.push({
    role: "model",
    parts: [{ text: responseText, type: "text" }],
  });
  console.log(`AI: ${responseText}`);
  await chatLoop();
}
