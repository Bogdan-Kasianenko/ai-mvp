 import { getReply } from "./service.mjs";

async function main() {
  try {
    const reply = await getReply();
    console.log("Ответ от AI:", reply);
  } catch (error) {
    console.log("Не удалось получить ответ:", error.message);
  }
}

main();