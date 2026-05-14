package com.smsvxod.gateway

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat

data class SimSlot(
    val subId: Int,
    val carrierName: String,
    val displayName: String,
    val slotIndex: Int
)

fun getActiveSims(context: Context): List<SimSlot> {
    if (ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_PHONE_STATE
        ) != PackageManager.PERMISSION_GRANTED
    ) {
        return emptyList()
    }
    return try {
        val sm = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE)
            as? SubscriptionManager ?: return emptyList()
        @Suppress("MissingPermission")
        val infos = sm.activeSubscriptionInfoList ?: return emptyList()
        infos.map { info ->
            SimSlot(
                subId = info.subscriptionId,
                carrierName = info.carrierName?.toString().orEmpty(),
                displayName = info.displayName?.toString().orEmpty(),
                slotIndex = info.simSlotIndex
            )
        }
    } catch (_: SecurityException) {
        emptyList()
    } catch (_: Exception) {
        emptyList()
    }
}
