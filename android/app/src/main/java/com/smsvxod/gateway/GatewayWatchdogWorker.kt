package com.smsvxod.gateway

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class GatewayWatchdogWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        try {
            val ctx = applicationContext
            if (Prefs.getAutostart(ctx) && !GatewayService.isRunning) {
                val svc = Intent(ctx, GatewayService::class.java).apply {
                    action = GatewayService.ACTION_START
                }
                ContextCompat.startForegroundService(ctx, svc)
                FileLogger.log(ctx, "watchdog", "Service was down, restarted")
            }
        } catch (e: Exception) {
            FileLogger.log(applicationContext, "watchdog", "Error: ${e.message}")
        }
        return Result.success()
    }
}
