export async function getReply(message) {
  return "Zpráva dorazila na server. AI zatím není připojena.";
}warning: in the working copy of 'app.mjs', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/app.mjs b/app.mjs[m
[1mindex 0045665..6e36529 100644[m
[1m--- a/app.mjs[m
[1m+++ b/app.mjs[m
[36m@@ -1,3 +1,4 @@[m
[32m+[m[32mimport { getReply } from "./service.mjs";[m
 import express from "express";[m
 import { fileURLToPath } from "node:url";[m
 [m
[36m@@ -13,13 +14,21 @@[m [mapp.get("/api/health", (request, response) => {[m
   response.json({ status: "ok" });[m
 });[m
 [m
[31m-app.post("/api/chat", (request, response) => {[m
[32m+[m[32mapp.post("/api/chat", async (request, response) => {[m
   const message = request.body?.message;[m
[31m-  if (typeof message !== "string" || message.trim().length === 0 || message.length > 1000) {[m
[31m-    return response.status(400).json({ error: "Zadejte zprávu o délce 1 až 1000 znaků." });[m
[32m+[m
[32m+[m[32m  if ([m
[32m+[m[32m    typeof message !== "string" ||[m
[32m+[m[32m    message.trim().length === 0 ||[m
[32m+[m[32m    message.length > 1000[m
[32m+[m[32m  ) {[m
[32m+[m[32m    return response.status(400).json({[m
[32m+[m[32m      error: "Zadejte zprávu o délce 1 až 1000 znaků."[m
[32m+[m[32m    });[m
   }[m
 [m
[31m-  return response.json({ reply: "Zpráva dorazila na server. AI zatím není připojena." });[m
[32m+[m[32m  const reply = await getReply(message);[m
[32m+[m[32m  return response.json({ reply });[m
 });[m
 [m
 app.use((error, request, response, next) => {[m
[1mdiff --git a/service.mjs b/service.mjs[m
[1mindex e3c9106..28c8c51 100644[m
[1m--- a/service.mjs[m
[1m+++ b/service.mjs[m
[36m@@ -1,3 +1,3 @@[m
[31m-export async function getReply() {[m
[31m-  return "Диагностика стоит 800 крон";[m
[32m+[m[32mexport async function getReply(message) {[m
[32m+[m[32m  return "Zpráva dorazila na server. AI zatím není připojena.";[m
 }[m
\ No newline at end of file[m
