import sys

filepath = 'client/src/pages/TestDetails.tsx'

with open(filepath, 'r') as f:
    text = f.read()

text = text.replace('border border-app-border bg-white', 'border-[1.5px] border-black/5 bg-white')
text = text.replace('border border-app-border bg-slate-50', 'border-[1.5px] border-black/5 bg-neutral-50 hover:bg-neutral-100')
text = text.replace('bg-app-bg text-app-text rounded-xl font-bold border border-app-border', 'bg-neutral-50/80 hover:bg-neutral-100/80 text-black rounded-2xl font-bold border-[1.5px] border-black/5')

with open(filepath, 'w') as f:
    f.write(text)

print("TestDetails patched")
