import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
  isBanned: boolean("is_banned").default(false).notNull(),
});

export const authLog = pgTable("auth_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  phone: text("phone"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  event: text("event").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bannedIps = pgTable("banned_ips", {
  ip: text("ip").primaryKey(),
  reason: text("reason"),
  bannedUntil: timestamp("banned_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gatewayDevices = pgTable("gateway_devices", {
  deviceId: text("device_id").primaryKey(),
  lastSeenAt: timestamp("last_seen_at"),
  batteryLevel: integer("battery_level"),
  signalStrength: integer("signal_strength"),
  simInfo: text("sim_info"),
});

export const smsLog = pgTable("sms_log", {
  id: serial("id").primaryKey(),
  taskId: text("task_id"),
  phone: text("phone"),
  success: boolean("success").notNull(),
  error: text("error"),
  deviceId: text("device_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuthLog = typeof authLog.$inferSelect;
export type BannedIp = typeof bannedIps.$inferSelect;
export type GatewayDevice = typeof gatewayDevices.$inferSelect;
export type SmsLogEntry = typeof smsLog.$inferSelect;
