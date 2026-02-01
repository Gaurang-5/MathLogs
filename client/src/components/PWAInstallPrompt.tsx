import { useState, useEffect } from 'react';
import { X, Download, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
    const [showPrompt, setShowPrompt] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        // Check if already installed (standalone mode)
        const standalone = window.matchMedia('(display-mode: standalone)').matches;
        setIsStandalone(standalone);

        // Check if iOS
        const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        setIsIOS(iOS);

        // Check if user has dismissed before
        const dismissed = localStorage.getItem('pwa-install-dismissed');

        // Show prompt if:
        // - Not in standalone mode (not installed)
        // - Not previously dismissed
        // - iOS (always show manual instructions) OR has install capability
        if (!standalone && !dismissed) {
            // Listen for beforeinstallprompt event (Chrome/Edge)
            const handler = (e: Event) => {
                e.preventDefault();
                setDeferredPrompt(e as BeforeInstallPromptEvent);
                setShowPrompt(true);
            };

            window.addEventListener('beforeinstallprompt', handler);

            // For iOS, show prompt after 2 seconds (no beforeinstallprompt)
            if (iOS) {
                setTimeout(() => setShowPrompt(true), 2000);
            }

            return () => {
                window.removeEventListener('beforeinstallprompt', handler);
            };
        }
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        // Show native install prompt
        deferredPrompt.prompt();

        // Wait for user choice
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            console.log('PWA installed');
        }

        // Clear prompt
        setDeferredPrompt(null);
        setShowPrompt(false);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem('pwa-install-dismissed', 'true');
    };

    if (!showPrompt || isStandalone) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-gray-900 to-black text-white p-4 shadow-2xl border-t border-gray-700 animate-slide-up">
            <div className="max-w-4xl mx-auto flex items-start gap-4">
                {/* Icon */}
                <div className="flex-shrink-0 w-12 h-12 bg-white rounded-xl flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-gray-900" />
                </div>

                {/* Content */}
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Download className="w-5 h-5" />
                        <h3 className="font-bold text-lg">Install MathLogs App</h3>
                    </div>

                    {isIOS ? (
                        <p className="text-sm text-gray-300 mb-2">
                            Tap <span className="inline-flex items-center px-1.5 py-0.5 bg-blue-500 rounded text-xs mx-1">
                                Share (📤)
                            </span> then <span className="font-semibold">"Add to Home Screen"</span> for instant access
                        </p>
                    ) : deferredPrompt ? (
                        <p className="text-sm text-gray-300 mb-2">
                            Get instant access with one tap – like WhatsApp!
                        </p>
                    ) : (
                        <p className="text-sm text-gray-300 mb-2">
                            Tap <span className="inline-flex items-center px-1.5 py-0.5 bg-gray-700 rounded text-xs mx-1">⋮</span> menu → <span className="font-semibold">"Add to Home screen"</span>
                        </p>
                    )}

                    <div className="flex gap-2">
                        {deferredPrompt && !isIOS && (
                            <button
                                onClick={handleInstall}
                                className="px-4 py-2 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition-colors text-sm"
                            >
                                Install Now
                            </button>
                        )}
                        <button
                            onClick={handleDismiss}
                            className="px-4 py-2 bg-gray-700 text-white font-medium rounded-lg hover:bg-gray-600 transition-colors text-sm"
                        >
                            Maybe Later
                        </button>
                    </div>
                </div>

                {/* Close Button */}
                <button
                    onClick={handleDismiss}
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center hover:bg-gray-700 rounded-lg transition-colors"
                    aria-label="Close"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
