import { useState, useRef, useEffect } from 'react';
import { ChevronRight, Check } from 'lucide-react';

interface DropdownProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
}

export default function Dropdown({ label, value, onChange, options, placeholder = 'Select...', disabled = false, required = false }: DropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(opt => opt.value === value);

    return (
        <div ref={dropdownRef} className="relative">
            <label className="block text-xs font-semibold text-app-text-secondary uppercase tracking-wider mb-2">
                {label}
            </label>

            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full bg-neutral-50 dark:bg-neutral-900 border border-app-border text-app-text p-3.5 rounded-xl focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-all text-left flex items-center justify-between ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-accent'
                    } ${!value ? 'text-app-text-secondary/50' : ''}`}
            >
                <span>{selectedOption?.label || placeholder}</span>
                <ChevronRight className={`w-4 h-4 text-app-text-secondary transition-transform ${isOpen ? '-rotate-90' : 'rotate-90'}`} />
            </button>

            {/* Dropdown Menu - Always opens downward */}
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-neutral-900 border border-app-border rounded-xl shadow-xl z-50 max-h-60 overflow-auto">
                    {options.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                            className={`w-full px-4 py-3 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center justify-between ${value === option.value ? 'bg-accent/10 text-accent font-medium' : 'text-app-text'
                                }`}
                        >
                            <span>{option.label}</span>
                            {value === option.value && <Check className="w-4 h-4" />}
                        </button>
                    ))}
                    {options.length === 0 && (
                        <div className="px-4 py-3 text-app-text-secondary text-center">
                            No options available
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
