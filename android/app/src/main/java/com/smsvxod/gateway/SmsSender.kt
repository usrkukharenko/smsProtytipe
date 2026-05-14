package com.smsvxod.gateway

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.telephony.SmsManager
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.UUID
import kotlin.coroutines.resume

object SmsSender {

    private const val ACTION_SENT = "com.smsvxod.gateway.SMS_SENT"

    @Suppress("DEPRECATION")
    private fun getSmsManager(context: Context, subscriptionId: Int): SmsManager {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val systemSms = context.getSystemService(SmsManager::class.java)
            if (subscriptionId != -1) {
                systemSms.createForSubscriptionId(subscriptionId)
            } else {
                systemSms
            }
        } else {
            if (subscriptionId != -1) {
                SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
            } else {
                SmsManager.getDefault()
            }
        }
    }

    suspend fun send(
        context: Context,
        phone: String,
        text: String,
        subscriptionId: Int = -1
    ): Result<Unit> =
        suspendCancellableCoroutine { cont ->
            val requestId = UUID.randomUUID().toString()
            val intent = Intent(ACTION_SENT).apply {
                setPackage(context.packageName)
                putExtra("req", requestId)
            }
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_ONE_SHOT
            }
            val pi = PendingIntent.getBroadcast(
                context,
                requestId.hashCode(),
                intent,
                flags
            )

            val receiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context, i: Intent) {
                    if (i.getStringExtra("req") != requestId) return
                    try {
                        c.unregisterReceiver(this)
                    } catch (_: Exception) {
                    }
                    when (resultCode) {
                        android.app.Activity.RESULT_OK -> cont.resume(Result.success(Unit))
                        else -> cont.resume(
                            Result.failure(RuntimeException("SMS failed code=$resultCode"))
                        )
                    }
                }
            }

            val filter = IntentFilter(ACTION_SENT)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                context.registerReceiver(receiver, filter)
            }

            try {
                val sms = getSmsManager(context, subscriptionId)
                val parts = sms.divideMessage(text)
                if (parts.size > 1) {
                    val sentList = ArrayList<PendingIntent>(parts.size)
                    repeat(parts.size) { sentList.add(pi) }
                    sms.sendMultipartTextMessage(phone, null, parts, sentList, null)
                } else {
                    sms.sendTextMessage(phone, null, text, pi, null)
                }
            } catch (t: Throwable) {
                try {
                    context.unregisterReceiver(receiver)
                } catch (_: Exception) {
                }
                cont.resume(Result.failure(t))
            }
        }
}
