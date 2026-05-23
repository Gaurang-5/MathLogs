# MathLogs Mobile App Launch Plan

## Goal
Build a cross-platform mobile app (iOS + Android + Tablets) using React Native (Expo) with a custom brand-first UI and offline-first data architecture.

## ✅ Phase 1: Foundation Setup — COMPLETE
- [x] Initialize Expo project in `mobile/` folder
- [x] Install core libraries (Reanimated, SecureStore, Haptics, Camera, TanStack Query, AsyncStorage, Network, BlurView, LinearGradient)
- [x] Configure `app.json` with MathLogs branding, permissions, and bundle IDs
- [x] TypeScript compiles with zero errors

## ✅ Phase 2: Core Architecture — COMPLETE
- [x] Design system (`constants/theme.ts`) — Dark/Light themes, spacing, shadows, typography, animation tokens
- [x] API client (`services/api.ts`) — Axios with SecureStore JWT, auto-redirect on 401
- [x] Auth context (`contexts/AuthContext.tsx`) — Login/logout with keychain token storage
- [x] Offline sync engine (`services/offlineSync.ts`) — Cache-first reads, mutation queue, background sync
- [x] Reusable UI components (`components/ui/`) — BrandButton, GlassCard, StatCard, SkeletonLoader, OfflineBanner

## ✅ Phase 3: Navigation & Screens — COMPLETE
- [x] Root layout with AuthProvider + React Query + Stack navigator
- [x] Bottom tab bar with 5 tabs (Dashboard, Batches, Scan, Fees, Settings) + haptic feedback
- [x] Dashboard screen with stats, quick actions, recent tests, pull-to-refresh
- [x] Batches screen with FlatList, search, offline cache
- [x] Scan screen with step-by-step instructions (camera integration next)
- [x] Fees screen with paid/pending/overdue status pills
- [x] Settings screen with profile, cache clear, sign out

## 🔲 Phase 4: Feature Parity (Next)
- [ ] Login screen (email/password → JWT)
- [ ] Camera integration for sticker scanner (expo-camera + OCR API)
- [ ] Batch details screen (student list, test history)
- [ ] Test details screen (scores, analytics)
- [ ] Fee collection flow (Razorpay / manual)
- [ ] Push notifications (expo-notifications)
- [ ] Deep linking (mathlogs://batch/123)

## 🔲 Phase 5: Polish & Performance
- [ ] Custom splash screen animation
- [ ] App icons and branding assets
- [ ] Performance profiling (60fps on low-end Android)
- [ ] Accessibility audit (labels, contrast, screen reader)
- [ ] EAS Build for iOS TestFlight + Android APK
- [ ] App Store / Play Store submission

## Done When
- [ ] App launches on both iOS and Android
- [ ] All 5 tabs work with data from the server
- [ ] Offline mode shows cached data
- [ ] App is submitted to stores
