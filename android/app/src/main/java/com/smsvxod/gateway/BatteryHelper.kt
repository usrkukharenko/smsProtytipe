package com.smsvxod.gateway

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast

object BatteryHelper {

    /**
     * Returns true if the app is currently ignoring battery optimizations
     * (i.e. it won't be put into Doze for this package). On Android < M
     * there is no opt, so we return true.
     */
    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            ?: return true
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    /**
     * Opens the system settings screen to request battery optimization
     * exemption for this package. Falls back to the generic settings
     * screen if the direct request intent is not handled by the device.
     */
    fun requestIgnore(activity: Activity) {
        try {
            val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${activity.packageName}")
            }
            if (direct.resolveActivity(activity.packageManager) != null) {
                activity.startActivity(direct)
                return
            }
            val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            if (fallback.resolveActivity(activity.packageManager) != null) {
                activity.startActivity(fallback)
            } else {
                Toast.makeText(
                    activity,
                    "Не удалось открыть настройки батареи",
                    Toast.LENGTH_SHORT
                ).show()
            }
        } catch (e: Exception) {
            Toast.makeText(
                activity,
                "Ошибка: ${e.message}",
                Toast.LENGTH_SHORT
            ).show()
        }
    }
}
