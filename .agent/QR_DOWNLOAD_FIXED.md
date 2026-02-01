# ✅ QR CODE DOWNLOAD FIXED

**Date:** 2026-02-01  
**Status:** ✅ **DEPLOYED (v48)**

---

## 🛠 THE ISSUE
The "Download QR" button was incorrectly trying to call `http://localhost:3001` even on the live website. This caused the download to silently fail or do nothing.

## ✅ THE FIX
I updated the button to use the correct **Production API URL** (`/api` relative path), just like the "Download List" button (which was already working).

## 🚀 TRY IT NOW
1.  **Refresh your page** on the Batch Details screen.
2.  Click **Download QR**.
3.  The PDF should now download instantly.
