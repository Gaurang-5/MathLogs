import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DropdownProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    icon?: React.ReactNode;
}

export default function Dropdown({ label, value, onChange, options, placeholder = 'Select...', disabled = false, required = false, icon }: DropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    void required;

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
        <div ref={dropdownRef} className="relative space-y-2 group">
            {label && (
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">
                    {label}
                </label>
            )}

            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full bg-neutral-50/50 border-2 text-app-text p-4 rounded-2xl outline-none transition-all text-left flex items-center justify-between font-semibold ${
                    isOpen
                        ? 'border-accent-primary bg-white shadow-sm'
                        : 'border-transparent hover:border-black/10'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${
                    !value ? 'text-gray-400' : ''
                } ${icon ? 'pl-12' : ''}`}
            >
                {icon && (
                    <span className={`absolute left-4 top-[calc(50%+12px)] -translate-y-1/2 transition-colors ${
                        isOpen ? 'text-accent-primary' : 'text-gray-400'
                    }`}>
                        {icon}
                    </span>
                )}
                <span className="truncate">{selectedOption?.label || placeholder}</span>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0 ml-2 ${isOpen ? 'rotate-180 text-accent-primary' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
                        className="absolute top-full left-0 right-0 mt-2 bg-white border-[1.5px] border-black/5 rounded-2xl shadow-2xl shadow-black/10 z-50 max-h-60 overflow-auto py-1.5"
                    >
                        {options.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                    onChange(option.value);
                                    setIsOpen(false);
                                }}
                                className={`w-full px-4 py-3 text-left transition-colors flex items-center justify-between rounded-xl mx-1.5 first:mt-0 last:mb-0 ${
                                    value === option.value
                                        ? 'bg-black text-white font-bold'
                                        : 'text-app-text hover:bg-neutral-50 font-medium'
                                }`}
                                style={{ width: 'calc(100% - 12px)' }}
                            >
                                <span className="text-sm truncate mr-2">{option.label}</span>
                                {value === option.value && <Check className="w-4 h-4 shrink-0" />}
                            </button>
                        ))}
                        {options.length === 0 && (
                            <div className="px-4 py-4 text-app-text-tertiary text-center text-sm font-medium">
                                No options available
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
