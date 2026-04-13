import sys

files = [
    'client/src/pages/Fees.tsx',
    'client/src/pages/TestList.tsx',
    'client/src/pages/TestDetails.tsx'
]

for filepath in files:
    with open(filepath, 'r') as f:
        text = f.read()

    # Cards and Layout Containers
    text = text.replace('bg-white p-6 rounded-[24px]', 'bg-white p-6 md:p-8 border-[1.5px] border-black/5 rounded-[32px]')
    text = text.replace('bg-white p-4 rounded-[24px]', 'bg-white p-5 md:p-6 border-[1.5px] border-black/5 rounded-[32px]')
    text = text.replace('bg-app-surface-opaque border border-app-border rounded-3xl', 'bg-white p-6 md:p-8 border-[1.5px] border-black/5 rounded-[32px]')
    text = text.replace('bg-app-surface-opaque border border-app-border rounded-[24px]', 'bg-white border-[1.5px] border-black/5 rounded-[32px]')
    text = text.replace('bg-app-surface border border-app-border rounded-3xl', 'bg-white border-[1.5px] border-black/5 rounded-[32px]')
    text = text.replace('border border-app-border rounded-[24px]', 'border-[1.5px] border-black/5 rounded-[32px]')
    
    # Typography
    text = text.replace('text-gray-400 uppercase tracking-wider', 'text-gray-500 uppercase tracking-widest')
    
    # Toggle and Toolbar Groups
    text = text.replace('bg-gray-100 p-1 rounded-2xl', 'bg-neutral-100/80 border border-black/5 p-1.5 rounded-[20px]')
    text = text.replace('bg-app-surface p-1 rounded-xl border border-app-border', 'bg-neutral-100/80 border border-black/5 p-1.5 rounded-[20px]')
    
    # Quick Inputs & Buttons
    text = text.replace('bg-gray-50 border-transparent focus:bg-white border focus:border-blue-500 rounded-xl', 'bg-white border-2 border-transparent focus:border-black/10 rounded-2xl shadow-sm')
    text = text.replace('bg-gray-50 border border-transparent hover:bg-white hover:border-blue-200 focus:bg-white focus:border-blue-500 rounded-xl', 'bg-white border-[1.5px] border-black/5 hover:border-black/10 focus:border-black/20 rounded-2xl shadow-sm')
    
    text = text.replace('bg-blue-600 hover:bg-blue-700 text-white', 'bg-black hover:bg-neutral-800 text-white shadow-sm shadow-black/10 border-2 border-black')
    text = text.replace('bg-blue-50 text-blue-600 hover:bg-blue-100', 'bg-neutral-100 hover:bg-neutral-200 text-black border border-black/5')
    text = text.replace('bg-app-surface hover:bg-app-surface-hover text-app-text rounded-xl font-bold border border-app-border', 'bg-neutral-50/80 hover:bg-neutral-100/80 text-black rounded-2xl font-bold border-[1.5px] border-black/5')

    # Tables / Visuals
    text = text.replace('bg-gray-50 text-gray-500', 'bg-neutral-50/90 text-gray-500 backdrop-blur-md')
    text = text.replace('divide-gray-100', 'divide-black/5')
    text = text.replace('border-gray-100', 'border-black/5')

    with open(filepath, 'w') as f:
        f.write(text)

print("Batch UI revamp applied to Fees and Tests")
