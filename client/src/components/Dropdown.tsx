import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface DropdownOption {
    value: string;
    label: string;
    searchText?: string;
}

interface DropdownProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: DropdownOption[];
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    icon?: React.ReactNode;
    searchable?: boolean;
}

export default function Dropdown({ label, value, onChange, options, placeholder = 'Select...', disabled = false, required = false, icon, searchable = false }: DropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    void required;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchQuery('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && searchable && inputRef.current) {
            // small delay to ensure animation has started
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
        }
    }, [isOpen, searchable]);

    const selectedOption = options.find(opt => opt.value === value);

    const filteredOptions = useMemo(() => {
        if (!searchable || !searchQuery.trim()) return options;
        const query = searchQuery.toLowerCase();
        return options.filter(opt => {
            const labelMatch = opt.label.toLowerCase().includes(query);
            const searchMatch = opt.searchText?.toLowerCase().includes(query);
            return labelMatch || searchMatch;
        });
    }, [options, searchable, searchQuery]);

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
                        className="absolute top-full left-0 right-0 mt-2 bg-white border-[1.5px] border-black/5 rounded-2xl shadow-2xl shadow-black/10 z-50 overflow-hidden flex flex-col"
                    >
                        {searchable && (
                            <div className="p-2 border-b border-black/5 bg-gray-50/50">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        placeholder="Search..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full bg-white border border-gray-200 rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary transition-all text-gray-800 placeholder:text-gray-400 font-medium"
                                    />
                                </div>
                            </div>
                        )}
                        <div className="max-h-60 overflow-y-auto py-1.5 scrollbar-thin scrollbar-thumb-gray-200">
                            {filteredOptions.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(option.value);
                                        setIsOpen(false);
                                        setSearchQuery('');
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
                            {filteredOptions.length === 0 && (
                                <div className="px-4 py-4 text-app-text-tertiary text-center text-sm font-medium">
                                    No options found
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
