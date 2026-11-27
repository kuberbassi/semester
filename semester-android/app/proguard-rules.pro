# Keep JNA & UniFFI native Rust bridge classes
-keep class com.sun.jna.** { *; }
-keep class * implements com.sun.jna.** { *; }
-keep class uniffi.semester_core.** { *; }
-dontwarn java.awt.**
-dontwarn java.lang.ref.Cleaner
