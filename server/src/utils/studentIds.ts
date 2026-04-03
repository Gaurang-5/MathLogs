export function getCourseCode(subject: string | null): string {
    if (!subject) return 'GEN';

    const map: Record<string, string> = {
        'Mathematics': 'MTH', 'Maths': 'MTH', 'Math': 'MTH',
        'Physics': 'PHY',
        'Chemistry': 'CHE',
        'Biology': 'BIO',
        'English': 'ENG',
        'Science': 'SCI',
        'History': 'HIS',
        'Geography': 'GEO',
        'Accounts': 'ACC', 'Accountancy': 'ACC',
        'Economics': 'ECO',
        'Business Studies': 'BUS',
        'Computer Science': 'CSC',
        'Abacus': 'ABA', 'Vedic Maths': 'VED',
        'C Programming': 'CPR', 'C++': 'CPP', 'Java': 'JAV', 'Python': 'PYT',
        'Tally': 'TAL',
        'Social Science': 'SST'
    };

    if (map[subject]) return map[subject];

    const cleanSubject = subject.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return cleanSubject.substring(0, 3) || 'GEN';
}

export function getInstituteCode(instituteName: string): string {
    if (!instituteName) return 'XX';

    const words = instituteName.trim().split(/\s+/).filter(Boolean);

    if (words.length === 0) return 'XX';
    if (words.length === 1) {
        return words[0].substring(0, 2).toUpperCase();
    }

    const firstLetter = words[0][0] || 'X';
    const secondLetter = words[1][0] || 'X';

    return (firstLetter + secondLetter).toUpperCase();
}
