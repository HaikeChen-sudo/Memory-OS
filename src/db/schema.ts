import {
  mysqlTable,
  varchar,
  longtext,
  json,
  float,
  datetime,
} from "drizzle-orm/mysql-core";

/* ------------------------------------------------------------------ */
/*  folders                                                             */
/* ------------------------------------------------------------------ */
export const folders = mysqlTable("folders", {
  id: varchar("id", { length: 36 }).primaryKey(),
  user_id: varchar("user_id", { length: 36 }).notNull().default("default"),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 20 }).notNull().default("#3b82f6"),
  created_at: datetime("created_at", { mode: "string" }).notNull(),
  updated_at: datetime("updated_at", { mode: "string" }).notNull(),
});

/* ------------------------------------------------------------------ */
/*  memories                                                            */
/* ------------------------------------------------------------------ */
export const memories = mysqlTable("memories", {
  id: varchar("id", { length: 36 }).primaryKey(),
  user_id: varchar("user_id", { length: 36 }).notNull().default("default"),
  folder_id: varchar("folder_id", { length: 36 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  content: longtext("content").notNull(),
  created_at: datetime("created_at", { mode: "string" }).notNull(),
  updated_at: datetime("updated_at", { mode: "string" }).notNull(),
  source_id: varchar("source_id", { length: 36 }),
  source_url: longtext("source_url"),
  summary: longtext("summary"),
  preview: longtext("preview"),
  time_layer: varchar("time_layer", { length: 50 }).notNull().default("today"),
  embedding: json("embedding"),
  position: json("position"),
  color: varchar("color", { length: 20 }).notNull().default("#3b82f6"),
  animation_state: varchar("animation_state", { length: 50 }).notNull().default("idle"),
  metadata: json("metadata").notNull(),
  keywords: json("keywords"),
});

/* ------------------------------------------------------------------ */
/*  sessions (chats)                                                    */
/* ------------------------------------------------------------------ */
export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  user_id: varchar("user_id", { length: 36 }).notNull().default("default"),
  folder_id: varchar("folder_id", { length: 36 }).notNull(),
  title: varchar("title", { length: 255 }).notNull().default("新对话"),
  color: varchar("color", { length: 20 }).notNull().default("#3b82f6"),
  animation_state: varchar("animation_state", { length: 50 }).notNull().default("idle"),
  created_at: datetime("created_at", { mode: "string" }).notNull(),
  updated_at: datetime("updated_at", { mode: "string" }).notNull(),
});

/* ------------------------------------------------------------------ */
/*  messages                                                            */
/* ------------------------------------------------------------------ */
export const messages = mysqlTable("messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  user_id: varchar("user_id", { length: 36 }).notNull().default("default"),
  session_id: varchar("session_id", { length: 36 }).notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  content: longtext("content").notNull(),
  citations: json("citations").notNull(),
  animation_state: varchar("animation_state", { length: 50 }).notNull().default("idle"),
  created_at: datetime("created_at", { mode: "string" }).notNull(),
});

/* ------------------------------------------------------------------ */
/*  connections                                                         */
/* ------------------------------------------------------------------ */
export const connections = mysqlTable("connections", {
  id: varchar("id", { length: 36 }).primaryKey(),
  user_id: varchar("user_id", { length: 36 }).notNull().default("default"),
  source_id: varchar("source_id", { length: 36 }).notNull(),
  target_id: varchar("target_id", { length: 36 }).notNull(),
  connection_type: varchar("connection_type", { length: 50 }).notNull(),
  weight: float("weight").notNull().default(0.5),
  label: varchar("label", { length: 255 }),
  color: varchar("color", { length: 20 }).notNull().default("#3b82f6"),
  animation_state: varchar("animation_state", { length: 50 }).notNull().default("idle"),
  spatial_path: json("spatial_path"),
  metadata: json("metadata").notNull(),
  created_at: datetime("created_at", { mode: "string" }).notNull(),
});

/* ------------------------------------------------------------------ */
/*  settings                                                            */
/* ------------------------------------------------------------------ */
export const settings = mysqlTable("settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  key: varchar("key", { length: 255 }).notNull(),
  value: json("value"),
});

/* ------------------------------------------------------------------ */
/*  files                                                               */
/* ------------------------------------------------------------------ */
export const files = mysqlTable("files", {
  id: varchar("id", { length: 36 }).primaryKey(),
  user_id: varchar("user_id", { length: 36 }).notNull().default("default"),
  memory_id: varchar("memory_id", { length: 36 }).notNull(),
  folder_id: varchar("folder_id", { length: 36 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  original_name: varchar("original_name", { length: 500 }).notNull(),
  parse_status: varchar("parse_status", { length: 20 }).notNull().default("pending"),
  created_at: datetime("created_at", { mode: "string" }).notNull(),
});

/* ------------------------------------------------------------------ */
/*  file_contents                                                       */
/* ------------------------------------------------------------------ */
export const fileContents = mysqlTable("file_contents", {
  file_id: varchar("file_id", { length: 36 }).primaryKey(),
  user_id: varchar("user_id", { length: 36 }).notNull().default("default"),
  extracted_text: longtext("extracted_text").notNull(),
  chunks: json("chunks").notNull(),
  extracted_at: datetime("extracted_at", { mode: "string" }).notNull(),
});
