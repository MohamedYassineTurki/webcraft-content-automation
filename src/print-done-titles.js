import "dotenv/config";
import { createNotionClient, findPages, getTitle } from "./notion.js";

try {
  const pages = await findPages(createNotionClient(), process.env.NOTION_DATABASE_ID, {
    status: "Done", unposted: true, limit: Number.MAX_SAFE_INTEGER
  });
  if (!pages.length) console.log("No unposted Done videos found.");
  pages.forEach((page, index) => console.log(`${index + 1}. ${getTitle(page)}`));
} catch (error) { console.error(error.message); process.exitCode = 1; }
