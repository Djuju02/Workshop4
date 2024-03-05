import bodyParser from "body-parser";
import express from "express";
import { REGISTRY_PORT } from "../config";

// Defines the structure for a node in the network.
export type Node = { nodeId: number; pubKey: string };

// Structure for the request body to register a node.
export type RegisterNodeBody = {
  nodeId: number;
  pubKey: string;
};

// Structure for the response body when retrieving the node registry.
export type GetNodeRegistryBody = {
  nodes: Node[];
};

// Launches the registry service.
export async function launchRegistry() {
  const _registry = express();
  // Middleware for parsing JSON requests.
  _registry.use(express.json());
  _registry.use(bodyParser.json());

  // Step 3: Initializes an empty list to store registered nodes.
  let getNodeRegistryBody: GetNodeRegistryBody = { nodes: [] };

  // Step 1.3: TODO implement the status route
  _registry.get("/status", (req, res) => {
    res.send("live");
  });

  // Step 3.1: Route for node registration.
  _registry.post("/registerNode", (req, res) => {
    const { nodeId, pubKey } = req.body;
    getNodeRegistryBody.nodes.push({ nodeId, pubKey });
    res.json({ result: "success" });
  });

  // Step 3.4: Route to retrieve the node registry.
  _registry.get("/getNodeRegistry", (req, res) => {
    res.json(getNodeRegistryBody);
  });
  
  // Starts listening for requests on the configured port.
  const server = _registry.listen(REGISTRY_PORT, () => {
    console.log(`Registry is listening on port ${REGISTRY_PORT}`);
  });

  return server;
}