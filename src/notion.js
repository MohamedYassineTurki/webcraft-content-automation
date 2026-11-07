import { Client } from "@notionhq/client";

export function createNotionClient() {
  if (!process.env.NOTION_TOKEN) throw new Error("Set NOTION_TOKEN in .env.");
  return new Client({ auth: process.env.NOTION_TOKEN, notionVersion: "2022-06-28" });
}

function statusValue(value) {
  const type = process.env.NOTION_STATUS_TYPE || "select";
  if (!["select", "status"].includes(type)) throw new Error("NOTION_STATUS_TYPE must be select or status.");
  return { [type]: { equals: value } };
}

export async function findPages(notion, databaseId, { status = "Ready", unposted = false, limit = 50 } = {}) {
  if (!databaseId) throw new Error("Set NOTION_DATABASE_ID in .env.");
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Queue limit must be a positive integer.");
  const statusFilter = { property: "Status", ...statusValue(status) };
  const filter = unposted ? { and: [statusFilter, { property: "Posted", checkbox: { equals: false } }] } : statusFilter;
  const pages = [];
  let cursor;
  do {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter,
      sorts: [{ timestamp: "created_time", direction: "ascending" }],
      page_size: Math.min(100, limit - pages.length),
      ...(cursor ? { start_cursor: cursor } : {})
    });
    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor && pages.length < limit);
  return pages.slice(0, limit);
}

export function textValue(parts = []) {
  return parts.map((part) => part.plain_text ?? part.text?.content ?? "").join("").trim();
}

export function getTitle(page) {
  return textValue(page.properties?.["Video Title"]?.title);
}

export function readJob(page) {
  return {
    id: page.id,
    title: getTitle(page),
    website: page.properties?.["Website URL"]?.url || "",
    script: textValue(page.properties?.["ChatGpt Script"]?.rich_text),
    reference: textValue(page.properties?.["Video To follow"]?.rich_text)
  };
}

export function richText(value) {
  const content = String(value || "").slice(0, 1900);
  return { rich_text: content ? [{ type: "text", text: { content } }] : [] };
}

export async function updateStatus(notion, id, status, extra = {}) {
  if (!["Generating", "Done", "Error"].includes(status)) throw new Error("Invalid production status.");
  const type = process.env.NOTION_STATUS_TYPE || "select";
  await notion.pages.update({ page_id: id, properties: { Status: { [type]: { name: status } }, ...extra } });
}

export function notionQueue(notion) {
  return { update: (id, status, properties) => updateStatus(notion, id, status, properties) };
}
