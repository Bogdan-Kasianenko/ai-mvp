 import { getReply } from "./service.mjs";

async function main() {
  try {
    const reply = await getReply();
    console.log("Ответ:", reply);
  } catch (error) {
    console.log("Не удалось получить ответ:", error.message);
  }
}

main();