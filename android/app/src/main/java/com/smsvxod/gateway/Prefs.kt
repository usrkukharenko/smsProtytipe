package com.smsvxod.gateway

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

object Prefs {
    private const val NAME = "smsvxod_gateway_prefs"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_TOKEN = "gateway_token"
    private const val KEY_INTERVAL = "poll_interval_sec"
    private const val KEY_AUTOSTART = "autostart"
    private const val KEY_SUBSCRIPTION_ID = "subscription_id"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_SEEN_BATTERY_PROMPT = "seen_battery_prompt"

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun getServerUrl(ctx: Context): String =
        prefs(ctx).getString(KEY_SERVER_URL, "").orEmpty()

    fun setServerUrl(ctx: Context, value: String) {
        prefs(ctx).edit().putString(KEY_SERVER_URL, value.trim().trimEnd('/')).apply()
    }

    fun getToken(ctx: Context): String =
        prefs(ctx).getString(KEY_TOKEN, "").orEmpty()

    fun setToken(ctx: Context, value: String) {
        prefs(ctx).edit().putString(KEY_TOKEN, value.trim()).apply()
    }

    fun getIntervalSec(ctx: Context): Int =
        prefs(ctx).getInt(KEY_INTERVAL, 3)

    fun setIntervalSec(ctx: Context, value: Int) {
        prefs(ctx).edit().putInt(KEY_INTERVAL, value.coerceIn(1, 60)).apply()
    }

    fun getAutostart(ctx: Context): Boolean =
        prefs(ctx).getBoolean(KEY_AUTOSTART, false)

    fun setAutostart(ctx: Context, value: Boolean) {
        prefs(ctx).edit().putBoolean(KEY_AUTOSTART, value).apply()
    }

    fun getSubscriptionId(ctx: Context): Int =
        prefs(ctx).getInt(KEY_SUBSCRIPTION_ID, -1)

    fun setSubscriptionId(ctx: Context, value: Int) {
        prefs(ctx).edit().putInt(KEY_SUBSCRIPTION_ID, value).apply()
    }

    fun getDeviceId(ctx: Context): String {
        val existing = prefs(ctx).getString(KEY_DEVICE_ID, null)
        if (!existing.isNullOrBlank()) return existing
        val generated = UUID.randomUUID().toString()
        prefs(ctx).edit().putString(KEY_DEVICE_ID, generated).apply()
        return generated
    }

    fun getSeenBatteryPrompt(ctx: Context): Boolean =
        prefs(ctx).getBoolean(KEY_SEEN_BATTERY_PROMPT, false)

    fun setSeenBatteryPrompt(ctx: Context, value: Boolean) {
        prefs(ctx).edit().putBoolean(KEY_SEEN_BATTERY_PROMPT, value).apply()
    }
}
