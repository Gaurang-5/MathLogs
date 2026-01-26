/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                app: {
                    bg: 'var(--bg-app)',
                    surface: 'var(--bg-surface)',
                    'surface-opaque': 'var(--bg-surface-opaque)',
                    text: 'var(--text-main)',
                    'text-secondary': 'var(--text-secondary)',
                    'text-tertiary': 'var(--text-tertiary)',
                    border: 'var(--border-subtle)',
                },
                primary: {
                    DEFAULT: 'var(--neutral-900)',
                    foreground: '#ffffff',
                },
                accent: {
                    DEFAULT: 'var(--accent-primary)',
                    hover: 'var(--accent-hover)',
                    subtle: 'var(--accent-subtle)',
                },
                neutral: {
                    50: 'var(--neutral-50)',
                    100: 'var(--neutral-100)',
                    200: 'var(--neutral-200)',
                    300: 'var(--neutral-300)',
                    400: 'var(--neutral-400)',
                    500: 'var(--neutral-500)',
                    600: 'var(--neutral-600)',
                    700: 'var(--neutral-700)',
                    800: 'var(--neutral-800)',
                    900: 'var(--neutral-900)',
                    950: 'var(--neutral-950)',
                },
                success: 'var(--success)',
                warning: 'var(--warning)',
                danger: 'var(--danger)',
            },
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
            },
            boxShadow: {
                'sm': 'var(--shadow-sm)',
                'md': 'var(--shadow-md)',
                'lg': 'var(--shadow-lg)',
                'xl': 'var(--shadow-xl)',
            }
        },
    },
    plugins: [],
}
