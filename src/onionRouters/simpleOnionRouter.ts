import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import { Node } from "../registry/registry";
import { generateRsaKeyPair, exportPubKey, exportPrvKey, rsaDecrypt, symDecrypt, importPrvKey } from "../crypto";

export async function simpleOnionRouter(nodeId: number) {
  // Step 2: Initialize variables to store the last received encrypted and decrypted messages, as well as the last message's source and destination.
  let lastReceivedEncryptedMessage: string | null = null;
  let lastReceivedDecryptedMessage: string | null = null;
  let lastMessageDestination: number | null = null;
  let lastMessageSource: number | null = null;

  // Initialize the Express application for the onion router.
  const onionRouter = express();
  // Middleware to parse JSON bodies.
  onionRouter.use(express.json());
  // Middleware to parse URL-encoded bodies.
  onionRouter.use(bodyParser.json());

  // Step 3.2: Generate an RSA key pair for secure communication.
  const keyPair = await generateRsaKeyPair();
  const publicKey = await exportPubKey(keyPair.publicKey);
  const privateKey = await exportPrvKey(keyPair.privateKey);

  // Create a node object with its ID and public key for registry.
  let node: Node = { nodeId: nodeId, pubKey: publicKey };

  // Step 1.1: Implement the status route to check the service's health.
  onionRouter.get("/status", (req, res) => {
    res.send("live");
  });


  // Step 2.1: Routes to provide insights into the node's message handling.
  // Returns the last encrypted message received.
  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
    res.json({ result: lastReceivedEncryptedMessage });
  });

  // Returns the last decrypted message.
  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
    res.json({ result: lastReceivedDecryptedMessage });
  });

  // Returns the destination ID of the last message.
  onionRouter.get("/getLastMessageDestination", (req, res) => {
    res.json({ result: lastMessageDestination });
  });

  // Returns the source ID of the last message.
  onionRouter.get("/getLastMessageSource", (req, res) => {
    res.json({ result: lastMessageSource });
  });


  // Step 3.3: Register the node with the network's registry by posting its details.
  // This step is critical for the node to participate in the onion routing network.
  const response = await fetch(`http://localhost:${REGISTRY_PORT}/registerNode`, {
    method: "POST",
    body: JSON.stringify({ nodeId: nodeId, pubKey: publicKey }),
    headers: { "Content-Type": "application/json" },
  });
  console.log(await response.json());

  // Step 3.4: Provide a route to retrieve the node's private key.
  // Note: Exposing a private key over a network, especially an insecure one, poses significant security risks.
  onionRouter.get("/getPrivateKey", (req, res) => {
    res.json({ result: privateKey });
  });

  // Step 6: Define the /message route for handling incoming messages.
  // This route decrypts the outer layer of the message, stores metadata, and forwards the message to its next destination.
  onionRouter.post("/message", async (req, res) => {
    const layer = req.body.message;
    // Decrypt the symmetric key and the message using RSA and symmetric decryption, respectively.
    const encryptedSymKey = layer.slice(0, 344);
    const symKey = privateKey ? await rsaDecrypt(encryptedSymKey, await importPrvKey(privateKey)) : null;
    const encryptedMessage = layer.slice(344);
    const message = symKey ? await symDecrypt(symKey, encryptedMessage) : null;
    
    // Update the stored message data for retrieval by the above GET routes.
    lastReceivedEncryptedMessage = layer;
    lastReceivedDecryptedMessage = message ? message.slice(10) : null;
    lastMessageSource = nodeId;
    lastMessageDestination = message ? parseInt(message.slice(0, 10), 10) : null;
    
    // Forward the decrypted message to the next destination.
    if (lastMessageDestination) {
      await fetch(`http://localhost:${lastMessageDestination}/message`, {
        method: "POST",
        body: JSON.stringify({ message: lastReceivedDecryptedMessage }),
        headers: { "Content-Type": "application/json" },
      });
    }
    res.send("success");
  });

  // Start the onion router on a port that's a sum of a base port and the node ID.
  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(
      `Onion router ${nodeId} is listening on port ${
        BASE_ONION_ROUTER_PORT + nodeId
      }`
    );
  });

  return server;
}