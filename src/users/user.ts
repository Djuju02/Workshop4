import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT, BASE_USER_PORT, REGISTRY_PORT } from "../config";
import { GetNodeRegistryBody, Node } from "@/src/registry/registry";
import { createRandomSymmetricKey, exportSymKey, importSymKey, rsaEncrypt, symEncrypt } from "../crypto";

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

// Step 2: Variables to store messages and the circuit used.
let lastReceivedMessage: string | null = null;
let lastSentMessage: string | null = null;
let lastCircuit: Node[] = [];

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

  // Step 1.2: TODO implement the status route
  _user.get("/status", (req, res) => {
    res.send("live");
  });

  // Step 2: Route to get the last received message.
  _user.get("/getLastReceivedMessage", (req, res) => {
    res.json({ result: lastReceivedMessage });
  });

  // Step 2: Route to get the last sent message.
  _user.get("/getLastSentMessage", (req, res) => {
    res.json({ result: lastSentMessage });
  });
  
  // Step 4: Route for receiving messages.
  _user.post("/message", (req, res) => {
    lastReceivedMessage = req.body.message;
    res.send("success");
  });

  // Retrieves the last circuit of nodes used for sending a message.
  _user.get("/getLastCircuit", (req, res) => {
    res.status(200).json({result: lastCircuit.map((node) => node.nodeId)});
  });

  // Step 6.1: Route for sending messages.
  _user.post("/sendMessage", async (req, res) => {
    const { message, destinationUserId } = req.body;
    let circuit: Node[] = [];

    // Creates a random circuit of 3 distinct nodes.
    const nodes = await fetch(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`)
      .then((res) => res.json())
      .then((body: any) => body.nodes);

    // Selects 3 random nodes for the circuit.
    while (circuit.length < 3) {
      const randomIndex = Math.floor(Math.random() * nodes.length);
      if (!circuit.map(node => node.nodeId).includes(nodes[randomIndex].nodeId)) {
        circuit.push(nodes[randomIndex]);
      }
    }

    lastSentMessage = message;
    let messageToSend = message;
    let destination = `${BASE_USER_PORT + destinationUserId}`.padStart(10, "0");

    // Encrypts the message layer by layer for each node in the circuit.
    for (let i = 0; i < circuit.length; i++) {
      const node = circuit[i];
      const symKey = await createRandomSymmetricKey();
      const messageToEncrypt = `${destination}${messageToSend}`;
      destination = `${BASE_ONION_ROUTER_PORT + node.nodeId}`.padStart(10, "0");
      const encryptedMessage = await symEncrypt(symKey, messageToEncrypt);
      const encryptedSymKey = await rsaEncrypt(await exportSymKey(symKey), node.pubKey);
      messageToSend = encryptedSymKey + encryptedMessage;
    }

    // Reverses the circuit for sending.
    circuit.reverse();

    // Sends the encrypted message to the first node in the circuit.
    const entryNode = circuit[0];
    lastCircuit = circuit;
    await fetch(`http://localhost:${BASE_ONION_ROUTER_PORT + entryNode.nodeId}/message`, {
      method: "POST",
      body: JSON.stringify({ message: messageToSend }),
      headers: { "Content-Type": "application/json" },
    });

    res.send("success");
  });

  // Starts the user service listening on a unique port.
  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(`User ${userId} is listening on port ${BASE_USER_PORT + userId}`);
  });

  return server;
}
