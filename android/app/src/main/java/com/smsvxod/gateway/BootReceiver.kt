package com.smsvxod.gateway

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (!Prefs.getAutostart(context)) return
        val svc = Intent(context, GatewayService::class.java).apply {
            action = GatewayService.ACTION_START
        }
        ContextCompat.startForegroundService(context, svc)
    }
}
