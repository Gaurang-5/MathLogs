
import { Toaster } from 'react-hot-toast';

export default function ToastProvider() {
    return (
        <Toaster
            position="top-right"
            containerStyle={{
                top: 'max(1rem, env(safe-area-inset-top))',
            }}
            toastOptions={{
                className: '',
                style: {
                    background: '#1e293b',
                    color: '#fff',
                    border: '1px solid #334155',
                    marginTop: '0.5rem',
                },
                success: {
                    iconTheme: {
                        primary: '#10b981',
                        secondary: '#fff',
                    },
                },
                error: {
                    iconTheme: {
                        primary: '#ef4444',
                        secondary: '#fff',
                    },
                },
            }}
        />
    );
}
