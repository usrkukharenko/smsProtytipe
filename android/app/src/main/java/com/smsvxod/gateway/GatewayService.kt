package com.smsvxod.gateway

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class GatewayService : LifecycleService() {

    companion object {
        const val ACTION_START = "com.smsvxod.gateway.START"
        const val ACTION_STOP = "com.smsvxod.gateway.STOP"
        const val ACTION_LOG = "com.smsvxod.gateway.LOG"
        const val EXTRA_LOG_LINE = "line"
        const val NOTIF_CHANNEL_ID = "gateway_channel"
        const val NOTIF_ID = 1001
        private const val HEARTBEAT_INTERVAL_MS = 30_000L

        @Volatile var isRunning: Boolean = false
            private set
    }

    override fun onBind(intent: Intent): IBinder? {
        super.onBind(intent)
        return null
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        when (intent?.action) {
            ACTION_STOP -> {
                stopWork()
                return START_NOT_STICKY
            }
            else -> startWork()
        }
        return START_STICKY
    }

    private fun startWork() {
        if (isRunning) return
        startForegroundCompat()
        isRunning = true
        log("Сервис запущен")
        lifecycleScope.launch(Dispatchers.IO) {
            pollLoop()
        }
        lifecycleScope.launch(Dispatchers.IO) {
            heartbeatLoop()
        }
    }

    private fun stopWork() {
        isRunning = false
        log("Сервис остановлен")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private suspend fun pollLoop() {
        while (isRunning && lifecycleScope.isActive) {
            val baseUrl = Prefs.getServerUrl(this)
            val token = Prefs.getToken(this)
            val intervalSec = Prefs.getIntervalSec(this).coerceAtLeast(1)
            val subId = Prefs.getSubscriptionId(this)

            if (baseUrl.isBlank() || token.isBlank()) {
                log("Не заданы URL или токен")
                delay(5_000)
                continue
            }

            try {
                val api = GatewayApi(baseUrl, token)
                val tasks = withContext(Dispatchers.IO) { api.pending(10) }
                if (tasks.isNotEmpty()) {
                    log("Получено задач: ${tasks.size}")
                    val results = mutableListOf<GatewayApi.SendResult>()
                    for (t in tasks) {
                        val r = SmsSender.send(applicationContext, t.phone, t.text, subId)
                        if (r.isSuccess) {
                            log("СМС → ${t.phone}: ok")
                            results.add(GatewayApi.SendResult(t.id, true))
                        } else {
                            val msg = r.exceptionOrNull()?.message ?: "error"
                            log("СМС → ${t.phone}: $msg")
                            results.add(GatewayApi.SendResult(t.id, false, msg))
                        }
                    }
                    try {
                        withContext(Dispatchers.IO) { api.reportSent(results) }
                    } catch (e: Exception) {
                        log("Отчёт не отправлен: ${e.message}")
                    }
                }
            } catch (e: Exception) {
                log("Опрос: ${e.message}")
            }

            delay(intervalSec * 1000L)
        }
    }

    private suspend fun heartbeatLoop() {
        while (isRunning && lifecycleScope.isActive) {
            val baseUrl = Prefs.getServerUrl(this)
            val token = Prefs.getToken(this)
            if (baseUrl.isNotBlank() && token.isNotBlank()) {
                try {
                    val api = GatewayApi(baseUrl, token)
                    val deviceId = Prefs.getDeviceId(this)
                    val r = withContext(Dispatchers.IO) {
                        Heartbeat.sendHeartbeat(api, applicationContext, deviceId)
                    }
                    if (r.isSuccess) {
                        log("Heartbeat: ok")
                    } else {
                        log("Heartbeat: ${r.exceptionOrNull()?.message ?: "error"}")
                    }
                } catch (e: Exception) {
                    log("Heartbeat: ${e.message}")
                }
            }
            delay(HEARTBEAT_INTERVAL_MS)
        }
    }

    private fun log(line: String) {
        FileLogger.log(applicationContext, "svc", line)
        val intent = Intent(ACTION_LOG).apply {
            setPackage(packageName)
            putExtra(EXTRA_LOG_LINE, line)
        }
        sendBroadcast(intent)
    }

    private fun startForegroundCompat() {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(NOTIF_CHANNEL_ID) == null) {
            val channel = NotificationChannel(
                NOTIF_CHANNEL_ID,
                "SMS Gateway",
                NotificationManager.IMPORTANCE_LOW
            )
            nm.createNotificationChannel(channel)
        }

        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notif: Notification = NotificationCompat.Builder(this, NOTIF_CHANNEL_ID)
            .setContentTitle("SmsVxod Gateway")
            .setContentText("Ожидание задач на отправку СМС…")
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setOngoing(true)
            .setContentIntent(openIntent)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }
}
