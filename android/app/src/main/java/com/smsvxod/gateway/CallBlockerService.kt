package com.smsvxod.gateway

import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import androidx.annotation.RequiresApi

/**
 * Screens incoming phone calls while the SMS gateway is active. When the
 * user has explicitly enabled the "block calls" toggle and the system has
 * granted us the CallScreening role, every incoming call is silently
 * rejected so the device stays available for SMS traffic.
 */
@RequiresApi(Build.VERSION_CODES.N)
class CallBlockerService : CallScreeningService() {

    override fun onScreenCall(callDetails: Call.Details) {
        val isIncoming = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            callDetails.callDirection == Call.Details.DIRECTION_INCOMING
        } else {
            true
        }

        val shouldBlock = isIncoming &&
            GatewayService.isRunning &&
            Prefs.getBlockCallsWhenActive(this)

        val builder = CallResponse.Builder()
        if (shouldBlock) {
            builder
                .setDisallowCall(true)
                .setRejectCall(true)
                .setSilenceCall(true)
                .setSkipCallLog(false)       // keep missed-call record in system
                .setSkipNotification(true)   // suppress missed-call notification
            FileLogger.log(applicationContext, "call", "Blocked incoming call (gateway active)")
        }
        respondToCall(callDetails, builder.build())
    }
}
