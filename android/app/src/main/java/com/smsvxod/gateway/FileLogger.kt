package com.smsvxod.gateway

import android.content.Context
import java.io.File
import java.io.FileWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object FileLogger {

    private const val LOG_FILENAME = "gateway.log"
    private const val MAX_SIZE_BYTES = 256L * 1024L
    private const val MAX_FILES = 3

    private val lock = Any()
    private val timeFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)

    fun logFile(ctx: Context): File = File(ctx.filesDir, LOG_FILENAME)

    fun log(ctx: Context, tag: String, message: String) {
        synchronized(lock) {
            try {
                val file = logFile(ctx)
                if (file.exists() && file.length() > MAX_SIZE_BYTES) {
                    rotate(ctx)
                }
                FileWriter(file, true).use { w ->
                    val ts = timeFormat.format(Date())
                    w.append(ts).append(" [").append(tag).append("] ")
                        .append(message).append('\n')
                }
            } catch (_: Exception) {
                // Best-effort: swallow IO errors so logging never crashes the app.
            }
        }
    }

    private fun rotate(ctx: Context) {
        try {
            val base = logFile(ctx)
            // delete the oldest, then shift others by +1
            val oldest = File(ctx.filesDir, "$LOG_FILENAME.${MAX_FILES - 1}")
            if (oldest.exists()) oldest.delete()
            for (i in (MAX_FILES - 2) downTo 1) {
                val src = File(ctx.filesDir, "$LOG_FILENAME.$i")
                if (src.exists()) {
                    val dst = File(ctx.filesDir, "$LOG_FILENAME.${i + 1}")
                    src.renameTo(dst)
                }
            }
            if (base.exists()) {
                val dst = File(ctx.filesDir, "$LOG_FILENAME.1")
                base.renameTo(dst)
            }
        } catch (_: Exception) {
        }
    }
}
