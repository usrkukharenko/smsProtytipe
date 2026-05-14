package com.smsvxod.gateway

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.os.Build
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat

object Heartbeat {

    private fun readBatteryLevel(ctx: Context): Int? {
        return try {
            val bm = ctx.getSystemService(BatteryManager::class.java) ?: return null
            val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            if (level < 0) null else level
        } catch (_: Exception) {
            null
        }
    }

    private fun readSignalLevel(ctx: Context): Int? {
        if (ContextCompat.checkSelfPermission(
                ctx,
                Manifest.permission.READ_PHONE_STATE
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return null
        }
        return try {
            val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
                ?: return null
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                @Suppress("MissingPermission")
                tm.signalStrength?.level
            } else {
                null
            }
        } catch (_: SecurityException) {
            null
        } catch (_: Exception) {
            null
        }
    }

    private fun readSimInfo(ctx: Context): String? {
        val sims = getActiveSims(ctx)
        if (sims.isEmpty()) return null
        return sims.joinToString(separator = "; ") { slot ->
            val name = slot.carrierName.ifBlank { slot.displayName }
            "slot=${slot.slotIndex} subId=${slot.subId} carrier=$name"
        }
    }

    fun sendHeartbeat(api: GatewayApi, ctx: Context, deviceId: String): Result<Unit> {
        return try {
            val battery = readBatteryLevel(ctx)
            val signal = readSignalLevel(ctx)
            val simInfo = readSimInfo(ctx)
            api.heartbeat(deviceId, battery, signal, simInfo)
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
