# 🤖 WhatsApp Automation Setup Guide

To create an "Automated Menu" (where users see options like "1. Pricing", "2. Features"), you need to use the **WhatsApp Business App** or an API service.

Since you are using a personal number (`8439245302`), the easiest way is to switch to **WhatsApp Business App** (Free).

## ✅ Step 1: Switch to WhatsApp Business
1.  Download **WhatsApp Business** from Play Store / App Store.
2.  Register with your number (`8439245302`).
3.  It will migrate your chats from personal WhatsApp (make a backup first!).

## 🤖 Step 2: Set Up Auto-Reply (The "Menu")
You can create a "Greeting Message" that acts as a menu.

1.  Open **Settings** > **Business Tools** > **Greeting Message**.
2.  Enable **Send greeting message**.
3.  Edit the message to look like a menu:

    ```text
    Hi! Welcome to MathLogs via Gaurang. 
    How can we help you today?

    Reply with a number:
    1️⃣ Pricing Info
    2️⃣ Features Demo
    3️⃣ Talk to Support
    ```
4.  Save.

## ⚡ Step 3: Set Up Quick Replies (The "Automation")
Now, set up the answers for "1", "2", and "3".

1.  Go to **Settings** > **Business Tools** > **Quick Replies**.
2.  Add a new reply:
    -   **Shortcut:** `/1`
    -   **Message:** "Our pricing is simple: ₹999/month for unlimited students. Join the waitlist here: https://mathlogs.app"
3.  Add another:
    -   **Shortcut:** `/2`
    -   **Message:** "MathLogs helps you track fees, attendence, and marks. Watch our demo here: [YouTube Link]"

**How it works:**
-   User sends "Hi" (via your website button).
-   Auto-Reply sends the "Menu".
-   User replies "1".
-   You (or an automation tool) reply with the saved shortcut `/1`.

> **Note:** For *fully* automated replies (where the bot replies to "1" without you touching it), you need a third-party tool like **Wati**, **Interakt**, or **WABox**. The WhatsApp Business App requires you to tap the Quick Reply manually.
