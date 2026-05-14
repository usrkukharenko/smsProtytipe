package com.smsvxod.gateway

import android.app.Activity
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher

/**
 * Wraps the API 29+ "call screening" RoleManager flow. The role is what
 * actually authorises [CallBlockerService] to intercept calls; without it
 * the system ignores our CallScreeningService entirely.
 */
object CallScreeningRoleHelper {

    /**
     * Returns true if this app currently holds the CALL_SCREENING role.
     * On older Android versions the role concept does not exist, so we
     * report false and let the UI surface the "not assigned" hint.
     */
    fun isCallScreeningRoleHeld(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        val rm = context.getSystemService(Context.ROLE_SERVICE) as? RoleManager
            ?: return false
        return try {
            rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Launches the system role-request dialog. The caller passes in an
     * [ActivityResultLauncher] so it can refresh its UI once the user
     * accepts or declines.
     */
    fun requestCallScreeningRole(
        activity: Activity,
        launcher: ActivityResultLauncher<Intent>
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            Toast.makeText(
                activity,
                "Требуется Android 10 или новее",
                Toast.LENGTH_LONG
            ).show()
            return
        }
        val rm = activity.getSystemService(Context.ROLE_SERVICE) as? RoleManager
        if (rm == null) {
            Toast.makeText(
                activity,
                "RoleManager недоступен",
                Toast.LENGTH_SHORT
            ).show()
            return
        }
        try {
            if (!rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) {
                Toast.makeText(
                    activity,
                    "Роль блокировщика вызовов недоступна на этом устройстве",
                    Toast.LENGTH_LONG
                ).show()
                return
            }
            if (rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) {
                // Already held — nothing to do.
                return
            }
            val intent = rm.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
            launcher.launch(intent)
        } catch (e: Exception) {
            Toast.makeText(
                activity,
                "Не удалось запросить роль: ${e.message}",
                Toast.LENGTH_LONG
            ).show()
        }
    }
}
