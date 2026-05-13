package com.smsvxod.gateway

import android.content.Context
import android.content.SharedPreferences

object Prefs {
    private const val NAME = "smsvxod_gateway_prefs"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_TOKEN = "gateway_token"
    private const val KEY_INTERVAL = "poll_interval_sec"
    private const val KEY_AUTOSTART = "autostart"

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
}
