# MathLogs

MathLogs is a modern tuition center management platform for web and mobile.

## 🚀 Getting Started for Developers

Welcome to the team! To run the project locally:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Gaurang-5/MathLogs.git
   cd new_project
   ```

2. **Environment Variables:**
   Copy the example environment files for both client, server, and mobile. **DO NOT request production keys for local development**. Use your local Postgres database or a staging URL.
   ```bash
   # In the server/ directory
   cp .env.example .env
   ```

3. **Install Dependencies:**
   ```bash
   npm run setup
   # Or manually:
   # cd server && npm install
   # cd client && npm install
   # cd mobile && npm install
   ```

4. **Run the Application locally:**
   ```bash
   # Start the entire development environment (Web, API Server)
   ./dev.sh
   ```

## 👥 How to Contribute
We have a strict workflow to protect the live production environment. If you are developing features (especially for the mobile app), **you MUST read our [CONTRIBUTING.md](./CONTRIBUTING.md) guide before pushing any code.**

## 📚 General Documentation
All detailed documentation has been moved to the [`docs/`](./docs) directory.

### Key Documents:
- [Quick Start Guide](./docs/QUICK_START.md)
- [Deployment Guide](./docs/COMPLETE_READINESS_CERTIFICATION.md)
- [Backup Recovery](./docs/BACKUP_RECOVERY_GUIDE.md)
