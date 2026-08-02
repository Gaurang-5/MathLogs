import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';
import { Search, Loader2, X, Phone, GraduationCap, Hash } from 'lucide-react';
import { cn } from '../utils/cn';
import StudentProfileDrawer from './StudentProfileDrawer';

interface SearchResult {
    id: string;
    humanId: string | null;
    name: string;
    parentName: string;
    parentWhatsapp: string;
    schoolName: string | null;
    status: string;
    batch?: { name: string; className: string | null };
}

export default function StudentSearch() {
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const normalizedQuery = useMemo(() => debouncedQuery.trim(), [debouncedQuery]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), 250);
        return () => clearTimeout(timer);
    }, [query]);

    const { data: results = [], isFetching, isError } = useQuery({
        queryKey: ['studentSearch', normalizedQuery],
        queryFn: () => api.get<SearchResult[]>(`/students/search?q=${encodeURIComponent(normalizedQuery)}`),
        enabled: normalizedQuery.length >= 2,
        staleTime: 45000,
        gcTime: 5 * 60 * 1000,
    });

    useEffect(() => {
        setHighlightedIndex(0);
        setIsOpen(query.trim().length >= 2);
    }, [query, results.length]);

    const openStudent = (studentId: string) => {
        setSelectedStudentId(studentId);
        setIsOpen(false);
        inputRef.current?.blur();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isOpen || query.trim().length < 2) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlightedIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlightedIndex((current) => Math.max(current - 1, 0));
        } else if (event.key === 'Enter' && results[highlightedIndex]) {
            event.preventDefault();
            openStudent(results[highlightedIndex].id);
        } else if (event.key === 'Escape') {
            setIsOpen(false);
            inputRef.current?.blur();
        }
    };

    return (
        <div className="relative z-40 w-full max-w-2xl" ref={containerRef}>
            <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    {isFetching ? (
                        <Loader2 className="h-5 w-5 text-neutral-400 animate-spin" />
                    ) : (
                        <Search className="h-5 w-5 text-neutral-400 group-focus-within:text-blue-500 transition-colors" />
                    )}
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    aria-expanded={isOpen}
                    aria-controls="student-search-results"
                    aria-activedescendant={results[highlightedIndex] ? `student-result-${results[highlightedIndex].id}` : undefined}
                    className="block w-full pl-10 pr-10 py-3.5 border border-black/10 rounded-2xl leading-5 bg-white placeholder-neutral-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white shadow-sm sm:text-sm transition-all"
                    placeholder="Search students by name, ID, phone, school..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        if (query.trim().length >= 2) setIsOpen(true);
                    }}
                />
                {query && (
                    <button
                        onClick={() => {
                            setQuery('');
                            setDebouncedQuery('');
                            setIsOpen(false);
                        }}
                        aria-label="Clear student search"
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center"
                    >
                        <X className="h-5 w-5 text-neutral-400 hover:text-neutral-600" />
                    </button>
                )}
            </div>

            {/* Results dropdown */}
            {isOpen && query.trim().length >= 2 && (
                <div id="student-search-results" className="absolute mt-2 w-full bg-white rounded-2xl shadow-xl border border-black/10 overflow-hidden z-50" role="listbox">
                    <div className="max-h-96 overflow-y-auto">
                        {isError ? (
                            <div className="p-8 text-center text-neutral-500">
                                <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                <p className="text-sm font-semibold">Search is temporarily unavailable</p>
                                <p className="text-xs mt-1 text-neutral-400">Please try again in a moment.</p>
                            </div>
                        ) : results.length > 0 ? (
                            <ul className="divide-y divide-black/5">
                                {results.map((student, index) => (
                                    <li
                                        key={student.id}
                                        id={`student-result-${student.id}`}
                                        role="option"
                                        aria-selected={highlightedIndex === index}
                                        className={cn(
                                            'p-3 cursor-pointer transition-colors',
                                            highlightedIndex === index ? 'bg-blue-50' : 'hover:bg-blue-50/50'
                                        )}
                                        onMouseEnter={() => setHighlightedIndex(index)}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => openStudent(student.id)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-semibold text-black truncate">{student.name}</p>
                                                    {student.humanId && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-neutral-100 text-neutral-600">
                                                            {student.humanId}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-1 flex items-center gap-4 text-xs text-neutral-500">
                                                    <span className="flex items-center gap-1">
                                                        <Phone className="w-3.5 h-3.5" />
                                                        {student.parentWhatsapp}
                                                    </span>
                                                    {student.batch && (
                                                        <span className="flex items-center gap-1">
                                                            <GraduationCap className="w-3.5 h-3.5" />
                                                            {student.batch.name}
                                                        </span>
                                                    )}
                                                    {!student.batch && student.schoolName && (
                                                        <span className="flex items-center gap-1 min-w-0 truncate">
                                                            <Hash className="w-3.5 h-3.5 shrink-0" />
                                                            <span className="truncate">{student.schoolName}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="p-8 text-center text-neutral-500">
                                <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                <p className="text-sm font-medium">No students found matching "{query.trim()}"</p>
                                <p className="text-xs mt-1 text-neutral-400">Try searching by parent name, WhatsApp number, or school.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <StudentProfileDrawer
                studentId={selectedStudentId}
                onClose={() => setSelectedStudentId(null)}
            />
        </div>
    );
}
